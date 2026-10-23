import { useLiveQuery } from 'dexie-react-hooks'
import { STAT_NAMES, characterSheet, splitEnergy } from '../rules'
import { repo } from './data'
import { STAT_LABELS, TIER_LABELS, describePath, fmt, fmtOrDash, fmtValue } from './format'

interface Props {
  id: string
  onBack: () => void
  onEdit: () => void
}

export function SheetScreen({ id, onBack, onEdit }: Props) {
  const character = useLiveQuery(() => repo.get(id), [id])
  const history = useLiveQuery(() => repo.history(id), [id])

  if (character === undefined) return <p className="muted">Cargando…</p>

  const sheet = characterSheet(character)
  const d = sheet.derived
  const mana = splitEnergy(sheet.mana)
  const stamina = splitEnergy(sheet.stamina)

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la lista">
          ←
        </button>
        <div className="grow">
          <h1 className="tight">{character.name}</h1>
          <div className="muted small">
            {[character.playerName, character.className].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="chip">{sheet.rank?.name ?? 'Sin rango'}</span>
        <button className="btn secondary compact" onClick={onEdit}>
          Editar
        </button>
      </header>

      <div className="card stats" aria-label="Stats">
        {STAT_NAMES.map((name) => (
          <div className="stat-row" key={name}>
            <span className="stat-name">{STAT_LABELS[name]}</span>
            <span className="muted small">
              {TIER_LABELS[character.tiers[name]]} · ×{fmt(character.multipliers[name])}
            </span>
            <span className="stat-value">{fmt(sheet.totals[name])}</span>
          </div>
        ))}
      </div>

      <div className="grid-3">
        <div className="card tile">
          <span className="muted small">Leves</span>
          <strong>{character.baseHealth.leve}</strong>
        </div>
        <div className="card tile">
          <span className="muted small">Medios</span>
          <strong>{character.baseHealth.medio}</strong>
        </div>
        <div className="card tile">
          <span className="muted small">Letales</span>
          <strong>{character.baseHealth.letal}</strong>
        </div>
      </div>

      <div className="grid-2">
        <div className="card tile">
          <span className="muted small">Maná</span>
          <strong>{fmt(sheet.mana)}</strong>
          <span className="muted small">
            {fmt(mana.natural)} nat. · {fmt(mana.renovable)} ren.
          </span>
        </div>
        <div className="card tile">
          <span className="muted small">Estamina</span>
          <strong>{fmt(sheet.stamina)}</strong>
          <span className="muted small">
            {fmt(stamina.natural)} nat. · {fmt(stamina.renovable)} ren.
          </span>
        </div>
      </div>

      <details className="card">
        <summary>Stats derivados</summary>
        <dl className="derived">
          <dt>Promedio de stats</dt>
          <dd>{fmt(sheet.average)}</dd>
          <dt>Daño físico con arma</dt>
          <dd>{fmtOrDash(d.physDamageWithWeapon)}</dd>
          <dt>Daño mágico con arma</dt>
          <dd>{fmtOrDash(d.magicDamageWithWeapon)}</dd>
          <dt>Defensa física CA</dt>
          <dd>{fmt(d.physDefenseCA)}</dd>
          <dt>Defensa física SA</dt>
          <dd>{fmt(d.physDefenseSA)}</dd>
          <dt>Defensa mágica CA</dt>
          <dd>{fmt(d.magicDefenseCA)}</dd>
          <dt>Defensa mágica SA</dt>
          <dd>{fmt(d.magicDefenseSA)}</dd>
          <dt>Velocidad (m/s)</dt>
          <dd>{fmt(d.speed)}</dd>
          <dt>Alcance físico</dt>
          <dd>{fmt(d.physReach)}</dd>
          <dt>Alcance mágico</dt>
          <dd>{fmt(d.magicReach)}</dd>
        </dl>
      </details>

      <details className="card">
        <summary>Potenciaciones</summary>
        <dl className="derived">
          <dt>Ki</dt>
          <dd>{d.techniques.ki}</dd>
          <dt>Ha-Ki</dt>
          <dd>{d.techniques.haKi}</dd>
          <dt>Esencia</dt>
          <dd>{d.techniques.esencia}</dd>
          <dt>E. Reinforced</dt>
          <dd>{d.techniques.eReinforced}</dd>
          <dt>Reiatsu Override</dt>
          <dd>{d.techniques.reiatsuOverride}</dd>
          <dt>Kyushu</dt>
          <dd>{d.techniques.kyushu}</dd>
          <dt>Magyushuru</dt>
          <dd>{d.techniques.magyushuru}</dd>
          <dt>Aetherium Ascendance</dt>
          <dd>{d.techniques.aetheriumAscendance}</dd>
          <dt>Aetherium Mastery</dt>
          <dd>{d.techniques.aetheriumMastery}</dd>
          <dt>Reiatsu</dt>
          <dd>{d.techniques.reiatsu}</dd>
        </dl>
      </details>
    
      <details className="card">
        <summary>Historial de cambios ({history?.length ?? 0})</summary>
        {history && history.length === 0 && <p className="muted small">Todavía no hay cambios.</p>}
        <ul className="history">
          {(history ?? []).map((h) => (
            <li key={h.id}>
              <div className="small muted">{new Date(h.at).toLocaleString('es-AR')}</div>
              <div>
                {describePath(h.path)}: {fmtValue(h.oldValue)} → {fmtValue(h.newValue)}
              </div>
              {h.reason && <div className="small muted">{h.reason}</div>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
