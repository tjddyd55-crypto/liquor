import { FormButton } from '../../../components/form'
import { visibleDocumentActionsForEntity, type LiquorDocumentEntityType } from './liquorDocumentActions'

type Props = {
  entityType: LiquorDocumentEntityType
  entityId: number
  customerId: number
  documentCounts?: number
  onNavigateToFiles?: () => void
}

export function LiquorEntityDocumentActions({
  entityType,
  entityId,
  customerId,
  documentCounts,
  onNavigateToFiles,
}: Props) {
  const actions = visibleDocumentActionsForEntity(entityType)
  const viewAction = actions.find((a) => a.actionType === 'view_files')
  if (!viewAction || !onNavigateToFiles) return null

  const count = documentCounts ?? 0
  const label = count > 0 ? `${viewAction.label} (${count})` : viewAction.label

  return (
    <div className="liquor-doc-actions" data-entity-id={entityId} data-customer-id={customerId}>
      <FormButton type="button" variant="secondary" onClick={onNavigateToFiles}>
        {label}
      </FormButton>
      {count === 0 ? <span className="liquor-doc-action__hint">첨부문서에서 확인</span> : null}
    </div>
  )
}
