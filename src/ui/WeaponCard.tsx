import { RANKS, weaponFromTable } from '../rules'
import type { WeaponSize, WeaponState, WeaponTarget } from '../rules'
import { NumberField, SelectField } from './fields'
import { Section } from './Section'

const SIZE_OPTIONS: { value: WeaponSize; label: string }[] = [
  { value: 'pequena', label: 'Pequeña' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
  { value: 'pesada', label: 'Pesada' },
]
const TARGET_OPTIONS: { value: WeaponTarget; label: string }[] = [
  { value: 'fisico', label: 'Daño físico' },
  { value: 'magico', label: 'Daño mágico' },
  { value: 'ambos', label: 'Ambos daños' },
]
const RANK_OPTIONS = RANKS.map((r) => ({ value: r.name, label: r.name }))

interface Props {
  weapon: WeaponState | null
  /** Rango con el que se equipa por primera vez. */
  defaultRank: string
  onChange: (change: (current: WeaponState | null) => WeaponState | null) => void
}

/** Arma equipada de un jugador o NPC. Mismo funcionamiento que la armadura: valor de la tabla, editable. */
export function WeaponCard({ weapon, defaultRank, onChange }: Props) {
  return (
    <Section title="Arma">
      {weapon ? (
        <>
          <p className="result" role="status">
            Arma equipada: {SIZE_OPTIONS.find((o) => o.value === weapon.size)?.label} {weapon.rank} · suma {weapon.bonus} al{' '}
            {TARGET_OPTIONS.find((o) => o.value === weapon.bonusTarget)?.label.toLowerCase()}
          </p>
          <div className="grid-2">
            <SelectField
              label="Tamaño del arma"
              value={weapon.size}
              options={SIZE_OPTIONS}
              onChange={(size) =>
                onChange((w) => (w ? { ...weaponFromTable(size, w.rank), bonusTarget: w.bonusTarget } : w))
              }
            />
            <SelectField
              label="Rango del arma"
              value={weapon.rank}
              options={RANK_OPTIONS}
              onChange={(rank) =>
                onChange((w) => (w ? { ...weaponFromTable(w.size, rank), bonusTarget: w.bonusTarget } : w))
              }
            />
            <SelectField
              label="El arma suma a"
              value={weapon.bonusTarget}
              options={TARGET_OPTIONS}
              onChange={(bonusTarget) => onChange((w) => (w ? { ...w, bonusTarget } : w))}
            />
            <NumberField
              label="Valor que suma al daño"
              value={weapon.bonus}
              onChange={(bonus) => onChange((w) => (w ? { ...w, bonus } : w))}
            />
          </div>
          <div className="actions">
            <button
              className="btn secondary compact"
              onClick={() => onChange((w) => (w ? { ...weaponFromTable(w.size, w.rank), bonusTarget: w.bonusTarget } : w))}
            >
              Restablecer a los valores de la tabla
            </button>
            <button className="btn secondary compact" onClick={() => onChange(() => null)}>
              Quitar arma
            </button>
          </div>
          <p className="muted small">
            Al cambiar el tamaño o el rango se carga solo el valor de la tabla de armas; después lo puedes editar. El
            daño del ataque es el base más este valor.
          </p>
        </>
      ) : (
        <>
          <p className="muted small">
            Sin arma equipada: el daño usa el arma de referencia. Al equipar una, su valor reemplaza a la de referencia.
          </p>
          <button className="btn secondary" onClick={() => onChange(() => weaponFromTable('mediana', defaultRank))}>
            Equipar arma
          </button>
        </>
      )}
    </Section>
  )
}
