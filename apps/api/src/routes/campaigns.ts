import { Router, Request, Response } from "express";
import { db, supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();
import { validate } from "../middleware/validate";
import { createCampaignSchema, sendCampaignSchema } from "../schemas/crmSchemas";

// ========== CONFIGURATION ==========
const RATE_LIMIT_CONFIG = {
    MIN_DELAY_MS: 4000,  // Minimum delay between messages (4 seconds)
    MAX_DELAY_MS: 8000,  // Maximum delay between messages (8 seconds)
    BATCH_SIZE: 10,      // Send 10 messages then take a break
    BATCH_BREAK_MS: 30000, // 30 second break after each batch
    DB_UPDATE_BATCH: 5,  // Update DB every 5 messages instead of every message
    MAX_RETRIES: 3,      // Maximum retry attempts for failed messages
    RETRY_DELAY_MS: 2000, // Delay between retries (2 seconds)
    MESSAGE_TIMEOUT_MS: 30000, // Timeout for sending a single message (30 seconds)
    CONNECTION_WAIT_MS: 60000, // Max wait time for WhatsApp to be ready (60 seconds)
    RECIPIENTS_PAGE_SIZE: 1000, // Load recipients in chunks of 1000
};

// Phone validation patterns
const PHONE_PATTERNS = {
    EGYPT: { prefix: '20', minLength: 12, maxLength: 12 },
    SAUDI: { prefix: '966', minLength: 12, maxLength: 12 },
    UAE: { prefix: '971', minLength: 12, maxLength: 13 },
    INTERNATIONAL: { minLength: 10, maxLength: 15 },
};

// Global map to track campaigns that should stop (persisted to DB too)
const stoppedCampaigns = new Map<string, boolean>();

// ========== HELPER FUNCTIONS ==========

/**
 * Validate and normalize phone number
 * Handles WhatsApp internal IDs (LID) and extracts real phone numbers
 */
function normalizePhoneNumber(phone: string): { valid: boolean; normalized: string; error?: string } {
    if (!phone) {
        return { valid: false, normalized: '', error: 'رقم الهاتف مطلوب' };
    }

    // Remove all non-digits
    let cleanPhone = String(phone).replace(/\D/g, '');

    // Detect WhatsApp internal LID (very long numbers that aren't real phones)
    // WhatsApp LIDs are typically 14+ digits and often start with specific patterns
    if (cleanPhone.length > 14) {
        // Try to extract real phone number from LID - Enhanced patterns
        const patterns = [
            /(20[1][0-9]{9})/,      // Egypt: 201xxxxxxxxx
            /(966[5][0-9]{8})/,     // Saudi: 9665xxxxxxxx
            /(971[5][0-9]{8})/,     // UAE: 9715xxxxxxxx
            /(965[569][0-9]{7})/,   // Kuwait: 9655xxxxxxx, 9656xxxxxxx, 9659xxxxxxx
            /(968[79][0-9]{7})/,    // Oman: 9687xxxxxxx, 9689xxxxxxx
            /(974[3567][0-9]{7})/,  // Qatar: 9743xxxxxxx, etc.
            /(973[3][0-9]{7})/,     // Bahrain: 9733xxxxxxx
            /(962[7][0-9]{8})/,     // Jordan: 9627xxxxxxxx
            /(961[3-9][0-9]{7})/,   // Lebanon: 9613xxxxxxx to 9619xxxxxxx
            /(212[6-7][0-9]{8})/,   // Morocco: 2126xxxxxxxx, 2127xxxxxxxx
            /(213[5-7][0-9]{8})/,   // Algeria: 2135xxxxxxxx to 2137xxxxxxxx
            /(216[2-9][0-9]{7})/,   // Tunisia: 2162xxxxxxx to 2169xxxxxxx
        ];

        for (const pattern of patterns) {
            const match = cleanPhone.match(pattern);
            if (match) {
                cleanPhone = match[1];
                break;
            }
        }

        // If still too long after pattern matching, it's invalid
        if (cleanPhone.length > 14) {
            console.warn(`[normalizePhoneNumber] Detected LID/invalid ID: ${phone} - skipping`);
            return { valid: false, normalized: cleanPhone, error: 'رقم WhatsApp ID داخلي غير صالح للإرسال' };
        }
    }

    // Egypt normalization
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = '20' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
        cleanPhone = '20' + cleanPhone;
    }
    // Saudi normalization
    else if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
        cleanPhone = '966' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
        cleanPhone = '966' + cleanPhone;
    }
    // UAE normalization
    else if (cleanPhone.startsWith('0') && cleanPhone.length === 10 && cleanPhone[1] === '5') {
        cleanPhone = '971' + cleanPhone.substring(1);
    }

    // Final length validation
    if (cleanPhone.length < PHONE_PATTERNS.INTERNATIONAL.minLength) {
        return { valid: false, normalized: cleanPhone, error: 'رقم الهاتف قصير جداً' };
    }

    // Maximum valid phone number is 13 digits (country code + number)
    if (cleanPhone.length > 13) {
        return { valid: false, normalized: cleanPhone, error: 'رقم الهاتف غير صالح (طويل جداً)' };
    }

    // Check for obviously invalid patterns (all same digits, etc.)
    if (/^(\d)\1+$/.test(cleanPhone)) {
        return { valid: false, normalized: cleanPhone, error: 'رقم هاتف غير صالح' };
    }

    // Validate that number starts with valid country code
    const validCountryCodes = ['1', '20', '212', '213', '216', '218', '249', '252', '253', '254', '255',
        '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269',
        '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
        '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
        '7', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
        '966', '965', '964', '963', '962', '961', '968', '970', '971', '972', '973', '974'];

    const hasValidCode = validCountryCodes.some(code => cleanPhone.startsWith(code));
    if (!hasValidCode && cleanPhone.length > 10) {
        return { valid: false, normalized: cleanPhone, error: 'رقم بدون كود دولة صحيح' };
    }

    return { valid: true, normalized: cleanPhone };
}


/**
 * Calculate delay with jitter for rate limiting
 */
function getRandomDelay(): number {
    const { MIN_DELAY_MS, MAX_DELAY_MS } = RATE_LIMIT_CONFIG;
    return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)) + MIN_DELAY_MS;
}

/**
 * Check if campaign was stopped (checks both memory and DB)
 * Fixed race condition by ensuring atomic checks
 */
async function isCampaignStopped(campaignId: string): Promise<boolean> {
    // Check database first for authoritative state
    const { data } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

    const dbStopped = data?.status === 'stopped';

    // Sync memory state with DB state
    if (dbStopped) {
        stoppedCampaigns.set(campaignId, true);
    } else {
        stoppedCampaigns.delete(campaignId);
    }

    return dbStopped;
}

/**
 * Send message with timeout and retry logic
 */
async function sendMessageWithRetry(
    manager: WhatsAppManager,
    orgId: string,
    phone: string,
    text: string,
    retries: number = RATE_LIMIT_CONFIG.MAX_RETRIES
): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Message timeout')), RATE_LIMIT_CONFIG.MESSAGE_TIMEOUT_MS);
            });

            // Race between sending message and timeout
            await Promise.race([
                manager.sendMessage(orgId, phone, text),
                timeoutPromise
            ]);

            return { success: true };
        } catch (error: any) {
            const isLastAttempt = attempt === retries;
            const errorMsg = error.message || 'Unknown error';

            if (isLastAttempt) {
                console.error(`[sendMessageWithRetry] Failed after ${retries + 1} attempts to ${phone}: ${errorMsg}`);
                return { success: false, error: errorMsg };
            }

            console.warn(`[sendMessageWithRetry] Attempt ${attempt + 1} failed for ${phone}: ${errorMsg}. Retrying...`);
            await new Promise(r => setTimeout(r, RATE_LIMIT_CONFIG.RETRY_DELAY_MS));
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

/**
 * Wait for WhatsApp to be ready with timeout
 */
async function waitForWhatsAppReady(
    manager: WhatsAppManager,
    orgId: string,
    maxWaitMs: number = RATE_LIMIT_CONFIG.CONNECTION_WAIT_MS
): Promise<{ ready: boolean; error?: string }> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
        const state = manager.getState(orgId);

        if (state.status === 'ready') {
            return { ready: true };
        }

        if (state.status === 'disconnected' || state.status === 'error') {
            return { ready: false, error: `WhatsApp في حالة ${state.status}` };
        }

        // Still connecting/loading, wait and check again
        console.log(`[waitForWhatsAppReady] WhatsApp status: ${state.status}, waiting...`);
        await new Promise(r => setTimeout(r, checkInterval));
    }

    return { ready: false, error: 'انتهت مهلة الانتظار للاتصال بواتساب' };
}

/**
 * Batch fetch customer names to solve N+1 problem
 */
async function batchGetCustomerNames(
    logs: any[],
    orgId: string
): Promise<Map<string, string>> {
    const phoneToName = new Map<string, string>();

    if (!logs.length) return phoneToName;

    // Get all unique customer IDs and phones
    const customerIds = [...new Set(logs.filter(l => l.customer_id).map(l => l.customer_id))];
    const phones = [...new Set(logs.map(l => l.phone?.replace(/\D/g, '')).filter(Boolean))];

    // Batch fetch customers by ID
    if (customerIds.length > 0) {
        const { data: customersById } = await supabase
            .from('customers')
            .select('id, name, phone')
            .in('id', customerIds);

        customersById?.forEach(c => {
            if (c.phone) {
                phoneToName.set(c.phone.replace(/\D/g, ''), c.name);
            }
        });
    }

    // Batch fetch customers by phone (only for ones we don't have yet)
    const missingPhones = phones.filter(p => !phoneToName.has(p));
    if (missingPhones.length > 0) {
        // Process in chunks to avoid query length limits
        const chunkSize = 50; // Process 50 phones at a time

        for (let i = 0; i < missingPhones.length; i += chunkSize) {
            const phoneChunk = missingPhones.slice(i, i + chunkSize);

            // Create OR conditions for phone matching - use last 9 digits for better matching
            const phoneConditions = phoneChunk.map(p => {
                const last9 = p.slice(-9);
                return `phone.like.%${last9}%`;
            });

            const { data: customersByPhone } = await supabase
                .from('customers')
                .select('name, phone')
                .eq('organization_id', orgId)
                .or(phoneConditions.join(','));

            customersByPhone?.forEach(c => {
                if (c.phone) {
                    const normalized = c.phone.replace(/\D/g, '');
                    if (!phoneToName.has(normalized)) {
                        phoneToName.set(normalized, c.name);
                    }
                }
            });
        }

        // Also check contacts table for still missing phones
        const stillMissing = missingPhones.filter(p => !phoneToName.has(p));
        if (stillMissing.length > 0) {
            for (let i = 0; i < stillMissing.length; i += 50) {
                const phoneChunk = stillMissing.slice(i, i + 50);
                const contactConditions = phoneChunk.map(p => {
                    const last9 = p.slice(-9);
                    return `phone.like.%${last9}%`;
                });

                const { data: contacts } = await supabase
                    .from('contacts')
                    .select('name, phone')
                    .eq('organization_id', orgId)
                    .or(contactConditions.join(','));

                contacts?.forEach(c => {
                    if (c.phone) {
                        const normalized = c.phone.replace(/\D/g, '');
                        if (!phoneToName.has(normalized)) {
                            phoneToName.set(normalized, c.name);
                        }
                    }
                });
            }
        }
    }

    return phoneToName;
}

// ========== ROUTES ==========

// Get campaigns
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const campaigns = await db.getCampaigns(orgId);
        res.json({ campaigns });
    } catch (error: any) {
        console.error('[Campaigns] Error fetching campaigns:', error);
        res.status(500).json({ error: error.message || "Failed to fetch campaigns" });
    }
});

// Create Campaign
router.post("/", verifyToken, validate(createCampaignSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { name, messageTemplate, targetGroup, action } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: "اسم الحملة مطلوب" });
        }
        if (!messageTemplate?.trim()) {
            return res.status(400).json({ error: "نص الرسالة مطلوب" });
        }
        if (messageTemplate.length > 4000) {
            return res.status(400).json({ error: "نص الرسالة طويل جداً (الحد الأقصى 4000 حرف)" });
        }

        const campaign = await db.createCampaign({
            name: name.trim(),
            message_template: messageTemplate.trim(),
            organization_id: orgId,
            target_group: targetGroup || 'all'
        });

        if (action === "send") {
            // Trigger background sending (non-blocking)
            const group = targetGroup || 'all';
            setImmediate(() => {
                // Use direct WhatsApp chats method for "all" - NO LID ISSUES!
                if (group === 'all') {
                    sendCampaignToChats(orgId, campaign.id, messageTemplate.trim(), (req as any).whatsappManager);
                } else {
                    // Use database-based method for filtered groups
                    sendCampaign(orgId, campaign.id, messageTemplate.trim(), group, (req as any).whatsappManager);
                }
            });
        }

        res.status(201).json({ message: "Campaign created", campaign });
    } catch (error: any) {
        console.error('[Campaigns] Error creating campaign:', error);
        res.status(500).json({ error: error.message || "Failed to create campaign" });
    }
});

// Send Campaign (Manual Trigger)
router.post("/:id/send", verifyToken, validate(sendCampaignSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        // Verify campaign exists and belongs to organization
        const { data: campaign, error: fetchError } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (fetchError || !campaign) {
            return res.status(404).json({ error: "الحملة غير موجودة" });
        }

        if (campaign.status === 'processing') {
            return res.status(400).json({ error: "الحملة قيد التنفيذ بالفعل" });
        }

        // Clear stop flag if it was previously stopped
        stoppedCampaigns.delete(id);

        // Trigger sending (non-blocking)
        setImmediate(() => {
            sendCampaign(orgId, id, campaign.message_template, campaign.target_group, (req as any).whatsappManager);
        });

        res.json({ message: "تم بدء الإرسال في الخلفية" });
    } catch (error: any) {
        console.error('[Campaigns] Error starting campaign send:', error);
        res.status(500).json({ error: error.message || "Failed to start sending" });
    }
});

// Get campaign logs with customer names (OPTIMIZED - no N+1)
router.get("/:id/logs", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        // Verify campaign belongs to organization
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (!campaign) {
            return res.status(404).json({ error: "الحملة غير موجودة" });
        }

        // Get all logs
        const { data: logs, error } = await supabase
            .from('campaign_logs')
            .select('*')
            .eq('campaign_id', id)
            .order('sent_at', { ascending: false });

        if (error) throw error;

        // Batch fetch all customer names (solves N+1 problem)
        const phoneToName = await batchGetCustomerNames(logs || [], orgId);

        // Map names to logs
        const logsWithNames = (logs || []).map(log => {
            const normalizedPhone = log.phone?.replace(/\D/g, '') || '';
            return {
                ...log,
                customer_name: phoneToName.get(normalizedPhone) || null
            };
        });

        res.json({ logs: logsWithNames });
    } catch (error: any) {
        console.error('[Campaigns] Error fetching logs:', error);
        res.status(500).json({ error: error.message || "Failed to fetch logs" });
    }
});

// Delete Campaign (with ownership verification)
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        // Verify campaign exists and belongs to organization FIRST
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('id, status')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (!campaign) {
            return res.status(404).json({ error: "الحملة غير موجودة" });
        }

        if (campaign.status === 'processing') {
            return res.status(400).json({ error: "لا يمكن حذف حملة قيد التنفيذ. قم بإيقافها أولاً." });
        }

        // Delete related logs first (using campaign_id which has cascade)
        const { error: logsError } = await supabase
            .from('campaign_logs')
            .delete()
            .eq('campaign_id', id);

        if (logsError) {
            console.warn('[Campaigns] Error deleting logs:', logsError);
        }

        // Then delete the campaign
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)
            .eq('organization_id', orgId);

        if (error) throw error;

        // Clean up memory
        stoppedCampaigns.delete(id);

        res.json({ message: "تم حذف الحملة بنجاح" });
    } catch (error: any) {
        console.error('[Campaigns] Error deleting campaign:', error);
        res.status(500).json({ error: error.message || "Failed to delete campaign" });
    }
});

// Stop Campaign
router.post("/:id/stop", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        // Verify campaign exists and belongs to organization
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('id, status')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (!campaign) {
            return res.status(404).json({ error: "الحملة غير موجودة" });
        }

        if (campaign.status !== 'processing') {
            return res.status(400).json({ error: "الحملة ليست قيد التنفيذ" });
        }

        // Mark as stopped in memory (immediate effect)
        stoppedCampaigns.set(id, true);

        // Update status in database (for persistence)
        await supabase
            .from('campaigns')
            .update({
                status: 'stopped',
                error_message: 'تم إيقاف الحملة يدوياً',
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('organization_id', orgId);

        res.json({ message: "تم إرسال أمر الإيقاف" });
    } catch (error: any) {
        console.error('[Campaigns] Error stopping campaign:', error);
        res.status(500).json({ error: error.message || "Failed to stop campaign" });
    }
});

// Export stoppedCampaigns for use in sendCampaign function
export { stoppedCampaigns };

// ========== BACKGROUND SENDER ==========

/**
 * Send campaign using WhatsApp Chats directly (BEST METHOD - No LID issues!)
 * This method sends to all active WhatsApp conversations
 */
async function sendCampaignToChats(
    orgId: string,
    campaignId: string,
    message: string,
    manager: WhatsAppManager
) {
    console.log(`[Campaign ${campaignId}] Starting broadcast to WhatsApp chats...`);

    try {
        await db.updateCampaignStatus(campaignId, "processing");

        // Check WhatsApp connection first
        const { ready, error: connectionError } = await waitForWhatsAppReady(manager, orgId);

        if (!ready) {
            console.error(`[Campaign ${campaignId}] Aborting: WhatsApp not ready - ${connectionError}`);
            await db.updateCampaignStatus(campaignId, "error", {
                error_message: connectionError || "واتساب غير متصل. يرجى الاتصال أولاً."
            });
            return;
        }

        // Get all WhatsApp chats
        console.log(`[Campaign ${campaignId}] Fetching all WhatsApp chats...`);
        const chats = await manager.getAllChats(orgId);

        console.log(`[Campaign ${campaignId}] Found ${chats.length} chats`);

        // Update total recipients
        await db.updateCampaignStatus(campaignId, "processing", {
            total_recipients: chats.length
        });

        let successCount = 0;
        let failCount = 0;
        let batchCount = 0;
        let messagesSinceDbUpdate = 0;
        const errorLog: string[] = [];

        // Send to each chat
        for (let i = 0; i < chats.length; i++) {
            const chat = chats[i];

            // Check if campaign was stopped
            if (i % 10 === 0 && await isCampaignStopped(campaignId)) {
                console.log(`[Campaign ${campaignId}] Campaign stopped by user.`);
                stoppedCampaigns.delete(campaignId);
                await db.updateCampaignStatus(campaignId, "stopped", {
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: "تم إيقاف الحملة يدوياً"
                });
                return;
            }

            // Rate limiting
            batchCount++;
            if (batchCount >= RATE_LIMIT_CONFIG.BATCH_SIZE) {
                console.log(`[Campaign ${campaignId}] Batch complete, taking break...`);
                await new Promise(r => setTimeout(r, RATE_LIMIT_CONFIG.BATCH_BREAK_MS));
                batchCount = 0;
            } else {
                const delay = getRandomDelay();
                console.log(`[Campaign ${campaignId}] [${i + 1}/${chats.length}] Waiting ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }

            // Personalize message
            const text = message.replace(/{name}/g, chat.name || "عزيزي العميل");

            console.log(`[Campaign ${campaignId}] Sending to chat: ${chat.name} (${chat.id})`);

            // Send directly to chat (NO LID ISSUES!)
            try {
                await manager.sendMessageToChat(orgId, chat.id, text);
                successCount++;

                // Log success
                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: null, // We don't have customer ID from chats
                    phone: chat.phone || chat.id,
                    status: "sent"
                }).catch(e => console.error("[Campaign] Failed to log success:", e));

            } catch (error: any) {
                failCount++;
                const errMsg = error.message || "Unknown error";
                errorLog.push(`[${chat.name}] ${errMsg}`);

                console.error(`[Campaign ${campaignId}] Failed to send to ${chat.name}: ${errMsg}`);

                // Log failure
                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: null,
                    phone: chat.phone || chat.id,
                    status: "failed",
                    error_message: errMsg
                }).catch(e => console.error("[Campaign] Failed to log error:", e));
            }

            // Update campaign stats in batches
            messagesSinceDbUpdate++;
            if (messagesSinceDbUpdate >= RATE_LIMIT_CONFIG.DB_UPDATE_BATCH) {
                await supabase.from('campaigns').update({
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: errorLog.length > 0 ? errorLog.slice(-5).join(' | ') : null,
                    updated_at: new Date().toISOString()
                }).eq('id', campaignId);

                messagesSinceDbUpdate = 0;
            }

            // Check if WhatsApp still connected
            if (i % 5 === 0 && manager.getState(orgId).status !== 'ready') {
                console.error(`[Campaign ${campaignId}] WhatsApp disconnected mid-campaign!`);

                await supabase.from('campaigns').update({
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: errorLog.slice(-5).join(' | '),
                    updated_at: new Date().toISOString()
                }).eq('id', campaignId);

                await db.updateCampaignStatus(campaignId, "error", {
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: "انقطع اتصال واتساب أثناء الإرسال."
                });
                return;
            }
        }

        // Final update
        if (messagesSinceDbUpdate > 0) {
            await supabase.from('campaigns').update({
                successful_sends: successCount,
                failed_sends: failCount,
                error_message: errorLog.length > 0 ? errorLog.slice(-5).join(' | ') : null,
                updated_at: new Date().toISOString()
            }).eq('id', campaignId);
        }

        // Complete
        await db.updateCampaignStatus(campaignId, "completed", {
            successful_sends: successCount,
            failed_sends: failCount
        });
        console.log(`[Campaign ${campaignId}] ✅ Completed. Success: ${successCount}, Failed: ${failCount}`);

    } catch (error: any) {
        console.error(`[Campaign ${campaignId}] Fatal error:`, error);
        await db.updateCampaignStatus(campaignId, "error", {
            error_message: `خطأ غير متوقع: ${error.message}`
        });
    }
}

async function sendCampaign(
    orgId: string,
    campaignId: string,
    message: string,
    targetGroup: string,
    manager: WhatsAppManager
) {
    console.log(`[Campaign ${campaignId}] Starting broadcast...`);

    try {
        await db.updateCampaignStatus(campaignId, "processing");

        // 1. Fetch Recipients from both Customers and Contacts with PAGINATION
        let allRecipients: any[] = [];
        let page = 0;
        const pageSize = RATE_LIMIT_CONFIG.RECIPIENTS_PAGE_SIZE;

        while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            let customersQuery = supabase
                .from('customers')
                .select('id, name, phone, status, customer_type, wa_chat_id')
                .eq('organization_id', orgId);

            // Apply filters at query level for better performance
            if (targetGroup === 'active') {
                customersQuery = customersQuery.eq('status', 'active');
            } else if (targetGroup.startsWith('type_')) {
                const requestedType = targetGroup.replace('type_', '');
                customersQuery = customersQuery.eq('customer_type', requestedType);
            }

            const customersPromise = customersQuery.range(from, to);

            // Only fetch contacts if targetGroup is 'all'
            const contactsPromise = targetGroup === 'all'
                ? supabase.from('contacts').select('id, name, phone').eq('organization_id', orgId).range(from, to)
                : Promise.resolve({ data: [], error: null });

            const [customersRes, contactsRes] = await Promise.all([customersPromise, contactsPromise]);

            if (customersRes.error && customersRes.error.code !== 'PGRST116') {
                throw new Error(`Failed to fetch customers: ${customersRes.error.message}`);
            }

            const customers = (customersRes.data || []).map(c => ({ ...c, _origin: 'customer' as const }));
            const contacts = (contactsRes.data || []).map(c => ({ ...c, _origin: 'contact' as const }));

            const pageRecipients = [...customers, ...contacts];

            if (pageRecipients.length === 0) {
                break; // No more data
            }

            allRecipients.push(...pageRecipients);

            console.log(`[Campaign ${campaignId}] Loaded page ${page + 1}: ${pageRecipients.length} recipients (Total: ${allRecipients.length})`);

            // If we got less than a full page, we're done
            if (pageRecipients.length < pageSize) {
                break;
            }

            page++;
        }

        const filteredRecipients = allRecipients;

        // Validate and normalize phone numbers, de-duplicate
        const validRecipients: any[] = [];
        const seenPhones = new Set<string>();

        for (const recipient of filteredRecipients) {
            const { valid, normalized, error } = normalizePhoneNumber(recipient.phone);
            if (valid && !seenPhones.has(normalized)) {
                seenPhones.add(normalized);
                validRecipients.push({ ...recipient, normalizedPhone: normalized });
            } else if (!valid) {
                console.warn(`[Campaign ${campaignId}] Skipping invalid phone ${recipient.phone}: ${error}`);
            }
        }

        console.log(`[Campaign ${campaignId}] Valid unique recipients: ${validRecipients.length}`);

        if (validRecipients.length === 0) {
            console.log(`[Campaign ${campaignId}] No valid recipients found.`);
            await db.updateCampaignStatus(campaignId, "completed", {
                total_recipients: 0,
                error_message: "لا يوجد مستلمين صالحين"
            });
            return;
        }

        // Check for already sent messages (Idempotency)
        const { data: logs } = await supabase
            .from('campaign_logs')
            .select('phone, status')
            .eq('campaign_id', campaignId)
            .eq('status', 'sent');

        const sentPhones = new Set(logs?.map(l => l.phone?.replace(/\D/g, '')) || []);
        const pendingRecipients = validRecipients.filter(r => !sentPhones.has(r.normalizedPhone));

        console.log(`[Campaign ${campaignId}] Total: ${validRecipients.length}, Already Sent: ${sentPhones.size}, Pending: ${pendingRecipients.length}`);

        if (pendingRecipients.length === 0) {
            await db.updateCampaignStatus(campaignId, "completed", {
                total_recipients: validRecipients.length,
                successful_sends: sentPhones.size
            });
            return;
        }

        // Check WhatsApp connection - Wait if connecting
        const { ready, error: connectionError } = await waitForWhatsAppReady(manager, orgId);

        if (!ready) {
            console.error(`[Campaign ${campaignId}] Aborting: WhatsApp not ready - ${connectionError}`);
            await db.updateCampaignStatus(campaignId, "failed", {
                error_message: connectionError || "واتساب غير متصل. يرجى الاتصال أولاً."
            });
            return;
        }

        console.log(`[Campaign ${campaignId}] WhatsApp ready, starting campaign...`);

        await db.updateCampaignStatus(campaignId, "processing", {
            total_recipients: validRecipients.length
        });

        let successCount = sentPhones.size;
        let failCount = 0;
        let batchCount = 0;
        let messagesSinceDbUpdate = 0;
        const errorLog: string[] = []; // Track all errors

        // 2. Loop and Send with improved rate limiting
        for (let i = 0; i < pendingRecipients.length; i++) {
            const recipient = pendingRecipients[i];

            // Check if campaign was stopped (check every 10 messages to reduce DB load)
            if (i % 10 === 0 && await isCampaignStopped(campaignId)) {
                console.log(`[Campaign ${campaignId}] Campaign stopped by user.`);
                stoppedCampaigns.delete(campaignId);
                await db.updateCampaignStatus(campaignId, "stopped", {
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: "تم إيقاف الحملة يدوياً"
                });
                return;
            }

            // Rate limiting with batch breaks
            batchCount++;
            if (batchCount >= RATE_LIMIT_CONFIG.BATCH_SIZE) {
                console.log(`[Campaign ${campaignId}] Batch break (${RATE_LIMIT_CONFIG.BATCH_BREAK_MS}ms)...`);
                await new Promise(r => setTimeout(r, RATE_LIMIT_CONFIG.BATCH_BREAK_MS));
                batchCount = 0;
            } else {
                const delay = getRandomDelay();
                console.log(`[Campaign ${campaignId}] [${i + 1}/${pendingRecipients.length}] Waiting ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }

            const text = message.replace(/{name}/g, recipient.name || "عزيزي العميل");

            // CRITICAL: Use wa_chat_id if available (proper @c.us format), otherwise use normalizedPhone
            // wa_chat_id is the BEST option as it's already validated by WhatsApp
            const sendTo = recipient.wa_chat_id || recipient.normalizedPhone;
            const isUsingChatId = !!recipient.wa_chat_id;

            console.log(`[Campaign ${campaignId}] Sending to: ${sendTo} (using ${isUsingChatId ? 'wa_chat_id' : 'phone'})`);

            // Send with retry logic and timeout
            const { success, error: sendError } = await sendMessageWithRetry(manager, orgId, sendTo, text);

            if (success) {
                successCount++;

                // Log success to DB
                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: recipient._origin === 'customer' ? recipient.id : null,
                    phone: recipient.normalizedPhone,
                    status: "sent"
                }).catch(e => console.error("[Campaign] Failed to log success:", e));

            } else {
                failCount++;
                const errMsg = sendError || "Unknown error";
                errorLog.push(`[${sendTo}] ${errMsg}`);

                console.error(`[Campaign ${campaignId}] Failed to send to ${recipient.phone}: ${errMsg}`);

                // Log failure to DB
                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: recipient._origin === 'customer' ? recipient.id : null,
                    phone: recipient.normalizedPhone,
                    status: "failed",
                    error_message: errMsg
                }).catch(e => console.error("[Campaign] Failed to log error:", e));
            }

            // Update campaign stats in batches (every N messages) instead of every message
            messagesSinceDbUpdate++;
            if (messagesSinceDbUpdate >= RATE_LIMIT_CONFIG.DB_UPDATE_BATCH) {
                const { error: updateError } = await supabase.from('campaigns').update({
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: errorLog.length > 0 ? errorLog.slice(-5).join(' | ') : null, // Keep last 5 errors
                    updated_at: new Date().toISOString()
                }).eq('id', campaignId);

                if (updateError) {
                    console.error("[Campaign] Failed to update stats:", updateError);
                }

                messagesSinceDbUpdate = 0;
            }

            // Check if WhatsApp still connected (every 5 messages)
            if (i % 5 === 0 && manager.getState(orgId).status !== 'ready') {
                console.error(`[Campaign ${campaignId}] WhatsApp disconnected mid-campaign!`);

                // Final DB update before stopping
                const { error: finalUpdateError } = await supabase.from('campaigns').update({
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: errorLog.slice(-5).join(' | '),
                    updated_at: new Date().toISOString()
                }).eq('id', campaignId);

                if (finalUpdateError) {
                    console.error("[Campaign] Failed final update:", finalUpdateError);
                }

                await db.updateCampaignStatus(campaignId, "failed", {
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: "انقطع اتصال واتساب أثناء الإرسال. أعد الاتصال وأعد الإرسال."
                });
                return;
            }
        }

        // Final update for any remaining messages
        if (messagesSinceDbUpdate > 0) {
            const { error: finalStatsError } = await supabase.from('campaigns').update({
                successful_sends: successCount,
                failed_sends: failCount,
                error_message: errorLog.length > 0 ? errorLog.slice(-5).join(' | ') : null,
                updated_at: new Date().toISOString()
            }).eq('id', campaignId);

            if (finalStatsError) {
                console.error("[Campaign] Failed final stats update:", finalStatsError);
            }
        }

        // Complete
        await db.updateCampaignStatus(campaignId, "completed", {
            successful_sends: successCount,
            failed_sends: failCount
        });
        console.log(`[Campaign ${campaignId}] ✅ Completed. Success: ${successCount}, Failed: ${failCount}`);

    } catch (error: any) {
        console.error(`[Campaign ${campaignId}] Fatal error:`, error);
        await db.updateCampaignStatus(campaignId, "failed", {
            error_message: `خطأ غير متوقع: ${error.message}`
        });
    }
}

export default router;
