"use client";

import { useEffect, useRef, useState } from "react";

export const MANUAL = "__manual__";

/**
 * 콘티 곡 추가의 버전·키 선택 상자. 브라우저 기본 선택 상자(맥/아이폰 회색 팝업)는 꾸밀 수 없어서 직접 그립니다.
 * groups: [버전 이름("" = 기본), [[저장된 키, 표시할 키], ...]][]
 */
export default function KeyDropdown({
  groups,
  value,
  onChange,
}: {
  groups: [string, [string, string][]][];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  let label = "선택하세요";
  if (value === MANUAL) label = "＋ 새 버전 또는 새 키 입력";
  for (const [version, keys] of groups) {
    const hit = keys.find(([raw]) => raw === value);
    if (hit) label = `${version || "기본 버전"} · ${hit[1]}`;
  }

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className={`dropdown-button ${value ? "" : "placeholder"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="dropdown-menu" role="listbox">
          {groups.map(([version, keys]) => (
            <div key={version} role="group" aria-label={version || "기본 버전"}>
              <div className="dropdown-group">{version || "기본 버전"}</div>
              {keys.map(([raw, shown]) => (
                <button
                  key={raw}
                  type="button"
                  role="option"
                  aria-selected={value === raw}
                  className="dropdown-option"
                  onClick={() => pick(raw)}
                >
                  {shown}
                  {value === raw && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="dropdown-divider" />
          <button
            type="button"
            role="option"
            aria-selected={value === MANUAL}
            className="dropdown-option dropdown-manual"
            onClick={() => pick(MANUAL)}
          >
            ＋ 새 버전 또는 새 키 입력
          </button>
        </div>
      )}
    </div>
  );
}
