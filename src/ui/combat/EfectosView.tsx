import { useState } from 'react'
import type { Combat, Profile } from '../../rules'
import { BuffsView } from './BuffsView'
import type { BuffMode } from './BuffsView'
import { PickParticipants } from './PickParticipants'
import { VidaView } from './VidaView'
import type { LifeMode } from './VidaView'

type Mode = BuffMode | LifeMode

/** Primero lo que se aplica como buff, después curación y barrera, y al final el daño. */
const MODES: { id: Mode; label: string }[] = [
  { id: 'manual', label: 'Buff o debuff' },
  { id: 'espiritu', label: 'Espíritu' },
  { id: 'limite', label: 'Aumento del límite' },
  { id: 'curar', label: 'Curar' },
  { id: 'barrera', label: 'Barrera' },
  { id: 'danar', label: 'Dañar' },
]

const isBuffMode = (mode: Mode): mode is BuffMode => mode === 'manual' || mode === 'espiritu' || mode === 'limite'

/**
 * Aplica efectos a uno o más combatientes: buffs y debuffs, Espíritu, aumentos del límite, curación,
 * barrera de vida y daño. Se eligen a quiénes una sola vez y se pasa de un efecto a otro.
 */
export function EfectosView({ combat, profiles }: { combat: Combat; profiles: Profile[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [mode, setMode] = useState<Mode>('manual')

  if (profiles.length === 0) {
    return <p className="muted small">Agrega participantes para aplicarles efectos.</p>
  }

  return (
    <>
      <PickParticipants title="A quiénes" profiles={profiles} selected={selected} onChange={setSelected} />

      <div className="seg" role="group" aria-label="Qué aplicar">
        {MODES.map(({ id, label }) => (
          <button key={id} className={id === mode ? 'tab active' : 'tab'} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {isBuffMode(mode) ? (
        <BuffsView combat={combat} profiles={profiles} mode={mode} selected={selected} />
      ) : (
        <VidaView combat={combat} profiles={profiles} mode={mode} selected={selected} />
      )}
    </>
  )
}
