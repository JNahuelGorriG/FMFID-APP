import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { diffPaths, setIn } from '../db'
import {
  STAT_NAMES,
  characterSheet,
  referenceArmorBonus,
  referenceWeaponBonus,
  validateCharacter,
} from '../rules'
import type {
  ArmorType,
  Character,
  EquipmentRef,
  Rank,
  StatName,
  Tier,
  WeaponSize,
} from '../rules'
import { CheckField, NumberField, SelectField, TextField } from './fields'
import { repo } from './data'
import {
  ENERGY_LABELS,
  FLAT_KEYS,
  HEALTH_LABELS,
  INNATE_KEYS,
  SOURCE_LABELS,
  STAT_LABELS,
  TIER_LABELS,
  fmt,
} from './format'

interface Props {
  id: string
  onDone: () => void
  onDeleted: () => void
}

export function EditScreen({ id, onDone, onDeleted }: Props) {
  const original = useLiveQuery(() => repo.get(id), [id])
  if (original === undefined) return <p className="muted">Cargando…</p>
  return <EditForm key={original.id} original={original} onDone={onDone} onDeleted={onDeleted} />
}

const TIER_OPTIONS = ([1, 2, 3] as Tier[]).map((t) => ({ value: t, label: TIER_LABELS[t] }))
const WEAPON_OPTIONS: { value: WeaponSize; label: string }[] = [
  { value: 'pequena', label: 'Pequeña' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
  { value: 'pesada', label: 'Pesada' },
]
const ARMOR_OPTIONS: { value: ArmorType; label: string }[] = [
  { value: 'ligera', label: 'Ligera' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'pesada', label: 'Pesada' },
]

function EditForm({
  original,
  onDone,
  onDeleted,
}: {
  original: Character
  onDone: () => void
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState<Character>(original)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const set = (path: string, value: unknown) => setDraft((d) => setIn(d, path, value, true))
  const changes = diffPaths(original, draft)

  const superOf = (kind: 'primario' | 'terciario'): StatName | undefined =>
    STAT_NAMES.find((n) => draft.superStats?.[n] === kind)
  function setSuper(kind: 'primario' | 'terciario', value: string) {
    const next = { ...(draft.superStats ?? {}) }
    for (const n of STAT_NAMES) if (next[n] === kind) delete next[n]
    if (value !== '') next[value as StatName] = kind
    set('superStats', next)
  }

  const problems = validateCharacter(draft)
  const sheet = problems.length === 0 ? characterSheet(draft) : null

  async function save() {
    if (problems.length > 0) {
      setErrors(problems)
      return
    }
    setErrors([])
    await repo.applyChanges(original.id, changes, reason.trim() || 'Edición manual')
    onDone()
  }

  function cancel() {
    if (changes.length > 0 && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
    onDone()
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar a ${original.name} y todo su historial? No se puede deshacer.`)) return
    await repo.remove(original.id)
    onDeleted()
  }

  return (
    <section>
      <header className="sheet-head">
        <h1 className="tight grow">Editar personaje</h1>
        <span className="chip">{sheet?.rank?.name ?? '—'}</span>
      </header>
      {sheet && (
        <p className="muted small">
          Vista previa: promedio {fmt(sheet.average)} · maná {fmt(sheet.mana)} · estamina{' '}
          {fmt(sheet.stamina)}
        </p>
      )}

      <div className="card">
        <h2>Datos</h2>
        <TextField label="Nombre" value={draft.name} onChange={(v) => set('name', v)} />
        <TextField label="Jugador" value={draft.playerName} onChange={(v) => set('playerName', v)} />
        <TextField label="Clase" value={draft.className} onChange={(v) => set('className', v)} />
        <CheckField label="Retirado" checked={draft.retired} onChange={(v) => set('retired', v)} />
      </div>

      <div className="card">
        <h2>Súper stats</h2>
        <p className="muted small">
          Para personajes con un stat potenciado y otro reducido (Edward, Hernán): el súper primario recibe el 125 %
          de Categoría y el súper terciario el 25 %.
        </p>
        <div className="grid-2">
          <SelectField
            label="Súper primario"
            value={superOf('primario') ?? ''}
            options={[{ value: '', label: 'Ninguno' }, ...STAT_NAMES.map((n) => ({ value: n as string, label: STAT_LABELS[n] }))]}
            onChange={(v) => setSuper('primario', v)}
          />
          <SelectField
            label="Súper terciario"
            value={superOf('terciario') ?? ''}
            options={[{ value: '', label: 'Ninguno' }, ...STAT_NAMES.map((n) => ({ value: n as string, label: STAT_LABELS[n] }))]}
            onChange={(v) => setSuper('terciario', v)}
          />
        </div>
      </div>

      <h2>Stats</h2>
      {STAT_NAMES.map((name) => (
        <StatEditor key={name} name={name} draft={draft} set={set} />
      ))}

      <div className="card">
        <h2>Energía y vida</h2>
        <div className="grid-2">
          {(['baseMana', 'baseStamina', 'bonusMana', 'bonusStamina'] as const).map((key) => (
            <NumberField
              key={key}
              label={ENERGY_LABELS[key]}
              value={draft.energy[key]}
              onChange={(v) => set(`energy.${key}`, v)}
            />
          ))}
        </div>
        <div className="grid-3">
          {(['leve', 'medio', 'letal'] as const).map((key) => (
            <NumberField
              key={key}
              label={HEALTH_LABELS[key]}
              integer
              value={draft.baseHealth[key]}
              onChange={(v) => set(`baseHealth.${key}`, v)}
            />
          ))}
        </div>
      </div>

      <DerivedEditor draft={draft} set={set} rank={sheet?.rank ?? null} />

      <div className="card">
        <h2>Guardar</h2>
        <TextField
          label="Motivo del cambio"
          value={reason}
          onChange={setReason}
          placeholder="Entrenó en el dojo"
        />
        <p className="muted small">
          {changes.length === 0 ? 'Sin cambios.' : `${changes.length} dato(s) para guardar.`}
        </p>
        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="actions">
          <button className="btn" onClick={() => void save()}>
            Guardar cambios
          </button>
          <button className="btn secondary" onClick={cancel}>
            Cancelar
          </button>
        </div>
      </div>

      <button className="btn danger" onClick={() => void remove()}>
        Eliminar personaje
      </button>
    </section>
  )
}

function StatEditor({
  name,
  draft,
  set,
}: {
  name: StatName
  draft: Character
  set: (path: string, value: unknown) => void
}) {
  const sources = draft.sources[name]
  const innate = INNATE_KEYS.reduce((sum, k) => sum + sources[k], 0)
  const flat = FLAT_KEYS.reduce((sum, k) => sum + sources[k], 0)
  const total = innate * draft.multipliers[name] + flat

  return (
    <details className="card">
      <summary>
        {STAT_LABELS[name]} <span className="muted">· total {fmt(total)}</span>
      </summary>
      <div className="grid-2">
        <SelectField
          label={`${STAT_LABELS[name]} · Tier`}
          value={draft.tiers[name]}
          options={TIER_OPTIONS}
          onChange={(v) => set(`tiers.${name}`, v)}
        />
        <NumberField
          label={`${STAT_LABELS[name]} · Multiplicador`}
          value={draft.multipliers[name]}
          onChange={(v) => set(`multipliers.${name}`, v)}
        />
      </div>
      <p className="muted small">Con multiplicador</p>
      <div className="grid-2">
        {INNATE_KEYS.map((key) => (
          <NumberField
            key={key}
            label={`${STAT_LABELS[name]} · ${SOURCE_LABELS[key]}`}
            value={sources[key]}
            onChange={(v) => set(`sources.${name}.${key}`, v)}
          />
        ))}
      </div>
      <p className="muted small">Sin multiplicador</p>
      <div className="grid-2">
        {FLAT_KEYS.map((key) => (
          <NumberField
            key={key}
            label={`${STAT_LABELS[name]} · ${SOURCE_LABELS[key]}`}
            value={sources[key]}
            onChange={(v) => set(`sources.${name}.${key}`, v)}
          />
        ))}
      </div>
    </details>
  )
}

function WeaponRefEditor({
  label,
  path,
  value,
  rank,
  set,
}: {
  label: string
  path: string
  value: EquipmentRef<WeaponSize> | null
  rank: Rank | null
  set: (path: string, value: unknown) => void
}) {
  return (
    <div className="ref">
      <CheckField
        label={`${label}: usa arma`}
        checked={value !== null}
        onChange={(on) => set(path, on ? { kind: 'mediana', rankSteps: 0 } : null)}
      />
      {value && (
        <div className="grid-2">
          <SelectField
            label={`${label} · Tamaño`}
            value={value.kind}
            options={WEAPON_OPTIONS}
            onChange={(v) => set(`${path}.kind`, v)}
          />
          <NumberField
            label={`${label} · Ajuste de rango`}
            integer
            value={value.rankSteps}
            onChange={(v) => set(`${path}.rankSteps`, v)}
          />
          {rank && <p className="muted small">Bono actual: {referenceWeaponBonus(rank, value)}</p>}
        </div>
      )}
    </div>
  )
}

function ArmorRefEditor({
  label,
  path,
  value,
  rank,
  set,
}: {
  label: string
  path: string
  value: EquipmentRef<ArmorType>
  rank: Rank | null
  set: (path: string, value: unknown) => void
}) {
  return (
    <div className="ref">
      <p className="small">{label}</p>
      <div className="grid-2">
        <SelectField
          label={`${label} · Tipo`}
          value={value.kind}
          options={ARMOR_OPTIONS}
          onChange={(v) => set(`${path}.kind`, v)}
        />
        <NumberField
          label={`${label} · Ajuste de rango`}
          integer
          value={value.rankSteps}
          onChange={(v) => set(`${path}.rankSteps`, v)}
        />
        {rank && <p className="muted small">Bono actual: {referenceArmorBonus(rank, value)}</p>}
      </div>
    </div>
  )
}

function DerivedEditor({
  draft,
  set,
  rank,
}: {
  draft: Character
  set: (path: string, value: unknown) => void
  rank: Rank | null
}) {
  const d = draft.derived
  const weights = d.magicDefenseWeights ?? { constitucion: 0.3, sabiduria: 0.7 }

  return (
    <details className="card">
      <summary>Equipo de referencia</summary>
      <p className="muted small">
        El ajuste de rango es en pasos: +1 sube un rango (de A a A+), −1 baja uno.
      </p>
      <WeaponRefEditor label="Daño físico" path="derived.physDamageWeapon" value={d.physDamageWeapon} rank={rank} set={set} />
      <WeaponRefEditor label="Daño mágico" path="derived.magicDamageWeapon" value={d.magicDamageWeapon} rank={rank} set={set} />
      <ArmorRefEditor label="Defensa física SA" path="derived.physDefenseArmor" value={d.physDefenseArmor} rank={rank} set={set} />
      <ArmorRefEditor label="Defensa mágica SA" path="derived.magicDefenseArmor" value={d.magicDefenseArmor} rank={rank} set={set} />

      <p className="small">Defensa mágica CA (pesos)</p>
      <div className="grid-2">
        <NumberField
          label="Peso de Constitución"
          value={weights.constitucion}
          onChange={(v) => set('derived.magicDefenseWeights', { ...weights, constitucion: v })}
        />
        <NumberField
          label="Peso de Sabiduría"
          value={weights.sabiduria}
          onChange={(v) => set('derived.magicDefenseWeights', { ...weights, sabiduria: v })}
        />
      </div>
      <SelectField
        label="Stat de agilidad (Esencia, E. Reinforced, Reiatsu)"
        value={d.agilityStat ?? 'destreza'}
        options={[
          { value: 'destreza', label: 'Destreza' },
          { value: 'fuerza', label: 'Fuerza' },
        ]}
        onChange={(v) => set('derived.agilityStat', v)}
      />
    </details>
  )
}
