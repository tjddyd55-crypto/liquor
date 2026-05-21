import { FormButton } from '../../../components/form'
import { asTrimmedText, cleanPhone, formatPhone } from '../../contacts/utils/phone'
import type { CompanyDirectoryEntry, CompanyHistorySnapshot } from '../domain/types'
import { copyToClipboard } from '../utils/clipboard'

function isFieldChanged(beforeVal: string | undefined | null, afterVal: string | undefined | null): boolean {
  return (beforeVal ?? '') !== (afterVal ?? '')
}

function telHref(raw: string): string {
  const d = cleanPhone(raw)
  return d ? `tel:${d}` : '#'
}

function copy(text: string) {
  copyToClipboard(text)
}

function renderPositionLabel(position: string | undefined | null) {
  const text = asTrimmedText(position)
  if (!text) {
    return '—'
  }
  if (text === '설계매니저') {
    return (
      <>
        설계
        <br />
        매니저
      </>
    )
  }
  return text
}

type ContactLine = { name: string; position: string; phone: string }

function contactSortKey(c: ContactLine): string {
  return `${c.position}\t${c.name}\t${c.phone}`
}

function pairContacts(beforeContacts: ContactLine[], afterContacts: ContactLine[]) {
  const B = [...beforeContacts].sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b), 'ko'))
  const A = [...afterContacts].sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b), 'ko'))
  const len = Math.max(B.length, A.length)
  const pairs: Array<{ before: ContactLine; after: ContactLine }> = []
  for (let i = 0; i < len; i++) {
    pairs.push({
      before: B[i] ?? { position: '', name: '', phone: '' },
      after: A[i] ?? { position: '', name: '', phone: '' },
    })
  }
  return pairs
}

export type CompanyCardProps =
  | {
      variant: 'directory'
      entry: CompanyDirectoryEntry
      showEditButton?: boolean
      onEdit?: (entry: CompanyDirectoryEntry) => void
    }
  | {
      variant: 'history'
      companyName: string
      before: CompanyHistorySnapshot
      after: CompanyHistorySnapshot
    }

export function CompanyCard(props: CompanyCardProps) {
  if (props.variant === 'directory') {
    const c = props.entry
    const customerCenter = asTrimmedText(c.customerCenter)
    const systemPhone = asTrimmedText(c.systemPhone)
    const incallNumber = asTrimmedText(c.incallNumber)
    const visitInfo = asTrimmedText(c.visitInfo)

    return (
      <article className="company-card">
        <div className="company-card__header">
          <h3 className="company-card__title">{c.name}</h3>
          {props.showEditButton && props.onEdit ? (
            <FormButton
              htmlType="button"
              className="button button--small company-card__edit"
              onClick={() => props.onEdit?.(c)}
            >
              수정
            </FormButton>
          ) : null}
        </div>

        <div className="company-info-block">
          <div className="info-row">
            <span className="label">고객센터</span>
            <span className="value">{customerCenter ? formatPhone(customerCenter) : '—'}</span>
            <div className="info-row-actions">
              {customerCenter ? (
                <div className="actions-mini">
                  <a href={telHref(customerCenter)} aria-label="고객센터 전화">
                    📞
                  </a>
                  <FormButton htmlType="button" onClick={() => copy(customerCenter)} aria-label="고객센터 번호 복사">
                    📋
                  </FormButton>
                </div>
              ) : null}
            </div>
          </div>

          <div className="info-row">
            <span className="label">전산문의</span>
            <span className="value">{systemPhone ? formatPhone(systemPhone) : '—'}</span>
            <div className="info-row-actions">
              {systemPhone ? (
                <div className="actions-mini">
                  <a href={telHref(systemPhone)} aria-label="전산문의 전화">
                    📞
                  </a>
                  <FormButton htmlType="button" onClick={() => copy(systemPhone)} aria-label="전산문의 번호 복사">
                    📋
                  </FormButton>
                </div>
              ) : null}
            </div>
          </div>

          <div className="info-row">
            <span className="label">인콜</span>
            <span className="value">{incallNumber ? formatPhone(incallNumber) : '—'}</span>
            <div className="info-row-actions">
              {incallNumber ? (
                <div className="actions-mini">
                  <a href={telHref(incallNumber)} aria-label="인콜 전화">
                    📞
                  </a>
                  <FormButton htmlType="button" onClick={() => copy(incallNumber)} aria-label="인콜 번호 복사">
                    📋
                  </FormButton>
                </div>
              ) : null}
            </div>
          </div>

          {visitInfo ? (
            <div className="info-row">
              <span className="label">방문일</span>
              <span className="value">{visitInfo}</span>
              <div className="info-row-actions" aria-hidden="true" />
            </div>
          ) : null}
        </div>

        {c.contacts?.length ? (
          <div className="company-contacts-block">
            {c.contacts.map((p, idx) => {
              const name = asTrimmedText(p.name)
              const position = asTrimmedText(p.position)
              const phoneRaw = asTrimmedText(p.phone)

              return (
                <div key={p.id != null ? p.id : `new-${c.id}-${idx}`} className="contact-row">
                  <div className="position">{renderPositionLabel(position)}</div>
                  <div className="name">{name || '—'}</div>
                  <div className={phoneRaw ? 'phone' : 'phone phone--empty'}>
                    {phoneRaw ? formatPhone(phoneRaw) : '—'}
                  </div>
                  <div className="actions actions-mini">
                    {phoneRaw ? (
                      <a href={telHref(phoneRaw)} aria-label={`${formatPhone(phoneRaw)} 전화`}>
                        📞
                      </a>
                    ) : null}
                    {phoneRaw ? (
                      <FormButton htmlType="button" onClick={() => copy(phoneRaw)} aria-label="담당자 번호 복사">
                        📋
                      </FormButton>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="contact-card--empty">
            <div className="empty-box contact-card--empty-msg" role="status">
              📭 등록된 담당자가 없습니다
              <br />
              담당자에게 등록 요청하세요
            </div>
          </div>
        )}
      </article>
    )
  }

  const { companyName, before, after } = props
  const customerCenter = asTrimmedText(after.customerCenter)
  const systemPhone = asTrimmedText(after.system)
  const incallNumber = asTrimmedText(after.incall)
  const visitInfo = asTrimmedText(after.visitInfo)
  const contactPairs = pairContacts(before.contacts ?? [], after.contacts ?? [])

  return (
    <article className="company-card">
      <div className="company-card__header">
        <h3 className="company-card__title">{companyName}</h3>
      </div>

      <div className="company-info-block">
        <div className="info-row">
          <span className="label">고객센터</span>
          <span className={`value${isFieldChanged(before.customerCenter, after.customerCenter) ? ' changed' : ''}`}>
            {customerCenter ? formatPhone(customerCenter) : '—'}
          </span>
          <div className="info-row-actions">
            {customerCenter ? (
              <div className="actions-mini">
                <a href={telHref(customerCenter)} aria-label="고객센터 전화">
                  📞
                </a>
                <FormButton htmlType="button" onClick={() => copy(customerCenter)} aria-label="고객센터 번호 복사">
                  📋
                </FormButton>
              </div>
            ) : null}
          </div>
        </div>

        <div className="info-row">
          <span className="label">전산문의</span>
          <span className={`value${isFieldChanged(before.system, after.system) ? ' changed' : ''}`}>
            {systemPhone ? formatPhone(systemPhone) : '—'}
          </span>
          <div className="info-row-actions">
            {systemPhone ? (
              <div className="actions-mini">
                <a href={telHref(systemPhone)} aria-label="전산문의 전화">
                  📞
                </a>
                <FormButton htmlType="button" onClick={() => copy(systemPhone)} aria-label="전산문의 번호 복사">
                  📋
                </FormButton>
              </div>
            ) : null}
          </div>
        </div>

        <div className="info-row">
          <span className="label">인콜</span>
          <span className={`value${isFieldChanged(before.incall, after.incall) ? ' changed' : ''}`}>
            {incallNumber ? formatPhone(incallNumber) : '—'}
          </span>
          <div className="info-row-actions">
            {incallNumber ? (
              <div className="actions-mini">
                <a href={telHref(incallNumber)} aria-label="인콜 전화">
                  📞
                </a>
                <FormButton htmlType="button" onClick={() => copy(incallNumber)} aria-label="인콜 번호 복사">
                  📋
                </FormButton>
              </div>
            ) : null}
          </div>
        </div>

        {visitInfo || asTrimmedText(before.visitInfo) ? (
          <div className="info-row">
            <span className="label">방문일</span>
            <span className={`value${isFieldChanged(before.visitInfo, after.visitInfo) ? ' changed' : ''}`}>
              {visitInfo || '—'}
            </span>
            <div className="info-row-actions" aria-hidden="true" />
          </div>
        ) : null}
      </div>

      {contactPairs.length ? (
        <div className="company-contacts-block">
          {contactPairs.map((pair, idx) => {
            const b = pair.before
            const a = pair.after
            const hasAfter = Boolean(a.position || a.name || a.phone)
            const hasBefore = Boolean(b.position || b.name || b.phone)
            if (!hasAfter && !hasBefore) {
              return null
            }
            const position = hasAfter ? a.position : b.position
            const name = hasAfter ? a.name : b.name
            const phoneRaw = hasAfter ? a.phone : b.phone
            const posCh = isFieldChanged(b.position, a.position)
            const nameCh = isFieldChanged(b.name, a.name)
            const phoneCh = isFieldChanged(b.phone, a.phone)
            const rowKey = `hist-${idx}-${position}-${name}-${phoneRaw}`

            return (
              <div key={rowKey} className="contact-row">
                <div className={`position${posCh ? ' changed' : ''}`}>{renderPositionLabel(position)}</div>
                <div className={`name${nameCh ? ' changed' : ''}`}>{asTrimmedText(name) || '—'}</div>
                <div className={`phone${asTrimmedText(phoneRaw) ? '' : ' phone--empty'}${phoneCh ? ' changed' : ''}`}>
                  {asTrimmedText(phoneRaw) ? formatPhone(phoneRaw) : '—'}
                </div>
                <div className="actions actions-mini">
                  {asTrimmedText(phoneRaw) ? (
                    <a href={telHref(phoneRaw)} aria-label={`${formatPhone(phoneRaw)} 전화`}>
                      📞
                    </a>
                  ) : null}
                  {asTrimmedText(phoneRaw) ? (
                    <FormButton htmlType="button" onClick={() => copy(phoneRaw)} aria-label="담당자 번호 복사">
                      📋
                    </FormButton>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="contact-card--empty">
          <div className="empty-box contact-card--empty-msg" role="status">
            📭 등록된 담당자가 없습니다
            <br />
            담당자에게 등록 요청하세요
          </div>
        </div>
      )}
    </article>
  )
}
