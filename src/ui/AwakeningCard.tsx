import { useState } from 'react'
import { diffPaths } from '../db'
import { STAT_NAMES, addAwakening, characterSheet, commonAwakening, setAwakening } from '../rules'
import type { Character } from '../rules'
import { repo } from './data'
import { NumberField } from './fields'
import { STAT_LABELS, fmt } from './format'
import { Section } from './Section'

/** Lo que pasaría con el promedio y el rango, para ver el efecto antes de aplicarlo. */
function outcome(before: Character, after: Character): string {
  const a = characterSheet(before)
  const b = characterSheet(after)
  return `promedio ${fmt(a.average)} → ${fmt(b.average)} · rango ${a.rank?.name ?? '—'} → ${b.rank?.name ?? '—'}`
}

/**
 * El despertar de los 7 stats de una vez. Es el mismo monto para todos y se suma sin multiplicador. Se
 * guarda enseguida y queda en el historial del personaje.
 */
export function AwakeningCard({ character }: { character: Character }) {
  const [amount, setAmount] = useState(0)
  const [message, setMessage] = useState('')
  const common = commonAwakening(character)

  const setTo = setAwakening(character, amount)
  const addTo = addAwakening(character, amount)

  async function apply(next: Character, reason: string) {
    const changes = diffPaths(character, next)
    if (changes.length === 0) return setMessage('No cambia nada: ya estaba así.')
    await repo.applyChanges(character.id, changes, reason)
    setMessage(`Listo: ${reason.toLowerCase()}.`)
  }

  return (
    <Section title="Despertar">
      <p className="small">
        {common !== null ? (
          <>
            Hoy: <strong>{fmt(common)}</strong> en los 7 stats.
          </>
        ) : (
          <>
            Hoy los stats tienen despertares distintos:{' '}
            {STAT_NAMES.map((s) => `${STAT_LABELS[s]} ${fmt(character.sources[s].despertar)}`).join(' · ')}.
          </>
        )}
      </p>
      <NumberField label="Cantidad de despertar" value={amount} onChange={setAmount} />
      {amount !== 0 && (
        <ul className="history">
          <li className="small muted">Si lo sumas: {outcome(character, addTo)}</li>
          <li className="small muted">Si lo pones: {outcome(character, setTo)}</li>
        </ul>
      )}
      <div className="actions">
        <button className="btn" onClick={() => void apply(addTo, `Despertar: sumó ${fmt(amount)} a los 7 stats`)}>
          Sumar {fmt(amount)} a los 7 stats
        </button>
        <button className="btn secondary" onClick={() => void apply(setTo, `Despertar: puesto en ${fmt(Math.max(0, amount))} en los 7 stats`)}>
          Poner en {fmt(Math.max(0, amount))} en los 7
        </button>
      </div>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      <p className="muted small">El despertar no lleva multiplicador: cada stat sube exactamente lo que sumes.</p>
    </Section>
  )
}
