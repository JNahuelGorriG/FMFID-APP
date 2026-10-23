import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, createRepository, deepEqual, diffPaths, getIn, setIn } from './index'
import { edward } from '../rules/fixtures'

describe('diferencias entre versiones', () => {
  it('detecta solo los datos que cambian', () => {
    const after = setIn(setIn(edward, 'sources.fuerza.entrenamiento', 60), 'name', 'Ed')
    expect(diffPaths(edward, after)).toEqual([
      { path: 'name', value: 'Ed' },
      { path: 'sources.fuerza.entrenamiento', value: 60 },
    ])
  })

  it('ignora id y fechas', () => {
    expect(diffPaths(edward, { ...edward, id: 'otro', updatedAt: 'x' })).toEqual([])
  })

  it('un nulo que pasa a objeto es un solo cambio', () => {
    const after = setIn(edward, 'derived.magicDamageWeapon', { kind: 'pequena', rankSteps: 0 })
    expect(diffPaths(edward, after)).toEqual([
      { path: 'derived.magicDamageWeapon', value: { kind: 'pequena', rankSteps: 0 } },
    ])
  })

  it('deepEqual compara objetos', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })

  it('claves opcionales ausentes', () => {
    expect(getIn(edward, 'derived.noExiste', true)).toBeUndefined()
    expect(() => getIn(edward, 'derived.noExiste')).toThrow()
    expect(setIn(edward, 'derived.nueva', 1, true).derived).toHaveProperty('nueva', 1)
    expect(() => setIn(edward, 'derived.nueva', 1)).toThrow()
  })
})

describe('aplicar varios cambios', () => {
  let repo: ReturnType<typeof createRepository>
  let db: AppDB
  const { id: _i, createdAt: _c, updatedAt: _u, ...data } = edward

  beforeEach(() => {
    db = new AppDB(`test-${crypto.randomUUID()}`)
    repo = createRepository(db)
  })

  it('guarda todo junto y registra un historial por dato con el mismo motivo', async () => {
    const c = await repo.create(data)
    const records = await repo.applyChanges(
      c.id,
      [
        { path: 'sources.fuerza.entrenamiento', value: 60 },
        { path: 'energy.bonusMana', value: 120 },
        { path: 'energy.bonusStamina', value: 165 },
      ],
      'Entrenamiento y árbol',
    )
    expect(records).toHaveLength(2)
    const saved = await repo.get(c.id)
    expect(saved?.sources.fuerza.entrenamiento).toBe(60)
    expect(saved?.energy.bonusMana).toBe(120)
    expect((await repo.history(c.id)).every((h) => h.reason === 'Entrenamiento y árbol')).toBe(true)
  })

  it('si un cambio falla, no se guarda ninguno', async () => {
    const c = await repo.create(data)
    await expect(
      repo.applyChanges(
        c.id,
        [
          { path: 'energy.bonusMana', value: 999 },
          { path: 'sources.nada.otros', value: 1 },
        ],
        'x',
      ),
    ).rejects.toThrow()
    expect((await repo.get(c.id))?.energy.bonusMana).toBe(110)
    expect(await repo.history(c.id)).toHaveLength(0)
  })

  it('puede crear las claves opcionales de defensa mágica y agilidad', async () => {
    const c = await repo.create({
      ...data,
      derived: { ...data.derived, magicDefenseWeights: undefined, agilityStat: undefined },
    })
    const { magicDefenseWeights: _w, agilityStat: _a, ...rest } = c.derived
    await db.characters.put({ ...c, derived: rest })
    const records = await repo.applyChanges(
      c.id,
      [
        { path: 'derived.agilityStat', value: 'fuerza' },
        { path: 'derived.magicDefenseWeights', value: { constitucion: 0.3, sabiduria: 0.7 } },
      ],
      'x',
    )
    expect(records).toHaveLength(2)
    expect((await repo.get(c.id))?.derived.agilityStat).toBe('fuerza')
  })

  it('no hace nada si no cambia nada', async () => {
    const c = await repo.create(data)
    expect(await repo.applyChanges(c.id, [{ path: 'name', value: 'Edward' }], 'x')).toEqual([])
    expect(await repo.history(c.id)).toHaveLength(0)
  })
})
