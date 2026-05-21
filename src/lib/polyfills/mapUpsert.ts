/**
 * Map.prototype.{getOrInsert, getOrInsertComputed} / WeakMap.prototype.{동일}
 * polyfill — TC39 "Upsert" (Stage-3) 제안.
 *
 * 배경:
 *   pdfjs-dist 5.x 는 렌더링 경로 곳곳에서 `map.getOrInsertComputed(key, factory)`
 *   패턴을 사용한다(intent 캐시, bitmap 캐시, debug metadata, popup element 목록 등
 *   총 10곳 이상). 이 메서드는 Chromium 아주 최근 버전(138+ 추정)에만 있고
 *   Electron 35.7.5 내장 Chromium 134 에는 없다.
 *
 *   사용자 영향: PDF 문서 오픈은 성공(`getDocument().promise` resolve)하지만,
 *   `page.render()` 내부에서 TypeError 가 터져 화면엔 빈 캔버스만 남고
 *   "PDF 렌더링 중 문제가 발생했습니다." 메시지가 뜬다.
 *
 * 적용 범위:
 *   - 메인 스레드: `src/main.tsx` 에서 한 번 side-effect import.
 *   - 워커 스레드: `src/lib/pdfjs/pdfWorkerEntry.ts` 에서 pdfjs worker 로드
 *     이전에 side-effect import.
 *
 * 설계 원칙 (uint8ArrayBase.ts 와 동일):
 *   - 네이티브가 있으면 덮어쓰지 않는다.
 *   - 스펙("Upsert" 제안) 핵심 동작만 충실히 구현. 엣지 케이스(비함수 callback
 *     등)에 대해서는 스펙대로 TypeError 를 던진다.
 *   - 각 라이브러리별 개별 대응 대신, 플랫폼 레벨(전역 프로토타입)에서 한 번에
 *     채워야 하위 의존성 전체가 혜택을 본다.
 *
 * 이후 변경은 어디에서?
 *   - Electron 을 Chromium 138+ 내장 버전으로 업그레이드하면 불필요해진다.
 *     그때는 이 파일 삭제 + 두 곳의 import 제거면 된다.
 *   - "네이티브 있으면 skip" 원칙 덕분에 업그레이드 중간 단계에서 혼선 없이
 *     자연스럽게 네이티브로 복귀한다.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type UpsertableMap<K, V> = Map<K, V> | WeakMap<K extends object ? K : never, V>

function assertCallable(fn: unknown): asserts fn is (...args: unknown[]) => unknown {
  if (typeof fn !== 'function') {
    throw new TypeError('The callback argument must be a function')
  }
}

function defineUpsertMethods(target: any): void {
  if (typeof target.getOrInsert !== 'function') {
    /*
     * Spec: 키가 이미 있으면 기존 값을 반환. 없으면 value 를 삽입하고 반환.
     * Map/WeakMap 의 키 동등성 규칙(SameValueZero / 객체 참조)은 has/set 이
     * 이미 준수하므로 직접 구현할 필요가 없다.
     */
    target.getOrInsert = function getOrInsert<K, V>(this: UpsertableMap<K, V>, key: K, value: V): V {
      if ((this as any).has(key)) {
        return (this as any).get(key) as V
      }
      ;(this as any).set(key, value)
      return value
    }
  }

  if (typeof target.getOrInsertComputed !== 'function') {
    target.getOrInsertComputed = function getOrInsertComputed<K, V>(
      this: UpsertableMap<K, V>,
      key: K,
      callbackfn: (key: K) => V,
    ): V {
      assertCallable(callbackfn)
      if ((this as any).has(key)) {
        return (this as any).get(key) as V
      }
      /*
       * 스펙 주의: callback 이 this 맵을 변조해도(같은 키를 미리 set 하더라도)
       * 마지막에 우리가 set 한 값이 최종적으로 저장된다. pdfjs 는 이런 재진입
       * 패턴을 쓰지 않으므로 간결한 구현을 우선했다.
       */
      const value = callbackfn(key)
      ;(this as any).set(key, value)
      return value
    }
  }
}

defineUpsertMethods(Map.prototype)
defineUpsertMethods(WeakMap.prototype)

export {}
