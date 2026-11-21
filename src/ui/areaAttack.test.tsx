// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { combatRepo, repo } from './data'
import { addNpcParticipant, addPcParticipant, defaultEnemyProfile } from '../rules'
import { edward } from '../rules/fixtures'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(async () => {
  localStorage.clear()
  await db.characters.clear()
  await db.npcs.clear()
  await db.combats.clear()
})
afterEach(() => cleanup())

const life = (p: { pc: { health: { leve: number; medio: number; letal: number } } | null }) => {
  const h = p.pc!.health
  return h.leve + h.medio + h.letal
}

describe('ataque a varios objetivos', () => {
  it('un jefe ataca a dos jugadores y se aplica todo de una vez, con un solo deshacer', async () => {
    const a = await repo.create(edwardData)
    const b = await repo.create({ ...edwardData, name: 'Ciro' })
    const combat = await combatRepo.create('Jefe')
    await combatRepo.update(combat.id, (c) =>
      addPcParticipant(
        addPcParticipant(addNpcParticipant(c, { name: 'Behemoth', profile: defaultEnemyProfile('A') }, 5), a, 10),
        b,
        8,
      ),
    )
    const before = (await combatRepo.get(combat.id))!.participants.filter((p) => p.pc)

    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    fireEvent.click(await screen.findByText('Jefe'))
    fireEvent.click(await screen.findByText('Ataque'))
    fireEvent.click(await screen.findByText('Varios objetivos'))

    // ataca el Behemoth y los dos jugadores ya están elegidos
    expect(((await screen.findByLabelText('Objetivo Edward')) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Objetivo Ciro') as HTMLInputElement).checked).toBe(true)
    for (const box of screen.getAllByLabelText('Aplicar el daño sin depender del impacto')) fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('d8 de resistencia de Edward'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('d8 de resistencia de Ciro'), { target: { value: '3' } })

    // a Ciro además le baja un tier el daño
    fireEvent.click(screen.getByLabelText('Bajar un tier de daño a Ciro'))
    expect(await screen.findByText(/Aplicar a 2 objetivo/)).toBeTruthy()
    fireEvent.click(screen.getByText('Aplicar a 2 objetivo(s)'))

    await waitFor(async () => {
      const now = (await combatRepo.get(combat.id))!.participants.filter((p) => p.pc)
      expect(life(now[0])).toBeLessThan(life(before[0]))
      expect(life(now[1])).toBeLessThanOrEqual(life(before[1]))
    })
    const after = (await combatRepo.get(combat.id))!
    expect(after.history).toHaveLength(1)
    expect(after.history[0].also).toHaveLength(1)

    fireEvent.click(await screen.findByText('Deshacer última acción'))
    await waitFor(async () => {
      const restored = (await combatRepo.get(combat.id))!.participants.filter((p) => p.pc)
      expect(restored.map(life)).toEqual(before.map(life))
    })
    expect(within(document.body).queryByText('Última acción:')).toBeNull()
  })

  it('un objetivo: el botón baja un tier de daño y el aviso lo cuenta', async () => {
    const a = await repo.create(edwardData)
    const combat = await combatRepo.create('Duelo')
    await combatRepo.update(combat.id, (c) =>
      addPcParticipant(addNpcParticipant(c, { name: 'Behemoth', profile: defaultEnemyProfile('S') }, 5), a, 10),
    )
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    fireEvent.click(await screen.findByText('Duelo'))
    fireEvent.click(await screen.findByText('Ataque'))
    fireEvent.change(await screen.findByLabelText('Daño'), { target: { value: '100000' } })
    expect((await screen.findAllByText(/herida letal/i)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Bajar un tier de daño'))
    expect(await screen.findByText(/Daño bajado/)).toBeTruthy()
    fireEvent.click(screen.getByText('Sin bajar tier'))
    expect(await screen.findByText(/baja el tier del daño, úsala aquí/)).toBeTruthy()
  })
})
