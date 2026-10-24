import { useState } from 'react'
import {
  STAT_NAMES,
  SUGGESTED_NPC_POINTS,
  THRESHOLDS,
  WOUND_TABLE,
  addAlert,
  applyToNpc,
  applyToPc,
  damageStage,
  hitCheck,
  invertLevel,
  invertOutcome,
  isHit,
  outcomeRanges,
  recordAction,
  resistanceResult,
  resolveHit,
  undoLastAction,
  updateParticipant,
  woundsForPc,
} from '../../rules'
import type { AttackType, Combat, Profile, StatName, WoundCategory } from '../../rules'
import { combatRepo } from '../data'
import { NumberField, OptionalNumberField, SelectField } from '../fields'
import { GROUP_LABELS, LEVEL_LABELS, OUTCOME_LABELS, STAT_LABELS, fmt, rangeText, withRank, woundsText } from '../format'

const STAT_OPTIONS = STAT_NAMES.map((s) => ({ value: s, label: STAT_LABELS[s] }))
const TYPE_OPTIONS: { value: AttackType; label: string }[] = [
  { value: 'fisico', label: 'Físico' },
  { value: 'magico', label: 'Mágico' },
]
const DEFAULT_STATS: Record<AttackType, [StatName, StatName]> = {
  fisico: ['destreza', 'percepcion'],
  magico: ['inteligencia', 'sabiduria'],
}

/** Nombre del nivel de daño según la herida (columnas de la tabla de daños). */
const DAMAGE_LEVEL: Record<WoundCategory, string> = {
  leve: 'Normal',
  medio: 'Menor',
  fuerte: 'Menor+',
  letal: 'Fallo',
}

const validRoll = (n: number | undefined, max: number): n is number =>
  n !== undefined && Number.isInteger(n) && n >= 1 && n <= max

export function AttackView({ combat, profiles }: { combat: Combat; profiles: Profile[] }) {
  const activeProfile = profiles.find((p) => p.participantId === combat.activeId)
  const [attackerId, setAttackerId] = useState(activeProfile?.participantId ?? '')
  const [defenderId, setDefenderId] = useState('')
  const [type, setType] = useState<AttackType>('fisico')
  const [attackerStat, setAttackerStat] = useState<StatName>('destreza')
  const [defenderStat, setDefenderStat] = useState<StatName>('percepcion')
  const [d20, setD20] = useState<number | undefined>(undefined)
  const [rollerChoice, setRollerChoice] = useState<'atacante' | 'defensor' | null>(null)
  const [force, setForce] = useState(false)
  const [damage, setDamage] = useState<number | undefined>(undefined)
  const [defense, setDefense] = useState<number | undefined>(undefined)
  const [d8, setD8] = useState<number | undefined>(undefined)
  const [d6, setD6] = useState<number | undefined>(undefined)
  const [points, setPoints] = useState<number | undefined>(undefined)
  const [message, setMessage] = useState('')

  const attacker = profiles.find((p) => p.participantId === attackerId) ?? profiles[0]
  const defender =
    profiles.find((p) => p.participantId === defenderId && p.participantId !== attacker?.participantId) ??
    profiles.find((p) => p.participantId !== attacker?.participantId)

  if (!attacker || !defender) {
    return <p className="muted small">Hacen falta al menos dos participantes para resolver un ataque.</p>
  }

  const check = hitCheck(attacker, defender, attackerStat, defenderStat)
  const inverse = invertLevel(check.level)
  // Los NPC no tiran dados: cuando ataca un NPC a un jugador, tira el jugador con el nivel inverso.
  const roller = rollerChoice ?? (attacker.kind === 'npc' && defender.kind === 'pc' ? 'defensor' : 'atacante')
  const rollLevel = roller === 'atacante' ? check.level : inverse
  const ranges = outcomeRanges(rollLevel)
  const auto = ranges === null
  const rolled = validRoll(d20, 20) ? d20 : undefined
  const rollOutcome = auto ? resolveHit(rollLevel) : rolled !== undefined ? resolveHit(rollLevel, rolled) : null
  // Resultado del ataque: si tira el defensor, su éxito es un fallo del ataque.
  const outcome = rollOutcome === null ? null : roller === 'atacante' ? rollOutcome : invertOutcome(rollOutcome)
  const hit = outcome === null ? null : isHit(outcome)
  const canDamage = hit === true || force

  const stage = damageStage(attacker, defender, type, { damage, defense })
  const thresholds = THRESHOLDS[defender.group]
  const scaleRows: { category: WoundCategory; range: string }[] = [
    { category: 'leve', range: `hasta ${thresholds.normal}` },
    { category: 'medio', range: `${thresholds.normal + 1} a ${thresholds.mayor}` },
    { category: 'fuerte', range: `${thresholds.mayor + 1} a ${thresholds.mayorPlus}` },
    { category: 'letal', range: `más de ${thresholds.mayorPlus}` },
  ]
  const isPc = defender.kind === 'pc'

  let resistance: number | null = null
  let resistanceError = ''
  if (isPc) {
    if (!validRoll(d8, 8)) resistanceError = 'Falta el d8 de resistencia.'
    else {
      try {
        resistance = resistanceResult(d8, d6)
      } catch {
        resistanceError = 'Con un 1 u 8 en el d8 hace falta un d6.'
      }
    }
  }
  const wounds = resistance !== null ? woundsForPc(stage.applied, resistance) : null
  const npcPoints = points ?? SUGGESTED_NPC_POINTS[stage.applied]

  const lastAction = combat.history[0]

  function reset() {
    setD20(undefined)
    setRollerChoice(null)
    setForce(false)
    setDamage(undefined)
    setDefense(undefined)
    setD8(undefined)
    setD6(undefined)
    setPoints(undefined)
    setMessage('')
  }

  function chooseType(next: AttackType) {
    setType(next)
    setAttackerStat(DEFAULT_STATS[next][0])
    setDefenderStat(DEFAULT_STATS[next][1])
    setDamage(undefined)
    setDefense(undefined)
  }

  async function registerMiss() {
    const text = `${attacker.name} falla contra ${defender?.name}${outcome ? ` (${OUTCOME_LABELS[outcome]})` : ''}.`
    await combatRepo.update(combat.id, (c) => addAlert(c, text))
    reset()
  }

  async function confirm() {
    if (!defender) return
    if (isPc && (resistance === null || wounds === null)) return setMessage(resistanceError)
    setMessage('')
    const result = outcome ? OUTCOME_LABELS[outcome] : 'Impacto'
    const text = isPc
      ? `${attacker.name} → ${defender.name}: ${result} · ${woundsText(wounds ?? { leve: 0, medio: 0, letal: 0 })}`
      : `${attacker.name} → ${defender.name}: ${result} · −${npcPoints} de vida`
    await combatRepo.update(combat.id, (c) => {
      const target = c.participants.find((p) => p.id === defender.participantId)
      if (!target) return c
      let next = recordAction(c, text, target)
      next = updateParticipant(next, target.id, (p) => {
        if (p.pc && wounds) return { ...p, pc: applyToPc(p.pc, wounds, stage.armorSpent) }
        if (p.npc) return { ...p, npc: applyToNpc(p.npc, npcPoints) }
        return p
      })
      return addAlert(next, text)
    })
    reset()
  }

  return (
    <>
      <div className="card">
        <h2>Quién ataca a quién</h2>
        <div className="grid-2">
          <SelectField
            label="Atacante"
            value={attacker.participantId}
            options={profiles.map((p) => ({ value: p.participantId, label: withRank(p.name, p.rankName) }))}
            onChange={(id) => {
              setAttackerId(id)
              reset()
            }}
          />
          <SelectField
            label="Defensor"
            value={defender.participantId}
            options={profiles
              .filter((p) => p.participantId !== attacker.participantId)
              .map((p) => ({ value: p.participantId, label: withRank(p.name, p.rankName) }))}
            onChange={(id) => {
              setDefenderId(id)
              reset()
            }}
          />
          <SelectField label="Tipo de ataque" value={type} options={TYPE_OPTIONS} onChange={chooseType} />
          <span />
          <button
            className="btn secondary compact swap"
            onClick={() => {
              const a = attackerStat
              setAttackerStat(defenderStat)
              setDefenderStat(a)
              setAttackerId(defender.participantId)
              setDefenderId(attacker.participantId)
              reset()
            }}
          >
            ⇅ Intercambiar roles
          </button>
          <SelectField label="Stat del atacante" value={attackerStat} options={STAT_OPTIONS} onChange={setAttackerStat} />
          <SelectField label="Stat del defensor" value={defenderStat} options={STAT_OPTIONS} onChange={setDefenderStat} />
        </div>
      </div>

      <div className="card">
        <h2>Impacto</h2>
        <p className="small">
          {attacker.name} {STAT_LABELS[attackerStat]} <strong>{fmt(check.attackerValue)}</strong> contra{' '}
          {defender.name} {STAT_LABELS[defenderStat]} <strong>{fmt(check.defenderValue)}</strong>
        </p>
        <p className="small">
          Diferencia {check.difference >= 0 ? '+' : ''}
          {fmt(check.difference)}
        </p>
        <p className="muted small">
          La escala es la del defensor: {defender.name} ({defender.rankName ?? 'sin rango'}, grupo{' '}
          {GROUP_LABELS[defender.group]}). Si intercambias los roles, cambia el defensor y con él la escala.
        </p>
        <p className="small">
          Si tira el atacante: <strong>{LEVEL_LABELS[check.level]}</strong> · Si tira el defensor:{' '}
          <strong>{LEVEL_LABELS[inverse]}</strong>
        </p>
        <SelectField
          label="Quién tira el d20"
          value={roller}
          options={[
            { value: 'atacante' as const, label: 'El atacante' },
            { value: 'defensor' as const, label: 'El defensor' },
          ]}
          onChange={setRollerChoice}
        />
        {roller === 'defensor' && (
          <p className="small">
            {defender.name} tira con <strong>{LEVEL_LABELS[inverse]}</strong>.
          </p>
        )}
        {auto ? (
          <p className="muted small">Sin tirada: resultado automático.</p>
        ) : (
          <p className="muted small">
            {ranges.map((x) => `${OUTCOME_LABELS[x.outcome]} ${rangeText(x.range)}`).join(' · ')}
          </p>
        )}
        {!auto && (
          <OptionalNumberField
            label={roller === 'atacante' ? 'Tirada del atacante (d20)' : 'Tirada del defensor (d20)'}
            value={d20}
            onChange={setD20}
          />
        )}
        {rollOutcome && roller === 'defensor' && (
          <p className="small">Resultado del defensor: {OUTCOME_LABELS[rollOutcome]}</p>
        )}
        {outcome && <p className="result">Ataque: {OUTCOME_LABELS[outcome]}</p>}
        <label className="check">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Aplicar el daño sin depender de la tirada de impacto
        </label>
        {hit === false && !force && (
          <button className="btn secondary" onClick={() => void registerMiss()}>
            Registrar fallo
          </button>
        )}
      </div>

      <div className="card" aria-label="Daño contra defensa">
        <h2>Daño contra defensa</h2>
        <p className="muted small">
          {type === 'fisico' ? 'Daño físico contra defensa física' : 'Daño mágico contra defensa mágica'}. La escala es la de{' '}
          {defender.name} ({defender.rankName ?? 'sin rango'}, grupo {GROUP_LABELS[defender.group]}).
        </p>
        <div className="grid-2">
          <OptionalNumberField
            label="Daño"
            value={damage}
            placeholder={fmt(attacker.damage[type])}
            onChange={setDamage}
          />
          <OptionalNumberField
            label="Defensa"
            value={defense}
            placeholder={fmt(stage.defense)}
            onChange={setDefense}
          />
        </div>
        <p className="small">
          {attacker.name}: daño <strong>{fmt(stage.damage)}</strong> contra la defensa de {defender.name}:{' '}
          <strong>{fmt(stage.defense)}</strong> {stage.armored ? '(con armadura)' : '(sin armadura, defensa natural SA)'}
        </p>
        <p className="small">
          Diferencia {stage.damage - stage.defense >= 0 ? '+' : ''}
          {fmt(stage.damage - stage.defense)} · nivel <strong>{DAMAGE_LEVEL[stage.category]}</strong> → herida{' '}
          <strong>{stage.category}</strong>
          {stage.armored && stage.armorSpent > 0 && (
            <>
              {' '}
              → la armadura la baja a <strong>{stage.applied}</strong> y gasta {stage.armorSpent} uso(s)
            </>
          )}
        </p>
        <div className="table-wrap" aria-label="Escala del daño">
          <table className="cmp ref">
            <thead>
              <tr>
                <th>Nivel</th>
                <th>Diferencia (daño − defensa)</th>
                <th>Herida</th>
              </tr>
            </thead>
            <tbody>
              {scaleRows.map((row) => (
                <tr key={row.category} className={row.category === stage.category ? 'hit' : ''}>
                  <td className="first">{DAMAGE_LEVEL[row.category]}</td>
                  <td>{row.range}</td>
                  <td>{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isPc ? (
          <>
            <p className="small">
              Lo que recibe {defender.name} según su resistencia (d8 + 6; con 1 se resta un d6 a 7 y con 8 se suma un d6 a 14):
            </p>
            <div className="table-wrap" aria-label="Tabla de daños">
              <table className="cmp ref">
                <thead>
                  <tr>
                    <th>Resistencia</th>
                    <th>Recibe</th>
                  </tr>
                </thead>
                <tbody>
                  {WOUND_TABLE.map((row) => (
                    <tr key={row.min} className={resistance !== null && resistance >= row.min && resistance <= row.max ? 'hit' : ''}>
                      <td className="first">{rangeText([row.min, row.max])}</td>
                      <td>{woundsText(row.cells[stage.applied])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid-2">
              <OptionalNumberField label="d8 de resistencia" value={d8} onChange={setD8} />
              {(d8 === 1 || d8 === 8) && <OptionalNumberField label="d6 adicional" value={d6} onChange={setD6} />}
            </div>
            {resistance !== null && wounds ? (
              <p className="result">
                Resistencia {resistance} → {woundsText(wounds)}
              </p>
            ) : (
              <p className="muted small">{resistanceError}</p>
            )}
            <p className="muted small">Si tiene barrera, absorbe primero.</p>
          </>
        ) : (
          <>
            <NumberField
              label="Puntos de vida a descontar"
              integer
              value={npcPoints}
              onChange={(v) => setPoints(Math.max(0, v))}
            />
            <p className="muted small">Sugerido por la herida: {SUGGESTED_NPC_POINTS[stage.applied]}. Lo decides tú.</p>
          </>
        )}

        {message && (
          <p className="errors" role="alert">
            {message}
          </p>
        )}
        {canDamage ? (
          <button className="btn" onClick={() => void confirm()}>
            Confirmar y aplicar
          </button>
        ) : (
          <p className="muted small">
            Para aplicar el daño falta el resultado del impacto (o marcar "Aplicar el daño sin depender de la tirada").
          </p>
        )}
      </div>

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
