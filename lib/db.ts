import "server-only";
import { supabaseAdmin, SCORES_BUCKET } from "@/lib/supabaseAdmin";
import type { SessionMember } from "@/lib/auth";

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
  youtube_url: string | null;
  youtube_label: string | null;
  created_at: string;
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
    .select("id, service_id, song_id, key, position, memo, song:songs(id, title, youtube_url, youtube_label, created_at)")
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
  let q = supabaseAdmin.from("songs").select("id, title, youtube_url, youtube_label, created_at").order("title");
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
    .select("id, title, youtube_url, youtube_label, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSong(input: {
  title: string;
  youtubeUrl: string | null;
  youtubeLabel?: string | null;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .insert({ title: input.title, youtube_url: input.youtubeUrl, youtube_label: input.youtubeLabel ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateSong(
  id: string,
  input: { title: string; youtubeUrl: string | null; youtubeLabel: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("songs")
    .update({ title: input.title, youtube_url: input.youtubeUrl, youtube_label: input.youtubeLabel })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface SongKeyInfo {
  key: string;
  hasRevision: boolean;
}

export interface SongWithScoreInfo extends Song {
  keys: SongKeyInfo[];
}

/** 곡 목록 + 각 곡이 가진 키들, 키별로 (아무 세션이든) 수정본이 있는지 여부. */
export async function listSongsWithScoreInfo(query?: string): Promise<SongWithScoreInfo[]> {
  const songs = await listSongs(query);
  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const { data, error } = await supabaseAdmin
    .from("score_versions")
    .select("song_id, key, kind")
    .in("song_id", songIds)
    .order("key");
  if (error) throw new Error(error.message);

  const keysBySong = new Map<string, Map<string, SongKeyInfo>>();
  for (const row of data ?? []) {
    let keyMap = keysBySong.get(row.song_id);
    if (!keyMap) {
      keyMap = new Map();
      keysBySong.set(row.song_id, keyMap);
    }
    const existing = keyMap.get(row.key) ?? { key: row.key, hasRevision: false };
    if (row.kind === "revision") existing.hasRevision = true;
    keyMap.set(row.key, existing);
  }

  return songs.map((song) => ({
    ...song,
    keys: Array.from(keysBySong.get(song.id)?.values() ?? []),
  }));
}

export interface SongGalleryItem extends Song {
  thumbnailUrl: string | null;
}

/** 곡 목록 + 각 곡의 대표 원본 악보(가장 앞 키) 첫 페이지 썸네일. 갤러리 뷰용. */
export async function listSongsForGallery(query?: string): Promise<SongGalleryItem[]> {
  const songs = await listSongs(query);
  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const { data: versions, error: versionsErr } = await supabaseAdmin
    .from("score_versions")
    .select("id, song_id, key")
    .in("song_id", songIds)
    .eq("kind", "original")
    .order("key");
  if (versionsErr) throw new Error(versionsErr.message);

  const versionBySong = new Map<string, { id: string }>();
  for (const v of versions ?? []) {
    if (!versionBySong.has(v.song_id)) versionBySong.set(v.song_id, v);
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

/** 이 곡에 악보가 하나라도 있는 키 목록 (원본 기준). */
export async function listKeysForSong(songId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("score_versions")
    .select("key")
    .eq("song_id", songId)
    .eq("kind", "original")
    .order("key");
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.key)));
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
    .eq("key", key)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ScoreVersionRow[];
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

  const revisions: Partial<Record<SessionMember, VersionWithPages>> = {};
  for (const [session, row] of latestRevisionRows) {
    revisions[session] = versionsById.get(row.id);
  }

  return {
    key,
    original: originalRow ? versionsById.get(originalRow.id) ?? null : null,
    revisions,
  };
}

/** 예배 콘티에서 "지금 로그인한 세션에게 보여줄" 악보를 고릅니다:
 *  내 세션의 최신 수정본이 있으면 그것을, 없으면 원본을 반환합니다. */
export async function getEffectiveVersion(
  songId: string,
  key: string,
  member: SessionMember
): Promise<VersionWithPages | null> {
  const summary = await getScoreSummary(songId, key);
  return summary.revisions[member] ?? summary.original ?? null;
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
