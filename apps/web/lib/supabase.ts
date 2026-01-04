import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase credentials not found. Real-time features will be disabled.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Hook to get Supabase session and organization
export function useSupabase() {
    const [session, setSession] = useState<any>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) {
                // Get organization ID from user metadata or localStorage
                const orgId = session.user.user_metadata?.organization_id || 
                              localStorage.getItem('organizationId');
                setOrganizationId(orgId);
            }
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                if (session?.user) {
                    const orgId = session.user.user_metadata?.organization_id || 
                                  localStorage.getItem('organizationId');
                    setOrganizationId(orgId);
                } else {
                    setOrganizationId(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    return { supabase, session, organizationId, loading };
}

// Helper to subscribe to real-time changes
export const subscribeToMessages = (callback: (payload: any) => void) => {
    return supabase
        .channel('messages-channel')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            callback
        )
        .subscribe();
};

export const subscribeToCustomers = (callback: (payload: any) => void) => {
    return supabase
        .channel('customers-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'customers' },
            callback
        )
        .subscribe();
};

export const subscribeToThreads = (callback: (payload: any) => void) => {
    return supabase
        .channel('threads-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'threads' },
            callback
        )
        .subscribe();
};

export default supabase;
