// Esta prueba lee el archivo de estilos con las herramientas de Node (la app no carga los tipos de Node), por eso
// se le pide a TypeScript que no la revise. Se ejecuta igual con `npm test`.
// @ts-nocheck
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start) + 1)
}

/** Guardas del diseño: si alguien toca el CSS, estas reglas siguen valiendo. */
describe('colores alternados de las tarjetas y secciones', () => {
  it('toda tarjeta usa los dos colores por variables, y arranca en el rojo oscuro', () => {
    const card = rule('.card')
    expect(card).toContain('--card-bg: var(--section-a)')
    expect(card).toContain('background: var(--card-bg)')
    expect(card).toContain('border: 1px solid var(--card-line)')
  })

  it('las tarjetas pares, contando solo tarjetas, van en violeta oscuro', () => {
    const even = rule('.card:nth-child(even of .card)')
    expect(even).toContain('--card-bg: var(--section-b)')
    expect(even).toContain('--card-line: var(--section-b-line)')
  })

  it('en una lista, cada elemento alterna (impares rojo, pares violeta)', () => {
    expect(rule('.list > li:nth-child(odd) > .card')).toContain('var(--section-a)')
    expect(rule('.list > li:nth-child(even) > .card')).toContain('var(--section-b)')
  })

  it('una tarjeta dentro de otra no alterna: va más oscura', () => {
    expect(css).toContain('.card .card:nth-child(even of .card)')
    expect(css).toMatch(/\.card \.card,\s*\n\.card \.card:nth-child\(even of \.card\) \{[^}]*--card-bg: var\(--nested-bg\)/)
  })

  it('los colores son rojo oscuro y violeta oscuro', () => {
    expect(css).toMatch(/--section-a: #2a1519/)
    expect(css).toMatch(/--section-b: #1f1730/)
  })

  it('los estados especiales siguen pudiendo cambiar el borde (turno activo, avisos)', () => {
    expect(css).toContain('.participant.active { border-color: var(--accent); }')
    expect(css).toContain('.alerts { border-color: var(--accent-soft); }')
  })

  it('la primera columna fija de las tablas toma el color de su tarjeta', () => {
    expect(css).toMatch(/\.cmp tbody th \{[^}]*background: var\(--card-bg, var\(--card\)\)/)
  })
})
