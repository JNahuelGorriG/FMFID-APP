import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Character, CharacterState, Combat, Npc } from '../rules'

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
  characterStates!: EntityTable<CharacterState, 'characterId'>
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
    // Versión 3: estado vivo de los personajes, combates y ajustes. Las bases viejas se actualizan solas.
    this.version(3).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
      characterStates: 'characterId',
      combats: 'id, status, updatedAt',
      settings: 'key',
    })
  }
}

export const db = new AppDB()
