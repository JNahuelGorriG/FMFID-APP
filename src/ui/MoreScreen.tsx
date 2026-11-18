import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { ALL_FROM_EXCEL, db, exportBackup, importBackup, importFromExcel, previewExcel } from '../db'
import type { ExcelMode, ExcelPreview, ExcelSelection } from '../db'
import { isZip, readImportFile } from '../excel/loadFile'
import { SKILL_TYPE_ID } from '../rules'
import { PICKABLE_TARGETS, SPIRIT_TYPE_ID, TECHNIQUES } from '../rules'
import type { EffectType, TechniqueTarget, Techniques } from '../rules'
import { settingsRepo } from './data'
import { SelectField, TextField } from './fields'
import { TARGET_LABELS } from './format'
import { CollapseAll, Section } from './Section'
import { StatsExport } from './StatsExport'

function EffectTypesEditor() {
  const saved = useLiveQuery(() => settingsRepo.getEffectTypes(), [])
  const [draft, setDraft] = useState<EffectType[] | null>(null)
  const [status, setStatus] = useState('')
  const types = draft ?? saved
  if (!types) return null

  const edit = (next: EffectType[]) => {
    setDraft(next)
    setStatus('')
  }

  async function save() {
    try {
      await settingsRepo.saveEffectTypes(types as EffectType[])
      setDraft(null)
      setStatus('Tipos guardados.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo guardar.')
    }
  }

  return (
    <Section title="Tipos de buff">
      <p className="muted small">
        Se usan en buffs y debuffs. Los tipos Habilidad y Espíritu tienen reglas especiales y no se pueden quitar.
      </p>
      {types.map((t, i) => (
        <div key={t.id} className="row">
          <div className="grow">
            <TextField
              label={`Tipo ${i + 1}`}
              value={t.name}
              onChange={(name) => edit(types.map((x) => (x.id === t.id ? { ...x, name } : x)))}
            />
          </div>
          {t.id !== SKILL_TYPE_ID && t.id !== SPIRIT_TYPE_ID && (
            <button
              className="icon-btn"
              aria-label={`Quitar ${t.name}`}
              onClick={() => edit(types.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="actions">
        <button
          className="btn secondary"
          onClick={() => edit([...types, { id: `tipo-${crypto.randomUUID().slice(0, 8)}`, name: 'Nuevo tipo' }])}
        >
          Agregar tipo
        </button>
        <button className="btn" onClick={() => void save()}>
          Guardar tipos
        </button>
      </div>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
    </Section>
  )
}

const TECHNIQUE_TARGET_OPTIONS: { value: TechniqueTarget; label: string }[] = [
  { value: 'preguntar', label: 'Preguntar cada vez' },
  { value: 'ofensivo', label: 'Stat ofensivo (Fuerza o Destreza)' },
  ...PICKABLE_TARGETS.map((t) => ({ value: t as TechniqueTarget, label: TARGET_LABELS[t] })),
]

function TechniqueTargetsEditor() {
  const saved = useLiveQuery(() => settingsRepo.getTechniqueTargets(), [])
  const [draft, setDraft] = useState<Record<keyof Techniques, TechniqueTarget> | null>(null)
  const [status, setStatus] = useState('')
  const targets = draft ?? saved
  if (!targets) return null

  return (
    <Section title="Potenciaciones: a qué suman">
      <p className="muted small">
        Un mismo poder puede servir para cosas distintas: por defecto se pregunta a qué stat suma en
        cada uso. Si una potenciación casi siempre va al mismo, puedes dejarlo preelegido acá.
      </p>
      {TECHNIQUES.map((t) => (
        <SelectField
          key={t.key}
          label={t.name}
          value={targets[t.key]}
          options={TECHNIQUE_TARGET_OPTIONS}
          onChange={(v) => {
            setDraft({ ...targets, [t.key]: v })
            setStatus('')
          }}
        />
      ))}
      <button
        className="btn"
        onClick={async () => {
          await settingsRepo.saveTechniqueTargets(targets)
          setDraft(null)
          setStatus('Guardado.')
        }}
      >
        Guardar
      </button>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
    </Section>
  )
}

const MODE_OPTIONS: { value: ExcelMode; label: string }[] = [
  { value: 'no', label: 'No tocar' },
  { value: 'nuevos', label: 'Solo agregar los nuevos' },
  { value: 'todo', label: 'Agregar y actualizar los existentes' },
]

function ExcelPanel({
  pending,
  selection,
  setSelection,
  onApply,
  onCancel,
}: {
  pending: { preview: ExcelPreview; name: string; problems: number }
  selection: ExcelSelection
  setSelection: (s: ExcelSelection) => void
  onApply: () => void
  onCancel: () => void
}) {
  const { preview } = pending
  return (
    <div className="card" aria-label="Qué actualizar">
      <p>
        <strong>{pending.name}</strong>
      </p>
      <p className="muted small">Elige qué se actualiza. Lo que dejes en "No tocar" queda exactamente como está en la app.</p>
      <SelectField
        label={`Personajes (${preview.characters.total} en el archivo, ${preview.characters.nuevos} nuevos)`}
        value={selection.characters}
        options={MODE_OPTIONS}
        onChange={(v) => setSelection({ ...selection, characters: v })}
      />
      <SelectField
        label={`NPCs (${preview.npcs.total} en el archivo, ${preview.npcs.nuevos} nuevos)`}
        value={selection.npcs}
        options={MODE_OPTIONS}
        onChange={(v) => setSelection({ ...selection, npcs: v })}
      />
      {preview.prices && (
        <label className="check">
          <input type="checkbox" checked={selection.prices} onChange={(e) => setSelection({ ...selection, prices: e.target.checked })} />
          Reemplazar las tablas de precios
        </label>
      )}
      {pending.problems > 0 && (
        <p className="muted small">El Excel tiene {pending.problems} diferencias de cálculo con la app en los personajes.</p>
      )}
      <div className="actions">
        <button className="btn" onClick={onApply}>
          Aplicar
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function MoreScreen({ onOpenTables }: { onOpenTables: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  async function handleExport() {
    const backup = await exportBackup(db)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fmfid-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`Respaldo exportado: ${backup.characters.length} personajes.`)
  }

  const importMode = useRef<'completo' | 'excel'>('completo')
  const [pending, setPending] = useState<{ data: unknown; preview: ExcelPreview; name: string; problems: number } | null>(null)
  const [selection, setSelection] = useState<ExcelSelection>(ALL_FROM_EXCEL)

  async function handleImport(file: File, mode: 'completo' | 'excel') {
    try {
      if (mode === 'completo') {
        const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer())
        if (isZip(bytes)) {
          setMessage('Ese archivo es un Excel. Usa "Actualizar desde el Excel" para cargarlo.')
          return
        }
        const ok = window.confirm(
          'Importar reemplaza TODOS los datos de este dispositivo (personajes, NPCs, combates y ajustes) por los del archivo. ¿Continuar?',
        )
        if (!ok) return
        await importBackup(db, JSON.parse(await file.text()))
        setMessage('Respaldo importado.')
        return
      }
      // Actualizar desde el Excel: primero se lee y se muestra qué trae; recién ahí se elige qué aplicar.
      const { data, problems } = await readImportFile(file)
      const preview = await previewExcel(db, data)
      setSelection({
        characters: preview.characters.total > 0 ? 'todo' : 'no',
        npcs: preview.npcs.total > 0 ? 'todo' : 'no',
        prices: preview.prices,
      })
      setPending({ data, preview, name: file.name, problems })
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    }
  }

  async function applyExcel() {
    if (!pending) return
    try {
      const r = await importFromExcel(db, pending.data, selection)
      const parts: string[] = []
      if (selection.characters !== 'no') parts.push(`personajes: ${r.newCharacters} nuevos, ${r.characters - r.newCharacters} actualizados`)
      if (selection.npcs !== 'no') parts.push(`NPCs: ${r.newNpcs} nuevos, ${r.npcs - r.newNpcs} actualizados`)
      if (r.referenceSheets) parts.push('precios reemplazados')
      setMessage(parts.length > 0 ? `Listo. ${parts.join(' · ')}.` : 'No elegiste nada para actualizar.')
      setPending(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    }
  }

  function pickFile(mode: 'completo' | 'excel') {
    importMode.current = mode
    fileInput.current?.click()
  }

  return (
    <section>
      <h1>Más</h1>
      <CollapseAll />

      <Section title="Tablas de la mesa">
        <p className="muted small">
          Éxitos, daños, rangos, equipo, entrenamiento, precios y la comparativa entre jugadores.
        </p>
        <button className="btn" onClick={onOpenTables}>
          Ver tablas
        </button>
      </Section>

      <StatsExport />

      <Section title="Respaldo">
        <p className="muted small">
          Los datos viven solo en este dispositivo. Exporta un respaldo de vez en cuando.
          "Actualizar desde el Excel" lee tu archivo .xlsx directamente, te muestra qué trae y tú eliges qué
          actualizar (personajes, NPCs, precios). Tus combates y el historial no se tocan.
        </p>
        <div className="actions">
          <button className="btn" onClick={handleExport}>
            Exportar respaldo
          </button>
          <button className="btn secondary" onClick={() => pickFile('completo')}>
            Importar respaldo completo
          </button>
          <button className="btn secondary" onClick={() => pickFile('excel')}>
            Actualizar desde el Excel
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xlsm,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file, importMode.current)
            e.target.value = ''
          }}
        />
        {pending && <ExcelPanel pending={pending} selection={selection} setSelection={setSelection} onApply={() => void applyExcel()} onCancel={() => setPending(null)} />}
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
      </Section>
      <EffectTypesEditor />
      <TechniqueTargetsEditor />
    </section>
  )
}
