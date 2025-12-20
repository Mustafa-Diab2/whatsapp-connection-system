import http from "http";
import express from "express";
import cors from "cors";

// Use ONLY Railway's PORT - no fallback
const PORT = process.env.PORT || 3001;

console.log("=== SERVER STARTING ===");
console.log("PORT:", PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("========================");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Server is running!", port: PORT });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT, timestamp: new Date().toISOString() });
});

app.get("/debug", (req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    env: process.env.NODE_ENV,
    node: process.version,
    uptime: process.uptime(),
  });
});

// Simple test endpoints
app.get("/whatsapp/status/:clientId", (req, res) => {
  res.json({ status: "idle", clientId: req.params.clientId });
});

app.post("/whatsapp/connect", (req, res) => {
  res.json({ status: "test", message: "This is test mode" });
});

app.delete("/whatsapp/session/:clientId", (req, res) => {
  res.json({ status: "idle" });
});

// Start server
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log("Server ready to accept connections");
});

server.on("error", (err) => {
  console.error("Server error:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
