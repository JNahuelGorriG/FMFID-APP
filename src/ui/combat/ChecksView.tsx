import { useState } from 'react'
import { STAT_NAMES, statCheck } from '../../rules'
import type { Profile, StatName } from '../../rules'
import { OptionalNumberField, SelectField } from '../fields'
import { LEVEL_LABELS, OUTCOME_LABELS, SIDE_LABELS, STAT_LABELS, fmt, rangeText } from '../format'
import { PickParticipants } from './PickParticipants'

const STAT_OPTIONS = STAT_NAMES.map((s) => ({ value: s, label: STAT_LABELS[s] }))

export function ChecksView({ profiles }: { profiles: Profile[] }) {
  const [sourceId, setSourceId] = useState(profiles[0]?.participantId ?? '')
  const [sourceStat, setSourceStat] = useState<StatName>('carisma')
  const [sameStat, setSameStat] = useState(true)
  const [targetStat, setTargetStat] = useState<StatName>('carisma')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(profiles.filter((p) => p.participantId !== profiles[0]?.participantId).map((p) => p.participantId)),
  )
  const [d20, setD20] = useState<number | undefined>(undefined)
  const [roller, setRoller] = useState<'source' | 'target'>('source')

  const source = profiles.find((p) => p.participantId === sourceId) ?? profiles[0]
  if (!source) return <p className="muted small">Agrega participantes para hacer checks.</p>

  const targets = profiles.filter((p) => p.participantId !== source.participantId && selected.has(p.participantId))
  const against = sameStat ? sourceStat : targetStat
  const rolled = d20 !== undefined && Number.isInteger(d20) && d20 >= 1 && d20 <= 20 ? d20 : undefined
  const rows = statCheck(source, sourceStat, targets, against, rolled, roller)

  return (
    <>
      <div className="card">
        <h2>Quién tira</h2>
        <SelectField
          label="Combatiente"
          value={source.participantId}
          options={profiles.map((p) => ({ value: p.participantId, label: p.name }))}
          onChange={(id) => {
            setSourceId(id)
            setSelected((prev) => {
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          }}
        />
        <div className="grid-2">
          <SelectField label="Su stat" value={sourceStat} options={STAT_OPTIONS} onChange={setSourceStat} />
          {!sameStat && (
            <SelectField label="Stat de los demás" value={targetStat} options={STAT_OPTIONS} onChange={setTargetStat} />
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={sameStat} onChange={(e) => setSameStat(e.target.checked)} />
          Contra el mismo stat de los demás
        </label>
        <p className="small">
          {source.name} · {STAT_LABELS[sourceStat]}: <strong>{fmt(source.stats[sourceStat])}</strong>
        </p>
        <SelectField
          label="Quién tira el d20"
          value={roller}
          options={[
            { value: 'source' as const, label: 'Quien lanza el check' },
            { value: 'target' as const, label: 'Cada afectado' },
          ]}
          onChange={setRoller}
        />
        <OptionalNumberField label="Tirada (d20, opcional)" value={d20} onChange={setD20} />
      </div>

      <PickParticipants
        title="Contra quiénes"
        profiles={profiles}
        selected={selected}
        onChange={setSelected}
        exclude={source.participantId}
      />

      {rows.length === 0 ? (
        <p className="muted small">Elige al menos un combatiente.</p>
      ) : (
        <div aria-label="Resultados del check">
          {rows.map((r) => (
            <div key={r.participantId} className="card">
              <div className="row">
                <span className="grow">
                  <span className="name">{r.name}</span>
                  <span className="muted small block">
                    {SIDE_LABELS[r.side]} · {STAT_LABELS[against]} {fmt(r.targetValue)}
                  </span>
                </span>
                <span className="chip">{LEVEL_LABELS[roller === 'source' ? r.level : r.inverseLevel]}</span>
              </div>
              <p className="small">
                Diferencia {r.difference >= 0 ? '+' : ''}
                {fmt(r.difference)} · {source.name} tira con <strong>{LEVEL_LABELS[r.level]}</strong> · {r.name} tira con{' '}
                <strong>{LEVEL_LABELS[r.inverseLevel]}</strong>
              </p>
              {r.ranges ? (
                <p className="small muted">
                  {r.ranges.map((x) => `${OUTCOME_LABELS[x.outcome]} ${rangeText(x.range)}`).join(' · ')}
                </p>
              ) : (
                <p className="small muted">Sin tirada: resultado automático.</p>
              )}
              {r.outcome && (
                <p className="result">
                  {roller === 'target' ? `Resultado de ${r.name}: ` : ''}
                  {OUTCOME_LABELS[r.outcome]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
