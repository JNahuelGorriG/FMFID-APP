import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  SKILL_TYPE_ID,
  SPIRIT_MAX_LEVEL,
  SPIRIT_TYPE_ID,
  addEffectsToMany,
  endSkillForMany,
  groupEffects,
  limitRaiseEffect,
  removeEffectGroupFrom,
  setSpiritForMany,
  spiritLevel,
  spiritPerLevel,
} from '../../rules'
import type { Combat, DurationUnit, Effect, EffectKind, EffectTarget, LimitRaiseFields, Profile } from '../../rules'
import { combatRepo, settingsRepo } from '../data'
import { NumberField, SelectField, TextField } from '../fields'
import {
  DURATION_LABELS,
  EFFECT_STATE_LABELS,
  GROUP_LABELS,
  TARGET_LABELS,
  describeAmount,
  describeDuration,
  fmt,
} from '../format'
import { PickParticipants } from './PickParticipants'
import { LimitRaiseForm } from '../LimitRaiseForm'
import { TargetPicker } from '../TargetPicker'

const DURATION_OPTIONS = (Object.keys(DURATION_LABELS) as DurationUnit[]).map((u) => ({
  value: u,
  label: DURATION_LABELS[u],
}))
const LEVEL_OPTIONS = Array.from({ length: SPIRIT_MAX_LEVEL + 1 }, (_, n) => ({
  value: n,
  label: n === 0 ? '0 (quitar)' : String(n),
}))

type Mode = 'manual' | 'espiritu' | 'limite'

/** Aplica buffs, debuffs y Espíritu a varios combatientes a la vez, y muestra lo que tiene cada uno. */
export function BuffsView({ combat, profiles }: { combat: Combat; profiles: Profile[] }) {
  const types = useLiveQuery(() => settingsRepo.getEffectTypes(), [])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [mode, setMode] = useState<Mode>('manual')
  const [kind, setKind] = useState<EffectKind>('buff')
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [targets, setTargets] = useState<EffectTarget[]>(['fuerza'])
  const [flat, setFlat] = useState(0)
  const [percent, setPercent] = useState(0)
  const [unit, setUnit] = useState<DurationUnit>('turnos')
  const [remaining, setRemaining] = useState(3)
  const [level, setLevel] = useState(1)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (types === undefined) return <p className="muted">Cargando…</p>
  if (profiles.length === 0) return <p className="muted small">Agrega participantes para aplicarles buffs.</p>

  const manualTypes = types.filter((t) => t.id !== SPIRIT_TYPE_ID)
  const chosenType = typeId || manualTypes[0]?.id || SKILL_TYPE_ID
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id
  const chosen = profiles.filter((p) => selected.has(p.participantId))
  const ids = chosen.map((p) => p.participantId)

  const needTargets = (): boolean => {
    if (chosen.length === 0) {
      setError('Elige a quiénes.')
      return false
    }
    return true
  }

  async function applyManual() {
    if (!needTargets()) return
    if (targets.length === 0) return setError('Elige al menos un stat.')
    if (flat === 0 && percent === 0) return setError('Indica un valor fijo o un porcentaje.')
    if ((unit === 'turnos' || unit === 'rondas') && remaining < 1) return setError('La duración debe ser de al menos 1.')
    setError('')
    const byParticipant: Record<string, Effect[]> = {}
    for (const p of chosen) {
      const group = crypto.randomUUID() // cada combatiente recibe su propio buff, que se edita y quita por separado
      byParticipant[p.participantId] = targets.map((target) => ({
        id: crypto.randomUUID(),
        kind,
        name: name.trim() || typeName(chosenType),
        typeId: chosenType,
        target,
        flat,
        percent,
        duration: { unit, remaining: unit === 'turnos' || unit === 'rondas' ? remaining : 0 },
        combatId: combat.id,
        createdAt: new Date().toISOString(),
        group,
      }))
    }
    await combatRepo.update(combat.id, (c) => addEffectsToMany(c, byParticipant))
    setMessage(`${kind === 'buff' ? 'Buff' : 'Debuff'} aplicado a ${chosen.length} combatiente(s).`)
    setName('')
  }

  async function applyRaise(fields: LimitRaiseFields) {
    if (!needTargets()) return
    setError('')
    const byParticipant: Record<string, Effect[]> = {}
    for (const p of chosen) byParticipant[p.participantId] = [limitRaiseEffect(fields, combat.id, crypto.randomUUID())]
    await combatRepo.update(combat.id, (c) => addEffectsToMany(c, byParticipant))
    setMessage(`Aumento del límite aplicado a ${chosen.length} combatiente(s).`)
  }

  async function applySpirit() {
    if (!needTargets()) return
    setError('')
    await combatRepo.update(combat.id, (c) =>
      setSpiritForMany(
        c,
        chosen.map((p) => ({ id: p.participantId, level, group: p.group })),
      ),
    )
    setMessage(
      level === 0
        ? `Espíritu quitado a ${chosen.length} combatiente(s).`
        : `Espíritu nivel ${level} aplicado a ${chosen.length} combatiente(s).`,
    )
  }

  async function endSkill() {
    if (!needTargets()) return
    setError('')
    await combatRepo.update(combat.id, (c) => endSkillForMany(c, ids))
    setMessage(`Terminó la habilidad de ${chosen.length} combatiente(s).`)
  }

  return (
    <>
      <PickParticipants
        title="A quiénes"
        profiles={profiles}
        selected={selected}
        onChange={(next) => {
          setSelected(next)
          setError('')
        }}
      />

      <div className="seg" role="group" aria-label="Qué aplicar">
        {(
          [
            ['manual', 'Buff o debuff'],
            ['espiritu', 'Espíritu'],
            ['limite', 'Aumento del límite'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={id === mode ? 'tab active' : 'tab'} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'limite' ? (
        <div className="card">
          <h2>Aumento del límite a varios</h2>
          <p className="muted small">
            Para habilidades, transformaciones, estados o buffs que permiten superar el límite de los buffs. Es aparte del
            Espíritu. Se elige el origen, cuánto sube y cuánto dura.
          </p>
          <LimitRaiseForm types={types} submitLabel={`Aplicar a ${chosen.length} combatiente(s)`} onSubmit={(f) => void applyRaise(f)} />
        </div>
      ) : mode === 'manual' ? (
        <div className="card">
          <h2>Buff o debuff a varios</h2>
          <div className="grid-2">
            <SelectField
              label="Clase"
              value={kind}
              options={[
                { value: 'buff' as EffectKind, label: 'Buff' },
                { value: 'debuff' as EffectKind, label: 'Debuff' },
              ]}
              onChange={setKind}
            />
            <SelectField
              label="Tipo"
              value={chosenType}
              options={manualTypes.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => {
                setTypeId(v)
                if (v === SKILL_TYPE_ID) setUnit('habilidad')
              }}
            />
            <TextField label="Nombre" value={name} onChange={setName} placeholder={typeName(chosenType)} />
            <SelectField label="Dura" value={unit} options={DURATION_OPTIONS} onChange={setUnit} />
            <NumberField label="Valor fijo" value={flat} onChange={setFlat} />
            <NumberField label="Porcentaje del valor natural" value={percent} onChange={setPercent} />
            {(unit === 'turnos' || unit === 'rondas') && (
              <NumberField label="Cantidad" integer value={remaining} onChange={setRemaining} />
            )}
          </div>
          <TargetPicker label="Afecta a (puedes elegir varios)" prefix="Afecta a" selected={targets} onChange={setTargets} />
          <button className="btn" onClick={() => void applyManual()}>
            Aplicar a {chosen.length} combatiente(s)
          </button>
        </div>
      ) : (
        <div className="card">
          <h2>Espíritu</h2>
          <p className="muted small">
            Buff de 10 niveles a los 7 stats: cada nivel suma el 10 % del límite del rango de cada uno. Dura hasta que lo
            quites (nivel 0) y no cuenta para el límite de buffs.
          </p>
          <SelectField label="Nivel de Espíritu" value={level} options={LEVEL_OPTIONS} onChange={setLevel} />
          {chosen.length > 0 && (
            <ul className="history">
              {chosen.map((p) => (
                <li key={p.participantId} className="small">
                  {p.name} ({p.rankName ?? 'sin rango'}, {GROUP_LABELS[p.group]}): +{fmt(spiritPerLevel(p.group))} por nivel →{' '}
                  <strong>+{fmt(spiritPerLevel(p.group) * level)}</strong>
                  {spiritLevel(p.resolved.map((r) => r.effect)) > 0 &&
                    ` (hoy nivel ${spiritLevel(p.resolved.map((r) => r.effect))})`}
                </li>
              ))}
            </ul>
          )}
          <button className="btn" onClick={() => void applySpirit()}>
            {level === 0 ? 'Quitar' : 'Aplicar'} Espíritu a {chosen.length} combatiente(s)
          </button>
        </div>
      )}

      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}

      <button className="btn secondary" onClick={() => void endSkill()}>
        Terminó la habilidad de {chosen.length} combatiente(s)
      </button>

      <h2 className="spaced">Qué tiene cada uno</h2>
      {profiles.map((p) => {
        const groups = groupEffects(p.resolved)
        return (
          <div key={p.participantId} className="card" aria-label={`Efectos de ${p.name}`}>
            <div className="name">{p.name}</div>
            {groups.length === 0 && <p className="muted small">Sin buffs ni debuffs.</p>}
            <ul className="history">
              {groups.map(({ group, items }) => {
                const first = items[0].effect
                const states = [...new Set(items.map((i) => i.state))]
                return (
                  <li key={group} className="effect-row">
                    <div className="grow">
                      <div>
                        <span className={first.kind === 'buff' ? 'tag buff' : 'tag debuff'}>
                          {first.kind === 'buff' ? 'Buff' : 'Debuff'}
                        </span>{' '}
                        {first.typeId === SPIRIT_TYPE_ID ? `Espíritu nivel ${first.level ?? ''}` : first.name}
                      </div>
                      <div className="small muted">
                        {items.length === 7 && first.typeId === SPIRIT_TYPE_ID
                          ? 'Los 7 stats'
                          : items.map((i) => TARGET_LABELS[i.effect.target]).join(', ')}{' '}
                        {describeAmount(first)} · {describeDuration(first.duration)}
                      </div>
                    </div>
                    <span className={states.length === 1 && states[0] === 'activo' ? 'chip' : 'chip off'}>
                      {states.length === 1 ? EFFECT_STATE_LABELS[states[0]] : 'Mixto'}
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={`Quitar ${first.name} de ${p.name}`}
                      onClick={() => void combatRepo.update(combat.id, (c) => removeEffectGroupFrom(c, p.participantId, group))}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}
