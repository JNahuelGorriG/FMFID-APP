import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { repo } from './data'
import { Section } from './Section'
import { statsFileName, statsReport } from './statsReport'

/** Exporta un txt con los stats de los personajes que se elijan. */
export function StatsExport() {
  const characters = useLiveQuery(() => repo.list({ includeRetired: true }), [])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [derived, setDerived] = useState(true)
  const [techniques, setTechniques] = useState(false)
  const [breakdown, setBreakdown] = useState(false)
  const [message, setMessage] = useState('')

  if (characters === undefined) return null

  const chosen = characters.filter((c) => selected.has(c.id))
  const options = { derived, techniques, breakdown }
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  function download() {
    if (chosen.length === 0) return setMessage('Elige al menos un personaje.')
    const text = statsReport(chosen, options)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = statsFileName(chosen)
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`Archivo ${link.download} generado con ${chosen.length} personaje(s).`)
  }

  async function copy() {
    if (chosen.length === 0) return setMessage('Elige al menos un personaje.')
    try {
      await navigator.clipboard.writeText(statsReport(chosen, options))
      setMessage('Stats copiados: ya los puedes pegar donde quieras.')
    } catch {
      setMessage('No se pudo copiar. Usa "Descargar .txt".')
    }
  }

  return (
    <Section title="Exportar stats (txt)">
      <p className="muted small">
        Elige uno o más personajes y descarga un archivo de texto con sus stats, para compartirlos o guardarlos.
      </p>
      {characters.length === 0 && <p className="muted small">Todavía no hay personajes.</p>}
      <div className="actions">
        <button className="btn secondary compact" onClick={() => setSelected(new Set(characters.filter((c) => !c.retired).map((c) => c.id)))}>
          Elegir a los activos
        </button>
        <button className="btn secondary compact" onClick={() => setSelected(new Set())}>
          Ninguno
        </button>
      </div>
      {characters.map((c) => (
        <label key={c.id} className="check">
          <input
            type="checkbox"
            aria-label={`Exportar ${c.name}`}
            checked={selected.has(c.id)}
            onChange={(e) => toggle(c.id, e.target.checked)}
          />
          {c.name}
          {c.playerName ? ` (${c.playerName})` : ''}
          {c.retired ? ' · retirado' : ''}
        </label>
      ))}
      <label className="check">
        <input type="checkbox" checked={derived} onChange={(e) => setDerived(e.target.checked)} />
        Incluir daño y defensas
      </label>
      <label className="check">
        <input type="checkbox" checked={techniques} onChange={(e) => setTechniques(e.target.checked)} />
        Incluir potenciaciones (Ki, Kyushu…)
      </label>
      <label className="check">
        <input type="checkbox" checked={breakdown} onChange={(e) => setBreakdown(e.target.checked)} />
        Incluir el desglose de cada stat
      </label>
      <div className="actions">
        <button className="btn" onClick={download}>
          Descargar .txt
        </button>
        <button className="btn secondary" onClick={() => void copy()}>
          Copiar
        </button>
      </div>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      {chosen.length > 0 && (
        <Section nested title="Vista previa" storageKey="Exportar stats: vista previa" defaultOpen={false}>
          <pre className="report-preview" aria-label="Vista previa del txt">
            {statsReport(chosen, options)}
          </pre>
        </Section>
      )}
    </Section>
  )
}
