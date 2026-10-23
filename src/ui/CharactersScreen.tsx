import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { characterSheet, newCharacterTemplate } from '../rules'
import { repo } from './data'

interface Props {
  onOpen: (id: string) => void
  onCreated: (id: string) => void
  onGoMore: () => void
}

export function CharactersScreen({ onOpen, onCreated, onGoMore }: Props) {
  const [showRetired, setShowRetired] = useState(false)
  const characters = useLiveQuery(
    () => repo.list({ includeRetired: showRetired }),
    [showRetired],
  )

  if (characters === undefined) return <p className="muted">Cargando…</p>

  return (
    <section>
      <h1>Personajes</h1>

      {characters.length === 0 ? (
        <div className="card">
          <p>Todavía no hay personajes.</p>
          <p className="muted">Importa tu respaldo para cargar la campaña.</p>
          <button className="btn" onClick={onGoMore}>
            Ir a importar
          </button>
        </div>
      ) : (
        <ul className="list">
          {characters.map((c) => {
            const sheet = characterSheet(c)
            return (
              <li key={c.id}>
                <button className="card row" onClick={() => onOpen(c.id)}>
                  <span className="grow">
                    <span className="name">{c.name}</span>
                    <span className="muted small block">
                      {[c.playerName, c.className].filter(Boolean).join(' · ') || 'Sin datos'}
                      {c.retired ? ' · retirado' : ''}
                    </span>
                  </span>
                  <span className="chip">{sheet.rank?.name ?? 'Sin rango'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="actions">
        <button
          className="btn secondary"
          onClick={async () => onCreated((await repo.create(newCharacterTemplate())).id)}
        >
          Nuevo personaje
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={showRetired}
          onChange={(e) => setShowRetired(e.target.checked)}
        />
        Mostrar retirados
      </label>
    </section>
  )
}
