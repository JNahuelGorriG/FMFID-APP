import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, exportBackup, importBackup } from '../db'
import { SKILL_TYPE_ID } from '../rules'
import type { EffectType } from '../rules'
import { settingsRepo } from './data'
import { TextField } from './fields'

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
    <div className="card">
      <h2>Tipos de buff</h2>
      <p className="muted small">
        Se usan en buffs y debuffs. El tipo de habilidad tiene reglas especiales y no se puede quitar.
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
          {t.id !== SKILL_TYPE_ID && (
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

  async function handleImport(file: File) {
    const ok = window.confirm(
      'Importar reemplaza todos los datos de este dispositivo por los del archivo. ¿Continuar?',
    )
    if (!ok) return
    try {
      await importBackup(db, JSON.parse(await file.text()))
      setMessage('Respaldo importado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    }
  }

  return (
    <section>
      <h1>Más</h1>

      <div className="card">
        <h2>Tablas de la mesa</h2>
        <p className="muted small">
          Éxitos, daños, rangos, equipo, entrenamiento, precios y la comparativa entre jugadores.
        </p>
        <button className="btn" onClick={onOpenTables}>
          Ver tablas
        </button>
      </div>

      <div className="card">
        <h2>Respaldo</h2>
        <p className="muted small">
          Los datos viven solo en este teléfono. Exporta un respaldo de vez en cuando.
        </p>
        <div className="actions">
          <button className="btn" onClick={handleExport}>
            Exportar respaldo
          </button>
          <button className="btn secondary" onClick={() => fileInput.current?.click()}>
            Importar respaldo
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
            e.target.value = ''
          }}
        />
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
      </div>
      <EffectTypesEditor />
    </section>
  )
}
