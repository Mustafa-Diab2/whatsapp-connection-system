import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ CRITICAL ERROR: Supabase Credentials are MISSING in this environment!');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

// Database helper functions
export const db = {
    // ========== CUSTOMERS ==========
    async getCustomers(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getCustomerByPhone(phone: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('phone', phone)
            .eq('organization_id', organizationId)
            .single();
        return data;
    },

    async getCustomerById(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .single();
        if (error) return null;
        return data;
    },

    async createCustomer(customer: {
        name: string;
        phone: string;
        email?: string;
        status?: string;
        notes?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('customers')
            .insert(customer)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateCustomer(id: string, updates: any, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('customers')
            .update({ ...updates, last_contact_at: new Date().toISOString() })
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteCustomer(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    // ========== CONTACTS ==========
    async getContacts(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createContact(contact: {
        name: string;
        phone: string;
        email?: string;
        group_name?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('contacts')
            .insert(contact)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateContact(id: string, updates: any, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteContact(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    // ========== CONVERSATIONS ==========
    async getOrCreateConversation(waChatId: string, organizationId: string, customerId?: string, physicalPhone?: string) {
        if (!organizationId) throw new Error("Organization ID required");

        // Try to find existing conversation
        let { data: existing } = await supabase
            .from('conversations')
            .select('*, customer:customers(*)')
            .eq('wa_chat_id', waChatId)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (existing) return existing;

        // If no customerId provided, try to find or create customer
        let finalCustomerId = customerId;
        const rawPhone = physicalPhone || waChatId.split('@')[0];
        const phoneToUse = rawPhone.replace(/\D/g, ""); // Clean formatting for DB consistency

        if (!finalCustomerId) {
            const { data: customer } = await supabase
                .from('customers')
                .select('id')
                .eq('phone', phoneToUse)
                .eq('organization_id', organizationId)
                .maybeSingle();

            if (customer) {
                finalCustomerId = customer.id;
            } else {
                // Auto-create customer
                const { data: newCustomer } = await supabase
                    .from('customers')
                    .insert({
                        name: phoneToUse, // Default name to phone
                        phone: phoneToUse,
                        organization_id: organizationId,
                        source: 'whatsapp'
                    })
                    .select()
                    .single();
                finalCustomerId = newCustomer?.id;
            }
        }

        // Create new conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                wa_chat_id: waChatId,
                customer_id: finalCustomerId,
                organization_id: organizationId
            })
            .select('*, customer:customers(*)')
            .single();
        if (error) throw error;
        return data;
    },

    async updateUserInfo(userId: string, updates: { phone?: string; name?: string; avatar?: string }) {
        const { data, error } = await supabase
            .from('users')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========== MESSAGES ==========
    async saveMessage(message: {
        conversation_id?: string;
        customer_id?: string;
        wa_message_id: string;
        body: string;
        from_phone: string;
        to_phone?: string;
        is_from_customer: boolean;
        is_bot_reply?: boolean;
        message_type?: string;
        sentiment?: string;
        intent?: string;
        metadata?: any;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('messages')
            .insert(message)
            .select()
            .single();
        if (error && error.code !== '23505') throw error; // Ignore duplicate key error
        return data;
    },

    async updateMessageAnalysis(id: string, analysis: { sentiment?: string; intent?: string }) {
        const { data, error } = await supabase
            .from('messages')
            .update(analysis)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getMessagesByConversation(conversationId: string, organizationId: string, limit = 50) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: true })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    // ========== THREADS ==========
    async getThreads(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('threads')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createThread(thread: {
        title: string;
        customer_name?: string;
        customer_id?: string;
        priority?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('threads')
            .insert(thread)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateThread(id: string, updates: any, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('threads')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteThread(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('threads')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    // ========== SETTINGS ==========
    async getSettings(organizationId: string) {
        if (!organizationId) return {};

        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('organization_id', organizationId);

        if (error) throw error;

        // Convert to object
        const settings: Record<string, any> = {};
        data?.forEach((row) => {
            settings[row.key] = row.value;
        });
        return settings;
    },

    async updateSettings(key: string, value: any, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");

        // First check if exists for this org to handle unique constraint properly
        // Or simpler: add organization_id to the unique constraint in DB
        // For now, we manually check or upsert with filter

        const { error } = await supabase
            .from('settings')
            .upsert({
                key,
                value,
                organization_id: organizationId,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,key' }); // Requires creating this composite unique constraint

        if (error) throw error;
    },

    // ========== BOT CONFIG ==========
    async getBotConfig(clientId = 'default', organizationId?: string) {
        let query = supabase.from('bot_config').select('*').eq('client_id', clientId);

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.single();
        return data || { enabled: false, system_prompt: '', api_key: '' };
    },

    async updateBotConfig(clientId: string, config: {
        enabled?: boolean;
        system_prompt?: string;
        api_key?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('bot_config')
            .upsert({
                client_id: clientId,
                ...config,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,client_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========== ANALYTICS ==========
    async getAnalyticsStats(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");

        const { data: customers } = await supabase
            .from('customers')
            .select('status')
            .eq('organization_id', organizationId);

        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('organization_id', organizationId);

        const { data: threads } = await supabase
            .from('threads')
            .select('status')
            .eq('organization_id', organizationId);

        // Also query conversations as they represent active WhatsApp chats
        const { data: conversations } = await supabase
            .from('conversations')
            .select('status')
            .eq('organization_id', organizationId);

        const { data: deals } = await supabase
            .from('deals')
            .select('value')
            .eq('organization_id', organizationId);

        // Priority for 'openThreads': If there are open conversations, use them. 
        // In many cases, these terms are used interchangeably in the UI.
        const openConversationsCount = conversations?.filter((c) => c.status === 'open').length || 0;
        const openThreadsCount = threads?.filter((t) => t.status === 'open').length || 0;

        return {
            totalCustomers: customers?.length || 0,
            activeCustomers: customers?.filter((c) => c.status === 'active').length || 0,
            totalContacts: contacts?.length || 0,
            openThreads: Math.max(openConversationsCount, openThreadsCount), // Use the larger number (fallback to threads if legacy)
            pendingThreads: threads?.filter((t) => t.status === 'pending').length || 0,
            totalDealsValue: deals?.reduce((sum, d) => sum + Number(d.value), 0) || 0,
            totalDealsCount: deals?.length || 0
        };
    },

    async incrementDailyStat(statName: string, incrementBy = 1, organizationId: string) {
        if (!organizationId) return;

        const today = new Date().toISOString().split('T')[0];

        const { data: existing } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('date', today)
            .eq('organization_id', organizationId)
            .single();

        if (existing) {
            await supabase
                .from('analytics_daily')
                .update({ [statName]: (existing[statName] || 0) + incrementBy })
                .eq('date', today)
                .eq('organization_id', organizationId);
        } else {
            await supabase
                .from('analytics_daily')
                .insert({
                    date: today,
                    [statName]: incrementBy,
                    organization_id: organizationId
                });
        }
    },

    async getDailyAnalytics(days = 7, organizationId: string) {
        if (!organizationId) return [];

        const { data, error } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('organization_id', organizationId)
            .order('date', { ascending: false })
            .limit(days);
        if (error) throw error;
        return data || [];
    },

    // ========== AI RESPONSES ==========
    async saveAIResponse(response: {
        message_id: string;
        prompt: string;
        response: string;
        model?: string;
        tokens_used?: number;
        response_time_ms?: number;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('ai_responses')
            .insert(response)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========== AI AGENTS ==========
    async getAgents(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");

        const { data, error } = await supabase
            .from('ai_agents')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createAgent(agent: {
        name: string;
        description?: string;
        system_prompt: string;
        model?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('ai_agents')
            .insert(agent)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========== KNOWLEDGE BASE (RAG) ==========
    async searchDocuments(embedding: number[], matchThreshold: number, matchCount: number, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");

        const { data, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: matchThreshold,
            match_count: matchCount,
            filter_org_id: organizationId
        });

        if (error) throw error;
        return data || [];
    },

    async createDocument(doc: {
        content: string;
        metadata: any;
        embedding: number[];
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('documents')
            .insert(doc)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getDocuments(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('documents')
            .select('id, metadata, created_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async deleteDocument(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    // ========== CAMPAIGNS ==========
    async createCampaign(campaign: {
        name: string;
        message_template: string;
        organization_id: string;
        target_group?: string;
        scheduled_at?: string;
    }) {
        const { data, error } = await supabase
            .from('campaigns')
            .insert(campaign)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getCampaigns(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async updateCampaignStatus(id: string, status: string, stats?: any) {
        const updateData: any = { status, updated_at: new Date().toISOString() };
        if (stats) {
            Object.assign(updateData, stats);
        }
        const { data, error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async logCampaignResult(log: {
        campaign_id: string;
        phone: string;
        status: string;
        error_message?: string;
        customer_id?: string;
    }) {
        const { error } = await supabase
            .from('campaign_logs')
            .insert({ ...log, sent_at: new Date().toISOString() });
        if (error) console.error("Failed to log campaign result", error);
    },

    // ========== DEALS / CRM PIPELINE ==========
    async getStages(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");

        let { data, error } = await supabase
            .from('stages')
            .select('*')
            .eq('organization_id', organizationId)
            .order('position', { ascending: true });

        // If no stages, create defaults
        if (data && data.length === 0) {
            const defaults = [
                { name: 'Lead', position: 0, color: '#94a3b8' },
                { name: 'Contacted', position: 1, color: '#3b82f6' },
                { name: 'Proposal', position: 2, color: '#f59e0b' },
                { name: 'Won', position: 3, color: '#10b981' },
                { name: 'Lost', position: 4, color: '#ef4444' }
            ];

            for (const d of defaults) {
                await supabase.from('stages').insert({ ...d, organization_id: organizationId });
            }

            // Re-fetch
            ({ data, error } = await supabase
                .from('stages')
                .select('*')
                .eq('organization_id', organizationId)
                .order('position', { ascending: true }));
        }

        if (error) throw error;
        return data || [];
    },

    async getDeals(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('deals')
            .select('*, customer:customers(name, phone)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async createDeal(deal: any) {
        const { data, error } = await supabase
            .from('deals')
            .insert(deal)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateDealStage(id: string, stageId: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('deals')
            .update({ stage_id: stageId, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('organization_id', organizationId) // Security Fix
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteDeal(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('deals')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    // ========== AUTO ASSIGNMENT ==========
    async getOrganizationSettings(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('organizations')
            .select('auto_assign_enabled, last_assigned_index')
            .eq('id', organizationId)
            .single();
        if (error) return null;
        return data;
    },

    async toggleAutoAssign(organizationId: string, enabled: boolean) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('organizations')
            .update({ auto_assign_enabled: enabled })
            .eq('id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getTeamMembers(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: true }); // Keep consistent order
        if (error) throw error;
        return data || [];
    },

    async updateOrganizationLastIndex(organizationId: string, index: number) {
        const { error } = await supabase
            .from('organizations')
            .update({ last_assigned_index: index })
            .eq('id', organizationId);
        if (error) console.error("Failed to update last index", error);
    },

    async assignConversation(conversationId: string, userId: string) {
        const { error } = await supabase
            .from('conversations')
            .update({ assigned_to: userId })
            .eq('id', conversationId);
        if (error) throw error;
    },

    async logAudit(orgId: string, userId: string | null, action: string, details: any, ip?: string) {
        supabase.from("audit_logs").insert({
            organization_id: orgId,
            user_id: userId,
            action,
            details,
            ip_address: ip
        }).then(({ error }) => {
            if (error) console.error("Audit Log Error:", error);
        });
    },

    // ========== QUICK REPLIES ==========
    async getQuickReplies(organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('quick_replies')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createQuickReply(reply: {
        title: string;
        body: string;
        shortcut?: string;
        organization_id: string;
    }) {
        const { data, error } = await supabase
            .from('quick_replies')
            .insert(reply)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateQuickReply(id: string, updates: any, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('quick_replies')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteQuickReply(id: string, organizationId: string) {
        if (!organizationId) throw new Error("Organization ID required");
        const { error } = await supabase
            .from('quick_replies')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    async getActivityLogs(organizationId: string, limit = 10) {
        if (!organizationId) throw new Error("Organization ID required");
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, user:users(name)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },
};

export default supabase;
