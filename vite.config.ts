import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const insurancePkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __INSURANCE_WEB_APP_VERSION__: JSON.stringify(insurancePkg.version),
  },
  // Web (Railway/Express): absolute /assets/... so deep routes like /customer/register work.
  // Desktop packaged build: use `npm run build:web -- --base ./` (see build:desktop script).
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  /*
   * pdfjs-dist@5.x 는 ESM 전용으로 배포되며 워커 소스(`pdf.worker.min.mjs`) 도
   * ES 모듈이다. Vite 의 워커 기본 포맷은 `iife` 이라, 이 상태로 번들하면
   * 워커 내부의 ESM 문법이 실행되지 못해 워커가 부팅 직후 조용히 실패한다.
   * 그 결과 `getDocument(...).promise` 가 `parse-failed` 로 reject 되어
   * "PDF 형식을 해석하지 못했습니다" 메시지가 떴다(Electron 에서 더 확실히 재현).
   *
   * 해결: 워커 청크를 ES 모듈(`new Worker(url, { type: 'module' })`) 로 번들.
   * 런타임 코드(`src/lib/pdfjs/setupWorker.ts`) 는 그대로 두고, 빌드 제약은
   * 빌드 설정에서 흡수한다(빌드/런타임 책임 분리).
   */
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@insurance-shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/backend': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
