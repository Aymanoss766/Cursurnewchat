import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./index";
import { randomUUID } from "crypto";
import { isAuthenticated, isAdmin, createToken, createUserToken, ADMIN_PASSWORD, hashPassword, verifyPassword } from "./firebaseAuth";
import { generateVerificationCode, sendVerificationEmail } from "./email";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppState,
  setMessageHandler,
  setSessionChangeHandler,
  autoReconnectWhatsApp,
  isWhatsAppConnected,
} from "./whatsapp";

async function getAIResponse(userMessage: string, userId?: string | null): Promise<string> {
  const config = await storage.getBotConfig(userId);
  const apiKey = config.openRouterApiKey;
  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured");
  }

  const model = config.openRouterModel || "stepfun/step-3.5-flash:free";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    throw new Error("OpenRouter returned an empty or invalid response");
  }
  return data.choices[0].message.content;
}

async function sendFacebookMessage(senderId: string, messageText: string, pageAccessToken: string): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text: messageText },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Facebook API error: ${response.status} ${errorText}`);
  }
}

async function resolvePageToken(entryPageId: string): Promise<{ token: string; userId: string | null } | null> {
  const pageConfig = await storage.getPageByFacebookId(entryPageId);
  if (pageConfig) {
    return { token: pageConfig.accessToken, userId: pageConfig.userId };
  }

  const allPages = await storage.getAllPages();
  if (allPages.length === 1) {
    return { token: allPages[0].accessToken, userId: allPages[0].userId };
  }

  log(`No matching page token found for page ID ${entryPageId} among ${allPages.length} configured pages`, "webhook");
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Health check for Render
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Admin login
  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = createToken();
    res.json({ token, role: "admin", message: "Login successful" });
  });

  // User registration
  app.post("/api/register", async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await storage.getUserByEmail(email.toLowerCase().trim());
    if (existing && existing.emailVerified) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);

    if (existing && !existing.emailVerified) {
      // Re-send verification code for unverified account
    } else {
      await storage.createUser(email.toLowerCase().trim(), passwordHash, name?.trim() || "User");
    }

    const code = generateVerificationCode();
    await storage.createVerificationCode(email.toLowerCase().trim(), code);
    const result = await sendVerificationEmail(email.toLowerCase().trim(), code);

    if (!result.sent && !result.devCode) {
      return res.status(500).json({ message: "Failed to send verification email" });
    }

    res.json({
      message: result.sent ? "Verification code sent to your email" : "SMTP not configured - use the code below",
      requiresVerification: true,
      ...(result.devCode && { devCode: result.devCode }),
    });
  });

  // Verify email
  app.post("/api/verify-email", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: "Email and verification code are required" });
    }

    const valid = await storage.verifyCode(email.toLowerCase().trim(), code.trim());
    if (!valid) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }

    await storage.verifyUserEmail(email.toLowerCase().trim());
    const user = await storage.getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const token = createUserToken(user.id, user.email);
    res.json({ token, role: "user", userId: user.id, message: "Email verified successfully" });
  });

  // User login
  app.post("/api/user/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await storage.getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.emailVerified) {
      return res.status(401).json({ message: "Please verify your email first", requiresVerification: true });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createUserToken(user.id, user.email);
    res.json({ token, role: "user", userId: user.id, name: user.name, message: "Login successful" });
  });

  // Resend verification code
  app.post("/api/resend-code", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await storage.getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(400).json({ message: "No account found with this email" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const code = generateVerificationCode();
    await storage.createVerificationCode(email.toLowerCase().trim(), code);
    const result = await sendVerificationEmail(email.toLowerCase().trim(), code);
    res.json({
      message: result.sent ? "New verification code sent" : "SMTP not configured - use the code below",
      ...(result.devCode && { devCode: result.devCode }),
    });
  });

  // Webhook routes (public) - support both /webhook and /webhook/ (Facebook may use trailing slash)
  const webhookVerify = async (req: any, res: any) => {
    try {
      const config = await storage.getBotConfig(null);
      const verifyToken = config.verifyToken || process.env.VERIFY_TOKEN || "";
      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");

      log(`Webhook verify request: mode=${mode}, token=${token ? "***" + token.slice(-4) : "empty"}, challenge=${challenge ? "present" : "missing"}, storedToken=${verifyToken ? "***" + verifyToken.slice(-4) : "NOT SET"}`, "webhook");

      if (mode === "subscribe" && token === verifyToken) {
        log("Webhook verified successfully", "webhook");
        return res.status(200).type("text/plain").send(challenge);
      }

      log(`Webhook verification FAILED: mode=${mode}, tokenMatch=${token === verifyToken}`, "webhook");
      return res.status(403).type("text/plain").send("Forbidden");
    } catch (error: any) {
      log(`Webhook verification error: ${error.message}`, "webhook");
      return res.status(500).type("text/plain").send("Internal error");
    }
  };
  app.get(["/webhook", "/webhook/"], webhookVerify);

  app.post(["/webhook", "/webhook/"], (req, res) => {
    const body = req.body;

    log(`Webhook POST received: object=${body?.object}, entries=${body?.entry?.length || 0}`, "webhook");

    if (body.object !== "page") {
      return res.sendStatus(404);
    }

    res.status(200).send("EVENT_RECEIVED");

    if (body.entry) {
      for (const entry of body.entry) {
        const entryPageId = entry.id;
        const messagingEvents = entry.messaging;
        if (!messagingEvents) continue;

        for (const event of messagingEvents) {
          if (!event.message || !event.message.text) continue;

          const senderId = event.sender.id;
          const messageText = event.message.text;

          (async () => {
            try {
              log(`Received message from ${senderId} on page ${entryPageId}: ${messageText}`, "webhook");

              const pageInfo = await resolvePageToken(entryPageId);
              if (!pageInfo) {
                log(`No page token found for page ${entryPageId}`, "webhook");
                return;
              }

              let aiResponse = await getAIResponse(messageText, pageInfo.userId);
              log(`AI response for ${senderId}: ${aiResponse.substring(0, 100)}...`, "webhook");

              if (aiResponse.length > 2000) {
                aiResponse = aiResponse.substring(0, 1997) + "...";
              }

              await sendFacebookMessage(senderId, aiResponse, pageInfo.token);
              log(`Response sent to ${senderId} via page ${entryPageId}`, "webhook");
            } catch (error: any) {
              log(`Error processing message from ${senderId}: ${error.message}`, "webhook");
            }
          })();
        }
      }
    }
  });

  // Protected routes (admin + user)
  app.get("/api/status", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const config = await storage.getBotConfig(userId);
    const waState = getWhatsAppState();
    const status = {
      verifyToken: !!config.verifyToken,
      pageAccessToken: config.pages.length > 0,
      pagesCount: config.pages.length,
      openRouterApiKey: !!config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      imageConfigured: !!config.imageApiKey,
      whatsappConnected: waState.status === "connected",
      whatsappStatus: waState.status,
      role: (req as any).authRole,
      userName: (req as any).authEmail || "Admin",
    };
    res.json(status);
  });

  app.get("/api/config", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const config = await storage.getBotConfig(userId);
    res.json({
      openRouterApiKey: config.openRouterApiKey ? "••••" + config.openRouterApiKey.slice(-4) : null,
      openRouterModel: config.openRouterModel,
      imageApiKey: config.imageApiKey ? "••••" + config.imageApiKey.slice(-4) : null,
      imageApiUrl: config.imageApiUrl,
      imageModel: config.imageModel,
      verifyToken: config.verifyToken ? "••••" + config.verifyToken.slice(-4) : null,
      pagesCount: config.pages.length,
    });
  });

  app.get("/api/pages", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const pages = await storage.getPages(userId);
    const maskedPages = pages.map(p => ({
      id: p.id,
      name: p.name,
      facebookPageId: p.facebookPageId,
      accessToken: "••••" + p.accessToken.slice(-4),
      addedAt: p.addedAt,
    }));
    res.json(maskedPages);
  });

  app.post("/api/pages", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const { token, name } = req.body;
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ message: "A valid Page Access Token is required (minimum 10 characters)" });
    }

    const pages = await storage.getPages(userId);
    if (pages.length >= 15) {
      return res.status(400).json({ message: "Maximum of 15 pages reached. Remove a page before adding a new one." });
    }

    let pageName = name?.trim() || "";
    let facebookPageId = "";

    try {
      const fbResponse = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token.trim()}`
      );
      if (fbResponse.ok) {
        const fbData = await fbResponse.json();
        facebookPageId = fbData.id || "";
        if (!pageName) {
          pageName = fbData.name || "Facebook Page";
        }

        const existing = pages.find(p => p.facebookPageId === facebookPageId && facebookPageId);
        if (existing) {
          return res.status(400).json({
            message: `This page "${existing.name}" is already connected. Remove it first to re-add with a new token.`
          });
        }
      } else {
        log("Could not verify token with Facebook Graph API, adding anyway", "config");
        if (!pageName) pageName = "Facebook Page";
      }
    } catch (error: any) {
      log(`Facebook API verification error: ${error.message}`, "config");
      if (!pageName) pageName = "Facebook Page";
    }

    const pageConfig = {
      id: randomUUID(),
      name: pageName,
      facebookPageId,
      accessToken: token.trim(),
      addedAt: new Date().toISOString(),
    };

    await storage.addPage(pageConfig, userId);
    log(`Page added: ${pageName} (${facebookPageId || "unverified"})`, "config");

    res.json({
      message: `Page "${pageName}" added successfully`,
      page: {
        id: pageConfig.id,
        name: pageConfig.name,
        facebookPageId: pageConfig.facebookPageId,
        accessToken: "••••" + token.trim().slice(-4),
        addedAt: pageConfig.addedAt,
      },
    });
  });

  app.delete("/api/pages/:id", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const id = req.params.id as string;
    const pages = await storage.getPages(userId);
    const page = pages.find(p => p.id === id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    await storage.removePage(id, userId);
    log(`Page removed: ${page.name}`, "config");
    res.json({ message: `Page "${page.name}" removed successfully` });
  });

  app.post("/api/config/ai", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const { apiKey, model } = req.body;
    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ message: "API key is required" });
    }

    try {
      const testResponse = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (!testResponse.ok) {
        return res.status(400).json({ message: "Invalid API key - verification failed" });
      }
    } catch (error: any) {
      return res.status(400).json({ message: "Could not verify API key" });
    }

    const config = await storage.updateBotConfig({
      openRouterApiKey: apiKey,
      openRouterModel: model || "stepfun/step-3.5-flash:free",
    }, userId);

    log(`AI config updated: model=${config.openRouterModel}`, "config");
    res.json({
      message: "AI configuration updated successfully",
      openRouterModel: config.openRouterModel,
      openRouterApiKey: "••••" + apiKey.slice(-4),
    });
  });

  app.post("/api/config/image", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const { apiKey, apiUrl, model } = req.body;
    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ message: "API key is required" });
    }

    const config = await storage.updateBotConfig({
      imageApiKey: apiKey,
      imageApiUrl: apiUrl || null,
      imageModel: model || null,
    }, userId);

    log(`Image config updated: url=${config.imageApiUrl}, model=${config.imageModel}`, "config");
    res.json({
      message: "Image generation configuration updated successfully",
      imageApiUrl: config.imageApiUrl,
      imageModel: config.imageModel,
      imageApiKey: "••••" + apiKey.slice(-4),
    });
  });

  app.post("/api/config/verify-token", isAuthenticated, async (req, res) => {
    const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
    const { token } = req.body;
    if (!token || typeof token !== "string" || token.trim().length < 4) {
      return res.status(400).json({ message: "A valid Verify Token is required (minimum 4 characters)" });
    }

    await storage.updateBotConfig({
      verifyToken: token.trim(),
    }, userId);

    log(`Verify Token updated`, "config");
    res.json({
      message: "Verify Token updated successfully",
      verifyToken: "••••" + token.trim().slice(-4),
    });
  });

  app.post("/api/models", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).authRole === "user" ? (req as any).authUserId : null;
      let apiKey = req.body.apiKey as string | undefined;
      if (!apiKey) {
        const config = await storage.getBotConfig(userId);
        apiKey = config.openRouterApiKey || undefined;
      }
      if (!apiKey) {
        return res.status(400).json({ message: "No API key provided or stored" });
      }

      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        return res.status(response.status).json({ message: "Failed to fetch models from OpenRouter" });
      }

      const data = await response.json();
      const models: { id: string; name: string }[] = (data.data || [])
        .map((m: any) => ({ id: m.id, name: m.name || m.id }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

      res.json(models);
    } catch (error: any) {
      log(`Error fetching models: ${error.message}`, "config");
      res.status(500).json({ message: "Failed to fetch models" });
    }
  });

  // WhatsApp routes (admin only for now)
  setMessageHandler(async (_from: string, message: string) => {
    return await getAIResponse(message, null);
  });

  setSessionChangeHandler(async (phone: string | null) => {
    try {
      await storage.updateBotConfig({ whatsappPhone: phone }, null);
      log(`WhatsApp session ${phone ? "saved" : "cleared"} in database`, "whatsapp");
    } catch (e: any) {
      log(`Failed to update WhatsApp session in database: ${e.message}`, "whatsapp");
    }
  });

  (async () => {
    try {
      const config = await storage.getBotConfig(null);
      if (config.whatsappPhone) {
        log(`Found saved WhatsApp session for ${config.whatsappPhone}, auto-reconnecting...`, "whatsapp");
        await autoReconnectWhatsApp(config.whatsappPhone);
      }
    } catch (e: any) {
      log(`WhatsApp auto-reconnect error: ${e.message}`, "whatsapp");
    }
  })();

  app.post("/api/whatsapp/connect", isAuthenticated, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const result = await connectWhatsApp(phoneNumber);
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: result.pairingCode
        ? "Pairing code generated. Enter it in WhatsApp > Linked Devices > Link a Device."
        : "Reconnecting with saved session...",
      pairingCode: result.pairingCode || null,
    });
  });

  app.post("/api/whatsapp/disconnect", isAuthenticated, async (_req, res) => {
    await disconnectWhatsApp();
    res.json({ message: "WhatsApp disconnected successfully" });
  });

  app.get("/api/whatsapp/status", isAuthenticated, async (_req, res) => {
    const waState = getWhatsAppState();
    res.json({
      status: waState.status,
      phoneNumber: waState.phoneNumber,
      pairingCode: waState.pairingCode,
      errorMessage: waState.errorMessage,
      connectedAt: waState.connectedAt,
      connectedName: waState.connectedName,
    });
  });

  app.post("/api/whatsapp/verify", isAuthenticated, async (_req, res) => {
    const waState = getWhatsAppState();
    if (waState.status === "connected") {
      res.json({
        verified: true,
        message: "Connection successful! WhatsApp is active.",
        connectedName: waState.connectedName,
        connectedAt: waState.connectedAt,
      });
    } else {
      res.json({
        verified: false,
        message: waState.status === "waiting_for_pairing" || (waState.status as string) === "waiting_for_qr"
          ? "Still waiting for pairing. Please complete the linking process on your phone."
          : waState.status === "connecting"
            ? "Connection in progress. Please wait..."
            : waState.errorMessage || "WhatsApp is not connected.",
        status: waState.status,
      });
    }
  });

  // Keep-alive self-ping for Render free tier
  if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
    const PING_INTERVAL = 14 * 60 * 1000;
    setInterval(async () => {
      try {
        await fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`);
        log("Keep-alive ping sent", "system");
      } catch {}
    }, PING_INTERVAL);
  }

  return httpServer;
}
