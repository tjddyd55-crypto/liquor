import pino from 'pino'

const level = process.env.LOG_LEVEL?.trim() || 'info'

/**
 * JSON 한 줄 로그 → stdout. CloudWatch / Datadog / Railway log drain 등에서 파싱·알림에 사용.
 * 자식 로거: insuranceLog.child({ reqId }) 형태로 요청 단위 필드를 붙일 수 있음.
 */
export const insuranceLog = pino({
  level,
  base: { svc: 'insurance-api' },
})

/** 원수사 소식·R2 업로드 관측 (event 필드로 대시보드 그룹핑 권장) */
export const insurerNewsLog = insuranceLog.child({ domain: 'insurer-news' })
