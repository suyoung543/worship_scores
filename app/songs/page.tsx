import Link from "next/link";
import NavBar from "@/components/NavBar";
import { listSongsWithScoreInfo } from "@/lib/db";
import { createSongAction } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SongsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const songs = await listSongsWithScoreInfo(q);

  return (
    <>
      <NavBar active="songs" />
      <div className="page">
        <div className="between" style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24 }}>곡 모음</h1>
          <Link href="/songs/gallery" className="btn btn-secondary btn-sm">
            갤러리로 보기
          </Link>
        </div>

        <form method="get" action="/songs" className="row" style={{ marginBottom: 20 }}>
          <input type="search" name="q" placeholder="곡 제목 검색" defaultValue={q ?? ""} style={{ flex: 1, minHeight: 46, border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "0 12px" }} />
          <button type="submit" className="btn btn-secondary">
            검색
          </button>
        </form>

        {songs.length === 0 ? (
          <div className="empty card" style={{ marginBottom: 24 }}>
            <div className="list-title">{q ? "검색 결과가 없어요" : "아직 등록된 곡이 없어요"}</div>
          </div>
        ) : (
          <div className="list card" style={{ marginBottom: 24 }}>
            {songs.map((s) => (
              <Link href={`/songs/${s.id}`} key={s.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <div className="list-title">{s.title}</div>
                  <div className="item-meta">
                    {s.keys.length === 0 && <span className="small muted">악보 없음</span>}
                    {s.keys.map((k) => (
                      <span key={k.key} className={`badge ${k.hasRevision ? "" : "badge-outline"}`}>
                        {k.key}
                        {k.hasRevision ? " ✎" : ""}
                      </span>
                    ))}
                    {s.youtube_url && (
                      <span className="small muted">유튜브{s.youtube_label ? ` (${s.youtube_label})` : ""} ↗</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>새 곡 등록</h2>
        <form action={createSongAction} className="stack card">
          <div className="field">
            <label htmlFor="title">곡 제목</label>
            <input id="title" name="title" type="text" required placeholder="예: 주 은혜임을" />
          </div>
          <div className="field">
            <label htmlFor="youtubeUrl">참고 유튜브 링크 (선택)</label>
            <input id="youtubeUrl" name="youtubeUrl" type="url" placeholder="https://youtube.com/..." />
          </div>
          <div className="field">
            <label htmlFor="youtubeLabel">어느 팀 버전인지 (선택)</label>
            <input id="youtubeLabel" name="youtubeLabel" type="text" placeholder="예: 마커스 워십, 예람" />
          </div>
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 4 }}>
            등록하기
          </button>
        </form>
      </div>
    </>
  );
}
