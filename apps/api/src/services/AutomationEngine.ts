import { supabase } from "../lib/supabase";
import WhatsAppManager from "../wa/WhatsAppManager";

export class AutomationEngine {
    private static instance: AutomationEngine;
    private manager: WhatsAppManager;
    private interval: NodeJS.Timeout | null = null;

    private constructor(manager: WhatsAppManager) {
        this.manager = manager;
    }

    public static getInstance(manager: WhatsAppManager): AutomationEngine {
        if (!AutomationEngine.instance) {
            AutomationEngine.instance = new AutomationEngine(manager);
        }
        return AutomationEngine.instance;
    }

    public start() {
        if (this.interval) return;
        console.log("[AutomationEngine] Starting automation workers...");

        // Check for reminders every minute
        this.interval = setInterval(() => {
            void this.processReminders();
            void this.generateAIInsights();
        }, 60000);
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async processReminders() {
        try {
            // 1. Fetch pending reminders that are due
            const { data: reminders, error } = await supabase
                .from("scheduled_reminders")
                .select("*, customers(phone)")
                .eq("status", "pending")
                .lte("scheduled_for", new Date().toISOString());

            if (error) throw error;
            if (!reminders || reminders.length === 0) return;

            console.log(`[AutomationEngine] Found ${reminders.length} due reminders.`);

            for (const item of reminders) {
                try {
                    const clientId = item.organization_id;
                    const phone = item.customers?.phone;
                    const msg = item.message_text;

                    if (!phone || !msg) {
                        await supabase.from("scheduled_reminders").update({ status: 'failed' }).eq("id", item.id);
                        continue;
                    }

                    // Send via WhatsApp
                    await this.manager.sendMessage(clientId, `${phone}@c.us`, msg);

                    // Update status
                    await supabase.from("scheduled_reminders")
                        .update({
                            status: 'sent',
                            executed_at: new Date().toISOString()
                        })
                        .eq("id", item.id);

                    console.log(`[AutomationEngine] Sent reminder ${item.id} to ${phone}`);
                } catch (err: any) {
                    console.error(`[AutomationEngine] Failed reminder ${item.id}:`, err.message);
                    await supabase.from("scheduled_reminders").update({
                        status: 'failed',
                        retry_count: (item.retry_count || 0) + 1
                    }).eq("id", item.id);
                }
            }
        } catch (err) {
            console.error("[AutomationEngine] Process reminders error:", err);
        }
    }

    async generateAIInsights() {
        // This runs periodically to scan database for business opportunities
        // For now, let's implement a "Negative Sentiment" or "High Demand" detector
        try {
            // Implementation logic:
            // 1. Fetch recent messages (last 24h)
            // 2. Group by Org
            // 3. Summarize with Gemini
            // 4. Save to ai_insights table
        } catch (err) {
            console.error("[AutomationEngine] Insight generation error:", err);
        }
    }
}
