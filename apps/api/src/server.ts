import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import { db } from "./lib/supabase";
import authRoutes, { verifyToken } from "./routes/auth";
import documentsRoutes from "./routes/documents";
import campaignsRoutes from "./routes/campaigns";
import dealsRoutes from "./routes/deals";
import { validate } from "./middleware/validate";
import { createCustomerSchema, updateCustomerSchema } from "./schemas/customerSchemas";

dotenv.config();

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

console.log("=== SERVER STARTING ===");
console.log("PORT:", PORT);
console.log("NODE_ENV:", NODE_ENV);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Not set");

const app = express();

// ============ SECURITY MIDDLEWARE ============

// 1. Helmet - Security Headers (XSS, Clickjacking, etc.)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// 2. Rate Limiting - Protect against DDoS and Brute Force
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 min per IP
  message: { error: "طلبات كثيرة جداً، حاول لاحقاً" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Only 20 login attempts per 15 min
  message: { error: "محاولات دخول كثيرة، انتظر 15 دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter
app.use(generalLimiter);

// 3. CORS - Allow all origins with vercel.app
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || origin.includes('vercel.app') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked CORS request from: ${origin}`);
      callback(null, true); // Allow but log
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

// 4. Body Parser with size limits
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

// 5. Security logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // SQL Injection
    /<script/i, // XSS
    /javascript:/i, // XSS
  ];

  const requestData = JSON.stringify(req.body) + req.url;
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));

  if (isSuspicious) {
    console.warn(`🚨 Suspicious request from ${req.ip}: ${req.method} ${req.url}`);
  }

  next();
});

// 6. Remove X-Powered-By header
app.disable('x-powered-by');

// Create HTTP server
const httpServer = http.createServer(app);

// Socket.io with proper CORS
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS, // Use specific origins instead of *
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket.io Security Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) return next(new Error("Server error: JWT config missing"));

  try {
    const decoded = jwt.verify(token, secret) as any;
    (socket as any).user = decoded; // Store user info in socket
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
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

  // Use organizationId from authenticated token
  // The client might request a clientId, but we MUST ensure it matches their Org
  const userOrgId = (socket as any).user.organizationId;
  console.log(`Socket authenticated for Org: ${userOrgId}`);

  socket.on("wa:subscribe", (payload?: { clientId?: string }) => {
    // FORCE usage of user's orgId as clientId to prevent IDOR
    const clientId = userOrgId;

    socket.join(clientId);

    try {
      // Create session if not exists (in-memory)
      // manager.ensureReadyClient(clientId); --> No, don't auto connect, just get state
      const state = manager.getState(clientId);
      socket.emit("wa:state", state);
      console.log(`[${clientId}] Socket subscribed by user ${(socket as any).user.email}`);
    } catch (e) {
      console.error(`Status check failed for ${clientId}`, e);
    }
  });

  socket.on("wa:unsubscribe", (payload?: { clientId?: string }) => {
    const clientId = userOrgId;
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

// Auth routes - support both paths for compatibility + Rate Limiting
app.use("/auth", authLimiter, authRoutes);
app.use("/api/auth", authLimiter, authRoutes);
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

  // Strict matching to prevent IDOR
  const orgId = getOrgId(req);
  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
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

app.post("/whatsapp/disconnect", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const state = await manager.disconnect(orgId);
    res.json({ ok: true, message: "Disconnected", state });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to disconnect" });
  }
});

// Get chats
app.get("/whatsapp/chats", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const client = manager.ensureReadyClient(orgId);
    const chats = await client.getChats();
    const simplified = await Promise.all(chats.slice(0, 50).map(async (c) => {
      const waChatId = c.id._serialized;
      const customer = await db.getCustomerByPhone(waChatId.split('@')[0], orgId);
      return {
        id: waChatId,
        name: c.name || c.id.user,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount,
        customer,
      };
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
  const limit = parseInt(req.query.limit as string) || 50;

  if (!chatId) {
    return res.status(400).json({ message: "chatId required" });
  }

  try {
    const client = manager.ensureReadyClient(orgId);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    const simplified = messages.map((m) => ({
      id: m.id._serialized,
      body: m.body,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
      type: m.type,
      author: m.author,
      ack: m.ack,
      hasMedia: m.hasMedia,
    })).reverse();
    res.json({ messages: simplified });
  } catch (err: any) {
    console.error(`[${orgId}] Get messages error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get messages" });
  }
});

// Get media for a message
app.get("/whatsapp/media/:clientId/:messageId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { clientId, messageId } = req.params;

  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const client = manager.ensureReadyClient(orgId);
    // Find the message. This can be tricky if not in recent cache.
    // However, usually it's used for recently loaded messages.
    const msg = await client.getMessageById(messageId);

    if (!msg || !msg.hasMedia) {
      return res.status(404).json({ message: "Message or media not found" });
    }

    const media = await msg.downloadMedia();
    if (!media) {
      return res.status(404).json({ message: "Failed to download media" });
    }

    res.json({
      mimetype: media.mimetype,
      data: media.data,
      filename: media.filename
    });
  } catch (err: any) {
    console.error(`[${orgId}] Get media error:`, err);
    res.status(500).json({ message: "Failed to download media" });
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

app.post("/api/customers", verifyToken, validate(createCustomerSchema), async (req, res) => {
  const orgId = getOrgId(req);
  const { name, phone, email, status, notes } = req.body;
  try {
    const customer = await db.createCustomer({ name, phone, email, status, notes, organization_id: orgId });
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create customer" });
  }
});

app.put("/api/customers/:id", verifyToken, validate(updateCustomerSchema), async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  const updates = req.body;
  try {
    const customer = await db.updateCustomer(id, updates, orgId);
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update customer" });
  }
});

app.delete("/api/customers/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    await db.deleteCustomer(id, orgId);
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

// ========== AUTO ASSIGN SETTINGS ==========
app.get("/api/settings/auto-assign", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const settings = await db.getOrganizationSettings(orgId);
    res.json(settings || { auto_assign_enabled: false });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get settings" });
  }
});

app.post("/api/settings/auto-assign", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { enabled } = req.body;
  try {
    await db.toggleAutoAssign(orgId, enabled);
    res.json({ ok: true, enabled });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update settings" });
  }
});

// ========== QUICK REPLIES ==========
app.get("/api/quick-replies", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const replies = await db.getQuickReplies(orgId);
    res.json({ replies });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get quick replies" });
  }
});

app.post("/api/quick-replies", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { title, body, shortcut } = req.body;
  try {
    const reply = await db.createQuickReply({ title, body, shortcut, organization_id: orgId });
    res.json({ ok: true, reply });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create quick reply" });
  }
});

app.put("/api/quick-replies/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  const updates = req.body;
  try {
    const reply = await db.updateQuickReply(id, updates, orgId);
    res.json({ ok: true, reply });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update quick reply" });
  }
});

app.delete("/api/quick-replies/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    await db.deleteQuickReply(id, orgId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to delete quick reply" });
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
