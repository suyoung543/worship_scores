import Link from "next/link";
import NavBar from "@/components/NavBar";
import { listSongsForGallery } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SongsGalleryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const songs = await listSongsForGallery(q);

  return (
    <>
      <NavBar active="songs" />
      <div className="page">
        <div className="between" style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24 }}>곡 갤러리</h1>
          <Link href="/songs" className="btn btn-secondary btn-sm">
            리스트로 보기
          </Link>
        </div>

        <form method="get" action="/songs/gallery" className="row" style={{ marginBottom: 20 }}>
          <input
            type="search"
            name="q"
            placeholder="곡 제목 검색"
            defaultValue={q ?? ""}
            style={{ flex: 1, minHeight: 46, border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "0 12px" }}
          />
          <button type="submit" className="btn btn-secondary">
            검색
          </button>
        </form>

        {songs.length === 0 ? (
          <div className="empty card">
            <div className="list-title">{q ? "검색 결과가 없어요" : "아직 등록된 곡이 없어요"}</div>
          </div>
        ) : (
          <div className="gallery-grid">
            {songs.map((s) => (
              <Link href={`/songs/${s.id}`} key={s.id} className="gallery-card">
                <div className="gallery-thumb">
                  {s.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnailUrl} alt="" />
                  ) : (
                    <span className="gallery-thumb-empty">악보 없음</span>
                  )}
                </div>
                <div className="gallery-title">{s.title}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
