import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import type { Server } from "socket.io";
import { db, supabase } from "../lib/supabase";
import { ai } from "../lib/ai";

export type WaStatus =
  | "idle"
  | "initializing"
  | "waiting_qr"
  | "ready"
  | "error"
  | "disconnected";

export type WaState = {
  status: WaStatus;
  qrDataUrl?: string;
  lastError?: string;
  updatedAt: string;
  attemptCount: number;
};

export type BotConfig = {
  systemPrompt: string;
  apiKey: string;
  enabled: boolean;
  botMode: "ai" | "local" | "hybrid";
  organizationId?: string;
};

type ResetOptions = {
  preserveAttempts?: boolean;
  silent?: boolean;
};

type WebhookPayload = {
  event: string;
  clientId: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  messageId: string;
  raw?: any;
};

export default class WhatsAppManager {
  private clients = new Map<string, Client>();
  private states = new Map<string, WaState>();
  private locks = new Map<string, boolean>();
  private qrTimeouts = new Map<string, NodeJS.Timeout>();
  private connectInFlight = new Map<string, Promise<WaState>>();
  private botConfigs = new Map<string, BotConfig>();
  private readonly io: Server;
  private readonly qrTimeoutMs = 60_000;
  private isShuttingDown = false;

  constructor(io: Server) {
    this.io = io;
    this.setupGracefulShutdown();
    this.loadConfigs();
  }

  private async loadConfigs(organizationId?: string) {
    if (!organizationId) return;
    try {
      const config = await db.getBotConfig(organizationId);
      if (config) {
        this.botConfigs.set(organizationId, {
          systemPrompt: config.system_prompt || "",
          apiKey: config.api_key || "",
          enabled: config.enabled || false,
          botMode: (config.bot_mode as any) || "ai",
          organizationId
        });
        console.log(`[WhatsAppManager] Loaded bot config for Org ${organizationId}`);
      }
    } catch (err) {
      console.error(`[WhatsAppManager] Failed to load bot config for ${organizationId}:`, err);
    }
  }

  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.log(`\n[WhatsAppManager] Received ${signal}, shutting down gracefully...`);

      // Clear all timers
      for (const [clientId, timer] of this.qrTimeouts) {
        clearTimeout(timer);
        console.log(`[${clientId}] Cleared QR timeout`);
      }
      this.qrTimeouts.clear();

      // Destroy all clients
      const destroyPromises: Promise<void>[] = [];
      for (const [clientId, client] of this.clients) {
        console.log(`[${clientId}] Destroying client...`);
        destroyPromises.push(
          client.destroy().catch((err) => {
            console.error(`[${clientId}] Error destroying client:`, err);
          })
        );
      }

      await Promise.allSettled(destroyPromises);
      console.log("[WhatsAppManager] All clients destroyed, exiting...");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  getState(clientId: string): WaState {
    const existing = this.states.get(clientId);
    if (existing) return existing;
    const initial: WaState = {
      status: "idle",
      updatedAt: new Date().toISOString(),
      attemptCount: 0,
    };
    this.states.set(clientId, initial);
    return initial;
  }

  private releaseLock(clientId: string) {
    this.locks.set(clientId, false);
    this.connectInFlight.delete(clientId);
  }

  private startQrTimeout(clientId: string) {
    this.clearQrTimeout(clientId);
    const timer = setTimeout(() => this.handleQrTimeout(clientId), this.qrTimeoutMs);
    this.qrTimeouts.set(clientId, timer);
    console.log(`[${clientId}] QR timeout started (${this.qrTimeoutMs}ms)`);
  }

  private clearQrTimeout(clientId: string) {
    const timer = this.qrTimeouts.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.qrTimeouts.delete(clientId);
      console.log(`[${clientId}] QR timeout cleared`);
    }
  }

  private emitQr(clientId: string, qrDataUrl: string) {
    this.io.to(clientId).emit("wa:qr", { clientId, qrDataUrl });
  }

  private emitState(clientId: string, state: WaState) {
    this.io.to(clientId).emit("wa:state", {
      clientId,
      status: state.status,
      updatedAt: state.updatedAt,
      lastError: state.lastError,
    });
  }

  private setState(clientId: string, partial: Partial<WaState>): WaState {
    const prev = this.getState(clientId);
    const next: WaState = {
      ...prev,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(clientId, next);

    if ((next.status === "initializing" || next.status === "waiting_qr") && prev.status !== "waiting_qr") {
      this.startQrTimeout(clientId);
    } else if (!["initializing", "waiting_qr"].includes(next.status)) {
      this.clearQrTimeout(clientId);
    }

    if (["ready", "error", "disconnected", "idle"].includes(next.status)) {
      this.releaseLock(clientId);
    }

    this.emitState(clientId, next);
    return next;
  }

  private async sendWebhook(payload: WebhookPayload) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    const delays = [1000, 3000, 7000]; // Retry delays: 1s, 3s, 7s
    const payloadStr = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add HMAC signature if secret is configured
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payloadStr)
        .digest("hex");
      headers["X-Signature"] = signature;
    }

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: payloadStr,
        });

        if (response.ok) {
          console.log(`[Webhook] Successfully sent to ${webhookUrl}`);
          return;
        }

        console.warn(`[Webhook] Attempt ${attempt + 1} failed: ${response.status}`);
      } catch (err) {
        console.warn(`[Webhook] Attempt ${attempt + 1} error:`, err);
      }

      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }

    console.error(`[Webhook] All attempts failed for ${webhookUrl}`);
  }

  private attachClientEvents(clientId: string, client: Client) {
    client.on("qr", async (qr: string) => {
      console.log(`[${clientId}] QR received (length: ${qr.length})`);
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        this.setState(clientId, { status: "waiting_qr", qrDataUrl, lastError: undefined });
        // Emit again explicitly to ensure delivery
        this.emitQr(clientId, qrDataUrl);
      } catch (err) {
        console.error(`[${clientId}] Error generating QR DataURL`, err);
      }
    });

    client.on("authenticated", () => {
      console.log(`[${clientId}] Authenticated`);
    });

    client.on("ready", async () => {
      console.log(`[${clientId}] Client ready`);
      this.setState(clientId, { status: "ready", qrDataUrl: undefined, lastError: undefined, attemptCount: 0 });

      // Auto-sync connected phone number to Organization Admin profile
      try {
        const info = client.info;
        if (info && info.wid && info.wid.user) {
          const myJid = info.wid._serialized;
          const { realPhone } = await this.getOrCreateAndSyncCustomer(clientId, myJid);
          let myNumber = realPhone;

          console.log(`[${clientId}] Connected with true number: ${myNumber}`);

          // Update Admin profile for this Org
          const { data: users } = await supabase
            .from('users')
            .select('id, phone')
            .eq('organization_id', clientId)
            .eq('role', 'admin');

          if (users && users.length > 0) {
            for (const user of users) {
              // Force update if empty or looks like an ID or different from what we just found
              if (!user.phone || user.phone.length > 15 || user.phone !== myNumber) {
                await db.updateUserInfo(user.id, { phone: myNumber });
                console.log(`[${clientId}] Auto-synced true admin phone: ${myNumber}`);
              }
            }
          }
        }
      } catch (e) {
        console.error(`[${clientId}] Failed to auto-sync connect number:`, e);
      }
    });

    client.on("auth_failure", (msg: string) => {
      console.error(`[${clientId}] Auth failure: ${msg}`);
      this.setState(clientId, { status: "error", lastError: msg || "خطأ في المصادقة", qrDataUrl: undefined });
      void this.resetSession(clientId, { preserveAttempts: false });
    });

    client.on("disconnected", (reason: string) => {
      console.warn(`[${clientId}] Disconnected: ${reason}`);
      this.setState(clientId, {
        status: "disconnected",
        lastError: reason || "تم فصل الاتصال",
        qrDataUrl: undefined,
      });
    });

    // Handle incoming messages for webhook and real-time
    client.on("message", async (message: Message) => {
      let senderName = null;
      // Resolve true phone and Sync Customer
      // Trick: Check if message.author exists and is different from message.from (sometimes author contains the real JID)
      let waChatIdToSync = message.from;
      if (message.author && message.author !== message.from && !message.from.includes("@g.us")) {
        // If from is 1-on-1 LID and author is JID, prioritize author for syncing
        waChatIdToSync = message.author;
      }

      const { realPhone } = await this.getOrCreateAndSyncCustomer(clientId, waChatIdToSync);

      try {
        const contact = await message.getContact();
        senderName = contact.name || contact.pushname || contact.number;
      } catch (e) { }

      const messageData = {
        id: message.id._serialized,
        from: message.from,
        phone: realPhone, // Added resolved phone
        to: message.to,
        body: message.body || (message as any).caption || "",
        timestamp: message.timestamp,
        fromMe: message.fromMe,
        type: message.type,
        author: message.author,
        senderName,
        ack: message.ack,
        hasMedia: message.hasMedia,
      };

      // Emit to socket for real-time updates
      this.io.to(clientId).emit("wa:message", {
        clientId,
        message: messageData,
      });

      // Send webhook
      const payload: WebhookPayload = {
        event: "message",
        clientId,
        from: message.from,
        to: message.to,
        body: message.body,
        timestamp: message.timestamp,
        messageId: message.id._serialized,
      };

      await this.sendWebhook(payload);

      // Increment stats
      void db.incrementDailyStat("messages_received", 1, clientId);

      // Add delay to prevent immediate reply overlap
      setTimeout(() => {
        void this.handleBotReply(clientId, message);
        void this.handleAutoAssign(clientId, message);
      }, 1000);
    });

    // Handle message_create for sent messages (real-time)
    client.on("message_create", async (message: Message) => {
      if (message.fromMe) {
        console.log(`[${clientId}] Message sent to ${message.to}`);

        // Sync Customer for sent message
        const { realPhone } = await this.getOrCreateAndSyncCustomer(clientId, message.to);

        const messageData = {
          id: message.id._serialized,
          from: message.from,
          to: message.to,
          phone: realPhone,
          body: message.body,
          timestamp: message.timestamp,
          fromMe: message.fromMe,
          type: message.type,
          author: message.author,
          ack: message.ack,
          hasMedia: message.hasMedia,
        };

        // Emit to socket for real-time updates
        this.io.to(clientId).emit("wa:message", {
          clientId,
          message: messageData,
        });

        // Increment stats
        void db.incrementDailyStat("messages_sent", 1, clientId);
      }
    });
  }

  private async handleQrTimeout(clientId: string) {
    const currentState = this.getState(clientId);
    if (!["initializing", "waiting_qr"].includes(currentState.status)) return;

    console.warn(`[${clientId}] QR timeout reached, resetting session`);
    const attemptCount = currentState.attemptCount;
    await this.resetSession(clientId, { preserveAttempts: true, silent: true });
    this.setState(clientId, {
      status: "idle",
      qrDataUrl: undefined,
      lastError: undefined,
      attemptCount,
    });

    if (attemptCount < 1) {
      console.log(`[${clientId}] Auto-retry (attempt ${attemptCount + 1})`);
      this.setState(clientId, { attemptCount: attemptCount + 1 });
      void this.connect(clientId);
    } else {
      console.error(`[${clientId}] Max retry attempts reached`);
      this.setState(clientId, {
        status: "error",
        lastError: "لم يتم توليد QR، اضغط Reset ثم حاول مرة أخرى",
        qrDataUrl: undefined,
      });
    }
  }

  private getSessionFolder(clientId: string) {
    return path.join(process.cwd(), ".wwebjs_auth", `session-${clientId}`);
  }

  async resetSession(clientId: string, options?: ResetOptions): Promise<WaState> {
    console.log(`[${clientId}] Resetting session...`);

    const existingClient = this.clients.get(clientId);
    if (existingClient) {
      try {
        await existingClient.destroy();
        console.log(`[${clientId}] Client destroyed`);
      } catch (err) {
        console.error(`[${clientId}] Error destroying client`, err);
      }
    }

    this.clients.delete(clientId);
    this.clearQrTimeout(clientId);
    this.locks.delete(clientId);
    this.connectInFlight.delete(clientId);

    const sessionPath = this.getSessionFolder(clientId);
    try {
      await fs.remove(sessionPath);
      console.log(`[${clientId}] Session folder removed at ${sessionPath}`);
    } catch (err) {
      console.warn(`[${clientId}] Failed to remove session folder`, err);
    }

    const prevAttempts = this.getState(clientId).attemptCount;
    const attemptCount = options?.preserveAttempts ? prevAttempts : 0;

    const nextState = this.setState(clientId, {
      status: "idle",
      qrDataUrl: undefined,
      lastError: undefined,
      attemptCount,
    });

    console.log(`[${clientId}] Reset done`);
    return nextState;
  }

  async disconnect(clientId: string): Promise<WaState> {
    console.log(`[${clientId}] Disconnecting client...`);
    const client = this.clients.get(clientId);
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.error(`[${clientId}] Error disconnecting client`, err);
      }
    }
    this.clients.delete(clientId);
    this.clearQrTimeout(clientId);
    this.locks.delete(clientId);
    this.connectInFlight.delete(clientId);

    return this.setState(clientId, { status: "disconnected", qrDataUrl: undefined });
  }

  async connect(clientId: string): Promise<WaState> {
    // Single-flight: If connection is already in progress, return existing promise
    const existingInFlight = this.connectInFlight.get(clientId);
    if (existingInFlight) {
      console.log(`[${clientId}] Connect already in progress, returning existing promise`);
      return existingInFlight;
    }

    // Check lock
    if (this.locks.get(clientId)) {
      console.log(`[${clientId}] Connect blocked by lock`);
      return this.getState(clientId);
    }

    // Create new connection promise
    const connectPromise = this.doConnect(clientId);
    this.connectInFlight.set(clientId, connectPromise);

    try {
      return await connectPromise;
    } finally {
      // Clean up in-flight promise on completion (success or error)
      // Note: releaseLock in setState will also delete this
    }
  }

  private async doConnect(clientId: string): Promise<WaState> {
    this.locks.set(clientId, true);
    console.log(`[${clientId}] Connecting...`);

    const existingState = this.getState(clientId);
    if (existingState.status === "ready") {
      this.releaseLock(clientId);
      return existingState;
    }

    let client = this.clients.get(clientId);

    if (!client) {
      console.log(`[${clientId}] Creating new WhatsApp client...`);

      client = new Client({
        authStrategy: new LocalAuth({ clientId }),
        webVersion: '2.3000.1018903273', // Forced stable version to fix RegistrationUtils error
        webVersionCache: {
          type: 'none', // Critical: do not use cached broken versions
        },
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--no-zygote",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-client-side-phishing-detection",
            "--disable-setuid-sandbox",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-single-process", // Railway works better without single-process sometimes
          ],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
      });

      this.attachClientEvents(clientId, client);
      this.clients.set(clientId, client);
    }

    this.setState(clientId, {
      status: "initializing",
      lastError: undefined,
      qrDataUrl: undefined,
    });

    try {
      await client.initialize();
    } catch (err) {
      console.error(`[${clientId}] Failed to initialize`, err);
      this.setState(clientId, {
        status: "error",
        lastError: "فشل تهيئة العميل، حاول مجددًا",
        qrDataUrl: undefined,
      });
      await this.resetSession(clientId, { preserveAttempts: false });
    }

    this.releaseLock(clientId);
    return this.getState(clientId);
  }

  getClient(clientId: string): Client | undefined {
    return this.clients.get(clientId);
  }


  private botActivities: Array<{
    id: string;
    timestamp: Date;
    customerPhone: string;
    customerMessage: string;
    sentiment: string;
    intent: string;
    botReply: string;
    responseTimeMs: number;
  }> = [];

  setBotConfig(clientId: string, config: BotConfig) {
    this.botConfigs.set(clientId, config);
    console.log(`[${clientId}] Bot config updated: ${config.enabled ? "Enabled" : "Disabled"} (Mode: ${config.botMode})`);
  }

  getBotConfig(clientId: string): BotConfig {
    return this.botConfigs.get(clientId) || { systemPrompt: "", apiKey: "", enabled: false, botMode: "ai" };
  }

  getBotActivities(limit = 20) {
    return this.botActivities.slice(-limit).reverse();
  }

  // API Key ONLY from environment variable - never from database
  private readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

  // Analyze message sentiment and intent
  private async analyzeMessage(_apiKey: string, message: string): Promise<{ sentiment: string; intent: string }> {
    // Always use environment variable
    const keyToUse = this.GEMINI_API_KEY;
    console.log(`[AI] Analyzing message. Using key starting with: ${keyToUse ? keyToUse.substring(0, 8) + "..." : "EMPTY"}`);

    if (!keyToUse) {
      console.error("[AI] No GEMINI_API_KEY configured in environment!");
      return { sentiment: "neutral", intent: "other" };
    }

    try {
      // Use v1beta API with gemini-pro
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyToUse}`;
      const prompt = `
      Analyze this message and return pure JSON only (no markdown, no extra text).
      Message: "${message}"

      Output format:
      {"sentiment": "positive" | "negative" | "neutral", "intent": "question" | "complaint" | "order" | "greeting" | "feedback" | "support" | "other"}
      `;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) return { sentiment: "neutral", intent: "other" };

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: parsed.sentiment || "neutral",
          intent: parsed.intent || "other"
        };
      }
    } catch (err) {
      console.error("Analysis error:", err);
    }
    return { sentiment: "neutral", intent: "other" };
  }

  private async generateAIReply(_apiKey: string, systemPrompt: string, userMessage: string): Promise<string> {
    // Always use environment variable
    const keyToUse = this.GEMINI_API_KEY;

    if (!keyToUse) {
      return "خطأ: لم يتم تكوين مفتاح API. يرجى إضافة GEMINI_API_KEY في إعدادات الخادم.";
    }

    try {
      // Use v1beta API with gemini-pro
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyToUse}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt || "أنت مساعد ذكي ومفيد." }] },
            { role: "model", parts: [{ text: "مفهوم. أنا جاهز للمساعدة." }] },
            { role: "user", parts: [{ text: userMessage }] }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "لم يتم توليد رد.";
    } catch (err: any) {
      console.error("AI generation error:", err);
      return `خطأ في توليد الرد: ${err.message || "Unknown Error"}`;
    }
  }

  // Generate AI reply with conversation context
  private async generateAIReplyWithContext(
    systemPrompt: string,
    conversationHistory: { role: string; text: string }[],
    currentMessage: string
  ): Promise<string> {
    const keyToUse = this.GEMINI_API_KEY;

    if (!keyToUse) {
      return "خطأ: لم يتم تكوين مفتاح API. يرجى إضافة GEMINI_API_KEY في إعدادات الخادم.";
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyToUse}`;

      // Build conversation contents for Gemini
      const contents: { role: string; parts: { text: string }[] }[] = [];

      // Add system prompt as first user message
      contents.push({ role: "user", parts: [{ text: `تعليمات النظام: ${systemPrompt || "أنت مساعد ذكي ومفيد. رد بشكل طبيعي كأنك إنسان."}` }] });
      contents.push({ role: "model", parts: [{ text: "مفهوم، سأتبع هذه التعليمات في ردودي." }] });

      // Add conversation history (last 10 messages)
      for (const msg of conversationHistory.slice(-8)) {
        contents.push({
          role: msg.role === "model" ? "model" : "user",
          parts: [{ text: msg.text }]
        });
      }

      // Add current message if not already in history
      const lastMsg = conversationHistory[conversationHistory.length - 1];
      if (!lastMsg || lastMsg.text !== currentMessage) {
        contents.push({ role: "user", parts: [{ text: currentMessage }] });
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "لم يتم توليد رد.";
    } catch (err: any) {
      console.error("AI generation error:", err);
      return `خطأ في توليد الرد: ${err.message || "Unknown Error"}`;
    }
  }

  // Test bot response without sending to WhatsApp
  async testBotResponse(clientId: string, testMessage: string): Promise<{
    analysis: { sentiment: string; intent: string };
    response: string;
    responseTimeMs: number;
  }> {
    const config = this.botConfigs.get(clientId);
    // Allow if config exists; if apiKey is missing, we use DEFAULT_API_KEY inside the methods
    if (!config) {
      return {
        analysis: { sentiment: "unknown", intent: "unknown" },
        response: "البوت غير مفعل أو لا يوجد إعدادات محفوظة لهذا العميل. يرجى حفظ الإعدادات أولاً.",
        responseTimeMs: 0
      };
    }

    const startTime = Date.now();

    let response = "";

    // Check Local Rules first if applicable
    if (config.botMode === "local" || config.botMode === "hybrid") {
      const localMatch = await this.handleLocalBotReply(clientId, testMessage);
      if (localMatch) {
        response = localMatch;
      }
    }

    // Fallback to AI if needed
    if (!response && (config.botMode === "ai" || config.botMode === "hybrid")) {
      response = await this.generateAIReply(config.apiKey, config.systemPrompt, testMessage);
    }

    const analysis = await this.analyzeMessage(config.apiKey, testMessage);
    const responseTimeMs = Date.now() - startTime;

    return { analysis, response: response || "لم يتم العثور على رد مناسب.", responseTimeMs };
  }

  private async handleBotReply(clientId: string, message: Message) {
    // Refresh config from DB to ensure we have latest orgId and settings
    // This is safer than relying on in-memory config which might lack orgId
    let config: BotConfig | null = null;
    let orgId: string | undefined;

    try {
      console.log(`[${clientId}] [Bot] Checking config for ${message.from}`);
      const dbConfig = await db.getBotConfig(clientId);
      if (dbConfig) {
        config = {
          apiKey: dbConfig.api_key || "",
          systemPrompt: dbConfig.system_prompt || "",
          enabled: dbConfig.enabled || false,
          botMode: (dbConfig.bot_mode as any) || "ai",
          organizationId: dbConfig.organization_id
        };
        orgId = dbConfig.organization_id;
      }
    } catch (e: any) {
      console.warn(`[${clientId}] [Bot] Failed to fetch config from DB, falling back to memory:`, e.message);
      config = this.botConfigs.get(clientId) || null;
      orgId = config?.organizationId;
    }

    if (!config || !config.enabled) {
      console.log(`[${clientId}] [Bot] Bot is disabled for this client.`);
      return;
    }

    // Ignore non-text messages
    if (message.type !== "chat") {
      console.log(`[${clientId}] [Bot] Ignoring non-text message type: ${message.type}`);
      return;
    }

    console.log(`[${clientId}] [Bot] Handling message: "${message.body.substring(0, 50)}..."`);
    const startTime = Date.now();

    // Simulate typing
    const client = this.clients.get(clientId);
    const chat = await message.getChat();
    await chat.sendStateTyping();

    try {
      // Step 2: Fetch conversation history for context
      const messages = await chat.fetchMessages({ limit: 10 });
      const conversationHistory = messages
        .filter(m => m.type === "chat")
        .map(m => ({
          role: m.fromMe ? "model" : "user",
          parts: [{ text: m.body }], // Use correct structure for lib/ai
          content: m.body
        }));

      // Step 3: Generate response
      let replyText = "";
      // Diagnostic: Check if API key exists (only if mode needs AI)
      if (config.botMode === "ai" || config.botMode === "hybrid") {
        const effectiveKey = config.apiKey || process.env.GEMINI_API_KEY;
        if (!effectiveKey) {
          console.error(`[${clientId}] [Bot] CRITICAL: No Gemini API Key found! Check .env or Bot settings.`);
          this.io.to(clientId).emit("bot:error", { message: "No API Key found" });
          // If purely AI, we must abort. If hybrid, we can still try local below
          if (config.botMode === "ai") return;
        }
      }

      // --- [LOCAL BOT LAYER] ---
      if (orgId && (config.botMode === "local" || config.botMode === "hybrid")) {
        console.log(`[${clientId}] [Bot] Checking local rules...`);
        const localReply = await this.handleLocalBotReply(orgId, message.body);
        if (localReply) {
          console.log(`[${clientId}] [Bot] Local match found!`);
          replyText = localReply;
        }
      }

      // --- [AI BOT LAYER] (Fallback or Primary) ---
      if (!replyText && (config.botMode === "ai" || config.botMode === "hybrid")) {
        if (orgId) {
          console.log(`[${clientId}] [Bot] Using RAG for Org ${orgId}`);
          replyText = await ai.generateRAGReply(message.body, conversationHistory, orgId, config.systemPrompt);
        } else {
          console.log(`[${clientId}] [Bot] Fallback to direct AI (No Org ID)`);
          replyText = await ai.generateReply(config.systemPrompt + "\n\nUser: " + message.body, conversationHistory);
        }
      }

      const responseTimeMs = Date.now() - startTime;

      if (replyText) {
        await chat.clearState();
        const replyMsg = await message.reply(replyText);
        console.log(`[${clientId}] Bot replied to ${message.from}`);

        // Save activity for frontend
        const activity = {
          id: replyMsg.id._serialized,
          timestamp: new Date(),
          customerPhone: message.from,
          customerMessage: message.body,
          sentiment: "neutral", // Removed separate sentiment analysis to save API calls
          intent: "chat",
          botReply: replyText,
          responseTimeMs
        };
        this.botActivities.push(activity);

        // Keep only last 100 activities
        if (this.botActivities.length > 100) {
          this.botActivities = this.botActivities.slice(-100);
        }

        // Emit bot activity to frontend
        this.io.to(clientId).emit("bot:activity", {
          clientId,
          activity
        });

        // Emit bot reply as message
        this.io.to(clientId).emit("wa:message", {
          clientId,
          message: {
            id: replyMsg.id._serialized,
            from: replyMsg.from,
            to: replyMsg.to,
            body: replyMsg.body,
            timestamp: replyMsg.timestamp,
            fromMe: true,
            type: replyMsg.type,
            author: replyMsg.author,
            ack: replyMsg.ack,
            hasMedia: replyMsg.hasMedia,
          }
        });
      }
    } catch (err) {
      console.error(`[${clientId}] Bot failed to reply:`, err);
    } finally {
      await chat.clearState();
    }
  }

  // Handle auto-assignment of conversations
  private async handleAutoAssign(clientId: string, message: Message) {
    // Logic: clientId here is treated as organizationId because we connect using orgId
    if (message.fromMe || message.from.includes("@g.us")) return; // Skip groups and self

    try {
      // Get config (clientId is orgId here)
      const settings = await db.getOrganizationSettings(clientId);
      if (!settings?.auto_assign_enabled) return;

      // 1. Resolve true phone and Sync Customer (already partially handled in message listener, but good for safety)
      const { realPhone, conversation } = await this.getOrCreateAndSyncCustomer(clientId, message.from);

      // 2. If already assigned, do nothing
      if (conversation.assigned_to) return;

      // 3. Round robin assignment
      const team = await db.getTeamMembers(clientId);
      if (team.length === 0) return;

      let nextIndex = (settings.last_assigned_index + 1) % team.length;
      const nextUser = team[nextIndex];

      // 4. Assign
      await db.assignConversation(conversation.id, nextUser.id);
      await db.updateOrganizationLastIndex(clientId, nextIndex);

      console.log(`[AutoAssign] Assigned chat ${message.from} to ${nextUser.name} (${nextUser.email})`);

      // 5. Notify frontend (via socket)
      this.io.to(clientId).emit("wa:assigned", {
        chatId: conversation.id,
        waChatId: message.from,
        userId: nextUser.id,
        userName: nextUser.name
      });

    } catch (err) {
      console.error(`[${clientId}] Auto assign error:`, err);
    }
  }

  // Shared helper to resolve real phone and sync customer
  async getOrCreateAndSyncCustomer(clientId: string, waChatId: string): Promise<{ realPhone: string; conversation: any }> {
    const client = this.clients.get(clientId);
    let realPhone = waChatId.split('@')[0];

    if (client) {
      try {
        const contact = await client.getContactById(waChatId);

        // Trick: fetch 'About' to force a server-side populate of contact fields
        try { await contact.getAbout(); } catch (e) { }

        // Strategy 1: getFormattedNumber (usually the most readable)
        const formatted = await contact.getFormattedNumber();
        const cleanFormatted = formatted.replace(/\D/g, "");

        // Strategy 2: contact.number (the raw physical number)
        const rawNumber = contact.number ? contact.number.replace(/\D/g, "") : "";

        // Choose the best one (prefer 8-15 digit numbers that don't look like internal IDs)
        // Note: Specific pattern 4203 is often used for LIDs
        if (cleanFormatted && cleanFormatted.length >= 8 && cleanFormatted.length <= 15 && !cleanFormatted.startsWith("4203")) {
          realPhone = cleanFormatted;
        } else if (rawNumber && rawNumber.length >= 8 && rawNumber.length <= 15 && !rawNumber.startsWith("4203")) {
          realPhone = rawNumber;
        } else if (contact.id.user && contact.id.user.length <= 15 && !contact.id.user.startsWith("4203")) {
          realPhone = contact.id.user;
        }
      } catch (e) {
        console.warn(`[${clientId}] Could not resolve real phone for ${waChatId}`);
      }
    }

    const conversation = await db.getOrCreateConversation(waChatId, clientId, undefined, realPhone);

    // Auto-fix existing records
    if (conversation.customer) {
      const currentPhone = conversation.customer.phone || "";
      // Update if current is empty, an ID (> 15 chars), or looks like the specific pattern in image (4203...)
      const looksLikeId = currentPhone.length > 15 || (currentPhone.length === 14 && currentPhone.startsWith("4203"));

      if (!currentPhone || looksLikeId || (currentPhone !== realPhone && realPhone.length <= 15)) {
        await db.updateCustomer(conversation.customer.id, { phone: realPhone }, clientId);
        console.log(`[${clientId}] [ForceSync] Fixed customer record ${conversation.customer.id}: ${currentPhone} -> ${realPhone}`);
        conversation.customer.phone = realPhone; // update local object
      }
    }

    return { realPhone, conversation };
  }

  ensureReadyClient(clientId: string): Client {
    const client = this.clients.get(clientId);
    const state = this.getState(clientId);

    if (!client || state.status !== "ready") {
      console.warn(`[${clientId}] ensureReadyClient failed - ClientExists: ${!!client}, Status: ${state.status}`);

      if (!client && (state.status === "ready" || state.status === "waiting_qr")) {
        // This is a weird state, maybe server restarted
        this.setState(clientId, { status: "idle", lastError: "يجب إعادة الاتصال بعد إعادة تشغيل الخادم" });
      }

      throw new Error("العميل غير جاهز، تأكد من الاتصال أولاً");
    }
    return client;
  }

  async sendMessage(clientId: string, to: string, text: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    let chatId = to;
    if (!to.includes("@")) {
      const cleanNumber = to.replace(/\D/g, "");
      chatId = `${cleanNumber}@c.us`;
    }

    try {
      // Step 1: Attempt direct send
      console.log(`[${clientId}] [SEND] To: ${chatId}`);
      const msg = await client.sendMessage(chatId, text);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.warn(`[${clientId}] Send failed to ${chatId}: ${err.message}. Attempting LID resolution...`);

      try {
        // Step 2: If failed, try to get real phone number from contact
        const contact = await client.getContactById(chatId);
        if (contact && contact.number && contact.number !== chatId.split('@')[0]) {
          const resolvedJid = `${contact.number}@c.us`;
          console.log(`[${clientId}] Resolved successfully: ${chatId} -> ${resolvedJid}`);
          const msg = await client.sendMessage(resolvedJid, text);
          return { ok: true, messageId: msg.id._serialized };
        }
      } catch (resErr: any) {
        console.error(`[${clientId}] Resolution failed: ${resErr.message}`);
      }

      if (err.message && (err.message.includes("No LID") || err.message.includes("not found"))) {
        throw new Error("الرقم غير مسجل في واتساب أو صيغته خاطئة");
      }
      throw err;
    }
  }

  async sendContact(clientId: string, to: string, contactId: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);
    try {
      const contact = await client.getContactById(contactId);
      const msg = await client.sendMessage(to, contact);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.error(`[${clientId}] Failed to send contact:`, err.message);
      throw err;
    }
  }

  async sendMediaMessage(clientId: string, to: string, base64: string, mimetype: string, filename?: string, caption?: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    let chatId = to;
    if (!to.includes("@")) {
      chatId = to.replace(/\D/g, "") + "@c.us";
    }

    try {
      const media = new MessageMedia(mimetype, base64, filename);
      const options = caption ? { caption } : {};
      const msg = await client.sendMessage(chatId, media, options);
      console.log(`[${clientId}] Media sent to ${chatId}`);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.warn(`[${clientId}] Media send failed to ${chatId}: ${err.message}. Attempting LID resolution...`);
      try {
        const contact = await client.getContactById(chatId);
        if (contact && contact.number && contact.number !== chatId.split('@')[0]) {
          const resolvedJid = `${contact.number}@c.us`;
          console.log(`[${clientId}] Resolved media JID: ${chatId} -> ${resolvedJid}`);
          const media = new MessageMedia(mimetype, base64, filename);
          const options = caption ? { caption } : {};
          const msg = await client.sendMessage(resolvedJid, media, options);
          return { ok: true, messageId: msg.id._serialized };
        }
      } catch (e) { }

      console.error(`[${clientId}] Failed to send media to ${chatId}:`, err.message || err);
      throw err;
    }
  }

  async getStories(clientId: string) {
    const client = this.ensureReadyClient(clientId);
    try {
      const chat = await client.getChatById('status@broadcast');
      const messages = await chat.fetchMessages({ limit: 40 });

      return await Promise.all(messages.map(async (m) => {
        const authorId = m.author || (m as any).participant || m.from;
        let senderName = null;

        try {
          const contact = await client.getContactById(authorId);
          senderName = contact.name || contact.pushname || contact.number;
        } catch (e) {
          try {
            const contact = await m.getContact();
            senderName = contact.name || contact.pushname || contact.number;
          } catch (e2) {
            if (authorId) senderName = authorId.split('@')[0];
          }
        }

        const finalName = senderName || (authorId ? authorId.split('@')[0] : "حالة");

        return {
          id: m.id._serialized,
          body: m.body || (m as any).caption || "",
          type: m.type,
          timestamp: m.timestamp,
          author: authorId,
          senderName: finalName,
          hasMedia: m.hasMedia
        };
      }));
    } catch (err) {
      console.error(`[${clientId}] Failed to get stories:`, err);
      return [];
    }
  }
  private async handleLocalBotReply(organizationId: string, userMessage: string): Promise<string | null> {
    try {
      const rules = await db.getBotRules(organizationId);
      const normalizedMsg = userMessage.toLowerCase().trim();

      for (const rule of rules) {
        const keywords = rule.trigger_keywords || [];
        const isMatch = keywords.some((kw: string) => {
          const normalizedKw = kw.toLowerCase().trim();
          if (rule.match_type === "exact") {
            return normalizedMsg === normalizedKw;
          } else if (rule.match_type === "regex") {
            try { return new RegExp(normalizedKw, "i").test(normalizedMsg); } catch (e) { return false; }
          } else {
            // Default: contains
            return normalizedMsg.includes(normalizedKw);
          }
        });

        if (isMatch) {
          return rule.response_text;
        }
      }
    } catch (e) {
      console.error("[LocalBot] Failed to process rules:", e);
    }
    return null;
  }
}


