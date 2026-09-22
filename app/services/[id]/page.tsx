import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import ViewScoreButton from "@/components/ViewScoreButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import AddServiceItemForm from "@/components/AddServiceItemForm";
import { getScoreSummary, getService, listServiceItems, listSongs, type VersionWithPages } from "@/lib/db";
import { getSessionMember, SESSION_LABELS, SESSION_MEMBERS } from "@/lib/auth";
import { formatServiceDate } from "@/lib/format";
import { deleteServiceAction, moveServiceItemAction, removeServiceItemAction } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function versionLabel(version: VersionWithPages | null): { text: string; mine: boolean } {
  if (!version) return { text: "악보 없음", mine: false };
  if (version.kind === "original") return { text: "원본", mine: false };
  return { text: `${SESSION_LABELS[version.session!]} 수정본`, mine: false };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [service, items, songs, member] = await Promise.all([
    getService(id),
    listServiceItems(id),
    listSongs(),
    getSessionMember(),
  ]);

  if (!service || !member) notFound();

  const itemsWithVersion = await Promise.all(
    items.map(async (item) => {
      const summary = await getScoreSummary(item.song_id, item.key);
      const version = summary.revisions[member] ?? summary.original ?? null;

      const slots: { key: string; label: string; version: VersionWithPages | null }[] = [
        { key: "original", label: "원본", version: summary.original ?? null },
        ...SESSION_MEMBERS.map((m) => ({
          key: m,
          label: `${SESSION_LABELS[m]} 수정본`,
          version: summary.revisions[m] ?? null,
        })),
      ];
      // 이미 위에서 "보기" 버튼으로 보여준 것과 정확히 같은 파일만 중복이니 제외하고,
      // 나머지는 악보가 없어도("악보 없음") 그대로 보여줍니다.
      const otherVersions = slots.filter((s) => s.version === null || s.version.id !== version?.id);

      return { item, version, otherVersions };
    })
  );

  return (
    <>
      <NavBar active="services" />
      <div className="page">
        <div className="between" style={{ alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{formatServiceDate(service.service_date)}</h1>
            {service.title && <p className="muted" style={{ marginTop: 4 }}>{service.title}</p>}
          </div>
          <form action={deleteServiceAction}>
            <input type="hidden" name="serviceId" value={service.id} />
            <ConfirmSubmitButton confirmMessage="이 예배 콘티를 삭제할까요? 곡 목록만 지워지고 악보 자체는 남아있어요." className="btn-danger-text">
              삭제
            </ConfirmSubmitButton>
          </form>
        </div>

        <div className="stack" style={{ marginBottom: 20, gap: 10 }}>
          <div className="row">
            <a href={`/api/services/${service.id}/pdf`} className="btn btn-accent">
              콘티 PDF 받기 (내 세션: {SESSION_LABELS[member]})
            </a>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <a href={`/api/services/${service.id}/pdf?version=original`} className="btn btn-secondary btn-sm">
              원본만
            </a>
            {SESSION_MEMBERS.map((m) => (
              <a key={m} href={`/api/services/${service.id}/pdf?version=${m}`} className="btn btn-secondary btn-sm">
                {SESSION_LABELS[m]} 수정본
              </a>
            ))}
          </div>
        </div>

        {itemsWithVersion.length === 0 ? (
          <div className="empty card" style={{ marginBottom: 24 }}>
            <div className="list-title">아직 곡이 없어요</div>
            <p className="small">아래에서 곡을 추가해보세요.</p>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 24, padding: "4px 18px" }}>
            {itemsWithVersion.map(({ item, version, otherVersions }, i) => {
              const label = versionLabel(version);
              const thumb = version?.pages[0]?.url;
              return (
                <div className="item-row" key={item.id}>
                  <div className="item-position">{i + 1}</div>

                  <div>
                    <Link href={`/songs/${item.song_id}`} className="list-title" style={{ fontSize: 17 }}>
                      {item.song.title}
                    </Link>
                    <div className="item-meta">
                      <span className="badge">{item.key}</span>
                      <span className={`badge ${version ? "badge-outline" : ""}`}>{label.text}</span>
                      {item.song.youtube_url && (
                        <a href={item.song.youtube_url} target="_blank" rel="noreferrer" className="small">
                          유튜브{item.song.youtube_label ? ` (${item.song.youtube_label})` : ""} ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="item-actions">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="thumb" />
                    )}
                    <ViewScoreButton
                      label="보기"
                      className="btn btn-secondary"
                      title={item.song.title}
                      subtitle={`${item.key}키 · ${label.text}`}
                      pages={version?.pages ?? []}
                      pdfHref={version ? `/api/scores/${version.id}/pdf` : undefined}
                    />
                  </div>

                  {otherVersions.length > 0 && (
                    <div className="item-actions" style={{ gridColumn: "1 / -1", flexWrap: "wrap" }}>
                      {otherVersions.map((ov) => (
                        <div key={ov.key} className="row" style={{ gap: 6 }}>
                          <span className="small muted">{ov.label}</span>
                          <ViewScoreButton
                            className="btn btn-secondary btn-sm"
                            title={item.song.title}
                            subtitle={`${item.key}키 · ${ov.label}`}
                            pages={ov.version?.pages ?? []}
                            pdfHref={ov.version ? `/api/scores/${ov.version.id}/pdf` : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="item-actions" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
                    <form action={moveServiceItemAction}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" className="btn-icon" disabled={i === 0} aria-label="위로">
                        ↑
                      </button>
                    </form>
                    <form action={moveServiceItemAction}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" className="btn-icon" disabled={i === itemsWithVersion.length - 1} aria-label="아래로">
                        ↓
                      </button>
                    </form>
                    <form action={removeServiceItemAction}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <ConfirmSubmitButton confirmMessage="콘티에서 이 곡을 뺄까요?" className="btn-danger-text">
                        빼기
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>곡 추가</h2>
        <AddServiceItemForm serviceId={service.id} songs={songs} />
      </div>
    </>
  );
}
