import { EFFECT_TARGETS, STAT_NAMES } from '../rules'
import type { EffectTarget } from '../rules'
import { TARGET_LABELS } from './format'

interface Props {
  /** Título del grupo, también su nombre accesible. */
  label: string
  /** Prefijo de cada casilla: "Afecta a" o "Suma a". */
  prefix: string
  selected: EffectTarget[]
  onChange: (next: EffectTarget[]) => void
}

/** Casillas para elegir uno o varios stats (y ataque, magia o defensas) sobre los que actúa un efecto. */
export function TargetPicker({ label, prefix, selected, onChange }: Props) {
  const toggle = (target: EffectTarget, on: boolean) =>
    onChange(
      on
        ? EFFECT_TARGETS.filter((t) => selected.includes(t) || t === target)
        : selected.filter((t) => t !== target),
    )

  return (
    <div className="targets" role="group" aria-label={label}>
      <span className="small muted">{label}</span>
      <div className="chips">
        <button className="btn secondary compact" onClick={() => onChange([...STAT_NAMES])}>
          Los 7 stats
        </button>
        <button className="btn secondary compact" onClick={() => onChange([])}>
          Limpiar
        </button>
      </div>
      <div className="target-grid">
        {EFFECT_TARGETS.map((t) => (
          <label key={t} className="check">
            <input
              type="checkbox"
              aria-label={`${prefix} ${TARGET_LABELS[t]}`}
              checked={selected.includes(t)}
              onChange={(e) => toggle(t, e.target.checked)}
            />
            {TARGET_LABELS[t]}
          </label>
        ))}
      </div>
    </div>
  )
}
