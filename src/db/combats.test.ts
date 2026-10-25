import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AppDB,
  BACKUP_VERSION,
  createCombatRepository,
  createRepository,
  createSettingsRepository,
  exportBackup,
  importBackup,
  importFromExcel,
  migrateCombat,
} from './index'
import {
  DEFAULT_EFFECT_TYPES,
  addNpcParticipant,
  addPcParticipant,
  advanceTurn,
  defaultEnemyProfile,
  newCombat,
  newNpcTemplate,
  startCombat,
  updateParticipant,
} from '../rules'
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

  it('un jugador en dos combates tiene un estado separado en cada uno', async () => {
    const char = await createRepository(db).create(edwardData)
    const a = await combats.create('Principal')
    const b = await combats.create('Alterna')
    for (const c of [a, b]) {
      await combats.update(c.id, (x) => addPcParticipant(x, char, 10))
    }

    // en el combate principal queda a 1 de vida
    await combats.update(a.id, (x) =>
      updateParticipant(x, x.participants[0].id, (p) => ({
        ...p,
        pc: p.pc ? { ...p.pc, health: { leve: 1, medio: 0, letal: 1 } } : null,
      })),
    )

    const principal = await combats.get(a.id)
    const alterna = await combats.get(b.id)
    expect(principal?.participants[0].pc?.health).toEqual({ leve: 1, medio: 0, letal: 1 })
    expect(alterna?.participants[0].pc?.health).toEqual(edward.baseHealth)
  })

  it('el jugador entra con vida y energías llenas', async () => {
    const char = await createRepository(db).create(edwardData)
    const c = await combats.create('A')
    const saved = await combats.update(c.id, (x) => addPcParticipant(x, char, 5))
    const pc = saved.participants[0].pc
    expect(pc?.health).toEqual(edward.baseHealth)
    expect((pc?.mana.natural ?? 0) + (pc?.mana.renovable ?? 0)).toBe(840)
    expect(pc?.armor).toBeNull()
  })

  it('guarda el avance de turnos y rondas', async () => {
    const c = await combats.create('A')
    await combats.update(c.id, (x) =>
      addNpcParticipant(addNpcParticipant(x, { name: 'G1', profile: defaultEnemyProfile('D') }, 10), { name: 'G2', profile: defaultEnemyProfile('D') }, 5),
    )
    await combats.update(c.id, startCombat)
    await combats.update(c.id, (x) => advanceTurn(x, { tickDurations: true }))
    const saved = await combats.get(c.id)
    expect(saved?.round).toBe(1)
    expect(saved?.participants.find((p) => p.id === saved.activeId)?.name).toBe('G2')
  })

  it('un combate inexistente falla al actualizar y se puede borrar', async () => {
    await expect(combats.update('nada', (x) => x)).rejects.toThrow()
    const c = await combats.create('A')
    await combats.remove(c.id)
    expect(await combats.get(c.id)).toBeUndefined()
  })
})

describe('tipos de buff', () => {
  it('devuelve los de fábrica y guarda los editados', async () => {
    const settings = createSettingsRepository(db)
    expect(await settings.getEffectTypes()).toEqual(DEFAULT_EFFECT_TYPES)
    await settings.saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'bendicion', name: 'Aumento por bendición' }])
    expect((await settings.getEffectTypes()).at(-1)?.id).toBe('bendicion')
  })

  it('los tipos guardados antes de Espíritu lo reciben, sin perder los editados', async () => {
    const settings = createSettingsRepository(db)
    // simula una lista guardada por una versión anterior
    await db.settings.put({ key: 'effectTypes', value: [{ id: 'habilidad', name: 'Mi habilidad' }, { id: 'pocion', name: 'Mi poción' }] })
    const types = await settings.getEffectTypes()
    expect(types.map((t) => t.id)).toEqual(['habilidad', 'pocion', 'espiritu'])
    expect(types[0].name).toBe('Mi habilidad')
  })

  it('no deja quitar "habilidad" ni "Espíritu" ni nombres vacíos', async () => {
    const settings = createSettingsRepository(db)
    await expect(settings.saveEffectTypes(DEFAULT_EFFECT_TYPES.filter((t) => t.id !== 'habilidad'))).rejects.toThrow()
    await expect(settings.saveEffectTypes(DEFAULT_EFFECT_TYPES.filter((t) => t.id !== 'espiritu'))).rejects.toThrow()
    await expect(settings.saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'x', name: ' ' }])).rejects.toThrow()
  })
})

describe('respaldo', () => {
  it('exporta e importa combates con el estado de cada participante', async () => {
    const char = await createRepository(db).create(edwardData)
    const c = await combats.create('Frente')
    await combats.update(c.id, (x) => addPcParticipant(x, char, 5))
    const backup = await exportBackup(db)
    expect(backup.version).toBe(BACKUP_VERSION)

    const other = new AppDB(`test-${crypto.randomUUID()}`)
    await importBackup(other, JSON.parse(JSON.stringify(backup)))
    const saved = await other.combats.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].participants[0].pc?.health).toEqual(edward.baseHealth)
  })

  it('un respaldo de la versión 3 se convierte: el estado global pasa al combate', async () => {
    const legacy = {
      app: 'fmfid-app',
      version: 3,
      exportedAt: '',
      characters: [{ ...edward }],
      changes: [],
      npcs: [],
      settings: [],
      characterStates: [
        {
          characterId: edward.id,
          health: { leve: 2, medio: 1, letal: 1 },
          barriers: [], mana: { natural: 1, renovable: 2 }, stamina: { natural: 3, renovable: 4 },
          saves: { current: 1, max: 2, unique: 0, battery: 3 }, effects: [],
        },
      ],
      combats: [
        {
          id: 'c1', name: 'Viejo', status: 'activo', round: 1, activeId: null, alerts: [],
          createdAt: '', updatedAt: '',
          participants: [{ id: 'p1', kind: 'pc', characterId: edward.id, name: 'Edward', initiative: 5, npc: null }],
        },
        {
          id: 'c2', name: 'Otro', status: 'activo', round: 0, activeId: null, alerts: [],
          createdAt: '', updatedAt: '',
          participants: [{ id: 'p2', kind: 'npc', characterId: null, name: 'Goblin', initiative: 1, npc: null }],
        },
      ],
    }
    await importBackup(db, legacy)
    const [one, two] = (await db.combats.toArray()).sort((a, b) => a.id.localeCompare(b.id))
    expect(one.participants[0].side).toBe('jugador')
    expect(one.participants[0].pc?.health).toEqual({ leve: 2, medio: 1, letal: 1 })
    expect(one.participants[0].pc?.armor).toBeNull()
    expect(one.history).toEqual([])
    expect(two.participants[0].side).toBe('enemigo')
  })

  it('migrateCombat arma el estado inicial si el personaje no tenía estado', () => {
    const combat = migrateCombat(
      {
        ...newCombat('x'),
        participants: [{ id: 'p', kind: 'pc', characterId: edward.id, name: 'Edward', initiative: 1, npc: null }],
      },
      [edward],
      [],
    )
    expect(combat.participants[0].pc?.health).toEqual(edward.baseHealth)
  })
})

describe('actualización de la base desde la versión 3', () => {
  it('convierte los combates guardados y elimina los estados globales', async () => {
    const name = `test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(3).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
      characterStates: 'characterId',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    await old.table('characters').add({ ...edward })
    await old.table('characterStates').add({
      characterId: edward.id,
      health: { leve: 3, medio: 2, letal: 1 },
      barriers: [], mana: { natural: 1, renovable: 1 }, stamina: { natural: 1, renovable: 1 },
      saves: { current: 2, max: 2, unique: 0, battery: 0 }, effects: [],
    })
    await old.table('combats').add({
      id: 'c1', name: 'Guardado', status: 'activo', round: 0, activeId: null, alerts: [],
      createdAt: '', updatedAt: '',
      participants: [{ id: 'p1', kind: 'pc', characterId: edward.id, name: 'Edward', initiative: 5, npc: null }],
    })
    old.close()

    const upgraded = new AppDB(name)
    const combat = await upgraded.combats.get('c1')
    expect(combat?.participants[0].pc?.health).toEqual({ leve: 3, medio: 2, letal: 1 })
    expect(combat?.participants[0].side).toBe('jugador')
    expect(upgraded.tables.map((t) => t.name)).not.toContain('characterStates')
    upgraded.close()
  })
})

describe('actualización de la base desde la versión 4', () => {
  it('completa la saturación y el destino de la armadura de los combates guardados', async () => {
    const name = `test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(4).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    await old.table('combats').add({
      id: 'c1', name: 'Viejo', status: 'activo', round: 1, activeId: null, alerts: [], history: [],
      createdAt: '', updatedAt: '',
      participants: [
        {
          id: 'p1', kind: 'pc', characterId: 'x', name: 'Roy', side: 'jugador', initiative: 5, npc: null,
          pc: {
            health: { leve: 8, medio: 5, letal: 2 }, barriers: [], mana: { natural: 1, renovable: 1 },
            stamina: { natural: 1, renovable: 1 }, saves: { current: 2, max: 2, unique: 0, battery: 0 }, effects: [],
            armor: { type: 'ligera', rank: 'C', bonus: 65, usesMax: 10, usesLeft: 7 },
          },
        },
      ],
    })
    old.close()

    const upgraded = new AppDB(name)
    const pc = (await upgraded.combats.get('c1'))?.participants[0].pc
    expect(pc?.saturation).toBe(0)
    expect(pc?.armor?.bonusTarget).toBe('fisica')
    expect(pc?.armor?.usesLeft).toBe(7)
    upgraded.close()
  })
})

describe('actualización de la base desde la versión 5', () => {
  it('los NPC guardados pasan a ser NPC y los de los combates reciben saturación', async () => {
    const name = `test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(5).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    await old.table('npcs').add({ id: 'n1', name: 'Alice', rank: 'SS+', combat: null })
    await old.table('combats').add({
      id: 'c1', name: 'Viejo', status: 'activo', round: 0, activeId: null, alerts: [], history: [],
      createdAt: '', updatedAt: '',
      participants: [
        {
          id: 'p1', kind: 'npc', characterId: null, name: 'Goblin', side: 'enemigo', initiative: 1, pc: null,
          npc: { profile: defaultEnemyProfile('D'), hpCurrent: 5, hpMax: 10, barriers: [], effects: [] },
        },
      ],
    })
    old.close()

    const upgraded = new AppDB(name)
    expect((await upgraded.npcs.get('n1'))?.kind).toBe('npc')
    expect((await upgraded.combats.get('c1'))?.participants[0].npc?.saturation).toBe(0)
    upgraded.close()
  })
})

describe('destino de las potenciaciones', () => {
  it('devuelve los de fábrica y guarda los cambios sin perder el resto', async () => {
    const settings = createSettingsRepository(db)
    const defaults = await settings.getTechniqueTargets()
    expect(defaults.kyushu).toBe('preguntar')
    expect(defaults.ki).toBe('preguntar')

    await settings.saveTechniqueTargets({ ...defaults, kyushu: 'sabiduria' })
    const saved = await settings.getTechniqueTargets()
    expect(saved.kyushu).toBe('sabiduria')
    expect(saved.ki).toBe('preguntar')
  })
})

describe('actualizar desde el Excel', () => {
  const excelFile = (over: object = {}) => ({
    app: 'fmfid-app', version: 6, exportedAt: '', changes: [], combats: [], npcs: [], settings: [],
    characters: [], ...over,
  })

  it('actualiza al personaje por nombre, sin perder su identidad, su historial ni los combates', async () => {
    const repo = createRepository(db)
    const char = await repo.create({ ...edwardData, className: 'Boxeador', playerName: 'Mauro' })
    await repo.setValue(char.id, 'energy.bonusMana', 111, 'prueba')
    const combat = await combats.create('Frente')
    await combats.update(combat.id, (x) => addPcParticipant(x, char, 5))

    const fromExcel = {
      ...edward, id: 'otro-id', className: '', playerName: '',
      sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, entrenamiento: 99 } },
    }
    const result = await importFromExcel(db, excelFile({ characters: [fromExcel] }))

    expect(result.characters).toBe(1)
    const updated = (await repo.list())[0]
    expect(updated.id).toBe(char.id) // misma identidad
    expect(updated.sources.fuerza.entrenamiento).toBe(99) // datos del Excel
    expect(updated.className).toBe('Boxeador') // lo que el Excel trae vacío se conserva
    expect(updated.playerName).toBe('Mauro')
    expect(await repo.list({ includeRetired: true })).toHaveLength(1)
    expect(await repo.history(char.id)).toHaveLength(1) // historial intacto
    const saved = await combats.get(combat.id)
    expect(saved?.participants[0].characterId).toBe(char.id) // el combate sigue apuntando a él
  })

  it('agrega los personajes y NPCs nuevos', async () => {
    const result = await importFromExcel(
      db,
      excelFile({ characters: [{ ...edward, id: 'e1', name: 'Nuevo' }], npcs: [{ ...newNpcFile('Alice') }] }),
    )
    expect(result).toEqual({ characters: 1, npcs: 1, referenceSheets: false })
    expect(await db.characters.count()).toBe(1)
    expect(await db.npcs.count()).toBe(1)
  })

  it('el NPC conserva su perfil de combate y su tipo si el Excel no trae perfil', async () => {
    await db.npcs.add({ ...newNpcFile('Lobo'), id: 'n1', kind: 'bestia', combat: defaultEnemyProfile('C') })
    await importFromExcel(db, excelFile({ npcs: [{ ...newNpcFile('Lobo'), id: 'x', role: 'Cazador', kind: 'npc', combat: null }] }))
    const lobo = await db.npcs.get('n1')
    expect(lobo?.role).toBe('Cazador') // dato del Excel
    expect(lobo?.kind).toBe('bestia')
    expect(lobo?.combat?.rank).toBe('C')
    expect(await db.npcs.count()).toBe(1)
  })

  it('no toca los combates ni los ajustes y reemplaza los precios', async () => {
    await combats.create('Aldea')
    await createSettingsRepository(db).saveEffectTypes([...DEFAULT_EFFECT_TYPES, { id: 'x', name: 'Otro' }])
    await importFromExcel(
      db,
      excelFile({ settings: [{ key: 'referenceSheets', value: [{ id: 'precios', title: 'Precios', rows: [['S+']] }] }] }),
    )
    expect(await db.combats.count()).toBe(1)
    expect((await createSettingsRepository(db).getEffectTypes()).at(-1)?.id).toBe('x')
    expect((await createSettingsRepository(db).getReferenceSheets())[0].rows).toEqual([['S+']])
  })

  it('rechaza archivos que no son un respaldo', async () => {
    await expect(importFromExcel(db, { hola: 1 })).rejects.toThrow()
  })
})

function newNpcFile(name: string) {
  return { ...newNpcTemplate(), id: `id-${name}`, name, createdAt: '', updatedAt: '' }
}

describe('actualización de la base desde la versión 6', () => {
  it('los participantes de los combates reciben el arma en blanco', async () => {
    const name = `test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(6).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, kind, rank, realm, guild, race',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    const pc = {
      health: { leve: 8, medio: 5, letal: 2 }, barriers: [], mana: { natural: 1, renovable: 1 },
      stamina: { natural: 1, renovable: 1 }, saves: { current: 2, max: 2, unique: 0, battery: 0 }, effects: [],
      armor: null, saturation: 0,
    }
    await old.table('combats').add({
      id: 'c1', name: 'Viejo', status: 'activo', round: 1, activeId: null, alerts: [], history: [],
      createdAt: '', updatedAt: '',
      participants: [
        { id: 'p1', kind: 'pc', characterId: 'x', name: 'Roy', side: 'jugador', initiative: 5, npc: null, pc },
        {
          id: 'p2', kind: 'npc', characterId: null, name: 'Goblin', side: 'enemigo', initiative: 1, pc: null,
          npc: { profile: defaultEnemyProfile('D'), hpCurrent: 5, hpMax: 10, barriers: [], effects: [], saturation: 0 },
        },
      ],
    })
    old.close()

    const upgraded = new AppDB(name)
    const [roy, goblin] = (await upgraded.combats.get('c1'))!.participants
    expect(roy.pc?.weapon).toBeNull()
    expect(goblin.npc?.weapon).toBeNull()
    upgraded.close()
  })
})
