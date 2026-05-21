import { useEffect, useState } from 'react'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { useAuth } from '../../auth/AuthProvider'
import {
  getAllPublishedForGa,
  getNewslettersForInsurerManagerCompany,
} from '../services/insurerNews.service'
import type { NewsChannel, NewsletterItem } from '../types'
import InsurerManagerNewsListMobileView from './InsurerManagerNewsList/InsurerManagerNewsListMobileView'
import InsurerManagerNewsListPCView from './InsurerManagerNewsList/InsurerManagerNewsListPCView'
import type { InsurerManagerNewsListViewProps } from './InsurerManagerNewsList/insurerManagerNewsListViewProps'

type InsurerManagerNewsListPageProps = {
  channel?: NewsChannel
  title?: string
  subtitle?: string
  openPathPrefix?: string
  emptyMessage?: string
  fetchScope?: 'manager' | 'ga'
  noSessionMessage?: string
}

/**
 * 원수사(또는 손해사정사) 담당자 소식지 목록 라우트 container.
 *
 * 책임:
 *   1. 라우트 호출부에서 전달받은 props 로 목록 조회 파라미터를 확정한다.
 *   2. 세션·GA 코드·회사 스코프 가드 (noSession 화면).
 *   3. 목록 아이템 로딩 (items / error).
 *   4. PC/Mobile View 로 분기 위임 (`ResponsiveLayout<ViewProps>`).
 *
 * 상세 조회·모달·줌 같은 PC 전용 상태는 `InsurerManagerNewsListPCView` 가 보유한다
 * (container 에 두면 Mobile 번들에도 코드가 섞이고, Mobile 이 인라인 모달을 쓰지
 * 않으므로 의미도 없다).
 *
 * 공개 props 시그니처는 기존과 **완전히 동일** 하다:
 *   - `/insurer/news` 라우트 직접 호출 (기본값)
 *   - `NewsletterHubPage` 에서 props 주입
 *   - `LossAdjusterManagerNewsListPage` 에서 props 주입
 * 세 호출처 모두 이번 리팩토링의 영향 없음 (시그니처 유지).
 */
export function InsurerManagerNewsListPage({
  channel = 'INSURER',
  title = '원수사 소식지 조회',
  subtitle = '소속 원수사에 등록된 소식지만 표시됩니다.',
  openPathPrefix = '/insurer/news',
  emptyMessage = '등록된 소식지가 없습니다.',
  fetchScope = 'manager',
  noSessionMessage = '원수사 담당자 계정(소속 회사 정보 포함)으로 로그인한 후 이용할 수 있습니다.',
}: InsurerManagerNewsListPageProps) {
  const { user, token } = useAuth()
  const gaCode = user?.gaCode ?? ''
  const companyId = user?.companyId
  /*
   * GA 전체 공개 피드(`fetchScope === 'ga'`) 는 회사 소속이 없어도 조회 가능하다.
   * 손해사정사 채널은 회사 단위 격리가 아니라 GA 단위로 공유되므로 역시 회사 스코프가
   * 필요 없다 — 이 둘을 제외하면 모두 회사 스코프 필수.
   */
  const requiresCompanyScope = fetchScope === 'manager' && channel !== 'LOSS_ADJUSTER'

  const [items, setItems] = useState<NewsletterItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token?.trim() || !gaCode || (requiresCompanyScope && companyId == null)) {
      return
    }
    let cancelled = false
    ;(async () => {
      setError('')
      try {
        const rows =
          fetchScope === 'ga'
            ? await getAllPublishedForGa(gaCode, token, { channel })
            : await getNewslettersForInsurerManagerCompany(token, gaCode, companyId ?? 0, { channel })
        if (!cancelled) {
          setItems(rows)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchScope, channel, token, gaCode, companyId, requiresCompanyScope])

  if (!gaCode || (requiresCompanyScope && companyId == null)) {
    return (
      <main className="page page--with-back insurer-news-page">
        <header className="page-header page-header--has-inline-back">
          <div className="page-header__title-row">
            <h1>{title}</h1>
          </div>
        </header>
        <div className="insurer-news-empty">{noSessionMessage}</div>
      </main>
    )
  }

  const viewProps: InsurerManagerNewsListViewProps = {
    items,
    error,
    title,
    subtitle,
    emptyMessage,
    openPathPrefix,
    channel,
    fetchScope,
  }

  return (
    <ResponsiveLayout<InsurerManagerNewsListViewProps>
      PC={InsurerManagerNewsListPCView}
      Mobile={InsurerManagerNewsListMobileView}
      viewProps={viewProps}
    />
  )
}
