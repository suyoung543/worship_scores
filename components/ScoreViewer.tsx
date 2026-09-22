"use client";

import { useRef, useState } from "react";

export interface ScoreViewerPage {
  page_no: number;
  url: string;
}

export default function ScoreViewer({
  title,
  subtitle,
  pages,
  pdfHref,
  onClose,
}: {
  title: string;
  subtitle?: string;
  pages: ScoreViewerPage[];
  pdfHref?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.min(Math.max(i, 0), pages.length - 1));
  }

  return (
    <div className="viewer-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="viewer-topbar">
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {subtitle && <div className="small" style={{ opacity: 0.75 }}>{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon"
          style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#f4f2ec" }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <div className="viewer-scroll" ref={scrollerRef} onScroll={handleScroll}>
        {pages.map((page) => (
          <div className="viewer-page" key={page.page_no}>
            {/* 서명된 Supabase Storage URL이라 next/image 대신 일반 img를 씁니다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.url} alt={`${title} ${page.page_no}페이지`} />
          </div>
        ))}
      </div>

      <div className="viewer-bottombar">
        {pages.length > 1 && (
          <div className="row" style={{ gap: 6 }}>
            {pages.map((p, i) => (
              <span key={p.page_no} className={`dot ${i === index ? "active" : ""}`} />
            ))}
          </div>
        )}
        {pdfHref && (
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ background: "rgba(255,255,255,0.95)" }}
          >
            PDF로 받기
          </a>
        )}
      </div>
    </div>
  );
}
