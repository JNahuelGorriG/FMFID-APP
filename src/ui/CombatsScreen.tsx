import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { combatRepo } from './data'
import { TextField } from './fields'

const STATUS_LABELS = { activo: 'Activo', pausado: 'Pausado', terminado: 'Terminado' } as const

export function CombatsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const combats = useLiveQuery(() => combatRepo.list(), [])
  const [name, setName] = useState('')

  if (combats === undefined) return <p className="muted">Cargando…</p>

  async function create() {
    const combat = await combatRepo.create(name)
    setName('')
    onOpen(combat.id)
  }

  return (
    <section>
      <h1>Combate</h1>

      <div className="card">
        <TextField label="Nombre del nuevo combate" value={name} onChange={setName} placeholder="Frente norte" />
        <button className="btn" onClick={() => void create()}>
          Nuevo combate
        </button>
      </div>

      {combats.length === 0 ? (
        <p className="muted">Todavía no hay combates.</p>
      ) : (
        <ul className="list">
          {combats.map((c) => (
            <li key={c.id}>
              <button className="card row" onClick={() => onOpen(c.id)}>
                <span className="grow">
                  <span className="name">{c.name}</span>
                  <span className="muted small block">
                    {c.round === 0 ? 'Sin empezar' : `Ronda ${c.round}`} · {c.participants.length} participante(s)
                  </span>
                </span>
                <span className={c.status === 'activo' ? 'chip' : 'chip off'}>{STATUS_LABELS[c.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
