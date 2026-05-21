import {
  CRM_TEMPLATE_CORE_STORAGE_KEYS,
  CRM_TEMPLATE_FIELD_KEY_REGEX,
  CRM_TEMPLATE_LIFECYCLE_STATUSES,
  CRM_TEMPLATE_TAB_ID_REGEX,
} from './crmTemplateBuilder.constants'
import type { CrmTemplateDraft, CrmTemplateLifecycleStatus, CrmTemplateValidationIssue } from './crmTemplateBuilder.types'

const CORE_SET = new Set<string>(CRM_TEMPLATE_CORE_STORAGE_KEYS)

export function validateCrmTemplateDraft(params: {
  name: string
  industryCode: string
  status: CrmTemplateLifecycleStatus
  draft: CrmTemplateDraft
}): CrmTemplateValidationIssue[] {
  const issues: CrmTemplateValidationIssue[] = []
  const name = params.name.trim()
  const industryCode = params.industryCode.trim().toLowerCase()

  if (!(CRM_TEMPLATE_LIFECYCLE_STATUSES as readonly string[]).includes(params.status)) {
    issues.push({ tab: 'basic', message: '상태는 draft·active·archived 중 하나여야 합니다.' })
  }

  if (!name) {
    issues.push({ tab: 'basic', message: '템플릿명을 입력해 주세요.' })
  }
  if (!industryCode) {
    issues.push({ tab: 'basic', message: 'Industry를 선택해 주세요.' })
  }
  if (industryCode === 'insurance') {
    issues.push({
      tab: 'basic',
      message: '보험(insurance) 업종은 동적 고객 템플릿을 만들 수 없습니다.',
    })
  }

  const { draft } = params
  if (draft.formFields.length === 0) {
    issues.push({
      tab: 'form',
      message: '등록 폼 필드를 최소 1개 추가해 주세요.',
    })
  }

  const formFieldKeys = new Set<string>()
  /** 코어 선택 키 / 확장 입력 키 모두 폼 레벨에서 유일해야 한다(storage 혼합 시에도 fieldKey 하나로 참조된다). */
  for (const f of draft.formFields) {
    if (f.storage === 'extension') {
      const fk = f.fieldKey.trim()
      if (!fk) {
        issues.push({
          tab: 'form',
          localId: f.localId,
          message: '확장 필드의 라벨을 입력해 주세요. 저장 시 내부 키가 자동으로 생성됩니다.',
        })
      } else if (!CRM_TEMPLATE_FIELD_KEY_REGEX.test(fk)) {
        issues.push({
          tab: 'form',
          localId: f.localId,
          message: '확장 필드 설정을 확인해 주세요. 내부 키 형식이 올바르지 않습니다.',
        })
      }
    } else {
      const fk = f.fieldKey.trim()
      if (!fk || !CORE_SET.has(fk)) {
        issues.push({
          tab: 'form',
          localId: f.localId,
          message: '코어 필드는 허용된 키 목록에서 선택해 주세요.',
        })
      }
    }

    const fkDupRaw = (f.storage === 'core' || f.storage === 'extension') && f.fieldKey.trim()
    if (fkDupRaw) {
      if (formFieldKeys.has(fkDupRaw)) {
        issues.push({
          tab: 'form',
          localId: f.localId,
          message: '같은 내부 키를 쓰는 필드가 두 개 이상 있습니다. 고급 설정에서 키를 확인해 주세요.',
        })
      }
      formFieldKeys.add(fkDupRaw)
    }

    if (!f.label.trim()) {
      issues.push({
        tab: 'form',
        localId: f.localId,
        message: '필드 라벨을 입력해 주세요.',
      })
    }

    const needOpts =
      f.fieldType === 'select' || f.fieldType === 'radio' || f.fieldType === 'checkbox'
    if (needOpts) {
      const nonEmptyOpts = f.options.filter((o) => String(o.value ?? '').trim().length > 0)
      if (nonEmptyOpts.length === 0) {
        issues.push({
          tab: 'form',
          localId: f.localId,
          message: '선택형 필드에는 value가 채워진 옵션이 최소 1개 필요합니다.',
        })
      } else {
        const seen = new Set<string>()
        for (const o of nonEmptyOpts) {
          const v = String(o.value ?? '').trim()
          if (seen.has(v)) {
            issues.push({
              tab: 'form',
              localId: f.localId,
              message: `옵션 value가 중복됩니다: "${v}"`,
            })
            break
          }
          seen.add(v)
        }
      }
    }
  }

  const coreKeys = new Set(
    draft.formFields.filter((f) => f.storage === 'core').map((f) => f.fieldKey.trim()),
  )
  const hasBirth = coreKeys.has('customer.birthDate')
  const hasFull =
    coreKeys.has('customer.ssn') || coreKeys.has('insurance.ssn')
  if (hasBirth && hasFull) {
    issues.push({
      tab: 'form',
      message:
        '등록 폼에 주민번호 앞자리(customer.birthDate)와 전체 주민번호(customer.ssn 또는 insurance.ssn)를 동시에 둘 수 없습니다.',
    })
  }

  for (const c of draft.listColumns) {
    if (!c.label.trim()) {
      issues.push({ tab: 'list', localId: c.localId, message: '표시 항목 라벨을 입력해 주세요.' })
    }
    if (!CRM_TEMPLATE_FIELD_KEY_REGEX.test(String(c.columnKey ?? '').trim())) {
      issues.push({
        tab: 'list',
        localId: c.localId,
        message: '목록 표시 항목 설정을 확인해 주세요. 표시할 등록 폼 필드를 선택해 주세요.',
      })
    }
    const src = c.sourceFieldKey.trim()
    if (!src || !CRM_TEMPLATE_FIELD_KEY_REGEX.test(src)) {
      issues.push({
        tab: 'list',
        localId: c.localId,
        message: '목록에 표시할 등록 폼 필드를 선택해 주세요.',
      })
    } else if (!formFieldKeys.has(src)) {
      issues.push({
        tab: 'list',
        localId: c.localId,
        message:
          '선택한 필드가 등록 폼에 없습니다. 등록 폼에서 필드를 추가하거나 다른 필드를 선택해 주세요.',
      })
    }
  }

  const tabIds = new Set<string>()
  for (const t of draft.detailTabs) {
    const tid = t.tabId.trim()
    if (!tid || !CRM_TEMPLATE_TAB_ID_REGEX.test(tid)) {
      issues.push({
        tab: 'detail',
        localId: t.localId,
        message: '탭 이름을 입력해 주세요. 저장 시 탭 식별자가 자동으로 생성됩니다.',
      })
    } else if (tabIds.has(tid)) {
      issues.push({
        tab: 'detail',
        localId: t.localId,
        message: `탭 ID가 중복됩니다: "${tid}"`,
      })
    }
    if (tid) tabIds.add(tid)

    if (!t.label.trim()) {
      issues.push({ tab: 'detail', localId: t.localId, message: '탭 이름을 입력해 주세요.' })
    }

    for (const fk of t.fieldKeys) {
      const k = String(fk).trim()
      if (!formFieldKeys.has(k)) {
        issues.push({
          tab: 'detail',
          localId: t.localId,
          message: `탭 "${t.label || tid}"에 등록 폼에 없는 필드가 포함되어 있습니다. 필드 선택을 확인해 주세요.`,
        })
      }
    }
  }

  return issues
}
