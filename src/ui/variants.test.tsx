// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NpcScreen } from './NpcScreen'
import { db } from '../db'
import { defaultEnemyProfile, newNpcTemplate } from '../rules'
import { npcRepo } from './data'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

beforeEach(async () => {
  for (const t of [db.npcs]) await t.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('variantes en el bestiario', () => {
  it('une bestias sueltas como variantes de una sola', async () => {
    const mk = (name: string) => npcRepo.create({ ...newNpcTemplate('bestia'), name, combat: defaultEnemyProfile('E') })
    const base = await mk('Anti Esper')
    await mk('Anti Esper Tanque')
    await mk('Anti Esper Mágico')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<NpcScreen id={base.id} onBack={() => {}} onEdit={() => {}} />)
    fireEvent.click(await screen.findByText('Unir otras bestias como variantes'))
    fireEvent.click(await screen.findByLabelText('Anti Esper Tanque'))
    fireEvent.click(screen.getByLabelText('Anti Esper Mágico'))
    fireEvent.click(screen.getByText('Unir seleccionadas'))

    await waitFor(async () => expect(await npcRepo.list('', 'bestia')).toHaveLength(1))
    const [one] = await npcRepo.list('', 'bestia')
    expect(one.variants?.map((v) => v.label)).toEqual(['Base', 'Mágico', 'Tanque'])
    expect(await screen.findByRole('button', { name: 'Tanque' })).toBeTruthy()
  })
})
