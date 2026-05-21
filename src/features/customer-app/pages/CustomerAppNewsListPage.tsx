import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { FormButton } from '../../../components/form'
import RichTextContent from '../../../components/rich-text/RichTextContent'
import {
  getCustomerNewsDetail,
  listCustomerNewsByScope,
  markCustomerNewsRead,
  type CustomerAppNewsDetail,
  type CustomerAppNewsListItem,
} from '../api/customerAppApi'
import CustomerAppNewsCard from '../components/CustomerAppNewsCard'
import CustomerAppNewsImageGallery from '../components/CustomerAppNewsImageGallery'
import { buildCustomerNewsGalleryUrls } from '../model/buildCustomerNewsGalleryUrls'
import { useCustomerAppSession } from '../session/useCustomerAppSession'

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CustomerAppNewsListPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const isPersonalMode = location.pathname.includes('/customer-app/news/personal')
  const [rows, setRows] = useState<CustomerAppNewsListItem[]>([])
  const [error, setError] = useState('')
  const [selectedItem, setSelectedItem] = useState<CustomerAppNewsListItem | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CustomerAppNewsDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [zoom, setZoom] = useState(1)
  const openRequestIdRef = useRef(0)

  const closeModal = useCallback(() => {
    openRequestIdRef.current += 1
    setSelectedItem(null)
    setSelectedDetail(null)
    setDetailLoading(false)
    setDetailError('')
    setZoom(1)
  }, [])

  useEffect(() => {
    if (!session) {
      navigate('/customer-app', { replace: true })
      return
    }
    let mounted = true
    const run = async () => {
      try {
        const data = await listCustomerNewsByScope(session.appToken, isPersonalMode ? 'personal' : 'all')
        if (!mounted) {
          return
        }
        setRows(data)
      } catch (loadError) {
        if (!mounted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : '소식지 목록을 불러오지 못했습니다.')
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [isPersonalMode, navigate, session])

  const pageTitle = isPersonalMode ? '개인소식지' : '전체소식지'
  const emptyMessage = isPersonalMode ? '표시할 개인 소식지가 없습니다.' : '표시할 소식지가 없습니다.'

  return (
    <>
      <StatusMessage message={error} tone="error" />
      {rows.length > 0 ? (
        <div className="customer-app-news-page-hint">
          {isPersonalMode ? '개별로 전달된 소식지만 표시됩니다.' : '전체 공지 소식지가 표시됩니다.'}
        </div>
      ) : null}

      {rows.length === 0 ? <div className="customer-app-news-empty">{emptyMessage}</div> : null}
      {rows.length > 0 ? (
        <div className="customer-app-news-list">
          {rows.map((row) => (
            <CustomerAppNewsCard
              key={row.id}
              id={row.id}
              title={row.title}
              summary={row.summary}
              updatedAt={row.updatedAt}
              heroImageUrl={row.heroImageUrl ?? null}
              label={pageTitle}
              variant="list"
              onOpen={() => {
                if (!session) {
                  return
                }
                setSelectedItem(row)
                setSelectedDetail(null)
                setDetailLoading(true)
                setDetailError('')
                setZoom(1)
                const requestId = openRequestIdRef.current + 1
                openRequestIdRef.current = requestId
                void (async () => {
                  try {
                    const detail = await getCustomerNewsDetail(session.appToken, row.id)
                    await markCustomerNewsRead(session.appToken, row.id)
                    if (openRequestIdRef.current !== requestId) {
                      return
                    }
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, isRead: true } : item)))
                    setSelectedDetail(detail)
                  } catch (loadError) {
                    if (openRequestIdRef.current !== requestId) {
                      return
                    }
                    setDetailError(loadError instanceof Error ? loadError.message : '소식지 상세를 불러오지 못했습니다.')
                  } finally {
                    if (openRequestIdRef.current === requestId) {
                      setDetailLoading(false)
                    }
                  }
                })()
              }}
            />
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="customer-app-news-page-hint">
          최신 업데이트: {formatDateTime(rows[0]?.updatedAt ?? null)}
        </div>
      ) : null}
      {selectedItem ? (
        <div className="customer-news-modal" role="dialog" aria-modal="true" onClick={closeModal}>
          <div className="customer-news-modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <FormButton
                htmlType="button"
                variant="action"
                className="filter-button customer-news-modal-control"
                onClick={() => setZoom((value) => Math.min(value + 0.2, 3))}
              >
                확대
              </FormButton>
              <FormButton
                htmlType="button"
                variant="action"
                className="filter-button customer-news-modal-control"
                onClick={() => setZoom((value) => Math.max(value - 0.2, 0.5))}
              >
                축소
              </FormButton>
              <FormButton
                htmlType="button"
                variant="action"
                className="filter-button close-btn customer-news-modal-close"
                onClick={closeModal}
              >
                닫기
              </FormButton>
            </div>
            <div className="modal-body">
              {detailLoading ? <div className="modal-text">소식지 상세를 불러오는 중입니다…</div> : null}
              {!detailLoading && detailError ? <div className="modal-text">{detailError}</div> : null}
              {!detailLoading && !detailError ? (
                <div className="news-detail-scroll">
                  <CustomerAppNewsImageGallery
                    className="customer-app-news-gallery--in-modal"
                    imageUrls={buildCustomerNewsGalleryUrls({
                      heroImageUrl: selectedDetail?.heroImageUrl ?? selectedItem.heroImageUrl,
                      attachments: selectedDetail?.attachments ?? [],
                    })}
                    altBase="소식지 이미지"
                  />
                  <div
                    className="news-detail-zoom-scope customer-app-news-modal__text-zoom"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                  >
                    <RichTextContent
                      value={selectedDetail?.content?.trim() || selectedItem.summary || ''}
                      className="news-text rich-text-content"
                      emptyText="본문이 없습니다."
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
