import "server-only";
import { PDFDocument } from "pdf-lib";
import { SCORES_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectiveVersion, getScoreSummary, listServiceItems } from "@/lib/db";
import type { SessionMember } from "@/lib/auth";

export type ServicePdfMode = "original" | SessionMember;

// 업로드 시 모든 페이지를 A4 비율(210×297mm)의 JPEG로 맞춰 저장합니다.
// PDF로 합칠 때는 원본 크기 그대로 채우면 화면/인쇄에서 너무 꽉 차 보이므로
// IMAGE_SCALE만큼 축소해 페이지 가운데에 여백을 두고 배치합니다.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const IMAGE_SCALE = 0.88;
const IMAGE_WIDTH_PT = A4_WIDTH_PT * IMAGE_SCALE;
const IMAGE_HEIGHT_PT = A4_HEIGHT_PT * IMAGE_SCALE;
const IMAGE_X_PT = (A4_WIDTH_PT - IMAGE_WIDTH_PT) / 2;
const IMAGE_Y_PT = (A4_HEIGHT_PT - IMAGE_HEIGHT_PT) / 2;

async function downloadImageBytes(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from(SCORES_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`악보 이미지를 불러오지 못했습니다 (${path}): ${error?.message ?? "알 수 없는 오류"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function buildPdfFromStoragePaths(paths: string[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (const path of paths) {
    const bytes = await downloadImageBytes(path);
    const image = await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawImage(image, { x: IMAGE_X_PT, y: IMAGE_Y_PT, width: IMAGE_WIDTH_PT, height: IMAGE_HEIGHT_PT });
  }
  return pdfDoc.save();
}

/** 단일 악보 버전(원본 또는 수정본)을 PDF 한 편으로 합칩니다. */
export async function buildVersionPdf(paths: string[]): Promise<Uint8Array> {
  if (paths.length === 0) throw new Error("페이지가 없습니다.");
  return buildPdfFromStoragePaths(paths);
}

/**
 * 예배 콘티 전체를 이어 붙인 PDF.
 * mode가 세션이면 그 세션의 수정본 우선(없으면 원본), "original"이면 항상 원본만 사용합니다.
 */
export async function buildServicePdf(serviceId: string, mode: ServicePdfMode): Promise<Uint8Array> {
  const items = await listServiceItems(serviceId);
  const allPaths: string[] = [];
  for (const item of items) {
    const version =
      mode === "original"
        ? (await getScoreSummary(item.song_id, item.key)).original
        : await getEffectiveVersion(item.song_id, item.key, mode);
    if (!version) continue;
    for (const page of version.pages) {
      allPaths.push(page.path);
    }
  }
  if (allPaths.length === 0) {
    throw new Error("아직 업로드된 악보가 없습니다.");
  }
  return buildPdfFromStoragePaths(allPaths);
}
