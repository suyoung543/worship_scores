"use client";

const compact = (v: string) => v.replace(/\s+/g, "").toLowerCase();

/** 공백·대소문자만 다른 버전 이름은 이미 있는 이름으로 맞춥니다 ("마커스 워십" → "마커스워십"). */
export function canonicalVersion(input: string, options: string[]): string {
  const c = compact(input);
  return options.find((o) => compact(o) === c) ?? input.trim();
}

/** 버전 이름 입력 + 이 곡에 이미 있는 버전을 버튼으로 보여줘서 같은 버전이 두 개로 갈라지지 않게 합니다. */
export default function VersionInput({
  id,
  value,
  onChange,
  options,
  suggestWhenEmpty = true,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** false면 입력하는 동안에만 비슷한 기존 버전을 보여줍니다. */
  suggestWhenEmpty?: boolean;
}) {
  const typed = compact(value);
  const matches = options.filter(
    (o) => compact(o) !== typed && (typed ? compact(o).includes(typed) : suggestWhenEmpty)
  );
  // 기존 버전과 (띄어쓰기·대소문자 무시하고) 일치하지 않으면 새 버전이 만들어진다고 알려줍니다. ("예람" vs "예람워십" 실수 방지)
  const isNew = typed !== "" && options.length > 0 && !options.some((o) => compact(o) === typed);

  return (
    <>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="예: 마커스워십, 찬송가" autoComplete="off" />
      {matches.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
          <span className="small muted">있는 버전:</span>
          {matches.map((o) => (
            <button key={o} type="button" className="chip-suggest" onClick={() => onChange(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      {isNew && <p className="small muted" style={{ margin: 0 }}>‘{value.trim()}’ 새 버전으로 추가돼요.</p>}
    </>
  );
}
