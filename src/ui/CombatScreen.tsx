import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { orderedParticipants } from '../rules'
import { combatRepo } from './data'
import { AddView } from './combat/AddView'
import { AttackView } from './combat/AttackView'
import { ChecksView } from './combat/ChecksView'
import { CompareView } from './combat/CompareView'
import { TurnsView } from './combat/TurnsView'
import { useProfiles } from './useProfiles'

interface Props {
  id: string
  onBack: () => void
  onOpenParticipant: (participantId: string) => void
  onDeleted: () => void
}

type Section = 'turnos' | 'agregar' | 'comparar' | 'checks' | 'ataque'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'turnos', label: 'Turnos' },
  { id: 'agregar', label: 'Agregar' },
  { id: 'comparar', label: 'Comparar' },
  { id: 'checks', label: 'Checks' },
  { id: 'ataque', label: 'Ataque' },
]

export function CombatScreen({ id, onBack, onOpenParticipant, onDeleted }: Props) {
  const combat = useLiveQuery(() => combatRepo.get(id), [id])
  const profiles = useProfiles(combat)
  const [section, setSection] = useState<Section>('turnos')

  if (combat === undefined || profiles === undefined) return <p className="muted">Cargando…</p>

  const active = orderedParticipants(combat.participants).find((p) => p.id === combat.activeId)

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a los combates">
          ←
        </button>
        <h1 className="tight grow">{combat.name}</h1>
      </header>

      <p className="muted small">
        {combat.round === 0 ? 'Sin empezar' : `Ronda ${combat.round}`}
        {active ? ` · Turno de ${active.name}` : ''}
      </p>

      <nav className="tabs" aria-label="Secciones del combate">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={s.id === section ? 'tab active' : 'tab'}
            onClick={() => setSection(s.id)}
            aria-current={s.id === section ? 'page' : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'turnos' && (
        <TurnsView
          combat={combat}
          onOpenParticipant={onOpenParticipant}
          onDeleted={() => {
            void combatRepo.remove(id).then(onDeleted)
          }}
        />
      )}
      {section === 'agregar' && <AddView combat={combat} />}
      {section === 'comparar' && <CompareView profiles={profiles} />}
      {section === 'checks' && <ChecksView profiles={profiles} />}
      {section === 'ataque' && <AttackView combat={combat} profiles={profiles} />}
    </section>
  )
}
