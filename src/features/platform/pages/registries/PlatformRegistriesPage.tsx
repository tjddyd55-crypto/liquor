import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { CUSTOMER_FIELD_REGISTRY_BY_KEY } from '../../../customer-templates/registry/customerFieldRegistry'
import { FEATURE_MODULE_REGISTRY_BY_ID } from '../../../customer-templates/registry/featureModuleRegistry'
import { LIST_COLUMN_REGISTRY_BY_KEY } from '../../../customer-templates/registry/listColumnRegistry'
import {
  countByStatus,
  countDomainsFromFeatures,
  countDomainsFromFields,
  countDomainsFromListColumns,
  countSourceTypesFromListColumns,
  sortFeatureDefinitions,
  sortFieldDefinitions,
  sortListColumns,
  type PlatformRegistriesViewProps,
} from './platformRegistriesViewModel'
import PlatformRegistriesMobileView from './PlatformRegistriesMobileView'
import PlatformRegistriesPCView from './PlatformRegistriesPCView'

export type { PlatformRegistriesViewProps }

function buildPlatformRegistriesViewProps(): PlatformRegistriesViewProps {
  const fieldsSorted = sortFieldDefinitions(Object.values(CUSTOMER_FIELD_REGISTRY_BY_KEY))
  const featuresSorted = sortFeatureDefinitions(Object.values(FEATURE_MODULE_REGISTRY_BY_ID))
  const listColumnsSorted = sortListColumns(Object.values(LIST_COLUMN_REGISTRY_BY_KEY))
  return {
    fieldsSorted,
    featuresSorted,
    listColumnsSorted,
    fieldTotals: {
      total: fieldsSorted.length,
      byStatus: countByStatus(fieldsSorted),
    },
    featureTotals: {
      total: featuresSorted.length,
      byStatus: countByStatus(featuresSorted),
    },
    listColumnTotals: {
      total: listColumnsSorted.length,
      byStatus: countByStatus(listColumnsSorted),
    },
    fieldDomains: countDomainsFromFields(fieldsSorted),
    featureDomains: countDomainsFromFeatures(featuresSorted),
    listColumnDomains: countDomainsFromListColumns(listColumnsSorted),
    listColumnSourceTypes: countSourceTypesFromListColumns(listColumnsSorted),
  }
}

export default function PlatformRegistriesPage() {
  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
      </div>
      <ResponsiveLayout<PlatformRegistriesViewProps>
        PC={PlatformRegistriesPCView}
        Mobile={PlatformRegistriesMobileView}
        viewProps={buildPlatformRegistriesViewProps()}
      />
    </>
  )
}
