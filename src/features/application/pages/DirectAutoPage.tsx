import { FormButton, FormInput, FormSelect } from '../../../components/form'
import { useState } from 'react'

const FIELD_SHELL = 'field__control w-full px-3 py-3'

type DirectAutoDesignFormState = {
  가입조건: string
  고객유형: string
  고객명: string
  연락처: string
  차량유형: string
}

const INITIAL_FORM: DirectAutoDesignFormState = {
  가입조건: '',
  고객유형: '',
  고객명: '',
  연락처: '',
  차량유형: '',
}

function SelectChevron() {
  return (
    <span
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 opacity-90"
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/**
 * 다이렉트 자동차 1단계 — 설계요청 폼 UI만 (검증·API 없음).
 */
export function DirectAutoPage() {
  const [form, setForm] = useState<DirectAutoDesignFormState>(INITIAL_FORM)

  const setField = <K extends keyof DirectAutoDesignFormState>(key: K, value: DirectAutoDesignFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <main className="insurance-dark-forms page page--with-back">
      <header className="page-header">
        <h1>설계요청</h1>
        <p className="text-sm mt-2 leading-relaxed">
          설계를 위한 정보를 입력해주세요
          <br />
          모든 항목을 입력해주세요
        </p>
      </header>

      <section className="w-full space-y-5 px-1 pb-10">
        <div className="card space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-300">가입조건</span>
            <div className="relative">
              <FormSelect
                className={`w-full ${FIELD_SHELL} appearance-none pr-11`}
                value={form.가입조건}
                onChange={(e) => setField('가입조건', e.target.value)}
                options={[
                  { value: '', label: '선택' },
                  { value: '신규', label: '신규' },
                  { value: '갱신', label: '갱신' },
                ]}
              />
              <SelectChevron />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-300">고객유형</span>
            <div className="relative">
              <FormSelect
                className={`w-full ${FIELD_SHELL} appearance-none pr-11`}
                value={form.고객유형}
                onChange={(e) => setField('고객유형', e.target.value)}
                options={[
                  { value: '', label: '선택' },
                  { value: '개인', label: '개인' },
                  { value: '사업자', label: '사업자' },
                ]}
              />
              <SelectChevron />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-300">고객명</span>
            <FormInput
              type="text"
              name="direct-auto-customer-name"
              autoComplete="name"
              placeholder="고객명 입력"
              className={`w-full ${FIELD_SHELL}`}
              value={form.고객명}
              onChange={(e) => setField('고객명', e.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-300">연락처</span>
            <FormInput
              type="tel"
              name="direct-auto-phone"
              autoComplete="tel"
              placeholder="연락처 입력"
              className={`w-full ${FIELD_SHELL}`}
              value={form.연락처}
              onChange={(e) => setField('연락처', e.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-300">차량유형</span>
            <div className="relative">
              <FormSelect
                className={`w-full ${FIELD_SHELL} appearance-none pr-11`}
                value={form.차량유형}
                onChange={(e) => setField('차량유형', e.target.value)}
                options={[
                  { value: '', label: '선택' },
                  { value: '기존차량', label: '기존차량' },
                  { value: '신차', label: '신차' },
                ]}
              />
              <SelectChevron />
            </div>
          </label>
        </div>

        <FormButton
          htmlType="button"
          variant="primary"
          className="button button--primary button--full rounded-xl py-3.5 font-medium"
        >
          다음
        </FormButton>
      </section>
    </main>
  )
}
