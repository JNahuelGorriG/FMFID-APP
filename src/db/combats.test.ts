import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AppDB,
  createCombatRepository,
  createRepository,
  createSettingsRepository,
  exportBackup,
  importBackup,
} from './index'
import {
  DEFAULT_EFFECT_TYPES,
  addNpcParticipant,
  addPcParticipant,
  advanceTurn,
  defaultEnemyProfile,
  startCombat,
} from '../rules'
import type { Effect } from '../rules'
import { edward } from '../rules/fixtures'

let db: AppDB
let combats: ReturnType<typeof createCombatRepository>
const { id: _i, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(() => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  combats = createCombatRepository(db)
})

describe('combates', () => {
  it('crea varios combates con nombre y los lista', async () => {
    await combats.create('Frente norte')
    await combats.create('Aldea')
    expect((await combats.list()).map((c) => c.name).sort()).toEqual(['Aldea', 'Frente norte'])
  })

  it('un jugador en dos combates comparte el mismo estado vivo', async () => {
    const char = await createRepository(db).create(edwardData)
    const a = await combats.create('A')
    const b = await combats.create('B')
    for (const c of [a, b]) {
      await combats.update(c.id, (w) => ({ ...w, combat: addPcParticipant(w.combat, char, 10) }))
    }

    // en el combate A le bajan la vida
    await combats.update(a.id, (w) => ({
      ...w,
      states: { ...w.states, [char.id]: { ...w.states[char.id], health: { leve: 1, medio: 1, letal: 1 } } },
    }))

    const inB = await combats.loadWorld(b.id)
    expect(inB?.states[char.id].health).toEqual({ leve: 1, medio: 1, letal: 1 })
  })

  it('crea el estado inicial del jugador si no existía', async () => {
    const char = await createRepository(db).create(edwardData)
    const c = await combats.create('A')
    await combats.update(c.id, (w) => ({ ...w, combat: addPcParticipant(w.combat, char, 5) }))
    const saved = await db.characterStates.get(char.id)
    expect(saved?.health).toEqual(edward.baseHealth)
    expect((saved?.mana.natural ?? 0) + (saved?.mana.renovable ?? 0)).toBe(840)
  })

  it('guarda el avance de turnos y rondas', async () => {
    const c = await combats.create('A')
    await combats.update(c.id, (w) => ({
      ...w,
      combat: addNpcParticipant(addNpcParticipant(w.combat, { name: 'G1', profile: defaultEnemyProfile('D') }, 10), { name: 'G2', profile: defaultEnemyProfile('D') }, 5),
    }))
    await combats.update(c.id, (w) => startCombat(w))
    await combats.update(c.id, (w) => advanceTurn(w, { tickDurations: true }))
    const w = await combats.loadWorld(c.id)
    expect(w?.combat.round).toBe(1)
    expect(w?.combat.participants.find((p) => p.id === w.combat.activeId)?.name).toBe('G2')
  })

  it('al borrar un combate, sus efectos pasan a manuales', async () => {
    const char = await createRepository(db).create(edwardData)
    const c = await combats.create('A')
    await combats.update(c.id, (w) => ({ ...w, combat: addPcParticipant(w.combat, char, 5) }))
    const effect: Effect = {
      id: 'e1', kind: 'buff', name: 'Furia', typeId: 'estado', target: 'fuerza', flat: 10, percent: 0,
      duration: { unit: 'turnos', remaining: 3 }, combatId: c.id, createdAt: '2026-01-01T00:00:00Z',
    }
    await combats.update(c.id, (w) => ({
      ...w,
      states: { ...w.states, [char.id]: { ...w.states[char.id], effects: [effect] } },
    }))

    await combats.remove(c.id)
    expect(await combats.loadWorld(c.id)).toBeUndefined()
    expect((await db.characterStates.get(char.id))?.effects[0].combatId).toBeNull()
  })

  it('un combate inexistente falla al actualizar', async () => {
    await expect(combats.update('nada', (w) => w)).rejects.toThrow()
  })
})

describe('tipos de buff', () => {
  it('devuelve los de fábrica y guarda los editados', async () => {
    const settings = createSettingsRepository(db)
    expect(await settings.getEffectTypes()).toEqual(DEFAULT_EFFECT_TYPES)
    await settings.saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'bendicion', name: 'Aumento por bendición' }])
    expect((await settings.getEffectTypes()).at(-1)?.id).toBe('bendicion')
  })

  it('no deja quitar "habilidad" ni nombres vacíos', async () => {
    const settings = createSettingsRepository(db)
    await expect(settings.saveEffectTypes(DEFAULT_EFFECT_TYPES.filter((t) => t.id !== 'habilidad'))).rejects.toThrow()
    await expect(settings.saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'x', name: ' ' }])).rejects.toThrow()
  })
})

describe('respaldo completo', () => {
  it('exporta e importa combates, estados y ajustes', async () => {
    const char = await createRepository(db).create(edwardData)
    const c = await combats.create('Frente')
    await combats.update(c.id, (w) => ({ ...w, combat: addPcParticipant(w.combat, char, 5) }))
    await createSettingsRepository(db).saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'x', name: 'Otro' }])

    const backup = await exportBackup(db)
    const other = new AppDB(`test-${crypto.randomUUID()}`)
    await importBackup(other, JSON.parse(JSON.stringify(backup)))

    expect(await other.combats.count()).toBe(1)
    expect(await other.characterStates.count()).toBe(1)
    expect((await createSettingsRepository(other).getEffectTypes()).at(-1)?.id).toBe('x')
  })
})
