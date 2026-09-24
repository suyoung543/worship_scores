// 서버/클라이언트 양쪽에서 쓰는 세션(역할) 정의입니다. next/headers 등 서버 전용 의존성을 넣지 마세요.

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
