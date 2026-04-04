import { Router, Request, Response } from "express";
import { db } from "../lib/supabase";
import { verifyToken } from "./auth";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();

// Helper to extract orgId
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId;
};

// Helper to get manager
const getManager = (req: Request): WhatsAppManager => {
  return (req as any).whatsappManager;
};

// ========== BOT CONFIG ==========

router.get("/config", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const config = await db.getBotConfig(orgId, orgId);
    res.json(config);
  } catch (err: any) {
    const config = getManager(req).getBotConfig(orgId);
    res.json(config);
  }
});

router.post("/config", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { systemPrompt, apiKey, enabled, botMode } = req.body;
  try {
    await db.updateBotConfig(orgId, {
      system_prompt: systemPrompt,
      api_key: apiKey,
      enabled,
      bot_mode: botMode || 'ai',
      organization_id: orgId
    });
    getManager(req).setBotConfig(orgId, {
      systemPrompt,
      apiKey,
      enabled,
      botMode: botMode || 'ai',
      organizationId: orgId
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save bot config:", err);
    getManager(req).setBotConfig(orgId, {
      systemPrompt,
      apiKey,
      enabled,
      botMode: botMode || 'ai',
      organizationId: orgId
    });
    res.json({ ok: true, warning: "Saved to memory only" });
  }
});

router.get("/activity", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const activities = await getManager(req).getBotActivities(limit, orgId); 
    res.json({ activities });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get activities" });
  }
});

router.post("/test", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ ok: false, message: "message required" });
  }
  try {
    const result = await getManager(req).testBotResponse(orgId, message);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to test bot" });
  }
});

export default router;
