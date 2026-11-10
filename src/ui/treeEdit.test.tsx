// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { emptyTree, purchaseNext, purchaseNode, treeOf } from '../rules'
import type { Character } from '../rules'
import { edward } from '../rules/fixtures'
import { doteRepo, repo } from './data'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

beforeEach(async () => {
  localStorage.clear()
  for (const table of [db.characters, db.changes, db.npcs, db.combats, db.settings, db.dotes]) await table.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Edward con Fuerza hasta el nodo 5 comprado: 4 de stat y una habilidad, como un jugador que no eligió dote. */
async function openTree(upTo: 'hab' | 'stats' = 'hab') {
  let c: Character = { ...edward, tree: { ...emptyTree(), bp: 100 } }
  for (let i = 0; i < 4; i++) c = purchaseNext(c, 'fuerza', 'stat')
  if (upTo === 'hab') c = purchaseNode(c, 'fuerza:1:4', 'hab')
  const { id: _a, createdAt: _b, updatedAt: _d, ...data } = c
  await repo.create(data)
  render(<App />)
  fireEvent.click(await screen.findByText('Edward'))
  fireEvent.click(await screen.findByText('Árbol de stats'))
  await screen.findByText('Árbol de Edward')
}
const card = (n: number) => Array.from(document.querySelectorAll<HTMLElement>('.card.node'))[n - 1]
const current = async () => (await repo.list())[0]
const purchaseOf = async (nodeId: string) => treeOf(await current()).purchases.find((p) => p.nodeId === nodeId)

describe('editar un nodo comprado del árbol', () => {
  it('los nodos comprados tienen un botón Editar y los demás no', async () => {
    await openTree()
    expect(within(card(5)).getByLabelText('Editar el nodo 5 de la etapa 1')).toBeTruthy()
    expect(within(card(1)).getByLabelText('Editar el nodo 1 de la etapa 1')).toBeTruthy()
    expect(within(card(6)).queryByText('Editar')).toBeNull() // el 6 está disponible, no comprado
    expect(card(5).textContent).toContain('Eligió: Habilidad') // como lo dejó el Excel
  })

  it('de habilidad a dote sin definir: queda como espacio libre y se puede completar después', async () => {
    await openTree()
    fireEvent.click(within(card(5)).getByLabelText('Editar el nodo 5 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Cambiar la elección del nodo 5 de la etapa 1'), { target: { value: 'dote' } })
    expect(screen.getByText(/Hoy suma: Habilidad\. Pasa a sumar: Dote\./)).toBeTruthy()
    expect(screen.getByText(/Para dejarlo sin definir, elige Dote y deja el nombre en blanco/)).toBeTruthy()
    fireEvent.click(screen.getByText('Guardar cambios del nodo'))

    await waitFor(async () => expect((await purchaseOf('fuerza:1:4'))?.choice).toBe('dote'))
    expect(treeOf(await current()).dotes).toEqual([{ id: 'fuerza:1:4', name: '', description: '', nodeId: 'fuerza:1:4' }])
    expect(card(5).textContent).toContain('Eligió: Dote')
    // el editor se cierra y aparece como espacio libre en las dotes del jugador
    await waitFor(() => expect(within(card(5)).queryByText('Guardar cambios del nodo')).toBeNull())
    expect(await screen.findByText(/Espacios libres \(1\):/)).toBeTruthy()
    const history = await db.changes.toArray()
    expect(history.some((h) => h.reason.includes('Fuerza etapa 1 nodo 5 · de Habilidad a Dote'))).toBe(true)
  })

  it('se puede elegir la dote del catálogo y queda vinculada', async () => {
    await doteRepo.create({ tier: 'D', name: 'Placaje de rugby', type: 'fuerza', use: 'Pasiva', description: '+2 al embestir.' })
    await openTree()
    fireEvent.click(within(card(5)).getByLabelText('Editar el nodo 5 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Cambiar la elección del nodo 5 de la etapa 1'), { target: { value: 'dote' } })
    const id = (await doteRepo.list())[0].id
    // en una edición no rige la escalera: se ofrecen todos los tiers
    fireEvent.change(await screen.findByLabelText('Dote del catálogo (editar)'), { target: { value: id } })
    fireEvent.click(screen.getByText('Guardar cambios del nodo'))
    await waitFor(async () => expect(treeOf(await current()).dotes[0]).toMatchObject({ name: 'Placaje de rugby', catalogId: id, description: '+2 al embestir.' }))
    expect((await purchaseOf('fuerza:1:4'))?.note).toBe('Placaje de rugby')
  })

  it('se puede cambiar solo el nombre de la habilidad', async () => {
    await openTree()
    fireEvent.click(within(card(5)).getByLabelText('Editar el nodo 5 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Nombre de la habilidad'), { target: { value: 'Ojo de lince' } })
    fireEvent.click(screen.getByText('Guardar cambios del nodo'))
    await waitFor(async () => expect((await purchaseOf('fuerza:1:4'))?.note).toBe('Ojo de lince'))
    expect((await purchaseOf('fuerza:1:4'))?.choice).toBe('hab')
    expect(await screen.findByText(/Eligió: Habilidad · Ojo de lince/)).toBeTruthy()
  })

  it('de dote a habilidad saca la dote de la lista', async () => {
    await openTree('stats')
    fireEvent.click(within(card(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    fireEvent.change(screen.getByLabelText('Nombre de la dote (opcional)'), { target: { value: 'Mía' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect(treeOf(await current()).dotes).toHaveLength(1))

    fireEvent.click(await within(card(5)).findByLabelText('Editar el nodo 5 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Cambiar la elección del nodo 5 de la etapa 1'), { target: { value: 'hab' } })
    fireEvent.click(screen.getByText('Guardar cambios del nodo'))
    await waitFor(async () => expect(treeOf(await current()).dotes).toHaveLength(0))
    expect((await purchaseOf('fuerza:1:4'))?.choice).toBe('hab')
  })

  it('de stat a energía ajusta el personaje solo y no toca los BP', async () => {
    await openTree()
    const before = await current()
    fireEvent.click(within(card(2)).getByLabelText('Editar el nodo 2 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Cambiar la elección del nodo 2 de la etapa 1'), { target: { value: 'energia' } })
    expect(screen.getByText(/Los stats, la energía y los MH se ajustan solos; los BP no cambian\./)).toBeTruthy()
    fireEvent.click(screen.getByText('Guardar cambios del nodo'))

    await waitFor(async () => expect((await purchaseOf('fuerza:1:1'))?.choice).toBe('energia'))
    const after = await current()
    expect(after.sources.fuerza.arbolHeroe).toBe(before.sources.fuerza.arbolHeroe - 2)
    expect(after.energy.bonusStamina).toBe(before.energy.bonusStamina + 25)
    expect(treeOf(after).bp).toBe(treeOf(before).bp)
  })

  it('cancelar la edición no cambia nada', async () => {
    await openTree()
    const before = await current()
    fireEvent.click(within(card(5)).getByLabelText('Editar el nodo 5 de la etapa 1'))
    fireEvent.change(await screen.findByLabelText('Cambiar la elección del nodo 5 de la etapa 1'), { target: { value: 'dote' } })
    fireEvent.click(within(card(5)).getByLabelText('Cancelar la edición del nodo 5 de la etapa 1'))
    await waitFor(() => expect(within(card(5)).queryByText('Guardar cambios del nodo')).toBeNull())
    expect(await current()).toEqual(before)
  })

  it('al abrir la edición muestra lo que ya estaba elegido', async () => {
    await openTree('stats')
    fireEvent.click(within(card(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    fireEvent.change(screen.getByLabelText('Nombre de la dote (opcional)'), { target: { value: 'Mía' } })
    fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Su descripción' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect(treeOf(await current()).dotes).toHaveLength(1))
    fireEvent.click(await within(card(5)).findByLabelText('Editar el nodo 5 de la etapa 1'))
    expect(((await screen.findByLabelText('Cambiar la elección del nodo 5 de la etapa 1')) as HTMLSelectElement).value).toBe('dote')
    expect((screen.getByLabelText('Nombre de la dote') as HTMLInputElement).value).toBe('Mía')
    expect((screen.getByLabelText('Descripción de la dote') as HTMLTextAreaElement).value).toBe('Su descripción')
  })
})
