import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Supabase credentials not found. Database features will be disabled.');
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

    async updateContact(id: string, updates: any) {
        const { data, error } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteContact(id: string) {
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== CONVERSATIONS ==========
    async getOrCreateConversation(waChatId: string, organizationId: string, customerId?: string) {
        if (!organizationId) throw new Error("Organization ID required");

        // Try to find existing conversation
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .eq('wa_chat_id', waChatId)
            .eq('organization_id', organizationId)
            .single();

        if (existing) return existing;

        // Create new conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                wa_chat_id: waChatId,
                customer_id: customerId,
                organization_id: organizationId
            })
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

    async getMessagesByConversation(conversationId: string, limit = 50) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
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

    async updateThread(id: string, updates: any) {
        const { data, error } = await supabase
            .from('threads')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteThread(id: string) {
        const { error } = await supabase.from('threads').delete().eq('id', id);
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

        return {
            totalCustomers: customers?.length || 0,
            activeCustomers: customers?.filter((c) => c.status === 'active').length || 0,
            totalContacts: contacts?.length || 0,
            openThreads: threads?.filter((t) => t.status === 'open').length || 0,
            pendingThreads: threads?.filter((t) => t.status === 'pending').length || 0,
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

};

export default supabase;
