import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { addNpcParticipant, addPcParticipant } from '../../rules'
import type { Combat } from '../../rules'
import { combatRepo, npcRepo, repo } from '../data'
import { NumberField, OptionalNumberField, SelectField, TextField } from '../fields'

export function AddView({ combat }: { combat: Combat }) {
  const characters = useLiveQuery(() => repo.list(), [])
  const npcs = useLiveQuery(() => npcRepo.list(), [])
  const taken = new Set(combat.participants.map((p) => p.characterId).filter(Boolean) as string[])
  const available = (characters ?? []).filter((c) => !taken.has(c.id))
  const withProfile = (npcs ?? []).filter((n) => n.combat !== null)

  const [pcId, setPcId] = useState('')
  const [pcInit, setPcInit] = useState<number | undefined>(undefined)
  const [npcId, setNpcId] = useState('')
  const [npcName, setNpcName] = useState('')
  const [npcInit, setNpcInit] = useState<number | undefined>(undefined)
  const [qty, setQty] = useState(1)
  const [side, setSide] = useState<'enemigo' | 'aliado'>('enemigo')

  const pcChoice = available.find((c) => c.id === pcId) ?? available[0]
  const npcChoice = withProfile.find((n) => n.id === npcId) ?? withProfile[0]

  return (
    <>
      <div className="card">
        <h2>Jugador</h2>
        {available.length > 0 ? (
          <>
            <SelectField
              label="Jugador"
              value={pcChoice?.id ?? ''}
              options={available.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setPcId}
            />
            <OptionalNumberField label="Iniciativa del jugador" value={pcInit} onChange={setPcInit} />
            <button
              className="btn secondary"
              onClick={() => pcChoice && void combatRepo.update(combat.id, (c) => addPcParticipant(c, pcChoice, pcInit ?? null))}
            >
              Agregar jugador
            </button>
          </>
        ) : (
          <p className="muted small">No quedan jugadores por agregar.</p>
        )}
      </div>

      <div className="card">
        <h2>NPC</h2>
        {withProfile.length > 0 ? (
          <>
            <SelectField
              label="NPC con perfil de combate"
              value={npcChoice?.id ?? ''}
              options={withProfile.map((n) => ({ value: n.id, label: n.name }))}
              onChange={setNpcId}
            />
            <TextField label="Nombre en el combate" value={npcName} onChange={setNpcName} placeholder={npcChoice?.name} />
            <div className="grid-2">
              <NumberField label="Cantidad" integer value={qty} onChange={(v) => setQty(Math.max(1, v))} />
              <OptionalNumberField label="Iniciativa del NPC" value={npcInit} onChange={setNpcInit} />
            </div>
            <SelectField
              label="Bando"
              value={side}
              options={[
                { value: 'enemigo' as const, label: 'Enemigo' },
                { value: 'aliado' as const, label: 'Aliado' },
              ]}
              onChange={setSide}
            />
            <button
              className="btn secondary"
              onClick={() => {
                if (!npcChoice?.combat) return
                const base = npcName.trim() || npcChoice.name
                const profile = npcChoice.combat
                void combatRepo.update(combat.id, (c) => {
                  let next = c
                  for (let i = 1; i <= qty; i++) {
                    next = addNpcParticipant(next, { name: qty > 1 ? `${base} ${i}` : base, profile }, npcInit ?? null, side)
                  }
                  return next
                })
              }}
            >
              Agregar NPC
            </button>
          </>
        ) : (
          <p className="muted small">Ningún NPC tiene perfil de combate todavía.</p>
        )}
      </div>
    </>
  )
}
