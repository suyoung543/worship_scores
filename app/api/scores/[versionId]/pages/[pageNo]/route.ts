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
  const filename = `${song?.title ?? "악보"}_${version.key}_${kindLabel}_${page.page_no}.jpg`;

  const { data, error } = await supabaseAdmin.storage.from(SCORES_BUCKET).createSignedUrl(page.path, 60, { download: filename });
  if (error || !data) return new NextResponse("이미지를 불러오지 못했습니다.", { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
