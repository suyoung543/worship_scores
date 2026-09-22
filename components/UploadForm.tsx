"use client";

import { useState, useTransition } from "react";
import { filesToA4Pages } from "@/lib/convert";
import { uploadScoreVersionAction } from "@/lib/actions";

type Status = "idle" | "converting" | "uploading" | "done" | "error";

export default function UploadForm({
  songId,
  kind,
  fixedKey,
}: {
  songId: string;
  kind: "original" | "revision";
  /** 키가 이미 정해져 있으면 전달 (수정 업로드). 없으면 새 키를 직접 입력받습니다. */
  fixedKey?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const effectiveKey = fixedKey ?? keyInput.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!effectiveKey) {
      setErrorMsg("키를 입력해주세요.");
      return;
    }
    if (files.length === 0) {
      setErrorMsg("파일을 선택해주세요.");
      return;
    }

    setStatus("converting");
    setProgress(0);
    try {
      const pages = await filesToA4Pages(files, (done) => setProgress(done));

      const formData = new FormData();
      formData.set("songId", songId);
      formData.set("key", effectiveKey);
      formData.set("kind", kind);
      formData.set("memo", memo);
      pages.forEach((blob, i) => formData.append("pages", blob, `page-${i + 1}.jpg`));

      setStatus("uploading");
      startTransition(() => {
        uploadScoreVersionAction(formData)
          .then(() => {
            setStatus("done");
            setFiles([]);
            setMemo("");
            setKeyInput("");
          })
          .catch((err: unknown) => {
            setStatus("error");
            setErrorMsg(err instanceof Error ? err.message : "업로드 중 문제가 생겼어요.");
          });
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "파일 변환 중 문제가 생겼어요.");
    }
  }

  const busy = status === "converting" || status === "uploading" || isPending;

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ paddingTop: 12 }}>
      {!fixedKey && (
        <div className="field">
          <label>키</label>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="예: D, Eb, G#m"
          />
        </div>
      )}

      <div className="field">
        <label>파일 선택 (PDF 또는 이미지, 여러 장 가능)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {kind === "revision" && (
        <div className="field">
          <label>메모 (선택)</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 브릿지 코드 수정"
          />
        </div>
      )}

      {files.length > 0 && status === "idle" && <p className="small muted">{files.length}개 파일 선택됨</p>}
      {status === "converting" && <p className="upload-progress">변환 중... {progress}장 완료</p>}
      {status === "uploading" && <p className="upload-progress">업로드 중...</p>}
      {status === "done" && <p className="upload-progress">저장했어요.</p>}
      {errorMsg && <p className="error-text">{errorMsg}</p>}

      <button type="submit" className="btn btn-primary" disabled={busy || files.length === 0}>
        {busy ? "처리 중..." : "저장"}
      </button>
    </form>
  );
}
