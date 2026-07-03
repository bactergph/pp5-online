// supabase.ts - สร้าง Supabase client สำหรับใช้ทั่วแอป
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client สำหรับ Browser (ใช้ anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client สำหรับ Server (ใช้ service role key - bypass RLS)
// ใช้เฉพาะใน Server Actions หรือ Route Handlers เท่านั้น
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })
}

// สร้าง client พร้อม access token (สำหรับ RLS)
export function createAuthClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    auth: { persistSession: false }
  })
}
