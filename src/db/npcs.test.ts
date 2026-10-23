import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, createNpcRepository, exportBackup, importBackup } from './index'
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
    expect(backup.version).toBe(2)

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
