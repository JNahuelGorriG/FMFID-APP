import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, BACKUP_VERSION, createNpcRepository, exportBackup, importBackup } from './index'
import { defaultEnemyProfile, newNpcTemplate } from '../rules'

let db: AppDB
let repo: ReturnType<typeof createNpcRepository>

beforeEach(() => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  repo = createNpcRepository(db)
})

describe('NPCs', () => {
  it('crea, lee, guarda y borra', async () => {
    const npc = await repo.create({ ...newNpcTemplate(), name: 'Aino', rank: 'D' })
    expect((await repo.get(npc.id))?.name).toBe('Aino')

    await repo.save({ ...npc, role: 'Herrera', combat: defaultEnemyProfile('D') })
    const saved = await repo.get(npc.id)
    expect(saved?.role).toBe('Herrera')
    expect(saved?.combat?.rank).toBe('D')

    await repo.remove(npc.id)
    expect(await repo.get(npc.id)).toBeUndefined()
  })

  it('lista ordenada y busca en varios campos sin distinguir mayúsculas', async () => {
    await repo.create({ ...newNpcTemplate(), name: 'Zoe', realm: 'Olderion' })
    await repo.create({ ...newNpcTemplate(), name: 'Aino', occupation: 'Herrera Magitek' })
    await repo.create({ ...newNpcTemplate(), name: 'Amber', race: 'Humano' })
    expect((await repo.list()).map((n) => n.name)).toEqual(['Aino', 'Amber', 'Zoe'])
    expect((await repo.list('olderion')).map((n) => n.name)).toEqual(['Zoe'])
    expect((await repo.list('MAGITEK')).map((n) => n.name)).toEqual(['Aino'])
    expect(await repo.list('nadie')).toEqual([])
  })
})

describe('respaldo con NPCs', () => {
  it('exporta e importa los NPCs', async () => {
    await repo.create({ ...newNpcTemplate(), name: 'Alice', combat: defaultEnemyProfile('SS+') })
    const backup = await exportBackup(db)
    expect(backup.version).toBe(BACKUP_VERSION)

    const other = new AppDB(`test-${crypto.randomUUID()}`)
    await importBackup(other, JSON.parse(JSON.stringify(backup)))
    const npcs = await createNpcRepository(other).list()
    expect(npcs).toHaveLength(1)
    expect(npcs[0].combat?.rank).toBe('SS+')
  })

  it('acepta respaldos viejos sin NPCs', async () => {
    await repo.create({ ...newNpcTemplate(), name: 'Viejo' })
    await importBackup(db, {
      app: 'fmfid-app', version: 1, exportedAt: '', characters: [], changes: [],
    })
    expect(await repo.list()).toEqual([])
  })
})

describe('búsqueda por rango', () => {
  it('un rango escrito solo coincide exactamente, sin traer lo que lo contiene', async () => {
    for (const [name, rank] of [['Bela', 'B'], ['Brix', 'B+'], ['Abel', 'A'], ['Alba', 'A+'], ['Sol', 'SS+']]) {
      await repo.create({ ...newNpcTemplate(), name, rank })
    }
    expect((await repo.list('B')).map((n) => n.name)).toEqual(['Bela'])
    expect((await repo.list('b+')).map((n) => n.name)).toEqual(['Brix'])
    expect((await repo.list('A')).map((n) => n.name)).toEqual(['Abel'])
    expect((await repo.list('ss+')).map((n) => n.name)).toEqual(['Sol'])
  })

  it('un texto más largo sigue buscando en todos los campos', async () => {
    await repo.create({ ...newNpcTemplate(), name: 'Alice', rank: 'SS+' })
    await repo.create({ ...newNpcTemplate(), name: 'Zoe', occupation: 'Alchemist' })
    expect((await repo.list('al')).map((n) => n.name)).toEqual(['Alice', 'Zoe'])
  })
})

describe('bestiario', () => {
  it('separa a los NPC únicos de las bestias, y la búsqueda respeta la separación', async () => {
    await repo.create({ ...newNpcTemplate('npc'), name: 'Alice', rank: 'SS+' })
    await repo.create({ ...newNpcTemplate('bestia'), name: 'Lobo', rank: 'D' })
    await repo.create({ ...newNpcTemplate('bestia'), name: 'Lobo alfa', rank: 'B' })
    expect((await repo.list('', 'npc')).map((n) => n.name)).toEqual(['Alice'])
    expect((await repo.list('', 'bestia')).map((n) => n.name)).toEqual(['Lobo', 'Lobo alfa'])
    expect((await repo.list('lobo', 'bestia')).map((n) => n.name)).toEqual(['Lobo', 'Lobo alfa'])
    expect((await repo.list('b', 'bestia')).map((n) => n.name)).toEqual(['Lobo alfa'])
    expect(await repo.list('d', 'npc')).toEqual([])
    expect(await repo.list('')).toHaveLength(3)
  })

  it('un respaldo viejo sin tipo trae a todos como NPC', async () => {
    const { kind: _k, ...old } = { ...newNpcTemplate(), id: 'n1', name: 'Vieja', createdAt: '', updatedAt: '' }
    await importBackup(db, { app: 'fmfid-app', version: 5, exportedAt: '', characters: [], changes: [], npcs: [old] })
    expect((await repo.list('', 'npc')).map((n) => n.name)).toEqual(['Vieja'])
  })
})
