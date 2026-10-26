import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  HEALING_TABLE,
  addAlert,
  addBarrierToMany,
  damageMany,
  healMany,
  healingText,
  undoLastAction,
} from '../../rules'
import type { Combat, DurationUnit, Profile } from '../../rules'
import { combatRepo, repo } from '../data'
import { NumberField, SelectField } from '../fields'
import { describeHit, woundsText } from '../format'
import { Section } from '../Section'

export type LifeMode = 'barrera' | 'curar' | 'danar'

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: 'rondas', label: 'Rondas' },
  { value: 'turnos', label: 'Turnos' },
  { value: 'manual', label: 'Hasta que se agote' },
]

const anyWounds = (w: { leve: number; medio: number; letal: number }) => w.leve + w.medio + w.letal > 0

/**
 * Da barrera de vida, cura o daña a los combatientes elegidos. Los combatientes y el modo los elige la
 * pantalla de Efectos.
 */
export function VidaView({
  combat,
  profiles,
  mode,
  selected,
}: {
  combat: Combat
  profiles: Profile[]
  mode: LifeMode
  selected: Set<string>
}) {
  const characters = useLiveQuery(() => repo.list({ includeRetired: true }), [])
  // El aviso se esconde solo si cambia la cantidad de elegidos (ya no es el mismo problema).
  const [errorState, setErrorState] = useState<{ message: string; size: number } | null>(null)
  const error = errorState && errorState.size === selected.size ? errorState.message : ''
  const setError = (message: string) => setErrorState(message ? { message, size: selected.size } : null)
  const [results, setResults] = useState<string[]>([])

  // barrera
  const [bLeve, setBLeve] = useState(0)
  const [bMedio, setBMedio] = useState(0)
  const [bLetal, setBLetal] = useState(0)
  const [bNpc, setBNpc] = useState(0)
  const [bUnit, setBUnit] = useState<DurationUnit>('rondas')
  const [bRemaining, setBRemaining] = useState(3)
  // curación
  const [level, setLevel] = useState(1)
  const [optionIndex, setOptionIndex] = useState(0)
  const [healNpc, setHealNpc] = useState(0)
  const [saturate, setSaturate] = useState(true)
  // daño
  const [dLeve, setDLeve] = useState(0)
  const [dMedio, setDMedio] = useState(0)
  const [dLetal, setDLetal] = useState(0)
  const [dNpc, setDNpc] = useState(0)

  if (characters === undefined) return <p className="muted">Cargando…</p>
  if (profiles.length === 0) return <p className="muted small">Agrega participantes para darles vida, curarlos o dañarlos.</p>

  const ids = [...selected].filter((id) => combat.participants.some((p) => p.id === id))
  const count = ids.length
  const byId = new Map(characters.map((c) => [c.id, c]))
  const healing = HEALING_TABLE.find((l) => l.level === level) ?? HEALING_TABLE[0]
  const option = healing.options[Math.min(optionIndex, healing.options.length - 1)]
  const optionHasBarrier = anyWounds(option.barrier)
  const lastAction = combat.history[0]

  function needTargets(): boolean {
    if (count === 0) {
      setError('Elige a quiénes.')
      return false
    }
    return true
  }

  /** Aplica el cambio, deja el resumen en pantalla y un aviso en el combate. */
  async function run(summary: string, apply: (c: Combat) => { combat: Combat; lines: string[] }) {
    let lines: string[] = []
    await combatRepo.update(combat.id, (c) => {
      const r = apply(c)
      lines = r.lines
      return addAlert(r.combat, summary)
    })
    setResults(lines)
  }

  async function applyBarrier() {
    if (!needTargets()) return
    const pc = { leve: bLeve, medio: bMedio, letal: bLetal }
    if (!anyWounds(pc) && bNpc <= 0) return setError('Indica la barrera de los jugadores o la de los NPCs.')
    if ((bUnit === 'turnos' || bUnit === 'rondas') && bRemaining < 1) return setError('La duración debe ser de al menos 1.')
    setError('')
    await run(`Barrera de vida a ${count} combatiente(s).`, (c) => {
      const r = addBarrierToMany(c, ids, {
        pc,
        npcPoints: bNpc,
        duration: { unit: bUnit, remaining: bUnit === 'manual' ? 0 : bRemaining },
      })
      return {
        combat: r.combat,
        lines: r.results.map((x) =>
          x.given === null
            ? `${x.name}: sin barrera (no hay monto para ${x.kind === 'pc' ? 'jugadores' : 'NPCs'})`
            : typeof x.given === 'number'
              ? `${x.name}: barrera de ${x.given} puntos`
              : `${x.name}: barrera de ${woundsText(x.given)}`,
        ),
      }
    })
  }

  async function applyHeal() {
    if (!needTargets()) return
    setError('')
    await run(`Curación de nivel ${healing.level} (${healing.rank}) a ${count} combatiente(s).`, (c) => {
      const r = healMany(
        c,
        ids,
        {
          option,
          npcPoints: healNpc,
          saturate,
          barrierDuration: { unit: bUnit, remaining: bUnit === 'manual' ? 0 : bRemaining },
        },
        (p) => (p.characterId ? (byId.get(p.characterId)?.baseHealth ?? null) : null),
      )
      return {
        combat: r.combat,
        lines: r.results.map((x) => {
          if (x.skipped) return `${x.name}: sin ficha, no se pudo curar`
          if (x.hp) return `${x.name}: vida ${x.hp.before} → ${x.hp.after}`
          const healed = x.healed && anyWounds(x.healed) ? woundsText(x.healed) : 'nada (ya estaba completo)'
          return `${x.name}: cura ${healed}${x.barrier ? ` y barrera de ${woundsText(x.barrier)}` : ''}`
        }),
      }
    })
  }

  async function applyDamage() {
    if (!needTargets()) return
    const pc = { leve: dLeve, medio: dMedio, letal: dLetal }
    if (!anyWounds(pc) && dNpc <= 0) return setError('Indica el daño a los jugadores o a los NPCs.')
    setError('')
    await run(`Daño a ${count} combatiente(s).`, (c) => {
      const r = damageMany(c, ids, { pc, npcPoints: dNpc })
      return {
        combat: r.combat,
        lines: r.results.map((x) => {
          if (x.none) return `${x.name}: sin daño`
          if (x.hit) return `${x.name}: recibe ${woundsText(pc)} (${describeHit(x.name, x.hit)})`
          const hp = x.hp
          return `${x.name}: −${dNpc} de vida (${hp?.before} → ${hp?.after}${hp?.after === 0 ? ', sin vida' : ''})`
        }),
      }
    })
  }

  const durationFields = (
    <div className="grid-2">
      <SelectField label="La barrera dura" value={bUnit} options={UNIT_OPTIONS} onChange={setBUnit} />
      {bUnit !== 'manual' && (
        <NumberField label="Duración de la barrera" integer value={bRemaining} onChange={setBRemaining} />
      )}
    </div>
  )

  return (
    <>
      {mode === 'barrera' && (
        <Section title="Barrera de vida a varios" storageKey="Vida: barrera">
          <p className="muted small">
            Los jugadores reciben una barrera en heridas y los NPC en puntos. La barrera absorbe antes que la vida.
          </p>
          <div className="grid-3">
            <NumberField label="Barrera de jugadores: leves" integer value={bLeve} onChange={(v) => setBLeve(Math.max(0, v))} />
            <NumberField label="Barrera de jugadores: medios" integer value={bMedio} onChange={(v) => setBMedio(Math.max(0, v))} />
            <NumberField label="Barrera de jugadores: letales" integer value={bLetal} onChange={(v) => setBLetal(Math.max(0, v))} />
          </div>
          <NumberField label="Barrera de NPCs: puntos" integer value={bNpc} onChange={(v) => setBNpc(Math.max(0, v))} />
          {durationFields}
          <button className="btn" onClick={() => void applyBarrier()}>
            Dar barrera a {count} combatiente(s)
          </button>
        </Section>
      )}

      {mode === 'curar' && (
        <Section title="Curar a varios" storageKey="Vida: curar">
          <p className="muted small">
            Los jugadores se curan con la opción de la tabla de curaciones (sin pasar de su vida máxima) y los NPC con puntos.
          </p>
          <SelectField
            label="Nivel de curación"
            value={level}
            options={HEALING_TABLE.map((l) => ({ value: l.level, label: `Nivel ${l.level} (${l.rank})` }))}
            onChange={(v) => {
              setLevel(v)
              setOptionIndex(0)
            }}
          />
          <div role="radiogroup" aria-label="Opciones de curación">
            {healing.options.map((o, i) => (
              <label key={i} className="check">
                <input type="radio" name="vida-heal-option" checked={option === o} onChange={() => setOptionIndex(i)} />
                Opción {i + 1}: {healingText(o)}
              </label>
            ))}
          </div>
          <p className="small">
            Cura {woundsText(option.heal)}
            {optionHasBarrier && ` y da una barrera de ${woundsText(option.barrier)}`}.
          </p>
          {optionHasBarrier && durationFields}
          <NumberField label="Curación de NPCs: puntos" integer value={healNpc} onChange={(v) => setHealNpc(Math.max(0, v))} />
          <label className="check">
            <input type="checkbox" checked={saturate} onChange={(e) => setSaturate(e.target.checked)} />
            Sumar a la saturación lo que se cure
          </label>
          <button className="btn" onClick={() => void applyHeal()}>
            Curar a {count} combatiente(s)
          </button>
        </Section>
      )}

      {mode === 'danar' && (
        <Section title="Dañar a varios" storageKey="Vida: dañar">
          <p className="muted small">
            Daño directo, sin ataque ni defensa (zonas, trampas…). Los jugadores reciben heridas y los NPC pierden puntos. La
            barrera absorbe primero y la armadura no se gasta.
          </p>
          <div className="grid-3">
            <NumberField label="Daño a jugadores: leves" integer value={dLeve} onChange={(v) => setDLeve(Math.max(0, v))} />
            <NumberField label="Daño a jugadores: medios" integer value={dMedio} onChange={(v) => setDMedio(Math.max(0, v))} />
            <NumberField label="Daño a jugadores: letales" integer value={dLetal} onChange={(v) => setDLetal(Math.max(0, v))} />
          </div>
          <NumberField label="Daño a NPCs: puntos" integer value={dNpc} onChange={(v) => setDNpc(Math.max(0, v))} />
          <button className="btn danger" onClick={() => void applyDamage()}>
            Dañar a {count} combatiente(s)
          </button>
        </Section>
      )}

      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <Section title="Resultado" storageKey="Vida: resultado">
          <ul className="history" aria-label="Resultado por combatiente">
            {results.map((line, i) => (
              <li key={i} className="small">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {lastAction && (
        <div className="card">
          <p className="small">Última acción: {lastAction.text}</p>
          <button className="btn secondary" onClick={() => void combatRepo.update(combat.id, undoLastAction)}>
            Deshacer última acción
          </button>
        </div>
      )}
    </>
  )
}
