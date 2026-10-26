import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { RANKS, addNpcParticipant, addPcParticipant } from '../../rules'
import type { Combat, NpcKind } from '../../rules'
import { combatRepo, npcRepo, repo } from '../data'
import { NumberField, OptionalNumberField, SelectField, TextField } from '../fields'
import { Section } from '../Section'

const RANK_OPTIONS = RANKS.map((r) => ({ value: r.name, label: r.name }))
const MAX_RESULTS = 40

export function AddView({ combat }: { combat: Combat }) {
  const characters = useLiveQuery(() => repo.list(), [])
  const taken = new Set(combat.participants.map((p) => p.characterId).filter(Boolean) as string[])
  const available = (characters ?? []).filter((c) => !taken.has(c.id))

  const [pcId, setPcId] = useState('')
  const [pcInit, setPcInit] = useState<number | undefined>(undefined)
  const pcChoice = available.find((c) => c.id === pcId) ?? available[0]

  const [kind, setKind] = useState<NpcKind>('bestia')
  const [query, setQuery] = useState('')
  const [npcId, setNpcId] = useState('')
  const [rank, setRank] = useState<string | null>(null)
  const [npcName, setNpcName] = useState('')
  const [npcInit, setNpcInit] = useState<number | undefined>(undefined)
  const [qty, setQty] = useState(1)
  const [side, setSide] = useState<'enemigo' | 'aliado'>('enemigo')

  const found = useLiveQuery(() => npcRepo.list(query, kind), [query, kind])
  const results = (found ?? []).filter((n) => n.combat !== null)
  const shown = results.slice(0, MAX_RESULTS)
  const npcChoice = results.find((n) => n.id === npcId)
  const rankChoice = rank ?? npcChoice?.combat?.rank ?? 'E'

  return (
    <>
      <Section title="Jugador">
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
      </Section>

      <Section title="NPC o bestia">
        <div className="seg" role="group" aria-label="Lista">
          {(['bestia', 'npc'] as const).map((k) => (
            <button
              key={k}
              className={k === kind ? 'tab active' : 'tab'}
              onClick={() => {
                setKind(k)
                setNpcId('')
                setRank(null)
              }}
            >
              {k === 'bestia' ? 'Bestiario' : 'NPCs'}
            </button>
          ))}
        </div>
        <TextField
          label="Buscar"
          value={query}
          onChange={setQuery}
          placeholder="Nombre, familia o rango exacto (B+)"
        />
        {shown.length === 0 ? (
          <p className="muted small">Ninguno con perfil de combate coincide.</p>
        ) : (
          <div className="picker" role="listbox" aria-label="Resultados">
            {shown.map((n) => (
              <button
                key={n.id}
                role="option"
                aria-selected={n.id === npcChoice?.id}
                className={n.id === npcChoice?.id ? 'selected' : ''}
                onClick={() => {
                  setNpcId(n.id)
                  setRank(null)
                }}
              >
                <span>{n.name}</span>
                <span className="muted small">{n.combat?.rank}</span>
              </button>
            ))}
          </div>
        )}
        {results.length > shown.length && (
          <p className="muted small">Mostrando {shown.length} de {results.length}. Afina la búsqueda.</p>
        )}

        {npcChoice && (
          <>
            <p className="small">
              Elegido: <strong>{npcChoice.name}</strong>
            </p>
            <SelectField
              label="Rango en este combate"
              value={rankChoice}
              options={RANK_OPTIONS}
              onChange={setRank}
            />
            <TextField label="Nombre en el combate" value={npcName} onChange={setNpcName} placeholder={npcChoice.name} />
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
                if (!npcChoice.combat) return
                const base = npcName.trim() || npcChoice.name
                const profile = { ...npcChoice.combat, rank: rankChoice }
                void combatRepo.update(combat.id, (c) => {
                  let next = c
                  for (let i = 1; i <= qty; i++) {
                    next = addNpcParticipant(next, { name: qty > 1 ? `${base} ${i}` : base, profile }, npcInit ?? null, side)
                  }
                  return next
                })
              }}
            >
              Agregar al combate
            </button>
          </>
        )}
      </Section>
    </>
  )
}
