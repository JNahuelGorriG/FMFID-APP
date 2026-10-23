import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Character, Npc } from '../rules'

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

export class AppDB extends Dexie {
  characters!: EntityTable<Character, 'id'>
  changes!: EntityTable<ChangeRecord, 'id'>
  npcs!: EntityTable<Npc, 'id'>

  constructor(name = 'fmfid-app') {
    super(name)
    this.version(1).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
    })
    // Versión 2: lista de NPCs. Las bases de la versión 1 se actualizan solas.
    this.version(2).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
      npcs: 'id, name, rank, realm, guild, race',
    })
  }
}

export const db = new AppDB()
