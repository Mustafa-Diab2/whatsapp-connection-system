import { Router, Request, Response } from "express";
import { verifyToken } from "./auth";
import { db, supabase } from "../lib/supabase";
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

// ========== WHATSAPP ROUTES (Secured) ==========

// Status
router.get("/status/:clientId", verifyToken, (req, res) => {
  const { clientId } = req.params;
  const orgId = getOrgId(req);

  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
  }

  const state = getManager(req).getState(clientId);
  res.json(state);
});

// QR Code endpoint
router.get("/qr/:clientId", verifyToken, (req, res) => {
  const { clientId } = req.params;
  const orgId = getOrgId(req);

  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
  }

  const state = getManager(req).getState(clientId);
  res.json({ 
    qrDataUrl: state.qrDataUrl || null, 
    status: state.status 
  });
});

// Initialize / Connect
router.post("/init/:clientId", verifyToken, async (req, res) => {
  const { clientId } = req.params;
  const orgId = getOrgId(req);

  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied: Organization mismatch" });
  }

  try {
    await getManager(req).connect(clientId);
    res.json({ ok: true, message: "Initialization started" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to initialize" });
  }
});

router.post("/connect", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const state = await getManager(req).connect(orgId);
    res.json({ 
      ok: true, 
      message: "Connection started", 
      clientId: orgId,
      state 
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to connect" });
  }
});

// Send message
router.post("/send", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, message } = req.body;
  try {
    const result = await getManager(req).sendMessage(orgId, chatId, message);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send message" });
  }
});

router.post("/send-contact", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, contactId } = req.body;
  try {
    const result = await getManager(req).sendContact(orgId, chatId, contactId);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send contact" });
  }
});

router.post("/send-media", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId, base64, mimetype, filename, caption } = req.body;
  try {
    const result = await getManager(req).sendMediaMessage(orgId, chatId, base64, mimetype, filename, caption);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to send media" });
  }
});

// Logout / Reset
router.post("/logout", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    await getManager(req).resetSession(orgId);
    res.json({ ok: true, message: "Logged out" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to logout" });
  }
});

router.post("/reset", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    await getManager(req).resetSession(orgId);
    res.json({ ok: true, message: "Session reset" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to reset" });
  }
});

// Self info
router.get("/me", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const client = getManager(req).ensureReadyClient(orgId);
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
    res.status(400).json({ ok: false, message: err?.message || "Client not ready" });
  }
});

// Chats and contacts
router.get("/chats", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  try {
    const chats = await getManager(req).getAllChats(orgId);
    const result = limit ? chats.slice(0, limit) : chats;
    res.json({ ok: true, chats: result, total: chats.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to get chats" });
  }
});

router.get("/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const contacts = await getManager(req).getAllContacts(orgId);
    res.json({ ok: true, contacts, total: contacts.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to get contacts" });
  }
});

// Sync
router.post("/contacts/sync", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const result = await getManager(req).syncContactsToDatabase(orgId);
    res.json({ ok: true, message: "تم مزامنة جهات الاتصال بنجاح", ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to sync contacts" });
  }
});

router.post("/chats/sync", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const result = await getManager(req).syncAllChatsToDatabase(orgId);
    res.json({ ok: true, message: "تم مزامنة المحادثات بنجاح", ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Failed to sync chats" });
  }
});

// Messages History
router.get("/messages/:chatId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { chatId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const { data: dbMessages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("organization_id", orgId)
      .or(`from_phone.eq.${chatId},to_phone.eq.${chatId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

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
    res.status(400).json({ message: err?.message || "Failed to get messages" });
  }
});

// Media
router.get("/media/:clientId/:messageId", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { clientId, messageId } = req.params;

  if (clientId !== orgId) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const client = getManager(req).ensureReadyClient(orgId);
    const msg = await client.getMessageById(messageId);

    if (!msg || !msg.hasMedia) {
      return res.status(404).json({ message: "Message not found or has no media" });
    }

    const media = await msg.downloadMedia();
    if (!media) return res.status(404).json({ message: "Failed to download media content" });

    res.json({
      mimetype: media.mimetype,
      data: media.data,
      filename: media.filename
    });
  } catch (err: any) {
    res.status(500).json({ message: "Error downloading media. Session might be expired." });
  }
});

export default router;
