"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { filesToA4Pages } from "@/lib/convert";
import { addServiceItemAction, uploadScoreVersionAction } from "@/lib/actions";

type Status = "idle" | "converting" | "saving" | "error";

export default function AddServiceItemForm({
  serviceId,
  songs,
}: {
  serviceId: string;
  songs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scoreFiles, setScoreFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const busy = status === "converting" || status === "saving";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    const key = String(formData.get("key") ?? "").trim();
    if (!key) {
      setErrorMsg("키를 입력해주세요.");
      return;
    }

    try {
      let pages: Blob[] = [];
      if (scoreFiles.length > 0) {
        setStatus("converting");
        setProgress(0);
        pages = await filesToA4Pages(scoreFiles, (done) => setProgress(done));
      }

      setStatus("saving");
      const { songId } = await addServiceItemAction(formData);

      if (pages.length > 0) {
        const uploadData = new FormData();
        uploadData.set("songId", songId);
        uploadData.set("key", key);
        uploadData.set("kind", "original");
        uploadData.set("memo", "");
        pages.forEach((blob, i) => uploadData.append("pages", blob, `page-${i + 1}.jpg`));
        await uploadScoreVersionAction(uploadData);
      }

      formRef.current?.reset();
      setScoreFiles([]);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "저장 중 문제가 생겼어요.");
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="stack card">
      <input type="hidden" name="serviceId" value={serviceId} />

      <div className="field">
        <label htmlFor="songId">기존 곡에서 선택</label>
        <select id="songId" name="songId" defaultValue="">
          <option value="">— 선택 안 함 (아래에 새 곡 입력) —</option>
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        새 곡이라면 기존 곡 선택은 비워두고 아래를 입력해주세요.
      </p>

      <div className="field">
        <label htmlFor="newSongTitle">새 곡 제목</label>
        <input id="newSongTitle" name="newSongTitle" type="text" placeholder="예: 주 은혜임을" />
      </div>

      <div className="field">
        <label htmlFor="youtubeUrl">참고 유튜브 링크 (새 곡일 때만)</label>
        <input id="youtubeUrl" name="youtubeUrl" type="url" placeholder="https://youtube.com/..." />
      </div>

      <div className="field">
        <label htmlFor="youtubeLabel">어느 팀 버전인지 (선택, 새 곡일 때만)</label>
        <input id="youtubeLabel" name="youtubeLabel" type="text" placeholder="예: 마커스 워십, 예람" />
      </div>

      <div className="field">
        <label htmlFor="key">키</label>
        <input id="key" name="key" type="text" placeholder="예: D, Eb, G#m" required />
      </div>

      <div className="field">
        <label htmlFor="memo">메모 (선택)</label>
        <input id="memo" name="memo" type="text" placeholder="예: 2절까지만" />
      </div>

      <div className="field">
        <label htmlFor="scoreFiles">원본 악보 (선택, PDF 또는 이미지, 여러 장 가능)</label>
        <input
          id="scoreFiles"
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => setScoreFiles(Array.from(e.target.files ?? []))}
        />
        {scoreFiles.length > 0 && status === "idle" && (
          <p className="small muted">{scoreFiles.length}개 파일 선택됨</p>
        )}
      </div>

      {status === "converting" && <p className="upload-progress">악보 변환 중... {progress}장 완료</p>}
      {status === "saving" && <p className="upload-progress">저장 중...</p>}
      {errorMsg && <p className="error-text">{errorMsg}</p>}

      <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 4 }} disabled={busy}>
        {busy ? "처리 중..." : "콘티에 추가"}
      </button>
    </form>
  );
}
