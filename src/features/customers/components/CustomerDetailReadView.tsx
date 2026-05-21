import type { ReactNode } from 'react'
import type { CustomerRecord } from '../domain/types'
import { normalizeCustomerNotesBag } from '../domain/types'
import { getDDay, getDDayBadgeClass } from '../utils/dday'
import {
  CUSTOMER_MEDICAL_QUESTION_HINT,
  CUSTOMER_MEDICAL_QUESTION_TEXT,
  formatCustomerGenderReadLabel,
  formatCustomerPhoneUi,
  formatCustomerSsnUi,
} from '../utils/customerDisplayFormat'
import { CustomerCarsReadSection } from './CustomerCarsReadSection'
import { CustomerRelationsStrip } from './CustomerRelationsStrip'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import { governmentDetailSummaryRows, isGovernmentIndustryTemplate, buildGovernmentProgressMvp } from '../utils/governmentCustomerUi'
import { industryTemplateReadPreviewRows, industryTemplateReadPreviewRowsForFieldKeys } from '../utils/industryCustomerReadSummary'
import {
  buildGovernmentCustomerStatusSummary,
  buildGovernmentDetailStatusCardRows,
} from '../utils/governmentCustomerStatusSummary'
import GovernmentDetailStatusSummaryCard from './GovernmentDetailStatusSummaryCard'
import GovernmentProgressReadSection from './GovernmentProgressReadSection'

export type CustomerDetailInsuranceDisplay = {
  ageText: string
  dateText: string
  maturityYmd: string | null
  insuranceAgeNum: number | null
}

function MaturityDdayBadge({ maturityYmd }: { maturityYmd: string | null }) {
  if (!maturityYmd) {
    return null
  }
  const dday = getDDay(maturityYmd)
  if (dday === null) {
    return null
  }
  const hot = dday >= 0 && dday <= 30
  const label = `D-${dday}`
  const toneClass = hot ? getDDayBadgeClass(dday) : 'customer-dday'
  return <span className={`customer-detail-read__dday-inline ${toneClass}`}>({label})</span>
}

function DetailReadInfoRow({ children, rowClassName }: { children: ReactNode; rowClassName?: string }) {
  return (
    <div className={`customer-detail-read__info-row${rowClassName ? ` ${rowClassName}` : ''}`}>
      <span className="customer-detail-read__info-bullet" aria-hidden>
        •
      </span>
      <div className="customer-detail-read__info-main">{children}</div>
    </div>
  )
}

type CustomerDetailReadViewProps = {
  customer: CustomerRecord
  ins: CustomerDetailInsuranceDisplay
  token: string | null
  expandedId: number | null
  /** 펼친 읽기 모드에서만 customer_cars API 조회 */
  fetchCarsEnabled: boolean
  onOpenRelatedCustomer: (customerId: number, customerName?: string) => void
  crmIsInsuranceLayout: boolean
  crmIndustryTemplate: CustomerIndustryTemplate
}

export default function CustomerDetailReadView({
  customer: c,
  ins,
  token,
  expandedId,
  fetchCarsEnabled,
  onOpenRelatedCustomer,
  crmIsInsuranceLayout,
  crmIndustryTemplate,
}: CustomerDetailReadViewProps) {
  if (!crmIsInsuranceLayout) {
    const dynTabs = [...crmIndustryTemplate.detailTabs]
      .filter((t) => t.visibleDefault !== false)
      .filter((t) => Array.isArray(t.fieldKeys) && t.fieldKeys.length > 0)
      .sort((a, b) => a.order - b.order)

    const fallbackRows = industryTemplateReadPreviewRows(c, crmIndustryTemplate, 28)
    const govSummaryRows = isGovernmentIndustryTemplate(crmIndustryTemplate)
      ? governmentDetailSummaryRows(c, crmIndustryTemplate)
      : null
    const govProgressModel = isGovernmentIndustryTemplate(crmIndustryTemplate)
      ? buildGovernmentProgressMvp(c, crmIndustryTemplate)
      : null
    const govStatusSummary = isGovernmentIndustryTemplate(crmIndustryTemplate)
      ? buildGovernmentCustomerStatusSummary(c, crmIndustryTemplate)
      : null
    const govStatusCardRows =
      govStatusSummary != null ? buildGovernmentDetailStatusCardRows(c, crmIndustryTemplate, govStatusSummary) : []

    return (
      <div className="customer-detail-read">
        {govStatusSummary != null ? (
          <GovernmentDetailStatusSummaryCard summary={govStatusSummary} rows={govStatusCardRows} />
        ) : null}
        {govSummaryRows != null && govSummaryRows.length > 0 ? (
          <section className="customer-detail-read__section" aria-labelledby="gov-ops-summary-heading">
            <div className="customer-detail-read__section-header">
              <h4 id="gov-ops-summary-heading" className="customer-detail-read__section-title">
                지원·접수 현황
              </h4>
            </div>
            <div className="customer-detail-read__section-body">
              <div className="customer-detail-read__info-list">
                {govSummaryRows.map((r) => (
                  <DetailReadInfoRow key={`gov-ops-${r.canonicalKey}`}>
                    <span className="customer-detail-read__info-label">{r.label}:</span>{' '}
                    <span className="customer-detail-read__info-value">{r.value}</span>
                  </DetailReadInfoRow>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        {govProgressModel ? <GovernmentProgressReadSection model={govProgressModel} /> : null}
        {dynTabs.length > 0
          ? dynTabs.map((tab) => {
              const rows = industryTemplateReadPreviewRowsForFieldKeys(
                c,
                crmIndustryTemplate,
                tab.fieldKeys ?? [],
                48,
              )
              return (
                <section key={tab.tabId} className="customer-detail-read__section" aria-labelledby={`tab-${tab.tabId}`}>
                  <div className="customer-detail-read__section-header">
                    <h4 id={`tab-${tab.tabId}`} className="customer-detail-read__section-title">
                      {tab.label}
                    </h4>
                  </div>
                  <div className="customer-detail-read__section-body">
                    {rows.length === 0 ? (
                      <p className="customer-detail-read__api-warn" style={{ margin: 0 }}>
                        이 탭에 표시할 저장 값이 없습니다.
                      </p>
                    ) : (
                      <div className="customer-detail-read__info-list">
                        {rows.map((r) => (
                          <DetailReadInfoRow key={`${tab.tabId}-${r.canonicalKey}`}>
                            <span className="customer-detail-read__info-label">{r.label}:</span>{' '}
                            <span className="customer-detail-read__info-value">{r.value}</span>
                          </DetailReadInfoRow>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )
            })
          : (
              <section className="customer-detail-read__section" aria-labelledby="crm-industry-read-heading">
                <div className="customer-detail-read__section-header">
                  <h4 id="crm-industry-read-heading" className="customer-detail-read__section-title">
                    업종 CRM 저장값 ({crmIndustryTemplate.meta.industryCode})
                  </h4>
                </div>
                <div className="customer-detail-read__section-body">
                  {fallbackRows.length === 0 ? (
                    <p className="customer-detail-read__api-warn" style={{ margin: 0 }}>
                      표시할 저장 필드 값이 없습니다.
                    </p>
                  ) : (
                    <div className="customer-detail-read__info-list">
                      {fallbackRows.map((r) => (
                        <DetailReadInfoRow key={r.canonicalKey}>
                          <span className="customer-detail-read__info-label">{r.label}:</span>{' '}
                          <span className="customer-detail-read__info-value">{r.value}</span>
                        </DetailReadInfoRow>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
        {token?.trim() ? (
          <CustomerRelationsStrip
            customerId={c.id}
            customerName={c.name}
            token={token}
            focusedCustomerId={expandedId}
            onOpenCustomer={onOpenRelatedCustomer}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="customer-detail-read">
      <div className="customer-detail-read__info-list">
        <DetailReadInfoRow>
          <div className="customer-detail-read__ssn-gender-cluster">
            <span className="customer-detail-read__ssn-gender-cluster__ssn">
              <span className="customer-detail-read__info-label">주민번호:</span>{' '}
              <span className="customer-detail-read__info-value">{formatCustomerSsnUi(c.ssn) || '—'}</span>
            </span>
            <span className="customer-detail-read__ssn-gender-cluster__gender">
              <span className="customer-detail-read__info-label">성별:</span>{' '}
              <span className="customer-detail-read__info-value">
                {formatCustomerGenderReadLabel(c.gender, c.ssn)}
              </span>
            </span>
          </div>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <div className="customer-detail-read__info-main--cluster">
            <span>
              <span className="customer-detail-read__info-label">보험나이:</span>{' '}
              <span className="customer-detail-read__info-value">{ins.ageText}</span>
            </span>
            <span>
              <span className="customer-detail-read__info-label">상령일:</span>{' '}
              <span className="customer-detail-read__info-value">{ins.dateText}</span>
              <MaturityDdayBadge maturityYmd={ins.maturityYmd} />
            </span>
          </div>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">핸드폰번호:</span>{' '}
          <span className="customer-detail-read__info-value">{formatCustomerPhoneUi(c.phone) || '—'}</span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">주소:</span>{' '}
          <span className="customer-detail-read__info-value">{c.address || '—'}</span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">키/몸무게:</span>{' '}
          <span className="customer-detail-read__info-value">
            {c.height?.trim() || c.weight?.trim()
              ? `${c.height?.trim() || '—'}/${c.weight?.trim() || '—'}`
              : '—'}
          </span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">직업/회사명/하는일/지역:</span>{' '}
          <span className="customer-detail-read__info-value">{c.job?.trim() || '—'}</span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">운전여부:</span>{' '}
          <span className="customer-detail-read__info-value">
            {c.isDriver === true
              ? '운전함'
              : c.isDriver === false
                ? '운전 안함'
                : c.driving || '—'}
          </span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <span className="customer-detail-read__info-label">차종:</span>{' '}
          <span className="customer-detail-read__info-value">{c.carType.trim() || '—'}</span>
        </DetailReadInfoRow>
        <DetailReadInfoRow>
          <div>
            <span className="customer-detail-read__info-label">{CUSTOMER_MEDICAL_QUESTION_TEXT}</span>
            <p className="customer-detail-read__info-hint">{CUSTOMER_MEDICAL_QUESTION_HINT}</p>
            <p className="customer-detail-read__info-answer">{c.medical?.trim() || '—'}</p>
          </div>
        </DetailReadInfoRow>
      </div>
      <hr className="customer-detail-read__divider" />
      <CustomerCarsReadSection customer={c} token={token} enabled={fetchCarsEnabled} />
      <hr className="customer-detail-read__divider" />
      <section className="customer-detail-read__section" aria-labelledby="customer-insurance-history-heading">
        <div className="customer-detail-read__section-header">
          <h4 id="customer-insurance-history-heading" className="customer-detail-read__section-title">
            보험가입내역
          </h4>
        </div>
        <div className="customer-detail-read__section-body customer-insurance-history-body">
          {normalizeCustomerNotesBag(c.notes).insuranceHistory?.trim()
            ? normalizeCustomerNotesBag(c.notes).insuranceHistory
            : '내용 없음'}
        </div>
      </section>
      {token?.trim() ? (
        <CustomerRelationsStrip
          customerId={c.id}
          customerName={c.name}
          token={token}
          focusedCustomerId={expandedId}
          onOpenCustomer={onOpenRelatedCustomer}
        />
      ) : null}
    </div>
  )
}
