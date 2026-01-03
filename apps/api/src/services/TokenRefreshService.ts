import { supabase } from "../lib/supabase";
import { FacebookManager, decryptToken, encryptToken, getLongLivedToken } from "./FacebookManager";

// =====================================================
// Token Refresh Service
// =====================================================
// Handles automatic refresh of Facebook access tokens
// before they expire. Tokens are valid for ~60 days.
// =====================================================

// Refresh tokens that expire within this many days
const REFRESH_THRESHOLD_DAYS = 7;

// Check interval (default: every 24 hours)
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let refreshInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// =====================================================
// Types
// =====================================================

interface TokenRefreshResult {
  pageId: string;
  organizationId: string;
  success: boolean;
  error?: string;
  newExpiryDate?: Date;
}

interface ExpiringPage {
  id: string;
  organization_id: string;
  page_id: string;
  page_name: string;
  access_token_encrypted: string;
  token_expires_at: string;
}

// =====================================================
// Token Refresh Logic
// =====================================================

async function getExpiringPages(): Promise<ExpiringPage[]> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + REFRESH_THRESHOLD_DAYS);
  
  const { data, error } = await supabase
    .from("facebook_pages")
    .select("id, organization_id, page_id, page_name, access_token_encrypted, token_expires_at")
    .eq("is_active", true)
    .lt("token_expires_at", thresholdDate.toISOString())
    .order("token_expires_at", { ascending: true });
  
  if (error) {
    console.error("[TokenRefresh] Error fetching expiring pages:", error);
    return [];
  }
  
  return data || [];
}

async function refreshPageToken(page: ExpiringPage): Promise<TokenRefreshResult> {
  const result: TokenRefreshResult = {
    pageId: page.page_id,
    organizationId: page.organization_id,
    success: false,
  };
  
  try {
    // Decrypt the current token
    const currentToken = decryptToken(page.access_token_encrypted);
    
    // Try to exchange for a new long-lived token
    const { accessToken: newToken, expiresIn } = await getLongLivedToken(currentToken);
    
    // Calculate new expiry date
    const newExpiryDate = new Date();
    newExpiryDate.setSeconds(newExpiryDate.getSeconds() + expiresIn);
    
    // Encrypt and save the new token
    const encryptedNewToken = encryptToken(newToken);
    
    const { error: updateError } = await supabase
      .from("facebook_pages")
      .update({
        access_token_encrypted: encryptedNewToken,
        token_expires_at: newExpiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id);
    
    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }
    
    result.success = true;
    result.newExpiryDate = newExpiryDate;
    
    console.log(
      `[TokenRefresh] Successfully refreshed token for page ${page.page_name} (${page.page_id}). ` +
      `New expiry: ${newExpiryDate.toISOString()}`
    );
  } catch (error: any) {
    result.error = error.message || "Unknown error";
    
    console.error(
      `[TokenRefresh] Failed to refresh token for page ${page.page_name} (${page.page_id}):`,
      error
    );
    
    // If token is completely invalid, mark the page as needing reconnection
    if (error.message?.includes("expired") || error.message?.includes("invalid")) {
      await markPageAsExpired(page.id);
    }
  }
  
  return result;
}

async function markPageAsExpired(pageDbId: string): Promise<void> {
  await supabase
    .from("facebook_pages")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageDbId);
}

// =====================================================
// Main Refresh Function
// =====================================================

async function runTokenRefresh(): Promise<TokenRefreshResult[]> {
  if (isRunning) {
    console.log("[TokenRefresh] Refresh already in progress, skipping...");
    return [];
  }
  
  isRunning = true;
  const results: TokenRefreshResult[] = [];
  
  try {
    console.log("[TokenRefresh] Starting token refresh check...");
    
    const expiringPages = await getExpiringPages();
    
    if (expiringPages.length === 0) {
      console.log("[TokenRefresh] No pages need token refresh");
      return [];
    }
    
    console.log(`[TokenRefresh] Found ${expiringPages.length} pages with expiring tokens`);
    
    for (const page of expiringPages) {
      const result = await refreshPageToken(page);
      results.push(result);
      
      // Small delay between refreshes to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    
    console.log(
      `[TokenRefresh] Completed. Success: ${successCount}, Failed: ${failCount}`
    );
  } catch (error) {
    console.error("[TokenRefresh] Error during refresh cycle:", error);
  } finally {
    isRunning = false;
  }
  
  return results;
}

// =====================================================
// Service Control
// =====================================================

function start(intervalMs: number = CHECK_INTERVAL_MS): void {
  if (refreshInterval) {
    console.log("[TokenRefresh] Service already running");
    return;
  }
  
  console.log(
    `[TokenRefresh] Starting service. Check interval: ${intervalMs / 1000 / 60} minutes`
  );
  
  // Run immediately on start
  runTokenRefresh().catch(console.error);
  
  // Then run on interval
  refreshInterval = setInterval(() => {
    runTokenRefresh().catch(console.error);
  }, intervalMs);
}

function stop(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log("[TokenRefresh] Service stopped");
  }
}

function isActive(): boolean {
  return refreshInterval !== null;
}

// =====================================================
// Notification Helpers
// =====================================================

async function getPagesPendingExpiry(
  organizationId?: string
): Promise<
  Array<{
    page_id: string;
    page_name: string;
    token_expires_at: string;
    days_until_expiry: number;
  }>
> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + REFRESH_THRESHOLD_DAYS);
  
  let query = supabase
    .from("facebook_pages")
    .select("page_id, page_name, token_expires_at")
    .eq("is_active", true)
    .lt("token_expires_at", thresholdDate.toISOString());
  
  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }
  
  const { data, error } = await query;
  
  if (error || !data) {
    return [];
  }
  
  return data.map((page) => {
    const expiryDate = new Date(page.token_expires_at);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    return {
      page_id: page.page_id,
      page_name: page.page_name,
      token_expires_at: page.token_expires_at,
      days_until_expiry: daysUntilExpiry,
    };
  });
}

// =====================================================
// Export
// =====================================================

export const TokenRefreshService = {
  start,
  stop,
  isActive,
  runNow: runTokenRefresh,
  getExpiringPages,
  getPagesPendingExpiry,
  REFRESH_THRESHOLD_DAYS,
};

export default TokenRefreshService;
