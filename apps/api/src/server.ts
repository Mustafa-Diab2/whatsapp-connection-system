import http from "http";
import express, { Request, Response, NextFunction } from "express";
// Force deploy trigger V2
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import { db, supabase } from "./lib/supabase";
import authRoutes, { verifyToken } from "./routes/auth";
import documentsRoutes from "./routes/documents";
import campaignsRoutes from "./routes/campaigns";
import dealsRouter from "./routes/deals";
import trainingRouter from "./routes/training";
import productRoutes from "./routes/products";
import orderRoutes from "./routes/orders";
import taskRoutes from "./routes/tasks";
import invoiceRoutes from "./routes/invoices";
import facebookRoutes, { createFacebookRoutes } from "./routes/facebook";
import trackingRoutes, { handleTrackingRedirect } from "./routes/tracking";
import paymentsRoutes from "./routes/payments";
import catalogsRoutes from "./routes/catalogs";
import quickRepliesRoutes from "./routes/quick-replies";
import surveysRoutes from "./routes/surveys";
import appointmentsRoutes from "./routes/appointments";
import chatbotBuilderRoutes from "./routes/chatbot-builder";
import aiSalesRoutes from "./routes/ai-sales";
import reportsRoutes from "./routes/reports";
import instagramRoutes from "./routes/instagram";
import messengerRoutes from "./routes/messenger";
import TokenRefreshService from "./services/TokenRefreshService";
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
app.set('trust proxy', 1);

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
  max: 200, // Increased to 200 to allow super-admin operations without 429
  message: { error: "طلبات كثيرة جداً، حاول لاحقاً" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter
app.use(generalLimiter);

// 3. CORS - Allow all origins with vercel.app
app.use(cors({
  origin: (origin, callback) => {
    // Return early if no origin (e.g. server-to-server or Postman)
    if (!origin) return callback(null, true);

    // Allow Vercel deployments (any subdomain), localhost, or explicitly allowed domains
    const isAllowed =
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked CORS request from: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-organization-id", "X-Organization-Id"]
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

// ============ PHONE NUMBER UTILITIES ============
/**
 * Normalize phone number for database storage
 * Returns null if phone is invalid
 */
function normalizePhoneForDB(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digits
  let cleanPhone = String(phone).replace(/\D/g, '');

  // Detect and reject WhatsApp internal LIDs (very long numbers)
  if (cleanPhone.length > 14) {
    // Try to extract Egyptian number
    const egyptMatch = cleanPhone.match(/(20[1][0-9]{9})/);
    if (egyptMatch) {
      cleanPhone = egyptMatch[1];
    }
    // Try to extract Saudi number
    else if (cleanPhone.includes('966')) {
      const saudiMatch = cleanPhone.match(/(966[5][0-9]{8})/);
      if (saudiMatch) {
        cleanPhone = saudiMatch[1];
      } else {
        console.warn(`[normalizePhoneForDB] Invalid LID: ${phone}`);
        return null;
      }
    } else {
      console.warn(`[normalizePhoneForDB] Invalid LID: ${phone}`);
      return null;
    }
  }

  // Egyptian normalization
  if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
    cleanPhone = '20' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
    cleanPhone = '20' + cleanPhone;
  }
  // Saudi normalization
  else if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
    cleanPhone = '966' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
    cleanPhone = '966' + cleanPhone;
  }

  // Validate final length
  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    console.warn(`[normalizePhoneForDB] Invalid length: ${cleanPhone}`);
    return null;
  }

  return cleanPhone;
}

// --- [SCHEMA FIX] Ensure DB Columns Exist ---
async function ensureSchema() {
  try {
    console.log(`[AI] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "✓ Set" : "✗ Missing"}`);

    if (!process.env.GEMINI_API_KEY) {
      console.warn("[AI] Warning: GEMINI_API_KEY is not set. Knowledge Base and AI replies will fail.");
    }

    const { error } = await supabase.rpc('execute_sql', {
      sql_query: `
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE campaigns ADD COLUMN failed_sends INTEGER DEFAULT 0;
          EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'column failed_sends already exists';
          END;
          
          BEGIN
            ALTER TABLE campaigns ADD COLUMN error_message TEXT;
          EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'column error_message already exists';
          END;
          
          BEGIN
            ALTER TABLE deals ADD COLUMN tags TEXT[] DEFAULT '{}';
          EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'column tags already exists in deals table';
          END;

          BEGIN
            ALTER TABLE users ADD COLUMN phone TEXT;
          EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'column phone already exists in users table';
          END;

          BEGIN
            ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;
          EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'column loyalty_points already exists in customers table';
          END;

          -- Create loyalty_transactions if not exists
          IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'loyalty_transactions') THEN
            CREATE TABLE loyalty_transactions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_id UUID REFERENCES organizations(id),
                customer_id UUID REFERENCES customers(id),
                points INTEGER NOT NULL,
                type VARCHAR(20) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          END IF;
        END $$;`
    });

    if (error) {
      console.log("[DB] Schema update via RPC skipped (function might not exist yet). Please run migrations manually.");
    } else {
      console.log("[DB] Schema auto-sync completed.");
    }
  } catch (e: any) {
    console.warn("[DB] Schema check skipped or failed:", e.message);
  }
}
ensureSchema();
// -------------------------------------------

// Socket.io with proper CORS
export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost');

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
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
app.use("/api/deals", dealsRouter);
app.use("/api/training", trainingRouter);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invoices", invoiceRoutes);

// Facebook Integration Routes - Initialize with Socket.io
const facebookRoutesWithIo = createFacebookRoutes(io);
app.use("/api/facebook", facebookRoutesWithIo);
app.use("/webhooks/facebook", facebookRoutesWithIo); // Facebook webhooks (public)

// Tracking Routes
app.use("/api/tracking", trackingRoutes);
app.get("/t/:code", handleTrackingRedirect); // Public short URL redirect

// Payment Routes
app.use("/api/payments", paymentsRoutes);

// Catalog Routes (WhatsApp Shop)
app.use("/api/catalogs", catalogsRoutes);

// Quick Replies Routes
app.use("/api/quick-replies", quickRepliesRoutes);

// Surveys Routes
app.use("/api/surveys", surveysRoutes);

// Appointments Routes
app.use("/api/appointments", appointmentsRoutes);

// Chatbot Builder Routes
app.use("/api/chatbot", chatbotBuilderRoutes);

// AI Sales Assistant Routes
app.use("/api/ai-sales", aiSalesRoutes);

// Reports Routes
app.use("/api/reports", reportsRoutes);

// Instagram DM Routes
app.use("/api/instagram", instagramRoutes);

// Messenger Routes (with authentication)
app.use("/api/messenger", verifyToken, messengerRoutes);

// Helper to extract orgId
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId;
};

// ========== DIAGNOSTICS ==========
app.get("/api/diag", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const results: any = {
      orgId,
      timestamp: new Date().toISOString(),
      env: {
        gemini_api_key_set: !!process.env.GEMINI_API_KEY,
        supabase_url_set: !!process.env.SUPABASE_URL,
      }
    };
    const tables = ['customers', 'contacts', 'campaigns', 'campaign_logs', 'quick_replies', 'deals', 'documents'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      results[table] = error ? `Error: ${error.message}` : 'Table Link OK';
    }
    results.waState = manager.getState(orgId);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== WHATSAPP ROUTES (Secured) ==========

// Status - Public/Protected?
app.get("/whatsapp/status/:clientId", verifyToken, (req, res) => {
  const clientId = req.params.clientId;

  // Strict matching to prevent IDOR
  const orgId = getOrgId(req);
  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
  }

  const state = manager.getState(clientId);
  res.json(state);
});

// QR Code endpoint (for polling fallback)
app.get("/whatsapp/qr/:clientId", verifyToken, (req, res) => {
  const clientId = req.params.clientId;

  // Strict matching to prevent IDOR
  const orgId = getOrgId(req);
  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
  }

  const state = manager.getState(clientId);
  if (state.qrDataUrl) {
    res.json({ qrDataUrl: state.qrDataUrl });
  } else {
    res.json({ qrDataUrl: null, status: state.status });
  }
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

app.post("/whatsapp/send-contact", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, contactId } = req.body;
  try {
    const result = await manager.sendContact(orgId, chatId, contactId);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send contact" });
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

// Reply to message
app.post("/whatsapp/reply", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, content, quotedMessageId } = req.body;
  try {
    const client = manager.ensureReadyClient(orgId);
    await client.sendMessage(chatId, content, { quotedMessageId });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to reply" });
  }
});

// Delete message
app.post("/whatsapp/delete-message", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { messageId, everyone } = req.body;
  try {
    const client = manager.ensureReadyClient(orgId);
    // Note: getMessageById might need implementation in WhatsAppManager or direct client access
    // wwebjs client.getMessageById isn't standard on Client, usually it's on Chat or requires search.
    // However, older versions or extensions might have it. 
    // SAFEST WAY: Load chat -> fetch messages -> find message -> delete.
    // BUT efficient way if available: client.getMessageById(messageId) (if supported by the lib version used)

    // Let's rely on manager having access or client having it.
    // If client.getMessageById is not available, we might fail.
    // Given wwebjs version, let's try direct access if exists, else generic handler.

    const msg = await client.getMessageById(messageId);
    if (msg) {
      await msg.delete(!!everyone);
      res.json({ ok: true });
    } else {
      res.status(404).json({ ok: false, message: "Message not found" });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to delete message" });
  }
});

// Message Info (Read receipts)
app.get("/whatsapp/message-info/:messageId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { messageId } = req.params;
  try {
    const client = manager.ensureReadyClient(orgId);
    const msg = await client.getMessageById(messageId);
    if (msg) {
      const info = await msg.getInfo();
      res.json({ ok: true, info });
    } else {
      res.status(404).json({ ok: false, message: "Message not found" });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to get message info" });
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

app.get("/whatsapp/me", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const client = manager.ensureReadyClient(orgId);
    let profilePicUrl = null;
    try {
      profilePicUrl = await client.getProfilePicUrl(client.info.wid._serialized);
    } catch (e) { }

    res.json({
      ok: true,
      info: {
        pushname: client.info.pushname,
        wid: client.info.wid,
        platform: client.info.platform,
        phone: client.info.wid.user,
        profilePicUrl
      }
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Client not ready" });
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
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 0; // 0 = all

  try {
    const client = manager.ensureReadyClient(orgId);
    const chats = await client.getChats();
    const chatsToProcess = limit > 0 ? chats.slice(0, limit) : chats;

    const simplified = await Promise.all(chatsToProcess.map(async (c) => {
      const waChatId = c.id._serialized;
      let realPhone = waChatId.split('@')[0];
      let name = c.name || c.id.user;

      try {
        const contact = await c.getContact();
        const formatted = await contact.getFormattedNumber();
        const clean = formatted.replace(/\D/g, "");
        const rawNumber = contact.number ? contact.number.replace(/\D/g, "") : "";

        // Choose best phone, avoiding the 4203... LID pattern
        if (clean && clean.length >= 8 && clean.length <= 15 && !clean.startsWith("4203")) {
          realPhone = clean;
        } else if (rawNumber && rawNumber.length >= 8 && rawNumber.length <= 15 && !rawNumber.startsWith("4203")) {
          realPhone = rawNumber;
        } else if (contact.id.user && contact.id.user.length <= 15 && !contact.id.user.startsWith("4203")) {
          realPhone = contact.id.user;
        }

        if (contact.name || contact.pushname) {
          name = contact.name || contact.pushname;
        }
      } catch (e) { }

      const conversation = await db.getOrCreateConversation(waChatId, orgId, undefined, realPhone);
      let customer = conversation.customer;

      // Auto-fix existing customer record if it's an LID
      if (customer && (customer.phone.length > 15 || customer.phone !== realPhone)) {
        customer = await db.updateCustomer(customer.id, { phone: realPhone }, orgId);
        console.log(`[ChatSync] Fixed customer record ${customer.id}: ID -> ${realPhone}`);
      }

      return {
        id: waChatId,
        phone: realPhone, // New field: Clean phone number
        name: name,
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

app.get("/whatsapp/stories", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const stories = await manager.getStories(orgId);
    res.json({ stories });
  } catch (err: any) {
    console.error(`[${orgId}] Get stories error:`, err);
    res.status(500).json({ message: err?.message || "Failed to get stories" });
  }
});

// Get all WhatsApp contacts
app.get("/whatsapp/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    console.log(`[${orgId}] Fetching all WhatsApp contacts...`);
    const contacts = await manager.getAllContacts(orgId);

    res.json({
      ok: true,
      contacts,
      total: contacts.length
    });
  } catch (err: any) {
    console.error(`[${orgId}] Get contacts error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to get contacts"
    });
  }
});

// Get all WhatsApp chats (conversations)
app.get("/whatsapp/chats", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

  try {
    console.log(`[${orgId}] Fetching all WhatsApp chats (limit: ${limit ?? 'none'})...`);
    let chats = await manager.getAllChats(orgId);

    // Apply limit if specified and greater than 0
    if (limit !== undefined && limit > 0) {
      chats = chats.slice(0, limit);
    }

    res.json({
      ok: true,
      chats,
      total: chats.length
    });
  } catch (err: any) {
    console.error(`[${orgId}] Get chats error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to get chats"
    });
  }
});

// Send message to a specific chat by chat ID
app.post("/whatsapp/send-to-chat", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, text } = req.body;

  if (!chatId || !text) {
    return res.status(400).json({
      ok: false,
      message: "chatId and text are required"
    });
  }

  try {
    console.log(`[${orgId}] Sending message to chat: ${chatId}`);
    const result = await manager.sendMessageToChat(orgId, chatId, text);

    res.json({
      ok: true,
      message: "تم إرسال الرسالة بنجاح",
      ...result
    });
  } catch (err: any) {
    console.error(`[${orgId}] Send to chat error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to send message"
    });
  }
});

// Sync WhatsApp contacts to database
app.post("/whatsapp/contacts/sync", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    console.log(`[${orgId}] Starting contact sync...`);
    const result = await manager.syncContactsToDatabase(orgId);

    res.json({
      ok: true,
      message: "تم مزامنة جهات الاتصال بنجاح",
      ...result
    });
  } catch (err: any) {
    console.error(`[${orgId}] Sync contacts error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to sync contacts"
    });
  }
});

// Sync WhatsApp chats to database with proper chat_id (wa_chat_id)
// This is CRITICAL for campaign sending - stores proper @c.us/@g.us IDs
app.post("/whatsapp/chats/sync", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    console.log(`[${orgId}] Starting chat sync to database (wa_chat_id)...`);
    const result = await manager.syncAllChatsToDatabase(orgId);

    res.json({
      ok: true,
      message: "تم مزامنة المحادثات بنجاح مع معرفات الإرسال الصحيحة",
      ...result
    });
  } catch (err: any) {
    console.error(`[${orgId}] Sync chats error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to sync chats"
    });
  }
});

// Clean invalid phone numbers from database
app.post("/whatsapp/contacts/clean", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { dryRun = true, fix = false } = req.body;

  try {
    console.log(`[${orgId}] Starting phone cleanup (dryRun: ${dryRun}, fix: ${fix})...`);

    const VALID_PATTERNS = [
      /(20[1][0-9]{9})/,
      /(966[5][0-9]{8})/,
      /(971[5][0-9]{8})/,
      /(965[569][0-9]{7})/,
      /(968[79][0-9]{7})/,
      /(974[3567][0-9]{7})/,
      /(973[3][0-9]{7})/,
      /(962[7][0-9]{8})/,
      /(961[3-9][0-9]{7})/,
      /(212[6-7][0-9]{8})/,
      /(213[5-7][0-9]{8})/,
      /(216[2-9][0-9]{7})/,
    ];

    const isValidPhone = (phone: string): boolean => {
      const clean = phone.replace(/\D/g, '');
      if (clean.length < 10 || clean.length > 15) return false;
      if (clean.startsWith('4203') || clean.startsWith('4204')) return false;
      return true;
    };

    const extractValidPhone = (phone: string): string | null => {
      const clean = phone.replace(/\D/g, '');
      if (clean.length >= 10 && clean.length <= 15) return clean;

      for (const pattern of VALID_PATTERNS) {
        const match = clean.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    const stats = {
      customers: { total: 0, invalid: 0, fixed: 0, deleted: 0 },
      contacts: { total: 0, invalid: 0, fixed: 0, deleted: 0 }
    };

    // Clean customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id, phone, name')
      .eq('organization_id', orgId);

    stats.customers.total = customers?.length || 0;

    for (const customer of customers || []) {
      if (!customer.phone) continue;

      if (!isValidPhone(customer.phone)) {
        stats.customers.invalid++;

        if (fix) {
          const extracted = extractValidPhone(customer.phone);
          if (extracted) {
            if (!dryRun) {
              await supabase
                .from('customers')
                .update({ phone: extracted, updated_at: new Date().toISOString() })
                .eq('id', customer.id);
            }
            stats.customers.fixed++;
          } else {
            if (!dryRun) {
              await supabase.from('customers').delete().eq('id', customer.id);
            }
            stats.customers.deleted++;
          }
        } else {
          if (!dryRun) {
            await supabase.from('customers').delete().eq('id', customer.id);
          }
          stats.customers.deleted++;
        }
      }
    }

    // Clean contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, phone, name')
      .eq('organization_id', orgId);

    stats.contacts.total = contacts?.length || 0;

    for (const contact of contacts || []) {
      if (!contact.phone) continue;

      if (!isValidPhone(contact.phone)) {
        stats.contacts.invalid++;

        if (fix) {
          const extracted = extractValidPhone(contact.phone);
          if (extracted) {
            if (!dryRun) {
              await supabase
                .from('contacts')
                .update({ phone: extracted, updated_at: new Date().toISOString() })
                .eq('id', contact.id);
            }
            stats.contacts.fixed++;
          } else {
            if (!dryRun) {
              await supabase.from('contacts').delete().eq('id', contact.id);
            }
            stats.contacts.deleted++;
          }
        } else {
          if (!dryRun) {
            await supabase.from('contacts').delete().eq('id', contact.id);
          }
          stats.contacts.deleted++;
        }
      }
    }

    const totalInvalid = stats.customers.invalid + stats.contacts.invalid;
    const totalFixed = stats.customers.fixed + stats.contacts.fixed;
    const totalDeleted = stats.customers.deleted + stats.contacts.deleted;

    console.log(`[${orgId}] Cleanup complete: ${totalInvalid} invalid, ${totalFixed} fixed, ${totalDeleted} deleted`);

    res.json({
      ok: true,
      message: dryRun
        ? `تم الفحص: ${totalInvalid} رقم غير صالح (${totalFixed} يمكن إصلاحها، ${totalDeleted} سيتم حذفها)`
        : `تم التنظيف: ${totalFixed} رقم تم إصلاحه، ${totalDeleted} رقم تم حذفه`,
      dryRun,
      stats: {
        customers: stats.customers,
        contacts: stats.contacts,
        total: {
          invalid: totalInvalid,
          fixed: totalFixed,
          deleted: totalDeleted
        }
      }
    });
  } catch (err: any) {
    console.error(`[${orgId}] Clean contacts error:`, err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Failed to clean contacts"
    });
  }
});

// Get WhatsApp contact presence status
app.get("/whatsapp/contact-status/:phone", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { phone } = req.params;
  try {
    const client = manager.ensureReadyClient(orgId);
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

    // Get contact info from WhatsApp
    const contact = await client.getContactById(chatId);

    // Try to get profile picture URL
    let profilePicUrl = null;
    try {
      profilePicUrl = await contact.getProfilePicUrl();
    } catch (e) {
      // Profile pic not available
    }

    res.json({
      ok: true,
      contact: {
        id: contact.id._serialized,
        name: contact.name || contact.pushname || null,
        pushname: contact.pushname || null,
        isOnline: (contact as any).isOnline || null, // May not always be available
        lastSeen: (contact as any).lastSeen || null, // May not always be available
        profilePicUrl,
        isBlocked: contact.isBlocked,
        isMe: contact.isMe,
        isBusiness: contact.isBusiness
      }
    });
  } catch (err: any) {
    console.error(`[${orgId}] Get contact status error:`, err);
    res.status(400).json({
      ok: false,
      message: err?.message || "Failed to get contact status"
    });
  }
});


// Get messages for a chat (Database First to support Internal Notes)
app.get("/whatsapp/messages/:chatId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const chatId = req.params.chatId;
  const limit = parseInt(req.query.limit as string) || 50;

  if (!chatId) {
    return res.status(400).json({ message: "chatId required" });
  }

  try {
    // 1. Fetch from Database
    const { data: dbMessages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("organization_id", orgId)
      .or(`from_phone.eq.${chatId},to_phone.eq.${chatId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // 2. If DB is empty or has very few messages, try to sync from phone (Initial Sync)
    if (!dbMessages || dbMessages.length < 5) {
      try {
        const client = manager.ensureReadyClient(orgId);
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 20 });
        // WhatsAppManager already upserts on message events, but for historical fetch we might need to manually trigger if needed.
        // For now, we return what's on the phone as a fallback
        const simplified = messages.map(m => ({
          id: m.id._serialized,
          body: m.body || (m as any).caption || "",
          fromMe: m.fromMe,
          timestamp: m.timestamp,
          type: m.type,
          ack: m.ack,
          status: m.ack >= 3 ? 'read' : m.ack === 2 ? 'delivered' : 'sent',
          hasMedia: m.hasMedia,
          is_internal: false
        }));
        return res.json({ messages: simplified.reverse() });
      } catch (e) {
        console.warn("Failed live fetch, returning DB results anyway.");
      }
    }

    // 3. Map DB results to UI format
    const simplified = (dbMessages || []).map(m => ({
      id: m.wa_message_id,
      body: m.body,
      fromMe: !m.is_from_customer,
      timestamp: Math.floor(new Date(m.created_at).getTime() / 1000),
      type: m.message_type,
      status: m.status,
      quotedMsgId: m.quoted_message_id,
      reactions: m.reactions,
      location: m.location_lat ? { lat: m.location_lat, lng: m.location_lng, name: m.location_name } : null,
      hasMedia: m.message_type !== 'text' && m.message_type !== 'chat',
      is_internal: m.is_internal
    }));

    res.json({ messages: simplified.reverse() });
  } catch (err: any) {
    console.error(`[${orgId}] Get messages error:`, err);
    res.status(400).json({ message: err?.message || "Failed to get messages" });
  }
});

// POST Internal Note
app.post("/api/chat/internal-note", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, body } = req.body;

  try {
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        organization_id: orgId,
        wa_message_id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        body,
        from_phone: "system", // Internal note origin
        to_phone: chatId,
        is_from_customer: false,
        is_internal: true,
        message_type: 'text',
        status: 'read'
      })
      .select()
      .single();

    if (error) throw error;

    // Emit to socket so it appears for all team members
    io.to(orgId).emit("wa:message", {
      clientId: orgId,
      message: {
        id: message.wa_message_id,
        body: message.body,
        fromMe: true, // Shown as if from "us"
        timestamp: Math.floor(new Date(message.created_at).getTime() / 1000),
        type: 'text',
        is_internal: true
      }
    });

    res.json({ ok: true, message });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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

    // Try to get message from store
    let msg = null;
    try {
      msg = await client.getMessageById(messageId);
    } catch (e) {
      console.warn(`[${orgId}] Message ${messageId} not found in store, trying search...`);
    }

    if (!msg || !msg.hasMedia) {
      return res.status(404).json({ message: "Message not found or has no media (Server Restarted?)" });
    }

    // Try to download
    const media = await msg.downloadMedia();
    if (!media) {
      return res.status(404).json({ message: "Failed to download media content" });
    }

    res.json({
      mimetype: media.mimetype,
      data: media.data,
      filename: media.filename
    });
  } catch (err: any) {
    console.error(`[${orgId}] Get media error:`, err.message);
    res.status(500).json({ message: "Error downloading media. Session might be expired." });
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
      bot_mode: req.body.botMode || 'ai',
      organization_id: orgId
    });
    manager.setBotConfig(orgId, {
      systemPrompt,
      apiKey,
      enabled,
      botMode: req.body.botMode || 'ai',
      organizationId: orgId
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save bot config:", err);
    manager.setBotConfig(orgId, {
      systemPrompt,
      apiKey,
      enabled,
      botMode: req.body.botMode || 'ai',
      organizationId: orgId
    });
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

// Get customer by phone number (MUST be before :id route!)
app.get("/api/customers/phone/:phone", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  let { phone } = req.params;

  // Clean phone number - remove @c.us suffix if present
  phone = phone.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');

  try {
    const customer = await db.getCustomerByPhone(phone, orgId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json({ customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customer" });
  }
});

// Get single customer by ID
app.get("/api/customers/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    let customer = await db.getCustomerById(id, orgId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Auto-fix if viewed customer has LID pattern
    if (customer.phone && (customer.phone.length > 15 || customer.phone.startsWith("4203"))) {
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('wa_chat_id')
          .eq('customer_id', customer.id)
          .maybeSingle();

        if (conv) {
          const synced = await manager.getOrCreateAndSyncCustomer(orgId, conv.wa_chat_id);
          if (synced.conversation.customer) {
            customer = synced.conversation.customer;
          }
        }
      } catch (e) {
        console.warn(`[ProfileSync] Failed to auto-fix LID for customer ${id}:`, e);
      }
    }

    res.json({ customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customer" });
  }
});

app.post("/api/customers", verifyToken, validate(createCustomerSchema), async (req, res) => {
  const orgId = getOrgId(req);
  const { name, email, status, notes } = req.body;
  let { phone } = req.body;

  try {
    // Normalize phone number before saving
    if (phone) {
      phone = normalizePhoneForDB(phone);
      if (!phone) {
        return res.status(400).json({ message: "رقم الهاتف غير صالح" });
      }
    }

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
  const orgId = getOrgId(req);
  const { id } = req.params;
  const updates = req.body;
  // Handle group format mismatch
  if (updates.group) {
    updates.group_name = updates.group;
    delete updates.group;
  }
  try {
    const contact = await db.updateContact(id, updates, orgId);
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update contact" });
  }
});

app.delete("/api/contacts/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    await db.deleteContact(id, orgId);
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

app.get("/api/reports/activity", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const activity = await db.getActivityLogs(orgId);
    res.json({ activity });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get activity" });
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
    const replies = await db.getQuickReplies(orgId).catch(() => []);
    res.json({ replies: replies || [] });
  } catch (err: any) {
    console.error(`[${orgId}] Quick Replies Error:`, err);
    res.json({ replies: [] }); // Safe fallback
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

  // Start Facebook Token Refresh Service
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    TokenRefreshService.start();
    console.log("[Facebook] Token refresh service started");
  } else {
    console.log("[Facebook] Token refresh service not started (credentials not configured)");
  }
});
