// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { DotePicker } from './DoteParts'
import { db, loadUniqueDotes } from '../db'
import { UNIQUE_DOTES } from '../rules'
import type { CatalogDote } from '../rules'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

beforeEach(async () => {
  localStorage.clear()
  await db.dotes.clear()
})
afterEach(() => cleanup())

const catalog: CatalogDote[] = UNIQUE_DOTES.map((d, i) => ({ ...d, id: `u${i}`, createdAt: '', updatedAt: '' }))

describe('dotes únicas en la app', () => {
  it('el selector arranca en la categoría del personaje pero deja elegir cualquier otra', () => {
    render(<DotePicker branch="categoria" character={{ name: 'Edward' }} catalog={catalog} count={0} value="" onSelect={() => {}} />)
    const cat = screen.getByLabelText('Dote del catálogo · categoría') as HTMLSelectElement
    expect(cat.value).toBe('Tanque')
    expect(screen.getByText(/Remiendos/)).toBeTruthy()
    expect(screen.queryByText(/Sacrificio energético/)).toBeNull()

    fireEvent.change(cat, { target: { value: 'todas' } })
    expect(screen.getByText(/Sacrificio energético/)).toBeTruthy()
    fireEvent.change(cat, { target: { value: 'Healer' } })
    expect(screen.getByText(/Triage/)).toBeTruthy()
  })

  it('sin personaje conocido se ven todas las únicas', () => {
    render(<DotePicker branch="categoria" character={{ name: 'Nadie', className: 'Mago' }} catalog={catalog} count={0} value="" onSelect={() => {}} />)
    expect((screen.getByLabelText('Dote del catálogo · categoría') as HTMLSelectElement).value).toBe('todas')
  })

  it('la pestaña Dotes carga las 126 con un botón y las muestra por categoría', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Dotes'))
    fireEvent.click(await screen.findByText('Cargar las dotes únicas'))
    await waitFor(async () => expect(await db.dotes.count()).toBe(126))
    expect(await screen.findByRole('heading', { name: 'Dotes únicas (126)' })).toBeTruthy()
    expect(screen.getAllByText(/Guerrero de Fuerza · Conrad \(18\)/).length).toBeGreaterThan(0)
    const r = await loadUniqueDotes(db)
    expect(r.unchanged).toBe(126)
  })
})
