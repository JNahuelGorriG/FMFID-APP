import type { Profile, Side } from '../../rules'
import { SIDE_LABELS } from '../format'
import { Section } from '../Section'

interface Props {
  title: string
  profiles: Profile[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  /** Participante que no se puede elegir (por ejemplo, quien lanza el check). */
  exclude?: string
}

const PRESETS: { label: string; sides: Side[] }[] = [
  { label: 'Todos', sides: ['jugador', 'aliado', 'enemigo'] },
  { label: 'Jugadores', sides: ['jugador'] },
  { label: 'Aliados', sides: ['aliado'] },
  { label: 'Enemigos', sides: ['enemigo'] },
  { label: 'Jugadores y aliados', sides: ['jugador', 'aliado'] },
]

/** Selector de combatientes: atajos por bando y casillas individuales. */
export function PickParticipants({ title, profiles, selected, onChange, exclude }: Props) {
  const pool = profiles.filter((p) => p.participantId !== exclude)

  const apply = (sides: Side[]) =>
    onChange(new Set(pool.filter((p) => sides.includes(p.side)).map((p) => p.participantId)))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <Section title={title}>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.label} className="btn secondary compact" onClick={() => apply(p.sides)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="picks">
        {pool.map((p) => (
          <label key={p.participantId} className="check">
            <input
              type="checkbox"
              checked={selected.has(p.participantId)}
              onChange={() => toggle(p.participantId)}
            />
            {p.name} <span className="muted small">({SIDE_LABELS[p.side]})</span>
          </label>
        ))}
      </div>
    </Section>
  )
}
