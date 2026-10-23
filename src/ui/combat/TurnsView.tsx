import { useState } from 'react'
import {
  advanceRound,
  advanceTurn,
  dismissAlert,
  orderedParticipants,
  setInitiative,
  setSide,
  startCombat,
} from '../../rules'
import type { Combat, CombatStatus, Participant } from '../../rules'
import { combatRepo } from '../data'
import { OptionalNumberField, SelectField } from '../fields'
import { SIDE_LABELS } from '../format'

const STATUS_OPTIONS: { value: CombatStatus; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'terminado', label: 'Terminado' },
]

interface Props {
  combat: Combat
  onOpenParticipant: (participantId: string) => void
  onDeleted: () => void
}

export function TurnsView({ combat, onOpenParticipant, onDeleted }: Props) {
  const [tick, setTick] = useState(true)
  const run = (change: (c: Combat) => Combat) => combatRepo.update(combat.id, change)
  const order = orderedParticipants(combat.participants)

  function remove() {
    if (window.confirm(`¿Eliminar el combate "${combat.name}"?`)) onDeleted()
  }

  return (
    <>
      <div className="card">
        <div className="actions">
          {combat.round === 0 ? (
            <button className="btn" onClick={() => void run(startCombat)}>
              Empezar combate
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => void run((c) => advanceTurn(c, { tickDurations: tick }))}>
                Siguiente turno
              </button>
              <button className="btn secondary" onClick={() => void run((c) => advanceRound(c, { tickDurations: tick }))}>
                Siguiente ronda
              </button>
            </>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} />
          Bajar duraciones al avanzar
        </label>
        <SelectField
          label="Estado del combate"
          value={combat.status}
          options={STATUS_OPTIONS}
          onChange={(status) => void run((c) => ({ ...c, status }))}
        />
      </div>

      {combat.alerts.length > 0 && (
        <div className="card alerts" aria-label="Avisos">
          {combat.alerts.map((a) => (
            <div key={a.id} className="row">
              <span className="grow small">{a.text}</span>
              <button
                className="icon-btn"
                aria-label="Descartar aviso"
                onClick={() => void run((c) => dismissAlert(c, a.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <h2>Orden de turnos</h2>
      {order.length === 0 && <p className="muted small">Agrega participantes desde la sección Agregar.</p>}
      {order.map((p) => (
        <ParticipantCard
          key={p.id}
          participant={p}
          active={p.id === combat.activeId}
          onOpen={() => onOpenParticipant(p.id)}
          onInitiative={(value) => void run((c) => setInitiative(c, p.id, value ?? null))}
          onSide={(side) => void run((c) => setSide(c, p.id, side))}
        />
      ))}

      <button className="btn danger" onClick={remove}>
        Eliminar combate
      </button>
    </>
  )
}

function ParticipantCard({
  participant,
  active,
  onOpen,
  onInitiative,
  onSide,
}: {
  participant: Participant
  active: boolean
  onOpen: () => void
  onInitiative: (value: number | undefined) => void
  onSide: (side: 'aliado' | 'enemigo') => void
}) {
  let summary = ''
  if (participant.pc) {
    const h = participant.pc.health
    summary = `Vida ${h.leve} · ${h.medio} · ${h.letal}`
    if (participant.pc.barriers.length > 0) summary += ` · ${participant.pc.barriers.length} barrera(s)`
    summary += ` · Salvaciones ${participant.pc.saves.current}`
    if ((participant.pc.saturation ?? 0) > 0) summary += ` · Saturación ${participant.pc.saturation} %`
    if (participant.pc.armor) summary += ` · Armadura ${participant.pc.armor.usesLeft}/${participant.pc.armor.usesMax}`
  } else if (participant.npc) {
    summary = `Vida ${participant.npc.hpCurrent} / ${participant.npc.hpMax}`
    if (participant.npc.barriers.length > 0) summary += ` · ${participant.npc.barriers.length} barrera(s)`
  }
  const effects = participant.pc?.effects ?? participant.npc?.effects ?? []

  return (
    <div className={active ? 'card participant active' : 'card participant'}>
      <div className="row">
        <button className="link-btn grow" onClick={onOpen}>
          <span className="name">{participant.name}</span>
          {active && <span className="chip">Su turno</span>}
          <span className="muted small block">
            {SIDE_LABELS[participant.side]} · {summary}
            {effects.length > 0 ? ` · ${effects.length} efecto(s)` : ''}
          </span>
        </button>
        <div className="init">
          <OptionalNumberField
            label={`Iniciativa de ${participant.name}`}
            value={participant.initiative ?? undefined}
            onChange={onInitiative}
          />
        </div>
      </div>
      {participant.kind === 'npc' && (
        <SelectField
          label={`Bando de ${participant.name}`}
          value={participant.side === 'aliado' ? 'aliado' : 'enemigo'}
          options={[
            { value: 'enemigo' as const, label: 'Enemigo' },
            { value: 'aliado' as const, label: 'Aliado' },
          ]}
          onChange={onSide}
        />
      )}
    </div>
  )
}
