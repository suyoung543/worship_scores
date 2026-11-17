"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { filesToA4Pages, uploadScorePages, type ConvertedPage } from "@/lib/convert";
import { addServiceItemAction } from "@/lib/actions";
import ScoreTypeSelect, { appendScoreType, type ScoreType } from "@/components/ScoreTypeSelect";
import { keyWithVersion, splitKey } from "@/lib/format";
import VersionInput, { canonicalVersion } from "@/components/VersionInput";
import KeyDropdown, { MANUAL } from "@/components/KeyDropdown";

type SongOption = { id: string; title: string; keys?: { key: string }[]; variants?: { name: string }[] };

type Status = "idle" | "converting" | "saving" | "error";

export default function AddServiceItemForm({
  serviceId,
  songs,
}: {
  serviceId: string;
  songs: SongOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [songQuery, setSongQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedSong, setSelectedSong] = useState<SongOption | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [versionInput, setVersionInput] = useState("");
  // 기존 곡일 때 드롭다운 값: "" (아직 안 고름) | 저장된 키 그대로 (예: "C(예람워십)") | MANUAL (직접 입력)
  const [keyChoice, setKeyChoice] = useState("");
  const [scoreFiles, setScoreFiles] = useState<File[]>([]);
  const [scoreType, setScoreType] = useState<ScoreType>("original");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const compact = (v: string) => v.replace(/\s+/g, "").toLowerCase();
  const matches = selectedSong || !songQuery.trim()
    ? []
    : songs.filter((s) => compact(s.title).includes(compact(songQuery))).slice(0, 8);

  function resetSongPicker() {
    setSongQuery("");
    setNewTitle("");
    setSelectedSong(null);
    setKeyInput("");
    setVersionInput("");
    setKeyChoice("");
  }

  const busy = status === "converting" || status === "saving";

  // 고른 곡에 이미 있는 버전들 (악보 키 뒤 괄호 + 유튜브 정보만 있는 버전)
  const versionOptions =
    mode === "existing" && selectedSong
      ? Array.from(
          new Set([
            ...(selectedSong.keys ?? []).map((k) => splitKey(k.key).version),
            ...(selectedSong.variants ?? []).map((v) => v.name),
          ])
        ).filter(Boolean)
      : [];

  // 고른 곡에 올라온 악보를 버전별로 묶은 것 (기본 버전이 맨 앞): [["", ["E","G"]], ["어노인팅", ["E"]]]
  const scoreGroups = new Map<string, string[]>();
  if (mode === "existing") {
    for (const k of selectedSong?.keys ?? []) {
      const { base, version } = splitKey(k.key);
      scoreGroups.set(version, [...(scoreGroups.get(version) ?? []), base]);
    }
  }
  const sortedScoreGroups = Array.from(scoreGroups).sort(([a], [b]) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "ko")
  );
  const hasExistingScores = sortedScoreGroups.length > 0;
  const showManual = !hasExistingScores || keyChoice === MANUAL;

  function chooseKey(value: string) {
    setKeyChoice(value);
    setErrorMsg("");
    if (value && value !== MANUAL) {
      const { base, version } = splitKey(value);
      setKeyInput(base);
      setVersionInput(version);
    } else {
      // 직접 입력으로 바꾸면 이전에 고른 값이 몰래 남지 않게 비웁니다.
      setKeyInput("");
      setVersionInput("");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    if (mode === "existing" && !selectedSong) {
      setErrorMsg("검색해서 곡을 골라주세요. 목록에 없으면 '새 곡'을 눌러주세요.");
      return;
    }
    if (mode === "new" && !newTitle.trim()) {
      setErrorMsg("새 곡 제목을 입력해주세요.");
      return;
    }
    const key = keyInput.trim() ? keyWithVersion(keyInput, canonicalVersion(versionInput, versionOptions)) : "";
    formData.set("key", key);
    if (!key) {
      setErrorMsg(showManual ? "키를 입력해주세요." : "버전·키를 골라주세요.");
      return;
    }

    let itemAdded = false;
    try {
      let pages: ConvertedPage[] = [];
      if (scoreFiles.length > 0) {
        setStatus("converting");
        setProgress(0);
        pages = await filesToA4Pages(scoreFiles, (done) => setProgress(done));
      }

      setStatus("saving");
      const { songId } = await addServiceItemAction(formData);
      itemAdded = true;

      if (pages.length > 0) {
        const uploadData = new FormData();
        uploadData.set("songId", songId);
        uploadData.set("key", key);
        appendScoreType(uploadData, scoreType);
        uploadData.set("memo", "");
        await uploadScorePages(uploadData, pages);
      }

      formRef.current?.reset();
      resetSongPicker();
      setScoreFiles([]);
      setScoreType("original");
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      const reason = err instanceof Error ? err.message : "문제가 생겼어요.";
      if (itemAdded) {
        // 곡은 이미 콘티에 들어갔으므로 다시 제출하면 중복 추가됩니다. 폼을 비우고 곡 페이지에서 올리도록 안내합니다.
        formRef.current?.reset();
        resetSongPicker();
        setScoreFiles([]);
        setScoreType("original");
        router.refresh();
        setErrorMsg(`곡은 콘티에 추가됐지만 악보 업로드에 실패했어요 (${reason}). 곡 페이지에서 악보를 다시 올려주세요.`);
      } else {
        setErrorMsg(reason);
      }
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="stack card">
      <input type="hidden" name="serviceId" value={serviceId} />

      <div className="segmented" role="tablist">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "active" : ""}
            onClick={() => {
              setMode(m);
              setErrorMsg("");
            }}
          >
            {m === "existing" ? "기존 곡" : "새 곡"}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        <div className="field">
          <label htmlFor="songSearch">곡 검색</label>
          <input type="hidden" name="songId" value={selectedSong?.id ?? ""} />
          <input
            id="songSearch"
            type="search"
            autoComplete="off"
            placeholder="곡 제목을 입력하세요"
            value={songQuery}
            onChange={(e) => {
              setSongQuery(e.target.value);
              setSelectedSong(null);
            }}
          />
          {selectedSong && <p className="small" style={{ margin: 0 }}>✓ {selectedSong.title}</p>}
          {matches.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => {
                    setSelectedSong(s);
                    setKeyChoice("");
                    setSongQuery(s.title);
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
          {!selectedSong && songQuery.trim() && matches.length === 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setNewTitle(songQuery.trim());
                setMode("new");
              }}
            >
              ＋ &lsquo;{songQuery.trim()}&rsquo; 새 곡으로 등록
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="newSongTitle">곡 제목</label>
            <input
              id="newSongTitle"
              name="newSongTitle"
              type="text"
              placeholder="예: 주 은혜임을"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="youtubeUrl">참고 유튜브 링크 (선택)</label>
            <input id="youtubeUrl" name="youtubeUrl" type="url" placeholder="https://youtube.com/..." />
          </div>
        </>
      )}

      <hr className="divider" style={{ margin: "4px 0" }} />

      <div className="field">
        <label>버전·키</label>
        {hasExistingScores && (
          <KeyDropdown
            value={keyChoice}
            onChange={chooseKey}
            groups={sortedScoreGroups.map(([version, bases]) => [
              version,
              bases.map((base): [string, string] => [keyWithVersion(base, version), base]),
            ])}
          />
        )}
        {showManual && (
          <div className="version-key-row" style={hasExistingScores ? { marginTop: 4 } : undefined}>
            <div className="field">
              <label htmlFor="keyVersion" className="sub-label">버전 (선택)</label>
              <VersionInput id="keyVersion" value={versionInput} onChange={setVersionInput} options={versionOptions} suggestWhenEmpty={false} />
            </div>
            <div className="field">
              <label htmlFor="key" className="sub-label">키</label>
              <input id="key" type="text" placeholder="예: D" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="memo">송폼 (선택)</label>
        <textarea id="memo" name="memo" rows={2} placeholder="예: I - V1 - V2 - C - B - C - O" />
      </div>

      <div className="field">
        <label htmlFor="scoreKind">어떤 악보인가요? (악보를 함께 올릴 때)</label>
        <ScoreTypeSelect id="scoreKind" value={scoreType} onChange={setScoreType} />
      </div>

      <div className="field">
        <label htmlFor="scoreFiles">악보 (선택, PDF 또는 이미지, 여러 장 가능)</label>
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
