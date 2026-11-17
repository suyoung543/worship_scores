import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import ViewScoreButton from "@/components/ViewScoreButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import AddServiceItemForm from "@/components/AddServiceItemForm";
import VersionKeyPicker from "@/components/VersionKeyPicker";
import { getScoreSummary, getService, listServiceItems, listSongVariants, listSongsWithScoreInfo, type VersionWithPages } from "@/lib/db";
import { getSessionMember, SESSION_LABELS, SESSION_MEMBERS } from "@/lib/auth";
import { displayKey, formatServiceDate, splitKey } from "@/lib/format";
import { deleteServiceAction, moveServiceItemAction, removeServiceItemAction, updateServiceAction, updateServiceItemKeyAction, updateServiceItemMemoAction } from "@/lib/actions";

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
    listSongsWithScoreInfo(),
    getSessionMember(),
  ]);

  if (!service || !member) notFound();
  const variants = await listSongVariants(Array.from(new Set(items.map((i) => i.song_id))));

  const itemsWithVersion = await Promise.all(
    items.map(async (item) => {
      const summary = await getScoreSummary(item.song_id, item.key);
      // 내 수정본 -> 원본 -> (원본도 없으면) 메인건반 수정본 순. getEffectiveVersion과 동일한 규칙.
      const version = summary.revisions[member] ?? summary.original ?? summary.revisions.keys ?? null;

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

      // 콘티에 넣은 버전(키 뒤 괄호)의 유튜브 정보
      const variant = variants.find((v) => v.song_id === item.song_id && v.name === splitKey(item.key).version) ?? null;

      return { item, version, otherVersions, variant };
    })
  );

  return (
    <>
      <NavBar active="services" />
      <div className="page">
        <div className="between service-head" style={{ alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{formatServiceDate(service.service_date)}</h1>
            {service.title && <p className="muted" style={{ marginTop: 4 }}>{service.title}</p>}
          </div>
          <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          {/* 펼치면 아래 .service-edit-form 이 보입니다 (CSS :has). 버튼 자리는 그대로 유지됩니다. */}
          <details className="service-edit-toggle">
            <summary>수정</summary>
          </details>
          <form action={deleteServiceAction}>
            <input type="hidden" name="serviceId" value={service.id} />
            <ConfirmSubmitButton confirmMessage="이 예배 콘티를 삭제할까요? 곡 목록만 지워지고 악보 자체는 남아있어요." className="btn-danger-text">
              삭제
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

        <form action={updateServiceAction} className="stack card service-edit-form" style={{ marginBottom: 16 }}>
          <input type="hidden" name="serviceId" value={service.id} />
          <div className="field">
            <label htmlFor="serviceDate">날짜</label>
            <input id="serviceDate" name="serviceDate" type="date" defaultValue={service.service_date} required />
          </div>
          <div className="field">
            <label htmlFor="title">제목 (선택)</label>
            <input id="title" name="title" type="text" defaultValue={service.title ?? ""} placeholder="예: 주일 2부 예배" />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>
            저장
          </button>
        </form>

        <div className="stack" style={{ marginBottom: 20, gap: 10 }}>
          <div className="row">
            <a
              href={`/api/services/${service.id}/pdf?version=${member}`}
              className="btn btn-accent"
              style={{ minHeight: 40, padding: "0 16px", fontSize: 14 }}
            >
              내 세션 PDF 받기
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
            {itemsWithVersion.map(({ item, version, otherVersions, variant }, i) => {
              const label = versionLabel(version);
              const thumb = version?.pages[0]?.url;
              return (
                <div className="item-row" key={item.id}>
                  <div className="item-head">
                    <div className="item-position">{i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/songs/${item.song_id}`} className="list-title" style={{ fontSize: 17 }}>
                        {item.song.title}
                      </Link>
                      <div className="item-meta">
                        <span className="badge">{displayKey(item.key)}</span>
                        <span className={`badge ${version ? "badge-outline" : ""}`}>{label.text}</span>
                        {variant?.youtube_url && (
                          <a href={variant.youtube_url} target="_blank" rel="noreferrer" className="small">
                            유튜브{variant.name || variant.youtube_label ? ` (${variant.name || variant.youtube_label})` : ""} ↗
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
                        subtitle={`${displayKey(item.key)} · ${label.text}`}
                        pages={version?.pages ?? []}
                        pdfHref={version ? `/api/scores/${version.id}/pdf` : undefined}
                      />
                    </div>
                  </div>

                  {item.memo && (
                    <div className="item-section">
                      <div className="item-section-title">송폼</div>
                      <p className="song-form">{item.memo}</p>
                    </div>
                  )}

                  {otherVersions.length > 0 && (
                    <div className="item-section">
                      <div className="item-section-title">다른 악보</div>
                      {otherVersions.map((ov) => (
                        <div key={ov.key} className="version-line">
                          <span className="small">{ov.label}</span>
                          <ViewScoreButton
                            className="btn btn-secondary btn-sm"
                            title={item.song.title}
                            subtitle={`${displayKey(item.key)} · ${ov.label}`}
                            pages={ov.version?.pages ?? []}
                            pdfHref={ov.version ? `/api/scores/${ov.version.id}/pdf` : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="item-section">
                    <div className="item-footer">
                      {/* 글자 버튼은 제자리에 두고, 누르면 아래 패널이 열립니다 (CSS :has). 같은 name이라 하나만 열림. 저장 후 값이 바뀌면 key가 바뀌어 접힘. */}
                      <details className="service-edit-toggle toggle-key" name={`edit-${item.id}`} key={`key-${item.key}`}>
                        <summary>✎ 버전·키</summary>
                      </details>
                      <details className="service-edit-toggle toggle-songform" name={`edit-${item.id}`} key={`form-${item.memo ?? ""}`}>
                        <summary>{item.memo ? "✎ 송폼 수정" : "✎ 송폼 적기"}</summary>
                      </details>
                      <div className="item-actions" style={{ marginLeft: "auto" }}>
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

                    <form action={updateServiceItemKeyAction} className="edit-panel panel-key" key={`panel-key-${item.key}`}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <div className="field">
                        <label>버전·키</label>
                        {(() => {
                          const info = songs.find((s) => s.id === item.song_id);
                          const keys = (info?.keys ?? []).map((k) => k.key);
                          const versionOptions = Array.from(
                            new Set([...keys.map((k) => splitKey(k).version), ...(info?.variants ?? []).map((v) => v.name)])
                          ).filter(Boolean);
                          return <VersionKeyPicker keys={keys} versionOptions={versionOptions} initialKey={item.key} />;
                        })()}
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm">
                        저장
                      </button>
                    </form>

                    <form action={updateServiceItemMemoAction} className="edit-panel panel-songform" key={`panel-form-${item.memo ?? ""}`}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <div className="field">
                        <label>송폼</label>
                        <textarea name="memo" rows={1} defaultValue={item.memo ?? ""} placeholder="예: I - V1 - V2 - C - V1 - C - B - C - O" />
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm">
                        저장
                      </button>
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
