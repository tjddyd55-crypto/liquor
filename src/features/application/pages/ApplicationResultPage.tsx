import { FormButton } from '../../../components/form'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { InsuranceResultTemplate } from '../components/InsuranceResultTemplate'
import type { InsuranceApplicationRecord } from '../domain/types'
import { getApplicationById, saveApplication } from '../repository/applicationRepository'
import { exportResultToJpg, exportResultToPdf } from '../services/exportService'
import { useAuth } from '../../auth/AuthProvider'

function buildDownloadFileNameBase(record: InsuranceApplicationRecord): string {
  const ownerName = record.ownerName.trim() || '이름없음'
  const vehicleNumber = record.vehicleNumber.trim() || '차량번호없음'
  return `${ownerName}_${vehicleNumber}`
}

export function ApplicationResultPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { token } = useAuth()
  const resultRef = useRef<HTMLDivElement>(null)
  const [record, setRecord] = useState<InsuranceApplicationRecord | null>(null)
  const [statusText, setStatusText] = useState('결과문을 불러오는 중입니다.')

  useEffect(() => {
    let active = true
    async function loadResult() {
      if (!id || !token) {
        return
      }

      const loadedRecord = await getApplicationById(id, token)
      if (!active) {
        return
      }
      setRecord(loadedRecord)
      setStatusText(loadedRecord ? '' : '결과문을 찾을 수 없습니다.')
    }

    void loadResult()
    return () => {
      active = false
    }
  }, [id, token])

  if (!record) {
    return (
      <main className="insurance-dark-forms page page--with-back">
        <header className="page-header">
          <h1>결과문을 찾을 수 없습니다.</h1>
          <p>저장된 신청서에서 다시 불러와 주세요.</p>
        </header>
        <FormButton
          className="button button--primary"
          htmlType="button"
          onClick={() => navigate('/')}
        >
          목록으로 이동
        </FormButton>
      </main>
    )
  }

  const handleSave = () => {
    if (!token) {
      setStatusText('로그인이 필요합니다.')
      return
    }

    void (async () => {
      try {
        const saved = await saveApplication(record, token, record.id)
        setRecord(saved)
        setStatusText('신청서를 저장했습니다.')
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : '저장에 실패했습니다.')
      }
    })()
  }

  const handleExportJpg = async () => {
    if (!resultRef.current) {
      return
    }

    try {
      await exportResultToJpg(resultRef.current, buildDownloadFileNameBase(record))
      setStatusText('JPG 파일을 다운로드했습니다.')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'JPG 생성에 실패했습니다.')
    }
  }

  const handleExportPdf = async () => {
    if (!resultRef.current) {
      return
    }

    try {
      await exportResultToPdf(resultRef.current, buildDownloadFileNameBase(record))
      setStatusText('PDF 파일을 다운로드했습니다.')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.')
    }
  }

  const fileTitle = buildDownloadFileNameBase(record)

  return (
    <main className="insurance-dark-forms page page--result page--with-back">
      <header className="page-header">
        <h1>신청서 결과문</h1>
        <p>{statusText || '양식 미리보기에서 JPG/PDF 다운로드를 실행할 수 있습니다.'}</p>
      </header>

      <div className="result-wrapper">
        <div className="result-canvas" ref={resultRef}>
          <InsuranceResultTemplate data={record} />
        </div>
      </div>

      <div className="sticky-actions">
        <FormButton
          className="button"
          htmlType="button"
          onClick={() => navigate(`/form/${record.id}/edit`)}
        >
          수정하기
        </FormButton>
        <FormButton className="button button--primary" htmlType="button" onClick={handleSave}>
          저장
        </FormButton>
        <FormButton className="button" htmlType="button" onClick={handleExportJpg}>
          JPG 다운로드
        </FormButton>
        <FormButton className="button" htmlType="button" onClick={handleExportPdf}>
          PDF 다운로드
        </FormButton>
      </div>

      <p className="result-file-name">내보내기 파일명 기준: {fileTitle}</p>
    </main>
  )
}
