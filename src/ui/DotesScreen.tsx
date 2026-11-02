import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, exportDotes, importDotes } from '../db'
import {
  DOTE_SORT_LABELS,
  DOTE_TIERS,
  DOTE_TYPES,
  USE_KIND_LABELS,
  USE_SUGGESTIONS,
  doteOwners,
  filterDotes,
  normalizeDoteName,
  ownedDotes,
  sortDotesBy,
  validateDote,
} from '../rules'
import type { CatalogDote, DoteFilter, DoteOwner, DoteSort, DoteTier, DoteType, NewDote, UseKind } from '../rules'
import type { ReferenceSheet } from '../db'
import { DoteInfo, TierChip } from './DoteParts'
import { doteRepo, repo, settingsRepo } from './data'
import { SelectField, TextAreaField, TextField } from './fields'
import { DOTE_TYPE_LABELS } from './format'
import { CollapseAll, Section } from './Section'

type View = 'stat' | 'jugador' | 'tabla'

const TYPE_OPTIONS = [
  { value: 'todos' as const, label: 'Todos los tipos' },
  ...DOTE_TYPES.map((t) => ({ value: t as DoteType | 'todos', label: DOTE_TYPE_LABELS[t] })),
]
const TIER_OPTIONS = [
  { value: 'todos' as const, label: 'Todos los tiers' },
  ...DOTE_TIERS.map((t) => ({ value: t as DoteTier | 'todos', label: `Tier ${t}` })),
]
const KIND_OPTIONS = [
  { value: 'todos' as const, label: 'Todos los usos' },
  ...(Object.keys(USE_KIND_LABELS) as UseKind[]).map((k) => ({ value: k as UseKind | 'todos', label: USE_KIND_LABELS[k] })),
]

const emptyDote = (type: DoteType): NewDote => ({ tier: 'E', name: '', type, use: 'Pasiva', description: '' })

/** El catálogo de dotes de la mesa: se cargan, se buscan y se miran por stat o en una tabla. */
export function DotesScreen() {
  const dotes = useLiveQuery(() => doteRepo.list(), [])
  const sheets = useLiveQuery(() => settingsRepo.getDoteSheets(), [])
  const characters = useLiveQuery(() => repo.list(), [])
  const [filter, setFilter] = useState<Required<DoteFilter>>({ query: '', type: 'todos', tier: 'todos', kind: 'todos', owner: 'todos' })
  const [sort, setSort] = useState<DoteSort>('tipo')
  const [view, setView] = useState<View>('stat')
  /** null = sin formulario; { id: null } = dote nueva. */
  const [editing, setEditing] = useState<{ id: string | null; type: DoteType } | null>(null)
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  if (dotes === undefined || characters === undefined) return <p className="muted">Cargando…</p>

  const owners = doteOwners(dotes, characters)
  const shown = sortDotesBy(filterDotes(dotes, filter, owners), sort)
  const ownersText = (d: CatalogDote): string | undefined => {
    const list: DoteOwner[] = owners.get(d.id) ?? []
    return list.length > 0 ? `La tienen: ${list.map((o) => o.name).join(', ')}` : undefined
  }
  const set = <K extends keyof typeof filter>(key: K, value: (typeof filter)[K]) => setFilter((f) => ({ ...f, [key]: value }))
  const editingDote = editing?.id ? (dotes.find((d) => d.id === editing.id) ?? null) : null

  async function download() {
    const file = await exportDotes(db)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fmfid-dotes-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`Se exportaron ${file.dotes.length} dotes.`)
  }

  async function load(file: File) {
    try {
      const r = await importDotes(db, JSON.parse(await file.text()))
      setMessage(
        `Dotes: ${r.added} nuevas, ${r.updated} actualizadas y ${r.unchanged} sin cambios${r.sheets > 0 ? `, y ${r.sheets} hoja(s) de reglas` : ''}.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    }
  }

  const types = DOTE_TYPES.filter((t) => shown.some((d) => d.type === t))

  return (
    <section>
      <h1>Dotes</h1>
      <p className="muted small">
        {shown.length === dotes.length ? `${dotes.length} dotes` : `${shown.length} de ${dotes.length} dotes`}
      </p>
      <CollapseAll />

      <Section title="Buscar y filtrar">
        <label className="field">
          <input
            type="search"
            aria-label="Buscar dote"
            placeholder="Nombre, uso o descripción…"
            value={filter.query}
            onChange={(e) => set('query', e.target.value)}
          />
        </label>
        <div className="grid-2">
          <SelectField label="Filtrar por tipo" value={filter.type} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
          <SelectField label="Filtrar por tier" value={filter.tier} options={TIER_OPTIONS} onChange={(v) => set('tier', v)} />
          <SelectField label="Filtrar por uso" value={filter.kind} options={KIND_OPTIONS} onChange={(v) => set('kind', v)} />
          <SelectField
            label="Filtrar por jugador"
            value={filter.owner}
            options={[
              { value: 'todos', label: 'Todos los jugadores' },
              ...characters.map((c) => ({ value: c.id, label: `${c.name}${c.playerName ? ` (${c.playerName})` : ''}` })),
              { value: 'nadie', label: 'Dotes que nadie tiene' },
            ]}
            onChange={(v) => set('owner', v)}
          />
        </div>
        <SelectField
          label="Ordenar por"
          value={sort}
          options={(Object.keys(DOTE_SORT_LABELS) as DoteSort[]).map((k) => ({ value: k, label: DOTE_SORT_LABELS[k] }))}
          onChange={setSort}
        />
        <div className="seg" role="group" aria-label="Cómo verlas">
          {(
            [
              ['stat', 'Por stat'],
              ['jugador', 'Por jugador'],
              ['tabla', 'Tabla'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={id === view ? 'tab active' : 'tab'} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </Section>

      <div className="actions">
        <button
          className="btn"
          onClick={() => setEditing({ id: null, type: filter.type === 'todos' ? 'fuerza' : filter.type })}
        >
          Nueva dote
        </button>
      </div>

      {editing && (
        <DoteForm
          key={editing.id ?? 'nueva'}
          dote={editingDote}
          defaultType={editing.type}
          all={dotes}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null)
            setMessage(text)
          }}
        />
      )}

      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}

      {dotes.length === 0 && (
        <div className="card">
          <p>Todavía no hay dotes.</p>
          <p className="muted small">
            Crea la primera con "Nueva dote" o importa el archivo de dotes en la sección "Importar y exportar", más abajo.
          </p>
        </div>
      )}
      {dotes.length > 0 && shown.length === 0 && <p className="muted small">Ninguna dote coincide con lo que buscas.</p>}

      {view === 'stat' &&
        types.map((type) => {
          const list = shown.filter((d) => d.type === type)
          return (
            <Section key={type} title={`${DOTE_TYPE_LABELS[type]} (${list.length})`} storageKey={`Dotes: ${type}`}>
              <ul className="dotes">
                {list.map((d) => (
                  <li key={d.id} className="dote-row">
                    <DoteInfo tier={d.tier} name={d.name} use={d.use} description={d.description} extra={ownersText(d)} />
                    <button
                      className="btn secondary compact"
                      aria-label={`Editar ${d.name}`}
                      onClick={() => setEditing({ id: d.id, type: d.type })}
                    >
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )
        })}

      {view === 'jugador' &&
        characters
          .filter((c) => filter.owner === 'todos' || filter.owner === c.id)
          .map((c) => {
            const mine = ownedDotes(c, dotes)
            const own = new Set(mine.flatMap((o) => (o.catalog ? [o.catalog.id] : [])))
            const list = shown.filter((d) => own.has(d.id))
            const unlinked = mine.filter((o) => !o.catalog).length
            if (list.length === 0 && unlinked === 0) return null
            return (
              <Section key={c.id} title={`${c.name} (${list.length})`} storageKey={`Dotes: jugador ${c.id}`}>
                {c.playerName && <p className="muted small">Jugador: {c.playerName}</p>}
                <ul className="dotes">
                  {list.map((d) => (
                    <li key={d.id} className="dote-row">
                      <DoteInfo tier={d.tier} name={d.name} use={d.use} description={d.description} type={d.type} />
                      <button className="btn secondary compact" aria-label={`Editar ${d.name}`} onClick={() => setEditing({ id: d.id, type: d.type })}>
                        Editar
                      </button>
                    </li>
                  ))}
                </ul>
                {list.length === 0 && <p className="muted small">Ninguna de sus dotes coincide con los filtros.</p>}
                {unlinked > 0 && (
                  <p className="muted small">
                    {unlinked} dote(s) sin vincular con el catálogo: se vinculan desde su árbol de stats.
                  </p>
                )}
              </Section>
            )
          })}

      {view === 'tabla' && shown.length > 0 && (
        <div className="card table-wrap" aria-label="Tabla de dotes">
          <table className="cmp ref">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Dote</th>
                <th>Tipo</th>
                <th>Uso</th>
                <th>Descripción</th>
                <th>La tienen</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id}>
                  <td>
                    <TierChip tier={d.tier} />
                  </td>
                  <td className="first">
                    <button className="link" aria-label={`Editar ${d.name}`} onClick={() => setEditing({ id: d.id, type: d.type })}>
                      {d.name}
                    </button>
                  </td>
                  <td>{DOTE_TYPE_LABELS[d.type]}</td>
                  <td>{d.use}</td>
                  <td className="dote-text">{d.description}</td>
                  <td>{(owners.get(d.id) ?? []).map((o) => o.name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Section title="Importar y exportar" defaultOpen={false}>
        <p className="muted small">
          Un archivo de dotes sirve para cargar muchas de una vez (por ejemplo, desde tu Word) o para pasarlas a otro
          dispositivo. Al importar, las dotes nuevas se agregan, las que ya estaban (mismo tipo y nombre) se actualizan y
          nunca se borra nada. Las dotes también forman parte del respaldo completo de Más.
        </p>
        <div className="actions">
          <button className="btn secondary" onClick={() => void download()}>
            Exportar dotes (.json)
          </button>
          <button className="btn secondary" onClick={() => fileInput.current?.click()}>
            Importar dotes
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Archivo de dotes"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void load(file)
            e.target.value = ''
          }}
        />
      </Section>

      {(sheets ?? []).map((sheet) => (
        <Section key={sheet.id} title={sheet.title} storageKey={`Dotes: ${sheet.id}`} defaultOpen={false}>
          <RulesSheet sheet={sheet} />
        </Section>
      ))}
    </section>
  )
}

/**
 * Una hoja de reglas como lista legible: cada fila con su título en negrita y su texto a continuación, todo
 * alineado a la izquierda y con saltos de línea (una tabla de texto largo no se puede leer en el teléfono).
 */
function RulesSheet({ sheet }: { sheet: ReferenceSheet }) {
  const head = sheet.header ? (sheet.rows[0] ?? []) : []
  const rows = sheet.header ? sheet.rows.slice(1) : sheet.rows
  const isTiers = sheet.id === 'dotes-escalera'
  const isLinks = sheet.id === 'dotes-sinergias'

  return (
    <div className="rules">
      {rows.map((row, i) => {
        const [first = '', second = '', ...rest] = row
        const title = isLinks ? `${first} · ${second}` : first
        const details = isLinks ? rest : [second, ...rest]
        const labels = isLinks ? head.slice(2) : head.slice(1)
        return (
          <div key={`${first}-${i}`} className="rule-row">
            <div className="rule-title">
              {isTiers && DOTE_TIERS.includes(first as DoteTier) && <TierChip tier={first as DoteTier} />}
              <strong>{isTiers ? '' : title}</strong>
            </div>
            {details.map((text, j) => {
              // con más de una columna de detalle, cada una lleva el nombre de su columna
              const label = details.length > 1 ? labels[j] : undefined
              return (
                <p key={j} className="small rule-text">
                  {label && <strong>{label}: </strong>}
                  {text}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

interface FormProps {
  /** La dote que se edita, o null si es nueva. */
  dote: CatalogDote | null
  defaultType: DoteType
  all: CatalogDote[]
  onClose: () => void
  onDone: (message: string) => void
}

/** Alta y edición de una dote: tier, nombre, tipo, uso y descripción. */
function DoteForm({ dote, defaultType, all, onClose, onDone }: FormProps) {
  const [draft, setDraft] = useState<NewDote>(
    dote ? { tier: dote.tier, name: dote.name, type: dote.type, use: dote.use, description: dote.description } : emptyDote(defaultType),
  )
  const [errors, setErrors] = useState<string[]>([])
  const set = <K extends keyof NewDote>(key: K, value: NewDote[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function save() {
    const problems = validateDote(draft)
    const clash = all.find(
      (d) => d.id !== dote?.id && d.type === draft.type && normalizeDoteName(d.name) === normalizeDoteName(draft.name),
    )
    if (clash) problems.push(`Ya hay una dote "${clash.name}" en ${DOTE_TYPE_LABELS[draft.type].toLowerCase()}.`)
    setErrors(problems)
    if (problems.length > 0) return
    if (dote) await doteRepo.update(dote.id, draft)
    else await doteRepo.create(draft)
    onDone(dote ? `Dote "${draft.name.trim()}" guardada.` : `Dote "${draft.name.trim()}" creada.`)
  }

  async function remove() {
    if (!dote) return
    if (!window.confirm(`¿Borrar la dote "${dote.name}"? Los personajes que ya la tienen conservan su texto.`)) return
    await doteRepo.remove(dote.id)
    onDone(`Dote "${dote.name}" borrada.`)
  }

  return (
    <Section title={dote ? 'Editar dote' : 'Nueva dote'} storageKey="Dotes: formulario">
      <div className="grid-2">
        <SelectField
          label="Tier"
          value={draft.tier}
          options={DOTE_TIERS.map((t) => ({ value: t, label: t }))}
          onChange={(v) => set('tier', v)}
        />
        <SelectField
          label="Tipo de dote"
          value={draft.type}
          options={DOTE_TYPES.map((t) => ({ value: t, label: DOTE_TYPE_LABELS[t] }))}
          onChange={(v) => set('type', v)}
        />
      </div>
      <TextField label="Nombre de la dote" value={draft.name} onChange={(v) => set('name', v)} />
      <label className="field">
        <span className="small muted">Uso</span>
        <input
          aria-label="Uso"
          list="usos-de-dotes"
          value={draft.use}
          placeholder="Pasiva, Reacción, 2 por batalla…"
          onChange={(e) => set('use', e.target.value)}
        />
        <datalist id="usos-de-dotes">
          {USE_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </label>
      <TextAreaField label="Descripción" value={draft.description} onChange={(v) => set('description', v)} />
      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button className="btn" onClick={() => void save()}>
          Guardar dote
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancelar
        </button>
        {dote && (
          <button className="btn danger" onClick={() => void remove()}>
            Borrar dote
          </button>
        )}
      </div>
    </Section>
  )
}
