import dotenv from "dotenv";
dotenv.config();

import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import WhatsAppManager from "./wa/WhatsAppManager";
import { db, getSupabase } from "./lib/supabase";
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
import whatsappRoutes from "./routes/whatsapp";
import crmRoutes from "./routes/crm";
import botRoutes from "./routes/bot";
import { AutomationEngine } from "./services/AutomationEngine";
import { WorkflowEngine } from "./services/WorkflowEngine";
import { generalLimiter, authLimiter, errorHandler } from "./middleware";

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean) as string[];

const app = express();

// 1. 🛡️ CORS - MUST BE FIRST
const corsOptions: cors.CorsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "x-organization-id", 
    "X-Organization-Id", 
    "Accept",
    "Origin"
  ],
  exposedHeaders: ["Set-Cookie"]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight for all routes

// 2. 🛡️ Security Headers - Configured for Cross-Origin
app.set('trust proxy', 1);
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));

app.use(generalLimiter);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());
app.disable('x-powered-by');

// 🚑 ULTIMATE CORS BYPASS (Manual Headers)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-organization-id, X-Organization-Id, Accept, Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// 🚑 Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('API IS ALIVE'));

const httpServer = http.createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')),
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];
  if (!token) return next(new Error("No token provided"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (socket as any).user = decoded;
    next();
  } catch (err) { next(new Error("Invalid token")); }
});

let manager: WhatsAppManager;
try {
  manager = new WhatsAppManager(io);
} catch (err) { process.exit(1); }

app.use((req, res, next) => {
  (req as any).whatsappManager = manager;
  next();
});

io.on("connection", (socket) => {
  const userOrgId = (socket as any).user.organizationId;
  socket.on("wa:subscribe", () => {
    socket.join(userOrgId);
    const state = manager.getState(userOrgId);
    socket.emit("wa:state", { clientId: userOrgId, ...state });
  });
  socket.on("wa:unsubscribe", () => socket.leave(userOrgId));
});

// Routes
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.use("/auth", authLimiter, authRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api", crmRoutes);
app.use("/api/bot", botRoutes);
app.use("/bot", botRoutes);

// Shared Apps
app.use("/api/documents", documentsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/deals", dealsRouter);
app.use("/api/training", trainingRouter);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/tracking", trackingRoutes);
app.get("/t/:code", handleTrackingRedirect);

const facebookRoutesWithIo = createFacebookRoutes(io);
app.use("/api/facebook", facebookRoutesWithIo);
app.use("/webhooks/facebook", facebookRoutesWithIo);
app.use("/api/instagram", instagramRoutes);
app.use("/api/messenger", verifyToken, messengerRoutes);

app.use("/api/payments", paymentsRoutes);
app.use("/api/catalogs", catalogsRoutes);
app.use("/api/quick-replies", quickRepliesRoutes);
app.use("/api/surveys", surveysRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/chatbot", chatbotBuilderRoutes);
app.use("/api/ai-sales", aiSalesRoutes);
app.use("/api/reports", reportsRoutes);

app.use(errorHandler);

// 🛡️ Safe Services Initialization
const initializeServices = async () => {
    try {
        console.log("[Services] Initializing Automation & Workflows...");
        const automationEngine = AutomationEngine.getInstance(manager);
        const workflowEngine = WorkflowEngine.getInstance(manager);

        await automationEngine.start();
        console.log("[Services] Background workers started successfully.");
    } catch (error: any) {
    console.error("[Services] ERROR during background initialization:", error?.message || error);
        console.warn("[Services] Server will continue to run, but automation might be limited.");
    }
};

// Start the server
httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[Server] WhatsApp CRM API is running on port ${PORT} (0.0.0.0)`);
    initializeServices();
});
