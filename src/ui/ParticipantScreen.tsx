import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  RANKS,
  STAT_NAMES,
  armorFromTable,
  batteryGainFromRoll,
  chargeBattery,
  claimSaveFromBattery,
  effectiveCharacter,
  effectiveEnemy,
  naturalBases,
  removeParticipant,
  updateParticipant,
} from '../rules'
import type {
  ArmorTarget,
  ArmorType,
  Character,
  Combat,
  DurationUnit,
  EffectType,
  NpcParticipantState,
  Participant,
  PcState,
} from '../rules'
import { clampSaturation, SATURATION_PER_WOUND } from '../rules'
import { combatRepo, repo, settingsRepo } from './data'
import { EffectsPanel } from './EffectsPanel'
import { NumberField, SelectField, Stepper } from './fields'
import { STAT_LABELS, describeDuration, fmt } from './format'

interface Props {
  combatId: string
  participantId: string
  onBack: () => void
}

export function ParticipantScreen({ combatId, participantId, onBack }: Props) {
  const combat = useLiveQuery(() => combatRepo.get(combatId), [combatId])
  const types = useLiveQuery(() => settingsRepo.getEffectTypes(), [])
  const participant = combat?.participants.find((p) => p.id === participantId)
  const characterId = participant?.characterId ?? null
  const character = useLiveQuery(
    () => (characterId ? repo.get(characterId) : Promise.resolve(undefined)),
    [characterId],
  )

  if (combat === undefined || types === undefined) return <p className="muted">Cargando…</p>
  if (!participant) {
    return (
      <section>
        <button className="icon-btn" onClick={onBack} aria-label="Volver al combate">←</button>
        <p className="muted">Este participante ya no está en el combate.</p>
      </section>
    )
  }

  async function remove() {
    if (!participant || !window.confirm(`¿Quitar a ${participant.name} del combate?`)) return
    await combatRepo.update(combatId, (c) => removeParticipant(c, participantId))
    onBack()
  }

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver al combate">
          ←
        </button>
        <h1 className="tight grow">{participant.name}</h1>
      </header>

      {participant.pc ? (
        character ? (
          <PcPanel
            combat={combat}
            participantId={participantId}
            character={character}
            pc={participant.pc}
            types={types}
          />
        ) : (
          <p className="muted">Cargando…</p>
        )
      ) : participant.npc ? (
        <NpcPanel combat={combat} participant={participant} npc={participant.npc} types={types} />
      ) : (
        <p className="muted">No hay datos de este participante.</p>
      )}

      <button className="btn danger" onClick={() => void remove()}>
        Quitar del combate
      </button>
    </section>
  )
}

const BARRIER_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'turnos', label: 'Turnos' },
  { value: 'rondas', label: 'Rondas' },
  { value: 'manual', label: 'Hasta que se agote' },
]

const ARMOR_OPTIONS: { value: ArmorType; label: string }[] = [
  { value: 'ligera', label: 'Ligera' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'pesada', label: 'Pesada' },
]
const TARGET_OPTIONS: { value: ArmorTarget; label: string }[] = [
  { value: 'fisica', label: 'Defensa física' },
  { value: 'magica', label: 'Defensa mágica' },
  { value: 'ambas', label: 'Ambas defensas' },
]
const RANK_OPTIONS = RANKS.map((r) => ({ value: r.name, label: r.name }))

function ChangedValues({ rows }: { rows: [string, number, number][] }) {
  if (rows.length === 0) return null
  return (
    <div className="card">
      <h2>Valores con efectos</h2>
      <dl className="derived">
        {rows.map(([label, natural, current]) => (
          <div key={label} className="kv-between">
            <dt>{label}</dt>
            <dd>
              {fmt(natural)} → {fmt(current)} ({current - natural >= 0 ? '+' : ''}
              {fmt(current - natural)})
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function PcPanel({
  combat,
  participantId,
  character,
  pc,
  types,
}: {
  combat: Combat
  participantId: string
  character: Character
  pc: PcState
  types: EffectType[]
}) {
  const update = (change: (s: PcState) => PcState) =>
    combatRepo.update(combat.id, (c) =>
      updateParticipant(c, participantId, (p) => (p.pc ? { ...p, pc: change(p.pc) } : p)),
    )

  const view = effectiveCharacter(character, pc.effects)
  const sheet = view.natural
  const bases = naturalBases(sheet.totals, sheet.derived)
  const base = character.baseHealth
  const state = pc
  const saturation = pc.saturation ?? 0

  const [bLeve, setBLeve] = useState(0)
  const [bMedio, setBMedio] = useState(0)
  const [bLetal, setBLetal] = useState(0)
  const [bUnit, setBUnit] = useState<DurationUnit>('rondas')
  const [bRemaining, setBRemaining] = useState(3)
  const [roll, setRoll] = useState(10)
  const [message, setMessage] = useState('')

  const rows: [string, number, number][] = []
  for (const s of STAT_NAMES) {
    if (view.stats[s] !== sheet.totals[s]) rows.push([STAT_LABELS[s], sheet.totals[s], view.stats[s]])
  }
  const pairs: [string, number | null, number | null][] = [
    ['Daño físico', sheet.derived.physDamage, view.derived.physDamage],
    ['Daño físico con arma', sheet.derived.physDamageWithWeapon, view.derived.physDamageWithWeapon],
    ['Daño mágico', sheet.derived.magicDamage, view.derived.magicDamage],
    ['Daño mágico con arma', sheet.derived.magicDamageWithWeapon, view.derived.magicDamageWithWeapon],
    ['Defensa física CA', sheet.derived.physDefenseCA, view.derived.physDefenseCA],
    ['Defensa física SA', sheet.derived.physDefenseSA, view.derived.physDefenseSA],
    ['Defensa mágica CA', sheet.derived.magicDefenseCA, view.derived.magicDefenseCA],
    ['Defensa mágica SA', sheet.derived.magicDefenseSA, view.derived.magicDefenseSA],
  ]
  for (const [label, n, e] of pairs) if (n !== null && e !== null && n !== e) rows.push([label, n, e])

  function addBarrier() {
    if (bLeve + bMedio + bLetal <= 0) return setMessage('La barrera necesita al menos una herida.')
    setMessage('')
    void update((s) => ({
      ...s,
      barriers: [
        ...s.barriers,
        {
          id: crypto.randomUUID(),
          wounds: { leve: bLeve, medio: bMedio, letal: bLetal },
          duration: { unit: bUnit, remaining: bUnit === 'manual' ? 0 : bRemaining },
          combatId: combat.id,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
  }

  function loadFromRoll() {
    try {
      const gain = batteryGainFromRoll(roll)
      void update((s) => ({ ...s, saves: chargeBattery(s.saves, gain, 'natural') }))
      setMessage(gain === 0 ? 'Con esa tirada no carga batería.' : `Batería +${gain}.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Tirada inválida.')
    }
  }

  function claim() {
    const next = claimSaveFromBattery(state.saves)
    if (!next) return setMessage('No se puede: hace falta batería en 10 y no tener el máximo de salvaciones.')
    setMessage('Recuperó 1 salvación y la batería se vació.')
    void update((s) => ({ ...s, saves: next }))
  }

  return (
    <>
      <div className="card">
        <h2>Vida</h2>
        <div className="grid-3">
          {(['leve', 'medio', 'letal'] as const).map((key) => (
            <Stepper
              key={key}
              label={key === 'leve' ? 'Leves' : key === 'medio' ? 'Medios' : 'Letales'}
              value={state.health[key]}
              max={base[key]}
              onChange={(v) => void update((s) => ({ ...s, health: { ...s.health, [key]: v } }))}
            />
          ))}
        </div>
        {state.health.letal === 0 && <p className="errors">Sin heridas letales: estado crítico.</p>}
      </div>

      <div className="card">
        <h2>Saturación por curación</h2>
        <div
          className="bar"
          role="progressbar"
          aria-label="Saturación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={saturation}
        >
          <div className="bar-fill" style={{ width: `${saturation}%` }} />
        </div>
        <Stepper
          label="Saturación (%)"
          value={saturation}
          min={0}
          max={100}
          onChange={(v) => void update((s) => ({ ...s, saturation: clampSaturation(v) }))}
        />
        <div className="actions">
          {(['leve', 'medio', 'letal'] as const).map((k) => (
            <button
              key={k}
              className="btn secondary compact"
              onClick={() => void update((s) => ({ ...s, saturation: clampSaturation((s.saturation ?? 0) + SATURATION_PER_WOUND[k]) }))}
            >
              Curó 1 {k} (+{SATURATION_PER_WOUND[k]} %)
            </button>
          ))}
        </div>
        <p className="muted small">No suma sola: la llevas tú cuando el jugador se cura.</p>
      </div>

      <div className="card">
        <h2>Armadura</h2>
        {state.armor ? (
          <>
            <div className="grid-2">
              <SelectField
                label="Tipo de armadura"
                value={state.armor.type}
                options={ARMOR_OPTIONS}
                onChange={(type) => void update((s) => ({ ...s, armor: s.armor ? { ...s.armor, type } : s.armor }))}
              />
              <SelectField
                label="Rango de la armadura"
                value={state.armor.rank}
                options={RANK_OPTIONS}
                onChange={(rank) => void update((s) => ({ ...s, armor: s.armor ? { ...s.armor, rank } : s.armor }))}
              />
              <SelectField
                label="La armadura suma a"
                value={state.armor.bonusTarget ?? 'fisica'}
                options={TARGET_OPTIONS}
                onChange={(bonusTarget) =>
                  void update((s) => ({ ...s, armor: s.armor ? { ...s.armor, bonusTarget } : s.armor }))
                }
              />
              <NumberField
                label="Valor que suma a la defensa"
                value={state.armor.bonus}
                onChange={(bonus) => void update((s) => ({ ...s, armor: s.armor ? { ...s.armor, bonus } : s.armor }))}
              />
              <NumberField
                label="Usos máximos"
                integer
                value={state.armor.usesMax}
                onChange={(usesMax) =>
                  void update((s) => ({
                    ...s,
                    armor: s.armor ? { ...s.armor, usesMax, usesLeft: Math.min(s.armor.usesLeft, usesMax) } : s.armor,
                  }))
                }
              />
            </div>
            <Stepper
              label="Usos restantes"
              value={state.armor.usesLeft}
              max={state.armor.usesMax}
              onChange={(usesLeft) => void update((s) => ({ ...s, armor: s.armor ? { ...s.armor, usesLeft } : s.armor }))}
            />
            <div className="actions">
              <button
                className="btn secondary compact"
                onClick={() =>
                  void update((s) => ({ ...s, armor: s.armor ? armorFromTable(s.armor.type, s.armor.rank) : s.armor }))
                }
              >
                Cargar valores de la tabla
              </button>
              <button className="btn secondary compact" onClick={() => void update((s) => ({ ...s, armor: null }))}>
                Sacar armadura
              </button>
            </div>
            <p className="muted small">
              Con armadura y usos, la defensa elegida es la CA más este valor. Sin armadura, cuenta la defensa natural SA.
            </p>
          </>
        ) : (
          <>
            <p className="muted small">Sin armadura puesta: cuenta la defensa natural SA.</p>
            <button
              className="btn secondary"
              onClick={() => void update((s) => ({ ...s, armor: armorFromTable('ligera', sheet.rank?.name ?? 'E') }))}
            >
              Poner armadura
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Barreras</h2>
        {state.barriers.length === 0 && <p className="muted small">Sin barreras.</p>}
        <ul className="history">
          {state.barriers.map((b) => (
            <li key={b.id} className="effect-row">
              <span className="grow small">
                {b.wounds.leve} leves · {b.wounds.medio} medios · {b.wounds.letal} letales ·{' '}
                {describeDuration(b.duration)}
              </span>
              <button
                className="icon-btn"
                aria-label="Quitar barrera"
                onClick={() => void update((s) => ({ ...s, barriers: s.barriers.filter((x) => x.id !== b.id) }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="grid-3">
          <NumberField label="Barrera: leves" integer value={bLeve} onChange={setBLeve} />
          <NumberField label="Barrera: medios" integer value={bMedio} onChange={setBMedio} />
          <NumberField label="Barrera: letales" integer value={bLetal} onChange={setBLetal} />
        </div>
        <div className="grid-2">
          <SelectField label="Barrera dura" value={bUnit} options={BARRIER_UNITS} onChange={setBUnit} />
          {bUnit !== 'manual' && (
            <NumberField label="Barrera: cantidad" integer value={bRemaining} onChange={setBRemaining} />
          )}
        </div>
        <button className="btn secondary" onClick={addBarrier}>
          Agregar barrera
        </button>
      </div>

      <div className="card">
        <h2>Energías</h2>
        <div className="grid-2">
          {(['natural', 'renovable'] as const).map((pool) => (
            <NumberField
              key={`m-${pool}`}
              label={`Maná ${pool} (máx ${fmt(sheet.mana / 2)})`}
              value={state.mana[pool]}
              onChange={(v) => void update((s) => ({ ...s, mana: { ...s.mana, [pool]: v } }))}
            />
          ))}
          {(['natural', 'renovable'] as const).map((pool) => (
            <NumberField
              key={`s-${pool}`}
              label={`Estamina ${pool} (máx ${fmt(sheet.stamina / 2)})`}
              value={state.stamina[pool]}
              onChange={(v) => void update((s) => ({ ...s, stamina: { ...s.stamina, [pool]: v } }))}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Salvaciones</h2>
        <div className="grid-2">
          <Stepper
            label="Salvaciones"
            value={state.saves.current}
            max={state.saves.max}
            onChange={(v) => void update((s) => ({ ...s, saves: { ...s.saves, current: v } }))}
          />
          <Stepper
            label="Máximo"
            value={state.saves.max}
            onChange={(v) => void update((s) => ({ ...s, saves: { ...s.saves, max: v } }))}
          />
          <Stepper
            label="Únicas"
            value={state.saves.unique}
            onChange={(v) => void update((s) => ({ ...s, saves: { ...s.saves, unique: v } }))}
          />
          <Stepper
            label="Batería"
            value={state.saves.battery}
            onChange={(v) => void update((s) => ({ ...s, saves: { ...s.saves, battery: v } }))}
          />
        </div>
        <div className="actions">
          <button className="btn secondary compact" onClick={() => void update((s) => ({ ...s, saves: chargeBattery(s.saves, 1, 'regalo') }))}>
            Regalo de batería +1
          </button>
          <button className="btn secondary compact" onClick={claim}>
            Canjear batería por salvación
          </button>
        </div>
        <NumberField label="Tirada del jugador (d20)" integer value={roll} onChange={setRoll} />
        <button className="btn secondary compact" onClick={loadFromRoll}>
          Cargar batería por la tirada
        </button>
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
      </div>

      <EffectsPanel
        effects={state.effects}
        bases={bases}
        types={types}
        combatId={combat.id}
        onChange={(effects) => void update((s) => ({ ...s, effects }))}
      />

      <ChangedValues rows={rows} />
    </>
  )
}

function NpcPanel({
  combat,
  participant,
  npc,
  types,
}: {
  combat: Combat
  participant: Participant
  npc: NpcParticipantState
  types: EffectType[]
}) {
  const update = (change: (n: NpcParticipantState) => NpcParticipantState) =>
    combatRepo.update(combat.id, (c) =>
      updateParticipant(c, participant.id, (p) => (p.npc ? { ...p, npc: change(p.npc) } : p)),
    )

  const view = effectiveEnemy(npc.profile, npc.effects)
  const bases = naturalBases(view.natural.stats, view.natural)

  const [points, setPoints] = useState(0)
  const [unit, setUnit] = useState<DurationUnit>('rondas')
  const [remaining, setRemaining] = useState(3)
  const [message, setMessage] = useState('')

  const rows: [string, number, number][] = []
  for (const s of STAT_NAMES) {
    if (view.stats[s] !== view.natural.stats[s]) rows.push([STAT_LABELS[s], view.natural.stats[s], view.stats[s]])
  }
  const pairs: [string, number, number][] = [
    ['Daño físico con arma', view.natural.physDamageWithWeapon, view.sheet.physDamageWithWeapon],
    ['Daño mágico con arma', view.natural.magicDamageWithWeapon, view.sheet.magicDamageWithWeapon],
    ['Defensa física CA', view.natural.physDefenseCA, view.sheet.physDefenseCA],
    ['Defensa física SA', view.natural.physDefenseSA, view.sheet.physDefenseSA],
    ['Defensa mágica CA', view.natural.magicDefenseCA, view.sheet.magicDefenseCA],
    ['Defensa mágica SA', view.natural.magicDefenseSA, view.sheet.magicDefenseSA],
  ]
  for (const [label, n, e] of pairs) if (n !== e) rows.push([label, n, e])

  function addBarrier() {
    if (points <= 0) return setMessage('La barrera necesita al menos 1 punto.')
    setMessage('')
    void update((n) => ({
      ...n,
      barriers: [
        ...n.barriers,
        {
          id: crypto.randomUUID(),
          points,
          duration: { unit, remaining: unit === 'manual' ? 0 : remaining },
          combatId: combat.id,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
  }

  return (
    <>
      <div className="card">
        <h2>Vida</h2>
        <div className="grid-2">
          <Stepper
            label="Vida actual"
            value={npc.hpCurrent}
            max={npc.hpMax}
            onChange={(v) => void update((n) => ({ ...n, hpCurrent: v }))}
          />
          <NumberField
            label="Vida máxima"
            integer
            value={npc.hpMax}
            onChange={(v) =>
              void update((n) => ({ ...n, hpMax: Math.max(0, v), hpCurrent: Math.min(n.hpCurrent, Math.max(0, v)) }))
            }
          />
        </div>
        {npc.hpCurrent === 0 && <p className="errors">Sin vida.</p>}
      </div>

      <div className="card">
        <h2>Barreras (puntos)</h2>
        {npc.barriers.length === 0 && <p className="muted small">Sin barreras.</p>}
        <ul className="history">
          {npc.barriers.map((b) => (
            <li key={b.id} className="effect-row">
              <span className="grow small">
                {b.points} punto(s) · {describeDuration(b.duration)}
              </span>
              <button
                className="icon-btn"
                aria-label="Quitar barrera"
                onClick={() => void update((n) => ({ ...n, barriers: n.barriers.filter((x) => x.id !== b.id) }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="grid-2">
          <NumberField label="Barrera: puntos" integer value={points} onChange={setPoints} />
          <SelectField label="Barrera dura" value={unit} options={BARRIER_UNITS} onChange={setUnit} />
          {unit !== 'manual' && <NumberField label="Barrera: cantidad" integer value={remaining} onChange={setRemaining} />}
        </div>
        <button className="btn secondary" onClick={addBarrier}>
          Agregar barrera
        </button>
        {message && (
          <p className="errors" role="alert">
            {message}
          </p>
        )}
      </div>

      <div className="card stats" aria-label="Stats del NPC en combate">
        {STAT_NAMES.map((s) => (
          <div className="stat-row" key={s}>
            <span className="stat-name">{STAT_LABELS[s]}</span>
            <span className="muted small">
              {view.stats[s] !== view.natural.stats[s] ? `natural ${fmt(view.natural.stats[s])}` : ''}
            </span>
            <span className="stat-value">{fmt(view.stats[s])}</span>
          </div>
        ))}
      </div>

      <EffectsPanel
        effects={npc.effects}
        bases={bases}
        types={types}
        combatId={combat.id}
        onChange={(effects) => void update((n) => ({ ...n, effects }))}
      />

      <ChangedValues rows={rows} />
    </>
  )
}
