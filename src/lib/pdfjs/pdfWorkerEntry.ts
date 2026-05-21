/**
 * pdfjs worker 스레드 전용 엔트리.
 *
 * 이 파일의 유일한 책임:
 *   1) 워커 스레드에서 최신 JS 제안 API 폴리필들을 먼저 활성화한다.
 *   2) 그 뒤에 pdfjs-dist 의 실제 worker 코드를 side-effect import 로 로드한다.
 *
 * 왜 별도 엔트리가 필요한가:
 *   `pdfjs-dist/build/pdf.worker.min.mjs` 를 바로 `?worker` 로 import 하면
 *   pdfjs 코드가 즉시 최상위에서 실행되어 폴리필을 먼저 심을 틈이 없다.
 *   워커의 Array/Map/Uint8Array prototype 은 메인 스레드와 분리된 별도 realm 이라
 *   메인에서 아무리 폴리필해도 워커에는 전파되지 않는다.
 *
 *   이 파일을 `?worker` 대상으로 삼으면 Vite 가 이 파일을 워커 엔트리로
 *   번들하면서 아래 import 들을 순서대로 실행시킨다. 결과적으로 워커가
 *   pdfjs worker 로직을 만나기 전에 모든 누락 API 가 준비된다.
 *
 * 폴리필 추가 규칙:
 *   - 새 TC39 제안 API 가 pdfjs 에서 또 누락 신호를 보이면(런타임에
 *     `xxx is not a function`), `src/lib/polyfills/` 에 파일 추가 후 여기와
 *     `src/main.tsx` 양쪽에 import 를 나란히 추가한다.
 *   - import 순서는 알파벳이 아니라 "서로 의존 없는 독립 폴리필" 원칙.
 *
 * 이후 변경은 어디에서?
 *   - pdfjs 버전을 바꿀 일이 있으면 아래 마지막 import 의 경로만 맞추면 된다.
 */

import '../polyfills/uint8ArrayBase'
import '../polyfills/mapUpsert'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
