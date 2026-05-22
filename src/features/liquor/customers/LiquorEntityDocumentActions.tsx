import { FormButton } from '../../../components/form'
import {
  documentActionsForEntity,
  type LiquorDocumentActionDef,
  type LiquorDocumentEntityType,
} from './liquorDocumentActions'

type Props = {
  entityType: LiquorDocumentEntityType
  entityId: number
  customerId: number
  supportContractId?: number | null
  documentCounts?: number
  disabled?: boolean
  onNavigateToFiles?: () => void
}

function ActionButton({
  action,
  disabled,
  documentCounts,
  onNavigateToFiles,
}: {
  action: LiquorDocumentActionDef
  disabled: boolean
  documentCounts?: number
  onNavigateToFiles?: () => void
}) {
  const isViewFiles = action.actionType === 'view_files'
  const canNavigate = isViewFiles && !!onNavigateToFiles
  const label =
    isViewFiles && documentCounts != null && documentCounts > 0
      ? `${action.label} (${documentCounts})`
      : action.label

  return (
    <div className="liquor-doc-action">
      <FormButton
        type="button"
        variant="secondary"
        disabled={!canNavigate && disabled}
        title={action.hint}
        onClick={() => {
          if (canNavigate) onNavigateToFiles?.()
        }}
      >
        {label}
      </FormButton>
      <span className="liquor-doc-action__hint">{action.hint}</span>
    </div>
  )
}

export function LiquorEntityDocumentActions({
  entityType,
  entityId,
  customerId,
  documentCounts,
  disabled = true,
  onNavigateToFiles,
}: Props) {
  const actions = documentActionsForEntity(entityType)
  return (
    <div className="liquor-doc-actions" data-entity-type={entityType} data-entity-id={entityId} data-customer-id={customerId}>
      <p className="liquor-doc-actions__title">전자문서 (준비 중)</p>
      <div className="liquor-doc-actions__list">
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            disabled={disabled}
            documentCounts={documentCounts}
            onNavigateToFiles={onNavigateToFiles}
          />
        ))}
      </div>
    </div>
  )
}
