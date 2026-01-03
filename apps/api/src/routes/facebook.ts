import { Router, Request, Response } from "express";
import crypto from "crypto";
import { Server } from "socket.io";
import { verifyToken } from "./auth";
import { validate } from "../middleware/validate";
import { supabase } from "../lib/supabase";
import * as FacebookManager from "../services/FacebookManager";
import TokenRefreshService from "../services/TokenRefreshService";
import {
  facebookOAuthCallbackSchema,
  facebookPageSubscribeSchema,
  facebookDisconnectPageSchema,
  syncCampaignsSchema,
  attributionReportQuerySchema,
} from "../schemas/facebookSchemas";

// Socket.io instance - will be set by createFacebookRoutes
let io: Server | null = null;

const router = Router();

// Factory function to create routes with io instance
export function createFacebookRoutes(socketIo: Server) {
  io = socketIo;
  return router;
}

// =====================================================
// Settings Management Routes
// =====================================================

/**
 * GET /api/facebook/settings
 * Get Facebook settings for organization (without exposing secrets)
 */
router.get("/settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const settings = await FacebookManager.getFacebookSettings(orgId);
    
    res.json({
      ok: true,
      data: settings ? {
        app_id: settings.app_id,
        verify_token: settings.verify_token,
        is_configured: true,
        // Never expose app_secret
      } : {
        is_configured: false,
      },
    });
  } catch (error: any) {
    console.error("Error fetching Facebook settings:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/facebook/settings
 * Save Facebook settings for organization
 */
router.post("/settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { app_id, app_secret, verify_token } = req.body;
    
    if (!app_id || !app_secret || !verify_token) {
      return res.status(400).json({
        error: "app_id, app_secret, and verify_token are required",
      });
    }
    
    await FacebookManager.saveFacebookSettings(orgId, {
      app_id,
      app_secret,
      verify_token,
    });
    
    res.json({
      ok: true,
      message: "Facebook settings saved successfully",
    });
  } catch (error: any) {
    console.error("Error saving Facebook settings:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/facebook/settings
 * Delete Facebook settings for organization
 */
router.delete("/settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    await FacebookManager.deleteFacebookSettings(orgId);
    
    res.json({
      ok: true,
      message: "Facebook settings deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting Facebook settings:", error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// OAuth Routes
// =====================================================

/**
 * GET /api/facebook/auth/url
 * Generate Facebook OAuth URL for page connection
 */
router.get("/auth/url", verifyToken, async (req: Request, res: Response) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUri = `${frontendUrl}/integrations/facebook/callback`;
    
    // Generate state token for CSRF protection
    const state = crypto.randomBytes(16).toString("hex");
    const orgId = (req as any).user.organizationId;
    
    // Store state in session/cookie for validation (using a simple approach here)
    // In production, use Redis or database
    const stateData = Buffer.from(JSON.stringify({ 
      state, 
      orgId,
      timestamp: Date.now() 
    })).toString("base64");
    
    const authUrl = await FacebookManager.getOAuthUrl(orgId, redirectUri, stateData);
    
    res.json({
      ok: true,
      data: {
        authUrl,
        state: stateData,
      },
    });
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error);
    res.status(500).json({
      error: error.message || "Failed to generate OAuth URL",
    });
  }
});

/**
 * POST /api/facebook/auth/callback
 * Handle OAuth callback and save connected pages
 */
router.post(
  "/auth/callback",
  verifyToken,
  validate(facebookOAuthCallbackSchema),
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query as { code: string; state?: string };
      const orgId = (req as any).user.organizationId;
      
      // Validate state if provided
      if (state) {
        try {
          const stateData = JSON.parse(Buffer.from(state, "base64").toString());
          
          // Check if state is not too old (5 minutes max)
          if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
            return res.status(400).json({ error: "OAuth state expired" });
          }
          
          // Validate organization match
          if (stateData.orgId !== orgId) {
            return res.status(403).json({ error: "Organization mismatch" });
          }
        } catch (e) {
          console.warn("Could not parse OAuth state:", e);
        }
      }
      
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const redirectUri = `${frontendUrl}/integrations/facebook/callback`;
      
      // Exchange code for access token
      const { accessToken } = await FacebookManager.exchangeCodeForToken(
        orgId,
        code,
        redirectUri
      );
      
      // Get long-lived token
      const { accessToken: longLivedToken } = await FacebookManager.getLongLivedToken(
        orgId,
        accessToken
      );
      
      // Get user's pages
      const pages = await FacebookManager.getUserPages(longLivedToken);
      
      if (pages.length === 0) {
        return res.status(400).json({
          error: "No Facebook pages found. Please make sure you have admin access to at least one page.",
        });
      }
      
      // Save pages to database
      await FacebookManager.saveConnectedPages(orgId, pages, longLivedToken);
      
      res.json({
        ok: true,
        message: `Successfully connected ${pages.length} page(s)`,
        data: {
          pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            picture: p.picture?.data?.url,
          })),
        },
      });
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      res.status(500).json({
        error: error.message || "Failed to complete Facebook connection",
      });
    }
  }
);

// =====================================================
// Page Management Routes
// =====================================================

/**
 * GET /api/facebook/pages
 * Get all connected Facebook pages for the organization
 */
router.get("/pages", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const pages = await FacebookManager.getConnectedPages(orgId);
    
    // Get pages that need token refresh
    const expiringPages = await TokenRefreshService.getPagesPendingExpiry(orgId);
    
    // Map pages with expiry warnings
    const pagesWithStatus = pages.map((page: any) => {
      const expiring = expiringPages.find((e) => e.page_id === page.page_id);
      
      return {
        id: page.id,
        page_id: page.page_id,
        page_name: page.page_name,
        page_picture_url: page.page_picture_url,
        is_active: page.is_active,
        webhook_subscribed: page.webhook_subscribed,
        token_expires_at: page.token_expires_at,
        last_synced_at: page.last_synced_at,
        created_at: page.created_at,
        token_status: expiring
          ? expiring.days_until_expiry <= 0
            ? "expired"
            : "expiring_soon"
          : "valid",
        days_until_expiry: expiring?.days_until_expiry,
      };
    });
    
    res.json({
      ok: true,
      data: pagesWithStatus,
    });
  } catch (error: any) {
    console.error("Error fetching pages:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch connected pages",
    });
  }
});

/**
 * POST /api/facebook/pages/:pageId/subscribe
 * Subscribe a page to webhook events
 */
router.post(
  "/pages/:pageId/subscribe",
  verifyToken,
  validate(facebookPageSubscribeSchema),
  async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const { subscribed_fields } = req.body;
      const orgId = (req as any).user.organizationId;
      
      // Get page access token
      const accessToken = await FacebookManager.getPageAccessToken(orgId, pageId);
      
      if (!accessToken) {
        return res.status(404).json({ error: "Page not found or not connected" });
      }
      
      // Subscribe to webhooks
      const success = await FacebookManager.subscribePage(
        pageId,
        accessToken,
        subscribed_fields
      );
      
      if (!success) {
        return res.status(500).json({ error: "Failed to subscribe to webhooks" });
      }
      
      // Update database
      await supabase
        .from("facebook_pages")
        .update({
          webhook_subscribed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", orgId)
        .eq("page_id", pageId);
      
      res.json({
        ok: true,
        message: "Successfully subscribed to webhooks",
      });
    } catch (error: any) {
      console.error("Error subscribing page:", error);
      res.status(500).json({
        error: error.message || "Failed to subscribe page to webhooks",
      });
    }
  }
);

/**
 * DELETE /api/facebook/pages/:pageId
 * Disconnect a Facebook page
 */
router.delete(
  "/pages/:pageId",
  verifyToken,
  validate(facebookDisconnectPageSchema),
  async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const orgId = (req as any).user.organizationId;
      
      const success = await FacebookManager.disconnectPage(orgId, pageId);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to disconnect page" });
      }
      
      res.json({
        ok: true,
        message: "Page disconnected successfully",
      });
    } catch (error: any) {
      console.error("Error disconnecting page:", error);
      res.status(500).json({
        error: error.message || "Failed to disconnect page",
      });
    }
  }
);

// =====================================================
// Campaign Routes
// =====================================================

/**
 * GET /api/facebook/ad-accounts
 * Get linked ad accounts
 */
router.get("/ad-accounts", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    
    // Get a page token to fetch ad accounts
    const pages = await FacebookManager.getConnectedPages(orgId);
    
    if (pages.length === 0) {
      return res.json({ ok: true, data: [] });
    }
    
    const accessToken = await FacebookManager.getPageAccessToken(
      orgId,
      pages[0].page_id
    );
    
    if (!accessToken) {
      return res.json({ ok: true, data: [] });
    }
    
    const adAccounts = await FacebookManager.getAdAccounts(accessToken);
    
    res.json({
      ok: true,
      data: adAccounts,
    });
  } catch (error: any) {
    console.error("Error fetching ad accounts:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch ad accounts",
    });
  }
});

/**
 * GET /api/facebook/campaigns
 * Get synced Facebook campaigns
 */
router.get("/campaigns", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    
    const { data, error } = await supabase
      .from("facebook_campaigns")
      .select("*")
      .eq("organization_id", orgId)
      .order("last_synced_at", { ascending: false });
    
    if (error) throw error;
    
    res.json({
      ok: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch campaigns",
    });
  }
});

/**
 * POST /api/facebook/campaigns/sync
 * Sync campaigns from Facebook Ads Manager
 */
router.post(
  "/campaigns/sync",
  verifyToken,
  validate(syncCampaignsSchema),
  async (req: Request, res: Response) => {
    try {
      const { ad_account_id } = req.body;
      const orgId = (req as any).user.organizationId;
      
      // Get a page token
      const pages = await FacebookManager.getConnectedPages(orgId);
      
      if (pages.length === 0) {
        return res.status(400).json({
          error: "No Facebook pages connected. Please connect a page first.",
        });
      }
      
      const accessToken = await FacebookManager.getPageAccessToken(
        orgId,
        pages[0].page_id
      );
      
      if (!accessToken) {
        return res.status(400).json({ error: "Could not get access token" });
      }
      
      const syncedCount = await FacebookManager.syncCampaignsToDatabase(
        orgId,
        ad_account_id,
        accessToken
      );
      
      res.json({
        ok: true,
        message: `Successfully synced ${syncedCount} campaigns`,
        data: { synced_count: syncedCount },
      });
    } catch (error: any) {
      console.error("Error syncing campaigns:", error);
      res.status(500).json({
        error: error.message || "Failed to sync campaigns",
      });
    }
  }
);

// =====================================================
// Attribution & Stats Routes
// =====================================================

/**
 * GET /api/facebook/stats
 * Get attribution statistics
 */
router.get(
  "/stats",
  verifyToken,
  validate(attributionReportQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).user.organizationId;
      const { start_date, end_date, source_type, campaign_name } = req.query;
      
      // Build query for customers with attribution
      let query = supabase
        .from("customers")
        .select("id, source_type, source_campaign_name, created_at")
        .eq("organization_id", orgId)
        .not("source_type", "is", null);
      
      if (start_date) {
        query = query.gte("created_at", start_date as string);
      }
      if (end_date) {
        query = query.lte("created_at", end_date as string);
      }
      if (source_type) {
        query = query.eq("source_type", source_type as string);
      }
      if (campaign_name) {
        query = query.eq("source_campaign_name", campaign_name as string);
      }
      
      const { data: customers, error } = await query;
      
      if (error) throw error;
      
      // Aggregate by source
      const statsBySource: Record<string, { count: number; campaigns: Record<string, number> }> = {};
      
      for (const customer of customers || []) {
        const source = customer.source_type || "direct";
        const campaign = customer.source_campaign_name || "unknown";
        
        if (!statsBySource[source]) {
          statsBySource[source] = { count: 0, campaigns: {} };
        }
        
        statsBySource[source].count++;
        statsBySource[source].campaigns[campaign] =
          (statsBySource[source].campaigns[campaign] || 0) + 1;
      }
      
      // Get click events
      const { data: clicks } = await supabase
        .from("click_attribution_events")
        .select("id, status, source_type")
        .eq("organization_id", orgId);
      
      const clickStats = {
        total: clicks?.length || 0,
        converted: clicks?.filter((c: any) => c.status === "converted").length || 0,
        pending: clicks?.filter((c: any) => c.status === "pending").length || 0,
      };
      
      res.json({
        ok: true,
        data: {
          total_attributed_customers: customers?.length || 0,
          by_source: statsBySource,
          clicks: clickStats,
          conversion_rate:
            clickStats.total > 0
              ? ((clickStats.converted / clickStats.total) * 100).toFixed(2)
              : 0,
        },
      });
    } catch (error: any) {
      console.error("Error fetching stats:", error);
      res.status(500).json({
        error: error.message || "Failed to fetch attribution stats",
      });
    }
  }
);

// =====================================================
// Messenger Messaging Routes
// =====================================================

/**
 * POST /api/facebook/messages/send
 * Send a message via Messenger
 */
router.post("/messages/send", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { recipientPsid, message, conversationId } = req.body;
    
    if (!recipientPsid || !message) {
      return res.status(400).json({
        error: "recipientPsid and message are required",
      });
    }
    
    // Get the page for this organization
    const { data: page, error: pageError } = await supabase
      .from("facebook_pages")
      .select("id, page_id, access_token_encrypted")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .single();
    
    if (pageError || !page) {
      return res.status(400).json({
        error: "No connected Facebook page found",
      });
    }
    
    // Decrypt access token
    const accessToken = FacebookManager.decryptToken(page.access_token_encrypted);
    
    // Send message via Graph API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${page.page_id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientPsid },
          message: { text: message },
          access_token: accessToken,
        }),
      }
    );
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error?.message || "Failed to send message");
    }
    
    // Save message to database
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("facebook_psid", recipientPsid)
      .single();
    
    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        organization_id: orgId,
        customer_id: customer?.id,
        conversation_id: conversationId,
        fb_message_id: result.message_id,
        body: message,
        is_from_customer: false,
        channel: "facebook",
        timestamp: new Date().toISOString(),
      })
      .select("id, body, timestamp")
      .single();
    
    // Emit socket event
    if (io && savedMessage) {
      io.to(orgId).emit("fb:message", {
        clientId: orgId,
        message: {
          id: savedMessage.id,
          fb_message_id: result.message_id,
          body: message,
          is_from_customer: false,
          timestamp: savedMessage.timestamp,
          channel: "facebook",
        },
        conversation: {
          id: conversationId,
          channel: "facebook",
        },
      });
    }
    
    res.json({
      ok: true,
      data: {
        message_id: result.message_id,
        recipient_id: result.recipient_id,
      },
    });
  } catch (error: any) {
    console.error("Error sending Messenger message:", error);
    res.status(500).json({
      error: error.message || "Failed to send message",
    });
  }
});

/**
 * GET /api/facebook/conversations
 * Get all Facebook/Messenger conversations
 */
router.get("/conversations", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(`
        id,
        customer_id,
        channel,
        status,
        last_message_at,
        last_customer_message_at,
        facebook_conversation_id,
        created_at,
        customers (
          id,
          name,
          facebook_psid,
          source_type,
          source_campaign_name
        )
      `)
      .eq("organization_id", orgId)
      .eq("channel", "facebook")
      .order("last_message_at", { ascending: false });
    
    if (error) throw error;
    
    res.json({
      ok: true,
      data: conversations || [],
    });
  } catch (error: any) {
    console.error("Error fetching Messenger conversations:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch conversations",
    });
  }
});

/**
 * GET /api/facebook/conversations/:id/messages
 * Get messages for a specific conversation
 */
router.get("/conversations/:id/messages", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const conversationId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("organization_id", orgId)
      .eq("conversation_id", conversationId)
      .eq("channel", "facebook")
      .order("timestamp", { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    
    res.json({
      ok: true,
      data: messages || [],
    });
  } catch (error: any) {
    console.error("Error fetching conversation messages:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch messages",
    });
  }
});

/**
 * GET /api/facebook/attribution-report
 * Get detailed attribution report
 */
router.get(
  "/attribution-report",
  verifyToken,
  validate(attributionReportQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).user.organizationId;
      const { start_date, end_date } = req.query;
      
      // Use the attribution_report view
      let query = supabase
        .from("attribution_report")
        .select("*")
        .eq("organization_id", orgId);
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Calculate conversion rates
      const reportWithRates = (data || []).map((row: any) => ({
        ...row,
        conversion_rate:
          row.customer_count > 0
            ? ((row.customers_with_deals / row.customer_count) * 100).toFixed(2)
            : 0,
        avg_deal_value:
          row.deal_count > 0
            ? (row.total_deal_value / row.deal_count).toFixed(2)
            : 0,
      }));
      
      res.json({
        ok: true,
        data: reportWithRates,
      });
    } catch (error: any) {
      console.error("Error fetching attribution report:", error);
      res.status(500).json({
        error: error.message || "Failed to fetch attribution report",
      });
    }
  }
);

// =====================================================
// Webhook Routes (Public - No Auth)
// =====================================================

/**
 * GET /webhooks/facebook
 * Webhook verification endpoint
 */
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  
  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
  
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Facebook Webhook] Verification successful");
    res.status(200).send(challenge);
  } else {
    console.warn("[Facebook Webhook] Verification failed");
    res.sendStatus(403);
  }
});

/**
 * POST /webhooks/facebook
 * Receive webhook events
 */
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Verify signature
    const signature = req.headers["x-hub-signature-256"] as string;
    
    if (signature) {
      const payload = JSON.stringify(req.body);
      const isValid = FacebookManager.verifyWebhookSignature(payload, signature);
      
      if (!isValid) {
        console.warn("[Facebook Webhook] Invalid signature");
        return res.sendStatus(403);
      }
    }
    
    const { object, entry } = req.body;
    
    // Log the webhook event
    for (const e of entry || []) {
      await supabase.from("facebook_webhooks_log").insert({
        event_type: object,
        page_id: e.id,
        payload: e,
        processed: false,
      });
    }
    
    // Process events asynchronously
    if (object === "page") {
      for (const e of entry || []) {
        // Process messaging events
        if (e.messaging) {
          for (const messaging of e.messaging) {
            await processMessagingEvent(e.id, messaging);
          }
        }
        
        // Process leadgen events
        if (e.changes) {
          for (const change of e.changes) {
            if (change.field === "leadgen") {
              await processLeadgenEvent(e.id, change.value);
            }
          }
        }
      }
    }
    
    // Always respond with 200 quickly
    res.sendStatus(200);
  } catch (error) {
    console.error("[Facebook Webhook] Error:", error);
    // Still respond 200 to prevent retries
    res.sendStatus(200);
  }
});

// =====================================================
// Webhook Event Processors
// =====================================================

async function processMessagingEvent(
  pageId: string,
  messaging: any
): Promise<void> {
  try {
    const senderId = messaging.sender?.id;
    const recipientId = messaging.recipient?.id;
    const message = messaging.message;
    const timestamp = messaging.timestamp;
    const referral = messaging.referral || message?.referral;
    
    // Skip if no message content (e.g., read receipts, typing indicators)
    if (!message) {
      console.log(`[Facebook Webhook] Non-message event from ${senderId}, skipping`);
      return;
    }
    
    console.log(`[Facebook Webhook] Message from ${senderId} to page ${pageId}`);
    
    // Find the organization for this page
    const { data: page } = await supabase
      .from("facebook_pages")
      .select("organization_id, page_name")
      .eq("page_id", pageId)
      .eq("is_active", true)
      .single();
    
    if (!page) {
      console.warn(`[Facebook Webhook] No organization found for page ${pageId}`);
      return;
    }
    
    const orgId = page.organization_id;
    
    // Extract attribution data from referral
    let attributionData: any = null;
    if (referral) {
      attributionData = {
        source_type: "facebook",
        source_ad_id: referral.ad_id,
        ctwa_clid: referral.ctwa_clid,
        ref: referral.ref,
        source: referral.source,
      };
      
      // If this is from an ad, try to get campaign info
      if (referral.ad_id) {
        const { data: campaign } = await supabase
          .from("facebook_campaigns")
          .select("fb_campaign_id, fb_campaign_name")
          .eq("organization_id", orgId)
          .limit(1)
          .single();
        
        if (campaign) {
          attributionData.source_campaign_id = campaign.fb_campaign_id;
          attributionData.source_campaign_name = campaign.fb_campaign_name;
        }
      }
    }
    
    // Get or create customer by Facebook PSID
    let customerId: string;
    let customerName: string;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("facebook_psid", senderId)
      .single();
    
    if (existingCustomer) {
      customerId = existingCustomer.id;
      customerName = existingCustomer.name;
      // Update last contact
      await supabase
        .from("customers")
        .update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingCustomer.id);
    } else {
      // Create new customer with attribution
      const newCustomerName = `Facebook User ${senderId.slice(-4)}`;
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId,
          name: newCustomerName,
          facebook_psid: senderId,
          channel: "facebook",
          status: "pending",
          source_type: attributionData?.source_type || "facebook",
          source_campaign_id: attributionData?.source_campaign_id,
          source_campaign_name: attributionData?.source_campaign_name,
          source_ad_id: attributionData?.source_ad_id,
          ctwa_clid: attributionData?.ctwa_clid,
          first_touch_at: new Date().toISOString(),
          attribution_data: attributionData || {},
        })
        .select("id")
        .single();
      
      if (customerError || !newCustomer) {
        console.error("[Facebook Webhook] Error creating customer:", customerError);
        return;
      }
      customerId = newCustomer.id;
      customerName = newCustomerName;
    }
    
    // Get or create conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", orgId)
      .eq("customer_id", customerId)
      .eq("channel", "facebook")
      .single();
    
    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      // Update last message timestamp
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_customer_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          organization_id: orgId,
          customer_id: customerId,
          channel: "facebook",
          facebook_conversation_id: `${pageId}_${senderId}`,
          status: "open",
          last_message_at: new Date().toISOString(),
          last_customer_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      
      if (convError || !newConv) {
        console.error("[Facebook Webhook] Error creating conversation:", convError);
        return;
      }
      conversationId = newConv.id;
    }
    
    // Extract message content
    const messageBody = message.text || "";
    const messageId = message.mid;
    const hasAttachments = message.attachments && message.attachments.length > 0;
    
    // Prepare attachments info
    let attachmentData: any = null;
    if (hasAttachments) {
      attachmentData = message.attachments.map((att: any) => ({
        type: att.type, // image, video, audio, file
        url: att.payload?.url,
      }));
    }
    
    // Save message to database
    const { data: savedMessage, error: msgError } = await supabase
      .from("messages")
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        conversation_id: conversationId,
        fb_message_id: messageId,
        body: hasAttachments && !messageBody 
          ? `[${message.attachments[0].type}]` 
          : messageBody,
        is_from_customer: true,
        channel: "facebook",
        media_type: hasAttachments ? message.attachments[0].type : null,
        media_url: hasAttachments ? message.attachments[0].payload?.url : null,
        timestamp: new Date(timestamp).toISOString(),
      })
      .select("id, body, timestamp, media_type, media_url")
      .single();
    
    if (msgError) {
      console.error("[Facebook Webhook] Error saving message:", msgError);
      return;
    }
    
    console.log(`[Facebook Webhook] Saved message ${messageId} for customer ${customerId}`);
    
    // Emit socket event to frontend
    if (io) {
      const messageData = {
        id: savedMessage.id,
        fb_message_id: messageId,
        body: savedMessage.body,
        is_from_customer: true,
        timestamp: savedMessage.timestamp,
        channel: "facebook",
        media_type: savedMessage.media_type,
        media_url: savedMessage.media_url,
        customer: {
          id: customerId,
          name: customerName,
          facebook_psid: senderId,
        },
        conversation_id: conversationId,
      };
      
      io.to(orgId).emit("fb:message", {
        clientId: orgId,
        message: messageData,
        conversation: {
          id: conversationId,
          customer_id: customerId,
          channel: "facebook",
        },
      });
      
      console.log(`[Facebook Webhook] Emitted fb:message to org ${orgId}`);
    }
    
    // Mark webhook as processed
    await supabase
      .from("facebook_webhooks_log")
      .update({ processed: true })
      .eq("page_id", pageId)
      .eq("processed", false);
  } catch (error) {
    console.error("[Facebook Webhook] Error processing messaging event:", error);
  }
}

async function processLeadgenEvent(pageId: string, leadData: any): Promise<void> {
  try {
    console.log(`[Facebook Webhook] New lead ${leadData.leadgen_id} for page ${pageId}`);
    
    // Find the organization
    const { data: page } = await supabase
      .from("facebook_pages")
      .select("organization_id, access_token_encrypted")
      .eq("page_id", pageId)
      .eq("is_active", true)
      .single();
    
    if (!page) {
      console.warn(`[Facebook Webhook] No organization found for page ${pageId}`);
      return;
    }
    
    const orgId = page.organization_id;
    
    // Get lead details from Facebook
    const accessToken = FacebookManager.decryptToken(page.access_token_encrypted);
    const leadDetails = await FacebookManager.getLeadDetails(
      leadData.leadgen_id,
      accessToken
    );
    
    if (!leadDetails) {
      console.warn(`[Facebook Webhook] Could not fetch lead details`);
      return;
    }
    
    // Parse lead field data
    const fieldData: Record<string, string> = {};
    for (const field of leadDetails.field_data || []) {
      fieldData[field.name] = field.values[0];
    }
    
    const phone = fieldData.phone_number || fieldData.phone;
    const email = fieldData.email;
    const name = fieldData.full_name || fieldData.name || `Lead ${leadData.leadgen_id.slice(-4)}`;
    
    // Create customer from lead
    await supabase.from("customers").insert({
      organization_id: orgId,
      name,
      phone: phone || null,
      email: email || null,
      channel: "facebook",
      status: "pending",
      customer_type: "lead",
      source_type: "facebook_lead_ad",
      source_ad_id: leadData.ad_id,
      first_touch_at: new Date(leadData.created_time * 1000).toISOString(),
      attribution_data: {
        leadgen_id: leadData.leadgen_id,
        form_id: leadData.form_id,
        adgroup_id: leadData.adgroup_id,
        field_data: fieldData,
      },
    });
    
    console.log(`[Facebook Webhook] Created customer from lead: ${name}`);
  } catch (error) {
    console.error("[Facebook Webhook] Error processing leadgen event:", error);
  }
}

export default router;
