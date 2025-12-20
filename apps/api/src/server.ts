import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";

dotenv.config();

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

console.log("=== SERVER STARTING ===");
console.log("PORT:", PORT);
console.log("NODE_ENV:", NODE_ENV);

const app = express();

// CORS
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

app.use(express.json({ limit: "10mb" }));

// Create HTTP server
const httpServer = http.createServer(app);

// Socket.io with proper CORS
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Initialize WhatsAppManager
let manager: WhatsAppManager;
try {
  manager = new WhatsAppManager(io);
  console.log("WhatsAppManager initialized successfully");
} catch (err) {
  console.error("Failed to initialize WhatsAppManager:", err);
  process.exit(1);
}

// Socket.io events
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("wa:subscribe", (payload?: { clientId?: string }) => {
    const clientId = payload?.clientId || "default";
    socket.join(clientId);
    const state = manager.getState(clientId);
    socket.emit("wa:state", state);
    console.log(`[${clientId}] Socket subscribed`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ========== ROUTES ==========

app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT, timestamp: new Date().toISOString() });
});

app.get("/debug", (req, res) => {
  res.json({
    status: "running",
    port: PORT,
    env: NODE_ENV,
    node: process.version,
    uptime: process.uptime(),
  });
});

// WhatsApp status
app.get("/whatsapp/status/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ status: state.status, lastError: state.lastError, updatedAt: state.updatedAt });
});

// Connect WhatsApp
app.post("/whatsapp/connect", async (req, res) => {
  const clientId = req.body?.clientId || "default";
  try {
    const state = await manager.connect(clientId);
    res.json(state);
  } catch (err: any) {
    console.error(`[${clientId}] Connect error:`, err);
    res.status(500).json({ status: "error", message: err?.message || "Connection failed" });
  }
});

// Get QR
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
  } catch (err: any) {
    console.error(`[${clientId}] Reset error:`, err);
    res.status(500).json({ status: "error", message: err?.message || "Reset failed" });
  }
});

// Get chats
app.get("/whatsapp/chats/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    const client = manager.ensureReadyClient(clientId);
    const chats = await client.getChats();
    const simplified = chats.map((chat) => ({
      id: chat.id._serialized,
      name: (chat as any).name || "بدون اسم",
      isGroup: (chat as any).isGroup ?? false,
    }));
    res.json({ chats: simplified });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Failed to get chats" });
  }
});

// Send message
app.post("/whatsapp/send", async (req, res) => {
  const { clientId = "default", chatId, message } = req.body;
  if (!chatId || !message) {
    return res.status(400).json({ message: "chatId and message required" });
  }
  try {
    const client = manager.ensureReadyClient(clientId);
    await client.sendMessage(chatId, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Failed to send" });
  }
});

// Send by phone
app.post("/messages/send", async (req, res) => {
  const { clientId = "default", to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ ok: false, message: "to and text required" });
  }
  try {
    const result = await manager.sendMessage(clientId, to, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send" });
  }
});

// Get messages for a chat
app.get("/whatsapp/messages/:clientId/:chatId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  const chatId = req.params.chatId;

  if (!chatId) {
    return res.status(400).json({ message: "chatId required" });
  }

  try {
    const client = manager.ensureReadyClient(clientId);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const simplified = messages.map((m) => ({
      id: m.id._serialized,
      body: m.body,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
      type: m.type,
    })).reverse();
    res.json({ messages: simplified });
  } catch (err: any) {
    console.error(`[${clientId}] Get messages error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get messages" });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log("Ready for connections!");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
