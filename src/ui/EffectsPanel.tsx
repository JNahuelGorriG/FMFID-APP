import { useState } from 'react'
import {
  EFFECT_TARGETS,
  SKILL_TYPE_ID,
  TECHNIQUES,
  addEffect,
  addEffectWithChoice,
  endSkill,
  resolveEffects,
  resolveTechniqueTarget,
} from '../rules'
import type {
  DurationUnit,
  Effect,
  EffectBases,
  EffectKind,
  EffectTarget,
  EffectType,
  TechniqueTarget,
  Techniques,
} from '../rules'
import { NumberField, SelectField, TextField } from './fields'
import { DURATION_LABELS, TARGET_LABELS, describeAmount, describeDuration } from './format'

interface Props {
  effects: Effect[]
  bases: EffectBases
  types: EffectType[]
  combatId: string
  onChange: (effects: Effect[]) => void
  /** Valores de las potenciaciones del combatiente (Kyushu, Ki...). Si no se pasan, no se muestra ese bloque. */
  techniques?: Techniques
  /** A qué suma cada potenciación. */
  techniqueTargets?: Record<keyof Techniques, TechniqueTarget>
  /** Stat ofensivo del combatiente: Fuerza o Destreza. */
  offensiveStat?: 'fuerza' | 'destreza'
}

const STATE_LABELS = { activo: 'Activo', pisado: 'Pisado', suspendido: 'Suspendido' } as const
const DURATION_OPTIONS = (Object.keys(DURATION_LABELS) as DurationUnit[]).map((u) => ({
  value: u,
  label: DURATION_LABELS[u],
}))
const TARGET_OPTIONS = EFFECT_TARGETS.map((t) => ({ value: t, label: TARGET_LABELS[t] }))

export function EffectsPanel({
  effects,
  bases,
  types,
  combatId,
  onChange,
  techniques,
  techniqueTargets,
  offensiveStat = 'destreza',
}: Props) {
  const [kind, setKind] = useState<EffectKind>('buff')
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? SKILL_TYPE_ID)
  const [target, setTarget] = useState<EffectTarget>('fuerza')
  const [flat, setFlat] = useState(0)
  const [percent, setPercent] = useState(0)
  const [unit, setUnit] = useState<DurationUnit>('turnos')
  const [remaining, setRemaining] = useState(3)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ effect: Effect; occupants: Effect[] } | null>(null)
  const [techKey, setTechKey] = useState<keyof Techniques>('kyushu')
  const [techTarget, setTechTarget] = useState<EffectTarget | null>(null)
  const [techType, setTechType] = useState(SKILL_TYPE_ID)
  const [techUnit, setTechUnit] = useState<DurationUnit>('habilidad')
  const [techRemaining, setTechRemaining] = useState(3)

  const resolved = resolveEffects(effects, bases)
  /** Stat al que suma la potenciación: el elegido, el guardado por defecto, o ninguno (hay que elegir). */
  const presetTarget: EffectTarget | null =
    techTarget ?? resolveTechniqueTarget(techniqueTargets?.[techKey] ?? 'preguntar', offensiveStat)
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id
  const hasSkill = effects.some((e) => e.typeId === SKILL_TYPE_ID)

  function add() {
    if (flat === 0 && percent === 0) return setError('Indica un valor fijo o un porcentaje.')
    if ((unit === 'turnos' || unit === 'rondas') && remaining < 1) {
      return setError('La duración debe ser de al menos 1.')
    }
    setError('')
    submit({
      id: crypto.randomUUID(),
      kind,
      name: name.trim() || typeName(typeId),
      typeId,
      target,
      flat,
      percent,
      duration: { unit, remaining: unit === 'turnos' || unit === 'rondas' ? remaining : 0 },
      combatId,
      createdAt: new Date().toISOString(),
    })
  }

  /** Agrega el efecto, o pide elegir cuál sacar si ya hay 4 activos sobre ese stat. */
  function submit(effect: Effect) {
    const result = addEffect(effects, effect, bases)
    if (result.status === 'added') {
      onChange(result.effects)
      setName('')
    } else {
      setPending({ effect, occupants: result.occupants })
    }
  }

  function applyTechnique() {
    if (!techniques) return
    const value = techniques[techKey]
    const info = TECHNIQUES.find((t) => t.key === techKey)
    const resolvedTarget = presetTarget
    if (!resolvedTarget) return setError('Elige a qué stat suma la potenciación.')
    setError('')
    submit({
      id: crypto.randomUUID(),
      kind: 'buff',
      name: info?.name ?? techKey,
      typeId: techType,
      target: resolvedTarget,
      flat: value,
      percent: 0,
      duration: {
        unit: techUnit,
        remaining: techUnit === 'turnos' || techUnit === 'rondas' ? techRemaining : 0,
      },
      combatId,
      createdAt: new Date().toISOString(),
    })
  }

  function choose(action: 'remove' | 'suspend', id: string) {
    if (!pending) return
    onChange(addEffectWithChoice(effects, pending.effect, { action, id }))
    setPending(null)
    setName('')
  }

  return (
    <div className="card">
      <h2>Buffs y debuffs</h2>

      {resolved.length === 0 && <p className="muted small">Sin efectos.</p>}
      <ul className="history">
        {resolved.map(({ effect, state }) => (
          <li key={effect.id} className="effect-row">
            <div className="grow">
              <div>
                <span className={effect.kind === 'buff' ? 'tag buff' : 'tag debuff'}>
                  {effect.kind === 'buff' ? 'Buff' : 'Debuff'}
                </span>{' '}
                {effect.name}
              </div>
              <div className="small muted">
                {TARGET_LABELS[effect.target]} {describeAmount(effect)} · {typeName(effect.typeId)} ·{' '}
                {describeDuration(effect.duration)}
              </div>
            </div>
            <span className={state === 'activo' ? 'chip' : 'chip off'}>{STATE_LABELS[state]}</span>
            <button
              className="icon-btn"
              aria-label={`Quitar ${effect.name}`}
              onClick={() => onChange(effects.filter((e) => e.id !== effect.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {hasSkill && (
        <button className="btn secondary" onClick={() => onChange(endSkill(effects).effects)}>
          Terminó la habilidad
        </button>
      )}

      {techniques && (
        <>
          <h2 className="spaced">Potenciaciones</h2>
          <div className="grid-2">
            <SelectField
              label="Potenciación"
              value={techKey}
              options={TECHNIQUES.map((t) => ({ value: t.key, label: `${t.name} (+${techniques[t.key]})` }))}
              onChange={(k) => {
                setTechKey(k)
                setTechTarget(null)
              }}
            />
            <SelectField
              label="Suma a"
              value={presetTarget ?? ''}
              options={[{ value: '', label: 'Elegir stat…' }, ...TARGET_OPTIONS]}
              onChange={(v) => setTechTarget(v === '' ? null : (v as EffectTarget))}
            />
            <SelectField
              label="Tipo de la potenciación"
              value={techType}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => {
                setTechType(v)
                setTechUnit(v === SKILL_TYPE_ID ? 'habilidad' : 'turnos')
              }}
            />
            <SelectField label="La potenciación dura" value={techUnit} options={DURATION_OPTIONS} onChange={setTechUnit} />
            {(techUnit === 'turnos' || techUnit === 'rondas') && (
              <NumberField label="Cantidad de la potenciación" integer value={techRemaining} onChange={setTechRemaining} />
            )}
          </div>
          <button className="btn" onClick={applyTechnique}>
            Aplicar potenciación
          </button>
        </>
      )}

      <h2 className="spaced">Agregar a mano</h2>
      <div className="grid-2">
        <SelectField
          label="Clase"
          value={kind}
          options={[
            { value: 'buff' as EffectKind, label: 'Buff' },
            { value: 'debuff' as EffectKind, label: 'Debuff' },
          ]}
          onChange={(v) => setKind(v)}
        />
        <SelectField
          label="Tipo"
          value={typeId}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => {
            setTypeId(v)
            if (v === SKILL_TYPE_ID) setUnit('habilidad')
          }}
        />
        <SelectField label="Afecta a" value={target} options={TARGET_OPTIONS} onChange={(v) => setTarget(v)} />
        <TextField label="Nombre" value={name} onChange={setName} placeholder={typeName(typeId)} />
        <NumberField label="Valor fijo" value={flat} onChange={setFlat} />
        <NumberField label="Porcentaje del valor natural" value={percent} onChange={setPercent} />
        <SelectField label="Dura" value={unit} options={DURATION_OPTIONS} onChange={(v) => setUnit(v)} />
        {(unit === 'turnos' || unit === 'rondas') && (
          <NumberField label="Cantidad" integer value={remaining} onChange={setRemaining} />
        )}
      </div>
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <button className="btn" onClick={add}>
        Agregar efecto
      </button>

      {pending && (
        <div className="card nested" role="alert">
          <p>
            Ya hay {pending.occupants.length} {pending.effect.kind === 'buff' ? 'buffs' : 'debuffs'} activos sobre{' '}
            {TARGET_LABELS[pending.effect.target]}. Elige cuál sale para que entre "{pending.effect.name}".
          </p>
          {pending.occupants.map((o) => (
            <div key={o.id} className="row">
              <span className="grow small">
                {o.name} ({describeAmount(o)})
              </span>
              <button className="btn secondary compact" onClick={() => choose('remove', o.id)}>
                Quitar
              </button>
              {pending.effect.typeId === SKILL_TYPE_ID && (
                <button className="btn secondary compact" onClick={() => choose('suspend', o.id)}>
                  Suspender
                </button>
              )}
            </div>
          ))}
          <button className="btn secondary compact" onClick={() => setPending(null)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
