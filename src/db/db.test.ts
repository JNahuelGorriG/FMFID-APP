import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, createRepository, exportBackup, getIn, importBackup, setIn } from './index'
import { edward } from '../rules/fixtures'

type Repo = ReturnType<typeof createRepository>

let db: AppDB
let repo: Repo

beforeEach(async () => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  repo = createRepository(db)
})

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

describe('rutas', () => {
  it('lee y escribe sin mutar el original', () => {
    const obj = { a: { b: { c: 1 } } }
    expect(getIn(obj, 'a.b.c')).toBe(1)
    const copy = setIn(obj, 'a.b.c', 2)
    expect(copy.a.b.c).toBe(2)
    expect(obj.a.b.c).toBe(1)
  })

  it('rechaza rutas inexistentes', () => {
    expect(() => getIn({ a: 1 }, 'a.b')).toThrow()
    expect(() => setIn({ a: 1 }, 'x.y', 3)).toThrow()
  })
})

describe('personajes', () => {
  it('crea y lee un personaje', async () => {
    const created = await repo.create(edwardData)
    const found = await repo.get(created.id)
    expect(found?.name).toBe('Edward')
    expect(found?.sources.fuerza.entrenamiento).toBe(50)
  })

  it('lista sin retirados por defecto y ordenada', async () => {
    await repo.create({ ...edwardData, name: 'Zeta' })
    await repo.create({ ...edwardData, name: 'Alfa' })
    await repo.create({ ...edwardData, name: 'Ciro', retired: true })
    expect((await repo.list()).map((c) => c.name)).toEqual(['Alfa', 'Zeta'])
    expect((await repo.list({ includeRetired: true })).map((c) => c.name)).toEqual([
      'Alfa', 'Ciro', 'Zeta',
    ])
  })

  it('cambia un dato y registra el historial', async () => {
    const c = await repo.create(edwardData)
    const record = await repo.setValue(c.id, 'sources.fuerza.entrenamiento', 60, 'Entrenó en el dojo')

    expect(record?.oldValue).toBe(50)
    expect(record?.newValue).toBe(60)
    expect((await repo.get(c.id))?.sources.fuerza.entrenamiento).toBe(60)

    const history = await repo.history(c.id)
    expect(history).toHaveLength(1)
    expect(history[0].path).toBe('sources.fuerza.entrenamiento')
    expect(history[0].reason).toBe('Entrenó en el dojo')
  })

  it('no registra nada si el valor no cambia', async () => {
    const c = await repo.create(edwardData)
    expect(await repo.setValue(c.id, 'energy.bonusMana', 110, 'igual')).toBeNull()
    expect(await repo.history(c.id)).toHaveLength(0)
  })

  it('rechaza rutas inválidas y personajes inexistentes sin tocar nada', async () => {
    const c = await repo.create(edwardData)
    await expect(repo.setValue(c.id, 'sources.nada.otros', 1, 'x')).rejects.toThrow()
    await expect(repo.setValue('no-existe', 'energy.bonusMana', 1, 'x')).rejects.toThrow()
    expect(await repo.history(c.id)).toHaveLength(0)
  })

  it('el historial viene del más nuevo al más viejo', async () => {
    const c = await repo.create(edwardData)
    await repo.setValue(c.id, 'energy.bonusMana', 120, 'a')
    await new Promise((r) => setTimeout(r, 5))
    await repo.setValue(c.id, 'energy.bonusMana', 130, 'b')
    expect((await repo.history(c.id)).map((h) => h.reason)).toEqual(['b', 'a'])
  })

  it('al borrar un personaje se borra su historial', async () => {
    const c = await repo.create(edwardData)
    await repo.setValue(c.id, 'energy.bonusMana', 120, 'a')
    await repo.remove(c.id)
    expect(await repo.get(c.id)).toBeUndefined()
    expect(await db.changes.count()).toBe(0)
  })
})

describe('respaldo', () => {
  it('exporta e importa en otra base', async () => {
    const c = await repo.create(edwardData)
    await repo.setValue(c.id, 'energy.bonusMana', 120, 'a')
    const backup = await exportBackup(db)

    const otherDb = new AppDB(`test-${crypto.randomUUID()}`)
    await importBackup(otherDb, JSON.parse(JSON.stringify(backup)))

    expect(await otherDb.characters.count()).toBe(1)
    expect((await otherDb.characters.get(c.id))?.energy.bonusMana).toBe(120)
    expect(await otherDb.changes.count()).toBe(1)
  })

  it('importar reemplaza lo que había', async () => {
    await repo.create({ ...edwardData, name: 'Viejo' })
    const other = new AppDB(`test-${crypto.randomUUID()}`)
    await createRepository(other).create({ ...edwardData, name: 'Nuevo' })
    await importBackup(db, await exportBackup(other))
    expect((await repo.list()).map((x) => x.name)).toEqual(['Nuevo'])
  })

  it('rechaza archivos inválidos sin borrar nada', async () => {
    await repo.create(edwardData)
    await expect(importBackup(db, { hola: 1 })).rejects.toThrow()
    await expect(importBackup(db, null)).rejects.toThrow()
    expect(await db.characters.count()).toBe(1)
  })

  it('rechaza respaldos de una versión más nueva', async () => {
    const backup = await exportBackup(db)
    await expect(importBackup(db, { ...backup, version: 99 })).rejects.toThrow()
  })
})
