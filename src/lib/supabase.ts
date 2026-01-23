import { createClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}

/**
 * Singleton Supabase client instance with strong TypeScript typing.
 * Used for all database, auth, and storage interactions.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
