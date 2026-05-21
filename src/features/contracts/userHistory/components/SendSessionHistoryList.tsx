import { FormButton } from '../../../../components/form'
import type { SendSessionHistoryListItem } from '../contractSignatureHistoryClient'
import { SendSessionStatusBadge } from './SendSessionStatusBadge'
import { ContractTableDateCell, ContractTableHashCell } from './ContractTableCells'

type Props = {
  rows: SendSessionHistoryListItem[]
  busy: boolean
  onDetail: (row: SendSessionHistoryListItem) => void
  onCopyLink: (row: SendSessionHistoryListItem) => void
  onOpenLink: (row: SendSessionHistoryListItem) => void
  onCancel: (row: SendSessionHistoryListItem) => void
  /** 모바일(768px 이하)에서 테이블 대신 카드 */
  listLayout?: 'table' | 'cards'
}

export function SendSessionHistoryList({
  rows,
  busy,
  onDetail,
  onCopyLink,
  onOpenLink,
  onCancel,
  listLayout = 'table',
}: Props) {
  if (listLayout === 'cards') {
    if (rows.length === 0 && !busy) {
      return <p className="contract-signature-console__empty-state-text">표시할 발송 내역이 없습니다.</p>
    }
    if (rows.length === 0 && busy) {
      return <p className="contract-signature-console__hint">불러오는 중…</p>
    }
    return (
      <div className="contract-history-mobile-cards">
        {rows.map((row) => {
          const tpl = row.templateNames.length > 0 ? row.templateNames.join(', ') : '—'
          const req = Math.max(0, row.requiredDocumentCount)
          const done = Math.max(0, row.completedDocumentCount)
          const denom = Math.max(req, row.documentCount)
          const progress = denom <= 0 ? '—' : `${done}/${denom} ${done >= denom ? '완료' : '진행'}`
          return (
            <div key={row.id} className="contract-history-mobile-card">
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">고객</span>
                <span>
                  {row.customerName || '—'}
                  {row.customerCode ? (
                    <span className="contract-signature-console__hint"> ({row.customerCode})</span>
                  ) : null}
                </span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">연락처</span>
                <span>{row.maskedPhone || '—'}</span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">문서</span>
                <span>{tpl}</span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">상태</span>
                <span>
                  <SendSessionStatusBadge
                    sessionStatus={row.status}
                    hasSignedNotCompleted={row.hasSignedNotCompleted}
                  />
                </span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">진행</span>
                <span>{progress}</span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">발송일</span>
                <span>
                  <ContractTableDateCell iso={row.sentAt ?? row.createdAt} />
                </span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">완료일</span>
                <span>
                  <ContractTableDateCell iso={row.completedAt} />
                </span>
              </div>
              <div className="contract-history-mobile-card__row">
                <span className="contract-history-mobile-card__label">증빙</span>
                <span>
                  <ContractTableHashCell prefix={row.evidenceHashPrefix} />
                </span>
              </div>
              <div className="contract-history-mobile-card__actions">
                <FormButton htmlType="button" variant="primary" size="sm" onClick={() => onDetail(row)}>
                  상세
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="secondary"
                  size="sm"
                  disabled={!row.canCopyLink}
                  onClick={() => onCopyLink(row)}
                >
                  링크 복사
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="secondary"
                  size="sm"
                  disabled={!row.canOpenLink}
                  onClick={() => onOpenLink(row)}
                >
                  링크 열기
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="secondary"
                  size="sm"
                  disabled={!row.canCancel || busy}
                  className="contract-history-mobile-card__actions--full"
                  onClick={() => onCancel(row)}
                >
                  취소
                </FormButton>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (rows.length === 0 && !busy) {
    return <p className="contract-signature-console__empty-state-text">표시할 발송 내역이 없습니다.</p>
  }

  return (
    <div className="contract-signature-console__scroll-x">
      <table className="contract-history-table contract-signature-console__table--striped">
        <colgroup>
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '23%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="contract-table-cell-left">고객</th>
            <th className="contract-table-cell-left">연락처</th>
            <th className="contract-table-cell-left">문서</th>
            <th className="contract-table-cell-center">상태</th>
            <th className="contract-table-cell-center">진행</th>
            <th className="contract-table-cell-center">발송일</th>
            <th className="contract-table-cell-center">완료일</th>
            <th className="contract-table-cell-center">증빙</th>
            <th className="contract-table-cell-center">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tpl = row.templateNames.length > 0 ? row.templateNames.join(', ') : ''
            const req = Math.max(0, row.requiredDocumentCount)
            const done = Math.max(0, row.completedDocumentCount)
            const evidencePrefix =
              row.evidenceHashPrefix && String(row.evidenceHashPrefix).trim() !== ''
                ? row.evidenceHashPrefix
                : null
            return (
              <tr key={row.id}>
                <td className="contract-table-cell-left">
                  <div className="contract-table-customer">{row.customerName || '—'}</div>
                  {row.customerCode ? (
                    <div className="contract-signature-console__hint contract-signature-console__hint--flush">
                      {row.customerCode}
                    </div>
                  ) : null}
                </td>
                <td className="contract-table-cell-left">
                  <div className="contract-table-phone">{row.maskedPhone || '—'}</div>
                </td>
                <td className="contract-table-cell-left">
                  {tpl ? (
                    <div className="contract-table-document" title={tpl}>
                      {tpl}
                    </div>
                  ) : (
                    <span className="contract-table-empty">—</span>
                  )}
                </td>
                <td className="contract-table-cell-center">
                  <div className="contract-table-cell-stack contract-table-cell-stack--center">
                    <SendSessionStatusBadge
                      sessionStatus={row.status}
                      hasSignedNotCompleted={row.hasSignedNotCompleted}
                    />
                  </div>
                </td>
                <td className="contract-table-cell-center">
                  {(() => {
                    const denom = Math.max(req, row.documentCount)
                    if (denom <= 0) {
                      return <span className="contract-table-empty">—</span>
                    }
                    return (
                      <div className="contract-table-progress">
                        <span>
                          {done}/{denom}
                        </span>
                        <span>{done >= denom ? '완료' : '진행'}</span>
                      </div>
                    )
                  })()}
                </td>
                <td className="contract-table-cell-center">
                  <ContractTableDateCell iso={row.sentAt ?? row.createdAt} />
                </td>
                <td className="contract-table-cell-center">
                  <ContractTableDateCell iso={row.completedAt} />
                </td>
                <td className="contract-table-cell-center">
                  <ContractTableHashCell prefix={evidencePrefix} />
                </td>
                <td className="contract-table-cell-center">
                  <div className="history-actions">
                    <FormButton htmlType="button" variant="primary" size="sm" onClick={() => onDetail(row)}>
                      상세
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      disabled={!row.canCopyLink}
                      onClick={() => onCopyLink(row)}
                    >
                      링크 복사
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      disabled={!row.canOpenLink}
                      onClick={() => onOpenLink(row)}
                    >
                      링크 열기
                    </FormButton>
                    <div className="history-actions__cancel">
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        size="sm"
                        disabled={!row.canCancel || busy}
                        onClick={() => onCancel(row)}
                      >
                        취소
                      </FormButton>
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
