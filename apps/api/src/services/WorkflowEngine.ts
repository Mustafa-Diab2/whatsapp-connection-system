import { supabase } from "../lib/supabase";
import WhatsAppManager from "../wa/WhatsAppManager";

export class WorkflowEngine {
    private static instance: WorkflowEngine;
    private manager: WhatsAppManager;

    private constructor(manager: WhatsAppManager) {
        this.manager = manager;
    }

    public static getInstance(manager: WhatsAppManager): WorkflowEngine {
        if (!WorkflowEngine.instance) {
            WorkflowEngine.instance = new WorkflowEngine(manager);
        }
        return WorkflowEngine.instance;
    }

    async trigger(clientId: string, type: string, config: any, context: any) {
        try {
            // Find active workflows for this trigger
            const { data: workflows, error } = await supabase
                .from("workflows")
                .select("*, workflow_steps(*)")
                .eq("organization_id", clientId)
                .eq("trigger_type", type)
                .eq("is_active", true);

            if (error) throw error;
            if (!workflows || workflows.length === 0) return;

            for (const flow of workflows) {
                // Evaluate trigger config (e.g., if type is 'keyword', check if body matches)
                let matches = false;
                if (type === 'keyword' && flow.trigger_config?.keyword) {
                    const body = context.message?.body?.toLowerCase() || "";
                    matches = body.includes(flow.trigger_config.keyword.toLowerCase());
                } else if (type === 'new_customer') {
                    matches = true;
                }

                if (matches) {
                    console.log(`[Workflow] Triggered flow "${flow.name}" for ${context.chatId}`);
                    await this.executeSteps(clientId, flow.workflow_steps, context);
                }
            }
        } catch (err) {
            console.error("[Workflow] Execution error:", err);
        }
    }

    async executeSteps(clientId: string, steps: any[], context: any) {
        // Sort steps
        const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

        for (const step of sortedSteps) {
            try {
                const { action_type, action_config } = step;

                if (action_type === 'send_message') {
                    await this.manager.sendMessage(clientId, context.chatId, action_config.text);
                } else if (action_type === 'send_list') {
                    await this.manager.sendListMenu(
                        clientId,
                        context.chatId,
                        action_config.body,
                        action_config.buttonText,
                        action_config.sections,
                        action_config.title,
                        action_config.footer
                    );
                } else if (action_type === 'send_buttons') {
                    await this.manager.sendButtonsMessage(
                        clientId,
                        context.chatId,
                        action_config.text,
                        action_config.buttons,
                        action_config.title,
                        action_config.footer
                    );
                }

                // Small delay between steps
                await new Promise(r => setTimeout(r, 1000));
            } catch (err: any) {
                console.error(`[Workflow] Step failed:`, err.message);
            }
        }
    }
}
