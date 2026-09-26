import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import ViewScoreButton from "@/components/ViewScoreButton";
import UploadForm from "@/components/UploadForm";
import { getSong, getScoreSummary, listKeysForSong } from "@/lib/db";
import { getSessionMember, SESSION_LABELS, SESSION_MEMBERS } from "@/lib/auth";
import { updateSongAction } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SongDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const [song, keys, member] = await Promise.all([getSong(id), listKeysForSong(id), getSessionMember()]);
  if (!song || !member) notFound();

  const summaries = await Promise.all(keys.map((key) => getScoreSummary(id, key)));

  return (
    <>
      <NavBar active="songs" />
      <div className="page">
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>{song.title}</h1>

        <form action={updateSongAction} className="stack card" style={{ marginBottom: 24 }}>
          <input type="hidden" name="songId" value={song.id} />
          <div className="field">
            <label htmlFor="title">곡 제목</label>
            <input id="title" name="title" type="text" defaultValue={song.title} required />
          </div>
          <div className="field">
            <label htmlFor="youtubeUrl">참고 유튜브 링크</label>
            <input id="youtubeUrl" name="youtubeUrl" type="url" defaultValue={song.youtube_url ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="youtubeLabel">어느 팀 버전인지 (선택)</label>
            <input
              id="youtubeLabel"
              name="youtubeLabel"
              type="text"
              placeholder="예: 마커스 워십, 예람"
              defaultValue={song.youtube_label ?? ""}
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-secondary">
              정보 저장
            </button>
            {saved && <span className="upload-progress">✓ 저장했어요.</span>}
          </div>
        </form>

        <div className="between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18 }}>키별 악보</h2>
        </div>

        <div className="stack" style={{ marginBottom: 28 }}>
          {summaries.map((summary) => {
            const myRevision = summary.revisions[member] ?? null;
            const others = SESSION_MEMBERS.filter((m) => m !== member);

            return (
              <div className="card" key={summary.key}>
                <div className="between" style={{ marginBottom: 10 }}>
                  <span className="badge" style={{ fontSize: 14 }}>
                    {summary.key}
                  </span>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <div className="between">
                    <span className="small muted">원본</span>
                    <ViewScoreButton
                      className="btn btn-secondary"
                      title={song.title}
                      subtitle={`${summary.key}키 · 원본`}
                      pages={summary.original?.pages ?? []}
                      pdfHref={summary.original ? `/api/scores/${summary.original.id}/pdf` : undefined}
                    />
                  </div>
                  <details>
                    <summary className="small" style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
                      {summary.original ? "원본 다시 올리기" : "원본 올리기"}
                    </summary>
                    <UploadForm songId={song.id} kind="original" fixedKey={summary.key} />
                  </details>

                  <hr className="divider" style={{ margin: "4px 0" }} />

                  <div className="between">
                    <span className="small muted">내 수정본 ({SESSION_LABELS[member]})</span>
                    <ViewScoreButton
                      className="btn btn-secondary"
                      title={song.title}
                      subtitle={`${summary.key}키 · 내 수정본`}
                      pages={myRevision?.pages ?? []}
                      pdfHref={myRevision ? `/api/scores/${myRevision.id}/pdf` : undefined}
                    />
                  </div>
                  {myRevision?.memo && <p className="small muted" style={{ margin: 0 }}>메모: {myRevision.memo}</p>}
                  <details>
                    <summary className="small" style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
                      {myRevision ? "내 수정본 다시 올리기" : "내 수정본 올리기"}
                    </summary>
                    <UploadForm songId={song.id} kind="revision" fixedKey={summary.key} />
                  </details>

                  <hr className="divider" style={{ margin: "4px 0" }} />
                  <div className="stack" style={{ gap: 8 }}>
                    {others.map((m) => {
                      const rev = summary.revisions[m] ?? null;
                      return (
                        <div key={m}>
                          <div className="between">
                            <span className="small muted">{SESSION_LABELS[m]} 수정본</span>
                            <ViewScoreButton
                              className="btn btn-secondary"
                              title={song.title}
                              subtitle={`${summary.key}키 · ${SESSION_LABELS[m]} 수정본`}
                              pages={rev?.pages ?? []}
                              pdfHref={rev ? `/api/scores/${rev.id}/pdf` : undefined}
                            />
                          </div>
                          {rev?.memo && <p className="small muted" style={{ margin: 0 }}>메모: {rev.memo}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>새 키로 악보 올리기</h2>
        <div className="card">
          <UploadForm songId={song.id} kind="original" />
        </div>
      </div>
    </>
  );
}
