import { useState } from 'react'
import { allowedTiers, doteTypeOfBranch, ladderTier, sortDotes } from '../rules'
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
}: {
  tier?: DoteTier
  name: string
  use?: string
  description?: string
  type?: DoteType
}) {
  return (
    <div className="dote-info">
      <div className="dote-head">
        {tier && <TierChip tier={tier} />}
        <strong className="grow">{name || 'Sin nombre'}</strong>
      </div>
      {(type || use) && (
        <div className="small muted">
          {[type ? DOTE_TYPE_LABELS[type] : '', use ?? ''].filter(Boolean).join(' · ')}
        </div>
      )}
      {description && <p className="small dote-text">{description}</p>}
    </div>
  )
}

interface PickerProps {
  /** Rama del nodo: decide el tipo de dote y si rige la escalera de tiers. */
  branch: BranchId | string
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
  /** No avisa cuando no hay dotes de ese tipo en el catálogo. */
  quiet?: boolean
}

/**
 * Elige una dote del catálogo para una rama. En las ramas de stat se ofrecen las del tier que toca en la
 * escalera o de uno más bajo (se pueden mostrar todas); en Categoría, las únicas de cualquier tier.
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
}: PickerProps) {
  const [showAll, setShowAll] = useState(false)
  const type = doteTypeOfBranch(branch)
  const ladder = type !== null && type !== 'unico' && !ignoreLadder
  const allowed = ladder ? allowedTiers(count) : null

  const ofType = sortDotes(catalog.filter((d) => d.type === type))
  const offered = allowed && !showAll ? ofType.filter((d) => allowed.includes(d.tier) || d.id === value) : ofType
  const selected = catalog.find((d) => d.id === value) ?? null

  return (
    <div>
      {ladder && ofType.length > 0 && (
        <p className="muted small">
          Con {count} dote(s) de stat, te toca una de tier <strong>{ladderTier(count)}</strong> o inferior. Elegir una más
          baja no frena la escalera.
        </p>
      )}
      {ofType.length === 0 ? (
        quiet ? null : (
        <p className="muted small">
          No hay dotes de {type ? DOTE_TYPE_LABELS[type].toLowerCase() : 'este tipo'} en el catálogo. Escríbela a mano o cárgala en la
          pestaña Dotes.
        </p>
        )
      ) : (
        <>
          <SelectField
            label={label}
            value={value}
            options={[
              { value: '', label: 'Escribir a mano o decidir después' },
              ...offered.map((d) => ({ value: d.id, label: `${d.tier} · ${d.name} (${d.use || 'sin uso'})` })),
            ]}
            onChange={(id) => onSelect(catalog.find((d) => d.id === id) ?? null)}
          />
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
