import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AppDB,
  BACKUP_VERSION,
  createDoteRepository,
  createRepository,
  createSettingsRepository,
  exportBackup,
  exportDotes,
  importBackup,
  importDotes,
  importFromExcel,
} from './index'
import type { DotesFile } from './index'
import type { NewDote } from '../rules'
import { edward } from '../rules/fixtures'

let db: AppDB
let repo: ReturnType<typeof createDoteRepository>

beforeEach(() => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  repo = createDoteRepository(db)
})

const chispa: NewDote = { tier: 'E', name: 'Chispa', type: 'inteligencia', use: 'Pasiva', description: '+1 al d20 al lanzar magia de maná.' }
const file = (dotes: unknown[], sheets?: unknown[]): unknown => ({ app: 'fmfid-app', kind: 'dotes', version: 1, exportedAt: '', dotes, sheets })

describe('catálogo de dotes', () => {
  it('crea, lee, guarda y borra', async () => {
    const dote = await repo.create({ ...chispa, name: '  Chispa  ' })
    expect(dote.name).toBe('Chispa')
    expect((await repo.get(dote.id))?.type).toBe('inteligencia')

    const updated = await repo.update(dote.id, { ...chispa, tier: 'D', use: 'Reacción, 2 por batalla' })
    expect(updated.id).toBe(dote.id)
    expect(updated.createdAt).toBe(dote.createdAt)
    expect((await repo.get(dote.id))?.tier).toBe('D')

    await repo.remove(dote.id)
    expect(await repo.get(dote.id)).toBeUndefined()
  })

  it('no guarda una dote sin nombre o con tier o tipo inventados', async () => {
    await expect(repo.create({ ...chispa, name: ' ' })).rejects.toThrow(/nombre/)
    await expect(repo.create({ ...chispa, tier: 'Z' as never })).rejects.toThrow()
    await expect(repo.create({ ...chispa, type: 'poder' as never })).rejects.toThrow()
    expect(await db.dotes.count()).toBe(0)
  })

  it('actualizar una dote que ya no existe avisa', async () => {
    await expect(repo.update('nada', chispa)).rejects.toThrow(/ya no existe/)
  })

  it('la lista viene por tipo, tier y nombre', async () => {
    await repo.create({ ...chispa, name: 'Z', type: 'carisma', tier: 'S' })
    await repo.create({ ...chispa, name: 'B', type: 'fuerza', tier: 'D' })
    await repo.create({ ...chispa, name: 'A', type: 'fuerza', tier: 'E' })
    await repo.create({ ...chispa, name: 'U', type: 'unico', tier: 'C' })
    expect((await repo.list()).map((d) => d.name)).toEqual(['A', 'B', 'Z', 'U'])
  })
})

describe('importar y exportar dotes', () => {
  it('suma los dotes de un archivo y cuenta lo que pasó', async () => {
    const result = await importDotes(db, file([chispa, { ...chispa, name: 'Otra', type: 'fuerza' }]))
    expect(result).toMatchObject({ added: 2, updated: 0, unchanged: 0, sheets: 0 })
    expect(await db.dotes.count()).toBe(2)
  })

  it('importar dos veces el mismo archivo no duplica nada', async () => {
    await importDotes(db, file([chispa]))
    const again = await importDotes(db, file([chispa]))
    expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 1 })
    expect(await db.dotes.count()).toBe(1)
  })

  it('actualiza lo que cambió, conserva su identidad y no borra lo que no viene en el archivo', async () => {
    const original = await repo.create(chispa)
    const keep = await repo.create({ ...chispa, name: 'Se queda', type: 'fuerza' })
    const result = await importDotes(db, file([{ ...chispa, description: 'otra descripción' }]))
    expect(result.updated).toBe(1)
    expect((await repo.get(original.id))?.description).toBe('otra descripción')
    expect(await repo.get(keep.id)).toBeDefined()
  })

  it('el uso y la descripción pueden faltar en el archivo', async () => {
    await importDotes(db, file([{ tier: 'E', name: 'Sin datos', type: 'fuerza' }]))
    const [dote] = await repo.list()
    expect([dote.use, dote.description]).toEqual(['', ''])
  })

  it('rechaza lo que no es una lista de dotes, sin tocar nada', async () => {
    await repo.create(chispa)
    await expect(importDotes(db, { app: 'otra' })).rejects.toThrow(/no es una lista de dotes/)
    await expect(importDotes(db, null)).rejects.toThrow()
    await expect(importDotes(db, { app: 'fmfid-app', kind: 'respaldo', dotes: [] })).rejects.toThrow()
    await expect(importDotes(db, file([{ name: 'x' }]))).rejects.toThrow(/incompleta/)
    await expect(importDotes(db, file([{ ...chispa, tier: 'Z' }]))).rejects.toThrow(/tier o un tipo/)
    await expect(importDotes(db, file([{ ...chispa, type: 'poder' }]))).rejects.toThrow(/tier o un tipo/)
    await expect(importDotes(db, file([chispa, { ...chispa, name: '   ' }]))).rejects.toThrow(/nombre/)
    expect(await db.dotes.count()).toBe(1) // la que ya estaba, sin cambios
  })

  it('guarda las hojas de reglas y las que tienen el mismo id se reemplazan', async () => {
    const settings = createSettingsRepository(db)
    await importDotes(db, file([], [{ id: 'a', title: 'A', rows: [['x']] }, { id: 'b', title: 'B', rows: [['y']] }]))
    await importDotes(db, file([], [{ id: 'a', title: 'A nueva', rows: [['z']] }]))
    const sheets = await settings.getDoteSheets()
    expect(sheets.map((s) => [s.id, s.title])).toEqual([['b', 'B'], ['a', 'A nueva']])
  })

  it('lo exportado se vuelve a importar igual en otra base', async () => {
    await repo.create(chispa)
    await repo.create({ ...chispa, name: 'Única', type: 'unico', tier: 'S' })
    await importDotes(db, file([], [{ id: 'reglas', title: 'Reglas', rows: [['a', 'b']], header: true }]))
    const exported: DotesFile = await exportDotes(db)
    expect(exported).toMatchObject({ app: 'fmfid-app', kind: 'dotes', version: 1 })
    expect(exported.dotes.map((d) => d.name)).toEqual(['Chispa', 'Única'])

    const other = new AppDB(`test-${crypto.randomUUID()}`)
    const result = await importDotes(other, exported)
    expect(result.added).toBe(2)
    expect((await createDoteRepository(other).list()).map((d) => d.name)).toEqual(['Chispa', 'Única'])
    expect((await createSettingsRepository(other).getDoteSheets())[0].header).toBe(true)
  })
})

describe('los dotes en el respaldo', () => {
  it('el respaldo los trae y se restauran', async () => {
    await repo.create(chispa)
    const backup = await exportBackup(db)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.dotes).toHaveLength(1)

    const other = new AppDB(`test-${crypto.randomUUID()}`)
    await importBackup(other, backup)
    expect((await createDoteRepository(other).list())[0].name).toBe('Chispa')
  })

  it('un respaldo de antes de los dotes se importa y deja el catálogo vacío', async () => {
    await repo.create(chispa)
    const { dotes: _dotes, ...old } = await exportBackup(db)
    await importBackup(db, { ...old, version: 8 })
    expect(await db.dotes.count()).toBe(0)
  })

  it('actualizar desde el Excel no toca los dotes ni sus reglas', async () => {
    await repo.create(chispa)
    await importDotes(db, file([], [{ id: 'reglas', title: 'Reglas', rows: [['a']] }]))
    await createRepository(db).create({ ...edward, name: 'Ed' } as never)
    const backup = await exportBackup(new AppDB(`test-${crypto.randomUUID()}`))
    await importFromExcel(db, { ...backup, characters: [{ ...edward, id: 'x', name: 'Otro' }] })
    expect(await db.dotes.count()).toBe(1)
    expect(await createSettingsRepository(db).getDoteSheets()).toHaveLength(1)
  })
})

describe('actualización de la base desde la versión 8', () => {
  it('queda un catálogo vacío y no se pierde nada', async () => {
    const name = `test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(8).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, kind, rank, realm, guild, race',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    await old.table('settings').add({ key: 'algo', value: 1 })
    old.close()

    const upgraded = new AppDB(name)
    expect(await upgraded.dotes.count()).toBe(0)
    expect((await upgraded.settings.get('algo'))?.value).toBe(1)
    await createDoteRepository(upgraded).create(chispa)
    expect(await upgraded.dotes.count()).toBe(1)
    upgraded.close()
  })
})
