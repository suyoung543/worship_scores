import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SCORES_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectiveVersion, getScoreSummary, listServiceItems } from "@/lib/db";
import type { SessionMember } from "@/lib/auth";

export type ServicePdfMode = "original" | SessionMember;

// 업로드 시 모든 페이지를 A4 비율(210×297mm)의 JPEG로 맞춰 저장합니다.
// PDF로 합칠 때는 원본 크기 그대로 채우면 화면/인쇄에서 너무 꽉 차 보이므로
// IMAGE_SCALE만큼 축소해 페이지 가운데에 여백을 두고 배치합니다.
// 단, 원래부터 A4였던 페이지(파일명 "-a4.jpg")는 이미 출력본일 수 있어 100%로 넣습니다.
// (출력본을 고쳐 다시 올릴 때마다 88%씩 작아지는 문제 방지)
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

const NOTE_FONT_SIZE = 18;
const NOTE_MARGIN_PT = 40; // 왼쪽·위쪽 여백
const NOTE_MAX_LINES = 2;

interface PdfPageInput {
  path: string;
  /** 페이지 위쪽 여백에 적을 글 (콘티 PDF의 송폼) */
  note?: string;
}

/** 폭에 맞게 글자 단위로 줄바꿈하고, NOTE_MAX_LINES를 넘으면 마지막 줄을 "…"로 자릅니다. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const ch of para) {
      if (line && font.widthOfTextAtSize(line + ch, size) > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  if (lines.length <= NOTE_MAX_LINES) return lines;
  const kept = lines.slice(0, NOTE_MAX_LINES);
  let last = kept[NOTE_MAX_LINES - 1];
  while (last && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
  kept[NOTE_MAX_LINES - 1] = last + "…";
  return kept;
}

async function buildPdf(inputs: PdfPageInput[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  let font: PDFFont | null = null;
  if (inputs.some((p) => p.note)) {
    pdfDoc.registerFontkit(fontkit);
    // 나눔고딕 Bold를 영문 + 자주 쓰는 한글 2,350자(KS X 1001)만 남겨 미리 줄여둔 폰트입니다 (~290KB).
    // pdf-lib의 subset 옵션은 글자가 빠지는 버그가 있고 iPhone/맥 PDF 뷰어에서 깨져서 쓰지 않습니다.
    const fontBytes = await readFile(path.join(process.cwd(), "fonts", "NanumGothic-Bold-KR.ttf"));
    font = await pdfDoc.embedFont(fontBytes);
  }

  for (const input of inputs) {
    const bytes = await downloadImageBytes(input.path);
    const image = await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    if (input.path.endsWith("-a4.jpg")) {
      page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH_PT, height: A4_HEIGHT_PT });
    } else {
      page.drawImage(image, { x: IMAGE_X_PT, y: IMAGE_Y_PT, width: IMAGE_WIDTH_PT, height: IMAGE_HEIGHT_PT });
    }

    if (input.note && font) {
      const maxWidth = A4_WIDTH_PT - NOTE_MARGIN_PT * 2;
      const lines = wrapText(input.note, font, NOTE_FONT_SIZE, maxWidth);
      const lineHeight = NOTE_FONT_SIZE * 1.35;
      const top = A4_HEIGHT_PT - NOTE_MARGIN_PT + 12;
      // 100%로 넣은 페이지는 여백이 없을 수 있어 흰 바탕을 깔아 글씨가 악보 위에서도 읽히게 합니다.
      const textWidth = Math.max(...lines.map((l) => font!.widthOfTextAtSize(l, NOTE_FONT_SIZE)));
      page.drawRectangle({
        x: NOTE_MARGIN_PT - 4,
        y: top - lineHeight * lines.length - 2,
        width: textWidth + 8,
        height: lineHeight * lines.length + 4,
        color: rgb(1, 1, 1),
      });
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: NOTE_MARGIN_PT,
          y: top - lineHeight * (i + 1) + 3,
          size: NOTE_FONT_SIZE,
          font: font!,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    }
  }
  return pdfDoc.save();
}

/** 단일 악보 버전(원본 또는 수정본)을 PDF 한 편으로 합칩니다. (송폼은 콘티 PDF에만 들어갑니다) */
export async function buildVersionPdf(paths: string[]): Promise<Uint8Array> {
  if (paths.length === 0) throw new Error("페이지가 없습니다.");
  return buildPdf(paths.map((path) => ({ path })));
}

/**
 * 예배 콘티 전체를 이어 붙인 PDF.
 * mode가 세션이면 그 세션의 수정본 우선(없으면 원본), "original"이면 항상 원본만 사용합니다.
 */
export async function buildServicePdf(serviceId: string, mode: ServicePdfMode): Promise<Uint8Array> {
  const items = await listServiceItems(serviceId);
  const inputs: PdfPageInput[] = [];
  for (const item of items) {
    const version =
      mode === "original"
        ? (await getScoreSummary(item.song_id, item.key)).original
        : await getEffectiveVersion(item.song_id, item.key, mode);
    if (!version) continue;
    version.pages.forEach((page, i) => {
      // 송폼은 곡의 첫 페이지 위쪽에만 적습니다.
      inputs.push({ path: page.path, note: i === 0 && item.memo ? `송폼: ${item.memo}` : undefined });
    });
  }
  if (inputs.length === 0) {
    throw new Error("아직 업로드된 악보가 없습니다.");
  }
  return buildPdf(inputs);
}
