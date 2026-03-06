import { log } from "./index";
import path from "path";
import fs from "fs";

let makeWASocketFn: any = null;
let useMultiFileAuthStateFn: any = null;
let makeCacheableSignalKeyStoreFn: any = null;
let DisconnectReasonObj: any = null;
let fetchLatestBaileysVersionFn: any = null;

async function loadBaileys() {
  if (makeWASocketFn) return;
  const mod = await import("@whiskeysockets/baileys");
  const m = mod as any;
  makeWASocketFn = m.makeWASocket || m.default;
  useMultiFileAuthStateFn = m.useMultiFileAuthState;
  makeCacheableSignalKeyStoreFn = m.makeCacheableSignalKeyStore;
  DisconnectReasonObj = m.DisconnectReason;
  fetchLatestBaileysVersionFn = m.fetchLatestBaileysVersion;
}

export type WhatsAppStatus =
  | "disconnected"
  | "connecting"
  | "waiting_for_pairing"
  | "connected"
  | "error";

interface WhatsAppState {
  status: WhatsAppStatus;
  phoneNumber: string | null;
  pairingCode: string | null;
  errorMessage: string | null;
  connectedAt: string | null;
  connectedName: string | null;
}

let socket: any = null;
let state: WhatsAppState = {
  status: "disconnected",
  phoneNumber: null,
  pairingCode: null,
  errorMessage: null,
  connectedAt: null,
  connectedName: null,
};

let messageHandler: ((from: string, message: string) => Promise<string>) | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let onSessionChanged: ((phone: string | null) => void) | null = null;

const AUTH_DIR = path.join(process.cwd(), "whatsapp_auth");

const noopFn = () => {};
const baileysLogger: any = {
  level: "silent",
  trace: noopFn,
  debug: noopFn,
  info: noopFn,
  warn: noopFn,
  error: noopFn,
  fatal: noopFn,
  child: () => baileysLogger,
};

export function getWhatsAppState() {
  return { ...state };
}

export function setMessageHandler(handler: (from: string, message: string) => Promise<string>) {
  messageHandler = handler;
}

export function setSessionChangeHandler(handler: (phone: string | null) => void) {
  onSessionChanged = handler;
}

function hasAuthFiles(): boolean {
  try {
    return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
  } catch {
    return false;
  }
}

function cleanupSocket() {
  if (socket) {
    try {
      socket.ev.removeAllListeners("connection.update");
      socket.ev.removeAllListeners("creds.update");
      socket.ev.removeAllListeners("messages.upsert");
    } catch (e) {}
    try { socket.end(undefined); } catch (e) {}
    socket = null;
  }
}

function cleanupAuth() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (e) {}
}

function resetState(errorMessage?: string) {
  state = {
    status: "disconnected",
    phoneNumber: null,
    pairingCode: null,
    errorMessage: errorMessage || null,
    connectedAt: null,
    connectedName: null,
  };
}

export async function connectWhatsApp(phoneNumber: string): Promise<{ pairingCode?: string; error?: string }> {
  await loadBaileys();

  if (state.status === "connected") {
    return { error: "WhatsApp is already connected. Disconnect first." };
  }

  if (state.status === "connecting" || state.status === "waiting_for_pairing") {
    return { error: "Connection is already in progress. Cancel first to retry." };
  }

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return { error: "Invalid phone number. Use international format (e.g., 212612345678 for Morocco, 12025551234 for US)." };
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  cleanupSocket();
  cleanupAuth();

  state = {
    status: "connecting",
    phoneNumber: cleanPhone,
    pairingCode: null,
    errorMessage: null,
    connectedAt: null,
    connectedName: null,
  };

  try {
    return await createSocketAndPair(cleanPhone, false);
  } catch (error: any) {
    state.status = "error";
    state.errorMessage = error.message;
    log(`WhatsApp connection error: ${error.message}`, "whatsapp");
    return { error: error.message };
  }
}

export async function autoReconnectWhatsApp(phoneNumber: string): Promise<void> {
  if (!hasAuthFiles()) {
    log("No saved WhatsApp session files found, skipping auto-reconnect", "whatsapp");
    return;
  }

  await loadBaileys();

  if (state.status === "connected") {
    return;
  }

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
  log(`Auto-reconnecting WhatsApp for phone ${cleanPhone}...`, "whatsapp");

  state = {
    status: "connecting",
    phoneNumber: cleanPhone,
    pairingCode: null,
    errorMessage: null,
    connectedAt: null,
    connectedName: null,
  };

  try {
    await createSocketAndPair(cleanPhone, true);
  } catch (error: any) {
    log(`WhatsApp auto-reconnect failed: ${error.message}`, "whatsapp");
    cleanupSocket();
    cleanupAuth();
    resetState();
    if (onSessionChanged) onSessionChanged(null);
  }
}

async function createSocketAndPair(cleanPhone: string, isReconnect: boolean): Promise<{ pairingCode?: string; error?: string }> {
  const { state: authState, saveCreds } = await useMultiFileAuthStateFn(AUTH_DIR);

  let version: [number, number, number] | undefined;
  try {
    const versionResult = await fetchLatestBaileysVersionFn();
    version = versionResult.version;
    log(`Using WhatsApp Web version: ${version}`, "whatsapp");
  } catch (e) {
    log("Could not fetch latest version, using default", "whatsapp");
  }

  let authKeys = authState.keys;
  if (makeCacheableSignalKeyStoreFn) {
    try {
      authKeys = makeCacheableSignalKeyStoreFn(authState.keys, baileysLogger);
    } catch (e) {
      log("Could not create cacheable key store, using default keys", "whatsapp");
    }
  }

  const socketConfig: any = {
    auth: {
      creds: authState.creds,
      keys: authKeys,
    },
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "22.04.4"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 250,
    markOnlineOnConnect: false,
  };

  if (version) {
    socketConfig.version = version;
  }

  socket = makeWASocketFn(socketConfig);

  socket.ev.on("creds.update", saveCreds);

  setupConnectionHandler(cleanPhone);
  setupMessageHandler();

  if (!authState.creds.registered && !isReconnect) {
    return await waitAndRequestPairing(cleanPhone);
  } else {
    log("WhatsApp reconnecting with saved credentials", "whatsapp");
    return {};
  }
}

async function waitAndRequestPairing(cleanPhone: string): Promise<{ pairingCode?: string; error?: string }> {
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (!socket) {
    return { error: "Connection was lost before pairing code could be generated. Please try again." };
  }
  if (state.status === "connected") {
    return {};
  }
  if (state.status === "disconnected") {
    return { error: state.errorMessage || "Connection failed. Please try again." };
  }

  try {
    const code = await socket.requestPairingCode(cleanPhone);
    if (code) {
      state.pairingCode = code;
      state.status = "waiting_for_pairing";
      log(`Pairing code generated: ${code} for phone ${cleanPhone}`, "whatsapp");
      return { pairingCode: code };
    }
    return { error: "Empty pairing code received. Please try again." };
  } catch (err: any) {
    log(`Pairing code error: ${err.message}`, "whatsapp");
    state.status = "error";
    state.errorMessage = `Failed to generate pairing code: ${err.message}`;
    return { error: state.errorMessage };
  }
}

function setupConnectionHandler(cleanPhone: string) {
  socket.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReasonObj?.loggedOut;

      log(`Connection closed. Code: ${statusCode}, Status: ${state.status}, LoggedOut: ${isLoggedOut}`, "whatsapp");

      if (isLoggedOut) {
        cleanupSocket();
        cleanupAuth();
        resetState("Logged out from WhatsApp. Please try again.");
        if (onSessionChanged) onSessionChanged(null);
        return;
      }

      if (state.status === "connected") {
        log("Disconnected unexpectedly, will reconnect in 5s...", "whatsapp");
        const savedPhone = state.phoneNumber || cleanPhone;
        state.status = "connecting";
        state.pairingCode = null;
        cleanupSocket();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(async () => {
          if (state.status === "connecting") {
            try {
              await loadBaileys();
              await createSocketAndPair(savedPhone, true);
            } catch (e: any) {
              log(`Reconnect failed: ${e.message}`, "whatsapp");
              resetState("Reconnection failed. Please try again.");
            }
          }
        }, 5000);
        return;
      }

      if (state.status === "waiting_for_pairing") {
        if (statusCode === 515) {
          log("Pairing successful! Reconnecting to complete handshake (code 515)...", "whatsapp");
          state.status = "connecting";
          state.pairingCode = null;
          cleanupSocket();
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(async () => {
            try {
              await loadBaileys();
              await createSocketAndPair(cleanPhone, true);
            } catch (e: any) {
              log(`Post-pairing reconnect failed: ${e.message}`, "whatsapp");
              resetState("Reconnection after pairing failed. Please try again.");
            }
          }, 2000);
        } else {
          log(`Connection closed during pairing (code: ${statusCode}), keeping state for retry`, "whatsapp");
        }
        return;
      }

      if (state.status !== "disconnected") {
        cleanupSocket();
        resetState(`Connection failed (code: ${statusCode || "unknown"}). Please try again.`);
      }
    }

    if (connection === "open") {
      const user = socket?.user;
      state = {
        status: "connected",
        phoneNumber: state.phoneNumber || cleanPhone,
        pairingCode: null,
        errorMessage: null,
        connectedAt: new Date().toISOString(),
        connectedName: user?.name || user?.id?.split(":")[0] || null,
      };
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      log(`WhatsApp connected as ${state.connectedName || "unknown"}`, "whatsapp");
      if (onSessionChanged) onSessionChanged(state.phoneNumber);
    }
  });
}

function setupMessageHandler() {
  socket.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text) continue;

      const from = msg.key.remoteJid;
      if (!from) continue;
      if (from.endsWith("@g.us")) continue;

      log(`WhatsApp message from ${from}: ${text.substring(0, 100)}`, "whatsapp");

      if (messageHandler) {
        try {
          const response = await messageHandler(from, text);
          if (response && socket) {
            let trimmedResponse = response;
            if (trimmedResponse.length > 4096) {
              trimmedResponse = trimmedResponse.substring(0, 4093) + "...";
            }
            await socket.sendMessage(from, { text: trimmedResponse });
            log(`WhatsApp response sent to ${from}`, "whatsapp");
          }
        } catch (error: any) {
          log(`WhatsApp message handler error: ${error.message}`, "whatsapp");
        }
      }
    }
  });
}

export async function disconnectWhatsApp(): Promise<void> {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (socket) {
    try {
      await socket.logout();
    } catch (e) {}
    cleanupSocket();
  }

  cleanupAuth();
  resetState();
  if (onSessionChanged) onSessionChanged(null);
  log("WhatsApp disconnected", "whatsapp");
}

export function isWhatsAppConnected(): boolean {
  return state.status === "connected";
}
