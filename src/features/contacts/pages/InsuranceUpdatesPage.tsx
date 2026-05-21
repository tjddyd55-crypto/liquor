import { useEffect, useMemo, useState } from 'react'
import { CompanyCard } from '../../company-registry/components/CompanyCard'
import { getCompanyRecentUpdates } from '../../company-registry/api/companyRegistryApi'
import { useAuth } from '../../auth/AuthProvider'
import type { CompanyUpdateHistoryItem } from '../../company-registry/domain/types'

function formatHistoryDate(isoDate: string): string {
  if (!isoDate || isoDate === '날짜 없음') {
    return isoDate || '날짜 없음'
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('ko-KR')
  }
  return isoDate
}

/**
 * 오늘을 0 일로 두고, 날짜와의 차이(일수) 를 구해 "오늘 / 어제 / N일 전" 으로 변환.
 * - 정확한 ISO(YYYY-MM-DD) 가 아니면 `null` 반환: 상대 시간 배지를 렌더하지 않는다.
 * - 7 일 이상 지난 날짜는 `null` — 이 경우 절대 날짜만 표시해 혼란을 줄인다.
 *
 * "언제인지를 즉각 파악" 이 목적이므로 1 주일 이내만 상대 시간으로 표기한다.
 */
function formatRelativeFromToday(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null
  }
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - target.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) {
    return '오늘'
  }
  if (diffDays === 1) {
    return '어제'
  }
  if (diffDays > 1 && diffDays <= 7) {
    return `${diffDays}일 전`
  }
  return null
}

/**
 * 날짜 헤더 — 변경이 "언제" 일어났는지 한눈에 보이도록 시각적으로 강조한다.
 *
 *  - 상대 시간("오늘/어제/N일 전") 은 컬러 배지로, 직관적 인지 담당.
 *  - 절대 날짜(`2026. 4. 16.`) 는 큰 글씨로, 근거 기록 담당.
 *  - 두 표기가 한 줄에 나란히 — 하나만 보고 판단하는 오독을 방지한다.
 */
function HistoryDateHeader({ rawDate }: { rawDate: string }) {
  const absolute = formatHistoryDate(rawDate)
  const relative = formatRelativeFromToday(rawDate)
  const isToday = relative === '오늘'
  return (
    <div
      className={`history-date history-date--emphasis${isToday ? ' history-date--today' : ''}`}
    >
      {relative ? <span className="history-date__relative">{relative}</span> : null}
      <span className="history-date__absolute">{absolute}</span>
    </div>
  )
}

function groupHistoryByDate(items: CompanyUpdateHistoryItem[]) {
  const groups: { date: string; items: CompanyUpdateHistoryItem[] }[] = []
  for (const item of items) {
    const date = item.updatedAt || '날짜 없음'
    const last = groups[groups.length - 1]
    if (last && last.date === date) {
      last.items.push(item)
    } else {
      groups.push({ date, items: [item] })
    }
  }
  return groups
}

export function InsuranceUpdatesPage() {
  const { token } = useAuth()
  const [list, setList] = useState<CompanyUpdateHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!token) {
        if (active) {
          setIsLoading(false)
        }
        return
      }
      try {
        const result = await getCompanyRecentUpdates(token)
        if (!active) {
          return
        }
        setList(result)
      } catch (error) {
        if (!active) {
          return
        }
        setStatusText(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [token])

  const grouped = useMemo(() => groupHistoryByDate(list), [list])

  return (
    <main className="page page--with-back contacts-page insurance-recent-updates-page insurance-contacts-view company-directory-read-ui">

      <header className="page-header">
        <h1>업데이트 현황</h1>
        <p>
          {statusText ||
            '원수사 연락처를 저장할 때마다 날짜·보험사별로 변경 요약이 쌓입니다. 빨간 글자는 직전 저장 대비 바뀐 값입니다.'}
        </p>
      </header>

      <section className="insurance-contacts-list-wrap" aria-live="polite">
        <h2 className="dashboard-section-title visually-hidden">변경 히스토리</h2>
        {isLoading ? (
          <p className="dashboard-empty">불러오는 중입니다…</p>
        ) : list.length === 0 ? (
          <div className="empty-box" role="status">
            📭 표시할 업데이트가 없습니다
          </div>
        ) : (
          <div className="update-history">
            {grouped.map((block) => (
              <div key={block.date} className="history-block">
                <HistoryDateHeader rawDate={block.date} />
                <div className="insurance-contacts-cards">
                  {block.items.map((item) => (
                    <CompanyCard
                      key={item.id}
                      variant="history"
                      companyName={item.companyName}
                      before={item.before}
                      after={item.after}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
