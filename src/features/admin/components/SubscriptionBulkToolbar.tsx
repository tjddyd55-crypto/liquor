/**
 * 구독 일괄 작업 툴바 (관리자 전용)
 *
 * - 선택한 유저 집합에 대해 3종 일괄 작업을 실행한다.
 *     SET_PLAN     : 특정 플랜으로 전환 (TRIAL 은 trialDefaultDays 자동 적용, PAID 는 만료일 필수)
 *     EXTEND_DAYS  : 현재 만료일 기준 N 일 연장 (만료 유저도 "오늘 + N일" 로 복구)
 *     SET_EXPIRY   : 특정 날짜로 만료일 고정 (플랜 유지)
 * - 네트워크 호출은 부모 `onExecute` 로 위임. 이 컴포넌트는 UX 만 책임진다.
 */

import { useMemo, useState } from 'react'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import { SUBSCRIPTION_PLAN_KEYS } from '../../subscription/policy'
import { PLAN_LABEL } from '../../subscription/copy'
import type { BulkSubscriptionAction } from '../api/subscriptionAdminApi'

type BulkActionKind = BulkSubscriptionAction['kind']

const ACTION_OPTIONS: { value: BulkActionKind; label: string }[] = [
  { value: 'SET_PLAN', label: '플랜 변경' },
  { value: 'EXTEND_DAYS', label: '기간 연장 (N일)' },
  { value: 'SET_EXPIRY', label: '만료일 지정' },
]

const PLAN_OPTIONS = SUBSCRIPTION_PLAN_KEYS.map((p) => ({
  value: p,
  label: `${p} (${PLAN_LABEL[p]})`,
}))

function toIsoOrNull(inputDate: string): string | null {
  if (!inputDate.trim()) return null
  const d = new Date(`${inputDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type Props = {
  selectedCount: number
  disabled?: boolean
  onExecute: (action: BulkSubscriptionAction) => Promise<void>
  onClearSelection: () => void
}

export function SubscriptionBulkToolbar({
  selectedCount,
  disabled = false,
  onExecute,
  onClearSelection,
}: Props) {
  const [kind, setKind] = useState<BulkActionKind>('SET_PLAN')
  const [plan, setPlan] = useState(SUBSCRIPTION_PLAN_KEYS[0])
  const [days, setDays] = useState('30')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryDateForPaid, setExpiryDateForPaid] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isEmpty = selectedCount === 0
  const canSubmit = useMemo(() => {
    if (isEmpty || disabled || busy) return false
    if (kind === 'EXTEND_DAYS') {
      const n = Number(days)
      return Number.isFinite(n) && n > 0
    }
    if (kind === 'SET_EXPIRY') {
      return expiryDate.trim().length > 0
    }
    if (kind === 'SET_PLAN' && plan === 'PAID') {
      return expiryDateForPaid.trim().length > 0
    }
    return true
  }, [isEmpty, disabled, busy, kind, days, expiryDate, plan, expiryDateForPaid])

  const handleExecute = async () => {
    setError('')
    let action: BulkSubscriptionAction
    if (kind === 'SET_PLAN') {
      action = {
        kind: 'SET_PLAN',
        plan,
        expiresAt: plan === 'PAID' ? toIsoOrNull(expiryDateForPaid) : undefined,
      }
    } else if (kind === 'EXTEND_DAYS') {
      const n = Number(days)
      if (!Number.isFinite(n) || n <= 0) {
        setError('연장 일수는 1 이상의 숫자여야 합니다.')
        return
      }
      action = { kind: 'EXTEND_DAYS', days: Math.floor(n) }
    } else {
      const iso = toIsoOrNull(expiryDate)
      if (!iso) {
        setError('만료일을 올바르게 입력해 주세요.')
        return
      }
      action = { kind: 'SET_EXPIRY', expiresAt: iso }
    }
    setBusy(true)
    try {
      await onExecute(action)
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 적용에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="card auth-card"
      style={{
        maxWidth: 'none',
        margin: '12px 0',
        padding: 12,
        display: 'grid',
        gap: 12,
        background: isEmpty ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--primary) 6%, var(--bg-elevated))',
        border: '1px solid var(--border-default)',
      }}
      aria-label="구독 일괄 작업 툴바"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong>선택 {selectedCount}명</strong>
        {!isEmpty ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="button button--ghost"
            style={{ fontSize: 13, padding: '4px 8px' }}
          >
            선택 해제
          </button>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            유저를 선택하면 일괄 작업이 활성화됩니다.
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <FieldWrapper label="작업 종류">
          <FormSelect
            value={kind}
            onChange={(e) => setKind(e.target.value as BulkActionKind)}
            options={ACTION_OPTIONS}
            disabled={isEmpty || disabled || busy}
          />
        </FieldWrapper>

        {kind === 'SET_PLAN' ? (
          <>
            <FieldWrapper label="전환할 플랜">
              <FormSelect
                value={plan}
                onChange={(e) => setPlan(e.target.value as typeof plan)}
                options={PLAN_OPTIONS}
                disabled={isEmpty || disabled || busy}
              />
            </FieldWrapper>
            {plan === 'PAID' ? (
              <FieldWrapper label="만료일 (PAID 필수)">
                <FormInput
                  type="date"
                  value={expiryDateForPaid}
                  onChange={(e) => setExpiryDateForPaid(e.target.value)}
                  disabled={isEmpty || disabled || busy}
                />
              </FieldWrapper>
            ) : null}
          </>
        ) : null}

        {kind === 'EXTEND_DAYS' ? (
          <FieldWrapper label="연장 일수">
            <FormInput
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={isEmpty || disabled || busy}
            />
          </FieldWrapper>
        ) : null}

        {kind === 'SET_EXPIRY' ? (
          <FieldWrapper label="만료일">
            <FormInput
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={isEmpty || disabled || busy}
            />
          </FieldWrapper>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <FormButton
            htmlType="button"
            variant="primary"
            onClick={() => void handleExecute()}
            disabled={!canSubmit}
            style={{ width: '100%' }}
          >
            {busy ? '적용 중…' : '일괄 적용'}
          </FormButton>
        </div>
      </div>

      {error ? <StatusMessage tone="error" message={error} /> : null}
    </section>
  )
}
