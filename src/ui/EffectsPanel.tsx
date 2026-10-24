import { useState } from 'react'
import {
  SKILL_TYPE_ID,
  TECHNIQUES,
  addEffectWithChoice,
  addEffects,
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
import { TargetPicker } from './TargetPicker'
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
  const [targets, setTargets] = useState<EffectTarget[]>(['fuerza'])
  const [flat, setFlat] = useState(0)
  const [percent, setPercent] = useState(0)
  const [unit, setUnit] = useState<DurationUnit>('turnos')
  const [remaining, setRemaining] = useState(3)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ base: Effect[]; effect: Effect; occupants: Effect[]; rest: Effect[] } | null>(null)
  const [techKey, setTechKey] = useState<keyof Techniques>('kyushu')
  const [techTargets, setTechTargets] = useState<EffectTarget[] | null>(null)
  const [techType, setTechType] = useState(SKILL_TYPE_ID)
  const [techUnit, setTechUnit] = useState<DurationUnit>('habilidad')
  const [techRemaining, setTechRemaining] = useState(3)

  const resolved = resolveEffects(effects, bases)
  /** Stats a los que suma la potenciación: los elegidos, o el guardado por defecto, o ninguno (hay que elegir). */
  const presetTarget = resolveTechniqueTarget(techniqueTargets?.[techKey] ?? 'preguntar', offensiveStat)
  const chosenTechTargets: EffectTarget[] = techTargets ?? (presetTarget ? [presetTarget] : [])
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id
  const hasSkill = effects.some((e) => e.typeId === SKILL_TYPE_ID)

  function add() {
    if (targets.length === 0) return setError('Elige al menos un stat.')
    if (flat === 0 && percent === 0) return setError('Indica un valor fijo o un porcentaje.')
    if ((unit === 'turnos' || unit === 'rondas') && remaining < 1) {
      return setError('La duración debe ser de al menos 1.')
    }
    setError('')
    submit(
      targets.map((target) => ({
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
      })),
    )
  }

  /**
   * Agrega los efectos (uno por stat). Si en algún stat ya hay 4 activos, pide elegir cuál sale y,
   * resuelto eso, sigue con los que faltan.
   */
  function submit(list: Effect[], base: Effect[] = effects) {
    const result = addEffects(base, list, bases)
    if (result.blocked) {
      setPending({ base: result.effects, ...result.blocked })
      return
    }
    setPending(null)
    onChange(result.effects)
    setName('')
  }

  function applyTechnique() {
    if (!techniques) return
    if (chosenTechTargets.length === 0) return setError('Elige a qué stat suma la potenciación.')
    const info = TECHNIQUES.find((t) => t.key === techKey)
    setError('')
    submit(
      chosenTechTargets.map((target) => ({
        id: crypto.randomUUID(),
        kind: 'buff' as const,
        name: info?.name ?? techKey,
        typeId: techType,
        target,
        flat: techniques[techKey],
        percent: 0,
        duration: {
          unit: techUnit,
          remaining: techUnit === 'turnos' || techUnit === 'rondas' ? techRemaining : 0,
        },
        combatId,
        createdAt: new Date().toISOString(),
      })),
    )
  }

  function choose(action: 'remove' | 'suspend', id: string) {
    if (!pending) return
    const base = addEffectWithChoice(pending.base, pending.effect, { action, id })
    submit(pending.rest, base)
  }

  /** Salta el stat que no entró y sigue con los que faltan. */
  function skipBlocked() {
    if (!pending) return
    submit(pending.rest, pending.base)
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
                setTechTargets(null)
              }}
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
          <TargetPicker
            label="Suma a (puedes elegir varios)"
            prefix="Suma a"
            selected={chosenTechTargets}
            onChange={setTechTargets}
          />
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
        <TextField label="Nombre" value={name} onChange={setName} placeholder={typeName(typeId)} />
        <NumberField label="Valor fijo" value={flat} onChange={setFlat} />
        <NumberField label="Porcentaje del valor natural" value={percent} onChange={setPercent} />
        <SelectField label="Dura" value={unit} options={DURATION_OPTIONS} onChange={(v) => setUnit(v)} />
        {(unit === 'turnos' || unit === 'rondas') && (
          <NumberField label="Cantidad" integer value={remaining} onChange={setRemaining} />
        )}
      </div>
      <TargetPicker label="Afecta a (puedes elegir varios)" prefix="Afecta a" selected={targets} onChange={setTargets} />
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
          {pending.rest.length > 0 && (
            <p className="muted small">Faltan {pending.rest.length} stat(s) más por agregar después de este.</p>
          )}
          <button className="btn secondary compact" onClick={skipBlocked}>
            Omitir este stat
          </button>
        </div>
      )}
    </div>
  )
}
