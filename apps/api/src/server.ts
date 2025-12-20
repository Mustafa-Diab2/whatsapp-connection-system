import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// Simple CORS - allow all for now
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  },
});

// Initialize WhatsAppManager
let manager: WhatsAppManager;
try {
  manager = new WhatsAppManager(io);
  console.log("WhatsAppManager initialized successfully");
} catch (err) {
  console.error("Failed to initialize WhatsAppManager:", err);
  manager = new WhatsAppManager(io);
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("wa:subscribe", (payload?: { clientId?: string }) => {
    const clientId = payload?.clientId || "default";
    socket.join(clientId);
    const state = manager.getState(clientId);
    socket.emit("wa:state", { clientId, status: state.status, updatedAt: state.updatedAt, lastError: state.lastError });
    console.log(`[${clientId}] Socket ${socket.id} subscribed`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ==================== ROUTES ====================

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Debug endpoint
app.get("/debug", (_req, res) => {
  res.json({
    status: "running",
    node: process.version,
    env: NODE_ENV,
    port: PORT,
    uptime: process.uptime(),
    cors: CORS_ORIGIN,
  });
});

// ==================== WhatsApp Routes ====================

// Connect to WhatsApp
app.post("/whatsapp/connect", async (req, res) => {
  const clientId = req.body?.clientId || "default";

  if (typeof clientId !== "string" || clientId.length > 50) {
    return res.status(400).json({ status: "error", message: "clientId غير صالح" });
  }

  try {
    const state = await manager.connect(clientId);
    res.json(state);
  } catch (err) {
    console.error(`[${clientId}] /whatsapp/connect error`, err);
    res.status(500).json({ status: "error", message: "فشل إنشاء الاتصال" });
  }
});

// Get WhatsApp status
app.get("/whatsapp/status/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ status: state.status, lastError: state.lastError, updatedAt: state.updatedAt });
});

// Get QR code
app.get("/whatsapp/qr/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ qrDataUrl: state.qrDataUrl });
});

// Reset session
app.delete("/whatsapp/session/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    const state = await manager.resetSession(clientId);
    res.json(state);
  } catch (err) {
    console.error(`[${clientId}] reset error`, err);
    res.status(500).json({ status: "error", message: "تعذر إعادة التعيين" });
  }
});

// Get chats list
app.get("/whatsapp/chats/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    const client = manager.ensureReadyClient(clientId);
    const chats = await client.getChats();
    const simplified = chats.map((chat) => ({
      id: chat.id._serialized,
      name: (chat as any).name || (chat as any).formattedTitle || "بدون اسم",
      isGroup: (chat as any).isGroup ?? false,
      unreadCount: (chat as any).unreadCount ?? 0,
    }));
    res.json({ chats: simplified });
  } catch (err: any) {
    console.error(`[${clientId}] list chats error`, err);
    res.status(400).json({ message: err?.message || "تعذر جلب المحادثات" });
  }
});

// Get messages
app.get("/whatsapp/messages/:clientId/:chatId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  const chatId = req.params.chatId;

  if (!chatId) {
    return res.status(400).json({ message: "chatId مفقود" });
  }

  try {
    const client = manager.ensureReadyClient(clientId);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const simplified = messages
      .map((m) => ({
        id: m.id._serialized,
        body: m.body,
        fromMe: m.fromMe,
        timestamp: m.timestamp,
        type: m.type,
        author: (m as any).author || undefined,
      }))
      .reverse();
    res.json({ messages: simplified });
  } catch (err: any) {
    console.error(`[${clientId}] list messages error`, err);
    res.status(400).json({ message: err?.message || "تعذر جلب الرسائل" });
  }
});

// Send message
app.post("/whatsapp/send", async (req, res) => {
  const clientId = req.body?.clientId || "default";
  const chatId = req.body?.chatId;
  const message = req.body?.message;

  if (!chatId || !message) {
    return res.status(400).json({ message: "chatId أو message مفقود" });
  }

  try {
    const client = manager.ensureReadyClient(clientId);
    await client.sendMessage(chatId, message);
    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[${clientId}] send message error`, err);
    res.status(400).json({ message: err?.message || "تعذر إرسال الرسالة" });
  }
});

// Send by phone
app.post("/messages/send", async (req, res) => {
  const clientId = req.body?.clientId || "default";
  const to = req.body?.to;
  const text = req.body?.text;

  if (!to || typeof to !== "string") {
    return res.status(400).json({ ok: false, message: "رقم الهاتف (to) مطلوب" });
  }

  if (!text || typeof text !== "string") {
    return res.status(400).json({ ok: false, message: "نص الرسالة (text) مطلوب" });
  }

  const state = manager.getState(clientId);
  if (state.status !== "ready") {
    return res.status(400).json({
      ok: false,
      message: "العميل غير متصل، يرجى الاتصال أولاً",
      status: state.status
    });
  }

  try {
    const result = await manager.sendMessage(clientId, to, text);
    res.json(result);
  } catch (err: any) {
    console.error(`[${clientId}] /messages/send error`, err);
    res.status(500).json({ ok: false, message: err?.message || "تعذر إرسال الرسالة" });
  }
});

// ==================== Error Handling ====================

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "الصفحة غير موجودة" });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "خطأ داخلي في الخادم" });
});

// ==================== Start Server ====================

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           WhatsApp CRM API Server Started                 ║
╠═══════════════════════════════════════════════════════════╣
║  URL: http://0.0.0.0:${PORT}                                 ║
║  Environment: ${NODE_ENV.padEnd(42)}║
║  Node: ${process.version.padEnd(50)}║
║  CORS: ${CORS_ORIGIN.padEnd(50)}║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Handle process events
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
