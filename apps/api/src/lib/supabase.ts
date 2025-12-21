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
    async getCustomers() {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getCustomerByPhone(phone: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('phone', phone)
            .single();
        return data;
    },

    async createCustomer(customer: {
        name: string;
        phone: string;
        email?: string;
        status?: string;
        notes?: string;
    }) {
        const { data, error } = await supabase
            .from('customers')
            .insert(customer)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateCustomer(id: string, updates: any) {
        const { data, error } = await supabase
            .from('customers')
            .update({ ...updates, last_contact_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteCustomer(id: string) {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
    },

    // ========== CONTACTS ==========
    async getContacts() {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createContact(contact: {
        name: string;
        phone: string;
        email?: string;
        group_name?: string;
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
    async getOrCreateConversation(waChatId: string, customerId?: string) {
        // Try to find existing conversation
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .eq('wa_chat_id', waChatId)
            .single();

        if (existing) return existing;

        // Create new conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({ wa_chat_id: waChatId, customer_id: customerId })
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
    async getThreads() {
        const { data, error } = await supabase
            .from('threads')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createThread(thread: {
        title: string;
        customer_name?: string;
        customer_id?: string;
        priority?: string;
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
    async getSettings() {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        // Convert to object
        const settings: Record<string, any> = {};
        data?.forEach((row) => {
            settings[row.key] = row.value;
        });
        return settings;
    },

    async updateSettings(key: string, value: any) {
        const { error } = await supabase
            .from('settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
    },

    // ========== BOT CONFIG ==========
    async getBotConfig(clientId = 'default') {
        const { data, error } = await supabase
            .from('bot_config')
            .select('*')
            .eq('client_id', clientId)
            .single();
        return data || { enabled: false, system_prompt: '', api_key: '' };
    },

    async updateBotConfig(clientId: string, config: {
        enabled?: boolean;
        system_prompt?: string;
        api_key?: string;
    }) {
        const { data, error } = await supabase
            .from('bot_config')
            .upsert({
                client_id: clientId,
                ...config,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========== ANALYTICS ==========
    async getAnalyticsStats() {
        const { data: customers } = await supabase.from('customers').select('status');
        const { data: contacts } = await supabase.from('contacts').select('id');
        const { data: threads } = await supabase.from('threads').select('status');

        return {
            totalCustomers: customers?.length || 0,
            activeCustomers: customers?.filter((c) => c.status === 'active').length || 0,
            totalContacts: contacts?.length || 0,
            openThreads: threads?.filter((t) => t.status === 'open').length || 0,
            pendingThreads: threads?.filter((t) => t.status === 'pending').length || 0,
        };
    },

    async incrementDailyStat(statName: string, incrementBy = 1) {
        // Get or create today's record
        const today = new Date().toISOString().split('T')[0];

        const { data: existing } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('date', today)
            .single();

        if (existing) {
            await supabase
                .from('analytics_daily')
                .update({ [statName]: (existing[statName] || 0) + incrementBy })
                .eq('date', today);
        } else {
            await supabase
                .from('analytics_daily')
                .insert({ date: today, [statName]: incrementBy });
        }
    },

    async getDailyAnalytics(days = 7) {
        const { data, error } = await supabase
            .from('analytics_daily')
            .select('*')
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
    async getAgents() {
        const { data, error } = await supabase
            .from('ai_agents')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createAgent(agent: { name: string; description?: string; system_prompt: string; model?: string }) {
        const { data, error } = await supabase
            .from('ai_agents')
            .insert(agent)
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};

export default supabase;
