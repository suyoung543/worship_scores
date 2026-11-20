const WEEKDAY_FMT = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" });

/** 키 표기 흔들림(공백, 유니코드 ♭/♯, 첫 글자 소문자)을 통일합니다. 콘티의 키와 악보의 키가 사소한 표기 차이로 어긋나지 않게 하기 위함. */
export function normalizeKey(key: string): string {
  // 버전 이름(괄호 안)은 띄어쓰기를 살리고 앞뒤 공백·연속 공백만 정리합니다. 키 부분만 공백을 모두 지웁니다.
  const nfkc = key.normalize("NFKC");
  const m = nfkc.match(/^([^(]*)\((.*)\)\s*$/);
  const base = (m ? m[1] : nfkc).replace(/\s+/g, "").replace(/♭/g, "b").replace(/♯/g, "#");
  const head = base.charAt(0).toUpperCase() + base.slice(1);
  const version = m ? m[2].trim().replace(/\s+/g, " ") : "";
  return version ? `${head}(${version})` : head;
}

/** 같은 키의 다른 버전 악보는 키 뒤에 "(버전)"을 붙여 별도의 키로 취급합니다. 예: D + 예람 → "D(예람)" */
export function keyWithVersion(key: string, version: string): string {
  const v = version.trim();
  return normalizeKey(v ? `${key.trim()}(${v})` : key);
}

/** 예배 종류 (콘티 제목으로 저장) */
export const SERVICE_TYPES = ["주일예배", "수요예배", "금요예배"] as const;

/** 검색어가 키 모양인지 (G, Bb, F#m, e♭ …). 곡 모음 검색에서 키 검색으로 판단할 때 씁니다. */
export function looksLikeKey(query: string): boolean {
  return /^[A-G](#|b)?m?$/.test(normalizeKey(query));
}

/** keyWithVersion의 반대: "D(예람)" → { base: "D", version: "예람" }, "D" → { base: "D", version: "" } */
export function splitKey(key: string): { base: string; version: string } {
  const m = key.match(/^(.+?)\((.+)\)$/);
  return m ? { base: m[1], version: m[2] } : { base: key, version: "" };
}

/** 화면 표시용: "D(예람)" → "D · 예람" */
export function displayKey(key: string): string {
  const { base, version } = splitKey(key);
  return version ? `${base} · ${version}` : base;
}

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
