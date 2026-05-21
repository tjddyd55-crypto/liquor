import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RegisterPage } from '../../auth/pages/RegisterPage'

/**
 * /government/join/:agencyCode — agencyCode 를 가입 코드 입력란에 프리필.
 * RegisterPage 자체는 수정하지 않고 wrapper 에서 sessionStorage 로 전달.
 */
export default function GovernmentJoinPage() {
  const { agencyCode } = useParams()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const code = String(agencyCode ?? '').trim().toUpperCase()
    if (code) {
      sessionStorage.setItem('government_join_agency_code', code)
    }
    setReady(true)
  }, [agencyCode])

  if (!ready) return null
  return <RegisterPage signupIndustry="government" />
}
