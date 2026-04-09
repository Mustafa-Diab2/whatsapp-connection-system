import { getSupabase } from "../lib/supabase";
import WhatsAppManager from "../wa/WhatsAppManager";
import { ai } from "../lib/ai"; 

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
            const { data: reminders, error } = await getSupabase()
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
                        await getSupabase().from("scheduled_reminders").update({ status: 'failed' }).eq("id", item.id);
                        continue;
                    }

                    // Send via WhatsApp
                    await this.manager.sendMessage(clientId, `${phone}@c.us`, msg);

                    // Update status
                    await getSupabase().from("scheduled_reminders")
                        .update({
                            status: 'sent',
                            executed_at: new Date().toISOString()
                        })
                        .eq("id", item.id);

                    console.log(`[AutomationEngine] Sent reminder ${item.id} to ${phone}`);
                } catch (err: any) {
                    console.error(`[AutomationEngine] Failed reminder ${item.id}:`, err.message);
                    await getSupabase().from("scheduled_reminders").update({
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
        console.log("[AutomationEngine] Scanning for business insights...");
        try {
            // 1. Fetch recent messages (last 24h) and group by organization
            const { data: messages, error } = await getSupabase()
                .from("messages")
                .select("*, customers(id, name)")
                .eq("is_from_customer", true)
                .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (error) throw error;
            if (!messages || messages.length === 0) return;

            // 2. Group by organization
            const orgGroups = messages.reduce((acc: any, msg) => {
                const orgId = msg.organization_id;
                if (!acc[orgId]) acc[orgId] = [];
                acc[orgId].push(msg);
                return acc;
            }, {});

            for (const orgId in orgGroups) {
                const orgMessages = orgGroups[orgId];
                if (orgMessages.length < 5) continue; // Only analyze if there's enough data

                // Summarize messages for AI context
                const msgSummary = orgMessages.map((m: any) => 
                    `[${m.created_at}] Customer: ${m.body}`
                ).join("\n");

                // 3. Request insight from AI
                const prompt = `Analyze these recent customer messages for this organization and provide one key business insight:
                ${msgSummary}
                
                Return a JSON object: { "type": "opportunity|alert|summary", "title": "...", "content": "...", "urgency": "low|medium|high" }`;

                const aiOutput = await ai.generateReply(prompt, []);
                
                try {
                    // Extract JSON if AI wrapped it in markdown
                    const jsonStr = aiOutput.includes("```") 
                        ? aiOutput.split("```")[1].replace("json", "").trim()
                        : aiOutput.trim();
                    
                    const insight = JSON.parse(jsonStr);

                    // 4. Save to ai_insights table
                    await getSupabase().from("ai_insights").insert({
                        organization_id: orgId,
                        type: insight.type || 'summary',
                        title: insight.title || 'AI Insights Update',
                        content: insight.content || 'No insights generated.',
                        urgency: insight.urgency || 'low',
                        metadata: { stats: { message_count: orgMessages.length } }
                    });

                    console.log(`[AutomationEngine] Generated insight for Org ${orgId}`);
                } catch (e) {
                    console.error(`[AutomationEngine] JSON parsing failed for AI output:`, aiOutput);
                }
            }
        } catch (err) {
            console.error("[AutomationEngine] Insight generation error:", err);
        }
    }
}
