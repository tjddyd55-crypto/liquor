import { useParams } from 'react-router-dom'
import { EmptyState, LoadingState, StatusMessage } from '../../../../components/feedback'
import { FormSelect } from '../../../../components/form'
import GaCustomerMatchAliasesCard from '../../components/GaCustomerMatchAliasesCard'
import { useGaCustomerExcelData } from '../../hooks/useGaCustomerExcelData'
import {
  formatGaCellDisplay,
  MSG_GA_EXCEL_NO_DISPLAY_KEYS,
  MSG_GA_EXCEL_NO_MAPPED_DATA,
  MSG_GA_EXCEL_UPLOAD_HINT,
} from '../../utils/gaCustomerDataView'

export type CustomerGaExcelPageMobileProps = {
  /**
   * 모바일 GA 모달 등에서 URL `:customerId`가 없을 때 부모가 주입한다.
   * (모달은 목록 URL 위에 떠 있어 useParams 만으로는 고객 ID를 얻지 못한다.)
   */
  routeCustomerId?: number
}

/**
 * [모바일 전용 View] GA 고객 데이터 — 실모바일 기기 화면.
 *
 * 이 파일의 책임: 모바일 UI 마크업과 모바일 전용 className 부착만.
 *  - 데이터·상태:  ../../hooks/useGaCustomerExcelData.ts
 *  - 라우팅·가드:  ../CustomerGaExcelPage.tsx (container)
 *  - PC 대응:      ./CustomerGaExcelPagePC.tsx
 *
 * 스타일 조정은 src/index.css 의 `.customer-ga-excel-page--mobile` 스코프에서 한다.
 * 이 컴포넌트 안에서 PC 분기 (`useIsMobile` 등) 를 호출하지 않는다.
 */
export default function CustomerGaExcelPageMobile({ routeCustomerId }: CustomerGaExcelPageMobileProps = {}) {
  const { customerId: customerIdParam } = useParams()
  const customerId = Number(routeCustomerId ?? customerIdParam)
  const {
    loading,
    error,
    info,
    headers,
    colIds,
    sortedRows,
    sortIdx,
    sortAsc,
    onHeaderClick,
    clearColumnSort,
    reload,
  } = useGaCustomerExcelData(customerId)

  const emptyMappingMessage = `${MSG_GA_EXCEL_NO_MAPPED_DATA} ${MSG_GA_EXCEL_UPLOAD_HINT}`
  const showCards = !loading && !error && sortedRows.length > 0 && colIds.length > 0
  const showBrokenColumns = !loading && !error && sortedRows.length > 0 && colIds.length === 0

  const sortSelectOptions = [
    { value: '', label: '정렬: 업로드 행 순서' },
    ...headers.map((h, i) => ({
      value: String(i),
      label: h || colIds[i] || String(i),
    })),
  ]

  return (
    <main className="page customer-ga-excel-page customer-ga-excel-page--mobile p-3">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">GA 고객 데이터</h2>
      <GaCustomerMatchAliasesCard
        customerId={customerId}
        layout="mobile"
        onSaved={() => void reload()}
      />
      <div className="text-sm text-[var(--text-secondary)] mb-3 space-y-1">
        <p className="m-0">업로드는 내정보관리 페이지에서 진행합니다.</p>
        <p className="m-0">입력칸은 쉼표(,)로 구분합니다.</p>
      </div>

      <StatusMessage message={error} tone="error" />
      <StatusMessage message={info} tone="default" />

      {loading ? (
        <LoadingState message="불러오는 중…" />
      ) : error ? null : sortedRows.length === 0 ? (
        <EmptyState message={emptyMappingMessage} />
      ) : showBrokenColumns ? (
        <EmptyState message={`${MSG_GA_EXCEL_NO_DISPLAY_KEYS} ${MSG_GA_EXCEL_UPLOAD_HINT}`} />
      ) : showCards ? (
        <>
          {colIds.length > 1 ? (
            <div className="customer-ga-excel-mobile-sort">
              <label className="customer-ga-excel-mobile-sort__label" htmlFor="ga-excel-mobile-sort">
                정렬
              </label>
              <FormSelect
                id="ga-excel-mobile-sort"
                aria-label="GA 데이터 정렬 기준"
                value={sortIdx == null ? '' : String(sortIdx)}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '') {
                    clearColumnSort()
                    return
                  }
                  onHeaderClick(Number(v))
                }}
                options={sortSelectOptions}
              />
            </div>
          ) : null}
          <div className="customer-ga-excel-mobile-cards">
            {sortedRows.map((r) => (
              <article key={r.rowIndex} className="customer-ga-excel-mobile-card">
                <dl className="customer-ga-excel-mobile-card__dl">
                  {colIds.map((cid, idx) => (
                    <div key={cid} className="customer-ga-excel-mobile-card__pair">
                      <dt className="customer-ga-excel-mobile-card__dt">{headers[idx] ?? cid}</dt>
                      <dd className="customer-ga-excel-mobile-card__dd">{formatGaCellDisplay(r.cells[cid])}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          {sortIdx != null && colIds.length > 1 ? (
            <p className="text-xs text-[var(--text-secondary)] mt-2" aria-live="polite">
              {sortAsc ? '오름차순' : '내림차순'} · {headers[sortIdx] ?? colIds[sortIdx]}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
