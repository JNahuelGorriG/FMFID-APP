// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { combatRepo, npcRepo } from './data'
import { defaultEnemyProfile, groupAlive, newNpcTemplate } from '../rules'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

beforeEach(async () => {
  localStorage.clear()
  await db.characters.clear()
  await db.npcs.clear()
  await db.combats.clear()
})
afterEach(() => cleanup())

const goTo = (tab: string) => fireEvent.click(within(screen.getByLabelText('Secciones del combate')).getByText(tab))
const current = async () => (await combatRepo.list())[0].participants[0].npc!

describe('manadas en el combate', () => {
  it('se arma una manada, se baja uno a mano, se baja el rango hasta el piso y se daña a varios', async () => {
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Goblin', rank: 'C+', combat: defaultEnemyProfile('C+') })
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    fireEvent.change(await screen.findByLabelText('Nombre del nuevo combate'), { target: { value: 'Emboscada' } })
    fireEvent.click(screen.getByText('Nuevo combate'))
    await screen.findByRole('heading', { name: 'Emboscada' })

    goTo('Agregar')
    fireEvent.click(await screen.findByRole('option', { name: /Goblin/ }))
    fireEvent.click(await screen.findByLabelText(/Llevarlos como una manada/))
    fireEvent.change(screen.getByLabelText('Enemigos en el grupo'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Vida de cada enemigo'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Agregar el grupo al combate'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants).toHaveLength(1)
    })
    let npc = await current()
    expect([npc.hpMax, npc.hpCurrent, npc.group?.size, npc.group?.rankFloor]).toEqual([20, 20, 4, 'D+'])

    goTo('Turnos')
    expect(await screen.findByText(/Quedan 4 de 4/)).toBeTruthy()
    fireEvent.click(document.querySelector('.participant .name') as Element)

    fireEvent.click(await screen.findByText('Cae uno'))
    await waitFor(async () => expect(groupAlive(await current())).toBe(3))
    expect((await current()).hpCurrent).toBe(15)

    fireEvent.click(screen.getByText('Bajar un rango'))
    await waitFor(async () => expect((await current()).profile.rank).toBe('C'))
    fireEvent.click(screen.getByText('Bajar un rango'))
    await waitFor(async () => expect((await current()).profile.rank).toBe('D+'))
    expect(await screen.findByText(/Ya está en el piso/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Daño por golpe'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Enemigos alcanzados'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Aplicar 6 de daño'))
    await waitFor(async () => expect((await current()).hpCurrent).toBe(9))
    npc = await current()
    expect(groupAlive(npc)).toBe(2)
  })
})
