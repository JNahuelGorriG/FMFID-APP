import type { AppDB, ChangeRecord, Setting } from './db'
import type { Character, CharacterState, Combat, Npc } from '../rules'

export const BACKUP_VERSION = 3

export interface BackupFile {
  app: 'fmfid-app'
  version: number
  exportedAt: string
  characters: Character[]
  changes: ChangeRecord[]
  npcs: Npc[]
  characterStates: CharacterState[]
  combats: Combat[]
  settings: Setting[]
}

export async function exportBackup(db: AppDB): Promise<BackupFile> {
  const [characters, changes, npcs, characterStates, combats, settings] = await Promise.all([
    db.characters.toArray(),
    db.changes.toArray(),
    db.npcs.toArray(),
    db.characterStates.toArray(),
    db.combats.toArray(),
    db.settings.toArray(),
  ])
  return {
    app: 'fmfid-app',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    characters,
    changes,
    npcs,
    characterStates,
    combats,
    settings,
  }
}

const OPTIONAL_LISTS = ['npcs', 'characterStates', 'combats', 'settings'] as const

function isBackup(data: unknown): data is BackupFile {
  if (data === null || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    d.app === 'fmfid-app' &&
    typeof d.version === 'number' &&
    Array.isArray(d.characters) &&
    Array.isArray(d.changes) &&
    OPTIONAL_LISTS.every((key) => d[key] === undefined || Array.isArray(d[key]))
  )
}

/**
 * Reemplaza todos los datos por los del respaldo. Valida el archivo antes de tocar nada.
 * Los respaldos de versiones anteriores (sin NPCs, combates, etc.) también se aceptan.
 */
export async function importBackup(db: AppDB, data: unknown): Promise<void> {
  if (!isBackup(data)) throw new Error('El archivo no es un respaldo de FMFID APP.')
  if (data.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app.')
  }
  await db.transaction(
    'rw',
    [db.characters, db.changes, db.npcs, db.characterStates, db.combats, db.settings],
    async () => {
      await Promise.all([
        db.characters.clear(),
        db.changes.clear(),
        db.npcs.clear(),
        db.characterStates.clear(),
        db.combats.clear(),
        db.settings.clear(),
      ])
      await db.characters.bulkAdd(data.characters)
      await db.changes.bulkAdd(data.changes)
      await db.npcs.bulkAdd(data.npcs ?? [])
      await db.characterStates.bulkAdd(data.characterStates ?? [])
      await db.combats.bulkAdd(data.combats ?? [])
      await db.settings.bulkAdd(data.settings ?? [])
    },
  )
}
