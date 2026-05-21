/**
 * 구독 전역 설정 페이지 (SUPER_ADMIN 전용)
 *
 * 범위:
 *  - TRIAL 기본 일수 설정 (1~365)
 *  - 정책 활성화 상태는 조회만 (변경은 SubscriptionPolicyPage 담당 — 책임 분리)
 *
 * 의도적으로 단일 책임으로 유지. 추후 결제/PG 설정이 붙으면 이 페이지에 섹션을 추가.
 */

import { useCallback, useEffect, useState } from 'react'
import { FieldWrapper, FormButton, FormInput } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import { useAuth } from '../../auth/AuthProvider'
import {
  fetchSubscriptionGlobalSettings,
  updateSubscriptionGlobalSettings,
  type SubscriptionGlobalSettings,
} from '../api/subscriptionAdminApi'

export default function AdminSubscriptionSettingsPage() {
  const { user, token } = useAuth()
  const [settings, setSettings] = useState<SubscriptionGlobalSettings | null>(null)
  const [trialDefaultDays, setTrialDefaultDays] = useState('30')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') return
    setLoadError('')
    setIsLoading(true)
    try {
      const res = await fetchSubscriptionGlobalSettings(token)
      setSettings(res)
      setTrialDefaultDays(String(res.trial_default_days))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (!token?.trim() || isSaving) return
    const n = Number(trialDefaultDays)
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setSaveError('TRIAL 기본 일수는 1~365 범위여야 합니다.')
      return
    }
    setSaveError('')
    setSaveOk('')
    setIsSaving(true)
    try {
      await updateSubscriptionGlobalSettings(token, { trial_default_days: Math.floor(n) })
      setSaveOk('저장되었습니다.')
      await load()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setIsSaving(false)
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>구독 설정</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>구독 설정</h1>
        <p>전역 TRIAL 기본 일수 / 정책 상태</p>
      </header>

      <section
        className="card auth-card"
        style={{ maxWidth: 'none', margin: '0 0 16px', padding: 16, display: 'grid', gap: 12 }}
      >
        <strong>정책 상태</strong>
        {isLoading ? <span>불러오는 중…</span> : null}
        {settings ? (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            현재 정책:{' '}
            <strong style={{ color: settings.policy_active ? 'var(--success)' : 'var(--text-secondary)' }}>
              {settings.policy_active ? '활성' : '비활성'}
            </strong>
            {' '}· 활성/비활성 전환은 <em>구독 정책</em> 페이지에서 관리합니다.
          </p>
        ) : null}
        {loadError ? <StatusMessage tone="error" message={loadError} /> : null}
      </section>

      <section className="card auth-card" style={{ maxWidth: 'none', margin: 0, padding: 16, display: 'grid', gap: 12 }}>
        <strong>TRIAL 기본 일수</strong>
        <FieldWrapper
          label="체험 기본 일수 (1~365)"
          helperText="정책 활성화 시 전체 유저에게 적용될 기본 체험 기간입니다."
        >
          <FormInput
            type="number"
            min={1}
            max={365}
            value={trialDefaultDays}
            onChange={(e) => setTrialDefaultDays(e.target.value)}
            disabled={isSaving || isLoading}
          />
        </FieldWrapper>
        <div>
          <FormButton htmlType="button" variant="primary" onClick={() => void submit()} disabled={isSaving || isLoading}>
            {isSaving ? '저장 중…' : '저장'}
          </FormButton>
        </div>
        {saveOk ? <StatusMessage message={saveOk} /> : null}
        {saveError ? <StatusMessage tone="error" message={saveError} /> : null}
      </section>
    </main>
  )
}
