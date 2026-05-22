import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { FormButton, FormInput, FormTextarea } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import {
  EMPTY_LIQUOR_TENANT_COMPANY_PROFILE,
  fetchLiquorTenantCompanyProfile,
  saveLiquorTenantCompanyProfile,
  type LiquorTenantCompanyProfile,
} from './liquorTenantCompanyProfileClient'
import './liquor-tenant-settings.css'

function Field({
  label,
  wide,
  children,
}: {
  label: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <label className={wide ? 'liquor-tenant-settings__grid--wide' : undefined}>
      {label}
      {children}
    </label>
  )
}

export default function LiquorTenantCompanyProfilePage() {
  const { token } = useAuth()
  const t = token?.trim() ?? ''
  const [form, setForm] = useState<LiquorTenantCompanyProfile>({ ...EMPTY_LIQUOR_TENANT_COMPANY_PROFILE })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!t) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLiquorTenantCompanyProfile(t)
      setForm(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '주류업체정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = (key: keyof LiquorTenantCompanyProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  const onSave = async () => {
    if (!t) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const saved = await saveLiquorTenantCompanyProfile(t, form)
      setForm(saved)
      setSuccess('저장되었습니다.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="liquor-tenant-settings">
      <header className="page-header">
        <h1 className="page-header__title">주류업체정보</h1>
      </header>

      <p className="liquor-tenant-settings__intro">
        프로그램을 이용하는 주류회사(테넌트)의 기본 사업자·계좌·전자서명 발신 정보입니다. 거래처 고객 정보와
        별도로 관리됩니다.
      </p>

      {loading ? <p className="liquor-tenant-settings__status liquor-tenant-settings__status--muted">불러오는 중…</p> : null}
      {error ? <p className="liquor-tenant-settings__status liquor-tenant-settings__status--error">{error}</p> : null}
      {success ? <p className="liquor-tenant-settings__status liquor-tenant-settings__status--success">{success}</p> : null}

      {!loading ? (
        <>
          <section className="liquor-tenant-settings__card" aria-labelledby="liquor-tenant-business-heading">
            <h2 id="liquor-tenant-business-heading" className="liquor-tenant-settings__card-title">
              사업자 정보
            </h2>
            <div className="liquor-tenant-settings__grid">
              <Field label="대표자명">
                <FormInput value={form.representativeName} onChange={(e) => patch('representativeName', e.target.value)} />
              </Field>
              <Field label="사업자명">
                <FormInput value={form.businessName} onChange={(e) => patch('businessName', e.target.value)} />
              </Field>
              <Field label="사업자등록번호">
                <FormInput
                  value={form.businessRegistrationNumber}
                  onChange={(e) => patch('businessRegistrationNumber', e.target.value)}
                />
              </Field>
              <Field label="대표 연락처">
                <FormInput
                  type="tel"
                  value={form.representativePhone}
                  onChange={(e) => patch('representativePhone', e.target.value)}
                />
              </Field>
              <Field label="사업장 전화번호">
                <FormInput type="tel" value={form.businessPhone} onChange={(e) => patch('businessPhone', e.target.value)} />
              </Field>
              <Field label="이메일">
                <FormInput type="email" value={form.email} onChange={(e) => patch('email', e.target.value)} />
              </Field>
              <Field label="사업장주소" wide>
                <FormTextarea
                  value={form.businessAddress}
                  onChange={(e) => patch('businessAddress', e.target.value)}
                  rows={2}
                />
              </Field>
            </div>
          </section>

          <section className="liquor-tenant-settings__card" aria-labelledby="liquor-tenant-bank-heading">
            <h2 id="liquor-tenant-bank-heading" className="liquor-tenant-settings__card-title">
              계좌 정보
            </h2>
            <div className="liquor-tenant-settings__grid">
              <Field label="계좌 은행">
                <FormInput value={form.bankName} onChange={(e) => patch('bankName', e.target.value)} />
              </Field>
              <Field label="계좌번호">
                <FormInput value={form.bankAccountNumber} onChange={(e) => patch('bankAccountNumber', e.target.value)} />
              </Field>
              <Field label="예금주">
                <FormInput value={form.bankAccountHolder} onChange={(e) => patch('bankAccountHolder', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="liquor-tenant-settings__card" aria-labelledby="liquor-tenant-signature-heading">
            <h2 id="liquor-tenant-signature-heading" className="liquor-tenant-settings__card-title">
              전자서명 발신 정보
            </h2>
            <div className="liquor-tenant-settings__grid">
              <Field label="전자서명 발신자명">
                <FormInput
                  value={form.signatureSenderName}
                  onChange={(e) => patch('signatureSenderName', e.target.value)}
                />
              </Field>
              <Field label="전자서명 발신 연락처">
                <FormInput
                  type="tel"
                  value={form.signatureSenderPhone}
                  onChange={(e) => patch('signatureSenderPhone', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <div className="liquor-tenant-settings__actions">
            <FormButton type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? '저장 중…' : '저장'}
            </FormButton>
          </div>
        </>
      ) : null}
    </div>
  )
}
