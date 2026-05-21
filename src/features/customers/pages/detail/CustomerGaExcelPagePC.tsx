import { useParams } from 'react-router-dom'
import { EmptyState, LoadingState, StatusMessage } from '../../../../components/feedback'
import { FormButton } from '../../../../components/form'
import GaCustomerMatchAliasesCard from '../../components/GaCustomerMatchAliasesCard'
import { useGaCustomerExcelData } from '../../hooks/useGaCustomerExcelData'
import {
  formatGaCellDisplay,
  MSG_GA_EXCEL_NO_DISPLAY_KEYS,
  MSG_GA_EXCEL_NO_MAPPED_DATA,
  MSG_GA_EXCEL_UPLOAD_HINT,
} from '../../utils/gaCustomerDataView'

/**
 * [PC 전용 View] GA 고객 데이터 테이블 — PC 브라우저·Electron 화면.
 *
 * 이 파일의 책임: PC UI 마크업과 PC 전용 className 부착만.
 *  - 데이터·상태:  ../../hooks/useGaCustomerExcelData.ts
 *  - 라우팅·가드:  ../CustomerGaExcelPage.tsx (container)
 *  - 모바일 대응:  ./CustomerGaExcelPageMobile.tsx
 *
 * 스타일 조정은 src/index.css 의 `.customer-ga-excel-page--pc` 스코프에서 한다.
 * 이 컴포넌트 안에서 모바일 분기 (`useIsMobile` 등) 를 호출하지 않는다.
 */
export default function CustomerGaExcelPagePC() {
  const { customerId: customerIdParam } = useParams()
  const customerId = Number(customerIdParam)
  const { loading, error, info, headers, colIds, sortedRows, sortIdx, sortAsc, onHeaderClick, reload } =
    useGaCustomerExcelData(customerId)

  const emptyMappingMessage = `${MSG_GA_EXCEL_NO_MAPPED_DATA} ${MSG_GA_EXCEL_UPLOAD_HINT}`
  const showTable = !loading && !error && sortedRows.length > 0 && colIds.length > 0
  const showBrokenColumns = !loading && !error && sortedRows.length > 0 && colIds.length === 0

  return (
    <main className="page customer-ga-excel-page customer-ga-excel-page--pc p-3">
      <div className="customer-ga-excel-page__headline-row customer-ga-excel-page__headline-row--pc">
        <h2 className="customer-ga-excel-page__headline-title text-lg font-semibold text-[var(--text-primary)]">
          GA 고객 데이터
        </h2>
        <div className="customer-ga-excel-page__aliases-slot customer-ga-excel-page__aliases-slot--pc">
          <GaCustomerMatchAliasesCard
            customerId={customerId}
            layout="pc"
            onSaved={() => void reload()}
          />
        </div>
      </div>
      <div className="customer-ga-excel-page__hints text-sm text-[var(--text-secondary)] mb-3 space-y-1">
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
      ) : showTable ? (
        <div className="ga-table-scroll overflow-x-auto border border-[var(--border-default)] rounded-md">
          <table className="admin-data-table" style={{ minWidth: 400 }}>
            <thead>
              <tr>
                {headers.map((h, idx) => (
                  <th key={colIds[idx] ?? String(idx)}>
                    <FormButton
                      htmlType="button"
                      variant="action"
                      className="text-left underline-offset-2 hover:underline text-sm font-semibold !justify-start"
                      onClick={() => onHeaderClick(idx)}
                    >
                      {h}
                      {sortIdx === idx ? (sortAsc ? ' ▲' : ' ▼') : ''}
                    </FormButton>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.rowIndex}>
                  {colIds.map((cid) => (
                    <td key={cid}>{formatGaCellDisplay(r.cells[cid])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  )
}
