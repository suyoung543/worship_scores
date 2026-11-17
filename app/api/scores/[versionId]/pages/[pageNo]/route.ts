import { NextRequest, NextResponse } from "next/server";
import { getSessionMember, SESSION_LABELS } from "@/lib/auth";
import { getSong, getVersionById } from "@/lib/db";
import { SCORES_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string; pageNo: string }> }) {
  const member = await getSessionMember();
  if (!member) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const { versionId, pageNo } = await params;
  const version = await getVersionById(versionId);
  const page = version?.pages.find((p) => p.page_no === Number(pageNo));
  if (!version || !page) return new NextResponse("악보를 찾을 수 없습니다.", { status: 404 });

  const song = await getSong(version.song_id);
  const kindLabel = version.kind === "original" ? "원본" : SESSION_LABELS[version.session!];

  // 업로드 때 함께 올린 원본 크기 이미지(…-orig.확장자)가 있으면 그걸, 없으면(예전 업로드) A4 이미지를 내려줍니다.
  const folder = page.path.slice(0, page.path.lastIndexOf("/"));
  const base = page.path.slice(folder.length + 1).replace(/\.jpg$/, "");
  const { data: files } = await supabaseAdmin.storage.from(SCORES_BUCKET).list(folder, { search: `${base}-orig.` });
  const orig = files?.find((f) => f.name.startsWith(`${base}-orig.`));
  const path = orig ? `${folder}/${orig.name}` : page.path;
  const ext = path.slice(path.lastIndexOf(".") + 1);

  const filename = `${song?.title ?? "악보"}_${version.key}_${kindLabel}_${page.page_no}.${ext}`;

  const { data, error } = await supabaseAdmin.storage.from(SCORES_BUCKET).createSignedUrl(path, 60, { download: filename });
  if (error || !data) return new NextResponse("이미지를 불러오지 못했습니다.", { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
