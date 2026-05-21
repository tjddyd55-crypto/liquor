import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SetStateAction,
  type TouchEvent,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { getPublicOrigin } from '../../../lib/publicOrigin'
import { copyTextToClipboard } from '../../../lib/clipboard'
import { useAuth } from '../../auth/AuthProvider'
import { isCarInsuranceFeatureEnabledForGa } from '../../dashboard/gaTenantMenu'
import { deleteCustomer, listCustomers, updateCustomer } from '../api/customersApi'
import { listCustomerCars } from '../api/customerCarsApi'
import type { CustomerRecord } from '../domain/types'
import {
  buildCrmExtensionPayloadForSave,
} from '../domain/crmExtension'
import type { CustomerSortType } from '../types/customerListSort'
import { customerNoteItems } from '../domain/types'
import { buildKakaoCustomerCopyText } from '../utils/customerText'
import { exportCustomersExcel } from '../utils/exportCustomersExcel'
import {
  CUSTOMER_MEDICAL_QUESTION_HINT,
  CUSTOMER_MEDICAL_QUESTION_TEXT,
  formatCustomerPhoneUi,
  formatCustomerSsnUi,
} from '../utils/customerDisplayFormat'
import {
  CustomerForm,
  InsuranceInline,
  drivingText,
} from '../../../components/customer/CustomerForm'
import useIsMobile from '../../../hooks/useIsMobile'
import { useDebounce } from '../../../hooks/useDebounce'
import { ExitConfirmDialog } from '../../../components/ExitConfirmDialog'
import { MSG_CUSTOMER_CREATE_EXIT } from '../../../navigation/backNavigationPolicy'
import { searchCustomersAdvanced, type CustomerConsultationRow } from '../api/customerExtraApi'
import { formatAddressForSave, FormButton, FormInput, FormTextarea } from '../../../components/form'
import { useGaSettings } from '../../ga-settings/useGaSettings'
import { CustomerRelationsStrip } from '../components/CustomerRelationsStrip'
import CustomerMobileModals from '../components/CustomerMobileModals'
import CustomerPageHeaderActions from '../components/CustomerPageHeaderActions'
import { CustomerFilterControls } from '../components/CustomerFilterControls'
import CustomerExcelSelectToolbar from '../components/CustomerExcelSelectToolbar'
import CustomerListCard, { type CustomerSsnDupHighlight } from '../components/CustomerListCard'
import type { CustomerEditFormState } from '../types/customerEditForm'
import { useCustomerExpandedCardScroll } from '../hooks/useCustomerExpandedCardScroll'
import { useCustomerCrmIndustryContext } from '../hooks/useCustomerCrmIndustryContext'
import { useCustomerExcelSelection } from '../hooks/useCustomerExcelSelection'
import { getCustomerListMetrics } from '../utils/customerListMetrics'
import {
  type CustomerAdvancedFilters,
  EMPTY_ADVANCED_FILTERS,
  customerRenewalYmd,
  customerPassesAdvancedFilters,
  ymdAscSortKey,
  parseCreatedAtMs,
  normalizeYmd,
  parseYmdMs,
} from '../utils/customerListFilters'
import { buildSsnDuplicateHighlightByCustomerId } from '../utils/customerSsnDuplicateHighlight'
import {
  recordToEditForm,
  normalizeBirthDateForSaveApi,
  normalizeCustomerEditCarYearForApi,
  normalizeCustomerEditRenewalDateForApi,
} from '../utils/customerEditFormState'
import { getCustomerIndustryTemplateFormValidationError } from '../utils/customerIndustryTemplateFormValidation'
import { normalizeCustomerCarsForSave, pickPrimaryCustomerCar } from '../utils/customerCarFormUtils'
import {
  customerCarRecordToFormItem,
  saveCustomerCarsForCustomer,
} from '../utils/customerCarsSaveUtils'
import {
  isCustomerWorkspaceSideDetailPath,
  resolveCustomerWorkspaceTab,
  parseSelectedCustomerId,
} from '../utils/customerWorkspaceNavigation'
import {
  INVITE_COPY_POINTER_DEBOUNCE_MS,
} from '../utils/customerInviteClipboard'
import { coerceCustomersStatePayload } from '../utils/customerStateGuards'
import {
  CUSTOMER_LIST_PATH,
  CUSTOMER_CREATE_MODE_QUERY,
  buildCustomerWorkspacePath,
  buildCustomerListPath,
} from '../utils/customerRoutePaths'
import CustomersPageMobileView from './customers/CustomersPageMobileView'
import CustomersPagePCView from './customers/CustomersPagePCView'

export type CustomersPageProps = {
  openRelatedCustomerRef?: MutableRefObject<
    ((customerId: number, customerName?: string) => void) | null
  >
}

export default function CustomersPage({ openRelatedCustomerRef }: CustomersPageProps = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  /**
   * 고객등록 → 목록: 반드시 replace. setSearchParams({}) / blocker.proceed() 사용 금지(히스토리 중복·이중 POP).
   * 차단 중이면 reset()만 하고 이 함수로 이동한다.
   */
  const navigateToCustomerListReplace = useCallback(() => {
    navigate(CUSTOMER_LIST_PATH, { replace: true })
  }, [navigate])
  const { user, token } = useAuth()
  const crmIndustry = useCustomerCrmIndustryContext()
  const crmIndustryRef = useRef(crmIndustry)
  crmIndustryRef.current = crmIndustry
  const { gaSettings } = useGaSettings()
  const { confirm, confirmDialog } = useConfirmDialog()
  const carFeatureEnabled = isCarInsuranceFeatureEnabledForGa(user?.gaCode)
  const gaExcelEnabled = gaSettings.use_ga_excel === true
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [customersTotalCount, setCustomersTotalCount] = useState(0)
  const customersRef = useRef<CustomerRecord[]>([])
  customersRef.current = customers
  const [statusText, setStatusText] = useState('')
  const [mobileCopyFeedback, setMobileCopyFeedback] = useState<{
    customerId: number
    message: string
  } | null>(null)
  const mobileCopyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const tab = searchParams.get('mode') === 'create' ? 'create' : 'list'
  const selectedCustomerIdFromQuery = useMemo(
    () => parseSelectedCustomerId(searchParams.get('customerId')),
    [searchParams],
  )
  /**
   * `CustomersPage` 는 좌측 목록(카드 펼침)과 `?customerId=` 쿼리만 관리한다.
   * 선택된 고객 id 의 단일 진실 원천은 URL path 이며, 그 값의 소비는
   * `CustomerWorkspaceLayout` 이 path → query 순서로 파생한다
   * (routing-ssot.mdc §1 · §9).
   */
  const [expandedId, rawSetExpandedId] = useState<number | null>(() => {
    if (selectedCustomerIdFromQuery != null) {
      return selectedCustomerIdFromQuery
    }
    return null
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<CustomerEditFormState | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const editSavingRef = useRef(false)
  const [activeMobileModal, setActiveMobileModal] = useState<
    null | 'files' | 'consultations' | 'ga'
  >(null)
  const [activeMobileCustomerId, setActiveMobileCustomerId] = useState<number | null>(null)
  const [scrollRequestKey, setScrollRequestKey] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)
  const scrollCountRef = useRef(0)
  const expandedIdRef = useRef<number | null>(null)
  const editingIdRef = useRef<number | null>(null)
  const editFormRef = useRef<CustomerEditFormState | null>(null)
  expandedIdRef.current = expandedId
  editingIdRef.current = editingId
  editFormRef.current = editForm

  useCustomerExpandedCardScroll({
    expandedId,
    isMobile,
    scrollRequestKey,
  })

  /**
   * expandedId state 와 `?customerId=` 쿼리를 같은 호출에서 원자적으로 갱신하는 래퍼.
   *
   * side-detail path(`/customers/:id/<tab>`) 위에서는 query 를 건드리지 않는다.
   * 우측 패널(CustomerFiles/Memos 등) 이 해당 쿼리를 관장하므로, 목록의 접기·
   * 펼치기가 패널 URL 을 덮어쓰면 안 된다 (routing-ssot.mdc §11).
   *
   * useState 의 raw setter 를 감싸기 때문에 기존 호출부와 `useExpandableCard`
   * prop 에도 별도 변경 없이 URL 동기화가 따라붙는다.
   */
  const setExpandedId = useCallback<Dispatch<SetStateAction<number | null>>>(
    (updater) => {
      const prev = expandedIdRef.current
      const next =
        typeof updater === 'function'
          ? (updater as (prev: number | null) => number | null)(prev)
          : updater
      rawSetExpandedId(next)
      if (isCustomerWorkspaceSideDetailPath(location.pathname)) {
        return
      }
      const currentQueryId = parseSelectedCustomerId(searchParams.get('customerId'))
      if (currentQueryId === next) {
        return
      }
      const nextParams = new URLSearchParams(searchParams)
      if (next == null) {
        nextParams.delete('customerId')
      } else {
        nextParams.set('customerId', String(next))
      }
      setSearchParams(nextParams, { replace: true })
    },
    [location.pathname, searchParams, setSearchParams],
  )

  // NOTE: Router supports only one blocker. Global AppExitConfirm handles POP blocking (including customer create).
  const [searchInput, setSearchInput] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const keyword = useDebounce(searchInput, 180)
  const [sortType, setSortType] = useState<CustomerSortType>(null)
  const [advancedFilters, setAdvancedFilters] = useState<CustomerAdvancedFilters>(() => ({
    ...EMPTY_ADVANCED_FILTERS,
  }))
  const [deepSearch, setDeepSearch] = useState(false)
  const [advSearchHits, setAdvSearchHits] = useState<CustomerRecord[] | null>(null)
  const [advSearchLoading, setAdvSearchLoading] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const [customerCreateExitModalOpen, setCustomerCreateExitModalOpen] = useState(false)
  /** 터치→합성 mouse/click 등으로 초대 복사가 두 번 도는 것 방지 */
  const inviteCopyPointerTsRef = useRef(0)

  useEffect(() => {
    function onScroll() {
      setShowScrollToTop(window.scrollY > 300)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /** React Native WebView: 하드웨어 뒤로가기는 앱이 소비 후 이 이벤트만 전달 → ExitConfirmDialog 단일 표시 */
  useEffect(() => {
    if (tab !== 'create') {
      return
    }
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ reason?: string }>
      if (ce.detail?.reason !== 'customer-create-exit') {
        return
      }
      setCustomerCreateExitModalOpen(true)
    }
    window.addEventListener('insurance-native-back', handler as EventListener)
    return () => window.removeEventListener('insurance-native-back', handler as EventListener)
  }, [tab])

  useEffect(() => {
    if (tab !== 'list') {
      return
    }
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tab])

  const ssnDupHighlightByCustomerIdPrevRef = useRef<Map<number, CustomerSsnDupHighlight>>(new Map())
  const ssnDupHighlightByCustomerId = useMemo(() => {
    const built = buildSsnDuplicateHighlightByCustomerId(customers)
    const prev = ssnDupHighlightByCustomerIdPrevRef.current
    const next = new Map<number, CustomerSsnDupHighlight>()
    for (const [id, hi] of built) {
      const old = prev.get(id)
      const stable =
        old != null && old.groupLabel === hi.groupLabel && old.color === hi.color ? old : hi
      next.set(id, stable)
    }
    ssnDupHighlightByCustomerIdPrevRef.current = next
    return next
  }, [customers])

  const keywordFilteredCustomers = useMemo(() => {
    if (advSearchHits != null) {
      return advSearchHits
    }
    const q = keyword.trim()
    if (!q) {
      return customers
    }
    return customers.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q))
  }, [customers, keyword, advSearchHits])

  const filteredCustomers = useMemo(() => {
    let list = keywordFilteredCustomers.filter((c) => customerPassesAdvancedFilters(c, advancedFilters))
    if (favoriteOnly) {
      list = list.filter((c) => c.isFavorite)
    }
    return list
  }, [keywordFilteredCustomers, advancedFilters, favoriteOnly])

  const advancedFiltersActive = useMemo(() => {
    const f = advancedFilters
    return !!(f.minInsuranceAge.trim() || f.maxInsuranceAge.trim() || f.gender)
  }, [advancedFilters])

  const listIsNarrowed = useMemo(
    () =>
      keyword.trim() !== '' ||
      advancedFiltersActive ||
      favoriteOnly ||
      advSearchHits != null,
    [keyword, advancedFiltersActive, favoriteOnly, advSearchHits],
  )

  const sortedCustomers = useMemo(() => {
    const copy = [...filteredCustomers]
    const favoriteFirst = (a: CustomerRecord, b: CustomerRecord) =>
      Number(b.isFavorite) - Number(a.isFavorite)
    const tieName = (a: CustomerRecord, b: CustomerRecord) => a.name.localeCompare(b.name, 'ko')

    if (sortType === null) {
      copy.sort((a, b) => {
        const f = favoriteFirst(a, b)
        return f !== 0 ? f : tieName(a, b)
      })
    } else if (sortType === 'age') {
      copy.sort((a, b) => {
        const f = favoriteFirst(a, b)
        if (f !== 0) {
          return f
        }
        const ka = ymdAscSortKey(getCustomerListMetrics(a).maturityYmd)
        const kb = ymdAscSortKey(getCustomerListMetrics(b).maturityYmd)
        const cmp = ka.localeCompare(kb)
        return cmp !== 0 ? cmp : tieName(a, b)
      })
    } else if (sortType === 'car') {
      copy.sort((a, b) => {
        const f = favoriteFirst(a, b)
        if (f !== 0) {
          return f
        }
        const ka = ymdAscSortKey(customerRenewalYmd(a))
        const kb = ymdAscSortKey(customerRenewalYmd(b))
        const cmp = ka.localeCompare(kb)
        return cmp !== 0 ? cmp : tieName(a, b)
      })
    } else {
      copy.sort((a, b) => {
        const f = favoriteFirst(a, b)
        if (f !== 0) {
          return f
        }
        const ta = parseYmdMs(a.lastConsultDate) || parseCreatedAtMs(a.createdAt)
        const tb = parseYmdMs(b.lastConsultDate) || parseCreatedAtMs(b.createdAt)
        if (tb !== ta) {
          return tb - ta
        }
        return tieName(a, b)
      })
    }
    return copy
  }, [filteredCustomers, sortType])

  const allVisibleIds = useMemo(() => sortedCustomers.map((c) => String(c.id)), [sortedCustomers])
  const defaultSelectedColumns = useMemo(() => ['name'], [])
  const onEnterExcelSelectMode = useCallback(() => {
    setExpandedId(null)
    setEditingId(null)
    setEditForm(null)
    setStatusText('')
  }, [setExpandedId])
  const {
    isSelectMode,
    setIsSelectMode,
    selectedCustomerIds,
    setSelectedCustomerIds,
    selectedColumns,
    setSelectedColumns,
    isColumnPickerOpen,
    setIsColumnPickerOpen,
    selectAllRef,
    allVisibleSelected,
    enterExcelSelectMode,
    exitExcelSelectMode,
    toggleSelectAll,
    toggleExcelColumn,
  } = useCustomerExcelSelection({
    visibleCustomerIds: allVisibleIds,
    defaultSelectedColumns,
    onEnterExcelSelectMode,
  })

  const loadCustomers = useCallback(async () => {
    if (!token || user?.role !== 'USER') {
      setIsLoading(false)
      setCustomersTotalCount(0)
      return
    }
    setIsLoading(true)
    try {
      const { customers: rows, total } = await listCustomers(token)
      const safeData = coerceCustomersStatePayload(rows)
      setCustomers(safeData)
      setCustomersTotalCount(total)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role])

  const handleToggleFavorite = useCallback(
    async (c: CustomerRecord) => {
      if (!token?.trim()) {
        return
      }
      const targetId = c.id
      const previousFavorite = c.isFavorite
      const nextFavorite = !previousFavorite
      setCustomers((prev) =>
        prev.map((row) =>
          row.id === targetId ? { ...row, isFavorite: !row.isFavorite } : row,
        ),
      )
      setAdvSearchHits((hits) =>
        hits == null
          ? null
          : hits.map((row) =>
              row.id === targetId ? { ...row, isFavorite: !row.isFavorite } : row,
            ),
      )
      try {
        await updateCustomer(token, targetId, { isFavorite: nextFavorite })
      } catch (error) {
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === targetId ? { ...row, isFavorite: previousFavorite } : row,
          ),
        )
        setAdvSearchHits((hits) =>
          hits == null
            ? null
            : hits.map((row) =>
                row.id === targetId ? { ...row, isFavorite: previousFavorite } : row,
              ),
        )
        setStatusText(error instanceof Error ? error.message : '즐겨찾기 변경에 실패했습니다.')
      }
    },
    [token],
  )

  /**
   * 카드 요약 클릭의 부수 작업만 담당한다 (routing-ssot.mdc §4).
   * expandedId 토글·접기 애니메이션은 `useExpandableCard.toggleExpanded` 전담이며,
   * 이 핸들러는 (1) 펼친 카드 스크롤 요청, (2) PC 에서는 우측 워크스페이스
   * path 이동 두 가지만 수행한다.
   */
  const handleSelectCustomer = useCallback(
    (c: CustomerRecord) => {
      setScrollRequestKey((prev) => prev + 1)
      if (isMobile) {
        return
      }
      const safeTab = resolveCustomerWorkspaceTab(location.pathname)
      const next = new URLSearchParams(searchParams)
      next.set('customerId', String(c.id))
      navigate(
        buildCustomerWorkspacePath({ customerId: c.id, tab: safeTab, query: next }),
        {
          replace: true,
          state: { customerName: c.name },
        },
      )
    },
    [isMobile, location.pathname, navigate, searchParams],
  )

  const handleOpenRelatedCustomer = useCallback(
    (customerId: number, customerName?: string) => {
      // 연계고객 클릭은 "검색"이 아니라 해당 고객 선택/펼침으로 동작해야 한다.
      setSearchInput('')
      setDeepSearch(false)
      setFavoriteOnly(false)
      setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS })
      setAdvSearchHits(null)
      setExpandedId(customerId)
      setScrollRequestKey((prev) => prev + 1)

      const next = new URLSearchParams(searchParams)
      next.delete('mode')
      next.set('customerId', String(customerId))

      if (isMobile) {
        navigate(buildCustomerListPath(next), {
          replace: true,
          state: customerName?.trim() ? { customerName } : undefined,
        })
        return
      }

      const safeTab = resolveCustomerWorkspaceTab(location.pathname)
      navigate(
        buildCustomerWorkspacePath({ customerId, tab: safeTab, query: next }),
        {
          replace: true,
          state: customerName?.trim() ? { customerName } : undefined,
        },
      )
    },
    [isMobile, location.pathname, navigate, searchParams, setExpandedId],
  )

  useEffect(() => {
    if (!openRelatedCustomerRef) {
      return
    }
    openRelatedCustomerRef.current = handleOpenRelatedCustomer
    return () => {
      openRelatedCustomerRef.current = null
    }
  }, [openRelatedCustomerRef, handleOpenRelatedCustomer])

  useEffect(() => {
    if (user?.role !== 'USER') {
      setIsLoading(false)
      return
    }
    void loadCustomers()
  }, [user?.role, loadCustomers])

  /**
   * 카드 펼침(expandedId) 은 요약 클릭 이벤트로만 바꾼다.
   * `?customerId=` 는 우측 패널(CustomerFiles/Memos 등) 이 유지할 수 있으므로
   * 쿼리 변화에 반응해 펼침을 강제하지 않는다 (routing-ssot.mdc §11).
   * 펼침 후 스크롤 보정은 `useCustomerExpandedCardScroll` (scrollRequestKey 연동).
   */

  useEffect(() => {
    if (expandedId == null) {
      return
    }
    const inMainList = customers.some((c) => c.id === expandedId)
    const inAdvHits = advSearchHits?.some((c) => c.id === expandedId) ?? false
    if (!inMainList && !inAdvHits) {
      setExpandedId(null)
    }
  }, [customers, advSearchHits, expandedId, setExpandedId])

  useEffect(() => {
    const valid = new Set(customers.map((c) => String(c.id)))
    setSelectedCustomerIds((prev) => {
      const next = prev.filter((id) => valid.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [customers])

  useEffect(() => {
    if (!deepSearch || !token || user?.role !== 'USER') {
      setAdvSearchHits(null)
      setAdvSearchLoading(false)
      return
    }
    const q = keyword.trim()
    if (!q) {
      setAdvSearchHits(null)
      setAdvSearchLoading(false)
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void (async () => {
        setAdvSearchLoading(true)
        try {
          const rows = await searchCustomersAdvanced(token, { q, includeRelations: false, limit: 500 })
          if (!cancelled) {
            setAdvSearchHits(coerceCustomersStatePayload(rows))
          }
        } catch (error) {
          if (!cancelled) {
            setStatusText(error instanceof Error ? error.message : '심층 검색에 실패했습니다.')
            setAdvSearchHits(null)
          }
        } finally {
          if (!cancelled) {
            setAdvSearchLoading(false)
          }
        }
      })()
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [deepSearch, keyword, token, user?.role])

  useEffect(() => {
    if (editingId != null && expandedId !== editingId) {
      setEditingId(null)
      setEditForm(null)
    }
  }, [expandedId, editingId])

  useEffect(() => {
    if (tab !== 'list' && isSelectMode) {
      setIsSelectMode(false)
      setSelectedCustomerIds([])
      setSelectedColumns([])
      setIsColumnPickerOpen(false)
    }
  }, [tab, isSelectMode])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditForm(null)
  }, [])

  const handleUpdateCustomer = useCallback(async () => {
    if (!token?.trim()) {
      const msg = '로그인이 필요합니다.'
      setStatusText(msg)
      return
    }
    if (user?.role !== 'USER') {
      const msg = '고객 정보를 수정할 권한이 없습니다.'
      setStatusText(msg)
      return
    }
    const activeEditingId = editingIdRef.current
    const activeEditForm = editFormRef.current
    if (activeEditingId == null || !activeEditForm) {
      const msg = '수정 중인 고객이 없습니다.'
      setStatusText(msg)
      return
    }
    const base = customersRef.current.find((x) => x.id === activeEditingId)
    if (!base) {
      const msg = '고객 정보를 찾을 수 없습니다.'
      setStatusText(msg)
      return
    }
    const crm = crmIndustryRef.current
    if (crm.isInsuranceLayout) {
      const name = activeEditForm.name.trim()
      if (!name) {
        const msg = '이름은 필수입니다.'
        setStatusText(msg)
        return
      }
    } else {
      const verr = getCustomerIndustryTemplateFormValidationError(activeEditForm, crm.resolvedTemplate)
      if (verr) {
        setStatusText(verr)
        return
      }
    }
    const name = activeEditForm.name.trim()
    const normalizedCars = normalizeCustomerCarsForSave(activeEditForm.cars)
    const primaryCar = pickPrimaryCustomerCar(normalizedCars)
    const carYearForApi = normalizeCustomerEditCarYearForApi(primaryCar?.carYear)
    const renewalDateForApi = normalizeCustomerEditRenewalDateForApi(primaryCar?.renewalDate)
    const birthDateForApi = normalizeBirthDateForSaveApi(activeEditForm.birthDate)
    try {
      const industryExt =
        crm.isInsuranceLayout ?
          {}
        : {
            crmExtension: buildCrmExtensionPayloadForSave(activeEditForm.crmExtensionFields) ?? {
              v: 1,
              fields: {},
            },
          }
      await updateCustomer(token, activeEditingId, {
        name,
        ssn: activeEditForm.ssn,
        phone: activeEditForm.phone,
        carrier: String(activeEditForm.carrier ?? '').trim(),
        ...(birthDateForApi != null ? { birthDate: birthDateForApi } : {}),
        address: formatAddressForSave({
          zonecode: activeEditForm.zonecode ?? '',
          baseAddress: activeEditForm.address ?? '',
          detailAddress: activeEditForm.addressDetail ?? '',
        }),
        height: activeEditForm.height,
        weight: activeEditForm.weight,
        job: activeEditForm.job,
        driving: drivingText(activeEditForm.isDriver),
        medical: activeEditForm.medical,
        gender: activeEditForm.gender,
        isDriver: activeEditForm.isDriver,
        carType: activeEditForm.carType.trim(),
        notes: {
          items: customerNoteItems(base),
          insuranceHistory: activeEditForm.insuranceHistory.trim(),
        },
        carNumber: primaryCar?.carNumber ?? '',
        carModel: primaryCar?.carModel ?? '',
        carYear: carYearForApi,
        renewalDate: renewalDateForApi,
        isFavorite: base.isFavorite === true,
        ...industryExt,
      })
      try {
        if (token?.trim() && crmIndustryRef.current.isInsuranceLayout) {
          await saveCustomerCarsForCustomer({
            token,
            customerId: activeEditingId,
            formCars: activeEditForm.cars,
          })
        }
      } catch {
        setStatusText(
          '고객 정보는 수정했습니다. 자동차 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        )
        cancelEdit()
        await loadCustomers()
        return
      }
      setStatusText('고객 정보를 수정했습니다.')
      cancelEdit()
      await loadCustomers()
    } catch (error) {
      const msg = error instanceof Error ? error.message : '수정에 실패했습니다.'
      setStatusText(msg)
    }
  }, [token, user?.role, cancelEdit, loadCustomers])

  const handleEditSaveRequest = useCallback(async () => {
    if (editSavingRef.current) {
      return
    }
    editSavingRef.current = true
    setEditSaving(true)
    try {
      await handleUpdateCustomer()
    } finally {
      editSavingRef.current = false
      setEditSaving(false)
    }
  }, [handleUpdateCustomer])

  const handleEditFormSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      await handleEditSaveRequest()
    },
    [handleEditSaveRequest],
  )

  const copyCustomer = useCallback(
    async (rec: CustomerRecord) => {
      const text = buildKakaoCustomerCopyText(rec)
      const ok = await copyTextToClipboard(text)
      const msg = ok ? '고객정보가 복사되었습니다.' : '복사에 실패했습니다.'
      setStatusText(msg)
      if (isMobile) {
        if (mobileCopyFeedbackTimerRef.current != null) {
          window.clearTimeout(mobileCopyFeedbackTimerRef.current)
        }
        setMobileCopyFeedback({ customerId: rec.id, message: msg })
        mobileCopyFeedbackTimerRef.current = window.setTimeout(() => {
          setMobileCopyFeedback(null)
          mobileCopyFeedbackTimerRef.current = null
        }, 4500)
      }
      const scrollCopyUi = () => {
        if (isMobile) {
          document
            .getElementById(`customer-${rec.id}-copy-feedback`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return
        }
        document.getElementById('customers-page-status')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          scrollCopyUi()
          window.setTimeout(scrollCopyUi, 120)
        })
      })
    },
    [isMobile],
  )

  const handleDeleteCustomer = useCallback(
    async (c: CustomerRecord) => {
      if (!token || user?.role !== 'USER') {
        return
      }
      const confirmed = await confirm({
        title: '고객 삭제',
        message: `고객 "${c.name}"(번호 ${c.id})를 목록에서 삭제할까요? 기존 신청서의 고객 연결(customer_id)은 유지됩니다.`,
        confirmLabel: '삭제',
        tone: 'danger',
      })
      if (!confirmed) {
        return
      }
      try {
        await deleteCustomer(token, c.id)
        if (expandedIdRef.current === c.id) {
          setExpandedId(null)
        }
        if (editingIdRef.current === c.id) {
          cancelEdit()
        }
        setStatusText('고객을 삭제했습니다.')
        await loadCustomers()
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : '삭제에 실패했습니다.')
      }
    },
    [token, user?.role, cancelEdit, loadCustomers, confirm, setExpandedId],
  )

  const startEdit = useCallback(
    (cl: CustomerRecord) => {
      setExpandedId(cl.id)
      setEditingId(cl.id)
      const base = recordToEditForm(cl)
      setEditForm(base)
      if (!token?.trim()) {
        return
      }
      if (!crmIndustryRef.current.isInsuranceLayout) {
        return
      }
      const customerId = cl.id
      void (async () => {
        try {
          const serverCars = await listCustomerCars(token, cl.id)
          if (serverCars.length > 0) {
            setEditForm((prev) =>
              editingIdRef.current === customerId && prev ? { ...prev, cars: serverCars.map(customerCarRecordToFormItem) } : prev,
            )
          }
        } catch {
          setStatusText('자동차 목록을 불러오지 못했습니다. 기본 차량 정보로 편집합니다.')
        }
      })()
    },
    [token, setExpandedId],
  )

  const openMobileModal = useCallback(
    (modalType: 'files' | 'consultations' | 'ga', customerId: number) => {
      if (!isMobile) {
        return
      }
      setActiveMobileCustomerId(customerId)
      setActiveMobileModal(modalType)
      window.history.pushState({ ...(window.history.state ?? {}), modal: true }, '')
    },
    [isMobile],
  )

  const closeMobileModal = useCallback(() => {
    if (!isMobile || activeMobileModal == null) {
      return
    }
    if (window.history.state?.modal === true) {
      window.history.back()
      return
    }
    setActiveMobileModal(null)
    setActiveMobileCustomerId(null)
  }, [activeMobileModal, isMobile])

  useEffect(() => {
    if (!isMobile) {
      return
    }
    const handlePopState = () => {
      if (activeMobileModal != null) {
        setActiveMobileModal(null)
        setActiveMobileCustomerId(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [activeMobileModal, isMobile])

  const handleOpenFilesModal = useCallback(
    (customerId: number) => {
      openMobileModal('files', customerId)
    },
    [openMobileModal],
  )

  const handleOpenConsultationsModal = useCallback(
    (customerId: number) => {
      openMobileModal('consultations', customerId)
    },
    [openMobileModal],
  )

  const handleOpenAutoModal = useCallback(
    (customerId: number) => {
      const hit =
        customers.find((c) => c.id === customerId) ??
        advSearchHits?.find((c) => c.id === customerId)
      const name = hit?.name?.trim() ?? ''
      const qs = name ? `?issuerCustomerName=${encodeURIComponent(name)}` : ''
      navigate(`/customers/${customerId}/application-documents${qs}`)
    },
    [navigate, customers, advSearchHits],
  )

  const handleOpenGaModal = useCallback(
    (customerId: number) => {
      openMobileModal('ga', customerId)
    },
    [openMobileModal],
  )

  const handleOpenClaims = useCallback(
    (customerId: number) => {
      const next = new URLSearchParams(searchParams)
      next.set('customerId', String(customerId))
      navigate(
        buildCustomerWorkspacePath({ customerId, tab: 'claim-requests', query: next }),
      )
    },
    [navigate, searchParams],
  )

  const handleOpenPersonalMessage = useCallback(
    (customerId: number) => {
      navigate(
        buildCustomerWorkspacePath({
          customerId,
          tab: 'claim-requests',
          query: new URLSearchParams([
            ['customerId', String(customerId)],
            ['claimTab', 'news-personal'],
          ]),
        }),
      )
    },
    [navigate],
  )

  const handleOpenMemos = useCallback(
    (customerId: number) => {
      const next = new URLSearchParams(searchParams)
      next.set('customerId', String(customerId))
      navigate(buildCustomerWorkspacePath({ customerId, tab: 'memos', query: next }))
    },
    [navigate, searchParams],
  )

  const handleCustomerConsultationCreated = useCallback(
    (customerId: number, row: Pick<CustomerConsultationRow, 'consultationDate' | 'createdAt'>) => {
      const dateFromRow = normalizeYmd(row.consultationDate)
      const dateFromCreatedAt = normalizeYmd(String(row.createdAt ?? '').slice(0, 10))
      const nextConsultDate = dateFromRow ?? dateFromCreatedAt
      if (!nextConsultDate) {
        return
      }

      const apply = (target: CustomerRecord): CustomerRecord => {
        const current = normalizeYmd(target.lastConsultDate)
        if (current != null && current >= nextConsultDate) {
          return target
        }
        return { ...target, lastConsultDate: nextConsultDate }
      }

      const sortByConsultDateDesc = (a: CustomerRecord, b: CustomerRecord) => {
        const ta = parseYmdMs(a.lastConsultDate)
        const tb = parseYmdMs(b.lastConsultDate)
        if (tb !== ta) {
          return tb - ta
        }
        return parseCreatedAtMs(b.createdAt) - parseCreatedAtMs(a.createdAt)
      }

      setCustomers((prev) =>
        prev.map((rowItem) => (rowItem.id === customerId ? apply(rowItem) : rowItem)).sort(sortByConsultDateDesc),
      )
      setAdvSearchHits((hits) =>
        hits == null
          ? null
          : hits.map((rowItem) => (rowItem.id === customerId ? apply(rowItem) : rowItem)).sort(sortByConsultDateDesc),
      )
    },
    [],
  )


  function applyQuickFilter(type: 'AGE_UNDER_30_MALE' | 'AGE_OVER_40_FEMALE') {
    if (type === 'AGE_UNDER_30_MALE') {
      setAdvancedFilters({
        ...EMPTY_ADVANCED_FILTERS,
        maxInsuranceAge: '30',
        gender: 'male',
      })
    } else {
      setAdvancedFilters({
        ...EMPTY_ADVANCED_FILTERS,
        minInsuranceAge: '40',
        gender: 'female',
      })
    }
  }

  function runExport(rows: CustomerRecord[]) {
    try {
      exportCustomersExcel(rows, selectedColumns)
      setStatusText('엑셀 파일을 저장했습니다.')
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : '다운로드에 실패했습니다.')
    }
  }

  function handleDownloadSelected() {
    if (selectedCustomerIds.length === 0) {
      setStatusText('다운로드할 고객을 선택해 주세요.')
      return
    }
    const idSet = new Set(selectedCustomerIds)
    const rows = sortedCustomers.filter((c) => idSet.has(String(c.id)))
    runExport(rows)
  }

  /** 현재 검색·정렬된 목록 전체 (필터 반영) */
  function handleDownloadListAll() {
    if (sortedCustomers.length === 0) {
      setStatusText('목록에 표시된 고객이 없습니다.')
      return
    }
    runExport([...sortedCustomers])
  }

  /** 모바일 앱 WebView는 /customer/register 네비를 네이티브에서 막음 — 여기서는 복사만. */
  const runCustomerRegisterInviteCopy = useCallback(async () => {
    const refUsername = (user?.username ?? '').trim()
    const gaCode = (user?.gaCode ?? '').trim().toUpperCase()
    if (!gaCode) {
      setStatusText('GA 코드가 없습니다.')
      return
    }
    if (!refUsername) {
      setStatusText('로그인 정보가 없습니다.')
      return
    }
    const origin = getPublicOrigin()
    if (!origin) {
      setStatusText('초대 링크를 만들 수 없습니다. VITE_BASE_URL 설정을 확인해 주세요.')
      return
    }
    const inviteUrl = `${origin}/customer/register?ref=${encodeURIComponent(refUsername)}&ga=${encodeURIComponent(gaCode)}`
    const copied = await copyTextToClipboard(inviteUrl)
    if (copied) {
      setStatusText('등록 링크가 복사되었습니다.')
      return
    }
    setStatusText('복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.')
  }, [user?.username, user?.gaCode])

  const invokeInviteCopyFromPointer = useCallback(() => {
    const now = Date.now()
    if (now - inviteCopyPointerTsRef.current < INVITE_COPY_POINTER_DEBOUNCE_MS) {
      return
    }
    inviteCopyPointerTsRef.current = now
    void runCustomerRegisterInviteCopy()
  }, [runCustomerRegisterInviteCopy])

  const onCustomerRegisterInviteCopyTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      invokeInviteCopyFromPointer()
    },
    [invokeInviteCopyFromPointer],
  )

  const onCustomerRegisterInviteCopyMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      invokeInviteCopyFromPointer()
    },
    [invokeInviteCopyFromPointer],
  )

  const onCustomerRegisterInviteCopyClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      invokeInviteCopyFromPointer()
    },
    [invokeInviteCopyFromPointer],
  )

  const onCustomerRegisterInviteCopyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      void runCustomerRegisterInviteCopy()
    },
    [runCustomerRegisterInviteCopy],
  )

  if (user?.role !== 'USER') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <p className="customers-page__denied">접근 권한 없음</p>
        </header>
      </main>
    )
  }

  const excelToolbarNode =
    tab === 'list' && isSelectMode ? (
      <CustomerExcelSelectToolbar
        variant="toolbar"
        tab={tab}
        isSelectMode={isSelectMode}
        isColumnPickerOpen={isColumnPickerOpen}
        setIsColumnPickerOpen={setIsColumnPickerOpen}
        selectAllRef={selectAllRef}
        allVisibleSelected={allVisibleSelected}
        selectedColumns={selectedColumns}
        allVisibleIds={allVisibleIds}
        onToggleSelectAll={toggleSelectAll}
        handleDownloadSelected={handleDownloadSelected}
        handleDownloadListAll={handleDownloadListAll}
        exitExcelSelectMode={exitExcelSelectMode}
        toggleExcelColumn={toggleExcelColumn}
      />
    ) : null

  const headerNode = (
    <header className="page-header customers-page__header">
      {tab === 'list' ? (
        <>
          {!isSelectMode ? (
            <CustomerPageHeaderActions
              isMobile={isMobile}
              setStatusText={setStatusText}
              onCreateCustomer={() => setSearchParams(CUSTOMER_CREATE_MODE_QUERY, { replace: true })}
              onCustomerRegisterInviteCopyTouchStart={onCustomerRegisterInviteCopyTouchStart}
              onCustomerRegisterInviteCopyMouseDown={onCustomerRegisterInviteCopyMouseDown}
              onCustomerRegisterInviteCopyClick={onCustomerRegisterInviteCopyClick}
              onCustomerRegisterInviteCopyKeyDown={onCustomerRegisterInviteCopyKeyDown}
              enterExcelSelectMode={enterExcelSelectMode}
            />
          ) : null}
          <div className="customers-page__search-row customer-filter-bar">
            <FormInput
              ref={searchInputRef}
              className="search-input customers-page__search-input"
              type="search"
              placeholder="이름 / 전화번호 검색"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              aria-label="이름 또는 전화번호 검색"
            />
            <div className="customers-page__search-actions" role="group" aria-label="고객 목록 빠른 필터">
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                className={`favorite-btn customer-filter-chip${favoriteOnly ? ' favorite-btn--on customer-filter-chip--active' : ''}`}
                aria-pressed={favoriteOnly}
                onClick={() => setFavoriteOnly((v) => !v)}
              >
                중요 고객
              </FormButton>
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                className={`customers-page__filter-toggle customer-filter-chip${showFilters ? ' customers-page__filter-toggle--on customer-filter-chip--active' : ''}`}
                aria-expanded={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              >
                필터
              </FormButton>
            </div>
          </div>
        </>
      ) : (
        <div className="customers-page__create-nav">
          <FormButton
            htmlType="button"
            variant="action"
            className="link-btn link-btn--compact"
            onClick={(e) => {
              e.stopPropagation()
              setCustomerCreateExitModalOpen(true)
            }}
          >
            ← 고객 목록
          </FormButton>
        </div>
      )}
      <p
        id="customers-page-status"
        className={`customers-page__status${statusText ? '' : ' customers-page__status--empty'}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
      </p>
    </header>
  )

  const listBodyNode = (
    <section className="list-section" style={{ marginTop: 0 }}>
      {showFilters ? (
        <CustomerFilterControls
          variant="filterPanel"
          deepSearch={deepSearch}
          setDeepSearch={setDeepSearch}
          advSearchLoading={advSearchLoading}
          sortType={sortType}
          setSortType={setSortType}
          advancedFilters={advancedFilters}
          setAdvancedFilters={setAdvancedFilters}
          advancedFiltersActive={advancedFiltersActive}
          applyQuickFilter={applyQuickFilter}
          resetAdvancedFilters={() => setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS })}
        />
      ) : null}

      {!isLoading && customers.length > 0 ? (
        <p className="customers-filter-result customers-page__result-count" role="status" aria-live="polite">
          검색·필터 결과:{' '}
          <span className="customers-page__result-count-strong">
            <strong>{listIsNarrowed ? sortedCustomers.length : customersTotalCount}</strong>명
          </span>
        </p>
      ) : null}

      {isLoading ? (
        <div
          className="customers-page__list-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="customers-page__list-loading__text">로딩 중…</span>
        </div>
      ) : customers.length === 0 ? (
        <p className="empty-state">등록된 고객이 없습니다.</p>
      ) : sortedCustomers.length === 0 ? (
        <p className="empty-state">
          {keyword.trim() ||
          advancedFiltersActive ||
          favoriteOnly
            ? favoriteOnly &&
                !keyword.trim() &&
                !advancedFiltersActive
              ? '중요 고객으로 표시된 고객이 없습니다. 카드의 ★로 추가해 보세요.'
              : '검색·필터 조건에 맞는 고객이 없습니다.'
            : '고객이 없습니다.'}
        </p>
      ) : (
        <ul className="record-list customer-expand-list customer-list customers-page__customer-list">
          {sortedCustomers.map((c) => (
            <CustomerListCard
              key={c.id}
              customer={c}
              ssnDupHighlight={ssnDupHighlightByCustomerId.get(c.id)}
              isSelectMode={isSelectMode}
              selectedCustomerIds={selectedCustomerIds}
              setSelectedCustomerIds={setSelectedCustomerIds}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onSelectCustomer={handleSelectCustomer}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              onEditSubmit={handleEditFormSubmit}
              onEditSaveRequest={handleEditSaveRequest}
              editSaving={editSaving}
              editStatusText={editingId === c.id ? statusText : undefined}
              carFeatureEnabled={carFeatureEnabled}
              gaExcelEnabled={gaExcelEnabled}
              onCopyCustomer={copyCustomer}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onDeleteCustomer={handleDeleteCustomer}
              onOpenFilesModal={handleOpenFilesModal}
              onOpenConsultationsModal={handleOpenConsultationsModal}
              onOpenAutoModal={handleOpenAutoModal}
              onOpenGaModal={handleOpenGaModal}
              onOpenPersonalMessage={handleOpenPersonalMessage}
              onOpenClaims={handleOpenClaims}
              onOpenMemos={handleOpenMemos}
              mobileCopyFeedback={mobileCopyFeedback}
              onOpenRelatedCustomer={handleOpenRelatedCustomer}
              token={token}
              onToggleFavorite={handleToggleFavorite}
              variant={isMobile ? 'mobile' : 'pc'}
              crmIsInsuranceLayout={crmIndustry.isInsuranceLayout}
              crmIndustryTemplate={crmIndustry.resolvedTemplate}
            />
          ))}
        </ul>
      )}
    </section>
  )

  const createBodyNode = (
    <section className="card" style={{ marginTop: 0 }}>
      <CustomerForm
        onStatusMessage={setStatusText}
        onInternalSaveSuccess={() => {
          void loadCustomers()
          navigateToCustomerListReplace()
        }}
      />
    </section>
  )

  const columnPickerNode =
    tab === 'list' && isSelectMode && isColumnPickerOpen ? (
      <CustomerExcelSelectToolbar
        variant="modal"
        tab={tab}
        isSelectMode={isSelectMode}
        isColumnPickerOpen={isColumnPickerOpen}
        setIsColumnPickerOpen={setIsColumnPickerOpen}
        selectAllRef={selectAllRef}
        allVisibleSelected={allVisibleSelected}
        selectedColumns={selectedColumns}
        allVisibleIds={allVisibleIds}
        onToggleSelectAll={toggleSelectAll}
        handleDownloadSelected={handleDownloadSelected}
        handleDownloadListAll={handleDownloadListAll}
        exitExcelSelectMode={exitExcelSelectMode}
        toggleExcelColumn={toggleExcelColumn}
      />
    ) : null

  const scrollTopNode =
    showScrollToTop ? (
      <FormButton
        htmlType="button"
        variant="action"
        className="scroll-to-top"
        aria-label="맨 위로 스크롤"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </FormButton>
    ) : null

  const createExitConfirmNode =
    customerCreateExitModalOpen ? (
      <ExitConfirmDialog
        message={MSG_CUSTOMER_CREATE_EXIT}
        title="등록 이탈 확인"
        onCancel={() => {
          setCustomerCreateExitModalOpen(false)
        }}
        onConfirm={() => {
          navigateToCustomerListReplace()
          setCustomerCreateExitModalOpen(false)
        }}
      />
    ) : null

  const mobileDetailModalNode = (
    <CustomerMobileModals
      isMobile={isMobile}
      activeMobileModal={activeMobileModal}
      activeMobileCustomerId={activeMobileCustomerId}
      closeMobileModal={closeMobileModal}
      handleCustomerConsultationCreated={handleCustomerConsultationCreated}
    />
  )

  const bodyNode = (
    <>
      {tab === 'create' ? createBodyNode : listBodyNode}
      {mobileDetailModalNode}
    </>
  )

  const viewProps: {
    isSelectMode: boolean
    showExcelToolbar: boolean
    excelToolbarNode: ReactNode
    headerNode: ReactNode
    bodyNode: ReactNode
    columnPickerNode: ReactNode
    scrollTopNode: ReactNode
    createExitConfirmNode: ReactNode
    confirmDialogNode: ReactNode
  } = {
    isSelectMode,
    showExcelToolbar: tab === 'list',
    excelToolbarNode,
    headerNode,
    bodyNode,
    columnPickerNode,
    scrollTopNode,
    createExitConfirmNode,
    confirmDialogNode: confirmDialog,
  }

  if (isMobile) {
    return <CustomersPageMobileView {...viewProps} />
  }
  return <CustomersPagePCView {...viewProps} />
}
