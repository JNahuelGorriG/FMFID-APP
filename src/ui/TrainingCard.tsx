import { useState } from 'react'
import { diffPaths } from '../db'
import {
  STAT_NAMES,
  loseTemporaryTraining,
  previewTrainingLoss,
  setTraining,
  trainingOf,
  trainingTotals,
} from '../rules'
import type { Character, StatName, TrainingLoss } from '../rules'
import { repo } from './data'
import { NumberField } from './fields'
import { STAT_LABELS, fmt } from './format'
import { Section } from './Section'

type Draft = Record<StatName, { permanent: number; temporary: number }>

const fromCharacter = (c: Character): Draft =>
  Object.fromEntries(STAT_NAMES.map((s) => [s, trainingOf(c, s)])) as Draft

/**
 * El entrenamiento de un personaje: puntos permanentes y temporales en cada stat. Los temporales se pueden
 * perder de a la mitad o todos de una vez, con un botón. Todo se guarda enseguida y queda en el historial.
 */
export function TrainingCard({ character }: { character: Character }) {
  const [draft, setDraft] = useState<Draft>(() => fromCharacter(character))
  const [message, setMessage] = useState('')

  // Cuando lo guardado cambia (se guardó, o se perdieron puntos), los campos vuelven a mostrar lo guardado.
  const saved = JSON.stringify(fromCharacter(character))
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setDraft(fromCharacter(character))
  }

  const dirty = JSON.stringify(draft) !== saved
  const totals = trainingTotals(character)
  const set = (stat: StatName, key: 'permanent' | 'temporary', value: number) =>
    setDraft((d) => ({ ...d, [stat]: { ...d[stat], [key]: Math.max(0, value) } }))

  async function apply(next: Character, reason: string): Promise<boolean> {
    const changes = diffPaths(character, next)
    if (changes.length === 0) {
      setMessage('No cambia nada: ya estaba así.')
      return false
    }
    await repo.applyChanges(character.id, changes, reason)
    return true
  }

  async function save() {
    const next = setTraining(character, draft)
    if (await apply(next, 'Entrenamiento: actualizó los puntos permanentes y temporales')) {
      setMessage('Entrenamiento guardado.')
    }
  }

  async function lose(loss: TrainingLoss) {
    const preview = previewTrainingLoss(character, loss)
    const total = preview.reduce((sum, p) => sum + (p.before - p.after), 0)
    const what = loss === 'mitad' ? 'la primera mitad de los puntos temporales' : 'todos los puntos temporales'
    const detail = preview.map((p) => `${STAT_LABELS[p.stat]} ${fmt(p.before)} → ${fmt(p.after)}`).join('\n')
    if (!window.confirm(`¿Quitarle a ${character.name} ${what}?\n\n${detail}\n\nEn total pierde ${fmt(total)} puntos.`)) return
    const reason = `Entrenamiento: perdió ${what} (−${fmt(total)} en total)`
    if (await apply(loseTemporaryTraining(character, loss), reason)) {
      setMessage(`Listo: perdió ${what} (${fmt(total)} puntos en total).`)
    }
  }

  const canLoseHalf = !dirty && previewTrainingLoss(character, 'mitad').length > 0
  const canLoseAll = !dirty && previewTrainingLoss(character, 'todo').length > 0
  const hasTemporary = totals.temporary > 0

  return (
    <Section title="Entrenamiento" storageKey="Ficha: entrenamiento">
      <p className="small">
        Permanente: <strong>{fmt(totals.permanent)}</strong> · Temporal: <strong>{fmt(totals.temporary)}</strong>
      </p>
      <div className="grid-2">
        {STAT_NAMES.flatMap((stat) => [
          <NumberField
            key={`${stat}-p`}
            label={`${STAT_LABELS[stat]} · permanente`}
            value={draft[stat].permanent}
            onChange={(v) => set(stat, 'permanent', v)}
          />,
          <NumberField
            key={`${stat}-t`}
            label={`${STAT_LABELS[stat]} · temporal`}
            value={draft[stat].temporary}
            onChange={(v) => set(stat, 'temporary', v)}
          />,
        ])}
      </div>
      <div className="actions">
        <button className="btn" disabled={!dirty} onClick={() => void save()}>
          Guardar entrenamiento
        </button>
      </div>

      <h3 className="slot-title">Perder entrenamiento temporal</h3>
      <p className="muted small">
        Actúa sobre los 7 stats a la vez y no toca el permanente. La "primera mitad" quita la mitad de lo temporal de cada
        stat (si es impar, queda el punto de más); "todo" quita lo que quede.
      </p>
      <div className="actions">
        <button className="btn secondary" disabled={!canLoseHalf} onClick={() => void lose('mitad')}>
          Perder la primera mitad
        </button>
        <button className="btn danger" disabled={!canLoseAll} onClick={() => void lose('todo')}>
          Perder todo lo temporal
        </button>
      </div>
      {dirty && <p className="muted small">Guarda los cambios antes de perder puntos.</p>}
      {!dirty && !hasTemporary && <p className="muted small">No tiene puntos de entrenamiento temporales.</p>}
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      <p className="muted small">
        Los máximos según los despertares están en Más → Tablas de la mesa → Stats de entrenamiento.
      </p>
    </Section>
  )
}

