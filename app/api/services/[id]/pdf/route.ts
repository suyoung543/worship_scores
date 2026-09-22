import { NextRequest, NextResponse } from "next/server";
import { getSessionMember, isSessionMember, SESSION_LABELS } from "@/lib/auth";
import { getService } from "@/lib/db";
import { buildServicePdf, type ServicePdfMode } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getSessionMember();
  if (!member) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const { id } = await params;
  const service = await getService(id);
  if (!service) return new NextResponse("예배를 찾을 수 없습니다.", { status: 404 });

  const versionParam = req.nextUrl.searchParams.get("version");
  let mode: ServicePdfMode;
  let label: string;
  if (versionParam === "original") {
    mode = "original";
    label = "원본";
  } else if (isSessionMember(versionParam)) {
    mode = versionParam;
    label = `${SESSION_LABELS[versionParam]} 수정본`;
  } else {
    mode = member;
    label = SESSION_LABELS[member];
  }

  let bytes: Uint8Array;
  try {
    bytes = await buildServicePdf(id, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF를 만들지 못했습니다.";
    return new NextResponse(message, { status: 400 });
  }

  const filename = `콘티_${service.service_date}_${label}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="service.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
