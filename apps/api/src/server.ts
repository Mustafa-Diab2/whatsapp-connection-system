import http from "http";
import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import { db } from "./lib/supabase";
import authRoutes, { verifyToken } from "./routes/auth";
import documentsRoutes from "./routes/documents";
import campaignsRoutes from "./routes/campaigns";
import dealsRoutes from "./routes/deals";

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

// Middleware to inject manager
app.use((req, res, next) => {
  (req as any).whatsappManager = manager;
  next();
});

// Socket.io events
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Authentication for socket needs to be handled
  // For now we assume client sends organizationId as clientId

  socket.on("wa:subscribe", (payload?: { clientId?: string }) => {
    // SECURITY: Should verify token here in production
    const clientId = payload?.clientId || "default";
    socket.join(clientId);

    try {
      // Create session if not exists (in-memory)
      // manager.ensureReadyClient(clientId); --> No, don't auto connect, just get state
      const state = manager.getState(clientId);
      socket.emit("wa:state", state);
      console.log(`[${clientId}] Socket subscribed`);
    } catch (e) {
      console.error(`Status check failed for ${clientId}`, e);
    }
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
  res.json({ status: "ok", message: "WhatsApp CRM API with Supabase (Multi-tenant)" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes - support both paths for compatibility
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/deals", dealsRoutes);

// Helper to extract orgId
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId;
};

// Apply verifyToken middleware to all API routes below
// Note: Some WhatsApp routes might need to be open for webhooks, but here we secure everything for the frontend
// We'll apply verifyToken to specific blocks to be safe

// ========== WHATSAPP ROUTES (Secured) ==========

// Status - Public/Protected?
app.get("/whatsapp/status/:clientId", verifyToken, (req, res) => {
  const clientId = req.params.clientId || "default";
  // Verify access? clientId should match orgId basically
  const orgId = getOrgId(req);
  if (clientId !== orgId && clientId !== 'default') {
    // In strict mode we deny, but for migration allow mismatch or 'default'
  }

  const state = manager.getState(clientId);
  res.json(state);
});

// Initialize
app.post("/whatsapp/init/:clientId", verifyToken, async (req, res) => {
  const clientId = req.params.clientId || "default";
  try {
    await manager.connect(clientId);
    res.json({ ok: true, message: "Initialization started" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to initialize" });
  }
});

// Connect (alias for init with default clientId)
app.post("/whatsapp/connect", verifyToken, async (req, res) => {
  // Use organizationId as clientId!
  const orgId = getOrgId(req);
  console.log(`User connecting for Org: ${orgId}`);

  try {
    await manager.connect(orgId);
    res.json({ ok: true, message: "Connection started", clientId: orgId });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to connect" });
  }
});

// Send message
app.post("/whatsapp/send", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, message } = req.body;
  try {
    // Log message for this org
    // await db.saveMessage({ ... }) -> This should happen in manager? 
    // Manager handles events. We need to make sure Manager puts data in correct org.
    // For now, manager is in-memory.

    await manager.sendMessage(orgId, chatId, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send message" });
  }
});

app.post("/whatsapp/send-media", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, base64, mimetype, filename, caption } = req.body;
  try {
    await manager.sendMediaMessage(orgId, chatId, base64, mimetype, filename, caption);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send media" });
  }
});

// Destroy session (logout)
app.post("/whatsapp/logout", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    await manager.resetSession(orgId);
    res.json({ ok: true, message: "Logged out" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to logout" });
  }
});

// Reset session
app.post("/whatsapp/reset", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    await manager.resetSession(orgId);
    res.json({ ok: true, message: "Session reset" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to reset" });
  }
});

// Get chats
app.get("/whatsapp/chats", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const client = manager.ensureReadyClient(orgId);
    const chats = await client.getChats();
    const simplified = chats.slice(0, 50).map((c) => ({
      id: c.id._serialized,
      name: c.name || c.id.user,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
    }));
    res.json({ chats: simplified });
  } catch (err: any) {
    console.error(`[${orgId}] Get chats error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get chats" });
  }
});

// Get messages for a chat
app.get("/whatsapp/messages/:chatId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const chatId = req.params.chatId;

  if (!chatId) {
    return res.status(400).json({ message: "chatId required" });
  }

  try {
    const client = manager.ensureReadyClient(orgId);
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
    console.error(`[${orgId}] Get messages error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get messages" });
  }
});

// ========== BOT CONFIG ==========
app.get("/bot/config", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    // We use orgId as clientId for consistency
    const config = await db.getBotConfig(orgId, orgId);
    res.json(config);
  } catch (err: any) {
    const config = manager.getBotConfig(orgId);
    res.json(config);
  }
});

app.post("/bot/config", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { systemPrompt, apiKey, enabled } = req.body;
  try {
    await db.updateBotConfig(orgId, {
      system_prompt: systemPrompt,
      api_key: apiKey,
      enabled,
      organization_id: orgId
    });
    manager.setBotConfig(orgId, { systemPrompt, apiKey, enabled });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save bot config:", err);
    manager.setBotConfig(orgId, { systemPrompt, apiKey, enabled });
    res.json({ ok: true, warning: "Saved to memory only" });
  }
});

// Bot Activity
app.get("/bot/activity", verifyToken, (req, res) => {
  const orgId = getOrgId(req);
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    // Manager needs to support filtering activities by clientId
    // For now we get all (WARNING: Data leak if manager.getBotActivities doesn't filter)
    // We need to implement filtering in Manager. Assuming we will.
    const activities = manager.getBotActivities(limit); // TODO: Pass orgId
    res.json({ activities });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get activities" });
  }
});

// Test Bot
app.post("/bot/test", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ ok: false, message: "message required" });
  }
  try {
    const result = await manager.testBotResponse(orgId, message);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to test bot" });
  }
});

// ========== CRM / CUSTOMERS API (Supabase) ==========
app.get("/api/customers", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const customers = await db.getCustomers(orgId);
    res.json({ customers });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customers" });
  }
});

app.post("/api/customers", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { name, phone, email, status, notes } = req.body;
  try {
    const customer = await db.createCustomer({ name, phone, email, status, notes, organization_id: orgId });
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create customer" });
  }
});

app.put("/api/customers/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    // TODO: Verify ownership
    const customer = await db.updateCustomer(id, updates);
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update customer" });
  }
});

app.delete("/api/customers/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    // TODO: Verify ownership
    await db.deleteCustomer(id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to delete customer" });
  }
});

// ========== CONTACTS API (Supabase) ==========
app.get("/api/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const contacts = await db.getContacts(orgId);
    res.json({ contacts });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get contacts" });
  }
});

app.post("/api/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { name, phone, email, group } = req.body;
  try {
    const contact = await db.createContact({ name, phone, email, group_name: group, organization_id: orgId });
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create contact" });
  }
});

app.put("/api/contacts/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // Handle group format mismatch
  if (updates.group) {
    updates.group_name = updates.group;
    delete updates.group;
  }
  try {
    const contact = await db.updateContact(id, updates);
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update contact" });
  }
});

app.delete("/api/contacts/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteContact(id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to delete contact" });
  }
});

// ========== SETTINGS API (Supabase) ==========
app.get("/api/settings", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    console.log("Getting settings for Org:", orgId);
    const settings = await db.getSettings(orgId);
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

app.post("/api/settings", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { companyName, welcomeMessage, language, theme, notifyNewMessage, notifyNewCustomer } = req.body;
  try {
    await db.updateSettings("general", { companyName, welcomeMessage, language, theme }, orgId);
    await db.updateSettings("notifications", { notifyNewMessage, notifyNewCustomer }, orgId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save settings:", err);
    res.status(500).json({ message: err?.message || "Failed to save settings" });
  }
});

// ========== THREADS API (Supabase) ==========
app.get("/api/threads", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const threads = await db.getThreads(orgId);
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
    res.status(500).json({ message: err?.message || "Failed to get threads" });
  }
});

app.post("/api/threads", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { title, customer, priority } = req.body;
  try {
    const thread = await db.createThread({ title, customer_name: customer, priority, organization_id: orgId });
    res.json({ ok: true, thread });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create thread" });
  }
});

// ========== ANALYTICS / REPORTS API (Supabase) ==========
app.get("/api/reports/stats", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const stats = await db.getAnalyticsStats(orgId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get stats" });
  }
});

app.get("/api/reports/daily", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const days = parseInt(req.query.days as string) || 7;
  try {
    const analytics = await db.getDailyAnalytics(days, orgId);
    res.json({ analytics });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get analytics" });
  }
});

// ========== AI AGENTS API ==========
app.get("/api/agents", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const agents = await db.getAgents(orgId);
    res.json(agents);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get agents" });
  }
});

app.post("/api/agents", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { name, description, systemPrompt, model } = req.body;
  try {
    const agent = await db.createAgent({
      name,
      description,
      system_prompt: systemPrompt,
      model,
      organization_id: orgId
    });
    res.json({ ok: true, agent });
  } catch (err: any) {
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
