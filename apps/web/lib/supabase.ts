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
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get organization from localStorage
        const orgId = localStorage.getItem('organizationId');
        setOrganizationId(orgId);
        setLoading(false);

        // Listen for storage changes in case login happens in another tab
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'organizationId') {
                setOrganizationId(e.newValue);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return { supabase, organizationId, loading };
}

// Helper to subscribe to real-time changes
export const subscribeToMessages = (organizationId: string, callback: (payload: any) => void) => {
    return supabase
        .channel(`messages-${organizationId}`)
        .on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'messages',
              filter: `organization_id=eq.${organizationId}` // Server-side filter
            },
            callback
        )
        .subscribe();
};

export const subscribeToCustomers = (organizationId: string, callback: (payload: any) => void) => {
    return supabase
        .channel(`customers-${organizationId}`)
        .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public', 
              table: 'customers',
              filter: `organization_id=eq.${organizationId}`
            },
            callback
        )
        .subscribe();
};

export const subscribeToThreads = (organizationId: string, callback: (payload: any) => void) => {
    return supabase
        .channel(`threads-${organizationId}`)
        .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public', 
              table: 'threads',
              filter: `organization_id=eq.${organizationId}`
            },
            callback
        )
        .subscribe();
};

export default supabase;
