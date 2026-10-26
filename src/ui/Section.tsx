import { useState } from 'react'
import type { HTMLAttributes, ReactNode, Ref } from 'react'

const PREFIX = 'fmfid-section:'

/** Si la sección estaba abierta o cerrada la última vez (se recuerda en el dispositivo). */
function readOpen(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(PREFIX + key)
    return saved === null ? fallback : saved === '1'
  } catch {
    return fallback
  }
}

function writeOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(PREFIX + key, open ? '1' : '0')
  } catch {
    // sin almacenamiento: la sección simplemente no recuerda su estado
  }
}

interface Props extends Omit<HTMLAttributes<HTMLDetailsElement>, 'title' | 'onToggle'> {
  title: ReactNode
  /** Con qué nombre se recuerda si está abierta. Por defecto, su título. */
  storageKey?: string
  /** Abierta la primera vez. */
  defaultOpen?: boolean
  /** Una sección dentro de otra: no alterna de color. */
  nested?: boolean
  ref?: Ref<HTMLDetailsElement>
}

/**
 * Sección retraíble de una pantalla. Se cierra tocando su título y recuerda cómo la dejaste. Las
 * secciones que están una tras otra alternan de color (rojo oscuro y violeta oscuro).
 */
export function Section({ title, storageKey, defaultOpen = true, nested = false, className, children, ref, ...rest }: Props) {
  const key = storageKey ?? (typeof title === 'string' ? title : 'seccion')
  const [open, setOpen] = useState(() => readOpen(key, defaultOpen))
  const classes = ['card', 'section', nested ? 'nested-section' : '', className ?? ''].filter(Boolean).join(' ')

  return (
    <details
      ref={ref}
      {...rest}
      className={classes}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        // Al aparecer, el navegador avisa del estado inicial: si no cambió, no hay nada que recordar.
        if (next === open) return
        setOpen(next)
        writeOpen(key, next)
      }}
    >
      <summary>
        <h2>{title}</h2>
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

/** Botones para cerrar o abrir de una vez todas las secciones que hay en pantalla. */
export function CollapseAll() {
  const setAll = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>('details.section').forEach((d) => {
      d.open = open
    })
  return (
    <div className="collapse-all">
      <button className="btn secondary compact" onClick={() => setAll(false)}>
        Contraer todo
      </button>
      <button className="btn secondary compact" onClick={() => setAll(true)}>
        Expandir todo
      </button>
    </div>
  )
}
