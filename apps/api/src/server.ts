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

// Bot Configuration
app.get("/bot/config/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const config = manager.getBotConfig(clientId);
  res.json(config);
});

app.post("/bot/config", (req, res) => {
  const { clientId = "default", systemPrompt, apiKey, enabled } = req.body;
  manager.setBotConfig(clientId, { systemPrompt, apiKey, enabled });
  res.json({ ok: true });
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

// ========== CRM / CUSTOMERS API ==========
const customersStore = new Map<string, any[]>();
customersStore.set("default", [
  { id: "1", name: "أحمد محمد", phone: "+201234567890", email: "ahmed@example.com", status: "active", notes: "عميل مميز", createdAt: new Date().toISOString().split("T")[0], lastContact: new Date().toISOString().split("T")[0] },
]);

app.get("/api/customers", (req, res) => {
  const customers = customersStore.get("default") || [];
  res.json({ customers });
});

app.post("/api/customers", (req, res) => {
  const { name, phone, email, status, notes } = req.body;
  const customers = customersStore.get("default") || [];
  const newCustomer = {
    id: Date.now().toString(),
    name, phone, email, status: status || "pending", notes: notes || "",
    createdAt: new Date().toISOString().split("T")[0],
    lastContact: new Date().toISOString().split("T")[0],
  };
  customers.unshift(newCustomer);
  customersStore.set("default", customers);
  res.json({ ok: true, customer: newCustomer });
});

app.put("/api/customers/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const customers = customersStore.get("default") || [];
  const idx = customers.findIndex((c) => c.id === id);
  if (idx !== -1) {
    customers[idx] = { ...customers[idx], ...updates, lastContact: new Date().toISOString().split("T")[0] };
    customersStore.set("default", customers);
    res.json({ ok: true, customer: customers[idx] });
  } else {
    res.status(404).json({ message: "Customer not found" });
  }
});

app.delete("/api/customers/:id", (req, res) => {
  const { id } = req.params;
  let customers = customersStore.get("default") || [];
  customers = customers.filter((c) => c.id !== id);
  customersStore.set("default", customers);
  res.json({ ok: true });
});

// ========== CONTACTS API ==========
const contactsStore = new Map<string, any[]>();
contactsStore.set("default", [
  { id: "1", name: "أحمد محمد", phone: "+201234567890", email: "ahmed@email.com", group: "عملاء VIP", lastMessage: "", avatar: "👤" },
]);

app.get("/api/contacts", (req, res) => {
  const contacts = contactsStore.get("default") || [];
  res.json({ contacts });
});

app.post("/api/contacts", (req, res) => {
  const { name, phone, email, group } = req.body;
  const contacts = contactsStore.get("default") || [];
  const newContact = { id: Date.now().toString(), name, phone, email, group: group || "عملاء جدد", lastMessage: "", avatar: "👤" };
  contacts.unshift(newContact);
  contactsStore.set("default", contacts);
  res.json({ ok: true, contact: newContact });
});

app.put("/api/contacts/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const contacts = contactsStore.get("default") || [];
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx !== -1) {
    contacts[idx] = { ...contacts[idx], ...updates };
    contactsStore.set("default", contacts);
    res.json({ ok: true, contact: contacts[idx] });
  } else {
    res.status(404).json({ message: "Contact not found" });
  }
});

app.delete("/api/contacts/:id", (req, res) => {
  const { id } = req.params;
  let contacts = contactsStore.get("default") || [];
  contacts = contacts.filter((c) => c.id !== id);
  contactsStore.set("default", contacts);
  res.json({ ok: true });
});

// ========== SETTINGS API ==========
const settingsStore = new Map<string, any>();
settingsStore.set("default", {
  companyName: "شركتي",
  welcomeMessage: "مرحباً بك! كيف يمكنني مساعدتك؟",
  autoReply: true,
  notifyNewMessage: true,
  notifyNewCustomer: true,
  language: "ar",
  theme: "light",
});

app.get("/api/settings", (req, res) => {
  const settings = settingsStore.get("default") || {};
  res.json(settings);
});

app.post("/api/settings", (req, res) => {
  const newSettings = req.body;
  settingsStore.set("default", newSettings);
  res.json({ ok: true });
});

// ========== THREADS API ==========
const threadsStore = new Map<string, any[]>();
threadsStore.set("default", [
  { id: "1", title: "مشكلة في الطلب #1234", customer: "أحمد محمد", status: "open", priority: "high", messages: 5, lastUpdate: new Date().toISOString() },
]);

app.get("/api/threads", (req, res) => {
  const threads = threadsStore.get("default") || [];
  res.json({ threads });
});

app.post("/api/threads", (req, res) => {
  const { title, customer, priority } = req.body;
  const threads = threadsStore.get("default") || [];
  const newThread = { id: Date.now().toString(), title, customer, status: "open", priority: priority || "medium", messages: 0, lastUpdate: new Date().toISOString() };
  threads.unshift(newThread);
  threadsStore.set("default", threads);
  res.json({ ok: true, thread: newThread });
});

app.put("/api/threads/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const threads = threadsStore.get("default") || [];
  const idx = threads.findIndex((t) => t.id === id);
  if (idx !== -1) {
    threads[idx] = { ...threads[idx], ...updates, lastUpdate: new Date().toISOString() };
    threadsStore.set("default", threads);
    res.json({ ok: true, thread: threads[idx] });
  } else {
    res.status(404).json({ message: "Thread not found" });
  }
});

app.delete("/api/threads/:id", (req, res) => {
  const { id } = req.params;
  let threads = threadsStore.get("default") || [];
  threads = threads.filter((t) => t.id !== id);
  threadsStore.set("default", threads);
  res.json({ ok: true });
});

// ========== REPORTS API ==========
app.get("/api/reports/stats", (req, res) => {
  const customers = customersStore.get("default") || [];
  const threads = threadsStore.get("default") || [];
  const contacts = contactsStore.get("default") || [];

  res.json({
    totalCustomers: customers.length,
    activeCustomers: customers.filter((c) => c.status === "active").length,
    totalContacts: contacts.length,
    openThreads: threads.filter((t) => t.status === "open").length,
    pendingThreads: threads.filter((t) => t.status === "pending").length,
  });
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

