import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  HEALING_TABLE,
  RANKS,
  STAT_NAMES,
  addAlert,
  applyHealing,
  armorFromTable,
  baseLimit,
  defaultStatCaps,
  batteryGainFromRoll,
  chargeBattery,
  claimSaveFromBattery,
  effectiveCharacter,
  effectiveEnemy,
  healingText,
  naturalBases,
  recordAction,
  removeParticipant,
  spiritLevel,
  withSpirit,
  updateParticipant,
} from '../rules'
import type {
  ArmorTarget,
  ArmorType,
  Character,
  Combat,
  Duration,
  DurationUnit,
  EffectType,
  NpcBarrier,
  NpcParticipantState,
  Participant,
  PcBarrier,
  PcState,
  ResolvedEffect,
  Techniques,
  TechniqueTarget,
} from '../rules'
import { combatRepo, repo, settingsRepo } from './data'
import { EffectsPanel } from './EffectsPanel'
import { clampSaturation } from '../rules'
import { SaturationCard } from './SaturationCard'
import { SpiritCard } from './SpiritCard'
import { StatCapsCard } from './StatCapsCard'
import { WeaponCard } from './WeaponCard'
import { NumberField, SelectField, Stepper } from './fields'
import { STAT_LABELS, describeDuration, fmt, woundsText } from './format'

interface Props {
  combatId: string
  participantId: string
  onBack: () => void
}

export function ParticipantScreen({ combatId, participantId, onBack }: Props) {
  const combat = useLiveQuery(() => combatRepo.get(combatId), [combatId])
  const types = useLiveQuery(() => settingsRepo.getEffectTypes(), [])
  const targets = useLiveQuery(() => settingsRepo.getTechniqueTargets(), [])
  const participant = combat?.participants.find((p) => p.id === participantId)
  const characterId = participant?.characterId ?? null
  const character = useLiveQuery(
    () => (characterId ? repo.get(characterId) : Promise.resolve(undefined)),
    [characterId],
  )

  if (combat === undefined || types === undefined || targets === undefined) return <p className="muted">Cargando…</p>
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
            targets={targets}
          />
        ) : (
          <p className="muted">Cargando…</p>
        )
      ) : participant.npc ? (
        <NpcPanel combat={combat} participant={participant} npc={participant.npc} types={types} targets={targets} />
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

/** Edita cuánto dura una barrera: en turnos, en rondas o hasta que se agote. */
function BarrierDuration({
  index,
  duration,
  onChange,
}: {
  index: number
  duration: Duration
  onChange: (duration: Duration) => void
}) {
  return (
    <div className="grid-2">
      <SelectField
        label={`Barrera ${index} dura`}
        value={duration.unit === 'turnos' || duration.unit === 'rondas' ? duration.unit : 'manual'}
        options={BARRIER_UNITS}
        onChange={(unit) => onChange({ unit, remaining: unit === 'manual' ? 0 : Math.max(1, duration.remaining) })}
      />
      {(duration.unit === 'turnos' || duration.unit === 'rondas') && (
        <NumberField
          label={`Barrera ${index}: duración`}
          integer
          value={duration.remaining}
          onChange={(remaining) => onChange({ ...duration, remaining: Math.max(1, remaining) })}
        />
      )}
    </div>
  )
}

/** Los aumentos del límite que están activos, con su origen, para mostrar de dónde sale cada uno. */
function raisesOf(resolved: ResolvedEffect[], types: EffectType[]) {
  return resolved
    .filter((r) => r.effect.target === 'limite' && r.state === 'activo')
    .map((r) => ({
      id: r.effect.id,
      label: `${r.effect.name}, ${types.find((t) => t.id === r.effect.typeId)?.name ?? r.effect.typeId}`,
      amount: r.effect.kind === 'buff' ? r.amount : -r.amount,
    }))
}

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
  targets,
}: {
  combat: Combat
  participantId: string
  character: Character
  pc: PcState
  types: EffectType[]
  targets: Record<keyof Techniques, TechniqueTarget>
}) {
  const update = (change: (s: PcState) => PcState) =>
    combatRepo.update(combat.id, (c) =>
      updateParticipant(c, participantId, (p) => (p.pc ? { ...p, pc: change(p.pc) } : p)),
    )

  const view = effectiveCharacter(character, pc.effects, pc.statCaps)
  const sheet = view.natural
  const bases = naturalBases(sheet.totals, sheet.derived, baseLimit(sheet.rank?.group ?? 'bajo'))
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
  const [healLevel, setHealLevel] = useState(1)
  const [healOption, setHealOption] = useState(0)
  const [healSaturate, setHealSaturate] = useState(true)
  const [hUnit, setHUnit] = useState<DurationUnit>('rondas')
  const [hRemaining, setHRemaining] = useState(3)

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

  const healing = HEALING_TABLE.find((l) => l.level === healLevel) ?? HEALING_TABLE[0]
  const chosen = healing.options[Math.min(healOption, healing.options.length - 1)]

  async function applyHeal() {
    const duration = { unit: hUnit, remaining: hUnit === 'manual' ? 0 : hRemaining }
    const settings = { barrierDuration: duration, combatId: combat.id, saturate: healSaturate }
    const preview = applyHealing(pc, character.baseHealth, chosen, settings)
    const parts = [`cura ${woundsText(preview.healed)}`]
    if (preview.barrier) parts.push(`barrera de ${woundsText(preview.barrier)}`)
    const text = `${character.name} recibe una curación de nivel ${healing.level} (${healing.rank}), opción ${healing.options.indexOf(chosen) + 1}: ${parts.join(' y ')}.`
    await combatRepo.update(combat.id, (c) => {
      const target = c.participants.find((p) => p.id === participantId)
      if (!target?.pc) return c
      const next = updateParticipant(recordAction(c, text, target), participantId, (p) =>
        p.pc ? { ...p, pc: applyHealing(p.pc, character.baseHealth, chosen, settings).pc } : p,
      )
      return addAlert(next, text)
    })
    setMessage(text)
  }

  /** Edita una barrera a mano. Si queda en 0 en todo, desaparece. */
  function editPcBarrier(id: string, patch: Partial<PcBarrier>) {
    return update((s) => ({
      ...s,
      barriers: s.barriers
        .map((b) => (b.id === id ? { ...b, ...patch } : b))
        .filter((b) => b.wounds.leve + b.wounds.medio + b.wounds.letal > 0),
    }))
  }

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
        {state.health.leve + state.health.medio + state.health.letal === 0 ? (
          <p className="errors">Sin vida: no queda nada por descontar.</p>
        ) : (
          state.health.letal === 0 && <p className="errors">Sin heridas letales: estado crítico.</p>
        )}
      </div>

      <div className="card">
        <h2>Curación</h2>
        <p className="muted small">Pociones y curación por energía. Cada nivel ofrece 1 a 3 formas de usar la misma curación.</p>
        <SelectField
          label="Nivel de curación"
          value={healLevel}
          options={HEALING_TABLE.map((l) => ({ value: l.level, label: `Nivel ${l.level} (${l.rank})` }))}
          onChange={(v) => {
            setHealLevel(v)
            setHealOption(0)
          }}
        />
        <div role="radiogroup" aria-label="Opciones de curación">
          {healing.options.map((o, i) => (
            <label key={i} className="check">
              <input
                type="radio"
                name="heal-option"
                checked={chosen === o}
                onChange={() => setHealOption(i)}
              />
              Opción {i + 1}: {healingText(o)}
            </label>
          ))}
        </div>
        <p className="small">
          Cura {woundsText(chosen.heal)}
          {chosen.barrier.leve + chosen.barrier.medio + chosen.barrier.letal > 0 &&
            ` y da una barrera de ${woundsText(chosen.barrier)}`}
          .
        </p>
        {chosen.barrier.leve + chosen.barrier.medio + chosen.barrier.letal > 0 && (
          <div className="grid-2">
            <SelectField label="La barrera dura" value={hUnit} options={BARRIER_UNITS} onChange={setHUnit} />
            {hUnit !== 'manual' && (
              <NumberField label="Duración de la barrera" integer value={hRemaining} onChange={setHRemaining} />
            )}
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={healSaturate} onChange={(e) => setHealSaturate(e.target.checked)} />
          Sumar a la saturación lo que se cure
        </label>
        <button className="btn" onClick={() => void applyHeal()}>
          Aplicar curación
        </button>
      </div>

      <SaturationCard
        value={saturation}
        onSet={(v) => void update((s) => ({ ...s, saturation: clampSaturation(v) }))}
        onAdd={(d) => void update((s) => ({ ...s, saturation: clampSaturation((s.saturation ?? 0) + d) }))}
      />

      <div className="card">
        <h2>Armadura</h2>
        {state.armor ? (
          <>
            <p className="result" role="status">
              Armadura puesta: {ARMOR_OPTIONS.find((o) => o.value === state.armor?.type)?.label} {state.armor.rank} · suma{' '}
              {state.armor.bonus} a la {TARGET_OPTIONS.find((o) => o.value === (state.armor?.bonusTarget ?? 'fisica'))?.label.toLowerCase()} ·{' '}
              {state.armor.usesMax > 0 ? `usos ${state.armor.usesLeft}/${state.armor.usesMax}` : 'sin conteo de usos'}
            </p>
            <div className="grid-2">
              <SelectField
                label="Tipo de armadura"
                value={state.armor.type}
                options={ARMOR_OPTIONS}
                onChange={(type) =>
                  void update((s) => ({
                    ...s,
                    armor: s.armor ? { ...armorFromTable(type, s.armor.rank), bonusTarget: s.armor.bonusTarget } : s.armor,
                  }))
                }
              />
              <SelectField
                label="Rango de la armadura"
                value={state.armor.rank}
                options={RANK_OPTIONS}
                onChange={(rank) =>
                  void update((s) => ({
                    ...s,
                    armor: s.armor ? { ...armorFromTable(s.armor.type, rank), bonusTarget: s.armor.bonusTarget } : s.armor,
                  }))
                }
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
                Restablecer a los valores de la tabla
              </button>
              <button className="btn secondary compact" onClick={() => void update((s) => ({ ...s, armor: null }))}>
                Sacar armadura
              </button>
            </div>
            <p className="muted small">
              Al cambiar el tipo o el rango se cargan solos el valor y los usos de la tabla (los rangos con + usan los usos
              de su letra: D+ usa los de D). Después los puedes editar. Con armadura, la defensa es la CA más el valor; sin
              armadura, o con la armadura agotada, la defensa natural SA. Con usos en 0 cuenta siempre y no se gasta.
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

      <WeaponCard
        weapon={state.weapon ?? null}
        defaultRank={sheet.rank?.name ?? 'E'}
        onChange={(change) => void update((s) => ({ ...s, weapon: change(s.weapon ?? null) }))}
      />

      <div className="card">
        <h2>Barreras</h2>
        {state.barriers.length === 0 && <p className="muted small">Sin barreras.</p>}
        <ul className="history">
          {state.barriers.map((b, i) => (
            <li key={b.id} className="barrier-row">
              <div className="row">
                <span className="grow small">
                  Barrera {i + 1} · {describeDuration(b.duration)}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Quitar barrera ${i + 1}`}
                  onClick={() => void update((s) => ({ ...s, barriers: s.barriers.filter((x) => x.id !== b.id) }))}
                >
                  ×
                </button>
              </div>
              <div className="grid-3">
                {(['leve', 'medio', 'letal'] as const).map((key) => (
                  <Stepper
                    key={key}
                    label={`Barrera ${i + 1}: ${key === 'leve' ? 'leves' : key === 'medio' ? 'medios' : 'letales'}`}
                    value={b.wounds[key]}
                    onChange={(v) => void editPcBarrier(b.id, { wounds: { ...b.wounds, [key]: v } })}
                  />
                ))}
              </div>
              <BarrierDuration
                index={i + 1}
                duration={b.duration}
                onChange={(duration) => void editPcBarrier(b.id, { duration })}
              />
            </li>
          ))}
        </ul>
        {state.barriers.length > 0 && (
          <p className="muted small">
            Cambia lo que le queda a cada barrera (por ejemplo, para descontarle un daño). Si llega a 0 en todo, la barrera
            desaparece.
          </p>
        )}
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

      <SpiritCard
        level={spiritLevel(state.effects)}
        group={sheet.rank?.group ?? 'bajo'}
        onAdjust={(delta) =>
          void update((s) => ({
            ...s,
            effects: withSpirit(s.effects, spiritLevel(s.effects) + delta, sheet.rank?.group ?? 'bajo', combat.id),
          }))
        }
      />

      <EffectsPanel
        effects={state.effects}
        bases={bases}
        types={types}
        combatId={combat.id}
        onChange={(effects) => void update((s) => ({ ...s, effects }))}
        techniques={sheet.derived.techniques}
        techniqueTargets={targets}
        offensiveStat={character.derived.agilityStat === 'fuerza' ? 'fuerza' : 'destreza'}
      />

      <StatCapsCard
        caps={state.statCaps ?? defaultStatCaps()}
        info={view.caps}
        group={sheet.rank?.group ?? 'bajo'}
        rankName={sheet.rank?.name ?? null}
        limitRaise={view.limitRaise}
        raises={raisesOf(view.resolved, types)}
        onChange={(change) => void update((s) => ({ ...s, statCaps: change(s.statCaps ?? defaultStatCaps()) }))}
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
  targets,
}: {
  combat: Combat
  participant: Participant
  npc: NpcParticipantState
  types: EffectType[]
  targets: Record<keyof Techniques, TechniqueTarget>
}) {
  const update = (change: (n: NpcParticipantState) => NpcParticipantState) =>
    combatRepo.update(combat.id, (c) =>
      updateParticipant(c, participant.id, (p) => (p.npc ? { ...p, npc: change(p.npc) } : p)),
    )

  const view = effectiveEnemy(npc.profile, npc.effects, npc.statCaps)
  const bases = naturalBases(view.natural.stats, view.natural, baseLimit(view.natural.rank.group))

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

  /** Edita una barrera a mano. Si queda en 0 puntos, desaparece. */
  function editNpcBarrier(id: string, patch: Partial<NpcBarrier>) {
    return update((n) => ({
      ...n,
      barriers: n.barriers.map((b) => (b.id === id ? { ...b, ...patch } : b)).filter((b) => b.points > 0),
    }))
  }

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

      <SaturationCard
        value={npc.saturation ?? 0}
        onSet={(v) => void update((n) => ({ ...n, saturation: clampSaturation(v) }))}
        onAdd={(d) => void update((n) => ({ ...n, saturation: clampSaturation((n.saturation ?? 0) + d) }))}
      />

      <WeaponCard
        weapon={npc.weapon ?? null}
        defaultRank={npc.profile.rank}
        onChange={(change) => void update((n) => ({ ...n, weapon: change(n.weapon ?? null) }))}
      />

      <div className="card">
        <h2>Barreras (puntos)</h2>
        {npc.barriers.length === 0 && <p className="muted small">Sin barreras.</p>}
        <ul className="history">
          {npc.barriers.map((b, i) => (
            <li key={b.id} className="barrier-row">
              <div className="row">
                <span className="grow small">
                  Barrera {i + 1} · {describeDuration(b.duration)}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Quitar barrera ${i + 1}`}
                  onClick={() => void update((n) => ({ ...n, barriers: n.barriers.filter((x) => x.id !== b.id) }))}
                >
                  ×
                </button>
              </div>
              <Stepper
                label={`Barrera ${i + 1}: puntos`}
                value={b.points}
                onChange={(v) => void editNpcBarrier(b.id, { points: v })}
              />
              <BarrierDuration
                index={i + 1}
                duration={b.duration}
                onChange={(duration) => void editNpcBarrier(b.id, { duration })}
              />
            </li>
          ))}
        </ul>
        {npc.barriers.length > 0 && (
          <p className="muted small">Cambia los puntos que le quedan a cada barrera. Si llega a 0, desaparece.</p>
        )}
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

      <SpiritCard
        level={spiritLevel(npc.effects)}
        group={view.natural.rank.group}
        onAdjust={(delta) =>
          void update((n) => ({
            ...n,
            effects: withSpirit(n.effects, spiritLevel(n.effects) + delta, view.natural.rank.group, combat.id),
          }))
        }
      />

      <EffectsPanel
        effects={npc.effects}
        bases={bases}
        types={types}
        combatId={combat.id}
        onChange={(effects) => void update((n) => ({ ...n, effects }))}
        techniques={view.natural.techniques}
        techniqueTargets={targets}
        offensiveStat="destreza"
      />

      <StatCapsCard
        caps={npc.statCaps ?? defaultStatCaps()}
        info={view.caps}
        group={view.natural.rank.group}
        rankName={view.natural.rank.name}
        limitRaise={view.limitRaise}
        raises={raisesOf(view.resolved, types)}
        onChange={(change) => void update((n) => ({ ...n, statCaps: change(n.statCaps ?? defaultStatCaps()) }))}
      />

      <ChangedValues rows={rows} />
    </>
  )
}
