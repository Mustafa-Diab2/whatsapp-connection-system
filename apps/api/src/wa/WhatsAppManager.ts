import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import type { Server } from "socket.io";
import { db } from "../lib/supabase";
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
  private readonly qrTimeoutMs = 20_000;
  private isShuttingDown = false;

  constructor(io: Server) {
    this.io = io;
    this.setupGracefulShutdown();
    this.loadConfigs();
  }

  private async loadConfigs() {
    try {
      const config = await db.getBotConfig("default");
      if (config) {
        this.botConfigs.set("default", {
          systemPrompt: config.system_prompt || "",
          apiKey: config.api_key || "",
          enabled: config.enabled || false
        });
        console.log("[WhatsAppManager] Loaded default bot config from Supabase");
      }
    } catch (err) {
      console.error("[WhatsAppManager] Failed to load bot config:", err);
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

    if (next.status === "initializing" || next.status === "waiting_qr") {
      this.startQrTimeout(clientId);
    } else {
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
      console.log(`[${clientId}] QR received`);
      const qrDataUrl = await QRCode.toDataURL(qr);
      this.setState(clientId, { status: "waiting_qr", qrDataUrl, lastError: undefined });
      this.emitQr(clientId, qrDataUrl);
    });

    client.on("authenticated", () => {
      console.log(`[${clientId}] Authenticated`);
    });

    client.on("ready", () => {
      console.log(`[${clientId}] Client ready`);
      this.setState(clientId, { status: "ready", qrDataUrl: undefined, lastError: undefined, attemptCount: 0 });
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
      console.log(`[${clientId}] Message received from ${message.from}`);

      const messageData = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
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

      // Add delay to prevent immediate reply overlap
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

        const messageData = {
          id: message.id._serialized,
          from: message.from,
          to: message.to,
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

      const puppeteerOptions: any = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
      };

      // Only use custom path if explicitly set
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log(`[${clientId}] Using custom Chromium: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      } else {
        console.log(`[${clientId}] Using Puppeteer bundled Chromium`);
      }

      client = new Client({
        authStrategy: new LocalAuth({ clientId }),
        puppeteer: puppeteerOptions,
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

  setBotConfig(clientId: string, config: { systemPrompt: string; apiKey: string; enabled: boolean }) {
    this.botConfigs.set(clientId, config);
    console.log(`[${clientId}] Bot config updated: ${config.enabled ? "Enabled" : "Disabled"}`);
  }

  getBotConfig(clientId: string) {
    return this.botConfigs.get(clientId) || { systemPrompt: "", apiKey: "", enabled: false };
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

    // Analyze message
    const analysis = await this.analyzeMessage(config.apiKey, testMessage);

    // Generate response
    const response = await this.generateAIReply(config.apiKey, config.systemPrompt, testMessage);

    const responseTimeMs = Date.now() - startTime;

    return { analysis, response, responseTimeMs };
  }

  private async handleBotReply(clientId: string, message: Message) {
    // Refresh config from DB to ensure we have latest orgId and settings
    // This is safer than relying on in-memory config which might lack orgId
    let config: BotConfig | null = null;
    let orgId: string | undefined;

    try {
      const dbConfig = await db.getBotConfig(clientId);
      if (dbConfig) {
        config = {
          apiKey: dbConfig.api_key || "",
          systemPrompt: dbConfig.system_prompt || "",
          enabled: dbConfig.enabled || false,
          organizationId: dbConfig.organization_id
        };
        orgId = dbConfig.organization_id;
      }
    } catch (e) {
      // Fallback to memory
      config = this.botConfigs.get(clientId) || null;
      orgId = config?.organizationId;
    }

    // Use default key if enabled, even if apiKey is empty in config
    if (!config || !config.enabled) return;

    // Ignore status updates or media for now, focus on text
    if (message.type !== "chat") return;

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

      // Step 3: Generate response with RAG
      // If no orgId, we can't do RAG properly, fallback to normal reply without context docs
      let replyText = "";

      if (orgId) {
        replyText = await ai.generateRAGReply(message.body, conversationHistory, orgId, config.systemPrompt);
      } else {
        // Fallback if no org (shouldn't happen in prod)
        replyText = await ai.generateReply(config.systemPrompt + "\n\nUser: " + message.body, conversationHistory);
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

      // 1. Get or create conversation in DB
      const conversation = await db.getOrCreateConversation(message.from, clientId);

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

  ensureReadyClient(clientId: string): Client {
    const client = this.clients.get(clientId);
    const state = this.getState(clientId);
    if (!client || state.status !== "ready") {
      throw new Error("العميل غير جاهز، تأكد من الاتصال أولاً");
    }
    return client;
  }

  async sendMessage(clientId: string, to: string, text: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    // Format phone number if needed
    let chatId = to;
    if (!to.includes("@")) {
      // Remove any non-digit characters and add @c.us suffix
      chatId = to.replace(/\D/g, "") + "@c.us";
    }

    try {
      const msg = await client.sendMessage(chatId, text);
      console.log(`[${clientId}] Message sent to ${chatId}`);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err) {
      console.error(`[${clientId}] Failed to send message to ${chatId}:`, err);
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
    } catch (err) {
      console.error(`[${clientId}] Failed to send media to ${chatId}:`, err);
      throw err;
    }
  }
}


