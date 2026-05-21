import { useEffect, useState, type ReactNode } from 'react'

type Props = {
  settings: ReactNode
  preview: ReactNode
  previewTitle?: string
  /** 미리보기 제목 아래 안내 문구. 미지정 시 기본 문구 사용 */
  previewHint?: string
}

/** 빌더 설정(좌) + 실시간 미리보기(우). 좁은 화면에서는 세로 배치·미리보기 접기. */
const DEFAULT_PREVIEW_HINT = '실제 저장·등록은 되지 않습니다. 설정 변경이 바로 반영됩니다.'

export default function CrmTemplateBuilderSplitLayout({
  settings,
  preview,
  previewTitle = '실시간 미리보기',
  previewHint = DEFAULT_PREVIEW_HINT,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(true)
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsWide(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const showPreview = isWide || previewOpen

  return (
    <div className="crm-template-builder__split">
      <div className="crm-template-builder__split-settings">{settings}</div>
      <aside className="crm-template-builder__split-preview">
        <header className="crm-template-builder__split-preview-head">
          <div>
            <h3 className="crm-template-builder__split-preview-title">{previewTitle}</h3>
            <p className="platform-admin-page__field-hint m-0 text-xs">{previewHint}</p>
          </div>
          {!isWide ? (
            <button
              type="button"
              className="filter-button text-sm shrink-0"
              onClick={() => setPreviewOpen((v) => !v)}
              aria-expanded={showPreview}
            >
              {showPreview ? '미리보기 접기' : '미리보기 펼치기'}
            </button>
          ) : null}
        </header>
        {showPreview ? <div className="crm-template-builder__split-preview-body">{preview}</div> : null}
      </aside>
    </div>
  )
}
