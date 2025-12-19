import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;

const app = express();

// إضافة CORS headers يدوياً قبل أي middleware آخر
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");

  // معالجة preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

// cors middleware كـ backup
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (_origin, callback) => {
      callback(null, true); // السماح لجميع المواقع للـ WebSocket
    },
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  },
});

const manager = new WhatsAppManager(io);

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("wa:subscribe", (payload?: { clientId?: string }) => {
    const clientId = payload?.clientId || "default";
    socket.join(clientId);
    const state = manager.getState(clientId);
    socket.emit("wa:state", { clientId, status: state.status, updatedAt: state.updatedAt, lastError: state.lastError });
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/whatsapp/connect", async (req, res) => {
  const clientId = req.body?.clientId || "default";
  try {
    const state = await manager.connect(clientId);
    res.json(state);
  } catch (err) {
    console.error(`[${clientId}] /whatsapp/connect error`, err);
    res.status(500).json({ status: "error", message: "فشل إنشاء الاتصال" });
  }
});

app.get("/whatsapp/status/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ status: state.status, lastError: state.lastError, updatedAt: state.updatedAt });
});

app.get("/whatsapp/qr/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ qrDataUrl: state.qrDataUrl });
});

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
      .reverse(); // أحدث في النهاية
    res.json({ messages: simplified });
  } catch (err: any) {
    console.error(`[${clientId}] list messages error`, err);
    res.status(400).json({ message: err?.message || "تعذر جلب الرسائل" });
  }
});

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

// معالجة الأخطاء غير المتوقعة لمنع crash
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`API server listening on http://0.0.0.0:${PORT}`);
  console.log(`CORS enabled for all origins`);
  console.log(`Node version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
