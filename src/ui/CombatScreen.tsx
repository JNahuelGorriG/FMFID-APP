import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  addNpcParticipant,
  addPcParticipant,
  advanceRound,
  advanceTurn,
  dismissAlert,
  orderedParticipants,
  setInitiative,
  startCombat,
} from '../rules'
import type { CombatStatus, Participant, World } from '../rules'
import { combatRepo, npcRepo, repo } from './data'
import { NumberField, OptionalNumberField, SelectField, TextField } from './fields'

interface Props {
  id: string
  onBack: () => void
  onOpenParticipant: (participantId: string) => void
  onDeleted: () => void
}

const STATUS_OPTIONS: { value: CombatStatus; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'terminado', label: 'Terminado' },
]

export function CombatScreen({ id, onBack, onOpenParticipant, onDeleted }: Props) {
  const world = useLiveQuery(() => combatRepo.loadWorld(id), [id])
  const characters = useLiveQuery(() => repo.list(), [])
  const npcs = useLiveQuery(() => npcRepo.list(), [])
  const [tick, setTick] = useState(true)

  if (world === undefined) return <p className="muted">Cargando…</p>
  const { combat } = world
  const run = (change: (w: World) => World) => combatRepo.update(id, change)
  const order = orderedParticipants(combat.participants)

  async function remove() {
    if (!window.confirm(`¿Eliminar el combate "${combat.name}"?`)) return
    await combatRepo.remove(id)
    onDeleted()
  }

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a los combates">
          ←
        </button>
        <h1 className="tight grow">{combat.name}</h1>
      </header>

      <div className="card">
        <p className="small muted">
          {combat.round === 0 ? 'Sin empezar' : `Ronda ${combat.round}`}
        </p>
        <div className="actions">
          {combat.round === 0 ? (
            <button className="btn" onClick={() => void run(startCombat)}>
              Empezar combate
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => void run((w) => advanceTurn(w, { tickDurations: tick }))}>
                Siguiente turno
              </button>
              <button
                className="btn secondary"
                onClick={() => void run((w) => advanceRound(w, { tickDurations: tick }))}
              >
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
          onChange={(status) => void run((w) => ({ ...w, combat: { ...w.combat, status } }))}
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
                onClick={() => void run((w) => ({ ...w, combat: dismissAlert(w.combat, a.id) }))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <h2>Orden de turnos</h2>
      {order.length === 0 && <p className="muted small">Agrega participantes para armar el orden.</p>}
      {order.map((p) => (
        <ParticipantCard
          key={p.id}
          participant={p}
          world={world}
          active={p.id === combat.activeId}
          onOpen={() => onOpenParticipant(p.id)}
          onInitiative={(value) => void run((w) => ({ ...w, combat: setInitiative(w.combat, p.id, value ?? null) }))}
        />
      ))}

      <AddParticipants
        taken={new Set(combat.participants.map((p) => p.characterId).filter(Boolean) as string[])}
        characters={(characters ?? []).filter((c) => !c.retired)}
        npcs={(npcs ?? []).filter((n) => n.combat !== null)}
        onAddPc={(character, initiative) =>
          void run((w) => ({ ...w, combat: addPcParticipant(w.combat, character, initiative) }))
        }
        onAddNpc={(npc, initiative) =>
          void run((w) => ({ ...w, combat: addNpcParticipant(w.combat, npc, initiative) }))
        }
      />

      <button className="btn danger" onClick={() => void remove()}>
        Eliminar combate
      </button>
    </section>
  )
}

function ParticipantCard({
  participant,
  world,
  active,
  onOpen,
  onInitiative,
}: {
  participant: Participant
  world: World
  active: boolean
  onOpen: () => void
  onInitiative: (value: number | undefined) => void
}) {
  const state = participant.characterId ? world.states[participant.characterId] : undefined
  let summary = ''
  if (participant.kind === 'pc' && state) {
    const h = state.health
    summary = `Vida ${h.leve} · ${h.medio} · ${h.letal}`
    if (state.barriers.length > 0) summary += ` · ${state.barriers.length} barrera(s)`
    summary += ` · Salvaciones ${state.saves.current}`
  } else if (participant.npc) {
    summary = `Vida ${participant.npc.hpCurrent} / ${participant.npc.hpMax}`
    if (participant.npc.barriers.length > 0) summary += ` · ${participant.npc.barriers.length} barrera(s)`
  }
  const effects = state?.effects ?? participant.npc?.effects ?? []

  return (
    <div className={active ? 'card participant active' : 'card participant'}>
      <div className="row">
        <button className="link-btn grow" onClick={onOpen}>
          <span className="name">{participant.name}</span>
          {active && <span className="chip">Su turno</span>}
          <span className="muted small block">
            {participant.kind === 'pc' ? 'Jugador' : 'NPC'} · {summary}
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
    </div>
  )
}

function AddParticipants({
  taken,
  characters,
  npcs,
  onAddPc,
  onAddNpc,
}: {
  taken: Set<string>
  characters: { id: string; name: string }[]
  npcs: { id: string; name: string; combat: import('../rules').EnemyProfile | null }[]
  onAddPc: (character: { id: string; name: string }, initiative: number | null) => void
  onAddNpc: (npc: { name: string; profile: import('../rules').EnemyProfile }, initiative: number | null) => void
}) {
  const available = characters.filter((c) => !taken.has(c.id))
  const [pcId, setPcId] = useState('')
  const [pcInit, setPcInit] = useState<number | undefined>(undefined)
  const [npcId, setNpcId] = useState('')
  const [npcName, setNpcName] = useState('')
  const [npcInit, setNpcInit] = useState<number | undefined>(undefined)
  const [qty, setQty] = useState(1)

  const pcChoice = available.find((c) => c.id === pcId) ?? available[0]
  const npcChoice = npcs.find((n) => n.id === npcId) ?? npcs[0]

  return (
    <div className="card">
      <h2>Agregar participantes</h2>

      {available.length > 0 ? (
        <>
          <SelectField
            label="Jugador"
            value={pcChoice?.id ?? ''}
            options={available.map((c) => ({ value: c.id, label: c.name }))}
            onChange={setPcId}
          />
          <OptionalNumberField label="Iniciativa del jugador" value={pcInit} onChange={setPcInit} />
          <button className="btn secondary" onClick={() => pcChoice && onAddPc(pcChoice, pcInit ?? null)}>
            Agregar jugador
          </button>
        </>
      ) : (
        <p className="muted small">No quedan jugadores por agregar.</p>
      )}

      <h2 className="spaced">NPC</h2>
      {npcs.length > 0 ? (
        <>
          <SelectField
            label="NPC con perfil de combate"
            value={npcChoice?.id ?? ''}
            options={npcs.map((n) => ({ value: n.id, label: n.name }))}
            onChange={setNpcId}
          />
          <TextField label="Nombre en el combate" value={npcName} onChange={setNpcName} placeholder={npcChoice?.name} />
          <div className="grid-2">
            <NumberField label="Cantidad" integer value={qty} onChange={(v) => setQty(Math.max(1, v))} />
            <OptionalNumberField label="Iniciativa del NPC" value={npcInit} onChange={setNpcInit} />
          </div>
          <button
            className="btn secondary"
            onClick={() => {
              if (!npcChoice?.combat) return
              const base = npcName.trim() || npcChoice.name
              for (let i = 1; i <= qty; i++) {
                onAddNpc({ name: qty > 1 ? `${base} ${i}` : base, profile: npcChoice.combat }, npcInit ?? null)
              }
            }}
          >
            Agregar NPC
          </button>
        </>
      ) : (
        <p className="muted small">Ningún NPC tiene perfil de combate todavía.</p>
      )}
    </div>
  )
}
