import { FormButton } from '../../../components/form'
import type { ConsentCompanyItem } from '../domain/types'

export interface CompanyListProps {
  title: string
  companies: ConsentCompanyItem[]
  onSelect: (item: ConsentCompanyItem) => void
}

export function CompanyList({ title, companies, onSelect }: CompanyListProps) {
  return (
    <>
      <h2 className="consent-company-list__heading">{title}</h2>
      <div className="consent-company-list__scroll" role="list">
        {companies.map((item) => (
          <FormButton
            key={item.id}
            htmlType="button"
            className="consent-company-list__btn"
            role="listitem"
            onClick={() => onSelect(item)}
          >
            {item.name}
          </FormButton>
        ))}
      </div>
    </>
  )
}
