import { useState } from 'react'
import { diffPaths } from '../db'
import { POINT_SOURCES, STAT_NAMES, characterSheet, commonPoints, raisePoints } from '../rules'
import type { Character, EffectTarget, PointSource, StatName } from '../rules'
import { repo } from './data'
import { NumberField, SelectField } from './fields'
import { SOURCE_LABELS, STAT_LABELS, fmt } from './format'
import { Section } from './Section'
import { TargetPicker } from './TargetPicker'

const SOURCE_OPTIONS = POINT_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))

/** Lo que pasaría con el promedio y el rango, para ver el efecto antes de aplicarlo. */
function outcome(before: Character, after: Character): string {
  const a = characterSheet(before)
  const b = characterSheet(after)
  return `promedio ${fmt(a.average)} → ${fmt(b.average)} · rango ${a.rank?.name ?? '—'} → ${b.rank?.name ?? '—'}`
}

const statsText = (stats: StatName[]): string =>
  stats.length === STAT_NAMES.length ? 'los 7 stats' : stats.map((s) => STAT_LABELS[s]).join(', ')

interface FieldsProps {
  character: Character
  /** Qué hacer con el resultado: guardarlo enseguida o dejarlo en un borrador. */
  onApply: (next: Character, reason: string) => void
}

/**
 * Los campos para subir puntos de stats: de qué tipo son (mérito, despertar, regalo u otros), a cuáles
 * de los 7 stats y cuánto. Son puntos planos: cada stat sube exactamente lo que se suma.
 */
export function StatPointsFields({ character, onApply }: FieldsProps) {
  const [source, setSource] = useState<PointSource>('despertar')
  const [selected, setSelected] = useState<EffectTarget[]>([...STAT_NAMES])
  const [amount, setAmount] = useState(0)

  const stats = selected.filter((t): t is StatName => (STAT_NAMES as readonly string[]).includes(t))
  const label = SOURCE_LABELS[source]
  const addTo = raisePoints(character, source, stats, amount, 'sumar')
  const setTo = raisePoints(character, source, stats, amount, 'poner')
  const common = commonPoints(character, source, stats)

  return (
    <>
      <SelectField label="Tipo de puntos" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
      <TargetPicker
        label="Stats que suben (puedes elegir varios)"
        prefix="Sube"
        selected={selected}
        onChange={setSelected}
        targets={STAT_NAMES}
      />
      <p className="small">
        {stats.length === 0 ? (
          'Elige al menos un stat.'
        ) : common !== null ? (
          <>
            Hoy ({label}): <strong>{fmt(common)}</strong> en {statsText(stats)}.
          </>
        ) : (
          <>Hoy ({label}): {stats.map((s) => `${STAT_LABELS[s]} ${fmt(character.sources[s][source])}`).join(' · ')}.</>
        )}
      </p>
      <NumberField label="Cantidad de puntos" value={amount} onChange={setAmount} />
      {amount !== 0 && stats.length > 0 && (
        <ul className="history">
          <li className="small muted">Si los sumas: {outcome(character, addTo)}</li>
          <li className="small muted">Si los pones: {outcome(character, setTo)}</li>
        </ul>
      )}
      <div className="actions">
        <button
          className="btn"
          disabled={stats.length === 0}
          onClick={() => onApply(addTo, `${label}: sumó ${fmt(amount)} a ${statsText(stats)}`)}
        >
          Sumar {fmt(amount)} a {stats.length} stat(s)
        </button>
        <button
          className="btn secondary"
          disabled={stats.length === 0}
          onClick={() => onApply(setTo, `${label}: puesto en ${fmt(Math.max(0, amount))} en ${statsText(stats)}`)}
        >
          Poner en {fmt(Math.max(0, amount))} en {stats.length} stat(s)
        </button>
      </div>
      <p className="muted small">Son puntos planos: cada stat sube exactamente lo que sumes, sin multiplicador.</p>
    </>
  )
}

/** Subir puntos de stats desde la ficha o el árbol: se guarda enseguida y queda en el historial. */
export function StatPointsCard({ character }: { character: Character }) {
  const [message, setMessage] = useState('')

  async function apply(next: Character, reason: string) {
    const changes = diffPaths(character, next)
    if (changes.length === 0) return setMessage('No cambia nada: ya estaba así.')
    await repo.applyChanges(character.id, changes, reason)
    setMessage(`Listo: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`)
  }

  return (
    <Section title="Subir puntos de Stats">
      <StatPointsFields character={character} onApply={(next, reason) => void apply(next, reason)} />
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </Section>
  )
}
