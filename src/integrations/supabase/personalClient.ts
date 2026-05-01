// Personal Supabase Client for dual-write architecture
// This client connects to your personal infrastructure
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PERSONAL_SUPABASE_URL = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const PERSONAL_SUPABASE_ANON_KEY = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

// Check if personal database credentials are available
const isPersonalDbConfigured = !!(PERSONAL_SUPABASE_URL && PERSONAL_SUPABASE_ANON_KEY);

// Create client only if credentials are provided
export const personalSupabase = isPersonalDbConfigured
  ? createClient<Database>(PERSONAL_SUPABASE_URL, PERSONAL_SUPABASE_ANON_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : null;

export { isPersonalDbConfigured };