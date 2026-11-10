import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, createRepository, exportBackup, importFromExcel } from './index'
import type { Character } from '../rules'
import { edward } from '../rules/fixtures'

let db: AppDB
let repo: ReturnType<typeof createRepository>

beforeEach(() => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  repo = createRepository(db)
})

const { id: _i, createdAt: _c, updatedAt: _u, ...edwardData } = edward

describe('el entrenamiento temporal en la base', () => {
  it('se guarda aunque el personaje no tuviera el dato, y queda en el historial', async () => {
    const c = await repo.create(edwardData)
    const records = await repo.applyChanges(c.id, [{ path: 'sources.fuerza.entrenamientoTemp', value: 12 }], 'Entrenamiento: prueba')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ path: 'sources.fuerza.entrenamientoTemp', newValue: 12, reason: 'Entrenamiento: prueba' })
    expect((await repo.get(c.id))?.sources.fuerza.entrenamientoTemp).toBe(12)
  })

  it('se pueden cambiar los 7 stats y volver a bajarlos', async () => {
    const c = await repo.create(edwardData)
    await repo.applyChanges(c.id, [{ path: 'sources.sabiduria.entrenamientoTemp', value: 3 }], 'a')
    await repo.applyChanges(c.id, [{ path: 'sources.sabiduria.entrenamientoTemp', value: 0 }], 'b')
    expect((await repo.get(c.id))?.sources.sabiduria.entrenamientoTemp).toBe(0)
    // los dos cambios pueden caer en el mismo milisegundo: no se compara el orden
    expect((await repo.history(c.id)).map((h) => h.newValue).sort()).toEqual([0, 3])
  })

  it('actualizar desde el Excel conserva el entrenamiento temporal del personaje', async () => {
    const c = await repo.create(edwardData)
    await repo.applyChanges(c.id, [{ path: 'sources.fuerza.entrenamientoTemp', value: 12 }, { path: 'sources.carisma.entrenamientoTemp', value: 4 }], 'x')
    const backup = await exportBackup(db)
    // el Excel trae al mismo personaje, con otro entrenamiento permanente y sin dato temporal
    const fromExcel: Character = { ...edward, id: 'otro', sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, entrenamiento: 99 } } }
    await importFromExcel(db, { ...backup, characters: [fromExcel] })
    const after = (await repo.list())[0]
    expect(after.id).toBe(c.id)
    expect(after.sources.fuerza.entrenamiento).toBe(99) // lo del Excel manda
    expect(after.sources.fuerza.entrenamientoTemp).toBe(12) // lo temporal es de la app y se conserva
    expect(after.sources.carisma.entrenamientoTemp).toBe(4)
    expect(after.sources.destreza.entrenamientoTemp).toBeUndefined()
  })

  it('si el archivo trae un dato temporal, ese manda', async () => {
    const c = await repo.create(edwardData)
    await repo.applyChanges(c.id, [{ path: 'sources.fuerza.entrenamientoTemp', value: 12 }], 'x')
    const backup = await exportBackup(db)
    const fromFile: Character = { ...edward, id: 'otro', sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, entrenamientoTemp: 2 } } }
    await importFromExcel(db, { ...backup, characters: [fromFile] })
    expect((await repo.list())[0].sources.fuerza.entrenamientoTemp).toBe(2)
  })

  it('va en el respaldo completo', async () => {
    const c = await repo.create(edwardData)
    await repo.applyChanges(c.id, [{ path: 'sources.fuerza.entrenamientoTemp', value: 5 }], 'x')
    const backup = await exportBackup(db)
    expect(backup.characters[0].sources.fuerza.entrenamientoTemp).toBe(5)
  })
})
