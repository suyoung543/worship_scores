import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import ViewScoreButton from "@/components/ViewScoreButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import JumpLink from "@/components/JumpLink";
import UploadForm from "@/components/UploadForm";
import { getSong, getScoreSummary, listKeysForSong, listSongVariants } from "@/lib/db";
import { getSessionMember, SESSION_LABELS, SESSION_MEMBERS } from "@/lib/auth";
import {
  deleteScoreVersionAction,
  deleteSongAction,
  saveSongVariantAction,
  updateScoreMemoAction,
  updateSongAction,
} from "@/lib/actions";
import { displayKey, splitKey } from "@/lib/format";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SongDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const [song, keys, member, variants] = await Promise.all([
    getSong(id),
    listKeysForSong(id),
    getSessionMember(),
    listSongVariants([id]),
  ]);
  if (!song || !member) notFound();

  const summaries = await Promise.all(keys.map((key) => getScoreSummary(id, key)));

  // "D", "D(어노인팅)"처럼 저장된 키를 버전별로 묶고, 그 안에서 키별로 나눕니다 (기본 버전이 맨 앞).
  const groupMap = new Map<string, { base: string; summary: (typeof summaries)[number] }[]>();
  for (const summary of summaries) {
    const { base, version } = splitKey(summary.key);
    groupMap.set(version, [...(groupMap.get(version) ?? []), { base, summary }]);
  }
  // 악보는 아직 없어도 유튜브 링크가 저장된 버전은 카드로 보여줍니다.
  for (const v of variants) if (!groupMap.has(v.name)) groupMap.set(v.name, []);
  const groups = Array.from(groupMap, ([version, keys]) => ({ version, keys })).sort((a, b) =>
    a.version === "" ? -1 : b.version === "" ? 1 : a.version.localeCompare(b.version, "ko")
  );

  return (
    <>
      <NavBar active="songs" />
      <div className="page">
        <div className="between" style={{ alignItems: "flex-start", marginBottom: 16 }}>
          <h1 style={{ fontSize: 24 }}>{song.title}</h1>
          <form action={deleteSongAction}>
            <input type="hidden" name="songId" value={song.id} />
            <ConfirmSubmitButton
              confirmMessage={`'${song.title}' 곡을 삭제할까요? 올라온 악보와 유튜브 링크도 모두 지워지고 되돌릴 수 없어요.`}
              className="btn-danger-text"
            >
              곡 삭제
            </ConfirmSubmitButton>
          </form>
        </div>
        {error === "in-service" && (
          <p className="error-text" style={{ marginTop: -8, marginBottom: 12 }}>
            콘티에 들어가 있는 곡이라 삭제할 수 없어요. 콘티에서 먼저 빼주세요.
          </p>
        )}

        <form action={updateSongAction} className="card" style={{ marginBottom: 24 }}>
          <input type="hidden" name="songId" value={song.id} />
          <div className="field">
            <label htmlFor="title">곡 제목</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="title" name="title" type="text" defaultValue={song.title} required style={{ flex: 1, minWidth: 0 }} />
              <button type="submit" className="btn btn-secondary">
                저장
              </button>
            </div>
            {saved && <span className="upload-progress">✓ 저장했어요.</span>}
          </div>

          {/* 이 곡의 버전·키 한눈에 보기: 누르면 아래 해당 카드/키로 이동 */}
          <div className="stack" style={{ gap: 8, marginTop: 14 }}>
            {groups.map(({ version, keys: versionKeys }, gi) => (
              <div key={version} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <JumpLink targetId={`v${gi}`} className="jump-version">
                  {version || "기본 버전"}
                </JumpLink>
                {versionKeys.map(({ base }, ki) => (
                  <JumpLink key={base} targetId={`v${gi}-k${ki}`} className="badge jump-key">
                    {base}
                  </JumpLink>
                ))}
                {versionKeys.length === 0 && <span className="small muted">악보 없음</span>}
              </div>
            ))}
          </div>
        </form>

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>버전별 악보</h2>
        {error === "version-exists" && (
          <p className="error-text" style={{ marginTop: -4 }}>이미 있는 버전 이름이에요. 다른 이름을 적어주세요.</p>
        )}

        <div className="stack" style={{ marginBottom: 28 }}>
          {groups.map(({ version, keys: versionKeys }, gi) => {
            const info = variants.find((v) => v.name === version);
            return (
            <div className="card" key={version} id={`v${gi}`}>
              <div className="between service-head" style={{ alignItems: "center" }}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", rowGap: 2, minWidth: 0 }}>
                  <span className="variant-title" style={{ fontSize: 16, margin: 0 }}>{version || "기본 버전"}</span>
                  {info?.youtube_url && (
                    <a href={info.youtube_url} target="_blank" rel="noreferrer" className="small">
                      유튜브{info.youtube_label && !version ? ` (${info.youtube_label})` : ""} ↗
                    </a>
                  )}
                </div>
                {/* 펼치면 바로 아래 수정 폼이 보입니다 (CSS :has, 콘티 날짜 수정과 같은 방식) */}
                <details className="service-edit-toggle" key={`${info?.youtube_url}|${info?.youtube_label}`}>
                  <summary>수정</summary>
                </details>
              </div>
              <form action={saveSongVariantAction} className="stack service-edit-form" style={{ marginTop: 10, gap: 10 }}>
                <input type="hidden" name="songId" value={song.id} />
                <input type="hidden" name="variant" value={version} />
                <div className="field">
                  <label>버전 이름</label>
                  <input name="name" type="text" defaultValue={version} placeholder="예: 마커스워십, 찬송가 (비우면 기본 버전)" />
                </div>
                <div className="field">
                  <label>참고 유튜브 링크</label>
                  <input name="youtubeUrl" type="url" defaultValue={info?.youtube_url ?? ""} placeholder="https://youtube.com/..." />
                </div>
                <button type="submit" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}>
                  저장
                </button>
              </form>

              {versionKeys.map(({ base, summary }, ki) => {
                const rows = [
                  { id: "original", label: "원본", v: summary.original ?? null },
                  { id: member, label: `내 수정본 (${SESSION_LABELS[member]})`, v: summary.revisions[member] ?? null },
                  ...SESSION_MEMBERS.filter((m) => m !== member).map((m) => ({
                    id: m,
                    label: `${SESSION_LABELS[m]} 수정본`,
                    v: summary.revisions[m] ?? null,
                  })),
                ];
                return (
                  <div className="variant-block" key={summary.key} id={`v${gi}-k${ki}`}>
                    <span className="badge" style={{ fontSize: 14, marginBottom: 4 }}>{base}</span>
                    {rows.map((r) => {
                      // ＋ 메모(줄 안) 또는 ✎(메모 상자 안)를 누르면 아래 .memo-form 이 열립니다 (CSS :has).
                      // key가 메모 내용이라 저장 후 다시 그려지며 접힙니다.
                      const memoToggle = (label: string) =>
                        r.v && (
                          <details className="memo-toggle" key={r.v.memo ?? ""}>
                            <summary>{label}</summary>
                          </details>
                        );
                      return (
                        <div key={r.id} className="score-row">
                          <div className="version-line">
                            <span className="small">{r.label}</span>
                            <div className="row" style={{ gap: 4 }}>
                              {r.v && !r.v.memo && memoToggle("＋ 메모")}
                              {r.v && (
                                <form action={deleteScoreVersionAction}>
                                  <input type="hidden" name="versionId" value={r.v.id} />
                                  <ConfirmSubmitButton
                                    confirmMessage={`${displayKey(summary.key)} ${r.label} 악보를 삭제할까요? 되돌릴 수 없어요.`}
                                    className="btn-danger-text small"
                                  >
                                    삭제
                                  </ConfirmSubmitButton>
                                </form>
                              )}
                              <ViewScoreButton
                                className="btn btn-secondary btn-sm"
                                title={song.title}
                                subtitle={`${displayKey(summary.key)} · ${r.label}`}
                                pages={r.v?.pages ?? []}
                                memo={r.v?.memo}
                                pdfHref={r.v ? `/api/scores/${r.v.id}/pdf` : undefined}
                              />
                            </div>
                          </div>
                          {r.v?.memo && (
                            <div className="note memo-note">
                              <span>{r.v.memo}</span>
                              {memoToggle("✎")}
                            </div>
                          )}
                          {r.v && (
                            <form action={updateScoreMemoAction} className="row memo-form">
                              <input type="hidden" name="versionId" value={r.v.id} />
                              <input name="memo" defaultValue={r.v.memo ?? ""} placeholder="비우면 메모 삭제" className="memo-input" />
                              <button type="submit" className="btn btn-secondary btn-sm">
                                저장
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>악보 올리기</h2>
        <div className="card">
          <UploadForm songId={song.id} versions={groups.map((g) => g.version).filter(Boolean)} />
        </div>
      </div>
    </>
  );
}
