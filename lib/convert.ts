// 브라우저에서만 동작하는 변환 유틸입니다. 업로드하는 PDF나 이미지 파일을
// 전부 A4 세로 비율(210×297mm)의 흰 배경 JPEG 페이지로 통일해서, 이후에는
// 화면 보기 / 다운로드 / 콘티 PDF 합치기가 모두 같은 형태의 이미지만 다루면
// 되도록 만듭니다. 반드시 클라이언트 컴포넌트에서만 import 하세요.

const A4_WIDTH_PX = 1240; // 약 150dpi 기준
const A4_HEIGHT_PX = 1754;
const JPEG_QUALITY = 0.85;
const PDF_RENDER_SCALE = 150 / 72; // pdf.js viewport(scale=1)는 72dpi 기준 좌표계입니다.

function drawIntoA4Canvas(source: CanvasImageSource, srcWidth: number, srcHeight: number): Blob | Promise<Blob> {
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

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

async function imageFileToA4Blob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await drawIntoA4Canvas(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function pdfFileToA4Blobs(file: File, onPage?: () => void): Promise<Blob[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const blobs: Blob[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = Math.ceil(viewport.width);
    renderCanvas.height = Math.ceil(viewport.height);
    const ctx = renderCanvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");

    await page.render({ canvas: renderCanvas, canvasContext: ctx, viewport }).promise;
    const blob = await drawIntoA4Canvas(renderCanvas, renderCanvas.width, renderCanvas.height);
    blobs.push(blob);
    onPage?.();
  }

  return blobs;
}

/**
 * 선택한 파일들(PDF와 이미지가 섞여 있어도 됨)을 순서대로 처리해
 * A4 세로 비율 JPEG 페이지 Blob 배열로 돌려줍니다. PDF는 페이지 수만큼
 * 여러 장으로 풀리고, 이미지 파일은 한 장으로 취급됩니다.
 */
export async function filesToA4Pages(files: File[], onPage?: (done: number) => void): Promise<Blob[]> {
  const pages: Blob[] = [];
  let done = 0;
  const notify = () => {
    done += 1;
    onPage?.(done);
  };

  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfPages = await pdfFileToA4Blobs(file, notify);
      pages.push(...pdfPages);
    } else if (file.type.startsWith("image/")) {
      pages.push(await imageFileToA4Blob(file));
      notify();
    } else {
      throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`);
    }
  }

  return pages;
}
