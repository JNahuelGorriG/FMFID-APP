import { useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  /** Solo enteros: redondea lo que se escribe. */
  integer?: boolean
}

/** Campo numérico que deja escribir libremente (coma o punto) y avisa solo valores válidos. */
export function NumberField({ label, value, onChange, integer = false }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)

  // Si el valor cambia desde afuera, actualiza el texto (salvo que ya represente ese número).
  if (value !== lastValue) {
    setLastValue(value)
    if (Number(text.replace(',', '.')) !== value) setText(String(value))
  }

  return (
    <label className="field">
      <span className="small muted">{label}</span>
      <input
        inputMode={integer ? 'numeric' : 'decimal'}
        aria-label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(integer ? Math.round(n) : n)
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <label className="field">
      <span className="small muted">{label}</span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

interface SelectFieldProps<T extends string | number> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="field">
      <span className="small muted">{label}</span>
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked) onChange(picked.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface CheckFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function CheckField({ label, checked, onChange }: CheckFieldProps) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

interface OptionalNumberFieldProps {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
}

/** Campo numérico que puede quedar vacío (sin valor). */
export function OptionalNumberField({ label, value, onChange, placeholder }: OptionalNumberFieldProps) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [lastValue, setLastValue] = useState(value)

  if (value !== lastValue) {
    setLastValue(value)
    const current = text.trim() === '' ? undefined : Number(text.replace(',', '.'))
    if (current !== value) setText(value === undefined ? '' : String(value))
  }

  return (
    <label className="field">
      <span className="small muted">{label}</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value.trim() === '') return onChange(undefined)
          const n = Number(e.target.value.replace(',', '.'))
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

interface TextAreaFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function TextAreaField({ label, value, onChange }: TextAreaFieldProps) {
  return (
    <label className="field">
      <span className="small muted">{label}</span>
      <textarea aria-label={label} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
