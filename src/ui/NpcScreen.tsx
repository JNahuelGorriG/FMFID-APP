import { useLiveQuery } from 'dexie-react-hooks'
import { STAT_NAMES, defaultEnemyProfile, enemySheet, suggestedCombatRank } from '../rules'
import type { Npc } from '../rules'
import { npcRepo } from './data'
import { STAT_LABELS, fmt } from './format'

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
  if (npc === undefined) return <p className="muted">Cargando…</p>

  const sheet = npc.combat ? enemySheet(npc.combat) : null

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

      {npc.combat && sheet ? (
        <>
          <h2>Perfil de combate · rango {sheet.rank.name}</h2>
          <div className="card stats" aria-label="Stats del NPC">
            {STAT_NAMES.map((name) => (
              <div className="stat-row" key={name}>
                <span className="stat-name">{STAT_LABELS[name]}</span>
                <span className="muted small">
                  {npc.combat?.overrides[name] !== undefined
                    ? 'a mano'
                    : `curva ${npc.combat?.tiers[name]}`}
                </span>
                <span className="stat-value">{fmt(sheet.stats[name])}</span>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card tile">
              <span className="muted small">Vida</span>
              <strong>
                {npc.combat.hp.current} / {npc.combat.hp.max}
              </strong>
            </div>
            <div className="card tile">
              <span className="muted small">Maná · Estamina</span>
              <strong>
                {fmt(sheet.mana)} · {fmt(sheet.stamina)}
              </strong>
            </div>
          </div>

          <details className="card">
            <summary>Daño y defensas</summary>
            <dl className="derived">
              <dt>Daño físico con arma</dt>
              <dd>{fmt(sheet.physDamageWithWeapon)}</dd>
              <dt>Daño mágico con arma</dt>
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
          </details>

          <details className="card">
            <summary>Potenciaciones</summary>
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
          </details>
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
