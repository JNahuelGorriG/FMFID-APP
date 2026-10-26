import { STAT_NAMES, baseLimit, buffCap } from '../rules'
import type { CapInfo, RankGroup, StatCaps, StatName } from '../rules'
import { NumberField } from './fields'
import { GROUP_LABELS, STAT_LABELS, fmt } from './format'
import { Section } from './Section'

interface Props {
  caps: StatCaps
  info: CapInfo[]
  group: RankGroup
  rankName: string | null
  /** Lo que suman al límite los aumentos activos (habilidades, estados, transformaciones...). */
  limitRaise: number
  /** Esos aumentos, para mostrar de dónde sale cada uno. */
  raises: { id: string; label: string; amount: number }[]
  onChange: (change: (current: StatCaps) => StatCaps) => void
}

/**
 * Límite de los buffs: un stat no puede subir por buffs más de cierta cantidad por encima del valor
 * natural de su stat vinculado. Cada stat se puede dejar operar por encima del límite.
 */
export function StatCapsCard({ caps, info, group, rankName, limitRaise, raises, onChange }: Props) {
  const cap = buffCap(group, caps.raise + limitRaise)
  const limited = info.filter((r) => r.limited)
  const over = info.filter((r) => r.over)

  const setOpen = (stat: StatName, on: boolean) =>
    onChange((c) => ({
      ...c,
      open: on ? STAT_NAMES.filter((s) => c.open.includes(s) || s === stat) : c.open.filter((s) => s !== stat),
    }))

  return (
    <Section title="Límite de los buffs" aria-label="Límite de los buffs">
      <p className="muted small">
        Rango {rankName ?? 'sin rango'} (grupo {GROUP_LABELS[group]}): los buffs no pueden llevar un stat más de{' '}
        <strong>{cap}</strong> puntos por encima del valor natural de su stat vinculado (sin buffs). Solo recorta buffs,
        y nunca baja un stat que ya lo supera.
      </p>
      <p className="small" aria-label="Cuenta del límite">
        Límite base {baseLimit(group)}
        {raises.map((r) => ` + ${fmt(r.amount)} (${r.label})`).join('')}
        {caps.raise > 0 ? ` + ${caps.raise} (aumento fijo)` : ''} = <strong>{cap}</strong>
      </p>

      {limited.length > 0 && (
        <ul className="errors" aria-label="Buffs recortados">
          {limited.map((r) => (
            <li key={r.stat}>
              {STAT_LABELS[r.stat]} limitada a {fmt(r.limit)}: el buff daba +{fmt(r.requested)} y solo suma +{fmt(r.applied)}.
            </li>
          ))}
        </ul>
      )}
      {over.length > 0 && (
        <ul className="errors" aria-label="Operando por encima del límite">
          {over.map((r) => (
            <li key={r.stat}>
              {STAT_LABELS[r.stat]} por encima del límite ({fmt(r.limit)}): puede traer consecuencias (daño, incapacidad…).
            </li>
          ))}
        </ul>
      )}

      <NumberField
        label="Aumento fijo sin origen"
        integer
        value={caps.raise}
        onChange={(raise) => onChange((c) => ({ ...c, raise: Math.max(0, raise) }))}
      />
      <p className="muted small">
        Un aumento fijo que no viene de una habilidad, estado o transformación. Para esos usa "Aumento del límite de
        buffs" en el panel de buffs: tienen origen y duración.
      </p>

      {info.map((r) => (
        <div key={r.stat} className="cap-row">
          <div className="grow">
            <div className="small">
              <strong>{STAT_LABELS[r.stat]}</strong> hasta {fmt(r.limit)}{' '}
              <span className="muted">
                ({STAT_LABELS[r.linked]} natural {fmt(r.limit - cap)} + {cap})
              </span>
            </div>
            {r.requested > 0 && (
              <div className="small muted">
                Buffs +{fmt(r.requested)} → suman +{fmt(r.applied)}
              </div>
            )}
            {r.spirit > 0 && (
              <div className="small muted">Espíritu +{fmt(r.spirit)} (aparte: no cuenta para el límite)</div>
            )}
          </div>
          <label className="check">
            <input
              type="checkbox"
              aria-label={`Operar por encima del límite: ${STAT_LABELS[r.stat]}`}
              checked={r.open}
              onChange={(e) => setOpen(r.stat, e.target.checked)}
            />
            Sin tope
          </label>
        </div>
      ))}

      <div className="actions">
        <button className="btn secondary compact" onClick={() => onChange((c) => ({ ...c, open: [...STAT_NAMES] }))}>
          Quitar todos los topes
        </button>
        <button className="btn secondary compact" onClick={() => onChange((c) => ({ ...c, open: [] }))}>
          Restablecer los topes
        </button>
      </div>
    </Section>
  )
}
