"use client";

import { useState, useTransition } from "react";
import { filesToA4Pages, uploadScorePages } from "@/lib/convert";
import { keyWithVersion } from "@/lib/format";
import VersionInput, { canonicalVersion } from "@/components/VersionInput";
import ScoreTypeSelect, { appendScoreType, type ScoreType } from "@/components/ScoreTypeSelect";

type Status = "idle" | "converting" | "uploading" | "done" | "error";

export default function UploadForm({
  songId,
  versions = [],
}: {
  songId: string;
  /** 이 곡에 이미 있는 버전 이름들 (버전 입력 시 추천). 같은 버전·키·종류로 올리면 기존 악보가 교체됩니다. */
  versions?: string[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [typeChoice, setTypeChoice] = useState<ScoreType>("original");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const effectiveKey = keyInput.trim() ? keyWithVersion(keyInput, canonicalVersion(versionInput, versions)) : "";

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
      appendScoreType(formData, typeChoice);
      formData.set("memo", memo);

      setStatus("uploading");
      startTransition(() => {
        uploadScorePages(formData, pages)
          .then(() => {
            setStatus("done");
            setFiles([]);
            setMemo("");
            setKeyInput("");
            setVersionInput("");
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
      <div className="version-key-row">
        <div className="field">
          <label>버전 (선택)</label>
          <VersionInput value={versionInput} onChange={setVersionInput} options={versions} />
        </div>
        <div className="field">
          <label>키</label>
          <input type="text" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="예: D" />
        </div>
      </div>
      <div className="field">
        <label>어떤 악보인가요?</label>
        <ScoreTypeSelect value={typeChoice} onChange={setTypeChoice} />
      </div>

      <div className="field">
        <label>파일 선택 (PDF 또는 이미지, 여러 장 가능)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      <div className="field">
        <label>메모 (선택)</label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 브릿지 코드 수정"
        />
      </div>

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
