import { useMemo, useState } from 'react'
import RichTextContent from '../../../../components/rich-text/RichTextContent'
import RichTextEditor from '../../../../components/rich-text/RichTextEditor'
import { stripRichText } from '../../../../components/rich-text/richText'
import CustomerAppNewsImageGallery from '../../../customer-app/components/CustomerAppNewsImageGallery'
import { buildCustomerNewsGalleryUrls } from '../../../customer-app/model/buildCustomerNewsGalleryUrls'
import '../../../customer-app/customer-app-news.css'
import type { AgentCustomerNewsItem } from '../../api/claimRequestsApi'
import type { AllNewsAttachmentDraft } from '../../model/customerNewsAllAttachmentUpload'

export type { AllNewsAttachmentDraft }

type ClaimRequestsAllNewsMobileViewProps = {
  title: string
  content: string
  attachments: AllNewsAttachmentDraft[]
  history: AgentCustomerNewsItem[]
  loading?: boolean
  actionBusy?: boolean
  deletingId?: string | null
  resultMessage?: string
  errorMessage?: string
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onFilesSelected: (files: FileList | File[]) => void
  onRemoveAttachment: (localId: string) => void
  onSend: () => void
  onDeleteNews: (item: AgentCustomerNewsItem) => void
  formatDateTime: (iso: string | null) => string
}

const statusLabel: Record<AllNewsAttachmentDraft['status'], string> = {
  pending: '대기',
  uploading: '업로드 중',
  completed: '완료',
  failed: '실패',
}

function getNewsHero(item: AgentCustomerNewsItem): string | null {
  return item.heroImageUrl || item.attachments?.find((attachment) => attachment.kind === 'image')?.url || null
}

function formatDateOnly(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toISOString().slice(0, 10)
}

export default function ClaimRequestsAllNewsMobileView({
  title,
  content,
  attachments,
  history,
  loading = false,
  actionBusy = false,
  deletingId = null,
  resultMessage = '',
  errorMessage = '',
  onTitleChange,
  onContentChange,
  onFilesSelected,
  onRemoveAttachment,
  onSend,
  onDeleteNews,
  formatDateTime,
}: ClaimRequestsAllNewsMobileViewProps) {
  const [selectedNews, setSelectedNews] = useState<AgentCustomerNewsItem | null>(null)
  const selectedGalleryUrls = useMemo(() => {
    if (!selectedNews) {
      return []
    }
    return buildCustomerNewsGalleryUrls({
      heroImageUrl: selectedNews.heroImageUrl,
      attachments: selectedNews.attachments,
    })
  }, [selectedNews])
  const selectedFiles = selectedNews?.attachments?.filter((attachment) => attachment.kind !== 'image') ?? []

  return (
    <main className="page claim-requests-page claim-requests-page--mobile claim-requests-all-news-mobile page--with-back content-wrapper">
      {errorMessage ? <p className="status status--error" role="alert">{errorMessage}</p> : null}
      {resultMessage ? <p className="status" role="status">{resultMessage}</p> : null}

      <section className="claim-requests-page__card claim-requests-all-news-mobile__compose-card">
        <div className="claim-requests-page__section-header">
          <div className="claim-requests-page__section-heading">
            <h2 className="claim-requests-page__section-title">고객메시지 작성</h2>
          </div>
          <button
            type="button"
            className="form-button button button--primary claim-requests-all-news-mobile__send-button"
            onClick={onSend}
            disabled={actionBusy}
          >
            {actionBusy ? '저장 중…' : '고객앱에 적용'}
          </button>
        </div>
        <input
          className="claim-requests-all-news-mobile__title-input"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="제목은 선택사항입니다."
          maxLength={120}
        />
        <RichTextEditor
          value={content}
          onChange={onContentChange}
          disabled={actionBusy}
          placeholder="모든 고객에게 전달할 소식 내용을 입력해 주세요."
          className="claim-requests-all-news-mobile__rich-editor"
        />

        <div className="claim-requests-all-news-mobile__upload-field">
          <span className="claim-requests-all-news-mobile__upload-label">이미지 (권장 9:16)</span>
          <label className="claim-requests-all-news-mobile__dropzone">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={actionBusy}
              onChange={(event) => {
                if (event.currentTarget.files?.length) {
                  onFilesSelected(event.currentTarget.files)
                }
                event.currentTarget.value = ''
              }}
            />
            <span>JPG · PNG · WEBP · GIF 이미지를 선택해 주세요.</span>
            <small>첫 번째 이미지는 고객앱 홈 슬라이드 대표 이미지로 사용됩니다. 각 파일 최대 10MB</small>
          </label>
          {attachments.length > 0 ? (
            <div className="claim-requests-all-news-mobile__attachment-list">
              {attachments.map((item) => (
                <div key={item.localId} className="claim-requests-all-news-mobile__attachment-row">
                  {item.kind === 'image' && item.previewUrl ? (
                    <img className="claim-requests-all-news-mobile__attachment-thumb" src={item.previewUrl} alt="" />
                  ) : (
                    <div className="claim-requests-all-news-mobile__attachment-pdf">이미지</div>
                  )}
                  <div className="claim-requests-all-news-mobile__attachment-info">
                    <p className="claim-requests-all-news-mobile__attachment-name">{item.file.name || '첨부파일'}</p>
                    <p className={`claim-requests-all-news-mobile__attachment-status claim-requests-all-news-mobile__attachment-status--${item.status}`}>
                      {statusLabel[item.status]}
                      {item.errorMessage ? ` — ${item.errorMessage}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="claim-requests-all-news-mobile__attachment-remove"
                    onClick={() => onRemoveAttachment(item.localId)}
                    disabled={actionBusy}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="claim-requests-page__card claim-requests-all-news-mobile__history-card">
        <div className="claim-requests-page__section-header claim-requests-page__list-header">
          <div className="claim-requests-page__section-heading">
            <h2 className="claim-requests-page__section-title">발송 내역</h2>
          </div>
          <span className="claim-requests-page__list-count">총 {history.length}건</span>
        </div>

        {loading ? <div className="claim-requests-page__empty">전체소식지를 불러오는 중…</div> : null}
        {!loading && history.length === 0 ? (
          <div className="claim-requests-page__empty">발송한 전체소식지가 없습니다.</div>
        ) : null}

        {history.length > 0 ? (
          <div className="claim-requests-all-news-mobile__history-list">
            {history.map((item) => {
              const isDeleting = deletingId === item.id
              const hero = getNewsHero(item)
              const summary = stripRichText(item.content)
              return (
                <article
                  key={item.id}
                  className="claim-requests-all-news-mobile__history-item claim-requests-all-news-mobile__history-item--summary"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedNews(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedNews(item)
                    }
                  }}
                >
                  {hero ? <img className="claim-requests-all-news-mobile__history-thumb" src={hero} alt="" /> : <div className="claim-requests-all-news-mobile__history-thumb claim-requests-all-news-mobile__history-thumb--empty">소식</div>}
                  <div className="claim-requests-all-news-mobile__summary-main">
                    <div className="claim-requests-all-news-mobile__history-title">{item.title || '전체소식지'}</div>
                    <div className="claim-requests-all-news-mobile__history-date">{formatDateTime(item.updatedAt)}</div>
                    <div className="claim-requests-all-news-mobile__history-excerpt">{summary}</div>
                    {item.attachments && item.attachments.length > 0 ? (
                      <div className="claim-requests-all-news-mobile__attachments">첨부 {item.attachments.length}개</div>
                    ) : null}
                  </div>
                  <div className="claim-requests-all-news-mobile__summary-actions">
                    <span className="claim-requests-all-news-mobile__open-badge">미리보기</span>
                    <button
                      type="button"
                      className="claim-requests-all-news-mobile__delete-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteNews(item)
                      }}
                      disabled={isDeleting || actionBusy}
                      aria-label={`${item.title || '전체소식지'} 삭제`}
                    >
                      {isDeleting ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>

      {selectedNews ? (
        <div className="all-news-preview-v2-backdrop" role="dialog" aria-modal="true" aria-label="전체소식지 고객 화면 미리보기">
          <section className="all-news-preview-v2-panel">
            <header className="all-news-preview-v2-header">
              <strong>고객 화면 미리보기</strong>
              <button type="button" onClick={() => setSelectedNews(null)}>닫기</button>
            </header>
            <div className="all-news-preview-v2-scroll">
              <article className="all-news-preview-v2-content-card">
                {selectedGalleryUrls.length > 0 ? (
                  <>
                    <div className="all-news-preview-v2-gallery-wrap">
                      <CustomerAppNewsImageGallery
                        key={selectedGalleryUrls.join('|')}
                        imageUrls={selectedGalleryUrls}
                        altBase="전체소식지 미리보기"
                        className="customer-app-news-gallery--in-modal"
                      />
                    </div>
                    <div className="all-news-preview-v2-after-gallery">
                      <h2>{selectedNews.title || '전체소식지'}</h2>
                      <p>{formatDateOnly(selectedNews.updatedAt)}</p>
                    </div>
                  </>
                ) : (
                  <div className="all-news-preview-v2-plain-title">
                    <h2>{selectedNews.title || '전체소식지'}</h2>
                    <p>{formatDateOnly(selectedNews.updatedAt)}</p>
                  </div>
                )}

                <div className="all-news-preview-v2-meta">최신 업데이트: {formatDateTime(selectedNews.updatedAt)}</div>
                <RichTextContent value={selectedNews.content} className="all-news-preview-v2-body-text" emptyText="본문이 없습니다." />

                {selectedFiles.length > 0 ? (
                  <div className="all-news-preview-v2-files">
                    <strong>첨부 파일</strong>
                    {selectedFiles.map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noreferrer">
                        {file.fileName || '첨부파일'}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
