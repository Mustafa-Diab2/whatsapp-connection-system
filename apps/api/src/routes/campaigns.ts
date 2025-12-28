import { Router, Request, Response } from "express";
import { db, supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();
import { validate } from "../middleware/validate";
import { createCampaignSchema, sendCampaignSchema } from "../schemas/crmSchemas";

// Get campaigns
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const campaigns = await db.getCampaigns(orgId);
        res.json({ campaigns });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch campaigns" });
    }
});

// Create Campaign
router.post("/", verifyToken, validate(createCampaignSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { name, messageTemplate, targetGroup, action } = req.body;

        if (!name || !messageTemplate) {
            return res.status(400).json({ error: "Name and message template required" });
        }

        const campaign = await db.createCampaign({
            name,
            message_template: messageTemplate,
            organization_id: orgId,
            target_group: targetGroup || 'all'
        });

        if (action === "send") {
            // Trigger background sending
            sendCampaign(orgId, campaign.id, messageTemplate, targetGroup || 'all', (req as any).whatsappManager);
        }

        res.status(201).json({ message: "Campaign created", campaign });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create campaign" });
    }
});

// Send Campaign (Manual Trigger)
router.post("/:id/send", verifyToken, validate(sendCampaignSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        // Fetch campaign details first to be sure
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (!campaign) return res.status(404).json({ error: "Campaign not found" });

        // Trigger sending
        sendCampaign(orgId, id, campaign.message_template, campaign.target_group, (req as any).whatsappManager);

        res.json({ message: "Sending started in background" });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to start sending" });
    }
});

// Get campaign logs
router.get("/:id/logs", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;
        const { data: logs, error } = await supabase
            .from('campaign_logs')
            .select('*')
            .eq('campaign_id', id)
            .order('sent_at', { ascending: false });
        if (error) throw error;
        res.json({ logs });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch logs" });
    }
});

// Helper: Background Sender
async function sendCampaign(orgId: string, campaignId: string, message: string, targetGroup: string, manager: WhatsAppManager) {
    console.log(`[Campaign ${campaignId}] Starting broadcast...`);

    try {
        await db.updateCampaignStatus(campaignId, "processing");

        // 1. Fetch Recipients from both Customers and Contacts
        const [customersRes, contactsRes] = await Promise.all([
            supabase.from('customers').select('id, name, phone, status').eq('organization_id', orgId),
            supabase.from('contacts').select('id, name, phone').eq('organization_id', orgId)
        ]);

        const customers = (customersRes.data || []).map(c => ({ ...c, _origin: 'customer' }));
        const contacts = (contactsRes.data || []).map(c => ({ ...c, _origin: 'contact' }));

        // Apply filters if targetGroup is active
        let filteredRecipients: any[] = [...customers];
        if (targetGroup === 'active') {
            filteredRecipients = customers.filter(c => c.status === 'active');
        } else {
            // Merge with contacts for 'all' group
            filteredRecipients = [...customers, ...contacts];
        }

        // De-duplicate by phone number
        const normalize = (p: string) => p ? p.replace(/\D/g, "") : "";
        const uniqueRecipients = Array.from(new Map(filteredRecipients.map(r => [normalize(r.phone), r])).values());
        console.log(`[Campaign ${campaignId}] [NEW_VERSION_V3] Total Unique Recipients: ${uniqueRecipients.length}`);

        if (uniqueRecipients.length === 0) {
            console.log(`[Campaign ${campaignId}] No recipients found.`);
            await db.updateCampaignStatus(campaignId, "completed", { total_recipients: 0 });
            return;
        }

        // Check for already sent messages (Idempotency)
        const { data: logs } = await supabase
            .from('campaign_logs')
            .select('phone, status')
            .eq('campaign_id', campaignId)
            .eq('status', 'sent');

        const sentPhones = new Set(logs?.map(l => normalize(l.phone)) || []);
        const pendingRecipients = uniqueRecipients.filter(r => !sentPhones.has(normalize(r.phone)));

        console.log(`[Campaign ${campaignId}] Total: ${uniqueRecipients.length}, Already Sent: ${sentPhones.size}, Pending: ${pendingRecipients.length}`);

        if (pendingRecipients.length === 0) {
            await db.updateCampaignStatus(campaignId, "completed", { total_recipients: uniqueRecipients.length, successful_sends: sentPhones.size });
            return;
        }

        const state = manager.getState(orgId);
        console.log(`[Campaign ${campaignId}] Client Status: ${state.status}, Recipients found: ${uniqueRecipients.length}`);

        if (state.status !== 'ready') {
            console.error(`[Campaign ${campaignId}] Aborting: Client is not ready (Current status: ${state.status})`);
            await db.updateCampaignStatus(campaignId, "failed", { error_message: "WhatsApp client not connected" });
            return;
        }

        await db.updateCampaignStatus(campaignId, "processing", { total_recipients: uniqueRecipients.length });

        let successCount = sentPhones.size; // Start count with already sent
        let failCount = 0;

        // 2. Loop and Send
        for (const recipient of pendingRecipients) {
            const delay = Math.floor(Math.random() * 3000) + 2000;
            console.log(`[Campaign ${campaignId}] Waiting ${delay}ms to send to ${recipient.phone}`);
            await new Promise(r => setTimeout(r, delay));

            try {
                console.log(`[Campaign ${campaignId}] Processing recipient ${recipient.phone} (${recipient._origin})`);
                const text = message.replace(/{name}/g, recipient.name || "عزيزي العميل");

                let cleanPhone = normalize(recipient.phone);
                // Egypt normalization: 01x -> 201x
                if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
                    cleanPhone = '20' + cleanPhone.substring(1);
                } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
                    cleanPhone = '20' + cleanPhone;
                }

                console.log(`[Campaign ${campaignId}] Sending to FINAL JID: ${cleanPhone}@c.us`);
                const result = await manager.sendMessage(orgId, cleanPhone, text);
                console.log(`[Campaign ${campaignId}] SUCCESS Result:`, JSON.stringify(result));

                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: recipient._origin === 'customer' ? recipient.id : null,
                    phone: cleanPhone,
                    status: "sent"
                });
                successCount++;
            } catch (err: any) {
                console.error(`[Campaign ${campaignId}] ERROR sending to ${recipient.phone}:`, err.message);
                try {
                    await db.logCampaignResult({
                        campaign_id: campaignId,
                        customer_id: recipient._origin === 'customer' ? recipient.id : null,
                        phone: recipient.phone,
                        status: "failed",
                        error_message: err.message
                    });
                } catch (e: any) {
                    console.error("Failed to log failure to DB", e.message);
                }
                failCount++;
            }
        }

        await db.updateCampaignStatus(campaignId, "completed", {
            successful_sends: successCount,
            failed_sends: failCount
        });
        console.log(`[Campaign ${campaignId}] Completed. Success: ${successCount}, Failed: ${failCount}`);

    } catch (error) {
        console.error(`[Campaign ${campaignId}] Fatal error:`, error);
        await db.updateCampaignStatus(campaignId, "failed");
    }
}

export default router;
