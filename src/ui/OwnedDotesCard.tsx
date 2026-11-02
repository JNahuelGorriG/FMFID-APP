import { useState } from 'react'
import { doteTypeOfNode, isFreeSlot, matchDote, sortBySlot } from '../rules'
import type { CatalogDote, Dote } from '../rules'
import { DoteInfo, DotePicker } from './DoteParts'
import { TextAreaField, TextField } from './fields'
import { slotLabel } from './format'
import { Section } from './Section'

interface Props {
  dotes: Dote[]
  setDotes: (dotes: Dote[]) => void
  catalog: CatalogDote[]
  /** Cuántas dotes de stat tiene el jugador (para la escalera de tiers). */
  count: number
  onSave: () => void
  onMessage: (message: string) => void
}

/** La dote con los datos de la del catálogo; sin dote, la deja suelta del catálogo con el texto que tenía. */
function withCatalog(d: Dote, picked: CatalogDote | null): Dote {
  if (picked) return { ...d, catalogId: picked.id, name: picked.name, description: picked.description }
  const { catalogId: _removed, ...manual } = d
  return manual
}

/**
 * Las dotes de un jugador, en el orden del árbol y cada una con su espacio (de qué rama, etapa y nodo es). El tipo
 * de dote que se ofrece en cada una lo elige quien carga; la rama solo lo sugiere. Para no tener que buscar la caja
 * de cada dote, se puede elegir una del catálogo y la app la pone en un espacio libre.
 */
export function OwnedDotesCard({ dotes, setDotes, catalog, count, onSave, onMessage }: Props) {
  const [changing, setChanging] = useState<string[]>([])
  const byId = new Map(catalog.map((d) => [d.id, d]))
  const isLinked = (d: Dote) => !!d.catalogId && byId.has(d.catalogId)
  const sorted = sortBySlot(dotes)
  const free = sorted.filter(isFreeSlot)
  const update = (id: string, change: (d: Dote) => Dote) => setDotes(dotes.map((d) => (d.id === id ? change(d) : d)))

  /** Pone una dote del catálogo en un espacio libre: prefiere uno de su mismo stat y si no, el primero. */
  function assign(picked: CatalogDote | null) {
    if (!picked) return
    if (free.length === 0) {
      onMessage('No hay espacios libres para dotes: el jugador tiene que comprar un nodo "Dote o Hab" en el árbol.')
      return
    }
    const target = free.find((d) => doteTypeOfNode(d.nodeId) === picked.type) ?? free[0]
    const matches = doteTypeOfNode(target.nodeId) === picked.type
    setDotes(dotes.map((d) => (d.id === target.id ? withCatalog(d, picked) : d)))
    onMessage(
      `"${picked.name}" se puso en el espacio ${slotLabel(target.nodeId)}${matches ? '' : ' (no había uno libre de su stat)'}. Falta guardar.`,
    )
  }

  /** Empareja por nombre las dotes escritas a mano con las del catálogo (ignora tildes, mayúsculas y el "(E)"). */
  function linkAll() {
    let linked = 0
    const next = dotes.map((d) => {
      if (isLinked(d)) return d
      const found = matchDote(d.name, catalog, doteTypeOfNode(d.nodeId) ?? undefined)
      if (!found) return d
      linked++
      return withCatalog(d, found)
    })
    setDotes(next)
    const rest = next.filter((d) => !d.catalogId || !byId.has(d.catalogId)).length
    onMessage(
      linked === 0
        ? 'Ninguna dote coincide por nombre con el catálogo.'
        : `Se vincularon ${linked} dote(s) con el catálogo${rest > 0 ? ` y ${rest} quedaron sin coincidencia` : ''}. Falta guardar.`,
    )
  }

  return (
    <Section title="Dotes" className="spaced">
      {dotes.length === 0 && <p className="muted small">Todavía no hay dotes.</p>}

      {free.length > 0 && (
        <div className="free-slots">
          <p className="small">
            <strong>Espacios libres ({free.length}):</strong> {free.map((d) => slotLabel(d.nodeId)).join(' · ')}
          </p>
          <DotePicker
            catalog={catalog}
            count={count}
            ignoreLadder
            showPreview={false}
            quiet
            label="Poner una dote en un espacio libre"
            emptyLabel="Elegir una dote del catálogo…"
            value=""
            onSelect={assign}
          />
        </div>
      )}

      {sorted.map((d, i) => {
        const linked = isLinked(d) ? byId.get(d.catalogId as string) : undefined
        const open = !linked || changing.includes(d.id)
        return (
          <div key={d.id} className="ref slot">
            <h3 className="slot-title">
              Dote {i + 1} · {slotLabel(d.nodeId)}
            </h3>
            {linked ? (
              <div className="dote-preview" aria-label={`Dote ${i + 1}`}>
                <DoteInfo tier={linked.tier} name={linked.name} use={linked.use} description={linked.description} type={linked.type} />
              </div>
            ) : (
              <>
                <TextField
                  label={`Nombre de la dote ${i + 1}`}
                  value={d.name}
                  onChange={(name) => update(d.id, (x) => ({ ...x, name }))}
                  placeholder="Todavía sin elegir"
                />
                <TextAreaField
                  label={`Descripción de la dote ${i + 1}`}
                  value={d.description}
                  onChange={(description) => update(d.id, (x) => ({ ...x, description }))}
                />
              </>
            )}
            {linked && (
              <button
                className="btn secondary compact"
                aria-label={`${open ? 'Cerrar el selector de' : 'Cambiar'} la dote ${i + 1}`}
                onClick={() => setChanging(open ? changing.filter((x) => x !== d.id) : [...changing, d.id])}
              >
                {open ? 'Cerrar' : 'Cambiar dote'}
              </button>
            )}
            {open && (
              <DotePicker
                branch={d.nodeId.split(':')[0]}
                catalog={catalog}
                count={count}
                ignoreLadder
                showPreview={false}
                quiet
                label={`Dote ${i + 1} del catálogo`}
                value={linked ? linked.id : ''}
                onSelect={(picked) => update(d.id, (x) => withCatalog(x, picked))}
              />
            )}
          </div>
        )
      })}

      <div className="actions">
        {catalog.length > 0 && dotes.some((d) => !isLinked(d)) && (
          <button className="btn secondary" onClick={linkAll}>
            Vincular todo con el catálogo
          </button>
        )}
        {dotes.length > 0 && (
          <button className="btn secondary" onClick={onSave}>
            Guardar dotes
          </button>
        )}
      </div>
    </Section>
  )
}
