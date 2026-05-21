import { useEffect, useMemo, useRef, useState } from 'react'
import { getCustomerById, saveCustomer, searchCustomers } from '../../customers/api/customersApi'
import type { CustomerRecord } from '../../customers/domain/types'
import { generateCustomerText } from '../../customers/utils/customerText'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CONTRACT_TYPES,
  DRIVER_AGE_OPTIONS,
  DRIVER_SCOPE_OPTIONS,
  EMERGENCY_ASSIST_OPTIONS,
  OWN_VEHICLE_DAMAGE_OPTIONS,
  PERSONAL_INJURY_OPTIONS,
  PREVIOUS_INSURERS,
  PROPERTY_DAMAGE_OPTIONS,
  UNINSURED_MOTORIST_OPTIONS,
  USAGE_TYPES,
  YES_NO_OPTIONS,
} from '../domain/options'
import { createEmptyApplicationForm } from '../domain/defaults'
import type { InsuranceApplicationFormData } from '../domain/types'
import {
  clearDraft,
  getApplicationById,
  getDraft,
  saveApplication,
  saveApplicationAsNew,
  saveDraft,
} from '../repository/applicationRepository'
import { useAuth } from '../../auth/AuthProvider'
import {
  CheckboxInput,
  SelectInput,
  TextAreaInput,
  TextInput,
} from '../components/FormFields'
import { FormButton } from '../../../components/form'
import { FormSection } from '../components/FormSection'

type EditableField = Exclude<keyof InsuranceApplicationFormData, 'customerId'>
const MIN_CUSTOMER_SEARCH_KEYWORD = 2

function normalizeFormData(source: Partial<InsuranceApplicationFormData>): InsuranceApplicationFormData {
  const normalized = createEmptyApplicationForm()
  const keys = Object.keys(normalized) as Array<keyof InsuranceApplicationFormData>
  for (const key of keys) {
    if (key === 'customerId') {
      const raw = source.customerId
      const n = typeof raw === 'number' ? raw : Number(raw)
      normalized.customerId = Number.isInteger(n) && n > 0 ? n : 0
      continue
    }
    const nextValue = source[key]
    if (typeof nextValue !== 'undefined') {
      ;(normalized as unknown as Record<string, string | boolean>)[key] =
        nextValue as string | boolean
    }
  }
  return normalized
}

function syncPayerFields(source: InsuranceApplicationFormData): InsuranceApplicationFormData {
  return {
    ...source,
    payerName: source.ownerName,
    payerPhone: source.ownerPhone,
    payerResidentNumber: source.ownerResidentNumber,
    payerAddress: source.ownerAddress,
  }
}

function mergeCustomerIntoForm(
  previous: InsuranceApplicationFormData,
  customer: CustomerRecord,
): InsuranceApplicationFormData {
  const next: InsuranceApplicationFormData = {
    ...previous,
    customerId: customer.id,
    ownerName: customer.name,
    ownerResidentNumber: customer.ssn,
    ownerPhone: customer.phone,
    ownerAddress: customer.address,
    vehicleNumber: customer.carNumber || '',
    vehicleModel: customer.carModel || customer.carType || '',
    vehicleYear: customer.carYear || '',
    expiryDate: customer.renewalDate || '',
  }
  if (previous.payerSameAsOwner) {
    return syncPayerFields(next)
  }
  return {
    ...next,
    payerName: customer.name,
    payerPhone: customer.phone,
    payerResidentNumber: customer.ssn,
    payerAddress: customer.address,
  }
}

export function ApplicationFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, customerId: customerIdParam } = useParams()
  const { token, user } = useAuth()

  const [recordId, setRecordId] = useState<string | undefined>(id)
  const [formData, setFormData] = useState<InsuranceApplicationFormData>(
    createEmptyApplicationForm(),
  )
  const [statusText, setStatusText] = useState('신청서 정보를 불러오는 중입니다.')
  const [isLoading, setIsLoading] = useState(true)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [, setLastSavedSignature] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerHits, setCustomerHits] = useState<CustomerRecord[]>([])
  const [customerSearchTriggered, setCustomerSearchTriggered] = useState(false)
  const [autoFilledNotice, setAutoFilledNotice] = useState('')
  const autoFilledCustomerIdRef = useRef<number | null>(null)

  const customerIdFromQuery = useMemo(() => {
    const fromRoute = Number(customerIdParam)
    if (Number.isInteger(fromRoute) && fromRoute > 0) {
      return fromRoute
    }
    const raw = new URLSearchParams(location.search).get('customerId')
    const numeric = Number(raw)
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null
  }, [customerIdParam, location.search])

  const trimmedCustomerQuery = customerQuery.trim()
  const canSearchCustomers = trimmedCustomerQuery.length >= MIN_CUSTOMER_SEARCH_KEYWORD

  const duplicateCustomerHitNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of customerHits) {
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name),
    )
  }, [customerHits])

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      const mode = new URLSearchParams(location.search).get('mode')
      const shouldReadOnly = mode === 'readonly'

      if (id && token) {
        const record = await getApplicationById(id, token)
        if (record && active) {
          const normalized = normalizeFormData(record)
          setRecordId(record.id)
          setFormData(normalized)
          setIsReadOnly(shouldReadOnly)
          setStatusText(shouldReadOnly ? '신청서를 읽기 모드로 불러왔습니다.' : '신청서를 불러왔습니다.')
          setLastSavedSignature(JSON.stringify(normalized))
          setIsLoading(false)
          return
        }
      }

      if (!id && customerIdFromQuery != null && active) {
        const empty = createEmptyApplicationForm()
        autoFilledCustomerIdRef.current = null
        setAutoFilledNotice('')
        setRecordId(undefined)
        setFormData(empty)
        setIsReadOnly(false)
        setStatusText('선택한 고객 정보로 새 신청서를 작성 중입니다.')
        setLastSavedSignature(JSON.stringify(empty))
        setIsLoading(false)
        return
      }

      const draft = getDraft(user?.id)
      if (draft && active) {
        const normalized = normalizeFormData(draft.data)
        setRecordId(draft.id)
        setFormData(normalized)
        setIsReadOnly(false)
        setStatusText('임시 저장본을 복원했습니다.')
        setLastSavedSignature(JSON.stringify(normalized))
        setIsLoading(false)
        return
      }

      if (!active) {
        return
      }

      const empty = createEmptyApplicationForm()
      setRecordId(undefined)
      setFormData(empty)
      setIsReadOnly(false)
      setStatusText('새 신청서를 작성 중입니다.')
      setLastSavedSignature(JSON.stringify(empty))
      setIsLoading(false)
    }

    queueMicrotask(() => {
      if (!active) {
        return
      }
      setIsLoading(true)
      void loadInitialData()
    })
    return () => {
      active = false
    }
  }, [id, location.search, token, user?.id, customerIdFromQuery])

  useEffect(() => {
    if (!token || isReadOnly || isLoading || customerIdFromQuery == null) {
      return
    }
    if (autoFilledCustomerIdRef.current === customerIdFromQuery) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const customer = await getCustomerById(token, customerIdFromQuery)
        if (!customer || cancelled) {
          return
        }
        setFormData((previous) => mergeCustomerIntoForm(previous, customer))
        setAutoFilledNotice('고객 정보가 자동 입력되었습니다')
        setStatusText('고객 정보가 자동 입력되었습니다')
        autoFilledCustomerIdRef.current = customerIdFromQuery
      } catch (error) {
        if (cancelled) {
          return
        }
        setStatusText(error instanceof Error ? error.message : '고객 자동 입력에 실패했습니다.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, isReadOnly, isLoading, customerIdFromQuery])

  const updateField = (field: EditableField, value: string | boolean) => {
    if (isReadOnly) {
      return
    }

    setFormData((previous) => {
      const nextValue = {
        ...previous,
        [field]: value,
      } as InsuranceApplicationFormData

      const ownerFields: EditableField[] = [
        'ownerName',
        'ownerPhone',
        'ownerResidentNumber',
        'ownerAddress',
      ]
      if (previous.payerSameAsOwner && ownerFields.includes(field)) {
        return syncPayerFields(nextValue)
      }

      return nextValue
    })
  }

  const handlePayerSameAsOwner = (checked: boolean) => {
    if (isReadOnly) {
      return
    }

    setFormData((previous) => {
      if (!checked) {
        return {
          ...previous,
          payerSameAsOwner: false,
        }
      }

      return syncPayerFields({
        ...previous,
        payerSameAsOwner: true,
      })
    })
  }

  const handleSave = async (
    mode: 'current' | 'new',
    options: { navigateToEdit?: boolean } = {},
  ) => {
    if (!token) {
      setStatusText('로그인이 필요합니다.')
      return
    }

    try {
      const savedRecord =
        mode === 'new'
          ? await saveApplicationAsNew(formData, token)
          : await saveApplication(formData, token, recordId)

      const normalized = normalizeFormData(savedRecord)
      setRecordId(savedRecord.id)
      setFormData(normalized)
      setLastSavedSignature(JSON.stringify(normalized))
      clearDraft()
      saveDraft(normalized, user?.id, savedRecord.id)
      setStatusText(mode === 'new' ? '새 신청서로 저장했습니다.' : '신청서를 저장했습니다.')
      if (options.navigateToEdit ?? true) {
        navigate(`/form/${savedRecord.id}/edit`, { replace: true })
      }
      return savedRecord
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '저장에 실패했습니다.')
      return null
    }
  }

  const applyCustomer = (c: CustomerRecord) => {
    if (isReadOnly) {
      return
    }
    setFormData((prev) => mergeCustomerIntoForm(prev, c))
    setStatusText(`고객 "${c.name}" 정보를 신청서에 적용했습니다.`)
  }

  const runCustomerSearch = async () => {
    if (!token || isReadOnly) {
      return
    }
    if (!canSearchCustomers) {
      setCustomerHits([])
      setCustomerSearchTriggered(false)
      setStatusText(`고객 검색은 ${MIN_CUSTOMER_SEARCH_KEYWORD}글자 이상 입력해 주세요.`)
      return
    }
    try {
      const rows = await searchCustomers(token, trimmedCustomerQuery)
      setCustomerHits(rows)
      setCustomerSearchTriggered(true)
      if (rows.length === 0) {
        setStatusText('검색 결과가 없습니다.')
      } else {
        setStatusText(`고객 검색 결과 ${rows.length}건을 찾았습니다.`)
      }
    } catch (error) {
      setCustomerHits([])
      setCustomerSearchTriggered(true)
      setStatusText(error instanceof Error ? error.message : '고객 검색에 실패했습니다.')
    }
  }

  const copyCustomerRecord = async (c: CustomerRecord) => {
    const text = generateCustomerText(c)
    try {
      await navigator.clipboard.writeText(text)
      window.alert('복사되었습니다')
      setStatusText('복사되었습니다')
    } catch {
      setStatusText('복사에 실패했습니다.')
    }
  }

  const handleSaveCustomerFromForm = async () => {
    if (!token || isReadOnly) {
      setStatusText('로그인 후 저장할 수 있습니다.')
      return
    }
    const name = formData.ownerName.trim()
    if (!name) {
      setStatusText('소유자 이름을 입력한 뒤 고객으로 저장할 수 있습니다.')
      return
    }
    try {
      const created = await saveCustomer(token, {
        name,
        ssn: formData.ownerResidentNumber,
        phone: formData.ownerPhone,
        address: formData.ownerAddress,
      })
      setFormData((prev) => ({ ...prev, customerId: created.id }))
      setStatusText('고객 DB에 저장했습니다.')
      const rows = await searchCustomers(token, customerQuery)
      setCustomerHits(rows)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '고객 저장에 실패했습니다.')
    }
  }

  const handleSubmit = () => {
    if (!recordId) {
      setStatusText('신청 전 먼저 저장해 주세요.')
      window.alert('신청 전 먼저 저장해 주세요.')
      return
    }
    navigate(`/form/result/${recordId}`)
  }

  const pageTitle = useMemo(() => {
    if (isReadOnly) {
      return '신청서 불러보기'
    }
    return recordId ? '신청서 수정' : '신청서 신규 작성'
  }, [isReadOnly, recordId])

  if (isLoading) {
    return (
      <main className="insurance-dark-forms page page--with-back">
        <header className="page-header">
          <h1>신청서 로딩 중</h1>
          <p>저장된 데이터를 확인하고 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="insurance-dark-forms page page--with-back application-form-page">
      <header className="page-header">
        <h1>{pageTitle}</h1>
        <p>{statusText}</p>
      </header>

      <FormSection title="고객 DB (검색·불러오기)">
        <TextInput
          label="이름 또는 전화번호 검색"
          value={customerQuery}
          disabled={isReadOnly}
          onChange={(value) => {
            setCustomerQuery(value)
            if (value.trim().length < MIN_CUSTOMER_SEARCH_KEYWORD) {
              setCustomerHits([])
              setCustomerSearchTriggered(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return
            }
            event.preventDefault()
            void runCustomerSearch()
          }}
          helperText="입력 후 목록에서 신청서에 적용하거나 카톡용 문구를 복사합니다."
        />
        {autoFilledNotice ? <p className="field__helper">{autoFilledNotice}</p> : null}
        {!isReadOnly ? (
          <div className="customer-db-actions">
            <FormButton
              className="button button--secondary"
              htmlType="button"
              variant="secondary"
              onClick={() => void runCustomerSearch()}
              disabled={!canSearchCustomers}
            >
              고객 검색
            </FormButton>
            <FormButton
              className="button button--secondary"
              htmlType="button"
              variant="secondary"
              onClick={() => void handleSaveCustomerFromForm()}
            >
              현재 소유자 정보를 고객으로 저장
            </FormButton>
          </div>
        ) : null}
        {!canSearchCustomers ? (
          <p className="empty-state empty-state--inline">
            이름 또는 전화번호를 {MIN_CUSTOMER_SEARCH_KEYWORD}글자 이상 입력 후 Enter 또는 고객 검색 버튼을 눌러주세요.
          </p>
        ) : !customerSearchTriggered ? (
          <p className="empty-state empty-state--inline">검색어를 입력한 뒤 Enter로 검색하세요.</p>
        ) : customerHits.length === 0 ? (
          <p className="empty-state empty-state--inline">검색 결과가 없습니다.</p>
        ) : (
          <ul className="customer-hit-list">
            {customerHits.map((c) => (
              <li key={c.id} className="customer-hit-list__item">
                <span className="customer-hit-list__meta">
                  <span
                    className={
                      duplicateCustomerHitNames.has(c.name) ? 'customer-hit-name--duplicate' : undefined
                    }
                  >
                    {c.name}
                  </span>
                  {' / '}
                  {c.phone || '—'}
                  {' / '}
                  {c.ssn || '—'}
                </span>
                <div className="customer-hit-list__actions">
                  <FormButton
                    className="button button--secondary"
                    htmlType="button"
                    variant="secondary"
                    disabled={isReadOnly}
                    onClick={() => applyCustomer(c)}
                  >
                    신청서에 적용
                  </FormButton>
                  <FormButton className="button" htmlType="button" variant="action" onClick={() => void copyCustomerRecord(c)}>
                    카톡 복사
                  </FormButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="기본 정보">
        <TextInput
          label="지점명"
          value={formData.branchName}
          disabled={isReadOnly}
          onChange={(value) => updateField('branchName', value)}
        />
        <TextInput
          label="사원명"
          value={formData.staffName}
          disabled={isReadOnly}
          onChange={(value) => updateField('staffName', value)}
        />
        <TextInput
          label="만기일자"
          type="date"
          value={formData.expiryDate}
          disabled={isReadOnly}
          onChange={(value) => updateField('expiryDate', value)}
        />
        <SelectInput
          label="종류"
          value={formData.contractType}
          options={CONTRACT_TYPES}
          disabled={isReadOnly}
          onChange={(value) => updateField('contractType', value)}
        />
        <SelectInput
          label="용도"
          value={formData.usageType}
          options={USAGE_TYPES}
          disabled={isReadOnly}
          onChange={(value) => updateField('usageType', value)}
        />
        <SelectInput
          label="전계약사"
          value={formData.previousInsurer}
          options={PREVIOUS_INSURERS}
          disabled={isReadOnly}
          onChange={(value) => updateField('previousInsurer', value)}
        />
      </FormSection>

      <FormSection title="인적사항 - 등록증상 소유자">
        <TextInput
          label="이름"
          value={formData.ownerName}
          disabled={isReadOnly}
          onChange={(value) => updateField('ownerName', value)}
        />
        <TextInput
          label="휴대폰"
          value={formData.ownerPhone}
          inputMode="numeric"
          disabled={isReadOnly}
          onChange={(value) => updateField('ownerPhone', value)}
        />
        <TextInput
          label="주민번호"
          value={formData.ownerResidentNumber}
          inputMode="numeric"
          disabled={isReadOnly}
          onChange={(value) => updateField('ownerResidentNumber', value)}
        />
        <TextAreaInput
          label="주소"
          value={formData.ownerAddress}
          disabled={isReadOnly}
          onChange={(value) => updateField('ownerAddress', value)}
        />
      </FormSection>

      <FormSection title="인적사항 - 보험료 납입자">
        <CheckboxInput
          label="등록증상 소유자 정보와 보험료 납입자 정보가 동일"
          checked={formData.payerSameAsOwner}
          disabled={isReadOnly}
          onChange={handlePayerSameAsOwner}
          helperText="체크 시 이름/휴대폰/주민번호/주소를 자동 복사합니다."
        />
        <TextInput
          label="이름"
          value={formData.payerName}
          disabled={isReadOnly || formData.payerSameAsOwner}
          onChange={(value) => updateField('payerName', value)}
        />
        <TextInput
          label="휴대폰"
          value={formData.payerPhone}
          inputMode="numeric"
          disabled={isReadOnly || formData.payerSameAsOwner}
          onChange={(value) => updateField('payerPhone', value)}
        />
        <TextInput
          label="주민번호"
          value={formData.payerResidentNumber}
          inputMode="numeric"
          disabled={isReadOnly || formData.payerSameAsOwner}
          onChange={(value) => updateField('payerResidentNumber', value)}
        />
        <TextAreaInput
          label="주소"
          value={formData.payerAddress}
          disabled={isReadOnly || formData.payerSameAsOwner}
          onChange={(value) => updateField('payerAddress', value)}
        />
      </FormSection>

      <FormSection title="차량사항">
        <TextInput
          label="차량번호"
          value={formData.vehicleNumber}
          disabled={isReadOnly}
          onChange={(value) => updateField('vehicleNumber', value)}
        />
        <TextInput
          label="차명"
          value={formData.vehicleModel}
          disabled={isReadOnly}
          onChange={(value) => updateField('vehicleModel', value)}
        />
        <TextInput
          label="연식"
          value={formData.vehicleYear}
          inputMode="numeric"
          disabled={isReadOnly}
          onChange={(value) => updateField('vehicleYear', value)}
        />
        <SelectInput
          label="마일리지"
          value={formData.mileageYn}
          options={YES_NO_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('mileageYn', value)}
        />
        <SelectInput
          label="블랙박스"
          value={formData.blackboxYn}
          options={YES_NO_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('blackboxYn', value)}
        />
        <TextInput
          label="계좌번호"
          value={formData.bankAccount}
          disabled={isReadOnly}
          onChange={(value) => updateField('bankAccount', value)}
        />
        <TextAreaInput
          label="기타부속"
          value={formData.extraAccessories}
          disabled={isReadOnly}
          onChange={(value) => updateField('extraAccessories', value)}
        />
      </FormSection>

      <FormSection title="담보사항">
        <TextInput label="대인배상Ⅰ" value="가입필수" onChange={() => undefined} disabled />
        <TextInput label="대인배상Ⅱ" value="무한" onChange={() => undefined} disabled />
        <SelectInput
          label="대물배상"
          value={formData.propertyDamage}
          options={PROPERTY_DAMAGE_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('propertyDamage', value)}
        />
        <SelectInput
          label="자손/자상"
          value={formData.personalInjury}
          options={PERSONAL_INJURY_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('personalInjury', value)}
        />
        <SelectInput
          label="무보험차상해"
          value={formData.uninsuredMotorist}
          options={UNINSURED_MOTORIST_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('uninsuredMotorist', value)}
        />
        <SelectInput
          label="자기차량손해"
          value={formData.ownVehicleDamage}
          options={OWN_VEHICLE_DAMAGE_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('ownVehicleDamage', value)}
        />
        <SelectInput
          label="긴급출동"
          value={formData.emergencyAssist}
          options={EMERGENCY_ASSIST_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('emergencyAssist', value)}
        />
        <SelectInput
          label="운전범위"
          value={formData.driverScope}
          options={DRIVER_SCOPE_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('driverScope', value)}
        />
        <SelectInput
          label="운전연령"
          value={formData.driverAge}
          options={DRIVER_AGE_OPTIONS}
          disabled={isReadOnly}
          onChange={(value) => updateField('driverAge', value)}
        />
      </FormSection>

      <FormSection title="운전자 정보">
        <TextInput
          label="지정 1인 운전자 이름"
          value={formData.designatedDriverName}
          disabled={isReadOnly}
          onChange={(value) => updateField('designatedDriverName', value)}
        />
        <TextInput
          label="지정 1인 운전자 주민번호"
          value={formData.designatedDriverResidentNumber}
          inputMode="numeric"
          disabled={isReadOnly}
          onChange={(value) => updateField('designatedDriverResidentNumber', value)}
        />
        <TextInput
          label="배우자/최저운전자 이름"
          value={formData.spouseOrMinDriverName}
          disabled={isReadOnly}
          onChange={(value) => updateField('spouseOrMinDriverName', value)}
        />
        <TextInput
          label="배우자/최저운전자 주민번호"
          value={formData.spouseOrMinDriverResidentNumber}
          inputMode="numeric"
          disabled={isReadOnly}
          onChange={(value) => updateField('spouseOrMinDriverResidentNumber', value)}
        />
      </FormSection>

      <FormSection title="경력자 / 메모">
        <TextInput
          label="경력1"
          value={formData.career1}
          disabled={isReadOnly}
          onChange={(value) => updateField('career1', value)}
        />
        <TextInput
          label="경력2"
          value={formData.career2}
          disabled={isReadOnly}
          onChange={(value) => updateField('career2', value)}
        />
        <TextAreaInput
          label="메모"
          value={formData.memo}
          disabled={isReadOnly}
          onChange={(value) => updateField('memo', value)}
        />
      </FormSection>

      <div className="sticky-actions application-form-actions">
        <FormButton className="button" htmlType="button" variant="action" onClick={() => navigate('/my-forms')}>
          목록
        </FormButton>
        <FormButton className="button button--primary" htmlType="button" variant="primary" onClick={handleSubmit}>
          신청
        </FormButton>
        {isReadOnly ? (
          <FormButton
            className="button button--secondary"
            htmlType="button"
            variant="secondary"
            onClick={() => setIsReadOnly(false)}
          >
            수정 시작
          </FormButton>
        ) : (
          <>
            <FormButton
              className="button button--primary"
              htmlType="button"
              variant="primary"
              onClick={() => void handleSave('current')}
            >
              저장
            </FormButton>
            {recordId ? (
              <FormButton
                className="button button--secondary"
                htmlType="button"
                variant="secondary"
                onClick={() => void handleSave('new')}
              >
                새로 저장
              </FormButton>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
