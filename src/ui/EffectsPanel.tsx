import { useRef, useState } from 'react'
import {
  SKILL_TYPE_ID,
  SPIRIT_TYPE_ID,
  TECHNIQUES,
  addEffects,
  effectGroup,
  endSkill,
  groupEffects,
  isSkillEffect,
  limitRaiseEffect,
  removeGroup,
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
  LimitRaiseFields,
  TechniqueTarget,
  Techniques,
} from '../rules'
import { NumberField, SelectField, TextField } from './fields'
import { LimitRaiseForm } from './LimitRaiseForm'
import { TargetPicker } from './TargetPicker'
import { DURATION_LABELS, EFFECT_STATE_LABELS, TARGET_LABELS, describeAmount, describeDuration } from './format'

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

const STATE_LABELS = EFFECT_STATE_LABELS
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
  const [editing, setEditing] = useState<string | null>(null)
  const [editingRaise, setEditingRaise] = useState<string | null>(null)
  const formTop = useRef<HTMLHeadingElement>(null)
  const raiseTop = useRef<HTMLHeadingElement>(null)
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
  const hasSkill = effects.some(isSkillEffect)
  const groups = groupEffects(resolved)

  function add() {
    if (targets.length === 0) return setError('Elige al menos un stat.')
    if (flat === 0 && percent === 0) return setError('Indica un valor fijo o un porcentaje.')
    if ((unit === 'turnos' || unit === 'rondas') && remaining < 1) {
      return setError('La duración debe ser de al menos 1.')
    }
    setError('')
    const original = editing ? effects.find((e) => effectGroup(e) === editing) : undefined
    const group = editing ?? crypto.randomUUID()
    const list: Effect[] = targets.map((target) => ({
      id: crypto.randomUUID(),
      kind,
      name: name.trim() || typeName(typeId),
      typeId,
      target,
      flat,
      percent,
      duration: { unit, remaining: unit === 'turnos' || unit === 'rondas' ? remaining : 0 },
      combatId: original ? original.combatId : combatId,
      createdAt: original ? original.createdAt : new Date().toISOString(),
      group,
    }))
    // Al editar, el grupo viejo sale y entra la versión nueva (en todos sus stats).
    submit(list, editing ? removeGroup(effects, editing) : effects)
    setEditing(null)
  }

  /** Carga un buff o debuff en el formulario para editarlo (valor, stats, duración, nombre). */
  function startEdit(group: string) {
    const members = effects.filter((e) => effectGroup(e) === group)
    const first = members[0]
    if (!first) return
    if (first.target === 'limite') {
      setEditingRaise(group)
      requestAnimationFrame(() => raiseTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
      return
    }
    setEditing(group)
    setKind(first.kind)
    setName(first.name)
    setTypeId(first.typeId)
    setTargets(members.map((m) => m.target))
    setFlat(first.flat)
    setPercent(first.percent)
    setUnit(first.duration.unit)
    setRemaining(Math.max(1, first.duration.remaining || 3))
    setError('')
    // El formulario está más abajo: se lleva a la vista para no perder tiempo buscándolo.
    requestAnimationFrame(() => formTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  /** Agrega un aumento del límite, o reemplaza el que se está editando. */
  function submitRaise(fields: LimitRaiseFields) {
    const original = editingRaise ? effects.find((e) => effectGroup(e) === editingRaise) : undefined
    const group = editingRaise ?? crypto.randomUUID()
    const effect = limitRaiseEffect(fields, original ? original.combatId : combatId, group)
    onChange(addEffects(editingRaise ? removeGroup(effects, editingRaise) : effects, [effect]))
    setEditingRaise(null)
  }

  function cancelEdit() {
    setEditing(null)
    setName('')
    setError('')
  }

  /**
   * Agrega los efectos (uno por stat). Entran todos: si en un stat ya hay 4, quedan activos los 4 más
   * fuertes (y más recientes) y el resto aparece en la lista como "Sin lugar", sin efecto.
   */
  function submit(list: Effect[], base: Effect[] = effects) {
    onChange(addEffects(base, list))
    setName('')
  }

  function applyTechnique() {
    if (!techniques) return
    if (chosenTechTargets.length === 0) return setError('Elige a qué stat suma la potenciación.')
    const info = TECHNIQUES.find((t) => t.key === techKey)
    setError('')
    const group = crypto.randomUUID()
    submit(
      chosenTechTargets.map((target) => ({
        group,
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

  return (
    <div className="card">
      <h2>Buffs y debuffs</h2>

      {resolved.length === 0 && <p className="muted small">Sin efectos.</p>}
      <ul className="history">
        {groups.map(({ group, items }) => {
          const first = items[0].effect
          const states = [...new Set(items.map((i) => i.state))]
          const sameAmount = items.every((i) => i.effect.flat === first.flat && i.effect.percent === first.percent)
          return (
            <li key={group} className={editing === group || editingRaise === group ? 'effect-row editing' : 'effect-row'}>
              <div className="grow">
                <div>
                  <span className={first.kind === 'buff' ? 'tag buff' : 'tag debuff'}>
                    {first.kind === 'buff' ? 'Buff' : 'Debuff'}
                  </span>{' '}
                  {first.name}
                </div>
                <div className="small muted">
                  {items.map((i) => TARGET_LABELS[i.effect.target]).join(', ')}{' '}
                  {sameAmount ? describeAmount(first) : '(valores distintos)'} · {typeName(first.typeId)} ·{' '}
                  {describeDuration(first.duration)}
                </div>
                {items.length > 1 && states.length > 1 && (
                  <div className="small muted">
                    {items.map((i) => `${TARGET_LABELS[i.effect.target]}: ${STATE_LABELS[i.state].toLowerCase()}`).join(' · ')}
                  </div>
                )}
              </div>
              <span className={states.length === 1 && states[0] === 'activo' ? 'chip' : 'chip off'}>
                {states.length === 1 ? STATE_LABELS[states[0]] : 'Mixto'}
              </span>
              <button className="btn secondary compact" aria-label={`Editar ${first.name}`} onClick={() => startEdit(group)}>
                Editar
              </button>
              <button
                className="icon-btn"
                aria-label={`Quitar ${first.name}`}
                onClick={() => onChange(removeGroup(effects, group))}
              >
                ×
              </button>
            </li>
          )
        })}
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
              options={types.filter((t) => t.id !== SPIRIT_TYPE_ID).map((t) => ({ value: t.id, label: t.name }))}
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

      <h2 className="spaced" ref={formTop}>
        {editing ? 'Editar buff o debuff' : 'Agregar a mano'}
      </h2>
      {editing && (
        <p className="muted small">
          Estás editando el buff completo (todos sus stats). Al guardar, reemplaza al anterior.
        </p>
      )}
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
          options={types.filter((t) => t.id !== SPIRIT_TYPE_ID).map((t) => ({ value: t.id, label: t.name }))}
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
      <div className="actions">
        <button className="btn" onClick={add}>
          {editing ? 'Guardar cambios' : 'Agregar efecto'}
        </button>
        {editing && (
          <button className="btn secondary" onClick={cancelEdit}>
            Cancelar edición
          </button>
        )}
      </div>

      <h2 className="spaced" ref={raiseTop}>
        {editingRaise ? 'Editar aumento del límite' : 'Aumento del límite de buffs'}
      </h2>
      <p className="muted small">
        Habilidades, transformaciones, estados o buffs que permiten superar el límite. Cada uno tiene su origen y su duración,
        y se suma al límite de los 7 stats.
      </p>
      {(() => {
        const original = editingRaise ? effects.find((e) => effectGroup(e) === editingRaise) : undefined
        return (
          <LimitRaiseForm
            key={editingRaise ?? 'nuevo'}
            types={types}
            initial={
              original
                ? { name: original.name, typeId: original.typeId, flat: original.flat, percent: original.percent, duration: original.duration }
                : undefined
            }
            submitLabel={editingRaise ? 'Guardar aumento' : 'Agregar aumento'}
            onSubmit={submitRaise}
            onCancel={editingRaise ? () => setEditingRaise(null) : undefined}
          />
        )
      })()}

    </div>
  )
}
