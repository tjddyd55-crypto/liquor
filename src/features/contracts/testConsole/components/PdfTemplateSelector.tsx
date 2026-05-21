import { FormInput } from '../../../../components/form'
import { useMediaQuery } from '../../../../hooks/useMediaQuery'
import type { PdfTemplateSummary } from '../../../pdf-engine/types'

export type PdfPickRow = PdfTemplateSummary & {
  fieldCount: number
  signatureCount: number
  loadingDetail: boolean
}

const ADMIN_CONTRACT_MOBILE_MQ = '(max-width: 768px)'

type Props = {
  rows: PdfPickRow[]
  selectedId: number | null
  onSelect: (id: number) => void
  disabled?: boolean
  /** SUPER_ADMIN 등 PDF 좌표 편집기 진입 링크 (없으면 열 숨김) */
  resolveCoordinateEditorHref?: (pdfTemplateId: number) => string | null
}

export function PdfTemplateSelector({
  rows,
  selectedId,
  onSelect,
  disabled,
  resolveCoordinateEditorHref,
}: Props) {
  const isMobile = useMediaQuery(ADMIN_CONTRACT_MOBILE_MQ)
  const showCoordCol = typeof resolveCoordinateEditorHref === 'function'

  if (isMobile) {
    return (
      <div className="contract-signature-console__pdf-pick-cards">
        {rows.map((r) => {
          const selected = selectedId === r.id
          const noFields = !r.loadingDetail && r.fieldCount < 1
          const noSig = !r.loadingDetail && r.signatureCount < 1
          const href = resolveCoordinateEditorHref?.(r.id) ?? null
          const updated = r.updatedAt?.slice(0, 19).replace('T', ' ') ?? '—'
          return (
            <label
              key={r.id}
              className={
                'contract-signature-console__pdf-pick-card' +
                (selected ? ' contract-signature-console__pdf-pick-card--selected' : '')
              }
            >
              <div className="contract-signature-console__pdf-pick-card-head">
                <FormInput
                  type="radio"
                  name="pdf-pick-mobile"
                  checked={selected}
                  value={String(r.id)}
                  disabled={disabled}
                  onChange={() => onSelect(r.id)}
                />
                <span className="contract-signature-console__pdf-pick-card-title">{r.title}</span>
              </div>
              <div className="contract-signature-console__pdf-pick-badges">
                {noFields ? (
                  <span className="contract-signature-console__pdf-pick-badge contract-signature-console__pdf-pick-badge--warn">
                    좌표 필드 없음
                  </span>
                ) : null}
                {noSig ? (
                  <span className="contract-signature-console__pdf-pick-badge contract-signature-console__pdf-pick-badge--warn">
                    signature 없음
                  </span>
                ) : null}
                {r.isActive ? (
                  <span className="contract-signature-console__pdf-pick-badge">활성</span>
                ) : (
                  <span className="contract-signature-console__pdf-pick-badge">비활성</span>
                )}
              </div>
              <dl className="contract-signature-console__pdf-pick-kv">
                <div>
                  <dt>PDF ID</dt>
                  <dd>{r.id}</dd>
                </div>
                <div>
                  <dt>필드 수</dt>
                  <dd>{r.loadingDetail ? '…' : r.fieldCount}</dd>
                </div>
                <div>
                  <dt>서명 필드</dt>
                  <dd>{r.loadingDetail ? '…' : r.signatureCount}</dd>
                </div>
                <div>
                  <dt>수정일</dt>
                  <dd>{updated}</dd>
                </div>
              </dl>
              {noSig ? (
                <p className="contract-signature-console__pdf-pick-card-warn">
                  signature 필드 없음 — 손사인 단계 테스트가 제한될 수 있습니다.
                </p>
              ) : null}
              {noFields ? (
                <p className="contract-signature-console__pdf-pick-card-warn">
                  좌표 필드 없음 — active 전환·발송에 제약될 수 있습니다.
                </p>
              ) : null}
              {showCoordCol && href ? (
                <a
                  href={href}
                  className="contract-signature-console__pdf-pick-card-action"
                  onClick={(e) => e.stopPropagation()}
                >
                  좌표 편집 열기
                </a>
              ) : null}
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="contract-signature-console__scroll-x">
      <table className="pdf-engine-table contract-signature-console__table--compact contract-signature-console__pick-table">
        <thead>
          <tr>
            <th>선택</th>
            <th>템플릿명</th>
            <th>PDF ID</th>
            <th>필드 수</th>
            <th>서명 필드</th>
            <th>활성</th>
            <th>수정일</th>
            {showCoordCol ? <th>좌표 편집</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const noFields = !r.loadingDetail && r.fieldCount < 1
            const noSig = !r.loadingDetail && r.signatureCount < 1
            const sel = selectedId === r.id
            return (
              <tr
                key={r.id}
                className={'contract-pick-row' + (sel ? ' contract-pick-row--selected' : '')}
              >
                <td>
                  <FormInput
                    type="radio"
                    name="pdf-pick"
                    checked={sel}
                    value={String(r.id)}
                    disabled={disabled}
                    onChange={() => onSelect(r.id)}
                  />
                </td>
                <td>
                  {r.title}
                  {noFields ? (
                    <div className="contract-signature-console__hint--warning">
                      좌표 필드 없음 — active 전환·발송에 제약될 수 있습니다.
                    </div>
                  ) : null}
                  {noSig ? (
                    <div className="contract-signature-console__hint--warning">
                      signature 필드 없음 — 손사인 단계 테스트가 제한될 수 있습니다.
                    </div>
                  ) : null}
                </td>
                <td>{r.id}</td>
                <td>{r.loadingDetail ? '…' : r.fieldCount}</td>
                <td>{r.loadingDetail ? '…' : r.signatureCount}</td>
                <td>{r.isActive ? '예' : '아니오'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.updatedAt?.slice(0, 19) ?? '—'}</td>
                {showCoordCol ? (
                  <td>
                    {(() => {
                      const href = resolveCoordinateEditorHref?.(r.id) ?? null
                      return href ? (
                        <a href={href} style={{ color: '#7dd3fc' }}>
                          열기
                        </a>
                      ) : (
                        '—'
                      )
                    })()}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
