import type { CustomerIndustryTemplate } from '../customerTemplate.types'
import { CUSTOMER_FIELD_REGISTRY_BY_KEY } from './customerFieldRegistry'
import { FEATURE_MODULE_REGISTRY_BY_ID } from './featureModuleRegistry'
import { LIST_COLUMN_REGISTRY_BY_KEY } from './listColumnRegistry'

/**
 * insuranceCustomerTemplate 등 레거시 숏키 → canonical fieldKey.
 * `ssn` 은 보험 레거시(`insurance.ssn`)용 — 국가지원 템플릿은 `customer.ssn` canonical 사용.
 * 템플릿을 canonical 로 일괄 치환하기 전까지 이 맵이 단일 해석 경로다.
 */
export const CUSTOMER_FIELD_KEY_ALIAS_TO_CANONICAL: Readonly<
  Record<string, string>
> = Object.freeze({
  name: 'customer.name',
  phone: 'customer.phone',
  email: 'customer.email',
  address: 'customer.address',
  birthDate: 'customer.birthDate',
  memo: 'customer.memo',
  status: 'customer.status',
  assigneeUserId: 'customer.assigneeUserId',
  tags: 'customer.tags',
  createdAt: 'customer.createdAt',
  ssn: 'insurance.ssn',
  insuranceAge: 'insurance.insuranceAge',
  nextAgeDate: 'insurance.nextAgeDate',
  gender: 'customer.gender',
  job: 'customer.job',
  height: 'customer.height',
  weight: 'customer.weight',
  medical: 'insurance.medical',
  /** 템플릿 위젯 키 `driving` → registry canonical `insurance.drivingText` */
  driving: 'insurance.drivingText',
  isDriver: 'insurance.isDriver',
  carType: 'vehicle.carType',
  carNumber: 'vehicle.carNumber',
  carModel: 'vehicle.carModel',
  carYear: 'vehicle.carYear',
  renewalDate: 'insurance.renewalDate',
  isFavorite: 'customer.isFavorite',
  customerCode: 'customer.customerCode',
  carrier: 'customer.carrier',
  homeType: 'customer.homeType',
  deposit: 'customer.deposit',
  monthlyRent: 'customer.monthlyRent',
  creditScoreKcb: 'customer.creditScoreKcb',
  creditScoreNice: 'customer.creditScoreNice',
  // 국가지원·사업장 (canonical 직접 사용 권장)
  businessName: 'business.name',
  ownerName: 'business.ownerName',
  openedAt: 'business.openedAt',
  businessNumber: 'business.registrationNumber',
  businessAddress: 'business.address',
  businessCategory: 'business.category',
  businessType: 'business.type',
  placeType: 'business.placeType',
  businessPhone: 'business.phone',
  productName: 'gov.productName',
  applicationType: 'gov.applicationType',
  caseNumber: 'gov.caseNumber',
  programName: 'gov.programName',
  agency: 'gov.agency',
  department: 'gov.department',
  govStatus: 'gov.status',
  submittedAt: 'gov.submittedAt',
  dueDate: 'gov.dueDate',
  supportAmount: 'gov.supportAmount',
  approvalAmount: 'gov.approvalAmount',
  result: 'gov.result',
  supportProgram: 'gov.supportProgram',
  documentStatus: 'gov.documentStatus',
  applicationStatus: 'gov.applicationStatus',
  existingLoans: 'loan.existingLoans',
  totalFee: 'contract.totalFee',
  depositAmount: 'contract.depositAmount',
  balanceAmount: 'contract.balanceAmount',
  paymentStatus: 'contract.paymentStatus',
  paymentDueDate: 'contract.paymentDueDate',
  certificateDelegated: 'contract.certificateDelegated',
  certificateType: 'contract.certificateType',
  contractStatus: 'contract.status',
  paymentMemo: 'contract.paymentMemo',
  signatureStatus: 'document.signatureStatus',
  lastSentAt: 'document.lastSentAt',
  lastCompletedAt: 'document.lastCompletedAt',
  hasLegalEvidence: 'document.hasLegalEvidence',
  source: 'management.source',
  priority: 'management.priority',
  ownerUserId: 'management.ownerUserId',
  lastConsultDate: 'management.lastConsultDate',
  memoSummary: 'management.memoSummary',
  /**
   * gym 폼 호환키 → canonical registry fieldKey.
   * `gym.fitnessGoal` 템플릿 키는 유지하고, 검증 단계에서만 `gym.workoutGoal` 로 해석한다.
   * Form Renderer·persist 경로가 붙을 때는 별명을 그대로 쓸지, 저장 키를 canonical 로 통일할지 정책을 재검토할 것.
   */
  'gym.fitnessGoal': 'gym.workoutGoal',
})

export function resolveCanonicalFieldKey(fieldKey: string): string {
  if (CUSTOMER_FIELD_REGISTRY_BY_KEY[fieldKey]) return fieldKey
  const viaAlias = CUSTOMER_FIELD_KEY_ALIAS_TO_CANONICAL[fieldKey]
  return viaAlias ?? fieldKey
}

export function getCustomerFieldDefinition(fieldKey: string) {
  const canonical = resolveCanonicalFieldKey(fieldKey)
  return CUSTOMER_FIELD_REGISTRY_BY_KEY[canonical] ?? null
}

export function getFeatureModuleDefinition(featureId: string) {
  return FEATURE_MODULE_REGISTRY_BY_ID[featureId] ?? null
}

export function getListColumnDefinition(columnKey: string) {
  return LIST_COLUMN_REGISTRY_BY_KEY[columnKey] ?? null
}

export interface CustomerTemplateRegistryValidationResult {
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

/**
 * 템플릿에 선언된 fieldKey / featureBinding / listColumns 가 정적 레지스트리와 정합한지 검사한다.
 * — throw 하지 않고 결과 객체만 반환한다.
 */
export function validateCustomerTemplateAgainstRegistries(
  template: CustomerIndustryTemplate,
): CustomerTemplateRegistryValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const checkFeatureBinding = (featureId: string, context: string) => {
    const mod = FEATURE_MODULE_REGISTRY_BY_ID[featureId]
    if (!mod) {
      errors.push(`Unknown ${context} featureId "${featureId}".`)
      return
    }
    if (mod.status === 'deprecated') {
      warnings.push(`${context}: feature "${featureId}" is deprecated in registry.`)
    }
    if (mod.status === 'preview') {
      warnings.push(`${context}: feature "${featureId}" is preview in registry.`)
    }
  }

  for (const ff of template.formFields) {
    const canonical = resolveCanonicalFieldKey(ff.fieldKey)
    const def = CUSTOMER_FIELD_REGISTRY_BY_KEY[canonical]
    if (!def) {
      errors.push(
        `Unknown form fieldKey "${ff.fieldKey}" (resolved "${canonical}") — not in field registry or alias map.`,
      )
      continue
    }
    if (def.status === 'deprecated') {
      warnings.push(
        `Form field "${ff.fieldKey}" maps to deprecated registry field "${canonical}".`,
      )
    }
    if (def.status === 'preview') {
      warnings.push(
        `Form field "${ff.fieldKey}" maps to preview registry field "${canonical}".`,
      )
    }
  }

  for (const tab of template.detailTabs) {
    checkFeatureBinding(tab.featureBinding, `detailTabs[${tab.tabId}]`)
  }

  for (const id of template.sharedFeatureBindings) {
    checkFeatureBinding(id, 'sharedFeatureBindings')
  }

  for (const id of template.extensionFeatureBindings) {
    checkFeatureBinding(id, 'extensionFeatureBindings')
  }

  template.listColumns.forEach((lc, idx) => {
    const ctx = `listColumns[${idx}]`
    const lcEntry = LIST_COLUMN_REGISTRY_BY_KEY[lc.columnKey]
    if (!lcEntry) {
      errors.push(`${ctx}.columnKey "${lc.columnKey}" — not in list column catalog.`)
      return
    }
    if (lcEntry.status === 'deprecated') {
      warnings.push(`${ctx}.columnKey "${lc.columnKey}": deprecated in list column catalog.`)
    }
    if (lcEntry.status === 'preview') {
      warnings.push(`${ctx}.columnKey "${lc.columnKey}": preview in list column catalog.`)
    }

    const src = lcEntry.sourceType
    if (src === 'field') {
      if (!lcEntry.sourceFieldKey) {
        errors.push(
          `${ctx}.columnKey "${lc.columnKey}": sourceType field requires catalog sourceFieldKey.`,
        )
        return
      }
      const fdef = getCustomerFieldDefinition(lcEntry.sourceFieldKey)
      if (!fdef) {
        errors.push(
          `${ctx}.columnKey "${lc.columnKey}": catalog sourceFieldKey "${lcEntry.sourceFieldKey}" not found in field registry (or alias).`,
        )
      }
      return
    }

    if (src === 'derived') {
      if (lcEntry.sourceFieldKey) {
        const fdef = getCustomerFieldDefinition(lcEntry.sourceFieldKey)
        if (!fdef) {
          errors.push(
            `${ctx}.columnKey "${lc.columnKey}": derived catalog sourceFieldKey "${lcEntry.sourceFieldKey}" not found in field registry (or alias).`,
          )
        }
      }
      return
    }

    if (src === 'aggregate' || src === 'feature') {
      if (!lcEntry.featureDependency) {
        errors.push(
          `${ctx}.columnKey "${lc.columnKey}": sourceType ${src} requires catalog featureDependency.`,
        )
        return
      }
      checkFeatureBinding(
        lcEntry.featureDependency,
        `${ctx}.columnKey(${lc.columnKey}).featureDependency`,
      )
    }
  })

  return { errors, warnings }
}
