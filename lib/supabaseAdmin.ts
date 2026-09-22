import "server-only";
import { createClient } from "@supabase/supabase-js";

// service role 키를 쓰는 클라이언트입니다. 반드시 서버(서버 컴포넌트 / 서버 액션 /
// 라우트 핸들러)에서만 import 하세요. "server-only" 패키지가 클라이언트 번들에
// 실수로 포함되는 것을 빌드 타임에 막아줍니다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. " +
      ".env.local.example을 참고해 .env.local을 만들어주세요."
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SCORES_BUCKET = "scores";
