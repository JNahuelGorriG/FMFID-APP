// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CollapseAll, Section } from './Section'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const details = (title: string): HTMLDetailsElement =>
  screen.getByText(title, { selector: 'h2' }).closest('details') as HTMLDetailsElement

describe('Section', () => {
  it('arranca abierta, salvo que se pida lo contrario', () => {
    render(
      <>
        <Section title="Vida">contenido</Section>
        <Section title="Historial" defaultOpen={false}>
          contenido
        </Section>
      </>,
    )
    expect(details('Vida').open).toBe(true)
    expect(details('Historial').open).toBe(false)
  })

  it('se retrae al tocar el título y se vuelve a abrir', async () => {
    render(<Section title="Vida">contenido</Section>)
    fireEvent.click(screen.getByText('Vida'))
    // el navegador alterna "open" y avisa con el evento toggle
    const d = details('Vida')
    d.open = false
    fireEvent(d, new Event('toggle'))
    await waitFor(() => expect(details('Vida').open).toBe(false))
    d.open = true
    fireEvent(d, new Event('toggle'))
    await waitFor(() => expect(details('Vida').open).toBe(true))
  })

  it('recuerda cómo la dejaste aunque se cierre y vuelva a abrir la pantalla', async () => {
    const first = render(<Section title="Armadura">contenido</Section>)
    const d = details('Armadura')
    d.open = false
    fireEvent(d, new Event('toggle'))
    await waitFor(() => expect(localStorage.getItem('fmfid-section:Armadura')).toBe('0'))
    first.unmount()

    render(<Section title="Armadura">contenido</Section>)
    expect(details('Armadura').open).toBe(false)
  })

  it('cada sección recuerda lo suyo: una cerrada no cierra a las otras', async () => {
    render(
      <>
        <Section title="Vida">a</Section>
        <Section title="Barreras">b</Section>
      </>,
    )
    const d = details('Vida')
    d.open = false
    fireEvent(d, new Event('toggle'))
    await waitFor(() => expect(localStorage.getItem('fmfid-section:Vida')).toBe('0'))
    expect(details('Barreras').open).toBe(true)
    expect(localStorage.getItem('fmfid-section:Barreras')).toBeNull()
  })

  it('las secciones seguidas son hermanas del mismo tipo, así alternan de color solas', () => {
    render(
      <div data-testid="pantalla">
        <Section title="Uno">a</Section>
        <p>un párrafo en el medio</p>
        <Section title="Dos">b</Section>
        <Section title="Tres">c</Section>
      </div>,
    )
    const sections = Array.from(screen.getByTestId('pantalla').querySelectorAll(':scope > details.section'))
    expect(sections).toHaveLength(3)
    // el párrafo no cuenta: Uno y Tres son impares y Dos es par entre las secciones
    expect(sections.map((s) => (s.querySelector('h2') as HTMLElement).textContent)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('una sección anidada se marca aparte para que no alterne', () => {
    render(
      <Section title="Buffs">
        <Section nested title="Agregar a mano">
          x
        </Section>
      </Section>,
    )
    expect(details('Agregar a mano').className).toContain('nested-section')
    expect(details('Buffs').className).not.toContain('nested-section')
  })

  it('mantiene el nombre accesible que se le da', () => {
    render(
      <Section title="Espíritu" aria-label="Espíritu">
        x
      </Section>,
    )
    expect(screen.getByLabelText('Espíritu').tagName).toBe('DETAILS')
  })

  it('"Contraer todo" y "Expandir todo" cierran y abren todas las secciones', async () => {
    render(
      <>
        <CollapseAll />
        <Section title="Vida">a</Section>
        <Section title="Barreras">
          b
          <Section nested title="Interna">
            c
          </Section>
        </Section>
      </>,
    )
    fireEvent.click(screen.getByText('Contraer todo'))
    await waitFor(() => {
      expect(details('Vida').open).toBe(false)
      expect(details('Barreras').open).toBe(false)
      expect(details('Interna').open).toBe(false)
    })
    fireEvent.click(screen.getByText('Expandir todo'))
    await waitFor(() => {
      expect(details('Vida').open).toBe(true)
      expect(details('Barreras').open).toBe(true)
    })
  })
})
