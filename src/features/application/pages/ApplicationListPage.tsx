import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { EmptyState } from '../../../components/feedback'
import { FormButton } from '../../../components/form'
import type { InsuranceApplicationRecord } from '../domain/types'
import {
  deleteApplication,
  listApplications,
  renewApplication,
} from '../repository/applicationRepository'
import { formatKoreanDateTime } from '../utils/date'
import { useAuth } from '../../auth/AuthProvider'

export function ApplicationListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [records, setRecords] = useState<InsuranceApplicationRecord[]>([])
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!token) {
        return
      }
      try {
        const result = await listApplications(token)
        if (!active) {
          return
        }
        setRecords(result)
      } catch (error) {
        if (!active) {
          return
        }
        setStatusText(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [location.key, token])

  const handleRenew = async (id: string) => {
    if (!token) {
      return
    }
    const ok = await confirm({
      title: '신청서 갱신',
      message: '만기일(또는 만기일자 필드)을 기준으로 1년 연장한 새 신청서를 만듭니다. 계속할까요?',
      confirmLabel: '계속',
    })
    if (!ok) {
      return
    }
    try {
      const created = await renewApplication(id, token)
      navigate(`/form/${created.id}/edit`)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '갱신 신청서 생성에 실패했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!token) {
      return
    }
    try {
      await deleteApplication(id, token)
      setRecords((previous) => previous.filter((record) => record.id !== id))
      setStatusText('신청서를 삭제했습니다.')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <main className="insurance-dark-forms page page--with-back">
      <header className="page-header">
        <h1>내 신청서 목록</h1>
        <p>{statusText || '저장된 신청서를 불러오거나 수정/삭제할 수 있습니다.'}</p>
      </header>

      <div className="card card--actions">
        <FormButton
          className="button button--primary button--full"
          onClick={() => navigate('/application/write')}
          htmlType="button"
          variant="primary"
        >
          신규 신청서 작성
        </FormButton>
      </div>

      <section className="list-section">
        <h2>저장된 신청서</h2>
        {records.length === 0 ? (
          <EmptyState message="저장된 신청서가 없습니다." />
        ) : (
          <ul className="record-list">
            {records.map((record) => (
              <li key={record.id} className="record-card">
                <p className="record-card__title">{record.title}</p>
                <p className="record-card__meta">
                  수정일: {formatKoreanDateTime(record.updatedAt)}
                </p>
                <div className="record-card__actions">
                  <FormButton
                    className="button button--secondary"
                    htmlType="button"
                    variant="secondary"
                    onClick={() => navigate(`/form/${record.id}/edit?mode=readonly`)}
                  >
                    불러오기
                  </FormButton>
                  <FormButton
                    className="button"
                    htmlType="button"
                    variant="action"
                    onClick={() => navigate(`/form/${record.id}/edit`)}
                  >
                    수정
                  </FormButton>
                  <FormButton
                    className="button button--secondary"
                    htmlType="button"
                    variant="secondary"
                    onClick={() => void handleRenew(record.id)}
                  >
                    갱신(1년)
                  </FormButton>
                  <FormButton
                    className="button"
                    htmlType="button"
                    variant="action"
                    onClick={() => void handleDelete(record.id)}
                  >
                    삭제
                  </FormButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmDialog}
    </main>
  )
}
