import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import crypto from "crypto";
import { decryptToken } from "../services/FacebookManager";

const router = Router();

// Facebook/Messenger Graph API Base URL
const GRAPH_API = "https://graph.facebook.com/v21.0";

// Helper to get and validate organization ID
const getOrgId = (req: Request): string | null => {
  const orgId = req.headers["x-organization-id"] as string;
  // Validate UUID format
  if (orgId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
    return orgId;
  }
  return null;
};

// ==================== MESSENGER PAGE CONNECTION ====================

// Get connected pages for Messenger
router.get("/pages", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    
    if (!orgId) {
      return res.json({ pages: [] });
    }
    
    const { data, error } = await supabase
      .from("messenger_pages")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    res.json({ pages: data || [] });
  } catch (error: any) {
    console.error("Error fetching Messenger pages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Connect Facebook Page for Messenger
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { access_token, page_id } = req.body;
    
    // Step 1: Get Page details and long-lived Page Access Token
    const pageResponse = await fetch(
      `${GRAPH_API}/${page_id}?fields=id,name,picture,access_token&access_token=${access_token}`
    );
    const pageData = await pageResponse.json();
    
    if (pageData.error) {
      return res.status(400).json({ error: pageData.error.message });
    }
    
    const pageAccessToken = pageData.access_token;
    
    // Step 2: Subscribe to Messenger webhooks
    const subscribeResponse = await fetch(
      `${GRAPH_API}/${page_id}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: pageAccessToken,
          subscribed_fields: [
            "messages",
            "messaging_postbacks",
            "messaging_optins",
            "message_deliveries",
            "message_reads",
            "messaging_referrals"
          ].join(","),
        }),
      }
    );
    const subscribeData = await subscribeResponse.json();
    
    if (subscribeData.error) {
      console.warn("Webhook subscription warning:", subscribeData.error);
    }
    
    // Step 3: Store in database
    const { data, error } = await supabase
      .from("messenger_pages")
      .upsert({
        organization_id: orgId,
        page_id: page_id,
        page_name: pageData.name,
        page_picture: pageData.picture?.data?.url,
        access_token: pageAccessToken, // Consider encrypting this
        is_active: true,
        webhook_subscribed: subscribeData.success || false,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,page_id' })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      page: data,
      message: "تم ربط صفحة Facebook للمراسلة عبر Messenger بنجاح"
    });
  } catch (error: any) {
    console.error("Error connecting Messenger page:", error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Messenger page
router.delete("/pages/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { id } = req.params;
    
    const { error } = await supabase
      .from("messenger_pages")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);
    
    if (error) throw error;
    
    res.json({ success: true, message: "تم فصل الصفحة بنجاح" });
  } catch (error: any) {
    console.error("Error disconnecting Messenger page:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSENGER WEBHOOK ====================

// Webhook verification (GET)
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  
  const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "messenger_webhook_verify_token";
  
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Messenger webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("❌ Messenger webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

// Verify request signature
function verifyRequestSignature(req: Request): boolean {
  const signature = req.headers["x-hub-signature-256"] as string;
  
  if (!signature) return true; // Skip if no signature (dev mode)
  
  const appSecret = process.env.FB_APP_SECRET;
  if (!appSecret) return true; // Skip if no secret configured
  
  const elements = signature.split("=");
  const signatureHash = elements[1];
  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(JSON.stringify(req.body))
    .digest("hex");
  
  return signatureHash === expectedHash;
}

// Webhook handler (POST) - Receive Messenger messages
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    
    // Verify signature
    if (!verifyRequestSignature(req)) {
      console.warn("Invalid signature");
      return res.sendStatus(403);
    }
    
    // Messenger uses "page" as object type (not "instagram")
    if (body.object !== "page") {
      return res.sendStatus(404);
    }
    
    // Must respond within 5 seconds
    res.sendStatus(200);
    
    // Process entries asynchronously
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      
      // Get page from database
      const { data: page } = await supabase
        .from("messenger_pages")
        .select("id, organization_id, access_token")
        .eq("page_id", pageId)
        .single();
      
      if (!page) {
        console.warn(`Page ${pageId} not found in database`);
        continue;
      }
      
      // Process messaging events
      for (const messagingEvent of entry.messaging || []) {
        // Skip echo messages (messages sent by page)
        if (messagingEvent.message?.is_echo) {
          console.log("Skipping echo message");
          continue;
        }
        
        // Handle different event types
        if (messagingEvent.message) {
          await handleIncomingMessage(page, messagingEvent);
        } else if (messagingEvent.postback) {
          await handlePostback(page, messagingEvent);
        } else if (messagingEvent.read) {
          await handleReadReceipt(page, messagingEvent);
        } else if (messagingEvent.delivery) {
          await handleDeliveryReceipt(page, messagingEvent);
        } else if (messagingEvent.referral) {
          await handleReferral(page, messagingEvent);
        }
      }
    }
  } catch (error) {
    console.error("Messenger webhook error:", error);
  }
});

// Handle incoming Messenger message
async function handleIncomingMessage(page: any, event: any) {
  const senderPsid = event.sender.id; // Page-Scoped ID
  const message = event.message;
  const timestamp = event.timestamp;
  
  try {
    // Get or create conversation
    let { data: conversation } = await supabase
      .from("messenger_conversations")
      .select("*")
      .eq("page_id", page.id)
      .eq("psid", senderPsid)
      .single();
    
    if (!conversation) {
      // Fetch user profile from Facebook
      const profileResponse = await fetch(
        `${GRAPH_API}/${senderPsid}?fields=first_name,last_name,name,profile_pic&access_token=${page.access_token}`
      );
      const profileData = await profileResponse.json();
      
      // Create conversation
      const { data: newConversation } = await supabase
        .from("messenger_conversations")
        .insert({
          organization_id: page.organization_id,
          page_id: page.id,
          psid: senderPsid,
          customer_name: profileData.name || `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'مستخدم Messenger',
          customer_first_name: profileData.first_name,
          customer_last_name: profileData.last_name,
          profile_pic: profileData.profile_pic,
          is_active: true,
        })
        .select()
        .single();
      
      conversation = newConversation;
    }
    
    if (!conversation) {
      console.error("Failed to create/get conversation");
      return;
    }
    
    // Determine message type and content
    let messageType = "text";
    let content = message.text || "";
    let mediaUrl = null;
    let metadata: any = null;
    
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      messageType = attachment.type; // image, video, audio, file, location, fallback
      
      if (attachment.payload) {
        mediaUrl = attachment.payload.url;
        
        // Handle location
        if (attachment.type === "location") {
          const coords = attachment.payload.coordinates;
          content = `📍 موقع: ${coords.lat}, ${coords.long}`;
          metadata = { coordinates: coords };
        }
      }
      
      // Handle sticker
      if (message.sticker_id) {
        messageType = "sticker";
        metadata = { sticker_id: message.sticker_id };
      }
    }
    
    // Handle quick reply
    if (message.quick_reply) {
      metadata = { ...metadata, quick_reply_payload: message.quick_reply.payload };
    }
    
    // Store message
    await supabase.from("messenger_messages").insert({
      organization_id: page.organization_id,
      conversation_id: conversation.id,
      message_id: message.mid,
      direction: "inbound",
      message_type: messageType,
      content: content,
      media_url: mediaUrl,
      metadata: metadata,
      is_read: false,
      timestamp: new Date(timestamp).toISOString(),
    });
    
    // Update conversation last_message_at
    await supabase
      .from("messenger_conversations")
      .update({ 
        last_message_at: new Date().toISOString(),
        last_message: content || `[${messageType}]`,
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq("id", conversation.id);
    
    // TODO: Trigger chatbot or auto-reply if configured
    // await triggerMessengerBot(page, conversation, message);
    
  } catch (error) {
    console.error("Error handling Messenger message:", error);
  }
}

// Handle postback (button click)
async function handlePostback(page: any, event: any) {
  const senderPsid = event.sender.id;
  const postback = event.postback;
  
  try {
    // Get conversation
    const { data: conversation } = await supabase
      .from("messenger_conversations")
      .select("id")
      .eq("page_id", page.id)
      .eq("psid", senderPsid)
      .single();
    
    if (!conversation) return;
    
    // Store postback as message
    await supabase.from("messenger_messages").insert({
      organization_id: page.organization_id,
      conversation_id: conversation.id,
      direction: "inbound",
      message_type: "postback",
      content: postback.title || "Button Click",
      metadata: { 
        payload: postback.payload,
        referral: postback.referral,
      },
      is_read: false,
      timestamp: new Date(event.timestamp).toISOString(),
    });
    
    // Handle Get Started button
    if (postback.payload === "GET_STARTED") {
      // Send welcome message
      await sendMessage(page, senderPsid, {
        text: "مرحباً! 👋 كيف يمكنني مساعدتك اليوم؟",
      });
    }
  } catch (error) {
    console.error("Error handling postback:", error);
  }
}

// Handle read receipt
async function handleReadReceipt(page: any, event: any) {
  const senderPsid = event.sender.id;
  const watermark = event.read.watermark;
  
  try {
    // Mark messages as read
    await supabase
      .from("messenger_messages")
      .update({ is_read: true })
      .eq("organization_id", page.organization_id)
      .eq("direction", "outbound")
      .lte("timestamp", new Date(watermark).toISOString());
  } catch (error) {
    console.error("Error handling read receipt:", error);
  }
}

// Handle delivery receipt
async function handleDeliveryReceipt(page: any, event: any) {
  // Delivery receipts can be logged for analytics
  console.log("Message delivered to:", event.sender.id);
}

// Handle referral (m.me links, ads)
async function handleReferral(page: any, event: any) {
  const senderPsid = event.sender.id;
  const referral = event.referral;
  
  try {
    const { data: conversation } = await supabase
      .from("messenger_conversations")
      .select("id")
      .eq("page_id", page.id)
      .eq("psid", senderPsid)
      .single();
    
    if (conversation) {
      // Log referral source
      await supabase
        .from("messenger_conversations")
        .update({ 
          referral_source: referral.source,
          referral_type: referral.type,
          referral_ref: referral.ref,
        })
        .eq("id", conversation.id);
    }
  } catch (error) {
    console.error("Error handling referral:", error);
  }
}

// ==================== SEND MESSAGES ====================

// Helper function to send message via Graph API
async function sendMessage(page: any, recipientPsid: string, message: any) {
  const response = await fetch(`${GRAPH_API}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: page.access_token,
      recipient: { id: recipientPsid },
      messaging_type: "RESPONSE",
      message: message,
    }),
  });
  
  const data = await response.json();
  
  if (data.error) {
    console.error("Send API error:", data.error);
    throw new Error(data.error.message);
  }
  
  return data;
}

// Get all conversations
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    
    if (!orgId) {
      return res.json({ data: [], total: 0 });
    }
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { data, error, count } = await supabase
      .from("messenger_conversations")
      .select("*", { count: "exact" })
      .eq("organization_id", orgId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    // Transform data to match frontend expectations
    const conversations = (data || []).map((c: any) => ({
      id: c.id,
      page_id: c.page_id,
      participant_id: c.psid,
      participant_name: c.customer_name || c.customer_first_name || "Unknown",
      participant_profile_pic: c.profile_pic,
      last_message: c.last_message,
      last_message_time: c.last_message_at,
      unread_count: c.unread_count || 0,
      platform: "messenger" as const,
    }));
    
    res.json({ 
      data: conversations,
      total: count || 0,
    });
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a conversation
router.get("/conversations/:conversationId/messages", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const { data, error } = await supabase
      .from("messenger_messages")
      .select("*")
      .eq("organization_id", orgId)
      .eq("conversation_id", conversationId)
      .order("timestamp", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    // Mark as read
    await supabase
      .from("messenger_messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .eq("is_read", false);
    
    // Reset unread count
    await supabase
      .from("messenger_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);
    
    // Transform to match frontend expectations
    const messages = (data || []).reverse().map((m: any) => ({
      id: m.id,
      sender_id: m.sender_id,
      message_text: m.content,
      message_type: m.message_type,
      is_from_page: m.direction === "outbound",
      created_at: m.timestamp,
      attachments: m.metadata?.attachments || [],
    }));
    
    res.json({ data: messages });
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send message from conversation (simplified endpoint)
router.post("/conversations/:conversationId/send", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { conversationId } = req.params;
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "الرسالة مطلوبة" });
    }
    
    // Get conversation with page
    const { data: conversation, error: convError } = await supabase
      .from("messenger_conversations")
      .select("*, messenger_pages(*)")
      .eq("id", conversationId)
      .eq("organization_id", orgId)
      .single();
    
    if (convError || !conversation) {
      return res.status(404).json({ error: "المحادثة غير موجودة" });
    }
    
    const page = conversation.messenger_pages;
    if (!page?.access_token) {
      return res.status(400).json({ error: "الصفحة غير متصلة" });
    }
    
    // Send via Messenger API
    const sendResponse = await fetch(`${GRAPH_API}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: conversation.psid },
        message: { text: message.trim() },
        access_token: page.access_token,
      }),
    });
    
    const sendData = await sendResponse.json();
    
    if (sendData.error) {
      throw new Error(sendData.error.message);
    }
    
    // Store in database
    const { data: savedMessage, error: saveError } = await supabase
      .from("messenger_messages")
      .insert({
        organization_id: orgId,
        conversation_id: conversationId,
        message_id: sendData.message_id,
        sender_id: page.page_id,
        message_text: message.trim(),
        message_type: "text",
        is_from_page: true,
        direction: "outbound",
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();
    
    // Update conversation last message
    await supabase
      .from("messenger_conversations")
      .update({
        last_message: message.trim(),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    
    res.json({ 
      success: true, 
      message: savedMessage,
      messageId: sendData.message_id 
    });
  } catch (error: any) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send message endpoint
router.post("/send", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { 
      conversation_id, 
      recipient_psid,
      message_type, 
      content, 
      media_url, 
      quick_replies,
      buttons,
      template 
    } = req.body;
    
    // Get conversation and page
    const { data: conversation } = await supabase
      .from("messenger_conversations")
      .select("*, messenger_pages(*)")
      .eq("id", conversation_id)
      .eq("organization_id", orgId)
      .single();
    
    if (!conversation || !conversation.messenger_pages) {
      return res.status(400).json({ error: "المحادثة غير موجودة" });
    }
    
    const page = conversation.messenger_pages;
    const psid = recipient_psid || conversation.psid;
    
    // Build message payload
    let messagePayload: any = {};
    
    switch (message_type) {
      case "text":
        messagePayload = { text: content };
        
        // Add quick replies if provided
        if (quick_replies && quick_replies.length > 0) {
          messagePayload.quick_replies = quick_replies.map((qr: any) => ({
            content_type: "text",
            title: qr.title,
            payload: qr.payload,
          }));
        }
        break;
        
      case "image":
      case "video":
      case "audio":
      case "file":
        messagePayload = {
          attachment: {
            type: message_type === "file" ? "file" : message_type,
            payload: { url: media_url, is_reusable: true },
          },
        };
        break;
        
      case "button":
        messagePayload = {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: content,
              buttons: buttons.map((btn: any) => {
                if (btn.type === "web_url") {
                  return {
                    type: "web_url",
                    title: btn.title,
                    url: btn.url,
                    webview_height_ratio: btn.webview_height_ratio || "full",
                  };
                } else {
                  return {
                    type: "postback",
                    title: btn.title,
                    payload: btn.payload,
                  };
                }
              }),
            },
          },
        };
        break;
        
      case "generic":
        // Generic template (carousel)
        messagePayload = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: template.elements,
            },
          },
        };
        break;
        
      default:
        messagePayload = { text: content };
    }
    
    // Send via Graph API
    const result = await sendMessage(
      { access_token: page.access_token },
      psid,
      messagePayload
    );
    
    // Store sent message
    const { data: savedMessage, error: saveError } = await supabase
      .from("messenger_messages")
      .insert({
        organization_id: orgId,
        conversation_id: conversation_id,
        message_id: result.message_id,
        direction: "outbound",
        message_type: message_type,
        content: content,
        media_url: media_url,
        metadata: { quick_replies, buttons, template },
        is_read: false,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (saveError) throw saveError;
    
    // Update conversation
    await supabase
      .from("messenger_conversations")
      .update({ 
        last_message_at: new Date().toISOString(),
        last_message: content || `[${message_type}]`,
      })
      .eq("id", conversation_id);
    
    res.json({ 
      success: true, 
      message: savedMessage,
      message_id: result.message_id,
    });
  } catch (error: any) {
    console.error("Error sending Messenger message:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSENGER PROFILE (Get Started, Persistent Menu) ====================

// Set Get Started button
router.post("/profile/get-started", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { page_id, payload } = req.body;
    
    const { data: page } = await supabase
      .from("messenger_pages")
      .select("access_token")
      .eq("page_id", page_id)
      .eq("organization_id", orgId)
      .single();
    
    if (!page) {
      return res.status(404).json({ error: "الصفحة غير موجودة" });
    }
    
    const response = await fetch(`${GRAPH_API}/me/messenger_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: page.access_token,
        get_started: { payload: payload || "GET_STARTED" },
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true, message: "تم تعيين زر البدء بنجاح" });
  } catch (error: any) {
    console.error("Error setting Get Started:", error);
    res.status(500).json({ error: error.message });
  }
});

// Set Persistent Menu
router.post("/profile/menu", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { page_id, menu_items } = req.body;
    
    const { data: page } = await supabase
      .from("messenger_pages")
      .select("access_token")
      .eq("page_id", page_id)
      .eq("organization_id", orgId)
      .single();
    
    if (!page) {
      return res.status(404).json({ error: "الصفحة غير موجودة" });
    }
    
    const response = await fetch(`${GRAPH_API}/me/messenger_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: page.access_token,
        persistent_menu: [{
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: menu_items,
        }],
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true, message: "تم تعيين القائمة الثابتة بنجاح" });
  } catch (error: any) {
    console.error("Error setting Persistent Menu:", error);
    res.status(500).json({ error: error.message });
  }
});

// Set Greeting Text
router.post("/profile/greeting", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { page_id, greeting_text } = req.body;
    
    const { data: page } = await supabase
      .from("messenger_pages")
      .select("access_token")
      .eq("page_id", page_id)
      .eq("organization_id", orgId)
      .single();
    
    if (!page) {
      return res.status(404).json({ error: "الصفحة غير موجودة" });
    }
    
    const response = await fetch(`${GRAPH_API}/me/messenger_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: page.access_token,
        greeting: [{
          locale: "default",
          text: greeting_text,
        }],
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true, message: "تم تعيين رسالة الترحيب بنجاح" });
  } catch (error: any) {
    console.error("Error setting Greeting:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ANALYTICS ====================

// Get Messenger analytics
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { start_date, end_date } = req.query;
    
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    
    // Get message counts
    const { data: messageStats } = await supabase
      .from("messenger_messages")
      .select("direction, message_type")
      .eq("organization_id", orgId)
      .gte("timestamp", startDate)
      .lte("timestamp", endDate);
    
    // Get conversation counts
    const { count: totalConversations } = await supabase
      .from("messenger_conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);
    
    const { count: activeConversations } = await supabase
      .from("messenger_conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("last_message_at", startDate);
    
    // Calculate stats
    const inbound = messageStats?.filter(m => m.direction === "inbound").length || 0;
    const outbound = messageStats?.filter(m => m.direction === "outbound").length || 0;
    
    res.json({
      total_conversations: totalConversations || 0,
      active_conversations: activeConversations || 0,
      messages_received: inbound,
      messages_sent: outbound,
      total_messages: inbound + outbound,
      response_rate: inbound > 0 ? Math.round((outbound / inbound) * 100) : 0,
    });
  } catch (error: any) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SYNC HISTORICAL MESSAGES ====================

// Sync all historical conversations and messages from Facebook
router.post("/pages/:pageId/sync", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { pageId } = req.params;
    
    console.log(`[Messenger Sync] Starting sync for pageId: ${pageId}, orgId: ${orgId}`);
    
    // Get page from database - try messenger_pages first, then facebook_pages
    let page: any = null;
    
    // First try messenger_pages by Facebook page_id
    const { data: messengerPage } = await supabase
      .from("messenger_pages")
      .select("*")
      .eq("page_id", pageId)
      .maybeSingle();
    
    if (messengerPage) {
      page = messengerPage;
      console.log(`[Messenger Sync] Found in messenger_pages`);
    } else {
      // Try facebook_pages table
      const { data: facebookPage } = await supabase
        .from("facebook_pages")
        .select("*")
        .eq("page_id", pageId)
        .maybeSingle();
      
      if (facebookPage) {
        page = facebookPage;
        console.log(`[Messenger Sync] Found in facebook_pages`);
      }
    }
    
    if (!page) {
      console.log(`[Messenger Sync] Page not found in any table for pageId: ${pageId}`);
      return res.status(404).json({ error: "الصفحة غير موجودة" });
    }
    
    // Debug: log page data to see what fields are available
    console.log(`[Messenger Sync] Page data keys:`, Object.keys(page));
    console.log(`[Messenger Sync] Has access_token:`, !!page.access_token);
    console.log(`[Messenger Sync] Has access_token_encrypted:`, !!page.access_token_encrypted);
    
    // Get access token (different field names in different tables)
    // If from facebook_pages, token is encrypted and needs decryption
    let accessToken: string;
    if (page.access_token && typeof page.access_token === 'string' && page.access_token.length > 0) {
      accessToken = page.access_token;
      console.log(`[Messenger Sync] Using access_token (plain)`);
    } else if (page.access_token_encrypted && typeof page.access_token_encrypted === 'string' && page.access_token_encrypted.length > 0) {
      try {
        accessToken = decryptToken(page.access_token_encrypted);
        console.log(`[Messenger Sync] Successfully decrypted token`);
      } catch (err) {
        console.error("[Messenger Sync] Failed to decrypt token:", err);
        return res.status(400).json({ error: "فشل في فك تشفير Access Token" });
      }
    } else {
      console.error(`[Messenger Sync] No valid token found. access_token=${page.access_token}, access_token_encrypted=${page.access_token_encrypted}`);
      return res.status(400).json({ error: "Access Token غير موجود للصفحة - يرجى إعادة ربط الصفحة من تبويب الصفحات" });
    }
    
    let totalConversations = 0;
    let totalMessages = 0;
    
    // Step 1: Get all conversations
    let conversationsUrl = `${GRAPH_API}/${page.page_id}/conversations?fields=id,participants,updated_time,message_count&access_token=${accessToken}&limit=100`;
    
    while (conversationsUrl) {
      const convResponse = await fetch(conversationsUrl);
      const convData = await convResponse.json();
      
      if (convData.error) {
        console.error("Error fetching conversations:", convData.error);
        break;
      }
      
      for (const conv of convData.data || []) {
        // Get participant (the user, not the page)
        const participant = conv.participants?.data?.find((p: any) => p.id !== page.page_id);
        if (!participant) continue;
        
        const psid = participant.id;
        
        // Get user profile
        let profileData: any = { name: participant.name || "Unknown" };
        try {
          const profileResponse = await fetch(
            `${GRAPH_API}/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${accessToken}`
          );
          const profile = await profileResponse.json();
          if (!profile.error) {
            profileData = profile;
          }
        } catch (e) {
          console.warn("Could not fetch profile for", psid);
        }
        
        // Create or update conversation
        const { data: existingConv } = await supabase
          .from("messenger_conversations")
          .select("id")
          .eq("page_id", page.id)
          .eq("psid", psid)
          .single();
        
        let conversationId: string;
        
        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const { data: newConv } = await supabase
            .from("messenger_conversations")
            .insert({
              organization_id: orgId,
              page_id: page.id,
              psid: psid,
              customer_name: profileData.name || `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim(),
              customer_first_name: profileData.first_name,
              customer_last_name: profileData.last_name,
              profile_pic: profileData.profile_pic,
              is_active: true,
              last_message_at: conv.updated_time,
            })
            .select()
            .single();
          
          if (!newConv) continue;
          conversationId = newConv.id;
          totalConversations++;
        }
        
        // Step 2: Get messages for this conversation
        let messagesUrl = `${GRAPH_API}/${conv.id}/messages?fields=id,message,from,to,created_time,attachments,sticker&access_token=${accessToken}&limit=100`;
        
        while (messagesUrl) {
          const msgResponse = await fetch(messagesUrl);
          const msgData = await msgResponse.json();
          
          if (msgData.error) {
            console.error("Error fetching messages:", msgData.error);
            break;
          }
          
          for (const msg of msgData.data || []) {
            // Check if message already exists
            const { data: existingMsg } = await supabase
              .from("messenger_messages")
              .select("id")
              .eq("message_id", msg.id)
              .single();
            
            if (existingMsg) continue; // Skip if already synced
            
            // Determine direction
            const isFromPage = msg.from?.id === page.page_id;
            const direction = isFromPage ? "outbound" : "inbound";
            
            // Determine message type
            let messageType = "text";
            let mediaUrl = null;
            
            if (msg.sticker) {
              messageType = "sticker";
              mediaUrl = msg.sticker;
            } else if (msg.attachments?.data?.[0]) {
              const attachment = msg.attachments.data[0];
              messageType = attachment.mime_type?.startsWith("image") ? "image" :
                           attachment.mime_type?.startsWith("video") ? "video" :
                           attachment.mime_type?.startsWith("audio") ? "audio" : "file";
              mediaUrl = attachment.file_url || attachment.image_data?.url;
            }
            
            // Insert message
            await supabase
              .from("messenger_messages")
              .insert({
                organization_id: orgId,
                conversation_id: conversationId,
                message_id: msg.id,
                direction: direction,
                message_type: messageType,
                content: msg.message || "",
                media_url: mediaUrl,
                timestamp: msg.created_time,
                is_read: true, // Historical messages are read
                is_delivered: true,
              });
            
            totalMessages++;
          }
          
          // Next page of messages
          messagesUrl = msgData.paging?.next || null;
        }
        
        // Update conversation with last message
        const { data: lastMessage } = await supabase
          .from("messenger_messages")
          .select("content, timestamp")
          .eq("conversation_id", conversationId)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();
        
        if (lastMessage) {
          await supabase
            .from("messenger_conversations")
            .update({
              last_message: lastMessage.content,
              last_message_at: lastMessage.timestamp,
            })
            .eq("id", conversationId);
        }
      }
      
      // Next page of conversations
      conversationsUrl = convData.paging?.next || null;
    }
    
    res.json({
      success: true,
      message: `تم مزامنة ${totalConversations} محادثة و ${totalMessages} رسالة بنجاح`,
      conversations_synced: totalConversations,
      messages_synced: totalMessages,
    });
  } catch (error: any) {
    console.error("Error syncing historical messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Quick sync - just get recent conversations (last 7 days)
router.post("/pages/:pageId/quick-sync", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { pageId } = req.params;
    
    console.log(`[Messenger Quick-Sync] Starting for pageId: ${pageId}, orgId: ${orgId}`);
    
    // Get page from database - try messenger_pages first, then facebook_pages
    let page: any = null;
    
    // First try messenger_pages
    const { data: messengerPage } = await supabase
      .from("messenger_pages")
      .select("*")
      .eq("page_id", pageId)
      .maybeSingle();
    
    if (messengerPage) {
      page = messengerPage;
      console.log(`[Messenger Quick-Sync] Found in messenger_pages`);
    } else {
      // Try facebook_pages table
      const { data: facebookPage } = await supabase
        .from("facebook_pages")
        .select("*")
        .eq("page_id", pageId)
        .maybeSingle();
      
      if (facebookPage) {
        page = facebookPage;
        console.log(`[Messenger Quick-Sync] Found in facebook_pages`);
      }
    }
    
    if (!page) {
      console.log(`[Messenger Quick-Sync] Page not found in any table for pageId: ${pageId}`);
      return res.status(404).json({ error: "الصفحة غير موجودة" });
    }
    
    // Debug: log page data to see what fields are available
    console.log(`[Messenger Quick-Sync] Page data keys:`, Object.keys(page));
    console.log(`[Messenger Quick-Sync] Has access_token:`, !!page.access_token);
    console.log(`[Messenger Quick-Sync] Has access_token_encrypted:`, !!page.access_token_encrypted);
    
    // Debug: log first 50 chars of encrypted token to see format
    if (page.access_token_encrypted) {
      console.log(`[Messenger Quick-Sync] Token format preview: ${page.access_token_encrypted.substring(0, 80)}...`);
      console.log(`[Messenger Quick-Sync] Token contains ':' count: ${(page.access_token_encrypted.match(/:/g) || []).length}`);
    }
    
    // Get access token (different field names in different tables)
    // If from facebook_pages, token is encrypted and needs decryption
    let accessToken: string;
    if (page.access_token && typeof page.access_token === 'string' && page.access_token.length > 0) {
      accessToken = page.access_token;
      console.log(`[Messenger Quick-Sync] Using access_token (plain)`);
    } else if (page.access_token_encrypted && typeof page.access_token_encrypted === 'string' && page.access_token_encrypted.length > 0) {
      try {
        accessToken = decryptToken(page.access_token_encrypted);
        console.log(`[Messenger Quick-Sync] Successfully decrypted token`);
      } catch (err) {
        console.error("[Messenger Quick-Sync] Failed to decrypt token:", err);
        return res.status(400).json({ error: "فشل في فك تشفير Access Token - يرجى إعادة ربط الصفحة من تبويب الصفحات" });
      }
    } else {
      console.error(`[Messenger Quick-Sync] No valid token found. access_token=${page.access_token}, access_token_encrypted=${page.access_token_encrypted}`);
      return res.status(400).json({ error: "Access Token غير موجود للصفحة - يرجى إعادة ربط الصفحة من تبويب الصفحات" });
    }
    
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    // Get recent conversations
    const convResponse = await fetch(
      `${GRAPH_API}/${page.page_id}/conversations?fields=id,participants,updated_time,messages.limit(50){id,message,from,to,created_time}&access_token=${accessToken}&limit=50`
    );
    const convData = await convResponse.json();
    
    if (convData.error) {
      return res.status(400).json({ error: convData.error.message });
    }
    
    let synced = 0;
    
    for (const conv of convData.data || []) {
      const participant = conv.participants?.data?.find((p: any) => p.id !== page.page_id);
      if (!participant) continue;
      
      const psid = participant.id;
      
      // Upsert conversation
      const { data: conversation } = await supabase
        .from("messenger_conversations")
        .upsert({
          organization_id: orgId,
          page_id: page.id,
          psid: psid,
          customer_name: participant.name || "Unknown",
          is_active: true,
          last_message_at: conv.updated_time,
        }, { onConflict: 'page_id,psid' })
        .select()
        .single();
      
      if (!conversation) continue;
      
      // Insert messages
      for (const msg of conv.messages?.data || []) {
        const isFromPage = msg.from?.id === page.page_id;
        
        await supabase
          .from("messenger_messages")
          .upsert({
            organization_id: orgId,
            conversation_id: conversation.id,
            message_id: msg.id,
            direction: isFromPage ? "outbound" : "inbound",
            message_type: "text",
            content: msg.message || "",
            timestamp: msg.created_time,
            is_read: true,
            is_delivered: true,
          }, { onConflict: 'message_id' })
          .select();
        
        synced++;
      }
      
      // Update last message
      if (conv.messages?.data?.[0]) {
        await supabase
          .from("messenger_conversations")
          .update({
            last_message: conv.messages.data[0].message,
            last_message_at: conv.messages.data[0].created_time,
          })
          .eq("id", conversation.id);
      }
    }
    
    res.json({
      success: true,
      message: `تم مزامنة ${synced} رسالة من آخر 7 أيام`,
      messages_synced: synced,
    });
  } catch (error: any) {
    console.error("Error in quick sync:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
