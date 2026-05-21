import { FormButton } from '../../../components/form'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { getInsuranceContacts } from '../api/contactsApi'
import type { InsuranceContact, InsuranceContactCategory } from '../domain/types'
import { formatPhoneNumber } from '../utils/phone'

const CATEGORY_LABELS: Record<InsuranceContactCategory, string> = {
  LIFE: '생명보험',
  NON_LIFE: '손해보험',
  GENERAL: '일반보험',
}

function buildRows(items: InsuranceContact[], minRows: number, category: InsuranceContactCategory) {
  const rows = [...items]
  while (rows.length < minRows) {
    rows.push({
      id: `empty-${rows.length}`,
      category,
      companyName: '',
      managerName: '',
      position: '',
      phoneNumber: '',
      createdAt: '',
      updatedAt: '',
    })
  }
  return rows
}

interface PrintTableProps {
  title: string
  contacts: InsuranceContact[]
  minRows: number
  category: InsuranceContactCategory
}

function PrintTable({ title, contacts, minRows, category }: PrintTableProps) {
  const rows = buildRows(contacts, minRows, category)
  return (
    <section className="insurance-print-section">
      <h2>{title}</h2>
      <table className="insurance-print-table">
        <thead>
          <tr>
            <th>보험사</th>
            <th>담당자</th>
            <th>연락처</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((contact) => (
            <tr key={contact.id}>
              <td>{contact.companyName || ' '}</td>
              <td>{contact.managerName || ' '}</td>
              <td>{formatPhoneNumber(contact.phoneNumber) || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function InsurancePrintPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [contacts, setContacts] = useState<InsuranceContact[]>([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    let active = true

    async function loadContacts() {
      if (!token) {
        if (active) {
          setIsLoading(false)
        }
        return
      }
      try {
        const response = await getInsuranceContacts(token)
        if (!active) {
          return
        }
        setContacts(response.contacts)
        setLastUpdatedAt(response.lastUpdatedAt)
      } catch (error) {
        if (!active) {
          return
        }
        setStatusText(error instanceof Error ? error.message : '출력 데이터를 불러오지 못했습니다.')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadContacts()
    return () => {
      active = false
    }
  }, [token])

  const grouped = useMemo(() => {
    const map: Record<InsuranceContactCategory, InsuranceContact[]> = {
      LIFE: [],
      NON_LIFE: [],
      GENERAL: [],
    }
    for (const contact of contacts) {
      map[contact.category].push(contact)
    }

    for (const category of Object.keys(map) as InsuranceContactCategory[]) {
      map[category].sort((a, b) => {
        const companyOrder = a.companyName.localeCompare(b.companyName, 'ko-KR')
        if (companyOrder !== 0) {
          return companyOrder
        }
        return a.managerName.localeCompare(b.managerName, 'ko-KR')
      })
    }
    return map
  }, [contacts])

  return (
    <main className="page page--with-back insurance-print-page">
      <div className="screen-only insurance-print-controls">
        <FormButton className="button" htmlType="button" onClick={() => navigate('/reinsurer-contacts')}>
          원수사 연락처로 이동
        </FormButton>
        <FormButton className="button button--primary" htmlType="button" onClick={() => window.print()}>
          인쇄하기
        </FormButton>
      </div>

      {isLoading ? (
        <section className="card">
          <p className="dashboard-empty">출력 데이터를 불러오는 중입니다...</p>
        </section>
      ) : (
        <article className="insurance-print-sheet">
          <header className="insurance-print-header">
            <h1>[생명·손보 제휴사 담당자 연락처]</h1>
            <p>
              기준일:{' '}
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleDateString('ko-KR') : '데이터 없음'}
            </p>
          </header>

          {statusText ? <p className="status">{statusText}</p> : null}

          <div className="insurance-print-top-grid">
            <PrintTable
              title={CATEGORY_LABELS.LIFE}
              category="LIFE"
              contacts={grouped.LIFE}
              minRows={14}
            />
            <PrintTable
              title={CATEGORY_LABELS.NON_LIFE}
              category="NON_LIFE"
              contacts={grouped.NON_LIFE}
              minRows={14}
            />
          </div>
          <PrintTable
            title={CATEGORY_LABELS.GENERAL}
            category="GENERAL"
            contacts={grouped.GENERAL}
            minRows={10}
          />
        </article>
      )}
    </main>
  )
}
