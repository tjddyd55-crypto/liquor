import { useId } from 'react'
import { FormButton, FormInput } from '../../../components/form'
import { StatusMessage } from '../../../components/feedback'
import { useGaCustomerMatchAliases } from '../hooks/useGaCustomerMatchAliases'

export type GaCustomerMatchAliasesCardProps = {
  customerId: number
  /** 저장 성공 후 GA 데이터 목록 재조회 등 */
  onSaved?: () => void
  /** PC: 제목 줄 오른쪽 도구 형태 · 모바일: 제목 아래 컴팩트 바 */
  layout: 'pc' | 'mobile'
}

/**
 * GA 피보험자 ↔ CRM 고객명 정확 일치용 예외값 입력(PC 한 줄 · 모바일 컴팩트).
 */
export default function GaCustomerMatchAliasesCard({
  customerId,
  onSaved,
  layout,
}: GaCustomerMatchAliasesCardProps) {
  const inputId = useId()
  const {
    loading,
    saving,
    inputText,
    setInputText,
    error,
    saveMessage,
    onSave,
  } = useGaCustomerMatchAliases(customerId)

  const handleSave = async () => {
    const ok = await onSave()
    if (ok) {
      onSaved?.()
    }
  }

  const toolbar = loading ? (
    <span className={`ga-match-aliases-toolbar__loading ga-match-aliases-toolbar__loading--${layout}`}>
      불러오는 중…
    </span>
  ) : (
    <>
      <label className="ga-match-aliases-toolbar__label" htmlFor={inputId}>
        매칭 예외값
      </label>
      <FormInput
        id={inputId}
        type="text"
        className="ga-match-aliases-toolbar__field"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder=""
        disabled={saving || !Number.isFinite(customerId) || customerId < 1}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${inputId}-hint`}
      />
      <FormButton
        htmlType="button"
        variant="primary"
        size="sm"
        disabled={
          saving || loading || !Number.isFinite(customerId) || customerId < 1
        }
        onClick={() => void handleSave()}
      >
        {saving ? '저장 중…' : '저장'}
      </FormButton>
    </>
  )

  return (
    <div
      className={`ga-match-aliases-bundle ga-match-aliases-bundle--${layout}`}
      aria-busy={loading || saving}
    >
      <div className={`ga-match-aliases-toolbar ga-match-aliases-toolbar--${layout}`}>
        {toolbar}
      </div>
      <p id={`${inputId}-hint`} className={`ga-match-aliases-bundle__comma-hint ga-match-aliases-bundle__comma-hint--${layout}`}>
        입력칸은 쉼표(,)로 구분합니다.
      </p>
      <div className={`ga-match-aliases-bundle__feedback ga-match-aliases-bundle__feedback--${layout}`}>
        <StatusMessage message={error} tone="error" />
        <StatusMessage message={saveMessage} tone="default" />
      </div>
    </div>
  )
}
