import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigError =
  !url || !publishableKey
    ? 'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY trong cấu hình môi trường.'
    : ''

export const supabase = supabaseConfigError
  ? null
  : createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
