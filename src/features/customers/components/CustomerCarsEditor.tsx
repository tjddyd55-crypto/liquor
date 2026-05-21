import { FormButton } from '../../../components/form'
import type { CustomerCarFormItem } from '../types/customerCarForm'
import { createEmptyCustomerCar } from '../utils/customerCarFormUtils'
import { CustomerCarEditCard } from './CustomerCarEditCard'
import { CustomerFormSection } from './CustomerFormSection'

export type CustomerCarsEditorProps = {
  cars: CustomerCarFormItem[]
  onChange: (next: CustomerCarFormItem[]) => void
  disabled?: boolean
}

function withSinglePrimary(cars: CustomerCarFormItem[]): CustomerCarFormItem[] {
  if (!cars.length) {
    return [createEmptyCustomerCar()]
  }
  let sawPrimary = false
  return cars.map((c) => {
    if (c.isPrimary === true) {
      if (sawPrimary) {
        return { ...c, isPrimary: false }
      }
      sawPrimary = true
      return c
    }
    return c
  })
}

function ensurePrimary(cars: CustomerCarFormItem[]): CustomerCarFormItem[] {
  if (!cars.length) {
    return [{ ...createEmptyCustomerCar(), isPrimary: true }]
  }
  const hasPrimary = cars.some((c) => c.isPrimary === true)
  if (hasPrimary) {
    return withSinglePrimary(cars)
  }
  return cars.map((c, i) => (i === 0 ? { ...c, isPrimary: true } : { ...c, isPrimary: false }))
}

export function CustomerCarsEditor({ cars, onChange, disabled }: CustomerCarsEditorProps) {
  const list = ensurePrimary(cars.length ? cars : [createEmptyCustomerCar()])

  function apply(next: CustomerCarFormItem[]) {
    onChange(ensurePrimary(next))
  }

  function updateAt(i: number, next: CustomerCarFormItem) {
    const copy = [...list]
    copy[i] = next
    apply(copy)
  }

  function removeAt(i: number) {
    if (list.length <= 1) {
      apply([{ ...createEmptyCustomerCar(), isPrimary: true }])
      return
    }
    const copy = list.filter((_, j) => j !== i)
    apply(copy)
  }

  function addCar() {
    apply([...list, { ...createEmptyCustomerCar(), isPrimary: false }])
  }

  return (
    <CustomerFormSection
      title="자동차 정보"
      className="customer-form-section--grid-full customer-cars-editor"
      headerExtra={
        <FormButton
          htmlType="button"
          className="customer-cars-editor__add-button filter-button"
          variant="secondary"
          disabled={disabled}
          onClick={addCar}
        >
          자동차 추가
        </FormButton>
      }
    >
      <div className="customer-cars-editor__list">
        {list.map((car, i) => (
          <CustomerCarEditCard
            key={car.id != null ? `id-${car.id}` : `idx-${i}`}
            index={i}
            car={car}
            canRemove={list.length > 1}
            disabled={disabled}
            onChange={(next) => updateAt(i, next)}
            onRemove={() => removeAt(i)}
          />
        ))}
      </div>
    </CustomerFormSection>
  )
}
