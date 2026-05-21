/**
 * 카카오(다음) 우편번호 서비스 스크립트 로더.
 *
 * 설계 의도:
 *   - 스크립트는 어플리케이션 전체에서 "있으면 재사용, 없으면 한 번만 주입" 되어야 한다.
 *     같은 페이지에서 여러 화면이 주소검색을 열어도 <script> 가 중복 삽입되면 안 되고,
 *     초기 로드 중 여러 번 호출돼도 동일한 Promise 를 돌려 주도록 모듈 전역 캐시를 둔다.
 *   - 네트워크 실패·CDN 다운 시에는 재시도가 가능하도록, 실패한 Promise 는 캐시에서
 *     비워 준다. 성공한 경우에는 캐시를 유지해 이후 호출이 즉시 resolve 되게 한다.
 *   - 이 모듈은 브라우저 환경에서만 동작한다. SSR 환경에서 실수로 호출되어도 명시적인
 *     에러로 실패해 원인 파악이 쉽게 한다.
 *
 * 외부 의존:
 *   - 카카오(다음) 공식 CDN: https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js
 *   - 로드되면 `window.daum.Postcode` 생성자를 노출한다.
 */

const POSTCODE_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

/**
 * 다음(카카오) Postcode `oncomplete` 콜백 인자. 공식 문서 항목 중 우리가 실제로 사용하는 것만 선언.
 * 프로젝트에 맞게 필요 시 추가하면 된다 — 타입을 최소로 두면 CDN 응답 변경에 덜 민감하다.
 */
export interface DaumPostcodeData {
  /** 우편번호(도로명/지번 공통). */
  zonecode: string
  /** 현재 선택된 주소 타입(사용자가 토글). 'R' 도로명, 'J' 지번. */
  addressType: 'R' | 'J'
  /** 선택된 주소의 대표 문자열(addressType 에 따라 도로명 또는 지번). */
  address: string
  /** 도로명 주소. */
  roadAddress: string
  /** 지번 주소. */
  jibunAddress: string
  /** 건물명(있을 때). 공동주택 여부와 결합해 기본 주소 뒤에 붙여 주면 편리. */
  buildingName?: string
  /** 공동주택 여부('Y' 이면 buildingName 이 아파트·오피스텔). */
  apartment?: 'Y' | 'N'
  /** 법정동. */
  bname?: string
}

/**
 * `window.daum.Postcode` 생성자의 최소 타입. new 로 호출하고 open/embed 만 쓰므로
 * 가능한 한 좁게 선언한다. 옵션에 우리가 쓰지 않는 기능(onresize 등) 은 의도적으로 생략.
 */
export interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void
  onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void
  width?: string | number
  height?: string | number
}

export interface DaumPostcodeInstance {
  open(): void
  embed(element: HTMLElement): void
}

export type DaumPostcodeConstructor = new (options: DaumPostcodeOptions) => DaumPostcodeInstance

declare global {
  interface Window {
    daum?: {
      Postcode: DaumPostcodeConstructor
    }
  }
}

/** 진행 중인 로드 Promise. 성공 시 유지, 실패 시 비워 재시도 허용. */
let loadingPromise: Promise<DaumPostcodeConstructor> | null = null

/**
 * 카카오(다음) 우편번호 생성자를 얻는다. 이미 로드되어 있으면 즉시 반환.
 *
 * @throws {Error} SSR 환경이거나, 스크립트 로드/파싱에 실패한 경우.
 */
export function loadKakaoPostcode(): Promise<DaumPostcodeConstructor> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('kakao-postcode: 브라우저 환경이 아닙니다.'))
  }

  if (window.daum?.Postcode) {
    return Promise.resolve(window.daum.Postcode)
  }

  if (loadingPromise) {
    return loadingPromise
  }

  loadingPromise = new Promise<DaumPostcodeConstructor>((resolve, reject) => {
    /* 이미 같은 src 의 <script> 가 끼어 있으면 재사용 — 네비게이션/스토리북 등에서 중복 삽입 방지. */
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${POSTCODE_SRC}"]`,
    )
    const script = existing ?? document.createElement('script')

    const handleLoad = () => {
      if (window.daum?.Postcode) {
        resolve(window.daum.Postcode)
      } else {
        loadingPromise = null
        reject(new Error('kakao-postcode: 스크립트는 로드되었으나 daum.Postcode 를 찾지 못했습니다.'))
      }
    }
    const handleError = () => {
      loadingPromise = null
      reject(new Error('kakao-postcode: 스크립트 로드에 실패했습니다.'))
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existing) {
      script.src = POSTCODE_SRC
      script.async = true
      document.head.appendChild(script)
    } else if (window.daum?.Postcode) {
      /* 이미 로드 완료된 태그가 있을 수 있다 — load 이벤트가 다시 발화되지 않으므로 즉시 해결. */
      handleLoad()
    }
  })

  return loadingPromise
}
