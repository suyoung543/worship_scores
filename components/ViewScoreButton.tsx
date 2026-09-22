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
}: {
  label?: string;
  className?: string;
  title: string;
  subtitle?: string;
  pages: ScoreViewerPage[];
  pdfHref?: string;
}) {
  const [open, setOpen] = useState(false);

  if (pages.length === 0) {
    return (
      <span className="badge badge-outline" style={{ minHeight: 46, alignItems: "center" }}>
        악보 없음
      </span>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <ScoreViewer title={title} subtitle={subtitle} pages={pages} pdfHref={pdfHref} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
