import { useRef, useState } from 'react'
import { db, exportBackup, importBackup } from '../db'

export function MoreScreen() {
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
    </section>
  )
}
