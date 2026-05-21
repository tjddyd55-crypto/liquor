interface CircleOptionGroupProps {
  options: readonly string[]
  selectedValue: string
}

export function CircleOptionGroup({
  options,
  selectedValue,
}: CircleOptionGroupProps) {
  return (
    <div className="option-group">
      {options.map((option) => (
        <span
          key={option}
          className={`option-group__item ${
            selectedValue === option ? 'option-group__item--selected' : ''
          }`}
        >
          {option}
        </span>
      ))}
    </div>
  )
}
