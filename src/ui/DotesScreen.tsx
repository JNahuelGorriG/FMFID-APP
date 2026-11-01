import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, exportDotes, importDotes } from '../db'
import {
  DOTE_TIERS,
  DOTE_TYPES,
  USE_KIND_LABELS,
  USE_SUGGESTIONS,
  filterDotes,
  normalizeDoteName,
  validateDote,
} from '../rules'
import type { CatalogDote, DoteFilter, DoteTier, DoteType, NewDote, UseKind } from '../rules'
import { DoteInfo, TierChip } from './DoteParts'
import { doteRepo, settingsRepo } from './data'
import { SelectField, TextAreaField, TextField } from './fields'
import { DOTE_TYPE_LABELS } from './format'
import { CollapseAll, Section } from './Section'
import { DataTable } from './TablesScreen'

type View = 'stat' | 'tabla'

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
  const [filter, setFilter] = useState<Required<DoteFilter>>({ query: '', type: 'todos', tier: 'todos', kind: 'todos' })
  const [view, setView] = useState<View>('stat')
  /** null = sin formulario; { id: null } = dote nueva. */
  const [editing, setEditing] = useState<{ id: string | null; type: DoteType } | null>(null)
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  if (dotes === undefined) return <p className="muted">Cargando…</p>

  const shown = filterDotes(dotes, filter)
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
        <div className="grid-3">
          <SelectField label="Filtrar por tipo" value={filter.type} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
          <SelectField label="Filtrar por tier" value={filter.tier} options={TIER_OPTIONS} onChange={(v) => set('tier', v)} />
          <SelectField label="Filtrar por uso" value={filter.kind} options={KIND_OPTIONS} onChange={(v) => set('kind', v)} />
        </div>
        <div className="seg" role="group" aria-label="Cómo verlas">
          {(
            [
              ['stat', 'Por stat'],
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
                    <DoteInfo tier={d.tier} name={d.name} use={d.use} description={d.description} />
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
          {sheet.header && sheet.rows.length > 0 ? (
            <DataTable head={sheet.rows[0]} rows={sheet.rows.slice(1)} />
          ) : (
            <DataTable head={[]} rows={sheet.rows} />
          )}
        </Section>
      ))}
    </section>
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
