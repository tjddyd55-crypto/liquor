import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FileUploader from '../../../components/common/FileUploader'
import { StatusMessage } from '../../../components/feedback'
import { FormButton, FormTextarea } from '../../../components/form'
import {
  createCustomerClaimRequest,
  getCustomerAppProfile,
  requestClaimFilePresign,
  uploadCustomerClaimFileProxy,
} from '../api/customerAppApi'
import { readCustomerAppProfile } from '../session/customerAppSession'
import { useCustomerAppSession } from '../session/useCustomerAppSession'

interface UploadReadyFile {
  id: string
  file: File
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return '0 KB'
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.ceil(bytes / 1024)} KB`
}

function fileTypeLabel(file: File): string {
  const contentType = file.type || 'application/octet-stream'
  if (contentType === 'application/pdf') {
    return 'PDF'
  }
  if (contentType.startsWith('image/')) {
    return 'IMG'
  }
  return 'FILE'
}

export default function CustomerAppRequestComposePage() {
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const [profile, setProfile] = useState(() => readCustomerAppProfile())
  const [memo, setMemo] = useState('')
  const [files, setFiles] = useState<UploadReadyFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => {
    if (!session) {
      navigate('/customer-app', { replace: true })
    }
  }, [navigate, session])

  useEffect(() => {
    if (!session) {
      return
    }
    let mounted = true
    const run = async () => {
      try {
        const remoteProfile = await getCustomerAppProfile(session.appToken)
        if (!mounted || !remoteProfile) {
          return
        }
        setProfile({
          name: remoteProfile.name,
          birthDate: remoteProfile.birthDate,
          phone: remoteProfile.phone,
          savedAt: remoteProfile.savedAt,
        })
      } catch {
        // 조회 실패 시 로컬 캐시를 유지한다.
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [session])

  if (!session) {
    return (
      <main className="content-wrapper py-6 max-w-xl">
        <section className="customer-app-claim-card">
          <h1 className="customer-app-claim-section-title">고객 앱 연결 필요</h1>
          <p className="customer-app-claim-section-description">요청 작성 전에 설계사 링크로 먼저 연결해 주세요.</p>
          <Link to="/customer-app" className="customer-app-claim-profile__button">
            연결 화면으로 이동
          </Link>
        </section>
      </main>
    )
  }

  const validateClaimFile = (file: File): string | null => {
    const contentType = file.type || 'application/octet-stream'
    const isPdf = contentType === 'application/pdf'
    const isImage = contentType.startsWith('image/')
    if (!isPdf && !isImage) {
      return '이미지 또는 PDF 파일만 업로드할 수 있습니다.'
    }
    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return '파일은 최대 10MB까지 업로드할 수 있습니다.'
    }
    return null
  }

  const handleAppendFiles = (selectedFiles: File[]) => {
    const mapped: UploadReadyFile[] = selectedFiles.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
    }))
    if (mapped.length > 0) {
      setError('')
    }
    setFiles((prev) => [...prev, ...mapped])
  }

  const handleRemoveFile = (targetId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== targetId))
  }

  const uploadSingleFile = async (file: File): Promise<string> => {
    const contentType = file.type || 'application/octet-stream'
    const presign = await requestClaimFilePresign(session.appToken, {
      fileName: file.name,
      contentType,
      fileSize: file.size,
    })
    const tryProxyUpload = async () => {
      await uploadCustomerClaimFileProxy(session.appToken, {
        storageKey: presign.storageKey,
        contentType,
        fileSize: file.size,
        file,
      })
    }
    if (presign.uploadMethod === 'proxy' || !presign.uploadUrl) {
      await tryProxyUpload()
      return presign.storageKey
    }
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...(presign.putHeaders ?? {}),
    }
    try {
      const response = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers,
        body: file,
      })
      if (!response.ok) {
        await tryProxyUpload()
      }
    } catch {
      await tryProxyUpload()
    }
    return presign.storageKey
  }

  const handleSubmit = async () => {
    if (!profile) {
      setError('청구 요청 전에 내정보를 먼저 저장해 주세요.')
      navigate('/customer-app/profile')
      return
    }
    if (!memo.trim()) {
      setError('청구 내용을 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    setResult('')
    try {
      const uploadedFiles = []
      for (const item of files) {
        const storageKey = await uploadSingleFile(item.file)
        uploadedFiles.push({
          storageKey,
          fileName: item.file.name,
          contentType: item.file.type,
          fileSize: item.file.size,
        })
      }
      await createCustomerClaimRequest(session.appToken, {
        memo: memo.trim(),
        files: uploadedFiles,
        requester: {
          name: profile.name,
          birthDate: profile.birthDate,
          phone: profile.phone,
        },
      })
      setResult('요청이 전송되었습니다.')
      setMemo('')
      setFiles([])
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '요청 전송에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="customer-app-claim-page">
      <StatusMessage message={error} tone="error" />
        <StatusMessage message={result} tone="success" />

        <section className="customer-app-claim-card customer-app-claim-profile">
          <div className="customer-app-claim-profile__main">
            <div className="customer-app-claim-profile__label">요청자 정보</div>
            {profile ? (
              <>
                <div className="customer-app-claim-profile__name">{profile.name}</div>
                <div className="customer-app-claim-profile__sub">
                  {profile.birthDate} · {profile.phone}
                </div>
              </>
            ) : (
              <div className="customer-app-claim-profile__sub">내정보가 저장되지 않았습니다.</div>
            )}
          </div>
          <Link to="/customer-app/profile" className="customer-app-claim-profile__button">
            내정보 수정
          </Link>
        </section>

        <section className="customer-app-claim-card">
          <h2 className="customer-app-claim-section-title">청구 내용</h2>
          <p className="customer-app-claim-section-description">
            병원명, 사고/진료 내용, 요청사항을 간단히 적어 주세요.
          </p>
          <div className="customer-app-claim-field" style={{ marginTop: 12 }}>
            <span className="customer-app-claim-field__label">내용</span>
            <FormTextarea
              className="customer-app-claim-textarea"
              rows={5}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="예: 4월 25일 통원 치료 보험금 청구 요청합니다. 진료비 영수증과 세부내역서 첨부했습니다."
            />
          </div>
        </section>

        <section className="customer-app-claim-card">
          <h2 className="customer-app-claim-section-title">첨부 파일</h2>
          <p className="customer-app-claim-section-description">
            영수증, 진료비 세부내역서, 처방전 등 이미지를 첨부할 수 있습니다.
          </p>
          <div style={{ marginTop: 12 }}>
            <FileUploader
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              validateFile={validateClaimFile}
              onFiles={handleAppendFiles}
              onInvalidBatch={(failures) => {
                const firstMessage = failures[0]?.message
                if (firstMessage) {
                  setError(firstMessage)
                }
              }}
              disabled={busy}
              primaryHint="이미지 또는 PDF를 선택해 주세요."
              hintLines={['JPG · PNG · WEBP · GIF · PDF', '각 파일 최대 10MB']}
            />
            {files.length > 0 ? (
              <ul className="customer-app-claim-file-list">
                {files.map((item) => (
                  <li key={item.id} className="customer-app-claim-file-row">
                    <span className="customer-app-claim-file-row__icon">{fileTypeLabel(item.file)}</span>
                    <div className="customer-app-claim-file-row__main">
                      <div className="customer-app-claim-file-row__name">{item.file.name}</div>
                      <div className="customer-app-claim-file-row__meta">{formatFileSize(item.file.size)}</div>
                    </div>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      className="!h-8 !px-3 text-[12px]"
                      onClick={() => handleRemoveFile(item.id)}
                    >
                      삭제
                    </FormButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <div className="customer-app-claim-actions">
          <FormButton htmlType="button" variant="primary" onClick={() => void handleSubmit()} loading={busy}>
            요청 전송
          </FormButton>
          <FormButton htmlType="button" variant="secondary" onClick={() => navigate('/customer-app/requests')}>
            내역 보기
          </FormButton>
        </div>
      </div>
  )
}
