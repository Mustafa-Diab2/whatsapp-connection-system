import { Router, Request, Response } from "express";
import { db, supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();

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
router.post("/", verifyToken, async (req: Request, res: Response) => {
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
router.post("/:id/send", verifyToken, async (req: Request, res: Response) => {
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

// Helper: Background Sender
async function sendCampaign(orgId: string, campaignId: string, message: string, targetGroup: string, manager: WhatsAppManager) {
    console.log(`[Campaign ${campaignId}] Starting broadcast...`);

    try {
        await db.updateCampaignStatus(campaignId, "processing");

        // 1. Fetch Recipients
        let query = supabase.from('customers').select('*').eq('organization_id', orgId);
        if (targetGroup === 'active') {
            query = query.eq('status', 'active'); // Example filter
        }

        const { data: customers } = await query;
        if (!customers || customers.length === 0) {
            await db.updateCampaignStatus(campaignId, "completed", { total_recipients: 0 });
            return;
        }

        // Check for already sent messages (Idempotency)
        const { data: logs } = await supabase
            .from('campaign_logs')
            .select('customer_id')
            .eq('campaign_id', campaignId)
            .eq('status', 'sent');

        const sentCustomerIds = new Set(logs?.map(l => l.customer_id) || []);
        const pendingCustomers = customers.filter(c => !sentCustomerIds.has(c.id));

        console.log(`[Campaign ${campaignId}] Total: ${customers.length}, Already Sent: ${sentCustomerIds.size}, Pending: ${pendingCustomers.length}`);

        if (pendingCustomers.length === 0) {
            await db.updateCampaignStatus(campaignId, "completed", { total_recipients: customers.length });
            return;
        }

        await db.updateCampaignStatus(campaignId, "processing", { total_recipients: customers.length });

        let successCount = sentCustomerIds.size; // Start count with already sent
        let failCount = 0;

        // 2. Loop and Send
        for (const customer of pendingCustomers) {
            // Rate Limiting / Delay (Random 2s to 5s)
            const delay = Math.floor(Math.random() * 3000) + 2000;
            await new Promise(r => setTimeout(r, delay));

            try {
                // Personalize message (Simple replace)
                const text = message.replace(/{name}/g, customer.name || "عزيزي العميل");

                // Note: using orgId as clientId. Ensure the client is connected!
                const result = await manager.sendMessage(orgId, customer.phone, text);

                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: customer.id,
                    phone: customer.phone,
                    status: "sent"
                });
                successCount++;
            } catch (err: any) {
                console.error(`[Campaign ${campaignId}] Failed to send to ${customer.phone}:`, err);
                await db.logCampaignResult({
                    campaign_id: campaignId,
                    customer_id: customer.id,
                    phone: customer.phone,
                    status: "failed",
                    error_message: err.message
                });
                failCount++;
            }

            // Update stats incrementally every 5 messages? maybe overkill, just update at end
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
