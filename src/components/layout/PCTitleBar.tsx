import { FormButton } from '../form'

type Props = {
  onBack: () => void
}

export default function PCTitleBar({ onBack }: Props) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const active = Boolean(api?.minimize && api?.maximize && api?.close)

  return (
    <div className="title-bar pc-title-bar" aria-label="PC 프로그램 타이틀 바">
      <div className="title-left">
        <FormButton
          htmlType="button"
          variant="secondary"
          className="back-button"
          aria-label="뒤로가기"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
          <span>뒤로가기</span>
        </FormButton>
      </div>

      <div className="title-center">
        <span>FC OA 프로그램</span>
      </div>

      <div className="title-right">
        <div className="window-controls" aria-label="윈도우 제어">
          <FormButton
            htmlType="button"
            variant="secondary"
            aria-label="최소화"
            onClick={() => api?.minimize?.()}
            disabled={!active}
          >
            —
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            aria-label="최대화 또는 복원"
            onClick={() => api?.maximize?.()}
            disabled={!active}
          >
            {'\u25A1'}
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            aria-label="닫기"
            onClick={() => api?.close?.()}
            disabled={!active}
          >
            {'\u2715'}
          </FormButton>
        </div>
      </div>
    </div>
  )
}

