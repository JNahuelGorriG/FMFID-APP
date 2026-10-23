import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { newNpcTemplate } from '../rules'
import { npcRepo } from './data'

interface Props {
  onOpen: (id: string) => void
  onCreated: (id: string) => void
  onGoMore: () => void
}

export function NpcsScreen({ onOpen, onCreated, onGoMore }: Props) {
  const [query, setQuery] = useState('')
  const npcs = useLiveQuery(() => npcRepo.list(query), [query])
  const total = useLiveQuery(() => npcRepo.list().then((all) => all.length), [])

  if (npcs === undefined) return <p className="muted">Cargando…</p>

  return (
    <section>
      <h1>NPCs</h1>

      {total === 0 ? (
        <div className="card">
          <p>Todavía no hay NPCs.</p>
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
            {npcs.length} de {total}
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
                  {n.rank && n.rank !== '-' && <span className="chip">{n.rank}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        <button
          className="btn secondary"
          onClick={async () => onCreated((await npcRepo.create(newNpcTemplate())).id)}
        >
          Nuevo NPC
        </button>
      </div>
    </section>
  )
}
