import type { AppDB, ChangeRecord, Setting } from './db'
import { migrateCombat, normalizeCombat } from './migrations'
import type { LegacyCombat, LegacyState } from './migrations'
import type { Character, Combat, Npc } from '../rules'

export const BACKUP_VERSION = 5

export interface BackupFile {
  app: 'fmfid-app'
  version: number
  exportedAt: string
  characters: Character[]
  changes: ChangeRecord[]
  npcs: Npc[]
  combats: Combat[]
  settings: Setting[]
}

export async function exportBackup(db: AppDB): Promise<BackupFile> {
  const [characters, changes, npcs, combats, settings] = await Promise.all([
    db.characters.toArray(),
    db.changes.toArray(),
    db.npcs.toArray(),
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
    combats,
    settings,
  }
}

const OPTIONAL_LISTS = ['npcs', 'characterStates', 'combats', 'settings'] as const

function isBackup(data: unknown): data is BackupFile & { characterStates?: LegacyState[] } {
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
 * Los respaldos de versiones anteriores también se aceptan: sus combates se convierten.
 */
export async function importBackup(db: AppDB, data: unknown): Promise<void> {
  if (!isBackup(data)) throw new Error('El archivo no es un respaldo de FMFID APP.')
  if (data.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app.')
  }
  const combats = ((data.combats ?? []) as unknown as LegacyCombat[]).map((c) =>
    normalizeCombat(migrateCombat(c, data.characters, data.characterStates ?? [])),
  )
  await db.transaction('rw', [db.characters, db.changes, db.npcs, db.combats, db.settings], async () => {
    await Promise.all([
      db.characters.clear(),
      db.changes.clear(),
      db.npcs.clear(),
      db.combats.clear(),
      db.settings.clear(),
    ])
    await db.characters.bulkAdd(data.characters)
    await db.changes.bulkAdd(data.changes)
    await db.npcs.bulkAdd(data.npcs ?? [])
    await db.combats.bulkAdd(combats)
    await db.settings.bulkAdd(data.settings ?? [])
  })
}
