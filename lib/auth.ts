import { cookies } from "next/headers";

// 로그인은 Supabase Auth 없이 아주 단순하게 처리합니다:
// 1) 공용 비밀번호를 맞추고 2) 자신의 세션 역할(인도자/메인건반/드럼)을 고르면
// 그 역할이 담긴 서명된 쿠키를 내려줍니다. 미들웨어와 서버 액션은 이 쿠키만 확인합니다.

export const SESSION_MEMBERS = ["leader", "keys", "drums"] as const;
export type SessionMember = (typeof SESSION_MEMBERS)[number];

export const SESSION_LABELS: Record<SessionMember, string> = {
  leader: "인도자",
  keys: "메인건반",
  drums: "드럼",
};

export function isSessionMember(value: string | null | undefined): value is SessionMember {
  return !!value && (SESSION_MEMBERS as readonly string[]).includes(value);
}

const COOKIE_NAME = "bs_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 반 년 정도 유지 (다들 새 툴에 익숙하지 않으므로 자주 로그인시키지 않음)

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return secret;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

/** 로그인 시 발급할 쿠키 값을 만듭니다. */
export async function createSessionCookieValue(member: SessionMember): Promise<string> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${member}.${expiresAt}`;
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

/** 미들웨어/서버 어디서나 쓸 수 있는, 쿠키 값 검증 함수 (Web Crypto만 사용). */
export async function verifySessionCookieValue(value: string | undefined): Promise<SessionMember | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [member, expiresAtStr, signature] = parts;
  if (!isSessionMember(member)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = await hmac(`${member}.${expiresAtStr}`);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0 ? member : null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = MAX_AGE_SECONDS;

/** 서버 컴포넌트/서버 액션에서 현재 로그인한 세션 멤버를 읽습니다. */
export async function getSessionMember(): Promise<SessionMember | null> {
  const store = await cookies();
  return verifySessionCookieValue(store.get(COOKIE_NAME)?.value);
}
