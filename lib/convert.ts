// 브라우저에서만 동작하는 변환 유틸입니다. 업로드하는 PDF나 이미지 파일을
// 전부 A4 세로 비율(210×297mm)의 흰 배경 JPEG 페이지로 통일해서, 이후에는
// 화면 보기 / 다운로드 / 콘티 PDF 합치기가 모두 같은 형태의 이미지만 다루면
// 되도록 만듭니다. 반드시 클라이언트 컴포넌트에서만 import 하세요.

const A4_WIDTH_PX = 1240; // 약 150dpi 기준
const A4_HEIGHT_PX = 1754;
const JPEG_QUALITY = 0.85;
const PDF_RENDER_SCALE = 150 / 72; // pdf.js viewport(scale=1)는 72dpi 기준 좌표계입니다.

import { uploadScoreVersionAction } from "@/lib/actions";

/** a4: 화면 보기·PDF용 A4 페이지, original: "이미지로 저장"용 원본 크기 이미지,
 *  isA4: 원래부터 A4 비율이었는지 (이미 여백이 있는 출력본일 수 있어 콘티 PDF에서 축소하지 않음) */
export interface ConvertedPage {
  a4: Blob;
  original: Blob;
  isA4: boolean;
}

// ponytail: 비율만 보고 판단하므로 A4 비율의 사진도 100%로 들어갑니다.
function isA4Ratio(width: number, height: number): boolean {
  return Math.abs(width / height - A4_WIDTH_PX / A4_HEIGHT_PX) < 0.02;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function drawIntoA4Canvas(source: CanvasImageSource, srcWidth: number, srcHeight: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = A4_WIDTH_PX;
  canvas.height = A4_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_WIDTH_PX, A4_HEIGHT_PX);

  const scale = Math.min(A4_WIDTH_PX / srcWidth, A4_HEIGHT_PX / srcHeight);
  const drawWidth = srcWidth * scale;
  const drawHeight = srcHeight * scale;
  const dx = (A4_WIDTH_PX - drawWidth) / 2;
  const dy = (A4_HEIGHT_PX - drawHeight) / 2;
  ctx.drawImage(source, 0, 0, srcWidth, srcHeight, dx, dy, drawWidth, drawHeight);

  return canvasToJpeg(canvas);
}

async function imageFileToPage(file: File): Promise<ConvertedPage> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      a4: await drawIntoA4Canvas(bitmap, bitmap.width, bitmap.height),
      original: file,
      isA4: isA4Ratio(bitmap.width, bitmap.height),
    };
  } finally {
    bitmap.close();
  }
}

async function pdfFileToPages(file: File, onPage?: () => void): Promise<ConvertedPage[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const blobs: ConvertedPage[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = Math.ceil(viewport.width);
    renderCanvas.height = Math.ceil(viewport.height);
    const ctx = renderCanvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");

    await page.render({ canvas: renderCanvas, canvasContext: ctx, viewport }).promise;
    const a4 = await drawIntoA4Canvas(renderCanvas, renderCanvas.width, renderCanvas.height);
    blobs.push({ a4, original: await canvasToJpeg(renderCanvas), isA4: isA4Ratio(renderCanvas.width, renderCanvas.height) });
    onPage?.();
  }

  return blobs;
}

/**
 * 선택한 파일들(PDF와 이미지가 섞여 있어도 됨)을 순서대로 처리해
 * A4 세로 비율 JPEG 페이지 Blob 배열로 돌려줍니다. PDF는 페이지 수만큼
 * 여러 장으로 풀리고, 이미지 파일은 한 장으로 취급됩니다.
 */
export async function filesToA4Pages(files: File[], onPage?: (done: number) => void): Promise<ConvertedPage[]> {
  const pages: ConvertedPage[] = [];
  let done = 0;
  const notify = () => {
    done += 1;
    onPage?.(done);
  };

  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfPages = await pdfFileToPages(file, notify);
      pages.push(...pdfPages);
    } else if (file.type.startsWith("image/")) {
      pages.push(await imageFileToPage(file));
      notify();
    } else {
      throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`);
    }
  }

  return pages;
}

/**
 * A4 페이지는 서버 액션으로 올리고, 원본 크기 이미지는 서버가 발급한 서명 URL로 브라우저에서
 * Storage에 바로 올립니다 (Vercel 요청 본문 4.5MB 제한 때문에 큰 원본 사진은 서버를 거칠 수 없음).
 * 원본 업로드가 실패해도 악보는 저장된 상태이고, "이미지로 저장"은 A4 이미지로 대신 받아집니다.
 */
export async function uploadScorePages(formData: FormData, pages: ConvertedPage[]): Promise<void> {
  pages.forEach((p, i) => {
    formData.append("pages", p.a4, `page-${i + 1}.jpg`);
    formData.append("originalTypes", p.original.type || "image/jpeg");
    formData.append("a4Flags", p.isA4 ? "1" : "0");
  });

  const { originalUploadUrls } = await uploadScoreVersionAction(formData);
  await Promise.all(
    originalUploadUrls.map((url, i) =>
      fetch(url, {
        method: "PUT",
        body: pages[i].original,
        headers: { "content-type": pages[i].original.type || "image/jpeg", "x-upsert": "true" },
      }).catch(() => undefined)
    )
  );
}
