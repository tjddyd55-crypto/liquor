/**
 * 구독 단건 편집 다이얼로그 (관리자 전용)
 *
 * - 책임: 단일 유저 1명의 plan / startedAt / expiresAt / memo 편집 UI 만 담당.
 *   네트워크 호출은 부모가 넘겨주는 `onSubmit` 에서 위임한다. (테스트·재사용 용이)
 * - 입력 폭주 방지를 위해 Plan 별 허용 필드를 입력 단계에서 가린다:
 *     FREE/EXPIRED → 기간 필드 감춤
 *     TRIAL/PAID   → 기간 필드 노출
 */

import { useEffect, useMemo, useState } from 'react'
import { FieldWrapper, FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import { FormDialog } from '../../../components/dialog'
import { StatusMessage } from '../../../components/feedback'
import { PLAN_LABEL } from '../../subscription/copy'
import { SUBSCRIPTION_PLAN_KEYS, type SubscriptionPlan } from '../../subscription/policy'
import type { SubscriptionUserRow, UpdateSubscriptionUserBody } from '../api/subscriptionAdminApi'

const PLAN_OPTIONS = SUBSCRIPTION_PLAN_KEYS.map((plan) => ({
  value: plan,
  label: `${plan} (${PLAN_LABEL[plan]})`,
}))

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toIsoOrNull(inputDate: string): string | null {
  if (!inputDate.trim()) return null
  const d = new Date(`${inputDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type Props = {
  open: boolean
  target: SubscriptionUserRow | null
  onClose: () => void
  onSubmit: (patch: UpdateSubscriptionUserBody) => Promise<void>
}

export function SubscriptionEditDialog({ open, target, onClose, onSubmit }: Props) {
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE')
  const [startedAt, setStartedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !target) return
    setPlan(target.plan)
    setStartedAt(toInputDate(target.started_at))
    setExpiresAt(toInputDate(target.expires_at))
    setMemo('')
    setError('')
    setSubmitting(false)
  }, [open, target])

  const needsPeriod = plan === 'TRIAL' || plan === 'PAID'

  const title = useMemo(() => {
    if (!target) return '구독 편집'
    return `구독 편집 — ${target.display_name ?? target.username}`
  }, [target])

  const handleSubmit = async () => {
    if (!target || submitting) return
    setError('')
    if (needsPeriod && !expiresAt.trim()) {
      setError('TRIAL/PAID 는 만료일이 필요합니다.')
      return
    }
    const patch: UpdateSubscriptionUserBody = {
      plan,
      memo: memo.trim() || null,
      started_at: needsPeriod ? toIsoOrNull(startedAt) : null,
      expires_at: needsPeriod ? toIsoOrNull(expiresAt) : null,
    }
    setSubmitting(true)
    try {
      await onSubmit(patch)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={title}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <FormButton
            htmlType="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </FormButton>
          <FormButton htmlType="button" variant="primary" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '저장 중…' : '저장'}
          </FormButton>
        </div>
      }
    >
      {error ? <StatusMessage tone="error" message={error} /> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        <FieldWrapper label="플랜">
          <FormSelect
            value={plan}
            onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
            options={PLAN_OPTIONS}
            disabled={submitting}
          />
        </FieldWrapper>

        {needsPeriod ? (
          <>
            <FieldWrapper label="시작일 (선택)">
              <FormInput
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                disabled={submitting}
              />
            </FieldWrapper>
            <FieldWrapper label="만료일 (필수)">
              <FormInput
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={submitting}
              />
            </FieldWrapper>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {plan === 'FREE'
              ? 'FREE 플랜은 기간이 없습니다. 저장 시 시작일/만료일이 null 로 정리됩니다.'
              : 'EXPIRED 플랜은 즉시 이용 종료 상태로 저장됩니다.'}
          </p>
        )}

        <FieldWrapper label="변경 메모 (변경 로그에 저장)">
          <FormTextarea
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="선택 입력 — 왜 변경하는지 간단히 남겨주세요"
            disabled={submitting}
          />
        </FieldWrapper>
      </div>
    </FormDialog>
  )
}
