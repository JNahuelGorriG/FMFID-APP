import { useState } from 'react'
import { SKILL_TYPE_ID, SPIRIT_TYPE_ID } from '../rules'
import type { DurationUnit, EffectType, LimitRaiseFields } from '../rules'
import { NumberField, SelectField, TextField } from './fields'
import { DURATION_LABELS } from './format'

const DURATION_OPTIONS = (Object.keys(DURATION_LABELS) as DurationUnit[]).map((u) => ({
  value: u,
  label: DURATION_LABELS[u],
}))

interface Props {
  types: EffectType[]
  /** Valores con los que arranca el formulario (para editar un aumento). */
  initial?: LimitRaiseFields
  submitLabel: string
  onSubmit: (fields: LimitRaiseFields) => void
  onCancel?: () => void
}

/**
 * Formulario de un aumento del límite de los buffs. Se elige su origen (habilidad, estado,
 * transformación, buff...), cuánto sube y cuánto dura. No tiene relación con el Espíritu.
 */
export function LimitRaiseForm({ types, initial, submitLabel, onSubmit, onCancel }: Props) {
  const origins = types.filter((t) => t.id !== SPIRIT_TYPE_ID)
  const [name, setName] = useState(initial?.name ?? '')
  const [typeId, setTypeId] = useState(initial?.typeId ?? origins[0]?.id ?? SKILL_TYPE_ID)
  const [flat, setFlat] = useState(initial?.flat ?? 0)
  const [percent, setPercent] = useState(initial?.percent ?? 0)
  const [unit, setUnit] = useState<DurationUnit>(initial?.duration.unit ?? 'manual')
  const [remaining, setRemaining] = useState(Math.max(1, initial?.duration.remaining || 3))
  const [error, setError] = useState('')

  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id

  function submit() {
    if (flat === 0 && percent === 0) return setError('Indica cuánto sube el límite: un valor fijo o un porcentaje.')
    if ((unit === 'turnos' || unit === 'rondas') && remaining < 1) return setError('La duración debe ser de al menos 1.')
    setError('')
    onSubmit({
      name: name.trim() || `Aumento del límite (${typeName(typeId)})`,
      typeId,
      flat,
      percent,
      duration: { unit, remaining: unit === 'turnos' || unit === 'rondas' ? remaining : 0 },
    })
    if (!initial) setName('')
  }

  return (
    <div>
      <div className="grid-2">
        <SelectField
          label="Origen del aumento"
          value={typeId}
          options={origins.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => {
            setTypeId(v)
            if (!initial) setUnit(v === SKILL_TYPE_ID ? 'habilidad' : 'manual')
          }}
        />
        <TextField label="Nombre del aumento" value={name} onChange={setName} placeholder={`Aumento del límite (${typeName(typeId)})`} />
        <NumberField label="Aumento fijo del límite" value={flat} onChange={setFlat} />
        <NumberField label="Aumento en % del límite base" value={percent} onChange={setPercent} />
        <SelectField label="El aumento dura" value={unit} options={DURATION_OPTIONS} onChange={setUnit} />
        {(unit === 'turnos' || unit === 'rondas') && (
          <NumberField label="Duración del aumento" integer value={remaining} onChange={setRemaining} />
        )}
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="btn" onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="btn secondary" onClick={onCancel}>
            Cancelar edición del aumento
          </button>
        )}
      </div>
    </div>
  )
}
