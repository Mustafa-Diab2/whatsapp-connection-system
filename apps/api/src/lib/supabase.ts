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
    async getOrCreateConversation(
        waChatId: string, 
        organizationId: string, 
        customerId?: string, 
        physicalPhone?: string,
        attributionData?: {
            source_type?: string;
            source_campaign_id?: string;
            source_campaign_name?: string;
            source_ad_id?: string;
            fbclid?: string;
            ctwa_clid?: string;
            channel?: string;
        }
    ) {
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
        const channel = attributionData?.channel || 'whatsapp';

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
                // Check for attribution events for this phone (last 30 days)
                let attribution: any = null;
                if (!attributionData?.source_type) {
                    const { data: attrEvent } = await supabase
                        .from('click_attribution_events')
                        .select('*')
                        .eq('phone', phoneToUse)
                        .eq('organization_id', organizationId)
                        .eq('status', 'pending')
                        .gte('clicked_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                        .order('clicked_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    
                    if (attrEvent) {
                        attribution = attrEvent;
                    }
                }

                // Build customer data with attribution
                const customerData: any = {
                    name: phoneToUse, // Default name to phone
                    phone: phoneToUse,
                    organization_id: organizationId,
                    source: 'whatsapp',
                    channel: channel,
                    first_touch_at: new Date().toISOString(),
                };

                // Apply attribution from parameter or from click events
                if (attributionData?.source_type || attribution) {
                    const attrSource = attributionData || attribution;
                    customerData.source_type = attrSource.source_type || 'facebook';
                    customerData.source_campaign_id = attrSource.source_campaign_id;
                    customerData.source_campaign_name = attrSource.source_campaign_name;
                    customerData.source_ad_id = attrSource.source_ad_id;
                    customerData.fbclid = attrSource.fbclid;
                    customerData.ctwa_clid = attrSource.ctwa_clid;
                    customerData.attribution_data = {
                        ...attrSource,
                        matched_at: new Date().toISOString(),
                    };
                } else {
                    customerData.source_type = 'direct';
                }

                // Auto-create customer
                const { data: newCustomer } = await supabase
                    .from('customers')
                    .insert(customerData)
                    .select()
                    .single();
                finalCustomerId = newCustomer?.id;

                // Mark attribution event as converted
                if (attribution && finalCustomerId) {
                    await supabase
                        .from('click_attribution_events')
                        .update({
                            status: 'converted',
                            converted_at: new Date().toISOString(),
                            customer_id: finalCustomerId,
                        })
                        .eq('id', attribution.id);
                    
                    // Update tracking link conversion count
                    if (attribution.short_code) {
                        await supabase.rpc('increment_conversion_count', {
                            p_short_code: attribution.short_code
                        }).catch(() => {
                            // RPC might not exist, that's okay
                        });
                    }
                }
            }
        }

        // Create new conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                wa_chat_id: waChatId,
                customer_id: finalCustomerId,
                organization_id: organizationId,
                channel: channel,
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
        bot_mode?: string;
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

        const today = new Date().toISOString().split('T')[0];

        // 1. Total Customers (Real)
        const { count: totalCustomers } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId);

        // 2. Messages Sent TODAY (Real Activity)
        const { count: messagesToday } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gte('created_at', today);

        // 3. Successful Campaign Sends (Total)
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('successful_sends, status')
            .eq('organization_id', organizationId);

        const totalSuccessfulSends = campaigns?.reduce((sum, c) => sum + (c.successful_sends || 0), 0) || 0;

        // 4. Deals count and value (Real)
        const { data: deals } = await supabase
            .from('deals')
            .select('value')
            .eq('organization_id', organizationId);

        return {
            totalCustomers: totalCustomers || 0,
            messagesToday: messagesToday || 0,
            totalSuccessfulSends: totalSuccessfulSends || 0,
            totalDealsValue: deals?.reduce((sum, d) => sum + Number(d.value), 0) || 0,
            totalDealsCount: deals?.length || 0,
            activeCampaigns: campaigns?.filter(c => c.status === 'processing').length || 0
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

        const analytics = [];
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            // Count sent messages
            const { count: sent } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId)
                .eq('is_from_customer', false)
                .gte('created_at', `${dateStr}T00:00:00`)
                .lte('created_at', `${dateStr}T23:59:59`);

            // Count received messages
            const { count: received } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId)
                .eq('is_from_customer', true)
                .gte('created_at', `${dateStr}T00:00:00`)
                .lte('created_at', `${dateStr}T23:59:59`);

            analytics.push({
                date: dateStr,
                messages_sent: sent || 0,
                messages_received: received || 0
            });
        }

        return analytics.reverse(); // Return from oldest to newest
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

    // ========== LOCAL BOT RULES ==========
    async getBotRules(organizationId: string) {
        const { data, error } = await supabase
            .from('bot_rules')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('priority', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createBotRule(rule: any) {
        const { data, error } = await supabase
            .from('bot_rules')
            .insert(rule)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateBotRule(id: string, updates: any, organizationId: string) {
        const { data, error } = await supabase
            .from('bot_rules')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteBotRule(id: string, organizationId: string) {
        const { error } = await supabase
            .from('bot_rules')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
        return true;
    },

    // ========== BOT SESSIONS ==========
    async getBotSession(organizationId: string, phone: string) {
        const { data, error } = await supabase
            .from('bot_sessions')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('customer_phone', phone)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async updateBotSession(organizationId: string, phone: string, updates: any) {
        const { data, error } = await supabase
            .from('bot_sessions')
            .upsert({
                organization_id: organizationId,
                customer_phone: phone,
                ...updates,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'organization_id,customer_phone' })
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
