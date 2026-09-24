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
  updateService,
  updateSong,
} from "@/lib/db";
import { normalizeKey } from "@/lib/format";
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

export async function updateServiceAction(formData: FormData): Promise<void> {
  await requireMember();
  const id = String(formData.get("serviceId") ?? "");
  const serviceDate = String(formData.get("serviceDate") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!serviceDate) throw new Error("날짜를 입력해주세요.");
  await updateService(id, { serviceDate, title: title || null });
  revalidatePath(`/services/${id}`);
  revalidatePath("/services");
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
  const key = normalizeKey(String(formData.get("key") ?? ""));
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
  const key = normalizeKey(String(formData.get("key") ?? ""));
  const kind = String(formData.get("kind") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();
  const pages = formData
    .getAll("pages")
    .filter((p): p is File => typeof p === "object" && p !== null && "arrayBuffer" in p && (p as File).size > 0);

  if (!songId || !key) throw new Error("곡과 키 정보가 없습니다.");
  if (pages.length === 0) throw new Error("업로드할 페이지 이미지가 없습니다.");
  if (kind !== "original" && kind !== "revision") throw new Error("잘못된 요청입니다.");

  // 원본은 (곡,키)당 하나, 수정본은 (곡,키,세션)당 하나만 유지합니다.
  // 기존 레코드가 있으면 그걸 재사용해서 대체하고, DB/스토리지에 예전 버전이 쌓이지 않게 합니다.
  // 예전에 "d" 처럼 표기가 다르게 저장된 키도 같은 키로 보도록 정규화해서 비교합니다.
  const session = kind === "original" ? null : member;
  const { data: candidates, error: findErr } = await supabaseAdmin
    .from("score_versions")
    .select("id, key, session")
    .eq("song_id", songId)
    .eq("kind", kind);
  if (findErr) throw new Error(findErr.message);
  const existing = (candidates ?? []).find((v) => normalizeKey(v.key) === key && (v.session ?? null) === session);

  let versionId: string;
  let created = false;
  if (existing) {
    versionId = existing.id;
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("score_versions")
      .insert({ song_id: songId, key, kind, session, memo: memo || null, created_by: SESSION_LABELS[member] })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);
    versionId = inserted.id;
    created = true;
  }

  // 새 이미지는 예전 파일과 겹치지 않는 경로로 먼저 올립니다.
  // 업로드가 실패해도 기존 악보는 그대로 남고, 성공한 뒤에만 교체됩니다.
  const stamp = Date.now().toString(36);
  const newPaths = pages.map((_, i) => `${songId}/${versionId}/${stamp}-${i + 1}.jpg`);

  try {
    // 페이지별로 순서대로 업로드하면 페이지 수만큼 왕복이 누적되어 느려지므로 병렬로 처리합니다.
    await Promise.all(
      pages.map(async (page, i) => {
        const bytes = new Uint8Array(await page.arrayBuffer());
        const { error: uploadErr } = await supabaseAdmin.storage
          .from(SCORES_BUCKET)
          .upload(newPaths[i], bytes, { contentType: "image/jpeg", upsert: true });
        if (uploadErr) throw new Error(`이미지 업로드 실패: ${uploadErr.message}`);
      })
    );

    let oldPaths: string[] = [];
    if (existing) {
      const { data: oldPages, error: pagesErr } = await supabaseAdmin
        .from("score_pages")
        .select("storage_path")
        .eq("version_id", versionId);
      if (pagesErr) throw new Error(pagesErr.message);
      oldPaths = (oldPages ?? []).map((p) => p.storage_path);

      const { error: delPagesErr } = await supabaseAdmin.from("score_pages").delete().eq("version_id", versionId);
      if (delPagesErr) throw new Error(delPagesErr.message);
    }

    const { error: pagesInsertErr } = await supabaseAdmin
      .from("score_pages")
      .insert(newPaths.map((storage_path, i) => ({ version_id: versionId, page_no: i + 1, storage_path })));
    if (pagesInsertErr) throw new Error(pagesInsertErr.message);

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from("score_versions")
        .update({ key, memo: memo || null, created_by: SESSION_LABELS[member], created_at: new Date().toISOString() })
        .eq("id", versionId);
      if (updateErr) throw new Error(updateErr.message);
    }

    if (oldPaths.length > 0) {
      try {
        await supabaseAdmin.storage.from(SCORES_BUCKET).remove(oldPaths);
      } catch {
        // 정리 실패는 무시합니다 (고아 파일이 남을 뿐 악보 표시에는 영향 없음).
      }
    }
  } catch (err) {
    // 페이지가 하나도 없는 빈 버전이 남으면 "악보 없음"으로 보이므로, 방금 만든 버전은 지웁니다.
    if (created) await supabaseAdmin.from("score_versions").delete().eq("id", versionId);
    try {
      await supabaseAdmin.storage.from(SCORES_BUCKET).remove(newPaths);
    } catch {
      // 무시
    }
    throw err;
  }

  revalidatePath(`/songs/${songId}`);
  revalidatePath("/songs");
  revalidatePath("/songs/gallery");
  revalidatePath("/services");
}
