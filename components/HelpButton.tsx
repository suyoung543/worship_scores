"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// 지금 보고 있는 화면에 해당하는 안내 섹션을 기본으로 펼칩니다.
const SECTION_BY_PATH: Record<string, string> = {
  "/services": "이번 예배",
  "/songs": "곡 모음",
};

export default function HelpButton({
  intro,
  sections,
}: {
  intro?: ReactNode;
  sections: { title: string; body: ReactNode }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/login")) return null;

  const activeTitle = Object.entries(SECTION_BY_PATH).find(([prefix]) => pathname.startsWith(prefix))?.[1];

  return (
    <>
      <button type="button" className="help-fab" aria-label="사용 안내" onClick={() => setOpen(true)}>
        ?
      </button>

      {open && (
        <div className="help-backdrop" onClick={() => setOpen(false)}>
          <div
            className="help-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="사용 안내"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="help-header">
              <strong>사용 안내</strong>
              <button type="button" className="btn-icon" aria-label="닫기" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="help-scroll">
              {intro && <div className="help-content">{intro}</div>}
              {sections.map((section) => (
                <details key={section.title} className="help-section" open={section.title === activeTitle}>
                  <summary>{section.title}</summary>
                  <div className="help-content">{section.body}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
