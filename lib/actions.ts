"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  createSessionCookieValue,
  getSessionMember,
  isSessionMember,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  SESSION_LABELS,
  type SessionMember,
} from "@/lib/auth";
import {
  addServiceItem,
  createService,
  createSong,
  deleteService,
  moveServiceItem,
  removeServiceItem,
  updateSong,
} from "@/lib/db";
import { SCORES_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";

async function requireMember(): Promise<SessionMember> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  return member;
}

// ---------- 로그인 ----------

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const member = String(formData.get("member") ?? "");
  const next = String(formData.get("next") ?? "/services");

  if (!isSessionMember(member) || password !== process.env.APP_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const value = await createSessionCookieValue(member);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  redirect(next || "/services");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

// ---------- 예배(콘티) ----------

export async function createServiceAction(formData: FormData): Promise<void> {
  await requireMember();
  const serviceDate = String(formData.get("serviceDate") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!serviceDate) throw new Error("날짜를 입력해주세요.");
  const id = await createService({ serviceDate, title: title || null });
  revalidatePath("/services");
  redirect(`/services/${id}`);
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  await requireMember();
  const id = String(formData.get("serviceId") ?? "");
  await deleteService(id);
  revalidatePath("/services");
  redirect("/services");
}

export async function addServiceItemAction(formData: FormData): Promise<{ songId: string }> {
  await requireMember();
  const serviceId = String(formData.get("serviceId") ?? "");
  let songId = String(formData.get("songId") ?? "");
  const newSongTitle = String(formData.get("newSongTitle") ?? "").trim();
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim();
  const youtubeLabel = String(formData.get("youtubeLabel") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();

  if (!key) throw new Error("키를 입력해주세요.");

  if (!songId && newSongTitle) {
    songId = await createSong({ title: newSongTitle, youtubeUrl: youtubeUrl || null, youtubeLabel: youtubeLabel || null });
  }
  if (!songId) throw new Error("곡을 선택하거나 새 곡 제목을 입력해주세요.");

  await addServiceItem({ serviceId, songId, key, memo: memo || null });
  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/songs");
  return { songId };
}

export async function removeServiceItemAction(formData: FormData): Promise<void> {
  await requireMember();
  const serviceId = String(formData.get("serviceId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  await removeServiceItem(itemId);
  revalidatePath(`/services/${serviceId}`);
}

export async function moveServiceItemAction(formData: FormData): Promise<void> {
  await requireMember();
  const serviceId = String(formData.get("serviceId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const direction = String(formData.get("direction") ?? "") as "up" | "down";
  await moveServiceItem(serviceId, itemId, direction);
  revalidatePath(`/services/${serviceId}`);
}

// ---------- 곡 ----------

export async function createSongAction(formData: FormData): Promise<void> {
  await requireMember();
  const title = String(formData.get("title") ?? "").trim();
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim();
  const youtubeLabel = String(formData.get("youtubeLabel") ?? "").trim();
  if (!title) throw new Error("곡 제목을 입력해주세요.");
  const id = await createSong({ title, youtubeUrl: youtubeUrl || null, youtubeLabel: youtubeLabel || null });
  revalidatePath("/songs");
  revalidatePath("/songs/gallery");
  redirect(`/songs/${id}`);
}

export async function updateSongAction(formData: FormData): Promise<void> {
  await requireMember();
  const id = String(formData.get("songId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim();
  const youtubeLabel = String(formData.get("youtubeLabel") ?? "").trim();
  if (!title) throw new Error("곡 제목을 입력해주세요.");
  await updateSong(id, { title, youtubeUrl: youtubeUrl || null, youtubeLabel: youtubeLabel || null });
  revalidatePath(`/songs/${id}`);
  revalidatePath("/songs");
  revalidatePath("/songs/gallery");
  revalidatePath("/services");
}

// ---------- 악보 업로드 ----------
// pages 는 클라이언트(lib/convert.ts)에서 이미 A4 세로 비율 JPEG로 변환된 페이지들입니다.

export async function uploadScoreVersionAction(formData: FormData): Promise<void> {
  const member = await requireMember();

  const songId = String(formData.get("songId") ?? "");
  const key = String(formData.get("key") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();
  const pages = formData
    .getAll("pages")
    .filter((p): p is File => typeof p === "object" && p !== null && "arrayBuffer" in p && (p as File).size > 0);

  if (!songId || !key) throw new Error("곡과 키 정보가 없습니다.");
  if (pages.length === 0) throw new Error("업로드할 페이지 이미지가 없습니다.");
  if (kind !== "original" && kind !== "revision") throw new Error("잘못된 요청입니다.");

  let versionId: string;
  let oldPaths: string[] = [];

  if (kind === "original") {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("score_versions")
      .select("id")
      .eq("song_id", songId)
      .eq("key", key)
      .eq("kind", "original")
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (existing) {
      versionId = existing.id;

      const { data: oldPages, error: pagesErr } = await supabaseAdmin
        .from("score_pages")
        .select("storage_path")
        .eq("version_id", versionId);
      if (pagesErr) throw new Error(pagesErr.message);
      oldPaths = (oldPages ?? []).map((p) => p.storage_path);

      const { error: delPagesErr } = await supabaseAdmin.from("score_pages").delete().eq("version_id", versionId);
      if (delPagesErr) throw new Error(delPagesErr.message);

      const { error: updateErr } = await supabaseAdmin
        .from("score_versions")
        .update({
          memo: memo || null,
          created_by: SESSION_LABELS[member],
          created_at: new Date().toISOString(),
        })
        .eq("id", versionId);
      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("score_versions")
        .insert({
          song_id: songId,
          key,
          kind: "original",
          session: null,
          memo: memo || null,
          created_by: SESSION_LABELS[member],
        })
        .select("id")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      versionId = inserted.id;
    }
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("score_versions")
      .insert({
        song_id: songId,
        key,
        kind: "revision",
        session: member,
        memo: memo || null,
        created_by: SESSION_LABELS[member],
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);
    versionId = inserted.id;
  }

  const newPaths = pages.map((_, i) => `${songId}/${versionId}/${i + 1}.jpg`);

  for (let i = 0; i < pages.length; i++) {
    const bytes = new Uint8Array(await pages[i].arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(SCORES_BUCKET)
      .upload(newPaths[i], bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw new Error(`이미지 업로드 실패: ${uploadErr.message}`);

    const { error: pageInsertErr } = await supabaseAdmin
      .from("score_pages")
      .insert({ version_id: versionId, page_no: i + 1, storage_path: newPaths[i] });
    if (pageInsertErr) throw new Error(pageInsertErr.message);
  }

  // 원본을 재업로드해서 페이지 수가 줄어든 경우에만 남는 예전 이미지가 있어 정리합니다.
  const orphaned = oldPaths.filter((p) => !newPaths.includes(p));
  if (orphaned.length > 0) {
    try {
      await supabaseAdmin.storage.from(SCORES_BUCKET).remove(orphaned);
    } catch {
      // 정리 실패는 무시합니다 (다음 재업로드 때 다시 정리 시도됨).
    }
  }

  revalidatePath(`/songs/${songId}`);
  revalidatePath("/services");
}
