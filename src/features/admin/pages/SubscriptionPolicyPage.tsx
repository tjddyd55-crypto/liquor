/**
 * 구독 정책 ON/OFF 관리 페이지 (SUPER_ADMIN 전용)
 *
 * 책임:
 *  1) 현재 정책 상태(policyActive, trialDefaultDays, 영향 규모 카운트) 조회/표시.
 *  2) dryRun 으로 "활성화 시 영향 받을 유저 수" 를 먼저 확인.
 *  3) "정책 활성화" 실행 — 관리자가 명시적으로 눌러야 TRIAL 타이머가 시작된다.
 *  4) "정책 비활성화" — 플래그만 false 로 되돌림. 유저 타이머는 보존.
 *
 * 이 페이지는 네트워크 shape 변화를 완충하기 위해 응답 JSON 은 모두 `subscriptionAdminApi`
 * 가 소유한다. UI 는 계산 결과만 받는다.
 */

import { useCallback, useEffect, useState } from 'react'
import { FormButton } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import { useConfirmDialog } from '../../../components/dialog'
import { useAuth } from '../../auth/AuthProvider'
import {
  activateSubscriptionPolicy,
  deactivateSubscriptionPolicy,
  fetchSubscriptionPolicyStatus,
  type ActivateSubscriptionPolicyResult,
  type SubscriptionPolicyStatus,
} from '../api/subscriptionAdminApi'

export default function SubscriptionPolicyPage() {
  const { user, token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [status, setStatus] = useState<SubscriptionPolicyStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isActing, setIsActing] = useState(false)

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') return
    setLoadError('')
    setIsLoading(true)
    try {
      const res = await fetchSubscriptionPolicyStatus(token)
      setStatus(res.status)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '정책 상태를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  const runDryRun = async () => {
    if (!token?.trim() || isActing) return
    setActionError('')
    setActionNotice('')
    setIsActing(true)
    try {
      const res = await activateSubscriptionPolicy(token, { dryRun: true })
      const r: ActivateSubscriptionPolicyResult = res.result
      setActionNotice(
        `미리보기: ${r.eligibleCount}명이 TRIAL(${r.trialDays}일) 로 전환됩니다.${
          r.alreadyActive ? ' (이미 활성 상태)' : ''
        }`,
      )
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '미리보기 실패')
    } finally {
      setIsActing(false)
    }
  }

  const runActivate = async () => {
    if (!token?.trim() || isActing) return
    const ok = await confirm({
      title: '정책 활성화',
      message:
        '정책을 활성화하면 FREE 구독 주체 유저들이 즉시 TRIAL 로 전환되며 타이머가 시작됩니다. 계속할까요?',
      confirmLabel: '활성화',
      tone: 'danger',
    })
    if (!ok) return
    setActionError('')
    setActionNotice('')
    setIsActing(true)
    try {
      const res = await activateSubscriptionPolicy(token, {
        memo: '관리자 수동 활성화',
      })
      const r = res.result
      setActionNotice(
        `활성화 완료. ${r.convertedCount}명이 TRIAL(${r.trialDays}일) 로 전환되었습니다.`,
      )
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '활성화 실패')
    } finally {
      setIsActing(false)
    }
  }

  const runDeactivate = async () => {
    if (!token?.trim() || isActing) return
    const ok = await confirm({
      title: '정책 비활성화',
      message:
        '정책을 비활성화하면 모두가 무제한(FREE) 으로 간주됩니다. 기존 TRIAL/PAID 타이머는 보존되며 재활성화 시 이어집니다. 계속할까요?',
      confirmLabel: '비활성화',
      tone: 'danger',
    })
    if (!ok) return
    setActionError('')
    setActionNotice('')
    setIsActing(true)
    try {
      await deactivateSubscriptionPolicy(token)
      setActionNotice('정책이 비활성화되었습니다.')
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '비활성화 실패')
    } finally {
      setIsActing(false)
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>구독 정책</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>구독 정책</h1>
        <p>정책 스위치 / 영향 규모 확인 / 활성화·비활성화</p>
      </header>

      <section
        className="card auth-card"
        style={{ maxWidth: 'none', margin: '0 0 16px', padding: 16, display: 'grid', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>현재 상태</strong>
          {isLoading ? <span>불러오는 중…</span> : null}
          {status ? (
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontWeight: 600,
                background: status.policyActive
                  ? 'color-mix(in srgb, var(--success) 20%, transparent)'
                  : 'color-mix(in srgb, var(--text-secondary) 18%, transparent)',
                color: status.policyActive ? 'var(--success)' : 'var(--text-secondary)',
              }}
            >
              {status.policyActive ? '활성' : '비활성'}
            </span>
          ) : null}
        </div>

        {status ? (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              margin: 0,
            }}
          >
            <StatBox label="TRIAL 기본 일수" value={`${status.trialDefaultDays}일`} />
            <StatBox label="활성화 대상 유저" value={`${status.eligibleUserCount}명`} />
            <StatBox label="TRIAL 진행 유저" value={`${status.trialUserCount}명`} />
            <StatBox label="만료 경과 유저" value={`${status.expiredUserCount}명`} />
          </dl>
        ) : null}

        {loadError ? <StatusMessage tone="error" message={loadError} /> : null}
      </section>

      <section className="card auth-card" style={{ maxWidth: 'none', margin: '0', padding: 16, display: 'grid', gap: 12 }}>
        <strong>작업</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FormButton htmlType="button" variant="secondary" onClick={() => void runDryRun()} disabled={isActing}>
            활성화 미리보기
          </FormButton>
          <FormButton htmlType="button" variant="primary" onClick={() => void runActivate()} disabled={isActing}>
            정책 활성화
          </FormButton>
          <FormButton htmlType="button" variant="secondary" onClick={() => void runDeactivate()} disabled={isActing}>
            정책 비활성화
          </FormButton>
          <FormButton htmlType="button" variant="secondary" onClick={() => void load()} disabled={isLoading || isActing}>
            새로고침
          </FormButton>
        </div>
        {actionNotice ? <StatusMessage message={actionNotice} /> : null}
        {actionError ? <StatusMessage tone="error" message={actionError} /> : null}
      </section>

      {confirmDialog}
    </main>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
      }}
    >
      <dt style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{value}</dd>
    </div>
  )
}
