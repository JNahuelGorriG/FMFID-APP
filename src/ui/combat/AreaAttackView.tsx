import { useState } from 'react'
import {
  STAT_NAMES,
  SUGGESTED_NPC_POINTS,
  TECHNIQUES,
  applyAreaHits,
  applyToNpc,
  applyToPcDetailed,
  addAlert,
  damageStage,
  hitCheck,
  invertLevel,
  invertOutcome,
  isHit,
  outcomeRanges,
  resistanceResult,
  resolveHit,
  undoLastAction,
  woundsForPc,
} from '../../rules'
import type { AreaHit, AttackType, Combat, Profile, StatName, Techniques, Wounds } from '../../rules'
import { combatRepo } from '../data'
import { NumberField, OptionalNumberField, SelectField } from '../fields'
import { LEVEL_LABELS, OUTCOME_LABELS, STAT_LABELS, describeHit, fmt, rangeText, withRank, woundsText } from '../format'
import { Section } from '../Section'

const STAT_OPTIONS = STAT_NAMES.map((s) => ({ value: s, label: STAT_LABELS[s] }))
const TYPE_OPTIONS: { value: AttackType; label: string }[] = [
  { value: 'fisico', label: 'Físico' },
  { value: 'magico', label: 'Mágico' },
]
const DEFAULT_STATS: Record<AttackType, [StatName, StatName]> = {
  fisico: ['destreza', 'percepcion'],
  magico: ['inteligencia', 'sabiduria'],
}
const validRoll = (n: number | undefined, max: number): n is number =>
  n !== undefined && Number.isInteger(n) && n >= 1 && n <= max

/** Lo que se carga de cada objetivo. */
interface TargetInput {
  d20?: number
  d8?: number
  d6?: number
  defenseType?: AttackType
  tierDown?: number
  points?: number
  force?: boolean
}

interface Evaluated {
  profile: Profile
  levelText: string
  rangesText: string | null
  roller: 'atacante' | 'defensor'
  auto: boolean
  outcomeLabel: string | null
  hit: boolean | null
  damaging: boolean
  stage: ReturnType<typeof damageStage>
  wounds: Wounds | null
  resistanceError: string
  points: number
  /** Listo para aplicar (o es un fallo, que no hay nada que aplicar). */
  state: 'listo' | 'falla' | 'falta'
  missing: string
}

/**
 * Un ataque a varios objetivos: se elige quién ataca y a quiénes, se cargan las tiradas de cada uno en la misma
 * pantalla y se aplica todo de una vez (con un solo "Deshacer").
 */
export function AreaAttackView({ combat, profiles }: { combat: Combat; profiles: Profile[] }) {
  const activeProfile = profiles.find((p) => p.participantId === combat.activeId)
  const [attackerId, setAttackerId] = useState(activeProfile?.participantId ?? '')
  const [type, setType] = useState<AttackType>('fisico')
  const [attackerStat, setAttackerStat] = useState<StatName>('destreza')
  const [defenderStat, setDefenderStat] = useState<StatName>('percepcion')
  const [damage, setDamage] = useState<number | undefined>(undefined)
  const [boosts, setBoosts] = useState<(keyof Techniques)[]>([])
  const [picked, setPicked] = useState<string[] | null>(null)
  const [inputs, setInputs] = useState<Record<string, TargetInput>>({})
  const [results, setResults] = useState<string[]>([])
  const [message, setMessage] = useState('')

  const attacker = profiles.find((p) => p.participantId === attackerId) ?? profiles[0]
  if (!attacker || profiles.length < 2) {
    return <p className="muted small">Hacen falta al menos dos participantes para resolver un ataque.</p>
  }

  const others = profiles.filter((p) => p.participantId !== attacker.participantId)
  // Sin elegir a mano: el otro bando (o los enemigos, si ataca un jugador o un aliado).
  const defaultTargets = others
    .filter((p) => (attacker.side === 'enemigo' ? p.side !== 'enemigo' : p.side === 'enemigo'))
    .map((p) => p.participantId)
  const selectedIds = (picked ?? defaultTargets).filter((id) => others.some((p) => p.participantId === id))
  const targets = others.filter((p) => selectedIds.includes(p.participantId))

  const boostKeys: (keyof Techniques)[] = type === 'fisico' ? ['esencia', 'eReinforced'] : ['aetheriumAscendance', 'aetheriumMastery']
  const activeBoosts = boostKeys.filter((k) => boosts.includes(k))
  const boostValue = (k: keyof Techniques): number =>
    k === 'aetheriumAscendance' ? (attacker.techniques[k] * attacker.ascendancePercent) / 100 : attacker.techniques[k]
  const extra = activeBoosts.reduce((sum, k) => sum + boostValue(k), 0)
  const techniqueName = (k: keyof Techniques) => TECHNIQUES.find((t) => t.key === k)?.name ?? k

  const setInput = (id: string, patch: Partial<TargetInput>) => setInputs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  function evaluate(target: Profile): Evaluated {
    const input = inputs[target.participantId] ?? {}
    const check = hitCheck(attacker, target, attackerStat, defenderStat)
    const inverse = invertLevel(check.level)
    // Los NPC no tiran dados: si ataca un NPC a un jugador, tira el jugador con el nivel inverso.
    const roller = attacker.kind === 'npc' && target.kind === 'pc' ? 'defensor' : 'atacante'
    const rollLevel = roller === 'atacante' ? check.level : inverse
    const ranges = outcomeRanges(rollLevel)
    const auto = ranges === null
    const rolled = validRoll(input.d20, 20) ? input.d20 : undefined
    const rollOutcome = auto ? resolveHit(rollLevel) : rolled !== undefined ? resolveHit(rollLevel, rolled) : null
    const outcome = rollOutcome === null ? null : roller === 'atacante' ? rollOutcome : invertOutcome(rollOutcome)
    const hit = outcome === null ? null : isHit(outcome)
    const damaging = hit === true || input.force === true
    const stage = damageStage(
      attacker,
      target,
      type,
      { damage, extra, tierDown: input.tierDown ?? 0 },
      input.defenseType ?? type,
    )
    let wounds: Wounds | null = null
    let resistanceError = ''
    if (target.kind === 'pc') {
      if (!validRoll(input.d8, 8)) resistanceError = 'falta el d8 de resistencia'
      else {
        try {
          wounds = woundsForPc(stage.applied, resistanceResult(input.d8, input.d6))
        } catch {
          resistanceError = 'con un 1 u 8 en el d8 hace falta un d6'
        }
      }
    }
    const points = input.points ?? SUGGESTED_NPC_POINTS[stage.applied]
    let state: Evaluated['state'] = 'listo'
    let missing = ''
    if (!damaging && outcome === null) {
      state = 'falta'
      missing = `falta el d20 de ${roller === 'atacante' ? attacker.name : target.name}`
    } else if (!damaging) state = 'falla'
    else if (target.kind === 'pc' && wounds === null) {
      state = 'falta'
      missing = resistanceError
    }
    return {
      profile: target,
      levelText: `${LEVEL_LABELS[rollLevel]}`,
      rangesText: ranges ? ranges.map((x) => `${OUTCOME_LABELS[x.outcome]} ${rangeText(x.range)}`).join(' · ') : null,
      roller,
      auto,
      outcomeLabel: outcome ? OUTCOME_LABELS[outcome] : null,
      hit,
      damaging,
      stage,
      wounds,
      resistanceError,
      points,
      state,
      missing,
    }
  }

  const rows = targets.map(evaluate)
  const ready = rows.filter((r) => r.state === 'listo')
  const misses = rows.filter((r) => r.state === 'falla')
  const waiting = rows.filter((r) => r.state === 'falta')

  function toggleTarget(id: string, on: boolean) {
    setPicked(on ? [...selectedIds, id] : selectedIds.filter((x) => x !== id))
  }

  async function apply() {
    if (ready.length + misses.length === 0) return setMessage('Todavía no hay ningún objetivo listo.')
    setMessage('')
    const lines: string[] = []
    const hits: AreaHit[] = []
    for (const r of ready) {
      const current = combat.participants.find((p) => p.id === r.profile.participantId)
      const tier = r.stage.tierDown > 0 ? ` (daño bajado ${r.stage.tierDown} tier)` : ''
      const result = (r.outcomeLabel ?? 'Impacto') + tier
      if (r.profile.kind === 'pc' && r.wounds) {
        const detail = current?.pc ? describeHit(r.profile.name, applyToPcDetailed(current.pc, r.wounds, r.stage.armorSpent)) : ''
        lines.push(`${r.profile.name}: ${result} · ${woundsText(r.wounds)}${detail ? ` (${detail})` : ''}`)
        hits.push({ participantId: r.profile.participantId, wounds: r.wounds, armorSpent: r.stage.armorSpent })
      } else if (current?.npc) {
        const after = applyToNpc(current.npc, r.points)
        lines.push(`${r.profile.name}: ${result} · −${r.points} de vida (${current.npc.hpCurrent} → ${after.hpCurrent}${after.hpCurrent === 0 ? ', sin vida' : ''})`)
        hits.push({ participantId: r.profile.participantId, npcPoints: r.points })
      }
    }
    for (const r of misses) lines.push(`${r.profile.name}: falla${r.outcomeLabel ? ` (${r.outcomeLabel})` : ''}`)
    const text = `${attacker.name} ataca a ${ready.length + misses.length} objetivo(s): ${lines.join(' · ')}`
    await combatRepo.update(combat.id, (c) => (hits.length > 0 ? applyAreaHits(c, text, hits) : addAlert(c, text)))
    setResults(lines)
    // Lo aplicado se limpia; lo que faltaba queda cargado para completarlo.
    const doneIds = new Set([...ready, ...misses].map((r) => r.profile.participantId))
    setInputs((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !doneIds.has(id))))
    setPicked(selectedIds.filter((id) => !doneIds.has(id)))
  }

  const lastAction = combat.history[0]

  return (
    <>
      <Section title="Quién ataca y a quiénes" storageKey="Area: quién">
        <div className="grid-2">
          <SelectField
            label="Atacante"
            value={attacker.participantId}
            options={profiles.map((p) => ({ value: p.participantId, label: withRank(p.name, p.rankName) }))}
            onChange={(id) => {
              setAttackerId(id)
              setPicked(null)
              setInputs({})
            }}
          />
          <SelectField
            label="Tipo de ataque"
            value={type}
            options={TYPE_OPTIONS}
            onChange={(t) => {
              setType(t)
              setAttackerStat(DEFAULT_STATS[t][0])
              setDefenderStat(DEFAULT_STATS[t][1])
              setBoosts([])
            }}
          />
          <SelectField label="Stat del atacante" value={attackerStat} options={STAT_OPTIONS} onChange={setAttackerStat} />
          <SelectField label="Stat de los defensores" value={defenderStat} options={STAT_OPTIONS} onChange={setDefenderStat} />
        </div>
        <p className="small">Objetivos ({targets.length}):</p>
        <div className="actions">
          <button className="btn secondary compact" onClick={() => setPicked(others.filter((p) => p.side === 'enemigo').map((p) => p.participantId))}>
            Todos los enemigos
          </button>
          <button className="btn secondary compact" onClick={() => setPicked(others.filter((p) => p.side !== 'enemigo').map((p) => p.participantId))}>
            Jugadores y aliados
          </button>
          <button className="btn secondary compact" onClick={() => setPicked(others.map((p) => p.participantId))}>
            Todos
          </button>
          <button className="btn secondary compact" onClick={() => setPicked([])}>
            Ninguno
          </button>
        </div>
        <div role="group" aria-label="Objetivos">
          {others.map((p) => (
            <label key={p.participantId} className="check">
              <input
                type="checkbox"
                aria-label={`Objetivo ${p.name}`}
                checked={selectedIds.includes(p.participantId)}
                onChange={(e) => toggleTarget(p.participantId, e.target.checked)}
              />
              {withRank(p.name, p.rankName)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Daño del ataque" storageKey="Area: daño">
        <p className="small">
          Daño {type === 'fisico' ? 'físico' : 'mágico'} de {attacker.name}: <strong>{fmt(damage ?? attacker.damage[type] + extra)}</strong>
        </p>
        <div role="group" aria-label="Sumar al daño">
          {boostKeys.map((k) => (
            <label key={k} className="check">
              <input
                type="checkbox"
                aria-label={`Sumar ${techniqueName(k)}`}
                checked={boosts.includes(k)}
                onChange={(e) => setBoosts((prev) => (e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)))}
              />
              Sumar {techniqueName(k)} (+{fmt(boostValue(k))})
            </label>
          ))}
        </div>
        <OptionalNumberField
          label="Daño a mano (reemplaza al calculado)"
          value={damage}
          placeholder={fmt(attacker.damage[type] + extra)}
          onChange={setDamage}
        />
        <p className="muted small">El daño es el mismo para todos; cada uno lo enfrenta con su propia defensa.</p>
      </Section>

      {targets.length === 0 && <p className="muted small">Elige al menos un objetivo.</p>}

      {rows.map((r) => {
        const id = r.profile.participantId
        const input = inputs[id] ?? {}
        const isPc = r.profile.kind === 'pc'
        const check = hitCheck(attacker, r.profile, attackerStat, defenderStat)
        return (
          <div key={id} className="card target-card" aria-label={`Ataque a ${r.profile.name}`}>
            <p>
              <strong>{r.profile.name}</strong>
              <span className="muted small"> · {r.profile.rankName ?? 'sin rango'}</span>
            </p>
            <p className="small">
              {STAT_LABELS[attackerStat]} {fmt(check.attackerValue)} contra {STAT_LABELS[defenderStat]} {fmt(check.defenderValue)} · diferencia{' '}
              {check.difference >= 0 ? '+' : ''}
              {fmt(check.difference)}
            </p>
            {r.auto ? (
              <p className="muted small">Sin tirada: resultado automático.</p>
            ) : (
              <>
                <p className="muted small">
                  Tira {r.roller === 'atacante' ? attacker.name : r.profile.name} con <strong>{r.levelText}</strong>: {r.rangesText}
                </p>
                <OptionalNumberField
                  label={`d20 de ${r.roller === 'atacante' ? attacker.name : r.profile.name} contra ${r.profile.name}`}
                  value={input.d20}
                  onChange={(v) => setInput(id, { d20: v })}
                />
              </>
            )}
            {r.outcomeLabel && <p className="result">Ataque: {r.outcomeLabel}</p>}
            <label className="check">
              <input type="checkbox" checked={input.force === true} onChange={(e) => setInput(id, { force: e.target.checked })} />
              Aplicar el daño sin depender del impacto
            </label>

            {r.damaging && (
              <>
                <div className="grid-2">
                  <SelectField
                    label={`Defensa de ${r.profile.name}`}
                    value={input.defenseType ?? type}
                    options={[
                      { value: 'fisico' as const, label: 'Defensa física' },
                      { value: 'magico' as const, label: 'Defensa mágica' },
                    ]}
                    onChange={(v) => setInput(id, { defenseType: v })}
                  />
                  <div>
                    <p className="small">
                      Herida <strong>{r.stage.category}</strong>
                      {r.stage.armorSpent > 0 && <> → armadura: {r.stage.armorSpent} uso(s)</>}
                      {r.stage.tierDown > 0 && <> → bajada {r.stage.tierDown} tier</>}
                      {' '}= <strong>{r.stage.applied}</strong>
                    </p>
                    <div className="actions">
                      <button
                        className="btn secondary compact"
                        aria-label={`Bajar un tier de daño a ${r.profile.name}`}
                        disabled={r.stage.applied === 'leve'}
                        onClick={() => setInput(id, { tierDown: Math.min(3, (input.tierDown ?? 0) + 1) })}
                      >
                        Bajar un tier
                      </button>
                      {(input.tierDown ?? 0) > 0 && (
                        <button className="btn secondary compact" onClick={() => setInput(id, { tierDown: 0 })}>
                          Sin bajar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isPc ? (
                  <div className="grid-2">
                    <OptionalNumberField label={`d8 de resistencia de ${r.profile.name}`} value={input.d8} onChange={(v) => setInput(id, { d8: v })} />
                    {(input.d8 === 1 || input.d8 === 8) && (
                      <OptionalNumberField label={`d6 adicional de ${r.profile.name}`} value={input.d6} onChange={(v) => setInput(id, { d6: v })} />
                    )}
                  </div>
                ) : (
                  <NumberField
                    label={`Puntos de vida a descontar a ${r.profile.name}`}
                    integer
                    value={r.points}
                    onChange={(v) => setInput(id, { points: Math.max(0, v) })}
                  />
                )}
                {isPc && r.wounds && <p className="result">Recibe {woundsText(r.wounds)}</p>}
              </>
            )}
            {r.state === 'falla' && <p className="muted small">Falla: no hay daño.</p>}
            {r.state === 'falta' && <p className="muted small">Falta: {r.missing}.</p>}
          </div>
        )
      })}

      {message && (
        <p className="errors" role="alert">
          {message}
        </p>
      )}
      {targets.length > 0 && (
        <div className="card">
          <p className="small">
            Listos: {ready.length} · fallos: {misses.length} · incompletos: {waiting.length}
          </p>
          <button className="btn" disabled={ready.length + misses.length === 0} onClick={() => void apply()}>
            Aplicar a {ready.length + misses.length} objetivo(s)
          </button>
          {waiting.length > 0 && <p className="muted small">Los incompletos quedan cargados para aplicarlos después.</p>}
        </div>
      )}

      {results.length > 0 && (
        <Section title="Resultado" storageKey="Area: resultado">
          <ul className="history" aria-label="Resultado del ataque a varios">
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
