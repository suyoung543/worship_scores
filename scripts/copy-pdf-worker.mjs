// pdfjs 워커 파일을 public 으로 복사합니다 (npm install 후 자동 실행).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs';
if (existsSync(src)) {
  mkdirSync('public', { recursive: true });
  copyFileSync(src, 'public/pdf.worker.min.mjs');
  console.log('copied pdf.worker.min.mjs to public/');
}
