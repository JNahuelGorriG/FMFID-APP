import { useState } from 'react'
import { DOTE_TYPES, allowedTiers, doteTypeOfBranch, ladderTier, sortDotes } from '../rules'
import type { BranchId, CatalogDote, DoteTier, DoteType } from '../rules'
import { SelectField } from './fields'
import { DOTE_TYPE_LABELS } from './format'

/** El tier de una dote, con su color. */
export function TierChip({ tier }: { tier: DoteTier }) {
  return (
    <span className={`tier-chip tier-${tier}`} aria-label={`Tier ${tier}`}>
      {tier}
    </span>
  )
}

/** Lo que dice una dote: tier, nombre, cómo se usa y qué hace. */
export function DoteInfo({
  tier,
  name,
  use,
  description,
  type,
  extra,
}: {
  tier?: DoteTier
  name: string
  use?: string
  description?: string
  type?: DoteType | null
  /** Una línea más debajo del nombre, por ejemplo quiénes la tienen. */
  extra?: string
}) {
  return (
    <div className="dote-info">
      <div className="dote-head">
        {tier && <TierChip tier={tier} />}
        <strong className="grow">{name || 'Sin nombre'}</strong>
      </div>
      {(type || use) && (
        <div className="small muted">{[type ? DOTE_TYPE_LABELS[type] : '', use ?? ''].filter(Boolean).join(' · ')}</div>
      )}
      {description && <p className="small dote-text">{description}</p>}
      {extra && <div className="small dote-extra">{extra}</div>}
    </div>
  )
}

interface PickerProps {
  /**
   * Rama del nodo. Solo **sugiere** un tipo de dote (la de su stat, o las únicas en Categoría): el tipo se puede
   * cambiar. Sin rama no se sugiere ninguno y se ven todas.
   */
  branch?: BranchId | string
  catalog: CatalogDote[]
  /** Cuántas dotes de stat tiene ya el jugador (para la escalera de tiers). */
  count: number
  value: string
  onSelect: (dote: CatalogDote | null) => void
  label?: string
  /** Sin la escalera: se ofrecen todos los tiers (para cambiar una dote ya elegida). */
  ignoreLadder?: boolean
  /** Muestra la ficha de la dote elegida debajo. */
  showPreview?: boolean
  /** No muestra nada si el catálogo está vacío. */
  quiet?: boolean
  /** Lo que dice la primera opción (la de no elegir ninguna). */
  emptyLabel?: string
}

/**
 * Elige una dote del catálogo. El tipo (stat o única) arranca en el que sugiere la rama pero lo elige quien
 * carga; se puede buscar por texto. La escalera de tiers ofrece las dotes de stat del tier que toca o de uno más
 * bajo, y se pueden mostrar todas.
 */
export function DotePicker({
  branch,
  catalog,
  count,
  value,
  onSelect,
  label = 'Dote del catálogo',
  ignoreLadder = false,
  showPreview = true,
  quiet = false,
  emptyLabel = 'Escribir a mano o decidir después',
}: PickerProps) {
  const suggested = branch ? doteTypeOfBranch(branch) : null
  const [type, setType] = useState<DoteType | 'todos'>(suggested ?? 'todos')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (quiet && catalog.length === 0) return null

  const ladder = !ignoreLadder && type !== 'unico'
  const allowed = ladder ? allowedTiers(count) : null
  const text = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = text(query).trim()

  const ofType = sortDotes(catalog.filter((d) => type === 'todos' || d.type === type))
  const matching = q === '' ? ofType : ofType.filter((d) => [d.name, d.use, d.description].some((f) => text(f).includes(q)))
  const offered =
    allowed && !showAll ? matching.filter((d) => d.type === 'unico' || allowed.includes(d.tier) || d.id === value) : matching
  const selected = catalog.find((d) => d.id === value) ?? null

  return (
    <div>
      <SelectField
        label={`${label} · tipo`}
        value={type}
        options={[
          { value: 'todos', label: 'Todos los tipos' },
          ...DOTE_TYPES.map((t) => ({ value: t, label: `${DOTE_TYPE_LABELS[t]}${t === suggested ? ' (sugerido)' : ''}` })),
        ]}
        onChange={(t) => setType(t)}
      />
      <label className="field">
        <span className="small muted">Buscar</span>
        <input
          type="search"
          aria-label={`${label} · buscar`}
          placeholder="Nombre, uso o descripción…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {ladder && ofType.length > 0 && (
        <p className="muted small">
          Con {count} dote(s) de stat, te toca una de tier <strong>{ladderTier(count)}</strong> o inferior. Elegir una más
          baja no frena la escalera.
        </p>
      )}
      {ofType.length === 0 ? (
        <p className="muted small">
          No hay dotes {type === 'todos' ? '' : `de ${DOTE_TYPE_LABELS[type].toLowerCase()} `}en el catálogo. Escríbela a mano o
          cárgala en la pestaña Dotes.
        </p>
      ) : (
        <>
          <SelectField
            label={label}
            value={value}
            options={[
              { value: '', label: emptyLabel },
              ...offered.map((d) => ({
                value: d.id,
                label: `${d.tier} · ${d.name}${type === 'todos' ? ` [${DOTE_TYPE_LABELS[d.type]}]` : ''} (${d.use || 'sin uso'})`,
              })),
            ]}
            onChange={(id) => onSelect(catalog.find((d) => d.id === id) ?? null)}
          />
          {offered.length === 0 && <p className="muted small">Ninguna dote coincide: prueba con otro tipo o con la casilla de todos los tiers.</p>}
          {ladder && (
            <label className="check">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Mostrar las dotes de todos los tiers
            </label>
          )}
        </>
      )}
      {showPreview && selected && (
        <div className="dote-preview" aria-label="Dote elegida">
          <DoteInfo tier={selected.tier} name={selected.name} use={selected.use} description={selected.description} />
        </div>
      )}
    </div>
  )
}
