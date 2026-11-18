import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { STAT_NAMES, absorbAsVariants, combatOptions, defaultEnemyProfile, enemySheet, suggestedCombatRank } from '../rules'
import type { Npc } from '../rules'
import { npcRepo } from './data'
import { DAMAGE_LABELS, STAT_LABELS, fmt } from './format'
import { Section } from './Section'

interface Props {
  id: string
  onBack: () => void
  onEdit: () => void
}

const FIELDS: [string, keyof Npc][] = [
  ['Rol', 'role'],
  ['Elemento', 'element'],
  ['Gremio', 'guild'],
  ['Reino', 'realm'],
  ['Raza', 'race'],
  ['Afiliación', 'affiliation'],
  ['Ocupación', 'occupation'],
  ['Personalidad', 'personality'],
  ['Detalles', 'details'],
]

export function NpcScreen({ id, onBack, onEdit }: Props) {
  const npc = useLiveQuery(() => npcRepo.get(id), [id])
  const [variantId, setVariantId] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const others = useLiveQuery(() => npcRepo.list('', 'bestia'), [])
  if (npc === undefined) return <p className="muted">Cargando…</p>

  const options = combatOptions(npc)
  const variant = options.find((v) => v.id === variantId) ?? options[0]
  const combat = variant?.combat ?? null
  const sheet = combat ? enemySheet(combat) : null
  const candidates = (others ?? []).filter((o) => o.id !== npc.id && combatOptions(o).length > 0)

  async function merge() {
    if (!npc) return
    const chosen = candidates.filter((o) => picked.includes(o.id))
    if (chosen.length === 0) return
    if (!window.confirm(`Se unirán ${chosen.length} bestia(s) como variantes de ${npc.name} y se borrarán sus entradas sueltas. ¿Seguir?`)) return
    await npcRepo.save(absorbAsVariants(npc, chosen))
    for (const o of chosen) await npcRepo.remove(o.id)
    setPicked([])
  }

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la lista">
          ←
        </button>
        <div className="grow">
          <h1 className="tight">{npc.name}</h1>
        </div>
        {npc.kind === 'bestia' && <span className="chip off">Bestia</span>}
        {npc.rank && npc.rank !== '-' && <span className="chip">{npc.rank}</span>}
        <button className="btn secondary compact" onClick={onEdit}>
          Editar
        </button>
      </header>

      <div className="card">
        <dl className="derived">
          {FIELDS.map(([label, key]) => {
            const value = String(npc[key] ?? '')
            return value && value !== '-' ? (
              <div key={key} className="kv">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ) : null
          })}
        </dl>
      </div>

      {combat && sheet ? (
        <>
          {options.length > 1 && (
            <div className="seg" role="group" aria-label="Variantes">
              {options.map((v) => (
                <button key={v.id} className={v.id === variant?.id ? 'tab active' : 'tab'} onClick={() => setVariantId(v.id)}>
                  {v.label || 'Base'}
                </button>
              ))}
            </div>
          )}
          <h2>
            Perfil de combate{variant?.label ? ` · ${variant.label}` : ''} · rango {sheet.rank.name}
          </h2>
          <div className="card stats" aria-label="Stats del NPC">
            {STAT_NAMES.map((name) => (
              <div className="stat-row" key={name}>
                <span className="stat-name">{STAT_LABELS[name]}</span>
                <span className="muted small">
                  {combat.overrides[name] !== undefined
                    ? 'a mano'
                    : `curva ${combat.tiers[name]}`}
                </span>
                <span className="stat-value">{fmt(sheet.stats[name])}</span>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card tile">
              <span className="muted small">Vida</span>
              <strong>
                {combat.hp.current} / {combat.hp.max}
              </strong>
            </div>
            <div className="card tile">
              <span className="muted small">Maná · Estamina</span>
              <strong>
                {fmt(sheet.mana)} · {fmt(sheet.stamina)}
              </strong>
            </div>
          </div>

          <Section title="Daño y defensas" defaultOpen={false}>
            <dl className="derived">
              <dt>{DAMAGE_LABELS.physSA}</dt>
              <dd>{fmt(sheet.physDamage)}</dd>
              <dt>{DAMAGE_LABELS.physCA}</dt>
              <dd>{fmt(sheet.physDamageWithWeapon)}</dd>
              <dt>{DAMAGE_LABELS.magicSA}</dt>
              <dd>{fmt(sheet.magicDamage)}</dd>
              <dt>{DAMAGE_LABELS.magicCA}</dt>
              <dd>{fmt(sheet.magicDamageWithWeapon)}</dd>
              <dt>Defensa física CA</dt>
              <dd>{fmt(sheet.physDefenseCA)}</dd>
              <dt>Defensa física SA</dt>
              <dd>{fmt(sheet.physDefenseSA)}</dd>
              <dt>Defensa mágica CA</dt>
              <dd>{fmt(sheet.magicDefenseCA)}</dd>
              <dt>Defensa mágica SA</dt>
              <dd>{fmt(sheet.magicDefenseSA)}</dd>
              <dt>Velocidad (m/s)</dt>
              <dd>{fmt(sheet.speed)}</dd>
              <dt>Alcance físico</dt>
              <dd>{fmt(sheet.physReach)}</dd>
              <dt>Alcance mágico</dt>
              <dd>{fmt(sheet.magicReach)}</dd>
            </dl>
          </Section>

          <Section title="Potenciaciones" defaultOpen={false}>
            <dl className="derived">
              <dt>Ki</dt>
              <dd>{sheet.techniques.ki}</dd>
              <dt>Ha-Ki</dt>
              <dd>{sheet.techniques.haKi}</dd>
              <dt>Esencia</dt>
              <dd>{sheet.techniques.esencia}</dd>
              <dt>E. Reinforced</dt>
              <dd>{sheet.techniques.eReinforced}</dd>
              <dt>Reiatsu Override</dt>
              <dd>{sheet.techniques.reiatsuOverride}</dd>
              <dt>Kyushu</dt>
              <dd>{sheet.techniques.kyushu}</dd>
              <dt>Magyushuru</dt>
              <dd>{sheet.techniques.magyushuru}</dd>
              <dt>Aetherium Ascendance</dt>
              <dd>{sheet.techniques.aetheriumAscendance}</dd>
              <dt>Aetherium Mastery</dt>
              <dd>{sheet.techniques.aetheriumMastery}</dd>
              <dt>Reiatsu</dt>
              <dd>{sheet.techniques.reiatsu}</dd>
            </dl>
          </Section>
          {npc.kind === 'bestia' && candidates.length > 0 && (
            <Section title="Unir otras bestias como variantes" defaultOpen={false}>
              <p className="muted small">
                Marca las entradas sueltas (por ejemplo "Anti Esper Tanque") para meterlas aquí como variantes. La
                etiqueta sale de lo que sobra del nombre.
              </p>
              {candidates.map((o) => (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={picked.includes(o.id)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
                  />
                  {o.name}
                </label>
              ))}
              <button className="btn secondary" disabled={picked.length === 0} onClick={() => void merge()}>
                Unir seleccionadas
              </button>
            </Section>
          )}
        </>
      ) : (
        <div className="card">
          <p className="muted">Este NPC no tiene perfil de combate.</p>
          <button
            className="btn"
            onClick={async () => {
              await npcRepo.save({ ...npc, combat: defaultEnemyProfile(suggestedCombatRank(npc)) })
              onEdit()
            }}
          >
            Crear perfil de combate
          </button>
        </div>
      )}
    </section>
  )
}
