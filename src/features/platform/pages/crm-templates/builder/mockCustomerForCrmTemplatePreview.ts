import type { CustomerEditFormState } from '../../../../customers/types/customerEditForm'
import type { CustomerRecord } from '../../../../customers/domain/types'

/** 미리보기용 최소 고객 레코드 — 목록/상세 요약 문자열 생성 */
export function mockCustomerRecordFromPreviewBinder(v: CustomerEditFormState): CustomerRecord {
  return {
    id: 0,
    userId: 'preview-user',
    name: v.name ?? '',
    customerCode: 'PREVIEW',
    ssn: v.ssn ?? '',
    gender: v.gender,
    insuranceAge: null,
    birthDate: v.birthDate || null,
    nextAgeDate: null,
    isDriver: v.isDriver,
    carType: v.carType ?? '',
    notes: { items: [], insuranceHistory: '' },
    phone: v.phone ?? '',
    phoneNumber: v.phone ?? '',
    carrier: v.carrier ?? '',
    address: v.address ?? '',
    height: v.height ?? '',
    weight: v.weight ?? '',
    job: v.job ?? '',
    driving: '',
    medical: v.medical ?? '',
    carNumber: '',
    carModel: '',
    carYear: '',
    renewalDate: '',
    lastConsultDate: null,
    isFavorite: false,
    crmExtension: {
      v: 1,
      fields:
        typeof v.crmExtensionFields === 'object' && v.crmExtensionFields != null
          ? ({ ...v.crmExtensionFields } as Record<string, string>)
          : {},
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}
