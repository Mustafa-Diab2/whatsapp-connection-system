import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// CORS - Allow ALL
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

app.use(express.json({ limit: "10mb" }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.io
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ========== ROUTES ==========

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/debug", (_req, res) => {
  res.json({
    status: "running",
    node: process.version,
    env: NODE_ENV,
    port: PORT,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// WhatsApp status - MOCK for now
app.get("/whatsapp/status/:clientId", (req, res) => {
  res.json({
    status: "idle",
    message: "Server is running - WhatsApp not initialized yet",
    clientId: req.params.clientId
  });
});

// WhatsApp connect - MOCK
app.post("/whatsapp/connect", (req, res) => {
  res.json({
    status: "connecting",
    message: "Server is running - This is a test response",
    clientId: req.body?.clientId || "default"
  });
});

// WhatsApp QR - MOCK
app.get("/whatsapp/qr/:clientId", (req, res) => {
  res.json({ qrDataUrl: null, message: "WhatsApp not initialized" });
});

// Session reset - MOCK
app.delete("/whatsapp/session/:clientId", (req, res) => {
  res.json({ status: "idle", message: "Session reset mock" });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ========== START ==========

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           TEST SERVER STARTED                             ║
╠═══════════════════════════════════════════════════════════╣
║  URL: http://0.0.0.0:${PORT}                                 ║
║  Environment: ${NODE_ENV}                                ║
║  This is a TEST version without WhatsApp                  ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
