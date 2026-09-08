import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

/** 서비스 역할 클라이언트. 서버 전용. RLS를 우회하므로 호출 전 권한을 직접 검증한다. */
export function createAdminSupabase() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
