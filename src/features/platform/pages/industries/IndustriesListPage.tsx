import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import { createIndustry, fetchPlatformIndustries } from '../../api/platformAdminApi'
import type { IndustryStatus, PlatformIndustryRow } from '../../platformAdmin.types'
import IndustriesListMobileView from './IndustriesListMobileView'
import IndustriesListPCView from './IndustriesListPCView'
import type { IndustriesIndustryCreateSectionProps } from './IndustriesIndustryCreateSection'

const INDUSTRY_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

type CreateFieldErrors = {
  code?: string
  name?: string
  status?: string
}

function validateIndustryCreateDraft(input: {
  code: string
  name: string
  status: IndustryStatus
}): { ok: true } | { ok: false; fields: CreateFieldErrors } {
  const fields: CreateFieldErrors = {}
  const code = input.code.trim().toLowerCase()
  if (!code) {
    fields.code = 'code를 입력해 주세요.'
  } else if (!INDUSTRY_CODE_PATTERN.test(code)) {
    fields.code = 'code 형식이 올바르지 않습니다.'
  }
  const name = input.name.trim()
  if (!name) {
    fields.name = 'name을 입력해 주세요.'
  } else if (name.length > 200) {
    fields.name = 'name은 200자 이하여야 합니다.'
  }
  if (input.status !== 'active' && input.status !== 'inactive') {
    fields.status = 'status는 active 또는 inactive 여야 합니다.'
  }
  if (Object.keys(fields).length > 0) {
    return { ok: false, fields }
  }
  return { ok: true }
}

function mapCreateIndustryError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Industry를 생성하지 못했습니다.'
  }
  if (err.status === 401) {
    return '로그인이 필요하거나 세션이 만료되었습니다.'
  }
  if (err.status === 403) {
    return 'Industry 생성 권한이 없습니다.'
  }
  const msg = err.message.trim()
  return msg !== '' ? msg : 'Industry를 생성하지 못했습니다.'
}

export type IndustriesListViewProps = {
  items: PlatformIndustryRow[]
  loading: boolean
  listRefreshing: boolean
  error: string | null
  reload: () => Promise<void>
  create: IndustriesIndustryCreateSectionProps
}

export default function IndustriesListPage() {
  const { token } = useAuth()
  const [items, setItems] = useState<PlatformIndustryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listRefreshing, setListRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draftCode, setDraftCode] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftStatus, setDraftStatus] = useState<IndustryStatus>('active')

  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [createSubmitError, setCreateSubmitError] = useState<string | null>(null)
  const [createFieldErrors, setCreateFieldErrors] = useState<CreateFieldErrors>({})

  const clearCreateFeedback = useCallback(() => {
    setCreateSuccess(null)
    setCreateSubmitError(null)
    setCreateFieldErrors({})
  }, [])

  const reload = useCallback(
    async (opts?: { background?: boolean }) => {
      const bg = opts?.background === true
      if (!token) {
        return
      }
      try {
        if (bg) {
          setListRefreshing(true)
        } else {
          setLoading(true)
          setError(null)
        }
        const res = await fetchPlatformIndustries(token)
        setItems(res.items)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Industry 목록을 불러오지 못했습니다.')
      } finally {
        if (bg) {
          setListRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [token],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const touchCreateForm = useCallback(() => {
    clearCreateFeedback()
  }, [clearCreateFeedback])

  const handleCreateSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!token) {
        return
      }

      touchCreateForm()

      const codeNorm = draftCode.trim().toLowerCase()
      setDraftCode(codeNorm)

      const nameTrim = draftName.trim()

      const v = validateIndustryCreateDraft({
        code: codeNorm,
        name: nameTrim,
        status: draftStatus,
      })
      if (!v.ok) {
        setCreateFieldErrors(v.fields)
        return
      }

      setCreateSubmitting(true)
      try {
        await createIndustry(token, {
          code: codeNorm,
          name: nameTrim,
          status: draftStatus,
          config: {},
        })
        setCreateSuccess('Industry가 생성되었습니다.')
        setDraftCode('')
        setDraftName('')
        setDraftStatus('active')
        await reload({ background: true })
      } catch (err) {
        setCreateSubmitError(mapCreateIndustryError(err))
      } finally {
        setCreateSubmitting(false)
      }
    },
    [token, draftCode, draftName, draftStatus, reload, touchCreateForm],
  )

  const createProps: IndustriesIndustryCreateSectionProps = {
    code: draftCode,
    name: draftName,
    status: draftStatus,
    submitting: createSubmitting,
    disabled: !token,
    successMessage: createSuccess,
    submitError: createSubmitError,
    codeFieldError: createFieldErrors.code ?? null,
    nameFieldError: createFieldErrors.name ?? null,
    statusFieldError: createFieldErrors.status ?? null,
    onCodeChange: (value) => {
      touchCreateForm()
      setDraftCode(value)
    },
    onNameChange: (value) => {
      touchCreateForm()
      setDraftName(value)
    },
    onStatusChange: (value) => {
      touchCreateForm()
      setDraftStatus(value)
    },
    onSubmit: handleCreateSubmit,
  }

  const viewProps: IndustriesListViewProps = {
    items,
    loading,
    listRefreshing,
    error,
    reload,
    create: createProps,
  }

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
      </div>
      <ResponsiveLayout<IndustriesListViewProps>
        PC={IndustriesListPCView}
        Mobile={IndustriesListMobileView}
        viewProps={viewProps}
      />
    </>
  )
}
