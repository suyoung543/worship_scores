import { NextRequest, NextResponse } from "next/server";
import { getSessionMember, SESSION_LABELS } from "@/lib/auth";
import { getSong, getVersionById } from "@/lib/db";
import { buildVersionPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const member = await getSessionMember();
  if (!member) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const { versionId } = await params;
  const version = await getVersionById(versionId);
  if (!version) return new NextResponse("악보를 찾을 수 없습니다.", { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await buildVersionPdf(version.pages.map((p) => p.path));
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF를 만들지 못했습니다.";
    return new NextResponse(message, { status: 400 });
  }

  const song = await getSong(version.song_id);
  const kindLabel = version.kind === "original" ? "원본" : SESSION_LABELS[version.session!];
  const filename = `${song?.title ?? "악보"}_${version.key}_${kindLabel}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="score.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
