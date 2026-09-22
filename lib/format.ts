const WEEKDAY_FMT = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" });

/** "2026-09-27" 같은 date 문자열을 "2026년 9월 27일 (일)" 형태로. 시간대 영향을 받지 않도록 UTC로 고정해 포맷합니다. */
export function formatServiceDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_FMT.format(date);
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

/** 오늘(한국시간) 이후의 가장 가까운 일요일 날짜를 "YYYY-MM-DD"로 돌려줍니다. 새 예배 만들 때 기본값으로 사용합니다. */
export function upcomingSundayISODate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  const today = new Date(Date.UTC(y, m - 1, d));
  const daysUntilSunday = (7 - today.getUTCDay()) % 7;
  today.setUTCDate(today.getUTCDate() + daysUntilSunday);

  const yy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
