import crypto from "crypto";
import { supabase } from "../lib/supabase";

// =====================================================
// Facebook Manager Service
// =====================================================
// Handles all Facebook Graph API interactions including:
// - OAuth flow for page connection
// - Page management and webhook subscriptions
// - Campaign syncing from Ads Manager
// - Conversions API for event tracking
// =====================================================

const FB_API_VERSION = process.env.FACEBOOK_API_VERSION || "v21.0";
const FB_GRAPH_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

// Encryption key for storing access tokens
const ENCRYPTION_KEY = process.env.FACEBOOK_ENCRYPTION_KEY || process.env.JWT_SECRET || "default-key-change-in-production";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

// =====================================================
// Types
// =====================================================

export interface FacebookSettings {
  app_id: string;
  app_secret: string;
  verify_token: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  picture?: {
    data: {
      url: string;
    };
  };
  category?: string;
}

export interface FacebookUser {
  id: string;
  name: string;
  email?: string;
}

export interface FacebookCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface FacebookInsights {
  reach?: number;
  impressions?: number;
  clicks?: number;
  spend?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
}

export interface ConversionEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  event_source_url?: string;
  action_source: "website" | "business_messaging";
  messaging_channel?: "whatsapp" | "messenger";
  user_data: {
    phone?: string;
    email?: string;
    fbc?: string;
    fbp?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    ctwa_clid?: string;
    page_id?: string;
    page_scoped_user_id?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_name?: string;
    content_category?: string;
  };
}

// =====================================================
// Encryption Utilities
// =====================================================

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the secret
  return crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptToken(encryptedData: string): string {
  try {
    // Validate input
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error(`Invalid encrypted data: received ${typeof encryptedData}`);
    }
    
    // Check format (should be iv:authTag:encrypted)
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      console.error(`[decryptToken] Invalid format. Expected 3 parts (iv:authTag:encrypted), got ${parts.length}. Value starts with: ${encryptedData.substring(0, 50)}...`);
      throw new Error(`Invalid token format: expected 3 parts, got ${parts.length}`);
    }
    
    const [ivHex, authTagHex, encrypted] = parts;
    
    // Validate each part
    if (!ivHex || !authTagHex || !encrypted) {
      console.error(`[decryptToken] Missing parts. iv: ${!!ivHex}, authTag: ${!!authTagHex}, encrypted: ${!!encrypted}`);
      throw new Error("Invalid token format: missing parts");
    }
    
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Error decrypting token:", error);
    throw new Error("Failed to decrypt access token");
  }
}

// =====================================================
// API Helper
// =====================================================

async function callFacebookAPI<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    accessToken?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = "GET", accessToken, body, params } = options;
  
  let url = `${FB_GRAPH_URL}${endpoint}`;
  
  // Add query parameters
  const queryParams = new URLSearchParams();
  if (accessToken) {
    queryParams.set("access_token", accessToken);
  }
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      queryParams.set(key, value);
    });
  }
  
  if (queryParams.toString()) {
    url += `?${queryParams.toString()}`;
  }
  
  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  
  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, fetchOptions);
  const data = await response.json();
  
  if (!response.ok) {
    const errorMessage = data.error?.message || "Facebook API error";
    const errorCode = data.error?.code;
    console.error("Facebook API Error:", { endpoint, errorCode, errorMessage });
    throw new Error(`Facebook API Error: ${errorMessage} (Code: ${errorCode})`);
  }
  
  return data as T;
}

// =====================================================
// Settings Management (Per-Organization)
// =====================================================

export async function getFacebookSettings(organizationId: string): Promise<FacebookSettings | null> {
  const { data, error } = await supabase
    .from("facebook_settings")
    .select("app_id, app_secret_encrypted, verify_token")
    .eq("organization_id", organizationId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return {
    app_id: data.app_id,
    app_secret: decryptToken(data.app_secret_encrypted),
    verify_token: data.verify_token,
  };
}

export async function saveFacebookSettings(
  organizationId: string,
  settings: { app_id: string; app_secret: string; verify_token: string }
): Promise<void> {
  const encryptedSecret = encryptToken(settings.app_secret);
  
  const { error } = await supabase
    .from("facebook_settings")
    .upsert({
      organization_id: organizationId,
      app_id: settings.app_id,
      app_secret_encrypted: encryptedSecret,
      verify_token: settings.verify_token,
      is_configured: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "organization_id",
    });
  
  if (error) {
    throw new Error(`Failed to save Facebook settings: ${error.message}`);
  }
}

export async function deleteFacebookSettings(organizationId: string): Promise<void> {
  const { error } = await supabase
    .from("facebook_settings")
    .delete()
    .eq("organization_id", organizationId);
  
  if (error) {
    throw new Error(`Failed to delete Facebook settings: ${error.message}`);
  }
}

// =====================================================
// OAuth Methods
// =====================================================

export async function getOAuthUrl(organizationId: string, redirectUri: string, state?: string): Promise<string> {
  // Try to get settings from database first
  const settings = await getFacebookSettings(organizationId);
  const appId = settings?.app_id || process.env.FACEBOOK_APP_ID;
  
  if (!appId) {
    throw new Error("FACEBOOK_APP_ID is not configured");
  }
  
  // Request pages_show_list to access user's Facebook pages
  const permissions = "public_profile,email,pages_show_list";
  
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: permissions,
    response_type: "code",
    state: state || crypto.randomBytes(16).toString("hex"),
  });
  
  return `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForToken(
  organizationId: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresIn: number }> {
  // Get settings from database or fallback to env
  const settings = await getFacebookSettings(organizationId);
  const appId = settings?.app_id || process.env.FACEBOOK_APP_ID;
  const appSecret = settings?.app_secret || process.env.FACEBOOK_APP_SECRET;
  
  if (!appId || !appSecret) {
    throw new Error("Facebook App credentials are not configured");
  }
  
  const response = await callFacebookAPI<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>("/oauth/access_token", {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
  });
  
  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
  };
}

export async function getLongLivedToken(
  organizationId: string,
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  // Get settings from database or fallback to env
  const settings = await getFacebookSettings(organizationId);
  const appId = settings?.app_id || process.env.FACEBOOK_APP_ID;
  const appSecret = settings?.app_secret || process.env.FACEBOOK_APP_SECRET;
  
  if (!appId || !appSecret) {
    throw new Error("Facebook App credentials are not configured");
  }
  
  const response = await callFacebookAPI<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  
  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in, // Usually ~60 days
  };
}

export async function getUserInfo(accessToken: string): Promise<FacebookUser> {
  return callFacebookAPI<FacebookUser>("/me", {
    accessToken,
    params: {
      fields: "id,name,email",
    },
  });
}

// =====================================================
// Page Management
// =====================================================

export async function getUserPages(accessToken: string): Promise<FacebookPage[]> {
  const response = await callFacebookAPI<{
    data: FacebookPage[];
  }>("/me/accounts", {
    accessToken,
    params: {
      fields: "id,name,access_token,picture,category",
    },
  });
  
  return response.data || [];
}

export async function subscribePage(
  pageId: string,
  pageAccessToken: string,
  fields: string[] = ["messages", "messaging_postbacks", "leadgen"]
): Promise<boolean> {
  try {
    await callFacebookAPI(`/${pageId}/subscribed_apps`, {
      method: "POST",
      accessToken: pageAccessToken,
      body: {
        subscribed_fields: fields,
      },
    });
    return true;
  } catch (error) {
    console.error("Error subscribing page:", error);
    return false;
  }
}

export async function unsubscribePage(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  try {
    await callFacebookAPI(`/${pageId}/subscribed_apps`, {
      method: "DELETE",
      accessToken: pageAccessToken,
    });
    return true;
  } catch (error) {
    console.error("Error unsubscribing page:", error);
    return false;
  }
}

// =====================================================
// Database Operations
// =====================================================

export async function saveConnectedPages(
  organizationId: string,
  pages: FacebookPage[],
  userAccessToken: string
): Promise<void> {
  for (const page of pages) {
    // Get long-lived page token
    let pageToken = page.access_token;
    
    try {
      // Exchange for long-lived token if we have a short-lived one
      const longLived = await getLongLivedToken(organizationId, userAccessToken);
      
      // Get page tokens using long-lived user token
      const pagesWithLongTokens = await getUserPages(longLived.accessToken);
      const pageWithLongToken = pagesWithLongTokens.find((p) => p.id === page.id);
      
      if (pageWithLongToken) {
        pageToken = pageWithLongToken.access_token;
      }
    } catch (error) {
      console.warn("Could not get long-lived page token, using original:", error);
    }
    
    // Encrypt the access token
    const encryptedToken = encryptToken(pageToken);
    
    // Calculate expiry (60 days for long-lived tokens)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);
    
    // Upsert the page
    const { error } = await supabase
      .from("facebook_pages")
      .upsert(
        {
          organization_id: organizationId,
          page_id: page.id,
          page_name: page.name,
          page_picture_url: page.picture?.data?.url,
          access_token_encrypted: encryptedToken,
          token_expires_at: expiresAt.toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id,page_id",
        }
      );
    
    if (error) {
      console.error("Error saving Facebook page:", error);
      throw error;
    }
  }
}

export async function getConnectedPages(organizationId: string) {
  const { data, error } = await supabase
    .from("facebook_pages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("Error fetching connected pages:", error);
    throw error;
  }
  
  return data || [];
}

export async function getPageAccessToken(
  organizationId: string,
  pageId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("facebook_pages")
    .select("access_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("page_id", pageId)
    .eq("is_active", true)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return decryptToken(data.access_token_encrypted);
}

export async function disconnectPage(
  organizationId: string,
  pageId: string
): Promise<boolean> {
  // Get the page token first to unsubscribe
  const accessToken = await getPageAccessToken(organizationId, pageId);
  
  if (accessToken) {
    await unsubscribePage(pageId, accessToken);
  }
  
  // Mark as inactive
  const { error } = await supabase
    .from("facebook_pages")
    .update({
      is_active: false,
      webhook_subscribed: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("page_id", pageId);
  
  return !error;
}

// =====================================================
// Campaign Management
// =====================================================

export async function getAdAccounts(accessToken: string): Promise<
  Array<{
    id: string;
    account_id: string;
    name: string;
    currency: string;
  }>
> {
  const response = await callFacebookAPI<{
    data: Array<{
      id: string;
      account_id: string;
      name: string;
      currency: string;
    }>;
  }>("/me/adaccounts", {
    accessToken,
    params: {
      fields: "id,account_id,name,currency",
    },
  });
  
  return response.data || [];
}

export async function getCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<FacebookCampaign[]> {
  const response = await callFacebookAPI<{
    data: FacebookCampaign[];
  }>(`/act_${adAccountId}/campaigns`, {
    accessToken,
    params: {
      fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
      limit: "100",
    },
  });
  
  return response.data || [];
}

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string
): Promise<FacebookInsights | null> {
  try {
    const response = await callFacebookAPI<{
      data: Array<{
        reach?: string;
        impressions?: string;
        clicks?: string;
        spend?: string;
        cpc?: string;
        cpm?: string;
        ctr?: string;
      }>;
    }>(`/${campaignId}/insights`, {
      accessToken,
      params: {
        fields: "reach,impressions,clicks,spend,cpc,cpm,ctr",
        date_preset: "last_30d",
      },
    });
    
    if (response.data && response.data.length > 0) {
      const insight = response.data[0];
      return {
        reach: insight.reach ? parseInt(insight.reach) : undefined,
        impressions: insight.impressions ? parseInt(insight.impressions) : undefined,
        clicks: insight.clicks ? parseInt(insight.clicks) : undefined,
        spend: insight.spend,
        cpc: insight.cpc,
        cpm: insight.cpm,
        ctr: insight.ctr,
      };
    }
    
    return null;
  } catch (error) {
    console.warn("Could not fetch campaign insights:", error);
    return null;
  }
}

export async function syncCampaignsToDatabase(
  organizationId: string,
  adAccountId: string,
  accessToken: string
): Promise<number> {
  const campaigns = await getCampaigns(adAccountId, accessToken);
  let syncedCount = 0;
  
  // First ensure ad account exists
  const { data: adAccount } = await supabase
    .from("facebook_ad_accounts")
    .upsert(
      {
        organization_id: organizationId,
        ad_account_id: adAccountId,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,ad_account_id" }
    )
    .select()
    .single();
  
  for (const campaign of campaigns) {
    // Get insights for each campaign
    const insights = await getCampaignInsights(campaign.id, accessToken);
    
    const { error } = await supabase
      .from("facebook_campaigns")
      .upsert(
        {
          organization_id: organizationId,
          ad_account_id: adAccount?.id,
          fb_campaign_id: campaign.id,
          fb_campaign_name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          daily_budget: campaign.daily_budget
            ? parseFloat(campaign.daily_budget) / 100
            : null,
          lifetime_budget: campaign.lifetime_budget
            ? parseFloat(campaign.lifetime_budget) / 100
            : null,
          start_time: campaign.start_time,
          stop_time: campaign.stop_time,
          insights: insights || {},
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,fb_campaign_id" }
      );
    
    if (!error) {
      syncedCount++;
    }
  }
  
  return syncedCount;
}

// =====================================================
// Conversions API
// =====================================================

export async function sendConversionEvent(
  pixelId: string,
  accessToken: string,
  event: ConversionEvent
): Promise<boolean> {
  try {
    // Hash PII data
    const hashedUserData: Record<string, string> = {};
    
    if (event.user_data.phone) {
      hashedUserData.ph = hashData(normalizePhone(event.user_data.phone));
    }
    if (event.user_data.email) {
      hashedUserData.em = hashData(event.user_data.email.toLowerCase().trim());
    }
    if (event.user_data.fbc) {
      hashedUserData.fbc = event.user_data.fbc;
    }
    if (event.user_data.fbp) {
      hashedUserData.fbp = event.user_data.fbp;
    }
    if (event.user_data.client_ip_address) {
      hashedUserData.client_ip_address = event.user_data.client_ip_address;
    }
    if (event.user_data.client_user_agent) {
      hashedUserData.client_user_agent = event.user_data.client_user_agent;
    }
    
    const eventData = {
      event_name: event.event_name,
      event_time: event.event_time,
      event_id: event.event_id || `${event.event_name}_${Date.now()}_${Math.random()}`,
      event_source_url: event.event_source_url,
      action_source: event.action_source,
      user_data: hashedUserData,
      custom_data: event.custom_data,
    };
    
    await callFacebookAPI(`/${pixelId}/events`, {
      method: "POST",
      accessToken,
      body: {
        data: [eventData],
      },
    });
    
    return true;
  } catch (error) {
    console.error("Error sending conversion event:", error);
    return false;
  }
}

// Helper function to hash data for Conversions API
function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Helper function to normalize phone numbers
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// =====================================================
// Messenger Messaging
// =====================================================

export async function sendMessengerMessage(
  pageId: string,
  recipientPsid: string,
  message: string,
  accessToken: string
): Promise<{ messageId: string } | null> {
  try {
    const response = await callFacebookAPI<{
      recipient_id: string;
      message_id: string;
    }>(`/${pageId}/messages`, {
      method: "POST",
      accessToken,
      body: {
        recipient: { id: recipientPsid },
        message: { text: message },
        messaging_type: "RESPONSE",
      },
    });
    
    return { messageId: response.message_id };
  } catch (error) {
    console.error("Error sending Messenger message:", error);
    return null;
  }
}

// =====================================================
// Lead Retrieval
// =====================================================

export async function getLeadDetails(
  leadgenId: string,
  accessToken: string
): Promise<{
  id: string;
  field_data: Array<{ name: string; values: string[] }>;
  created_time: string;
} | null> {
  try {
    const response = await callFacebookAPI<{
      id: string;
      field_data: Array<{ name: string; values: string[] }>;
      created_time: string;
    }>(`/${leadgenId}`, {
      accessToken,
      params: {
        fields: "id,field_data,created_time",
      },
    });
    
    return response;
  } catch (error) {
    console.error("Error fetching lead details:", error);
    return null;
  }
}

// =====================================================
// Webhook Signature Verification
// =====================================================

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  
  if (!appSecret) {
    // Return true to skip verification if secret not configured (development mode)
    return true;
  }
  
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex")}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// =====================================================
// Export default instance
// =====================================================

export const FacebookManager = {
  // OAuth
  getOAuthUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  getUserInfo,
  
  // Pages
  getUserPages,
  subscribePage,
  unsubscribePage,
  saveConnectedPages,
  getConnectedPages,
  getPageAccessToken,
  disconnectPage,
  
  // Campaigns
  getAdAccounts,
  getCampaigns,
  getCampaignInsights,
  syncCampaignsToDatabase,
  
  // Conversions
  sendConversionEvent,
  
  // Messenger
  sendMessengerMessage,
  
  // Leads
  getLeadDetails,
  
  // Security
  verifyWebhookSignature,
  
  // Token encryption
  encryptToken,
  decryptToken,
};

export default FacebookManager;
