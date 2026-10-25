import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Character, Combat, Npc } from '../rules'
import { migrateCombat, normalizeCombat, normalizeNpc } from './migrations'
import type { LegacyCombat, LegacyState } from './migrations'

/** Registro de cada cambio de un dato de un personaje. */
export interface ChangeRecord {
  id: string
  characterId: string
  /** ISO 8601. */
  at: string
  /** Ruta del dato dentro del personaje, por ejemplo "sources.fuerza.entrenamiento". */
  path: string
  oldValue: unknown
  newValue: unknown
  reason: string
}

export interface Setting {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  characters!: EntityTable<Character, 'id'>
  changes!: EntityTable<ChangeRecord, 'id'>
  npcs!: EntityTable<Npc, 'id'>
  combats!: EntityTable<Combat, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'fmfid-app') {
    super(name)
    this.version(1).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
    })
    this.version(2).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
    })
    this.version(3).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
      characterStates: 'characterId',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
    // Versión 4: cada combate guarda el estado propio de sus participantes. Los combates de la
    // versión 3 se convierten y la tabla de estados globales se elimina.
    this.version(4)
      .stores({
        characters: 'id, name, playerName, retired',
        changes: 'id, characterId, at',
        npcs: 'id, name, rank, realm, guild, race',
        characterStates: null,
        combats: 'id, status, updatedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const characters: Character[] = await tx.table('characters').toArray()
        const states: LegacyState[] = await tx.table('characterStates').toArray()
        const combats: LegacyCombat[] = await tx.table('combats').toArray()
        await tx.table('combats').bulkPut(combats.map((c) => migrateCombat(c, characters, states)))
      })
    // Versión 5: saturación por curación y destino del valor de la armadura.
    this.version(5)
      .stores({
        characters: 'id, name, playerName, retired',
        changes: 'id, characterId, at',
        npcs: 'id, name, rank, realm, guild, race',
        combats: 'id, status, updatedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const combats: Combat[] = await tx.table('combats').toArray()
        await tx.table('combats').bulkPut(combats.map(normalizeCombat))
      })
    // Versión 6: bestiario (tipo de NPC) y saturación de los NPC en combate.
    this.version(6)
      .stores({
        characters: 'id, name, playerName, retired',
        changes: 'id, characterId, at',
        npcs: 'id, name, kind, rank, realm, guild, race',
        combats: 'id, status, updatedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const npcs: Npc[] = await tx.table('npcs').toArray()
        await tx.table('npcs').bulkPut(npcs.map(normalizeNpc))
        const combats: Combat[] = await tx.table('combats').toArray()
        await tx.table('combats').bulkPut(combats.map(normalizeCombat))
      })
    // Versión 7: arma equipada en los participantes de los combates.
    this.version(7)
      .stores({
        characters: 'id, name, playerName, retired',
        changes: 'id, characterId, at',
        npcs: 'id, name, kind, rank, realm, guild, race',
        combats: 'id, status, updatedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const combats: Combat[] = await tx.table('combats').toArray()
        await tx.table('combats').bulkPut(combats.map(normalizeCombat))
      })
    // Versión 8: límite de los buffs de cada combatiente.
    this.version(8)
      .stores({
        characters: 'id, name, playerName, retired',
        changes: 'id, characterId, at',
        npcs: 'id, name, kind, rank, realm, guild, race',
        combats: 'id, status, updatedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const combats: Combat[] = await tx.table('combats').toArray()
        await tx.table('combats').bulkPut(combats.map(normalizeCombat))
      })
  }
}

export const db = new AppDB()
