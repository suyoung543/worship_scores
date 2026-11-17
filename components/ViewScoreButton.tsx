"use client";

import { useState } from "react";
import ScoreViewer, { type ScoreViewerPage } from "@/components/ScoreViewer";

export default function ViewScoreButton({
  label = "보기",
  className = "btn btn-secondary",
  title,
  subtitle,
  pages,
  pdfHref,
  memo,
}: {
  label?: string;
  className?: string;
  title: string;
  subtitle?: string;
  pages: ScoreViewerPage[];
  pdfHref?: string;
  memo?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (pages.length === 0) {
    return (
      // 같은 크기의 비활성 버튼으로 그려서, 악보가 있든 없든 같은 줄의 높이·정렬이 흔들리지 않게 합니다.
      <button type="button" className={className} disabled style={{ opacity: 0.45, cursor: "default" }}>
        악보 없음
      </button>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <ScoreViewer title={title} subtitle={subtitle} memo={memo} pages={pages} pdfHref={pdfHref} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
