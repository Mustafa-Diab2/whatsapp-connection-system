import fs from "fs-extra";
import path from "path";
import QRCode from "qrcode";
import { Client, LocalAuth } from "whatsapp-web.js";
import type { Server } from "socket.io";

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

type ResetOptions = {
  preserveAttempts?: boolean;
  silent?: boolean;
};

export class WhatsAppManager {
  private clients = new Map<string, Client>();
  private states = new Map<string, WaState>();
  private locks = new Map<string, boolean>();
  private qrTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly io: Server;
  private readonly qrTimeoutMs = 20_000;

  constructor(io: Server) {
    this.io = io;
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
  }

  private startQrTimeout(clientId: string) {
    this.clearQrTimeout(clientId);
    const timer = setTimeout(() => this.handleQrTimeout(clientId), this.qrTimeoutMs);
    this.qrTimeouts.set(clientId, timer);
  }

  private clearQrTimeout(clientId: string) {
    const timer = this.qrTimeouts.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.qrTimeouts.delete(clientId);
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
      this.setState(clientId, { status: "ready", qrDataUrl: undefined, lastError: undefined });
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
      this.setState(clientId, { attemptCount: attemptCount + 1 });
      void this.connect(clientId, { fromTimeout: true });
    } else {
      this.setState(clientId, {
        status: "error",
        lastError: "لم يتم توليد QR، حاول Reset",
        qrDataUrl: undefined,
      });
    }
  }

  private getSessionFolder(clientId: string) {
    return path.join(process.cwd(), ".wwebjs_auth", clientId);
  }

  async resetSession(clientId: string, options?: ResetOptions): Promise<WaState> {
    const existingClient = this.clients.get(clientId);
    if (existingClient) {
      try {
        await existingClient.destroy();
      } catch (err) {
        console.error(`[${clientId}] Error destroying client`, err);
      }
    }

    this.clients.delete(clientId);
    this.clearQrTimeout(clientId);
    this.locks.delete(clientId);

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

    return nextState;
  }

  async connect(clientId: string, meta?: { fromTimeout?: boolean }): Promise<WaState> {
    if (this.locks.get(clientId)) {
      console.log(`[${clientId}] Connect blocked by lock`);
      return this.getState(clientId);
    }

    this.locks.set(clientId, true);
    console.log(`[${clientId}] Connecting${meta?.fromTimeout ? " (retry)" : ""}...`);

    const existingState = this.getState(clientId);
    if (existingState.status === "ready") {
      this.releaseLock(clientId);
      return existingState;
    }

    let client = this.clients.get(clientId);

    if (!client) {
      // تحديد مسار Chromium تلقائياً
      const chromiumPaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
      ].filter(Boolean);

      let executablePath: string | undefined;
      for (const p of chromiumPaths) {
        if (p && fs.existsSync(p)) {
          executablePath = p;
          console.log(`[${clientId}] Using Chromium at: ${p}`);
          break;
        }
      }

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
          "--disable-software-rasterizer",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--safebrowsing-disable-auto-update",
        ],
      };

      if (executablePath) {
        puppeteerOptions.executablePath = executablePath;
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

  ensureReadyClient(clientId: string): Client {
    const client = this.clients.get(clientId);
    const state = this.getState(clientId);
    if (!client || state.status !== "ready") {
      throw new Error("العميل غير جاهز، تأكد من الاتصال أولاً");
    }
    return client;
  }
}

export default WhatsAppManager;
