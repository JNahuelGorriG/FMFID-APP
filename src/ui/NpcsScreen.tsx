import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { defaultEnemyProfile, newNpcTemplate } from '../rules'
import type { NpcKind } from '../rules'
import { npcRepo } from './data'

interface Props {
  onOpen: (id: string) => void
  onCreated: (id: string) => void
  onGoMore: () => void
}

const KIND_LABELS: Record<NpcKind, { tab: string; title: string; create: string; empty: string }> = {
  npc: { tab: 'NPCs', title: 'NPCs', create: 'Nuevo NPC', empty: 'Todavía no hay NPCs.' },
  bestia: { tab: 'Bestiario', title: 'Bestiario', create: 'Nueva bestia', empty: 'Todavía no hay bestias.' },
}

export function NpcsScreen({ onOpen, onCreated, onGoMore }: Props) {
  const [kind, setKind] = useState<NpcKind>('npc')
  const [query, setQuery] = useState('')
  const npcs = useLiveQuery(() => npcRepo.list(query, kind), [query, kind])
  const total = useLiveQuery(() => npcRepo.list('', kind).then((all) => all.length), [kind])
  const labels = KIND_LABELS[kind]

  if (npcs === undefined) return <p className="muted">Cargando…</p>

  async function create() {
    const data = newNpcTemplate(kind)
    // Las bestias nacen con perfil de combate: para eso se usan.
    const npc = await npcRepo.create(kind === 'bestia' ? { ...data, combat: defaultEnemyProfile('E') } : data)
    onCreated(npc.id)
  }

  return (
    <section>
      <h1>{labels.title}</h1>

      <div className="seg" role="group" aria-label="Lista">
        {(['npc', 'bestia'] as const).map((k) => (
          <button
            key={k}
            className={k === kind ? 'tab active' : 'tab'}
            onClick={() => {
              setKind(k)
              setQuery('')
            }}
          >
            {KIND_LABELS[k].tab}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="card">
          <p>{labels.empty}</p>
          <p className="muted">Importa tu respaldo o crea uno nuevo.</p>
          <button className="btn" onClick={onGoMore}>
            Ir a importar
          </button>
        </div>
      ) : (
        <>
          <label className="field">
            <input
              type="search"
              aria-label="Buscar NPC"
              placeholder="Buscar por nombre, rol, reino, gremio, raza…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="muted small">
            {npcs.length} de {total} · Para filtrar por rango escribe solo el rango (B, B+, A…)
          </p>
          <ul className="list">
            {npcs.map((n) => (
              <li key={n.id}>
                <button className="card row" onClick={() => onOpen(n.id)}>
                  <span className="grow">
                    <span className="name">{n.name}</span>
                    <span className="muted small block">
                      {[n.role !== '-' ? n.role : '', n.realm !== '-' ? n.realm : '', n.race]
                        .filter(Boolean)
                        .join(' · ') || 'Sin datos'}
                      {n.combat ? ' · con perfil de combate' : ''}
                    </span>
                  </span>
                  {(n.combat?.rank || (n.rank && n.rank !== '-')) && (
                    <span className="chip">{n.rank && n.rank !== '-' ? n.rank : n.combat?.rank}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        <button className="btn secondary" onClick={() => void create()}>
          {labels.create}
        </button>
      </div>
    </section>
  )
}
