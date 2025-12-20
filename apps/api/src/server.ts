import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import {
  generalLimiter,
  whatsappConnectLimiter,
  messageLimiter,
  strictLimiter,
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from "./middleware";
import {
  validateRequest,
  connectRequestSchema,
  sendMessageSchema,
  sendMessageByPhoneSchema,
  clientIdSchema,
} from "./validation";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost";
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// CORS configuration - improved security
const allowedOrigins = CORS_ORIGIN.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // In development, allow all origins
      if (NODE_ENV === "development") {
        return callback(null, true);
      }

      // In production, check whitelist
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply general rate limiter to all routes
app.use(generalLimiter);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // In development, allow all
      if (NODE_ENV === "development") {
        return callback(null, true);
      }
      // In production, check whitelist
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
    env: process.env.NODE_ENV || "development",
    port: PORT,
    uptime: process.uptime(),
  });
});

// ==================== WhatsApp Routes ====================

// Connect to WhatsApp
app.post(
  "/whatsapp/connect",
  whatsappConnectLimiter,
  asyncHandler(async (req, res) => {
    // Validate request
    const validation = validateRequest(connectRequestSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ status: "error", message: validation.error });
    }

    const { clientId } = validation.data as { clientId: string };

    const state = await manager.connect(clientId);
    res.json(state);
  })
);

// Get WhatsApp status
app.get("/whatsapp/status/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ status: state.status, lastError: state.lastError, updatedAt: state.updatedAt });
});

// Get QR code (fallback for HTTP polling)
app.get("/whatsapp/qr/:clientId", (req, res) => {
  const clientId = req.params.clientId || "default";
  const state = manager.getState(clientId);
  res.json({ qrDataUrl: state.qrDataUrl });
});

// Reset/Delete session
app.delete(
  "/whatsapp/session/:clientId",
  strictLimiter,
  asyncHandler(async (req, res) => {
    const clientId = req.params.clientId || "default";

    // Validate clientId
    const validation = validateRequest(clientIdSchema, clientId);
    if (!validation.success) {
      return res.status(400).json({ status: "error", message: validation.error });
    }

    const state = await manager.resetSession(clientId);
    res.json(state);
  })
);

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

// Get messages for a specific chat
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

// Send message to a chat (using chatId)
app.post(
  "/whatsapp/send",
  messageLimiter,
  asyncHandler(async (req, res) => {
    // Validate request
    const validation = validateRequest(sendMessageSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error });
    }

    const { clientId, chatId, message } = validation.data as {
      clientId: string;
      chatId: string;
      message: string;
    };

    const client = manager.ensureReadyClient(clientId);
    await client.sendMessage(chatId, message);
    res.json({ ok: true });
  })
);

// ==================== Messaging API (REST) ====================

// Send message using phone number (REST API style)
app.post(
  "/messages/send",
  messageLimiter,
  asyncHandler(async (req, res) => {
    // Validate request
    const validation = validateRequest(sendMessageByPhoneSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: validation.error });
    }

    const { clientId, to, text } = validation.data as {
      clientId: string;
      to: string;
      text: string;
    };

    // Check if client is ready
    const state = manager.getState(clientId);
    if (state.status !== "ready") {
      return res.status(400).json({
        ok: false,
        message: "العميل غير متصل، يرجى الاتصال أولاً",
        status: state.status,
      });
    }

    const result = await manager.sendMessage(clientId, to, text);
    res.json(result);
  })
);

// ==================== Error Handling ====================

// 404 handler - must be before error handler
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // في الإنتاج، يجب إيقاف السيرفر بشكל آمن
  if (NODE_ENV === "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // في الإنتاج، يجب إيقاف السيرفر بشكل آمن
  if (NODE_ENV === "production") {
    process.exit(1);
  }
});

// ==================== Start Server ====================

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           WhatsApp CRM API Server Started                 ║
╠═══════════════════════════════════════════════════════════╣
║  URL: http://0.0.0.0:${PORT}                                 ║
║  Environment: ${(process.env.NODE_ENV || "development").padEnd(42)}║
║  Node: ${process.version.padEnd(50)}║
╚═══════════════════════════════════════════════════════════╝
  `);
});
