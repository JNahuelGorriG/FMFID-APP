import { useState } from 'react'
import { STAT_NAMES } from '../../rules'
import type { Profile } from '../../rules'
import { STAT_LABELS, SIDE_LABELS, fmt } from '../format'
import { PickParticipants } from './PickParticipants'

type Row = { label: string; values: (number | string)[]; numeric: boolean }

export function CompareView({ profiles }: { profiles: Profile[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(profiles.map((p) => p.participantId)))
  const shown = profiles.filter((p) => selected.has(p.participantId))

  const rows: Row[] = [
    { label: 'Bando', values: shown.map((p) => SIDE_LABELS[p.side]), numeric: false },
    { label: 'Rango', values: shown.map((p) => p.rankName ?? '—'), numeric: false },
    { label: 'Vida', values: shown.map((p) => p.health), numeric: false },
    ...STAT_NAMES.map((s) => ({ label: STAT_LABELS[s], values: shown.map((p) => p.stats[s]), numeric: true })),
    { label: 'Daño físico', values: shown.map((p) => p.damage.fisico), numeric: true },
    { label: 'Daño mágico', values: shown.map((p) => p.damage.magico), numeric: true },
    { label: 'Def. física CA', values: shown.map((p) => p.defense.fisico.ca), numeric: true },
    { label: 'Def. física SA', values: shown.map((p) => p.defense.fisico.sa), numeric: true },
    { label: 'Def. mágica CA', values: shown.map((p) => p.defense.magico.ca), numeric: true },
    { label: 'Def. mágica SA', values: shown.map((p) => p.defense.magico.sa), numeric: true },
  ]

  return (
    <>
      <PickParticipants
        title="Quiénes se comparan"
        profiles={profiles}
        selected={selected}
        onChange={setSelected}
      />

      {shown.length === 0 ? (
        <p className="muted small">Elige al menos un combatiente.</p>
      ) : (
        <div className="card table-wrap" aria-label="Tabla comparativa">
          <table className="cmp">
            <thead>
              <tr>
                <th />
                {shown.map((p) => (
                  <th key={p.participantId}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const nums = row.numeric ? (row.values as number[]) : []
                const max = Math.max(...nums)
                const min = Math.min(...nums)
                return (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((v, i) => {
                      const cls =
                        row.numeric && shown.length > 1 && max !== min
                          ? v === max
                            ? 'max'
                            : v === min
                              ? 'min'
                              : ''
                          : ''
                      return (
                        <td key={shown[i].participantId} className={cls}>
                          {typeof v === 'number' ? fmt(v) : v}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted small">El valor más alto de cada fila va resaltado y el más bajo, atenuado.</p>
        </div>
      )}
    </>
  )
}
