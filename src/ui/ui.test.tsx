// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { db } from '../db'
import { edward } from '../rules/fixtures'
import { repo } from './data'

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(async () => {
  localStorage.clear()
  await db.characters.clear()
  await db.changes.clear()
})
afterEach(() => cleanup())

describe('app', () => {
  it('sin personajes invita a importar', async () => {
    render(<App />)
    expect(await screen.findByText('Todavía no hay personajes.')).toBeTruthy()
  })

  it('lista personajes con su rango y oculta los retirados', async () => {
    await repo.create(edwardData)
    await repo.create({ ...edwardData, name: 'Ciro', retired: true })
    render(<App />)
    expect(await screen.findByText('Edward')).toBeTruthy()
    expect(screen.getByText('C+')).toBeTruthy()
    expect(screen.queryByText('Ciro')).toBeNull()

    fireEvent.click(screen.getByLabelText('Mostrar retirados'))
    expect(await screen.findByText('Ciro')).toBeTruthy()
  })

  it('la ficha muestra los 7 stats a la vez con sus totales', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))

    const stats = await screen.findByLabelText('Stats')
    for (const label of ['Fuerza', 'Destreza', 'Constitución', 'Percepción', 'Inteligencia', 'Sabiduría', 'Carisma']) {
      expect(stats.textContent).toContain(label)
    }
    expect(stats.textContent).toContain('357,1')
    expect(stats.textContent).toContain('447,6')
    expect(screen.getByText('840')).toBeTruthy()
    expect(screen.getByText('2.290')).toBeTruthy()
  })

  it('la navegación se oculta y recuerda la preferencia', async () => {
    const { container } = render(<App />)
    const nav = container.querySelector('nav')!
    expect(nav.className).toBe('nav')

    fireEvent.click(screen.getByLabelText('Ocultar navegación'))
    expect(nav.className).toBe('nav hidden')
    expect(localStorage.getItem('fmfid-nav-open')).toBe('false')
  })

  it('cambia de sección desde la barra', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Combate' })).toBeTruthy())
    fireEvent.click(screen.getByText('Más'))
    await waitFor(() => expect(screen.getByText('Exportar respaldo')).toBeTruthy())
  })
})
