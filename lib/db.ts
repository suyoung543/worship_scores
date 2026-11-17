import "server-only";
import { supabaseAdmin, SCORES_BUCKET } from "@/lib/supabaseAdmin";
import type { SessionMember } from "@/lib/auth";
import { keyWithVersion, normalizeKey, splitKey } from "@/lib/format";

const SIGNED_URL_TTL = 60 * 60; // 1시간

export type ScoreVersionKind = "original" | "revision";

export interface ScoreVersionRow {
  id: string;
  song_id: string;
  key: string;
  kind: ScoreVersionKind;
  session: SessionMember | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScorePageRow {
  id: string;
  version_id: string;
  page_no: number;
  storage_path: string;
}

export interface VersionWithPages extends ScoreVersionRow {
  pages: { page_no: number; url: string; path: string }[];
}

export interface Song {
  id: string;
  title: string;
  created_at: string;
}

/** 곡의 버전별 정보. name = "" 은 기본 버전. */
export interface SongVariant {
  song_id: string;
  name: string;
  youtube_url: string | null;
  youtube_label: string | null;
}

export interface Service {
  id: string;
  service_date: string;
  title: string | null;
  created_at: string;
}

export interface ServiceItem {
  id: string;
  service_id: string;
  song_id: string;
  key: string;
  position: number;
  memo: string | null;
  song: Song;
}

async function withPages(version: ScoreVersionRow): Promise<VersionWithPages> {
  const map = await withPagesBatch([version]);
  return map.get(version.id)!;
}

/**
 * 여러 버전의 페이지를 한 번의 DB 조회 + 한 번의 signed URL 발급으로 모아서 가져옵니다.
 * 버전마다 따로 왕복하면 버전 수만큼 느려지므로, 곡 상세/콘티 상세처럼 여러 버전을
 * 한 화면에 보여줄 때는 반드시 이 배치 버전을 사용하세요.
 */
async function withPagesBatch(versions: ScoreVersionRow[]): Promise<Map<string, VersionWithPages>> {
  const result = new Map<string, VersionWithPages>();
  if (versions.length === 0) return result;

  const versionIds = versions.map((v) => v.id);
  const { data: pages, error } = await supabaseAdmin
    .from("score_pages")
    .select("id, version_id, page_no, storage_path")
    .in("version_id", versionIds);
  if (error) throw new Error(error.message);

  const pagesByVersion = new Map<string, ScorePageRow[]>();
  for (const p of pages ?? []) {
    const list = pagesByVersion.get(p.version_id) ?? [];
    list.push(p);
    pagesByVersion.set(p.version_id, list);
  }

  const allPaths = (pages ?? []).map((p) => p.storage_path);
  const urlByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(SCORES_BUCKET)
      .createSignedUrls(allPaths, SIGNED_URL_TTL);
    if (signedErr || !signed) {
      throw new Error(`악보 이미지 URL을 만들지 못했습니다: ${signedErr?.message ?? "알 수 없는 오류"}`);
    }
    signed.forEach((s, i) => {
      if (s.signedUrl) urlByPath.set(allPaths[i], s.signedUrl);
    });
  }

  for (const version of versions) {
    const sorted = (pagesByVersion.get(version.id) ?? []).sort((a, b) => a.page_no - b.page_no);
    result.set(version.id, {
      ...version,
      pages: sorted.map((p) => ({ page_no: p.page_no, path: p.storage_path, url: urlByPath.get(p.storage_path) ?? "" })),
    });
  }
  return result;
}

// ---------- 예배(콘티) ----------

export async function listServices(): Promise<(Service & { itemCount: number })[]> {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id, service_date, title, created_at, service_items(count)")
    .order("service_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    service_date: row.service_date,
    title: row.title,
    created_at: row.created_at,
    itemCount: row.service_items?.[0]?.count ?? 0,
  }));
}

export async function getService(id: string): Promise<Service | null> {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id, service_date, title, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listServiceItems(serviceId: string): Promise<ServiceItem[]> {
  const { data, error } = await supabaseAdmin
    .from("service_items")
    .select("id, service_id, song_id, key, position, memo, song:songs(id, title, created_at)")
    .eq("service_id", serviceId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({ ...row, song: row.song }));
}

export async function createService(input: { serviceDate: string; title: string | null }): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("services")
    .insert({ service_date: input.serviceDate, title: input.title })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateService(id: string, input: { serviceDate: string; title: string | null }): Promise<void> {
  const { error } = await supabaseAdmin
    .from("services")
    .update({ service_date: input.serviceDate, title: input.title })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("services").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addServiceItem(input: {
  serviceId: string;
  songId: string;
  key: string;
  memo: string | null;
}): Promise<void> {
  const { data: maxRow, error: maxError } = await supabaseAdmin
    .from("service_items")
    .select("position")
    .eq("service_id", input.serviceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { error } = await supabaseAdmin.from("service_items").insert({
    service_id: input.serviceId,
    song_id: input.songId,
    key: input.key,
    memo: input.memo,
    position: nextPosition,
  });
  if (error) throw new Error(error.message);
}

export async function updateServiceItemMemo(itemId: string, memo: string | null): Promise<void> {
  const { error } = await supabaseAdmin.from("service_items").update({ memo }).eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function removeServiceItem(itemId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("service_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function moveServiceItem(serviceId: string, itemId: string, direction: "up" | "down"): Promise<void> {
  const items = await listServiceItems(serviceId);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  const a = items[idx];
  const b = items[swapIdx];
  // 유니크 제약(service_id, position) 충돌을 피하기 위해 임시 위치를 거쳐 교체합니다.
  const TEMP = -1;
  const table = supabaseAdmin.from("service_items");
  const { error: e1 } = await table.update({ position: TEMP }).eq("id", a.id);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await table.update({ position: a.position }).eq("id", b.id);
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await table.update({ position: b.position }).eq("id", a.id);
  if (e3) throw new Error(e3.message);
}

// ---------- 곡 ----------

export async function listSongs(query?: string): Promise<Song[]> {
  let q = supabaseAdmin.from("songs").select("id, title, created_at").order("title");
  if (query && query.trim()) {
    q = q.ilike("title", `%${query.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSong(id: string): Promise<Song | null> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("id, title, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSong(input: { title: string }): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .insert({ title: input.title })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateSong(id: string, input: { title: string }): Promise<void> {
  const { error } = await supabaseAdmin.from("songs").update({ title: input.title }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSongVariants(songIds: string[]): Promise<SongVariant[]> {
  if (songIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("song_variants")
    .select("song_id, name, youtube_url, youtube_label")
    .in("song_id", songIds)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 곡의 버전 이름을 바꿉니다. 버전은 키 뒤 괄호로 저장되므로 그 곡의 악보 키와 콘티 키를 모두 고쳐 씁니다
 * (예: "E(예람)" → "E(어노인팅)"). 바꿀 이름이 이미 있으면 false (같은 키 악보가 겹칠 수 있어 합치지 않음).
 */
export async function renameSongVariant(songId: string, oldName: string, newName: string): Promise<boolean> {
  const [{ data: versions, error: e1 }, { data: items, error: e2 }, variants] = await Promise.all([
    supabaseAdmin.from("score_versions").select("id, key").eq("song_id", songId),
    supabaseAdmin.from("service_items").select("id, key").eq("song_id", songId),
    listSongVariants([songId]),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const taken = new Set([...(versions ?? []).map((v) => splitKey(v.key).version), ...variants.map((v) => v.name)]);
  if (taken.has(newName)) return false;

  const rename = (rows: { id: string; key: string }[] | null) =>
    (rows ?? [])
      .filter((r) => splitKey(r.key).version === oldName)
      .map((r) => ({ id: r.id, key: keyWithVersion(splitKey(r.key).base, newName) }));

  // ponytail: 행마다 따로 update — 곡 하나의 악보/콘티 수라 몇 건 안 됨.
  for (const r of rename(versions)) {
    const { error } = await supabaseAdmin.from("score_versions").update({ key: r.key }).eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  for (const r of rename(items)) {
    const { error } = await supabaseAdmin.from("service_items").update({ key: r.key }).eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabaseAdmin.from("song_variants").update({ name: newName }).eq("song_id", songId).eq("name", oldName);
  if (error) throw new Error(error.message);
  return true;
}

/** 곡을 지웁니다 (악보·이미지·버전 정보까지). 콘티에 들어가 있으면 지우지 않고 false. */
export async function deleteSong(songId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("service_items")
    .select("id", { count: "exact", head: true })
    .eq("song_id", songId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;

  const { data: versions, error: vErr } = await supabaseAdmin.from("score_versions").select("id").eq("song_id", songId);
  if (vErr) throw new Error(vErr.message);
  for (const v of versions ?? []) await deleteScoreVersion(v.id); // 이미지 파일까지 정리

  const { error: delErr } = await supabaseAdmin.from("songs").delete().eq("id", songId); // song_variants는 cascade
  if (delErr) throw new Error(delErr.message);
  return true;
}

/** 악보 한 벌(원본 또는 수정본)을 지웁니다: DB 행(페이지는 cascade) + Storage 폴더의 이미지 전부(A4·원본). */
export async function deleteScoreVersion(versionId: string): Promise<string | null> {
  const { data: version, error } = await supabaseAdmin
    .from("score_versions")
    .select("song_id")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!version) return null;

  // 폴더는 페이지의 실제 저장 경로에서 구합니다. 곡을 합치면 악보의 곡 ID가 바뀌어도 파일은 예전 곡 폴더에 남아 있기 때문.
  const { data: pages } = await supabaseAdmin.from("score_pages").select("storage_path").eq("version_id", versionId);
  const folders = new Set((pages ?? []).map((pg) => pg.storage_path.slice(0, pg.storage_path.lastIndexOf("/"))));
  folders.add(`${version.song_id}/${versionId}`);
  const paths: string[] = [];
  for (const folder of folders) {
    const { data: files } = await supabaseAdmin.storage.from(SCORES_BUCKET).list(folder);
    for (const f of files ?? []) paths.push(`${folder}/${f.name}`);
  }

  const { error: delErr } = await supabaseAdmin.from("score_versions").delete().eq("id", versionId);
  if (delErr) throw new Error(delErr.message);

  if (paths.length > 0) {
    try {
      await supabaseAdmin.storage.from(SCORES_BUCKET).remove(paths);
    } catch {
      // 정리 실패는 무시 (고아 파일만 남고 화면에는 영향 없음)
    }
  }
  return version.song_id;
}

/**
 * 버전의 유튜브 링크를 저장합니다. 비우면 행을 지웁니다.
 * youtube_label(팀명)은 예전 데이터용입니다 — 이제는 버전 이름이 팀명 역할을 하므로 저장할 때 비웁니다.
 */
export async function saveSongVariant(songId: string, name: string, youtubeUrl: string | null): Promise<void> {
  const table = supabaseAdmin.from("song_variants");
  const { error } = youtubeUrl
    ? await table.upsert({ song_id: songId, name, youtube_url: youtubeUrl, youtube_label: null })
    : await table.delete().eq("song_id", songId).eq("name", name);
  if (error) throw new Error(error.message);
}

export interface SongKeyInfo {
  key: string;
  hasRevision: boolean;
}

export interface SongWithScoreInfo extends Song {
  keys: SongKeyInfo[];
  variants: SongVariant[];
}

/** 곡 목록 + 각 곡이 가진 키들, 키별로 (아무 세션이든) 수정본이 있는지 여부. */
export async function listSongsWithScoreInfo(query?: string): Promise<SongWithScoreInfo[]> {
  const songs = await listSongs(query);
  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const [{ data, error }, variants] = await Promise.all([
    supabaseAdmin.from("score_versions").select("song_id, key, kind").in("song_id", songIds).order("key"),
    listSongVariants(songIds),
  ]);
  if (error) throw new Error(error.message);

  const keysBySong = new Map<string, Map<string, SongKeyInfo>>();
  for (const row of data ?? []) {
    let keyMap = keysBySong.get(row.song_id);
    if (!keyMap) {
      keyMap = new Map();
      keysBySong.set(row.song_id, keyMap);
    }
    const key = normalizeKey(row.key);
    const existing = keyMap.get(key) ?? { key, hasRevision: false };
    if (row.kind === "revision") existing.hasRevision = true;
    keyMap.set(key, existing);
  }

  return songs.map((song) => ({
    ...song,
    keys: Array.from(keysBySong.get(song.id)?.values() ?? []),
    variants: variants.filter((v) => v.song_id === song.id),
  }));
}

export interface SongGalleryItem extends Song {
  thumbnailUrl: string | null;
}

/** 곡 목록 + 각 곡의 대표 악보(원본 우선, 없으면 수정본) 첫 페이지 썸네일. 갤러리 뷰용. */
export async function listSongsForGallery(query?: string): Promise<SongGalleryItem[]> {
  const songs = await listSongs(query);
  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const { data: versions, error: versionsErr } = await supabaseAdmin
    .from("score_versions")
    .select("id, song_id, key, kind")
    .in("song_id", songIds)
    .order("key");
  if (versionsErr) throw new Error(versionsErr.message);

  const versionBySong = new Map<string, { id: string; kind: ScoreVersionKind }>();
  for (const v of versions ?? []) {
    const current = versionBySong.get(v.song_id);
    if (!current || (current.kind === "revision" && v.kind === "original")) versionBySong.set(v.song_id, v);
  }
  const versionIds = Array.from(versionBySong.values()).map((v) => v.id);

  const pathByVersion = new Map<string, string>();
  if (versionIds.length > 0) {
    const { data: pages, error: pagesErr } = await supabaseAdmin
      .from("score_pages")
      .select("version_id, storage_path")
      .in("version_id", versionIds)
      .eq("page_no", 1);
    if (pagesErr) throw new Error(pagesErr.message);
    for (const p of pages ?? []) pathByVersion.set(p.version_id, p.storage_path);
  }

  const urlByPath = new Map<string, string>();
  const paths = Array.from(pathByVersion.values());
  if (paths.length > 0) {
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(SCORES_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (signedErr || !signed) throw new Error(`썸네일 URL을 만들지 못했습니다: ${signedErr?.message ?? "알 수 없는 오류"}`);
    signed.forEach((s, i) => {
      if (s.signedUrl) urlByPath.set(paths[i], s.signedUrl);
    });
  }

  return songs.map((song) => {
    const version = versionBySong.get(song.id);
    const path = version ? pathByVersion.get(version.id) : undefined;
    return { ...song, thumbnailUrl: path ? urlByPath.get(path) ?? null : null };
  });
}

/** 이 곡에 악보(원본이든 수정본이든)가 하나라도 있는 키 목록. */
export async function listKeysForSong(songId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("score_versions")
    .select("key")
    .eq("song_id", songId)
    .order("key");
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => normalizeKey(r.key))));
}

export interface ScoreSummary {
  key: string;
  original: VersionWithPages | null;
  revisions: Partial<Record<SessionMember, VersionWithPages>>;
}

/** 곡 + 키의 원본과, 세션별 "최신" 수정본을 모아서 돌려줍니다. */
export async function getScoreSummary(songId: string, key: string): Promise<ScoreSummary> {
  const { data, error } = await supabaseAdmin
    .from("score_versions")
    .select("id, song_id, key, kind, session, memo, created_by, created_at")
    .eq("song_id", songId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // 키는 직접 입력하는 값이라 "d"/"D"/"D " 처럼 표기가 달라질 수 있어, DB 정확 일치 대신 정규화해서 비교합니다.
  const wantedKey = normalizeKey(key);
  const rows = ((data ?? []) as ScoreVersionRow[]).filter((r) => normalizeKey(r.key) === wantedKey);
  const originalRow = rows.find((r) => r.kind === "original") ?? null;
  const latestRevisionRows = new Map<SessionMember, ScoreVersionRow>();
  for (const r of rows) {
    if (r.kind !== "revision" || !r.session) continue;
    if (latestRevisionRows.has(r.session)) continue; // 이미 더 최신 버전을 찾았으므로 건너뜀 (내림차순 정렬)
    latestRevisionRows.set(r.session, r);
  }

  // 버전마다 따로 왕복하면 느려지므로 원본 + 모든 세션 수정본을 한 번에 배치 조회합니다.
  const relevantVersions = originalRow ? [originalRow, ...latestRevisionRows.values()] : [...latestRevisionRows.values()];
  const versionsById = await withPagesBatch(relevantVersions);

  // 업로드가 중간에 실패해 페이지가 하나도 없는 버전은 "악보 있음"으로 취급하지 않습니다.
  const usable = (id: string) => {
    const v = versionsById.get(id);
    return v && v.pages.length > 0 ? v : null;
  };

  const revisions: Partial<Record<SessionMember, VersionWithPages>> = {};
  for (const [session, row] of latestRevisionRows) {
    const v = usable(row.id);
    if (v) revisions[session] = v;
  }

  return {
    key: wantedKey,
    original: originalRow ? usable(originalRow.id) : null,
    revisions,
  };
}

/** 예배 콘티에서 "지금 로그인한 세션에게 보여줄" 악보를 고릅니다:
 *  내 세션의 최신 수정본 → 원본 → (원본도 없으면) 메인건반 수정본 순으로 반환합니다.
 *  원본 없이 메인건반 수정본만 있는 곡이 있어서, 원본이 없을 때는 비어 보이는 대신
 *  메인건반 수정본을 보여줍니다. */
export async function getEffectiveVersion(
  songId: string,
  key: string,
  member: SessionMember
): Promise<VersionWithPages | null> {
  const summary = await getScoreSummary(songId, key);
  return summary.revisions[member] ?? summary.original ?? summary.revisions.keys ?? null;
}

export async function getVersionById(versionId: string): Promise<VersionWithPages | null> {
  const { data, error } = await supabaseAdmin
    .from("score_versions")
    .select("id, song_id, key, kind, session, memo, created_by, created_at")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return withPages(data as ScoreVersionRow);
}
