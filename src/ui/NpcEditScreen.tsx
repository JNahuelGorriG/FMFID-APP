import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  RANKS,
  STAT_NAMES,
  defaultEnemyProfile,
  enemySheet,
  suggestedCombatRank,
} from '../rules'
import type { ArmorType, EnemyProfile, Npc, NpcKind, StatName, Tier, WeaponSize } from '../rules'
import { CheckField, NumberField, OptionalNumberField, SelectField, TextAreaField, TextField } from './fields'
import { npcRepo } from './data'
import { STAT_LABELS, fmt } from './format'
import { Section } from './Section'

interface Props {
  id: string
  onDone: () => void
  onDeleted: () => void
}

export function NpcEditScreen({ id, onDone, onDeleted }: Props) {
  const original = useLiveQuery(() => npcRepo.get(id), [id])
  if (original === undefined) return <p className="muted">Cargando…</p>
  return <NpcForm key={original.id} original={original} onDone={onDone} onDeleted={onDeleted} />
}

const RANK_OPTIONS = RANKS.map((r) => ({ value: r.name, label: r.name }))
const CURVE_OPTIONS = ([1, 2, 3] as Tier[]).map((t) => ({ value: t, label: `Curva ${t}` }))
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

function NpcForm({
  original,
  onDone,
  onDeleted,
}: {
  original: Npc
  onDone: () => void
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState<Npc>(original)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  const set = <K extends keyof Npc>(key: K, value: Npc[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setCombat = (patch: Partial<EnemyProfile>) =>
    setDraft((d) => (d.combat ? { ...d, combat: { ...d.combat, ...patch } } : d))

  const preview = draft.combat ? enemySheet(draft.combat) : null

  async function save() {
    await npcRepo.save(draft)
    onDone()
  }

  function cancel() {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
    onDone()
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar a ${original.name}? No se puede deshacer.`)) return
    await npcRepo.remove(original.id)
    onDeleted()
  }

  return (
    <section>
      <h1>Editar NPC</h1>

      <Section title="Datos">
        <TextField label="Nombre" value={draft.name} onChange={(v) => set('name', v)} />
        <SelectField
          label="Tipo"
          value={draft.kind ?? 'npc'}
          options={[
            { value: 'npc' as NpcKind, label: 'NPC' },
            { value: 'bestia' as NpcKind, label: 'Bestia (bestiario)' },
          ]}
          onChange={(v) => set('kind', v)}
        />
        <div className="grid-2">
          <TextField label="Rol" value={draft.role} onChange={(v) => set('role', v)} />
          <TextField label="Rango" value={draft.rank} onChange={(v) => set('rank', v)} />
          <TextField label="Elemento" value={draft.element} onChange={(v) => set('element', v)} />
          <TextField label="Gremio" value={draft.guild} onChange={(v) => set('guild', v)} />
          <TextField label="Reino" value={draft.realm} onChange={(v) => set('realm', v)} />
          <TextField label="Raza" value={draft.race} onChange={(v) => set('race', v)} />
          <TextField label="Afiliación" value={draft.affiliation} onChange={(v) => set('affiliation', v)} />
          <TextField label="Ocupación" value={draft.occupation} onChange={(v) => set('occupation', v)} />
        </div>
        <TextAreaField label="Personalidad" value={draft.personality} onChange={(v) => set('personality', v)} />
        <TextAreaField label="Detalles" value={draft.details} onChange={(v) => set('details', v)} />
      </Section>

      <Section title="Perfil de combate">
        <CheckField
          label="Tiene perfil de combate"
          checked={draft.combat !== null}
          onChange={(on) => set('combat', on ? defaultEnemyProfile(suggestedCombatRank(draft)) : null)}
        />
      </Section>

      {draft.combat && preview && (
        <>
          <div className="card">
            <SelectField
              label="Rango de combate"
              value={draft.combat.rank}
              options={RANK_OPTIONS}
              onChange={(v) => setCombat({ rank: v })}
            />
            <p className="muted small">
              Curva 1: valores de Destreza y Percepción. Curva 2: Fuerza, Constitución y Carisma.
              Curva 3: Inteligencia y Sabiduría. El valor a mano reemplaza al de la curva.
            </p>
            {STAT_NAMES.map((name) => (
              <StatRow key={name} name={name} profile={draft.combat as EnemyProfile} value={preview.stats[name]} setCombat={setCombat} />
            ))}
          </div>

          <Section title="Equipo de referencia">
            <div className="grid-2">
              <SelectField label="Arma de daño físico" value={draft.combat.physWeapon} options={WEAPON_OPTIONS} onChange={(v) => setCombat({ physWeapon: v })} />
              <SelectField label="Arma de daño mágico" value={draft.combat.magicWeapon} options={WEAPON_OPTIONS} onChange={(v) => setCombat({ magicWeapon: v })} />
              <SelectField label="Armadura física SA" value={draft.combat.physArmor} options={ARMOR_OPTIONS} onChange={(v) => setCombat({ physArmor: v })} />
              <SelectField label="Armadura mágica SA" value={draft.combat.magicArmor} options={ARMOR_OPTIONS} onChange={(v) => setCombat({ magicArmor: v })} />
            </div>
            <p className="muted small">El equipo de un enemigo es de un rango por debajo del suyo.</p>
          </Section>

          <Section title="Vida (puntos)">
            <div className="grid-2">
              <NumberField label="Vida actual" integer value={draft.combat.hp.current} onChange={(v) => setCombat({ hp: { ...(draft.combat as EnemyProfile).hp, current: v } })} />
              <NumberField label="Vida máxima" integer value={draft.combat.hp.max} onChange={(v) => setCombat({ hp: { ...(draft.combat as EnemyProfile).hp, max: v } })} />
            </div>
          </Section>

          <p className="muted small">
            Vista previa: maná {fmt(preview.mana)} · estamina {fmt(preview.stamina)} · daño físico{' '}
            {fmt(preview.physDamageWithWeapon)} · defensa física SA {fmt(preview.physDefenseSA)}
          </p>
        </>
      )}

      <div className="actions">
        <button className="btn" onClick={() => void save()}>
          Guardar cambios
        </button>
        <button className="btn secondary" onClick={cancel}>
          Cancelar
        </button>
      </div>
      <button className="btn danger" onClick={() => void remove()}>
        Eliminar NPC
      </button>
    </section>
  )
}

function StatRow({
  name,
  profile,
  value,
  setCombat,
}: {
  name: StatName
  profile: EnemyProfile
  value: number
  setCombat: (patch: Partial<EnemyProfile>) => void
}) {
  return (
    <div className="npc-stat">
      <div className="small">
        {STAT_LABELS[name]} <strong>{fmt(value)}</strong>
      </div>
      <div className="grid-2">
        <SelectField
          label={`${STAT_LABELS[name]} · Curva`}
          value={profile.tiers[name]}
          options={CURVE_OPTIONS}
          onChange={(v) => setCombat({ tiers: { ...profile.tiers, [name]: v } })}
        />
        <OptionalNumberField
          label={`${STAT_LABELS[name]} · Valor a mano`}
          value={profile.overrides[name]}
          placeholder="De la curva"
          onChange={(v) => {
            const overrides = { ...profile.overrides }
            if (v === undefined) delete overrides[name]
            else overrides[name] = v
            setCombat({ overrides })
          }}
        />
      </div>
    </div>
  )
}
