import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import { db } from "./lib/supabase";
import authRoutes from "./routes/auth";

dotenv.config();

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

console.log("=== SERVER STARTING ===");
console.log("PORT:", PORT);
console.log("NODE_ENV:", NODE_ENV);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Not set");

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

  socket.on("wa:unsubscribe", (payload?: { clientId?: string }) => {
    const clientId = payload?.clientId || "default";
    socket.leave(clientId);
    console.log(`[${clientId}] Socket unsubscribed`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WhatsApp CRM API with Supabase" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes
app.use("/auth", authRoutes);

// ========== WHATSAPP ROUTES ==========

// Status
app.get("/whatsapp/status/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json(state);
});

// Initialize
app.post("/whatsapp/init/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    await manager.connect(clientId);
    res.json({ ok: true, message: "Initialization started" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to initialize" });
  }
});

// Connect (alias for init with default clientId)
app.post("/whatsapp/connect", async (req, res) => {
  const clientId = req.body.clientId || "default";
  try {
    await manager.connect(clientId);
    res.json({ ok: true, message: "Connection started" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to connect" });
  }
});

// Send message
app.post("/whatsapp/send", async (req, res) => {
  const { clientId = "default", chatId, message } = req.body;
  try {
    await manager.sendMessage(clientId, chatId, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send message" });
  }
});

app.post("/whatsapp/send-media", async (req, res) => {
  const { clientId = "default", chatId, base64, mimetype, filename, caption } = req.body;
  try {
    await manager.sendMediaMessage(clientId, chatId, base64, mimetype, filename, caption);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send media" });
  }
});

// Destroy session (logout)
app.post("/whatsapp/logout/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    await manager.resetSession(clientId);
    res.json({ ok: true, message: "Logged out" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to logout" });
  }
});

// Reset session
app.post("/whatsapp/reset/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    await manager.resetSession(clientId);
    res.json({ ok: true, message: "Session reset" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to reset" });
  }
});

// Get chats
app.get("/whatsapp/chats/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    const client = manager.ensureReadyClient(clientId);
    const chats = await client.getChats();
    const simplified = chats.slice(0, 50).map((c) => ({
      id: c.id._serialized,
      name: c.name || c.id.user,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
    }));
    res.json({ chats: simplified });
  } catch (err: any) {
    console.error(`[${clientId}] Get chats error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get chats" });
  }
});

// Send message
app.post("/whatsapp/send", async (req, res) => {
  const { clientId = "default", chatId, message } = req.body;
  if (!chatId || !message) {
    return res.status(400).json({ ok: false, message: "chatId and message required" });
  }
  try {
    const client = manager.ensureReadyClient(clientId);
    const sent = await client.sendMessage(chatId, message);
    res.json({ ok: true, messageId: sent.id._serialized });
  } catch (err: any) {
    console.error(`[${clientId}] Send error:`, err);
    res.status(500).json({ ok: false, message: err?.message || "Failed to send" });
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

// ========== BOT CONFIG ==========
app.get("/bot/config/:clientId", async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    const config = await db.getBotConfig(clientId);
    res.json(config);
  } catch (err: any) {
    // Fallback to in-memory if Supabase fails
    const config = manager.getBotConfig(clientId);
    res.json(config);
  }
});

app.post("/bot/config", async (req, res) => {
  const { clientId = "default", systemPrompt, apiKey, enabled } = req.body;
  try {
    // Save to Supabase
    await db.updateBotConfig(clientId, {
      system_prompt: systemPrompt,
      api_key: apiKey,
      enabled
    });
    // Also update in-memory for immediate effect
    manager.setBotConfig(clientId, { systemPrompt, apiKey, enabled });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save bot config:", err);
    // Fallback to in-memory only
    manager.setBotConfig(clientId, { systemPrompt, apiKey, enabled });
    res.json({ ok: true, warning: "Saved to memory only" });
  }
});

// Bot Activity - get recent bot interactions
app.get("/bot/activity/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const activities = manager.getBotActivities(limit);
    res.json({ activities });
  } catch (err: any) {
    console.error("Failed to get bot activities:", err);
    res.status(500).json({ message: err?.message || "Failed to get activities" });
  }
});

// Test Bot - test response without sending to WhatsApp
app.post("/bot/test", async (req, res) => {
  const { clientId = "default", message } = req.body;
  if (!message) {
    return res.status(400).json({ ok: false, message: "message required" });
  }
  try {
    const result = await manager.testBotResponse(clientId, message);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("Failed to test bot:", err);
    res.status(500).json({ ok: false, message: err?.message || "Failed to test bot" });
  }
});

// ========== CRM / CUSTOMERS API (Supabase) ==========
app.get("/api/customers", async (req, res) => {
  try {
    const customers = await db.getCustomers();
    res.json({ customers });
  } catch (err: any) {
    console.error("Failed to get customers:", err);
    res.status(500).json({ message: err?.message || "Failed to get customers" });
  }
});

app.post("/api/customers", async (req, res) => {
  const { name, phone, email, status, notes } = req.body;
  try {
    const customer = await db.createCustomer({ name, phone, email, status, notes });
    res.json({ ok: true, customer });
  } catch (err: any) {
    console.error("Failed to create customer:", err);
    res.status(500).json({ message: err?.message || "Failed to create customer" });
  }
});

app.put("/api/customers/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const customer = await db.updateCustomer(id, updates);
    res.json({ ok: true, customer });
  } catch (err: any) {
    console.error("Failed to update customer:", err);
    res.status(500).json({ message: err?.message || "Failed to update customer" });
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteCustomer(id);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to delete customer:", err);
    res.status(500).json({ message: err?.message || "Failed to delete customer" });
  }
});

// ========== CONTACTS API (Supabase) ==========
app.get("/api/contacts", async (req, res) => {
  try {
    const contacts = await db.getContacts();
    res.json({ contacts });
  } catch (err: any) {
    console.error("Failed to get contacts:", err);
    res.status(500).json({ message: err?.message || "Failed to get contacts" });
  }
});

app.post("/api/contacts", async (req, res) => {
  const { name, phone, email, group } = req.body;
  try {
    const contact = await db.createContact({ name, phone, email, group_name: group });
    res.json({ ok: true, contact });
  } catch (err: any) {
    console.error("Failed to create contact:", err);
    res.status(500).json({ message: err?.message || "Failed to create contact" });
  }
});

app.put("/api/contacts/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (updates.group) {
    updates.group_name = updates.group;
    delete updates.group;
  }
  try {
    const contact = await db.updateContact(id, updates);
    res.json({ ok: true, contact });
  } catch (err: any) {
    console.error("Failed to update contact:", err);
    res.status(500).json({ message: err?.message || "Failed to update contact" });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteContact(id);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to delete contact:", err);
    res.status(500).json({ message: err?.message || "Failed to delete contact" });
  }
});

// ========== SETTINGS API (Supabase) ==========
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await db.getSettings();
    // Flatten for frontend
    res.json({
      companyName: settings.general?.companyName || "شركتي",
      welcomeMessage: settings.general?.welcomeMessage || "",
      language: settings.general?.language || "ar",
      theme: settings.general?.theme || "light",
      notifyNewMessage: settings.notifications?.notifyNewMessage ?? true,
      notifyNewCustomer: settings.notifications?.notifyNewCustomer ?? true,
    });
  } catch (err: any) {
    console.error("Failed to get settings:", err);
    res.status(500).json({ message: err?.message || "Failed to get settings" });
  }
});

app.post("/api/settings", async (req, res) => {
  const { companyName, welcomeMessage, language, theme, notifyNewMessage, notifyNewCustomer } = req.body;
  try {
    await db.updateSettings("general", { companyName, welcomeMessage, language, theme });
    await db.updateSettings("notifications", { notifyNewMessage, notifyNewCustomer });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save settings:", err);
    res.status(500).json({ message: err?.message || "Failed to save settings" });
  }
});

// ========== THREADS API (Supabase) ==========
app.get("/api/threads", async (req, res) => {
  try {
    const threads = await db.getThreads();
    // Map to frontend format
    const mapped = threads.map((t) => ({
      id: t.id,
      title: t.title,
      customer: t.customer_name || "Unknown",
      status: t.status,
      priority: t.priority,
      messages: t.messages_count || 0,
      lastUpdate: t.updated_at,
    }));
    res.json({ threads: mapped });
  } catch (err: any) {
    console.error("Failed to get threads:", err);
    res.status(500).json({ message: err?.message || "Failed to get threads" });
  }
});

app.post("/api/threads", async (req, res) => {
  const { title, customer, priority } = req.body;
  try {
    const thread = await db.createThread({ title, customer_name: customer, priority });
    res.json({ ok: true, thread });
  } catch (err: any) {
    console.error("Failed to create thread:", err);
    res.status(500).json({ message: err?.message || "Failed to create thread" });
  }
});

app.put("/api/threads/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const thread = await db.updateThread(id, updates);
    res.json({ ok: true, thread });
  } catch (err: any) {
    console.error("Failed to update thread:", err);
    res.status(500).json({ message: err?.message || "Failed to update thread" });
  }
});

app.delete("/api/threads/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteThread(id);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to delete thread:", err);
    res.status(500).json({ message: err?.message || "Failed to delete thread" });
  }
});

// ========== ANALYTICS / REPORTS API (Supabase) ==========
app.get("/api/reports/stats", async (req, res) => {
  try {
    const stats = await db.getAnalyticsStats();
    res.json(stats);
  } catch (err: any) {
    console.error("Failed to get stats:", err);
    res.status(500).json({ message: err?.message || "Failed to get stats" });
  }
});

app.get("/api/reports/daily", async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  try {
    const analytics = await db.getDailyAnalytics(days);
    res.json({ analytics });
  } catch (err: any) {
    console.error("Failed to get daily analytics:", err);
    res.status(500).json({ message: err?.message || "Failed to get analytics" });
  }
});

// ========== MESSAGES API (Supabase) ==========
app.get("/api/messages/conversation/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  try {
    const messages = await db.getMessagesByConversation(conversationId, limit);
    res.json({ messages });
  } catch (err: any) {
    console.error("Failed to get messages:", err);
    res.status(500).json({ message: err?.message || "Failed to get messages" });
  }
});

// ========== AI AGENTS API ==========
app.get("/api/agents", async (req, res) => {
  try {
    const agents = await db.getAgents();
    res.json(agents);
  } catch (err: any) {
    console.error("Failed to get agents:", err);
    res.status(500).json({ message: err?.message || "Failed to get agents" });
  }
});

app.post("/api/agents", async (req, res) => {
  const { name, description, systemPrompt, model } = req.body;
  try {
    const agent = await db.createAgent({
      name,
      description,
      system_prompt: systemPrompt,
      model
    });
    res.json({ ok: true, agent });
  } catch (err: any) {
    console.error("Failed to create agent:", err);
    res.status(500).json({ message: err?.message || "Failed to create agent" });
  }
});

// ========== 404 ==========
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
