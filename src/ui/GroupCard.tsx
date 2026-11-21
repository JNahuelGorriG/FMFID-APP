import { useState } from 'react'
import {
  RANKS,
  atFloor,
  damageGroup,
  groupAlive,
  setGroupAlive,
  setGroupPerMember,
  setGroupRank,
  setGroupRankFloor,
  setGroupSize,
  shiftGroupRank,
} from '../rules'
import type { NpcParticipantState } from '../rules'
import { NumberField, SelectField, Stepper } from './fields'
import { Section } from './Section'

const RANK_OPTIONS = RANKS.map((r) => ({ value: r.name, label: r.name }))

/** Panel de una manada: enemigos vivos, vida individual y grupal, y el rango del grupo. */
export function GroupCard({
  npc,
  onChange,
}: {
  npc: NpcParticipantState
  onChange: (change: (n: NpcParticipantState) => NpcParticipantState) => void
}) {
  const g = npc.group
  const [damage, setDamage] = useState(1)
  const [hits, setHits] = useState(1)
  if (!g) return null
  const alive = groupAlive(npc)
  const floor = atFloor(npc)
  const startRank = g.startRank

  return (
    <Section title="Manada" storageKey="Grupo">
      <p className="small">
        <strong>
          Quedan {alive} de {g.size}
        </strong>{' '}
        · vida del grupo {npc.hpCurrent} / {npc.hpMax} · {g.perMember} de vida cada uno
      </p>
      {alive === 0 && <p className="errors">El grupo cayó entero.</p>}

      <div className="grid-2">
        <Stepper label="Enemigos vivos" value={alive} max={g.size} onChange={(v) => onChange((n) => setGroupAlive(n, v))} />
        <div className="actions">
          <button className="btn secondary" disabled={alive === 0} onClick={() => onChange((n) => setGroupAlive(n, groupAlive(n) - 1))}>
            Cae uno
          </button>
          <button className="btn secondary" disabled={alive >= g.size} onClick={() => onChange((n) => setGroupAlive(n, groupAlive(n) + 1))}>
            Vuelve uno
          </button>
        </div>
      </div>
      <p className="muted small">
        Los vivos salen de la vida del grupo (se cae uno cada vez que baja el equivalente a su vida). Si los cambias a
        mano, la vida del grupo se ajusta sola.
      </p>

      <div className="grid-2">
        <NumberField label="Enemigos en total" integer value={g.size} onChange={(v) => onChange((n) => setGroupSize(n, v))} />
        <NumberField label="Vida de cada uno" integer value={g.perMember} onChange={(v) => onChange((n) => setGroupPerMember(n, v))} />
      </div>

      <h3>Daño a varios</h3>
      <p className="muted small">
        Para un ataque de área: daño de cada golpe y a cuántos enemigos alcanza. Lo que sobra de un enemigo no pasa al
        siguiente.
      </p>
      <div className="grid-2">
        <NumberField label="Daño por golpe" integer value={damage} onChange={(v) => setDamage(Math.max(0, v))} />
        <NumberField label="Enemigos alcanzados" integer value={hits} onChange={(v) => setHits(Math.max(1, v))} />
      </div>
      <button className="btn danger" onClick={() => onChange((n) => damageGroup(n, damage, hits))}>
        Aplicar {damage * hits} de daño
      </button>

      <h3>Rango del grupo: {npc.profile.rank}</h3>
      <div className="actions">
        <button className="btn secondary" disabled={floor} onClick={() => onChange((n) => shiftGroupRank(n, -1))}>
          Bajar un rango
        </button>
        <button
          className="btn secondary"
          disabled={RANKS.findIndex((r) => r.name === npc.profile.rank) >= RANKS.findIndex((r) => r.name === startRank)}
          onClick={() => onChange((n) => shiftGroupRank(n, 1))}
        >
          Subir un rango
        </button>
      </div>
      {floor && <p className="muted small">Ya está en el piso ({g.rankFloor}): no baja más con los botones.</p>}
      <div className="grid-2">
        <SelectField label="Rango actual del grupo" value={npc.profile.rank} options={RANK_OPTIONS} onChange={(v) => onChange((n) => setGroupRank(n, v))} />
        <SelectField label="Piso del rango" value={g.rankFloor} options={RANK_OPTIONS} onChange={(v) => onChange((n) => setGroupRankFloor(n, v))} />
      </div>
      <p className="muted small">Empezó en {startRank}. El selector te deja poner cualquier rango, aunque pase el piso.</p>
    </Section>
  )
}
