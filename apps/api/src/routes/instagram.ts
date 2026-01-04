import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// Instagram Graph API Base URL
const INSTAGRAM_API = "https://graph.facebook.com/v18.0";

// ==================== INSTAGRAM ACCOUNT CONNECTION ====================

// Get connected Instagram accounts
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    
    const { data, error } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    res.json({ accounts: data || [] });
  } catch (error: any) {
    console.error("Error fetching Instagram accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

// Connect Instagram account (via Facebook Page)
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { access_token, page_id } = req.body;
    
    // Step 1: Get Page Access Token
    const pageResponse = await fetch(
      `${INSTAGRAM_API}/${page_id}?fields=instagram_business_account,name,access_token&access_token=${access_token}`
    );
    const pageData = await pageResponse.json();
    
    if (pageData.error) {
      return res.status(400).json({ error: pageData.error.message });
    }
    
    if (!pageData.instagram_business_account) {
      return res.status(400).json({ 
        error: "هذه الصفحة غير مرتبطة بحساب Instagram Business" 
      });
    }
    
    const igAccountId = pageData.instagram_business_account.id;
    const pageAccessToken = pageData.access_token;
    
    // Step 2: Get Instagram Account Info
    const igResponse = await fetch(
      `${INSTAGRAM_API}/${igAccountId}?fields=id,name,username,profile_picture_url,followers_count&access_token=${pageAccessToken}`
    );
    const igData = await igResponse.json();
    
    if (igData.error) {
      return res.status(400).json({ error: igData.error.message });
    }
    
    // Step 3: Store in database
    const { data, error } = await supabase
      .from("instagram_accounts")
      .upsert({
        organization_id: orgId,
        instagram_id: igAccountId,
        username: igData.username || igData.name,
        name: igData.name,
        profile_picture: igData.profile_picture_url,
        followers_count: igData.followers_count || 0,
        page_id: page_id,
        access_token: pageAccessToken,
        is_active: true,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,instagram_id' })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      account: data,
      message: "تم ربط حساب Instagram بنجاح"
    });
  } catch (error: any) {
    console.error("Error connecting Instagram:", error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Instagram account
router.delete("/accounts/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { id } = req.params;
    
    const { error } = await supabase
      .from("instagram_accounts")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);
    
    if (error) throw error;
    
    res.json({ success: true, message: "تم فصل الحساب بنجاح" });
  } catch (error: any) {
    console.error("Error disconnecting Instagram:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== INSTAGRAM WEBHOOK ====================

// Webhook verification (GET)
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  
  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "instagram_webhook_verify_token";
  
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Instagram webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// Webhook handler (POST) - Receive Instagram messages
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    
    if (body.object !== "instagram") {
      return res.sendStatus(404);
    }
    
    // Process each entry
    for (const entry of body.entry || []) {
      const igAccountId = entry.id;
      
      // Get organization from Instagram account
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("organization_id, access_token")
        .eq("instagram_id", igAccountId)
        .single();
      
      if (!account) continue;
      
      // Process messaging events
      for (const messagingEvent of entry.messaging || []) {
        if (messagingEvent.message) {
          await handleIncomingMessage(account, messagingEvent);
        }
        if (messagingEvent.postback) {
          await handlePostback(account, messagingEvent);
        }
        if (messagingEvent.reaction) {
          await handleReaction(account, messagingEvent);
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error("Instagram webhook error:", error);
    res.sendStatus(500);
  }
});

// Handle incoming Instagram message
async function handleIncomingMessage(account: any, event: any) {
  const senderId = event.sender.id;
  const message = event.message;
  const timestamp = event.timestamp;
  
  // Get or create contact
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", account.organization_id)
    .eq("instagram_id", senderId)
    .single();
  
  let contactId = contact?.id;
  
  if (!contactId) {
    // Fetch Instagram user info
    const userResponse = await fetch(
      `${INSTAGRAM_API}/${senderId}?fields=name,username,profile_pic&access_token=${account.access_token}`
    );
    const userData = await userResponse.json();
    
    // Create contact
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        organization_id: account.organization_id,
        instagram_id: senderId,
        name: userData.name || userData.username || `Instagram User`,
        instagram_username: userData.username,
        instagram_profile_pic: userData.profile_pic,
        source: "instagram",
      })
      .select()
      .single();
    
    contactId = newContact?.id;
  }
  
  // Determine message type and content
  let messageType = "text";
  let content = message.text || "";
  let mediaUrl = null;
  
  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    messageType = attachment.type; // image, video, audio, file, story_mention, story_reply
    mediaUrl = attachment.payload?.url;
    
    if (attachment.type === "story_mention") {
      content = "📸 أشار إليك في ستوري";
    } else if (attachment.type === "story_reply") {
      content = message.reply_to?.story?.url 
        ? `↩️ رد على ستوري: ${message.text || ''}`
        : message.text || '';
    }
  }
  
  // Store message
  await supabase.from("instagram_messages").insert({
    organization_id: account.organization_id,
    contact_id: contactId,
    instagram_sender_id: senderId,
    message_id: message.mid,
    direction: "inbound",
    message_type: messageType,
    content: content,
    media_url: mediaUrl,
    is_read: false,
    timestamp: new Date(timestamp).toISOString(),
  });
  
  // Update contact's last_message_at
  await supabase
    .from("contacts")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", contactId);
  
  // TODO: Trigger chatbot or auto-reply if configured
}

// Handle postback (button click)
async function handlePostback(account: any, event: any) {
  const senderId = event.sender.id;
  const postback = event.postback;
  
  // Store postback as message
  await supabase.from("instagram_messages").insert({
    organization_id: account.organization_id,
    instagram_sender_id: senderId,
    direction: "inbound",
    message_type: "postback",
    content: postback.title || postback.payload,
    metadata: { payload: postback.payload },
    timestamp: new Date(event.timestamp).toISOString(),
  });
}

// Handle reaction
async function handleReaction(account: any, event: any) {
  const reaction = event.reaction;
  
  // Update message with reaction
  if (reaction.mid) {
    await supabase
      .from("instagram_messages")
      .update({ 
        reaction: reaction.action === "react" ? reaction.emoji : null 
      })
      .eq("message_id", reaction.mid);
  }
}

// ==================== SEND MESSAGES ====================

// Get conversation with contact
router.get("/conversations/:contactId", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { contactId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const { data, error } = await supabase
      .from("instagram_messages")
      .select("*")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("timestamp", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    // Mark as read
    await supabase
      .from("instagram_messages")
      .update({ is_read: true })
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .eq("is_read", false);
    
    res.json({ messages: (data || []).reverse() });
  } catch (error: any) {
    console.error("Error fetching Instagram conversation:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send message
router.post("/send", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { contact_id, recipient_id, message_type, content, media_url, buttons } = req.body;
    
    // Get Instagram account
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .single();
    
    if (!account) {
      return res.status(400).json({ error: "لا يوجد حساب Instagram متصل" });
    }
    
    // Build message payload
    let messagePayload: any = {};
    
    switch (message_type) {
      case "text":
        messagePayload = { text: content };
        break;
        
      case "image":
        messagePayload = {
          attachment: {
            type: "image",
            payload: { url: media_url, is_reusable: true }
          }
        };
        break;
        
      case "video":
        messagePayload = {
          attachment: {
            type: "video",
            payload: { url: media_url, is_reusable: true }
          }
        };
        break;
        
      case "audio":
        messagePayload = {
          attachment: {
            type: "audio",
            payload: { url: media_url, is_reusable: true }
          }
        };
        break;
        
      case "file":
        messagePayload = {
          attachment: {
            type: "file",
            payload: { url: media_url, is_reusable: true }
          }
        };
        break;
        
      case "generic":
        // Carousel/Cards
        messagePayload = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: req.body.elements || []
            }
          }
        };
        break;
        
      case "quick_replies":
        messagePayload = {
          text: content,
          quick_replies: (buttons || []).map((btn: any) => ({
            content_type: "text",
            title: btn.title,
            payload: btn.payload || btn.title
          }))
        };
        break;
        
      default:
        messagePayload = { text: content };
    }
    
    // Send via Instagram API
    const response = await fetch(
      `${INSTAGRAM_API}/${account.instagram_id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipient_id },
          message: messagePayload,
          access_token: account.access_token
        })
      }
    );
    
    const result = await response.json();
    
    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }
    
    // Store sent message
    const { data: savedMessage, error } = await supabase
      .from("instagram_messages")
      .insert({
        organization_id: orgId,
        contact_id: contact_id,
        instagram_sender_id: account.instagram_id,
        message_id: result.message_id,
        direction: "outbound",
        message_type: message_type,
        content: content,
        media_url: media_url,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, message: savedMessage });
  } catch (error: any) {
    console.error("Error sending Instagram message:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ICE BREAKERS & PERSISTENT MENU ====================

// Set Ice Breakers (conversation starters)
router.post("/ice-breakers", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { ice_breakers } = req.body; // Array of { question, payload }
    
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .single();
    
    if (!account) {
      return res.status(400).json({ error: "لا يوجد حساب Instagram متصل" });
    }
    
    const response = await fetch(
      `${INSTAGRAM_API}/${account.instagram_id}/messenger_profile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ice_breakers: ice_breakers.slice(0, 4).map((ib: any) => ({
            question: ib.question,
            payload: ib.payload
          })),
          access_token: account.access_token
        })
      }
    );
    
    const result = await response.json();
    
    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }
    
    res.json({ success: true, message: "تم تحديث أسئلة بدء المحادثة" });
  } catch (error: any) {
    console.error("Error setting ice breakers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Set Persistent Menu
router.post("/persistent-menu", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const { menu_items } = req.body; // Array of { type, title, payload/url }
    
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .single();
    
    if (!account) {
      return res.status(400).json({ error: "لا يوجد حساب Instagram متصل" });
    }
    
    const response = await fetch(
      `${INSTAGRAM_API}/${account.instagram_id}/messenger_profile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persistent_menu: [{
            locale: "default",
            composer_input_disabled: false,
            call_to_actions: menu_items.slice(0, 3).map((item: any) => ({
              type: item.type === "url" ? "web_url" : "postback",
              title: item.title,
              ...(item.type === "url" ? { url: item.url } : { payload: item.payload })
            }))
          }],
          access_token: account.access_token
        })
      }
    );
    
    const result = await response.json();
    
    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }
    
    res.json({ success: true, message: "تم تحديث القائمة الدائمة" });
  } catch (error: any) {
    console.error("Error setting persistent menu:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== INSTAGRAM INSIGHTS ====================

// Get Instagram account insights
router.get("/insights", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const period = req.query.period as string || "day"; // day, week, month
    
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .single();
    
    if (!account) {
      return res.status(400).json({ error: "لا يوجد حساب Instagram متصل" });
    }
    
    // Get message stats from our database
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (period === "month" ? 30 : period === "week" ? 7 : 1));
    
    const { data: messages } = await supabase
      .from("instagram_messages")
      .select("direction, message_type, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", startDate.toISOString());
    
    const stats = {
      total_messages: messages?.length || 0,
      inbound: messages?.filter(m => m.direction === "inbound").length || 0,
      outbound: messages?.filter(m => m.direction === "outbound").length || 0,
      by_type: {} as Record<string, number>
    };
    
    messages?.forEach(m => {
      stats.by_type[m.message_type] = (stats.by_type[m.message_type] || 0) + 1;
    });
    
    // Get unique contacts who messaged
    const { count: activeContacts } = await supabase
      .from("instagram_messages")
      .select("instagram_sender_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("direction", "inbound")
      .gte("created_at", startDate.toISOString());
    
    res.json({
      account: {
        username: account.username,
        followers: account.followers_count,
        profile_picture: account.profile_picture
      },
      stats: {
        ...stats,
        active_contacts: activeContacts || 0,
        response_rate: stats.inbound > 0 
          ? Math.round((stats.outbound / stats.inbound) * 100) 
          : 0
      }
    });
  } catch (error: any) {
    console.error("Error fetching Instagram insights:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all Instagram conversations (inbox)
router.get("/inbox", async (req: Request, res: Response) => {
  try {
    const orgId = req.headers["x-organization-id"] as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    
    // Get contacts with their last Instagram message
    const { data: contacts, error } = await supabase
      .from("contacts")
      .select(`
        id,
        name,
        instagram_id,
        instagram_username,
        instagram_profile_pic,
        last_message_at
      `)
      .eq("organization_id", orgId)
      .not("instagram_id", "is", null)
      .order("last_message_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    if (error) throw error;
    
    // Get last message and unread count for each contact
    const enrichedContacts = await Promise.all((contacts || []).map(async (contact) => {
      const { data: lastMessage } = await supabase
        .from("instagram_messages")
        .select("content, message_type, direction, timestamp")
        .eq("contact_id", contact.id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();
      
      const { count: unreadCount } = await supabase
        .from("instagram_messages")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .eq("direction", "inbound")
        .eq("is_read", false);
      
      return {
        ...contact,
        last_message: lastMessage,
        unread_count: unreadCount || 0
      };
    }));
    
    res.json({ conversations: enrichedContacts });
  } catch (error: any) {
    console.error("Error fetching Instagram inbox:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
