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
 */
function normalizePhoneNumber(phone: string): { valid: boolean; normalized: string; error?: string } {
    if (!phone) {
        return { valid: false, normalized: '', error: 'رقم الهاتف مطلوب' };
    }

    // Remove all non-digits
    let cleanPhone = String(phone).replace(/\D/g, '');

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
    else if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
        cleanPhone = '971' + cleanPhone.substring(1);
    }

    // Validate length
    if (cleanPhone.length < PHONE_PATTERNS.INTERNATIONAL.minLength) {
        return { valid: false, normalized: cleanPhone, error: 'رقم الهاتف قصير جداً' };
    }
    if (cleanPhone.length > PHONE_PATTERNS.INTERNATIONAL.maxLength) {
        return { valid: false, normalized: cleanPhone, error: 'رقم الهاتف طويل جداً' };
    }

    // Check for obviously invalid patterns (all same digits, etc.)
    if (/^(\d)\1+$/.test(cleanPhone)) {
        return { valid: false, normalized: cleanPhone, error: 'رقم هاتف غير صالح' };
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
 */
async function isCampaignStopped(campaignId: string): Promise<boolean> {
    // Check memory first (faster)
    if (stoppedCampaigns.get(campaignId)) {
        return true;
    }

    // Check database for persistence across restarts
    const { data } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

    return data?.status === 'stopped';
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
        // Create OR conditions for phone matching
        const phoneConditions = missingPhones.map(p => `phone.ilike.%${p.slice(-10)}%`);

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

        // Also check contacts table
        const stillMissing = missingPhones.filter(p => !phoneToName.has(p));
        if (stillMissing.length > 0) {
            const contactConditions = stillMissing.map(p => `phone.ilike.%${p.slice(-10)}%`);

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
            setImmediate(() => {
                sendCampaign(orgId, campaign.id, messageTemplate.trim(), targetGroup || 'all', (req as any).whatsappManager);
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

        // 1. Fetch Recipients from both Customers and Contacts
        const [customersRes, contactsRes] = await Promise.all([
            supabase.from('customers').select('id, name, phone, status, customer_type').eq('organization_id', orgId),
            supabase.from('contacts').select('id, name, phone').eq('organization_id', orgId)
        ]);

        const customers = (customersRes.data || []).map(c => ({ ...c, _origin: 'customer' as const }));
        const contacts = (contactsRes.data || []).map(c => ({ ...c, _origin: 'contact' as const }));

        // Apply filters
        let filteredRecipients: any[] = [];
        if (targetGroup === 'all') {
            filteredRecipients = [...customers, ...contacts];
        } else if (targetGroup === 'active') {
            filteredRecipients = customers.filter(c => c.status === 'active');
        } else if (targetGroup.startsWith('type_')) {
            const requestedType = targetGroup.replace('type_', '');
            filteredRecipients = customers.filter(c => c.customer_type === requestedType);
        } else {
            filteredRecipients = [...customers];
        }

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

        // Check WhatsApp connection
        const state = manager.getState(orgId);
        console.log(`[Campaign ${campaignId}] WhatsApp Status: ${state.status}`);

        if (state.status !== 'ready') {
            console.error(`[Campaign ${campaignId}] Aborting: WhatsApp not ready (${state.status})`);
            await db.updateCampaignStatus(campaignId, "failed", {
                error_message: "واتساب غير متصل. يرجى الاتصال أولاً."
            });
            return;
        }

        await db.updateCampaignStatus(campaignId, "processing", {
            total_recipients: validRecipients.length
        });

        let successCount = sentPhones.size;
        let failCount = 0;
        let batchCount = 0;

        // 2. Loop and Send with improved rate limiting
        for (let i = 0; i < pendingRecipients.length; i++) {
            const recipient = pendingRecipients[i];

            // Check if campaign was stopped
            if (await isCampaignStopped(campaignId)) {
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

            try {
                const text = message.replace(/{name}/g, recipient.name || "عزيزي العميل");
                const cleanPhone = recipient.normalizedPhone;

                console.log(`[Campaign ${campaignId}] Sending to: ${cleanPhone}`);
                await manager.sendMessage(orgId, cleanPhone, text);

                successCount++;

                // Update DB
                await Promise.all([
                    supabase.from('campaigns').update({
                        successful_sends: successCount,
                        updated_at: new Date().toISOString()
                    }).eq('id', campaignId),

                    db.logCampaignResult({
                        campaign_id: campaignId,
                        customer_id: recipient._origin === 'customer' ? recipient.id : null,
                        phone: cleanPhone,
                        status: "sent"
                    })
                ]);

            } catch (err: any) {
                console.error(`[Campaign ${campaignId}] Error sending to ${recipient.phone}:`, err.message);
                failCount++;

                const errMsg = `${err.message || "Unknown error"}`;

                // Update DB
                await Promise.all([
                    supabase.from('campaigns').update({
                        failed_sends: failCount,
                        error_message: `[${recipient.normalizedPhone}] ${errMsg}`,
                        updated_at: new Date().toISOString()
                    }).eq('id', campaignId),

                    db.logCampaignResult({
                        campaign_id: campaignId,
                        customer_id: recipient._origin === 'customer' ? recipient.id : null,
                        phone: recipient.normalizedPhone,
                        status: "failed",
                        error_message: errMsg
                    }).catch(e => console.error("Failed to log error:", e))
                ]);
            }

            // Check if WhatsApp still connected
            if (manager.getState(orgId).status !== 'ready') {
                console.error(`[Campaign ${campaignId}] WhatsApp disconnected mid-campaign!`);
                await db.updateCampaignStatus(campaignId, "failed", {
                    successful_sends: successCount,
                    failed_sends: failCount,
                    error_message: "انقطع اتصال واتساب أثناء الإرسال. أعد الاتصال وأعد الإرسال."
                });
                return;
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
