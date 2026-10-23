import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Character } from '../rules'

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

  constructor(name = 'fmfid-app') {
    super(name)
    // Versión 1. Más adelante se agregan tablas con db.version(2).stores({...}).
    this.version(1).stores({
      characters: 'id, name, playerName, retired',
      changes: 'id, characterId, at',
    })
  }
}

export const db = new AppDB()
