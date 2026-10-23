import { SATURATION_PER_WOUND, clampSaturation } from '../rules'
import { NumberField } from './fields'

interface Props {
  value: number
  /** Pone la barra en un valor. */
  onSet: (value: number) => void
  /** Suma (o resta) a lo que haya guardado, aunque la pantalla todavía no se haya refrescado. */
  onAdd: (delta: number) => void
}

/** Barra de saturación por curación (0 a 100 %). Se escribe el valor o se suma con los atajos. */
export function SaturationCard({ value, onSet, onAdd }: Props) {
  const current = clampSaturation(value ?? 0)
  return (
    <div className="card">
      <h2>Saturación por curación</h2>
      <div
        className="bar"
        role="progressbar"
        aria-label="Saturación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={current}
      >
        <div className="bar-fill" style={{ width: `${current}%` }} />
      </div>
      <NumberField label="Saturación (%)" value={current} onChange={(v) => onSet(clampSaturation(v))} />
      <div className="actions">
        {(['leve', 'medio', 'letal'] as const).map((k) => (
          <button
            key={k}
            className="btn secondary compact"
            onClick={() => onAdd(SATURATION_PER_WOUND[k])}
          >
            Curó 1 {k} (+{SATURATION_PER_WOUND[k]} %)
          </button>
        ))}
        <button className="btn secondary compact" onClick={() => onSet(0)}>
          Poner en 0
        </button>
      </div>
      <p className="muted small">No suma sola: la llevas tú cuando se cura.</p>
    </div>
  )
}
