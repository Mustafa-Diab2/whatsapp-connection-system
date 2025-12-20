import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase credentials not found. Real-time features will be disabled.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
