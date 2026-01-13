import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { Client, LocalAuth, Message, MessageMedia, Buttons, List } from "whatsapp-web.js";
import type { Server } from "socket.io";
import { db, supabase } from "../lib/supabase";
import { ai } from "../lib/ai";
import { WorkflowEngine } from "../services/WorkflowEngine";

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
  private readonly qrTimeoutMs = 180_000; // 3 minutes for QR scan
  private isShuttingDown = false;

  // Contact caching: clientId -> Map<phone, contactInfo>
  private contactsCache = new Map<string, Map<string, {
    id: string;
    name: string;
    phone: string;
    cachedAt: number;
  }>>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  // ========== CHAT ID NORMALIZATION (CRITICAL FOR PROPER SENDING) ==========

  /**
   * Normalize raw input to either a valid ChatId (@c.us/@g.us) or clean digits
   * @param rawTo - Raw phone number, ChatId, or any input
   * @returns Normalized string (ChatId or digits) or null if invalid
   */
  private normalizeToChatId(rawTo: unknown): string | null {
    const to = String(rawTo ?? "").trim();

    // Already a valid ChatId format
    if (to.endsWith("@c.us") || to.endsWith("@g.us")) return to;

    // Clean to digits only (remove +, spaces, dashes, etc.)
    const digits = to.replace(/\D/g, "");
    if (!digits) return null;

    // Reject if looks like internal WhatsApp LID (too long)
    if (digits.length > 15) {
      console.warn(`[normalizeToChatId] Rejecting LID-like number: ${to} (${digits.length} digits)`);
      return null;
    }

    return digits; // Still just digits, will be resolved in resolveChatId
  }

  /**
   * Resolve raw input to a valid WhatsApp ChatId using getNumberId()
   * This is the SAFEST method as it validates the number with WhatsApp servers
   * @param clientId - Organization/Client ID
   * @param rawTo - Raw phone number or ChatId
   * @returns Validated ChatId (@c.us/@g.us) or null if invalid
   */
  private async resolveChatId(clientId: string, rawTo: unknown): Promise<string | null> {
    const normalized = this.normalizeToChatId(rawTo);
    if (!normalized) return null;

    // If it's already a valid JID format (ends with @c.us or @g.us), return it
    if (normalized.endsWith("@c.us") || normalized.endsWith("@g.us")) {
      return normalized;
    }

    // Get client instance
    const client = this.clients.get(clientId);
    if (!client) {
      console.error(`[resolveChatId] No client found for ${clientId}`);
      return null;
    }

    // USER SOLUTION: Use getNumberId() to get the proper _serialized JID
    try {
      console.log(`[${clientId}] [resolveChatId] Validating number with WhatsApp: ${normalized}`);
      const numberId = await client.getNumberId(normalized);

      if (numberId && numberId._serialized) {
        console.log(`[${clientId}] [resolveChatId] ✅ Resolved: ${normalized} -> ${numberId._serialized}`);
        return numberId._serialized;
      } else {
        console.warn(`[${clientId}] [resolveChatId] ⚠️ getNumberId returned null - number may not be on WhatsApp`);

        // Final fallback: construct JID directly
        const fallbackJid = `${normalized}@c.us`;
        return fallbackJid;
      }
    } catch (err: any) {
      console.warn(`[${clientId}] [resolveChatId] getNumberId failed:`, err.message);
      return `${normalized}@c.us`; // Fallback to direct JID
    }
  }

  /**
   * Validate that a chatId ends with proper suffix
   */
  private isValidChatId(chatId: string | null): boolean {
    if (!chatId) return false;
    return chatId.endsWith("@c.us") || chatId.endsWith("@g.us");
  }

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
    console.log(`[${clientId}] Emitting QR to socket room (length: ${qrDataUrl.length})`);
    this.io.to(clientId).emit("wa:qr", { clientId, qrDataUrl });
  }

  private emitState(clientId: string, state: WaState) {
    console.log(`[${clientId}] Emitting state: ${state.status}, hasQR: ${!!state.qrDataUrl}`);
    this.io.to(clientId).emit("wa:state", {
      clientId,
      status: state.status,
      qrDataUrl: state.qrDataUrl, // ✅ Include QR in state emission!
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

    // Only start timeout if we are specifically waiting for a QR scan.
    // Initialization can take time on slow servers, we don't want to reset while loading session.
    if (next.status === "waiting_qr" && prev.status !== "waiting_qr") {
      this.startQrTimeout(clientId);
    } else if (next.status !== "waiting_qr" && next.status !== "initializing") {
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

      // Keep-Alive to prevent idle disconnection
      try {
        const page = (client as any).pupPage;
        if (page) {
          setInterval(async () => {
            if (this.clients.get(clientId) === client) {
              try { await page.evaluate(() => 1); } catch (e) { }
            }
          }, 60000); // Ping every minute
        }
      } catch (e) { }

      // SAFETY DELAY: Wait 5 seconds to let WhatsApp session stabilize
      await new Promise(r => setTimeout(r, 5000));

      if (this.clients.get(clientId) !== client) return; // Client was destroyed during wait

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

    client.on("auth_failure", (msg) => {
      console.error(`[${clientId}] Authentication failure:`, msg);
      // Don't reset immediately, let the user try to reconnect
      this.setState(clientId, { status: "error", lastError: "فشل المصادقة، يرجى إعادة المحاولة" });
    });

    client.on("loading_screen", (percent, message) => {
      console.log(`[${clientId}] Loading session: ${percent}% - ${message}`);
    });

    client.on("disconnected", async (reason: string) => {
      console.warn(`[${clientId}] Disconnected: ${reason}`);

      // Clear the client from memory immediately
      this.clients.delete(clientId);
      this.clearQrTimeout(clientId);

      this.setState(clientId, {
        status: "disconnected",
        lastError: reason || "تم فصل الاتصال",
        qrDataUrl: undefined,
      });

      // Special handling for LOGOUT: Nuke session data immediately
      if (reason === "LOGOUT") {
        console.log(`[${clientId}] Logout detected: performing hard reset to allow new login...`);
        try {
          // Add small delay to let file locks release
          await new Promise(r => setTimeout(r, 1000));
          await this.resetSession(clientId, { preserveAttempts: false, silent: false });
        } catch (e) {
          console.error(`[${clientId}] Failed to clear session after logout:`, e);
        }
        return; // Do NOT auto-reconnect
      }

      // Auto-reconnect after 5 seconds if not shutting down
      if (!this.isShuttingDown) {
        console.log(`[${clientId}] Will attempt auto-reconnect in 5 seconds...`);
        setTimeout(async () => {
          try {
            console.log(`[${clientId}] Auto-reconnecting...`);
            await this.connect(clientId);
          } catch (e) {
            console.error(`[${clientId}] Auto-reconnect failed:`, e);
          }
        }, 5000);
      }
    });

    // Handle incoming messages for webhook and real-time
    client.on("message", async (message: Message) => {
      let senderName = null;
      let waChatIdToSync = message.from;
      if (message.author && message.author !== message.from && !message.from.includes("@g.us")) {
        waChatIdToSync = message.author;
      }

      // Extract CTWA (Click-to-WhatsApp) referral data from Facebook/Instagram ads
      let messageReferral: any = undefined;
      const rawData = (message as any)._data || (message as any).rawData;
      if (rawData?.referral) {
        messageReferral = {
          source_type: rawData.referral.source_type, // 'ad'
          source_id: rawData.referral.source_id,
          source_url: rawData.referral.source_url,
          headline: rawData.referral.headline,
          body: rawData.referral.body,
          ctwa_clid: rawData.referral.ctwa_clid,
        };
        console.log(`[${clientId}] CTWA Referral detected:`, messageReferral);
      }

      const { conversation, realPhone } = await this.getOrCreateAndSyncCustomer(clientId, waChatIdToSync, messageReferral);

      try {
        const contact = await message.getContact();
        senderName = contact.name || contact.pushname || contact.number;
      } catch (e) { }

      // Advanced Data: Quoted Message
      let quotedMsgId = null;
      if ((message as any)._data?.quotedMsg) {
        quotedMsgId = (message as any)._data.quotedStanzaID;
      }

      // Advanced Data: Location
      let locationData = null;
      if (message.type === 'location' && message.location) {
        locationData = {
          lat: message.location.latitude,
          lng: message.location.longitude,
          name: (message as any).locationName || (message as any).body
        };
      }

      const messageData = {
        id: message.id._serialized,
        from: message.from,
        phone: realPhone,
        to: message.to,
        body: message.body || (message as any).caption || "",
        timestamp: message.timestamp,
        fromMe: message.fromMe,
        type: message.type,
        author: message.author,
        senderName,
        ack: message.ack,
        hasMedia: message.hasMedia,
        quotedMsgId,
        location: locationData,
        vCards: message.vCards
      };

      try {
        await supabase.from('messages').upsert({
          organization_id: clientId,
          customer_id: conversation.customer?.id,
          wa_message_id: message.id._serialized,
          body: messageData.body,
          from_phone: message.from,
          to_phone: message.to,
          is_from_customer: !message.fromMe,
          message_type: message.type,
          status: 'sent', // Incoming is always 'sent' from their perspective
          quoted_message_id: quotedMsgId,
          location_lat: locationData?.lat,
          location_lng: locationData?.lng,
          location_name: locationData?.name,
          metadata: {
            vCards: message.vCards,
            author: message.author
          }
        }, { onConflict: 'wa_message_id' });
      } catch (e: any) {
        console.error(`[${clientId}] Failed to persist incoming message:`, e.message);
      }

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
        // Run Engines
        void this.handleBotReply(clientId, message);
        void this.handleAutoAssign(clientId, message);

        // Workflow Engine (Keywords)
        const workflow = WorkflowEngine.getInstance(this);
        void workflow.trigger(clientId, 'keyword', {}, {
          chatId: message.from,
          message: { body: message.body }
        });
      }, 1000);
    });

    // Handle message_create for sent messages (real-time)
    client.on("message_create", async (message: Message) => {
      if (message.fromMe) {
        console.log(`[${clientId}] Message sent to ${message.to}`);

        const { conversation, realPhone } = await this.getOrCreateAndSyncCustomer(clientId, message.to);

        // Capture Quoted if sending as reply
        let quotedMsgId = null;
        if ((message as any)._data?.quotedMsg) {
          quotedMsgId = (message as any)._data.quotedStanzaID;
        }

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
          quotedMsgId
        };

        // Persistence
        try {
          await supabase.from('messages').upsert({
            organization_id: clientId,
            customer_id: conversation.customer?.id,
            wa_message_id: message.id._serialized,
            body: message.body,
            from_phone: message.from,
            to_phone: message.to,
            is_from_customer: false,
            message_type: message.type,
            status: 'sent',
            quoted_message_id: quotedMsgId,
            metadata: { author: message.author }
          }, { onConflict: 'wa_message_id' });
        } catch (e: any) {
          console.error(`[${clientId}] Persistence error on message_create:`, e.message);
        }

        // Emit to socket
        this.io.to(clientId).emit("wa:message", {
          clientId,
          message: messageData,
        });

        // Increment stats
        void db.incrementDailyStat("messages_sent", 1, clientId);
      }
    });

    // 1. Receipts: Listen for ACKs
    client.on("message_ack", async (msg, ack) => {
      let status: 'sent' | 'delivered' | 'read' = 'sent';
      if (ack === 2) status = 'delivered';
      if (ack >= 3) status = 'read';

      console.log(`[${clientId}] Message ACK: ${msg.id._serialized} -> ${status} (${ack})`);

      // Update DB
      await supabase
        .from("messages")
        .update({ status })
        .eq("wa_message_id", msg.id._serialized);

      // Notify UI
      this.io.to(clientId).emit("wa:message_ack", {
        clientId,
        messageId: msg.id._serialized,
        status,
        ack
      });
    });

    // 2. Reactions: Sync Emoji Reactions
    client.on("message_reaction", async (reaction) => {
      console.log(`[${clientId}] Reaction received: ${reaction.reaction} on ${reaction.msgId._serialized}`);

      // Fetch current reactions
      const { data: msg } = await supabase
        .from("messages")
        .select("reactions")
        .eq("wa_message_id", reaction.msgId._serialized)
        .single();

      let reactions = msg?.reactions || [];
      if (!Array.isArray(reactions)) reactions = [];

      // Add or Update reaction (if same sender reacts differently)
      const sender = (reaction as any).senderId || 'unknown';
      const index = reactions.findIndex((r: any) => r.sender === sender);

      if (reaction.reaction === "") {
        // Reaction removed
        if (index > -1) reactions.splice(index, 1);
      } else {
        if (index > -1) {
          reactions[index].char = reaction.reaction;
        } else {
          reactions.push({ char: reaction.reaction, sender });
        }
      }

      await supabase
        .from("messages")
        .update({ reactions })
        .eq("wa_message_id", reaction.msgId._serialized);

      this.io.to(clientId).emit("wa:reaction", {
        clientId,
        messageId: reaction.msgId._serialized,
        reactions
      });
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

    if (attemptCount < 3) {
      console.log(`[${clientId}] Auto-retry (attempt ${attemptCount + 1}/3)`);
      this.setState(clientId, { attemptCount: attemptCount + 1 });
      void this.connect(clientId);
    } else {
      console.error(`[${clientId}] Max retry attempts reached (3/3)`);
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
        // WINDOWS FIX: Wait for file locks to release
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
      if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`[${clientId}] Session folder removed at ${sessionPath}`);
      }
    } catch (err) {
      console.warn(`[${clientId}] Failed to remove session folder (might be locked):`, err);
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
    try {
      console.log(`[${clientId}] doConnect start...`);

      const existingState = this.getState(clientId);
      if (existingState.status === "ready") {
        return existingState;
      }

      let client = this.clients.get(clientId);

      if (!client) {
        console.log(`[${clientId}] Creating new WhatsApp client...`);

        // FIX: Absolute path for Windows stability
        const authPath = path.resolve(process.cwd(), ".wwebjs_auth");

        client = new Client({
          authStrategy: new LocalAuth({
            clientId,
            dataPath: authPath
          }),
          puppeteer: {
            headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--no-first-run",
              "--no-zygote",
              "--disable-gpu",
              "--disable-extensions",
              "--disable-background-timer-throttling",
              "--disable-backgrounding-occluded-windows",
              "--disable-renderer-backgrounding",
              "--disable-features=IsolateOrigins,site-per-process",
              "--disable-web-security",
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            timeout: 60000,
          },
          qrMaxRetries: 5,
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
    } catch (err) {
      console.error(`[${clientId}] Error in doConnect`, err);
      this.setState(clientId, {
        status: "error",
        lastError: "حدث خطأ غير متوقع أثناء الاتصال",
      });
      return this.getState(clientId);
    } finally {
      this.releaseLock(clientId);
    }
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
  async getOrCreateAndSyncCustomer(
    clientId: string,
    waChatId: string,
    messageReferral?: {
      source_type?: string;
      source_id?: string;
      source_url?: string;
      headline?: string;
      body?: string;
      ctwa_clid?: string;
    }
  ): Promise<{ realPhone: string; conversation: any }> {
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

    // Build attribution data from CTWA referral if present
    let attributionData: any = undefined;
    if (messageReferral?.ctwa_clid || messageReferral?.source_type === 'ad') {
      attributionData = {
        source_type: 'facebook',
        ctwa_clid: messageReferral.ctwa_clid,
        source_ad_id: messageReferral.source_id,
        channel: 'whatsapp',
      };
      console.log(`[${clientId}] CTWA Attribution detected:`, attributionData);
    }

    const conversation = await db.getOrCreateConversation(waChatId, clientId, undefined, realPhone, attributionData);

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

  // Interactive: Send Buttons
  async sendButtonsMessage(clientId: string, to: string, text: string, buttons: { id: string, body: string }[], title?: string, footer?: string) {
    const client = this.ensureReadyClient(clientId);
    const buttonObj = new Buttons(text, buttons, title, footer);
    return await client.sendMessage(to, buttonObj);
  }

  // Interactive: Send List Menu
  async sendListMenu(
    clientId: string,
    to: string,
    body: string,
    buttonText: string,
    sections: { title?: string, rows: { id: string, title: string, description?: string }[] }[],
    title?: string,
    footer?: string
  ) {
    const client = this.ensureReadyClient(clientId);
    const list = new List(body, buttonText, sections, title, footer);
    return await client.sendMessage(to, list);
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

  /**
   * Get cached contact info or null if not cached/expired
   */
  private getCachedContact(clientId: string, phone: string) {
    const clientCache = this.contactsCache.get(clientId);
    if (!clientCache) return null;

    const cached = clientCache.get(phone);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.cachedAt > this.CACHE_TTL_MS) {
      clientCache.delete(phone);
      return null;
    }

    return cached;
  }

  /**
   * Cache contact info
   */
  private cacheContact(clientId: string, phone: string, contactInfo: { id: string; name: string; phone: string }) {
    let clientCache = this.contactsCache.get(clientId);
    if (!clientCache) {
      clientCache = new Map();
      this.contactsCache.set(clientId, clientCache);
    }

    clientCache.set(phone, {
      ...contactInfo,
      cachedAt: Date.now()
    });
  }

  /**
   * Send a text message to a phone number or chat ID
   * Optimized for campaign sending using USER'S RECOMMENDED SOLUTION
   */
  async sendMessage(clientId: string, to: string, text: string, options: { quotedMessageId?: string } = {}): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);
    console.log(`[${clientId}] [SEND] Request to send to: ${to}`);

    // ========== STEP 1: Resolve Chat ID (getNumberId) ==========
    const resolvedChatId = await this.resolveChatId(clientId, to);
    if (!resolvedChatId) {
      throw new Error(`رقم غير صالح: ${to}`);
    }

    // ========== STEP 2: Send directly via client (Most stable method) ==========
    try {
      console.log(`[${clientId}] [SEND] Attempting direct send to ${resolvedChatId}`);

      const msg = await client.sendMessage(resolvedChatId, text, {
        quotedMessageId: options.quotedMessageId
      });

      console.log(`[${clientId}] [SEND] ✅ Success! MessageId: ${msg.id._serialized}`);
      return { ok: true, messageId: msg.id._serialized };

    } catch (err: any) {
      console.error(`[${clientId}] [SEND] Direct send failed for ${resolvedChatId}:`, err.message);

      // Fallback: Human-like interaction (Sometimes bypasses blocks)
      try {
        console.log(`[${clientId}] [SEND] Trying fallback via Chat object...`);
        const chat = await client.getChatById(resolvedChatId);
        const msg = await chat.sendMessage(text, { quotedMessageId: options.quotedMessageId });
        return { ok: true, messageId: msg.id._serialized };
      } catch (fallbackErr: any) {
        throw new Error(fallbackErr.message || "فشل إرسال الرسالة بعد محاولات متعددة");
      }
    }
  }

  async sendContact(clientId: string, to: string, contactId: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    // Resolve the recipient to a valid chat ID
    const resolvedTo = await this.resolveChatId(clientId, to);
    if (!resolvedTo || !this.isValidChatId(resolvedTo)) {
      throw new Error(`رقم المستلم غير صالح: ${to}`);
    }

    try {
      const contact = await client.getContactById(contactId);
      const msg = await client.sendMessage(resolvedTo, contact);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.error(`[${clientId}] Failed to send contact:`, err.message);
      throw err;
    }
  }

  async sendMediaMessage(clientId: string, to: string, base64: string, mimetype: string, filename?: string, caption?: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    // Resolve to valid chat ID using getNumberId()
    const chatId = await this.resolveChatId(clientId, to);

    if (!chatId || !this.isValidChatId(chatId)) {
      throw new Error(`رقم المستلم غير صالح للإرسال: ${to}`);
    }

    console.log(`[${clientId}] [MEDIA] Sending to: ${to} -> ${chatId}`);

    try {
      const media = new MessageMedia(mimetype, base64, filename);
      const options = caption ? { caption } : {};
      const msg = await client.sendMessage(chatId, media, options);
      console.log(`[${clientId}] [MEDIA] ✅ Media sent to ${chatId}`);
      return { ok: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.error(`[${clientId}] [MEDIA] Failed to send media to ${chatId}:`, err.message);
      throw new Error(`فشل إرسال الوسائط: ${err.message}`);
    }
  }

  /**
   * Send message directly to a chat by chat ID (BEST METHOD - No LID issues!)
   * This is the most reliable way to send messages
   */
  async sendMessageToChat(clientId: string, chatId: string, text: string): Promise<{ ok: boolean; messageId?: string }> {
    const client = this.ensureReadyClient(clientId);

    try {
      console.log(`[${clientId}] [SEND_TO_CHAT] Sending to chat: ${chatId}`);

      // Get chat directly - no contact lookup needed!
      // This method AVOIDS LID issues entirely by using chat IDs directly
      const chat = await client.getChatById(chatId);

      // Artificial delay to mimic human behavior
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send message directly to the chat
      const msg = await chat.sendMessage(text);

      console.log(`[${clientId}] [SEND_TO_CHAT] Success! MessageId: ${msg.id._serialized}`);
      return { ok: true, messageId: msg.id._serialized };

    } catch (err: any) {
      console.error(`[${clientId}] [SEND_TO_CHAT] Failed to send to ${chatId}:`, err.message);

      const errMsg = err.message || "";

      // Provide specific error messages for common issues
      if (errMsg.includes("chat not found") || errMsg.includes("not found")) {
        throw new Error("المحادثة غير موجودة أو تم حذفها");
      } else if (errMsg.includes("Evaluation failed")) {
        throw new Error("فشل الاتصال بالمحادثة. حاول إعادة تحميل WhatsApp.");
      } else if (errMsg.includes("getIsMyContact is not a function")) {
        throw new Error("خطأ داخلي في مكتبة WhatsApp. حاول إعادة الاتصال.");
      }

      throw new Error(`فشل إرسال الرسالة: ${errMsg}`);
    }
  }

  /**
   * Get all WhatsApp chats (conversations) - BEST for campaigns!
   * Returns all active chats with their IDs and info
   */
  async getAllChats(clientId: string): Promise<Array<{
    id: string;
    name: string;
    phone?: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp: number;
  }>> {
    const client = this.ensureReadyClient(clientId);

    try {
      console.log(`[${clientId}] Fetching all chats...`);
      const chats = await client.getChats();

      console.log(`[${clientId}] Found ${chats.length} total chats, processing...`);

      const processedChats = [];

      for (const chat of chats) {
        try {
          // Skip group chats and status broadcasts
          if (chat.isGroup) {
            continue;
          }

          // Get contact info
          const contact = await chat.getContact();

          // Extract phone number if possible
          let phone: string | undefined = undefined;
          try {
            const formatted = await contact.getFormattedNumber();
            phone = formatted.replace(/\D/g, '');
          } catch (e) {
            // If can't get phone, use the chat ID user part
            phone = chat.id.user;
          }

          processedChats.push({
            id: chat.id._serialized,
            name: chat.name || contact.name || contact.pushname || phone || 'Unknown',
            phone,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp
          });

        } catch (err) {
          console.warn(`[${clientId}] Error processing chat ${chat.id._serialized}:`, err);
        }
      }

      console.log(`[${clientId}] Successfully processed ${processedChats.length} valid chats`);
      return processedChats;

    } catch (err: any) {
      console.error(`[${clientId}] Failed to get chats:`, err);
      throw new Error(`فشل في جلب المحادثات: ${err.message}`);
    }
  }

  /**
   * Fetch all WhatsApp contacts with names and phone numbers
   * Returns contacts with resolved phone numbers (handling LIDs)
   */
  async getAllContacts(clientId: string): Promise<Array<{
    id: string;
    name: string;
    phone: string;
    pushname?: string;
    isMyContact: boolean;
    isWAContact: boolean;
  }>> {
    const client = this.ensureReadyClient(clientId);

    try {
      console.log(`[${clientId}] Fetching all contacts...`);
      const contacts = await client.getContacts();

      console.log(`[${clientId}] Found ${contacts.length} total contacts, processing...`);

      const processedContacts = [];
      let processed = 0;

      for (const contact of contacts) {
        try {
          // Skip group contacts and status broadcast
          if (contact.isGroup || contact.id._serialized === 'status@broadcast') {
            continue;
          }

          // Try to get About to force server-side populate
          try { await contact.getAbout(); } catch (e) { }

          // Get the best phone number
          let realPhone = contact.id.user || '';

          // Strategy 1: getFormattedNumber (usually the most readable)
          try {
            const formatted = await contact.getFormattedNumber();
            const cleanFormatted = formatted.replace(/\D/g, '');

            if (cleanFormatted && cleanFormatted.length >= 8 && cleanFormatted.length <= 15 && !cleanFormatted.startsWith('4203')) {
              realPhone = cleanFormatted;
            }
          } catch (e) { }

          // Strategy 2: contact.number (raw physical number)
          if (contact.number) {
            const rawNumber = contact.number.replace(/\D/g, '');
            if (rawNumber && rawNumber.length >= 8 && rawNumber.length <= 15 && !rawNumber.startsWith('4203')) {
              realPhone = rawNumber;
            }
          }

          // Only include if we have a valid phone
          if (realPhone && realPhone.length >= 8 && realPhone.length <= 15) {
            processedContacts.push({
              id: contact.id._serialized,
              name: contact.name || contact.pushname || realPhone,
              phone: realPhone,
              pushname: contact.pushname || undefined,
              isMyContact: contact.isMyContact,
              isWAContact: contact.isWAContact
            });
          }

          processed++;
          if (processed % 100 === 0) {
            console.log(`[${clientId}] Processed ${processed}/${contacts.length} contacts...`);
          }

        } catch (err) {
          console.warn(`[${clientId}] Error processing contact ${contact.id._serialized}:`, err);
        }
      }

      console.log(`[${clientId}] Successfully processed ${processedContacts.length} valid contacts`);
      return processedContacts;

    } catch (err: any) {
      console.error(`[${clientId}] Failed to get contacts:`, err);
      throw new Error(`فشل في جلب جهات الاتصال: ${err.message}`);
    }
  }

  /**
   * Sync all WhatsApp contacts to database (contacts table)
   * Returns count of synced contacts
   */
  async syncContactsToDatabase(clientId: string): Promise<{
    synced: number;
    updated: number;
    failed: number;
    total: number;
  }> {
    try {
      console.log(`[${clientId}] Starting contact sync to database...`);

      const contacts = await this.getAllContacts(clientId);

      let synced = 0;
      let updated = 0;
      let failed = 0;

      for (const contact of contacts) {
        try {
          // Check if contact exists
          const { data: existing } = await supabase
            .from('contacts')
            .select('id, phone, name')
            .eq('organization_id', clientId)
            .eq('phone', contact.phone)
            .single();

          if (existing) {
            // Update if name changed or was empty
            if (!existing.name || existing.name !== contact.name) {
              await supabase
                .from('contacts')
                .update({
                  name: contact.name,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
              updated++;
            }
          } else {
            // Create new contact
            await supabase
              .from('contacts')
              .insert({
                organization_id: clientId,
                name: contact.name,
                phone: contact.phone,
                source: 'whatsapp_sync',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            synced++;
          }

        } catch (err) {
          console.warn(`[${clientId}] Failed to sync contact ${contact.phone}:`, err);
          failed++;
        }
      }

      console.log(`[${clientId}] Contact sync complete: ${synced} new, ${updated} updated, ${failed} failed (Total: ${contacts.length})`);

      return {
        synced,
        updated,
        failed,
        total: contacts.length
      };

    } catch (err: any) {
      console.error(`[${clientId}] Contact sync failed:`, err);
      throw new Error(`فشل في مزامنة جهات الاتصال: ${err.message}`);
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

  /**
   * Sync all WhatsApp chats to customers/contacts table with proper chat_id
   * This is CRITICAL for campaign sending - stores chat.id._serialized for reliable sending
   * Call this periodically or after connection to ensure database has proper chat IDs
   */
  async syncAllChatsToDatabase(clientId: string): Promise<{
    synced: number;
    updated: number;
    failed: number;
    total: number;
  }> {
    const client = this.ensureReadyClient(clientId);

    console.log(`[${clientId}] [SYNC] Starting chat sync to database...`);

    let synced = 0;
    let updated = 0;
    let failed = 0;

    try {
      const chats = await client.getChats();
      console.log(`[${clientId}] [SYNC] Found ${chats.length} chats to process`);

      for (const chat of chats) {
        // Skip groups and status
        if (chat.isGroup || chat.id._serialized === 'status@broadcast') {
          continue;
        }

        try {
          const chatId = chat.id._serialized; // This is the exact format we need: xxxxx@c.us

          // Validate it's a proper chat ID
          if (!this.isValidChatId(chatId)) {
            console.warn(`[${clientId}] [SYNC] Skipping invalid chat ID: ${chatId}`);
            continue;
          }

          // Get contact info
          const contact = await chat.getContact();
          let phone = chat.id.user;
          let name = chat.name || contact.name || contact.pushname || phone;

          // Try to get formatted number
          try {
            const formatted = await contact.getFormattedNumber();
            const cleanFormatted = formatted.replace(/\D/g, '');
            if (cleanFormatted && cleanFormatted.length >= 8 && cleanFormatted.length <= 15) {
              phone = cleanFormatted;
            }
          } catch (e) { }

          // Skip if phone looks like LID
          if (phone.length > 15 || phone.startsWith('4203')) {
            console.warn(`[${clientId}] [SYNC] Skipping LID-like phone: ${phone}`);
            continue;
          }

          // Check if customer exists with this phone
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id, wa_chat_id, phone')
            .eq('organization_id', clientId)
            .eq('phone', phone)
            .single();

          if (existingCustomer) {
            // Update wa_chat_id if different or missing
            if (existingCustomer.wa_chat_id !== chatId) {
              await supabase
                .from('customers')
                .update({
                  wa_chat_id: chatId,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingCustomer.id);
              updated++;
              console.log(`[${clientId}] [SYNC] Updated customer ${phone}: wa_chat_id = ${chatId}`);
            }
          } else {
            // Create new customer with wa_chat_id
            const { error: insertError } = await supabase
              .from('customers')
              .insert({
                organization_id: clientId,
                name: name,
                phone: phone,
                wa_chat_id: chatId,
                source: 'whatsapp_sync',
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (insertError) {
              console.warn(`[${clientId}] [SYNC] Failed to insert customer ${phone}:`, insertError.message);
              failed++;
            } else {
              synced++;
              console.log(`[${clientId}] [SYNC] Created customer ${phone} with wa_chat_id = ${chatId}`);
            }
          }

        } catch (err: any) {
          console.warn(`[${clientId}] [SYNC] Failed to process chat:`, err.message);
          failed++;
        }
      }

      console.log(`[${clientId}] [SYNC] ✅ Complete! Synced: ${synced}, Updated: ${updated}, Failed: ${failed}`);

      return {
        synced,
        updated,
        failed,
        total: chats.length
      };

    } catch (err: any) {
      console.error(`[${clientId}] [SYNC] Fatal error:`, err);
      throw new Error(`فشل في مزامنة المحادثات: ${err.message}`);
    }
  }
}


