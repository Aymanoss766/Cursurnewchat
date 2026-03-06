import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./index";
import { randomUUID } from "crypto";
import { isAuthenticated, createToken, ADMIN_PASSWORD } from "./firebaseAuth";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppState,
  setMessageHandler,
  setSessionChangeHandler,
  autoReconnectWhatsApp,
  isWhatsAppConnected,
} from "./whatsapp";

async function getAIResponse(userMessage: string): Promise<string> {
  const config = await storage.getBotConfig();
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

async function resolvePageToken(entryPageId: string): Promise<string | null> {
  const pageConfig = await storage.getPageByFacebookId(entryPageId);
  if (pageConfig) {
    return pageConfig.accessToken;
  }

  const pages = await storage.getPages();
  if (pages.length === 1) {
    return pages[0].accessToken;
  }

  log(`No matching page token found for page ID ${entryPageId} among ${pages.length} configured pages`, "webhook");
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = createToken();
    res.json({ token, message: "Login successful" });
  });

  app.get("/webhook", async (req, res) => {
    const config = await storage.getBotConfig();
    const verifyToken = config.verifyToken;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      log("Webhook verified", "webhook");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", (req, res) => {
    const body = req.body;

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

              const pageToken = await resolvePageToken(entryPageId);
              if (!pageToken) {
                log(`No page token found for page ${entryPageId}`, "webhook");
                return;
              }

              let aiResponse = await getAIResponse(messageText);
              log(`AI response for ${senderId}: ${aiResponse.substring(0, 100)}...`, "webhook");

              if (aiResponse.length > 2000) {
                aiResponse = aiResponse.substring(0, 1997) + "...";
              }

              await sendFacebookMessage(senderId, aiResponse, pageToken);
              log(`Response sent to ${senderId} via page ${entryPageId}`, "webhook");
            } catch (error: any) {
              log(`Error processing message from ${senderId}: ${error.message}`, "webhook");
            }
          })();
        }
      }
    }
  });

  app.get("/api/status", isAuthenticated, async (_req, res) => {
    const config = await storage.getBotConfig();
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
    };
    res.json(status);
  });

  app.get("/api/config", isAuthenticated, async (_req, res) => {
    const config = await storage.getBotConfig();
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

  app.get("/api/pages", isAuthenticated, async (_req, res) => {
    const pages = await storage.getPages();
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
    const { token, name } = req.body;
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ message: "A valid Page Access Token is required (minimum 10 characters)" });
    }

    const pages = await storage.getPages();
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

    await storage.addPage(pageConfig);
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
    const { id } = req.params;
    const pages = await storage.getPages();
    const page = pages.find(p => p.id === id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    await storage.removePage(id);
    log(`Page removed: ${page.name}`, "config");
    res.json({ message: `Page "${page.name}" removed successfully` });
  });

  app.post("/api/config/ai", isAuthenticated, async (req, res) => {
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
    });

    log(`AI config updated: model=${config.openRouterModel}`, "config");
    res.json({
      message: "AI configuration updated successfully",
      openRouterModel: config.openRouterModel,
      openRouterApiKey: "••••" + apiKey.slice(-4),
    });
  });

  app.post("/api/config/image", isAuthenticated, async (req, res) => {
    const { apiKey, apiUrl, model } = req.body;
    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ message: "API key is required" });
    }

    const config = await storage.updateBotConfig({
      imageApiKey: apiKey,
      imageApiUrl: apiUrl || null,
      imageModel: model || null,
    });

    log(`Image config updated: url=${config.imageApiUrl}, model=${config.imageModel}`, "config");
    res.json({
      message: "Image generation configuration updated successfully",
      imageApiUrl: config.imageApiUrl,
      imageModel: config.imageModel,
      imageApiKey: "••••" + apiKey.slice(-4),
    });
  });

  app.post("/api/config/verify-token", isAuthenticated, async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string" || token.trim().length < 4) {
      return res.status(400).json({ message: "A valid Verify Token is required (minimum 4 characters)" });
    }

    await storage.updateBotConfig({
      verifyToken: token.trim(),
    });

    log(`Verify Token updated`, "config");
    res.json({
      message: "Verify Token updated successfully",
      verifyToken: "••••" + token.trim().slice(-4),
    });
  });

  app.post("/api/models", isAuthenticated, async (req, res) => {
    try {
      let apiKey = req.body.apiKey as string | undefined;
      if (!apiKey) {
        const config = await storage.getBotConfig();
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

  setMessageHandler(async (_from: string, message: string) => {
    return await getAIResponse(message);
  });

  setSessionChangeHandler(async (phone: string | null) => {
    try {
      await storage.updateBotConfig({ whatsappPhone: phone });
      log(`WhatsApp session ${phone ? "saved" : "cleared"} in database`, "whatsapp");
    } catch (e: any) {
      log(`Failed to update WhatsApp session in database: ${e.message}`, "whatsapp");
    }
  });

  (async () => {
    try {
      const config = await storage.getBotConfig();
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
        message: waState.status === "waiting_for_pairing" || waState.status === "waiting_for_qr"
          ? "Still waiting for pairing. Please complete the linking process on your phone."
          : waState.status === "connecting"
            ? "Connection in progress. Please wait..."
            : waState.errorMessage || "WhatsApp is not connected.",
        status: waState.status,
      });
    }
  });

  return httpServer;
}
