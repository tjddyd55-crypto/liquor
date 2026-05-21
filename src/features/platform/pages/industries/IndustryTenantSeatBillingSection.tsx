import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import FormButton from '../../../../components/form/FormButton'
import FormInput from '../../../../components/form/FormInput'
import FormTextarea from '../../../../components/form/FormTextarea'
import { ApiError } from '../../../../lib/apiClient'
import { patchPlatformTenantSeatBilling } from '../../api/platformAdminApi'
import type { PlatformTenantRow } from '../../platformAdmin.types'

export type IndustryTenantSeatBillingSectionProps = {
  variant: 'pc' | 'mobile'
  industryRowPresent: boolean
  industryIdForApi: string | null
  tenantAdminTargetTenantId: string | null
  selectedTenant: PlatformTenantRow | null
  token: string | null
  refetchTenants: () => Promise<void>
}

function isTenantActive(row: PlatformTenantRow): boolean {
  return String(row.status ?? '').trim().toLowerCase() === 'active'
}

export function IndustryTenantSeatBillingSection({
  variant,
  industryRowPresent,
  industryIdForApi,
  tenantAdminTargetTenantId,
  selectedTenant,
  token,
  refetchTenants,
}: IndustryTenantSeatBillingSectionProps) {
  const [seatLimitDraft, setSeatLimitDraft] = useState('')
  const [maxSessionsDraft, setMaxSessionsDraft] = useState('')
  const [maxDevicesDraft, setMaxDevicesDraft] = useState('')
  const [billingJsonDraft, setBillingJsonDraft] = useState('{}')
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setSuccessMessage(null)
    setErrorMessage(null)
    if (selectedTenant == null) {
      setSeatLimitDraft('')
      setMaxSessionsDraft('')
      setMaxDevicesDraft('')
      setBillingJsonDraft('{}')
      return
    }
    const lim = selectedTenant.seatLimit
    setSeatLimitDraft(lim == null || lim === undefined ? '' : String(lim))
    const lp = selectedTenant.licensePolicy
    setMaxSessionsDraft(
      lp?.maxConcurrentSessionsPerUser != null ? String(lp.maxConcurrentSessionsPerUser) : '',
    )
    setMaxDevicesDraft(
      lp?.maxRegisteredDevicesPerUser != null ? String(lp.maxRegisteredDevicesPerUser) : '',
    )
    try {
      setBillingJsonDraft(JSON.stringify(selectedTenant.billingEntitlement ?? {}, null, 2))
    } catch {
      setBillingJsonDraft('{}')
    }
  }, [selectedTenant])

  if (!industryRowPresent || tenantAdminTargetTenantId == null) {
    return null
  }

  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId =
    variant === 'pc' ? 'platform-tenant-seat-billing-heading' : 'm-platform-tenant-seat-billing'

  const canSubmit =
    Boolean(token) &&
    industryIdForApi != null &&
    selectedTenant != null &&
    isTenantActive(selectedTenant)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit || industryIdForApi == null || selectedTenant == null || token == null) {
      return
    }
    setSuccessMessage(null)
    setErrorMessage(null)

    let billingEntitlement: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(billingJsonDraft.trim() === '' ? '{}' : billingJsonDraft)
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErrorMessage('billingEntitlement는 JSON 객체여야 합니다.')
        return
      }
      billingEntitlement = parsed as Record<string, unknown>
    } catch {
      setErrorMessage('billingEntitlement JSON 파싱에 실패했습니다.')
      return
    }

    let seatLimit: number | null
    const seatTrim = seatLimitDraft.trim()
    if (seatTrim === '') {
      seatLimit = null
    } else {
      const n = Number(seatTrim)
      if (!Number.isSafeInteger(n) || n < 1 || n > 500000) {
        setErrorMessage('계약 좌석 수는 1~500000 정수이거나 비우면 무제한입니다.')
        return
      }
      seatLimit = n
    }

    const parseOptionalPositive = (raw: string, label: string): number | null | 'err' => {
      const t = raw.trim()
      if (t === '') return null
      const n = Number(t)
      if (!Number.isSafeInteger(n) || n < 1) {
        setErrorMessage(`${label}는 1 이상의 정수이거나 비우면 무제한입니다.`)
        return 'err'
      }
      return n
    }

    const maxS = parseOptionalPositive(maxSessionsDraft, '계정당 동시 접속 제한')
    if (maxS === 'err') return
    const maxD = parseOptionalPositive(maxDevicesDraft, '계정당 등록 기기 제한')
    if (maxD === 'err') return

    setSubmitting(true)
    try {
      await patchPlatformTenantSeatBilling(token, industryIdForApi, selectedTenant.id, {
        seatLimit,
        licensePolicy: {
          maxConcurrentSessionsPerUser: maxS,
          maxRegisteredDevicesPerUser: maxD,
        },
        billingEntitlement,
      })
      setSuccessMessage('좌석·정책·청구 메타를 저장했습니다.')
      await refetchTenants()
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message.trim() !== '' ? err.message : `저장 실패 (${err.status})`)
      } else {
        setErrorMessage('저장에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="platform-admin-page__tenant-seat-billing" aria-labelledby={titleId}>
      <h2 id={titleId} className={titleClass}>
        좌석·라이선스·청구 메타
      </h2>
      {selectedTenant == null ? (
        <p className="platform-admin-page__muted">Tenant 를 선택하면 계약 좌석과 정책을 편집할 수 있습니다.</p>
      ) : !isTenantActive(selectedTenant) ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>inactive 테넌트는 정책을 수정할 수 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="platform-admin-page__summary-card">
            <h3 className="platform-admin-page__panel-title">현재 요약</h3>
            <dl className="platform-admin-page__dl">
              <dt>계약 좌석</dt>
              <dd>{selectedTenant.seatLimit == null || selectedTenant.seatLimit === undefined ? '무제한' : String(selectedTenant.seatLimit)}</dd>
              <dt>활성 사용자(좌석)</dt>
              <dd>{selectedTenant.activeSeatCount ?? 0}</dd>
              <dt>남은 좌석</dt>
              <dd>
                {selectedTenant.seatLimit == null || selectedTenant.seatLimit === undefined
                  ? '—'
                  : String(selectedTenant.remainingSeats ?? 0)}
              </dd>
            </dl>
          </div>

          {successMessage ? (
            <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
              <p>{successMessage}</p>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
              <p>{errorMessage}</p>
            </div>
          ) : null}

          <form className="platform-admin-page__industry-create-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="platform-admin-page__form-field">
              <label className="dark-label" htmlFor={`seat-limit-${variant}`}>
                계약 좌석 수 <span className="platform-admin-page__muted">(비우면 무제한)</span>
              </label>
              <FormInput
                id={`seat-limit-${variant}`}
                name="seatLimit"
                inputMode="numeric"
                autoComplete="off"
                value={seatLimitDraft}
                onChange={(ev) => {
                  setSeatLimitDraft(ev.target.value)
                  setSuccessMessage(null)
                  setErrorMessage(null)
                }}
                disabled={!canSubmit || submitting}
                placeholder="예: 5"
              />
            </div>
            <div className="platform-admin-page__form-field">
              <label className="dark-label" htmlFor={`max-sessions-${variant}`}>
                계정당 동시 접속 제한 <span className="platform-admin-page__muted">(비우면 무제한)</span>
              </label>
              <FormInput
                id={`max-sessions-${variant}`}
                name="maxConcurrentSessions"
                inputMode="numeric"
                autoComplete="off"
                value={maxSessionsDraft}
                onChange={(ev) => {
                  setMaxSessionsDraft(ev.target.value)
                  setSuccessMessage(null)
                  setErrorMessage(null)
                }}
                disabled={!canSubmit || submitting}
              />
            </div>
            <div className="platform-admin-page__form-field">
              <label className="dark-label" htmlFor={`max-devices-${variant}`}>
                계정당 등록 기기 제한 <span className="platform-admin-page__muted">(비우면 무제한)</span>
              </label>
              <FormInput
                id={`max-devices-${variant}`}
                name="maxRegisteredDevices"
                inputMode="numeric"
                autoComplete="off"
                value={maxDevicesDraft}
                onChange={(ev) => {
                  setMaxDevicesDraft(ev.target.value)
                  setSuccessMessage(null)
                  setErrorMessage(null)
                }}
                disabled={!canSubmit || submitting}
              />
            </div>
            <div className="platform-admin-page__form-field">
              <label className="dark-label" htmlFor={`billing-json-${variant}`}>
                요금·청구 메타 (JSON 객체)
              </label>
              <p className="platform-admin-page__field-hint">
                기본 이용료·라인 할인 등 자유 필드입니다. 좌석 수와 자동 연동하지 않습니다.
              </p>
              <FormTextarea
                id={`billing-json-${variant}`}
                name="billingEntitlement"
                rows={variant === 'pc' ? 8 : 6}
                value={billingJsonDraft}
                onChange={(ev) => {
                  setBillingJsonDraft(ev.target.value)
                  setSuccessMessage(null)
                  setErrorMessage(null)
                }}
                disabled={!canSubmit || submitting}
                className="platform-admin-page__mono"
              />
            </div>
            <div className="platform-admin-page__form-actions">
              <FormButton
                htmlType="submit"
                variant="primary"
                loading={submitting}
                loadingText="저장 중…"
                disabled={!canSubmit || submitting}
                fullWidth={variant === 'mobile'}
              >
                저장
              </FormButton>
            </div>
          </form>
        </>
      )}
    </section>
  )
}
