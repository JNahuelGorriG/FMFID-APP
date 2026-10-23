import type { AppDB, ChangeRecord } from './db'
import type { Character } from '../rules'

export const BACKUP_VERSION = 1

export interface BackupFile {
  app: 'fmfid-app'
  version: number
  exportedAt: string
  characters: Character[]
  changes: ChangeRecord[]
}

export async function exportBackup(db: AppDB): Promise<BackupFile> {
  const [characters, changes] = await Promise.all([db.characters.toArray(), db.changes.toArray()])
  return {
    app: 'fmfid-app',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    characters,
    changes,
  }
}

function isBackup(data: unknown): data is BackupFile {
  if (data === null || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    d.app === 'fmfid-app' &&
    typeof d.version === 'number' &&
    Array.isArray(d.characters) &&
    Array.isArray(d.changes)
  )
}

/** Reemplaza todos los datos por los del respaldo. Valida el archivo antes de tocar nada. */
export async function importBackup(db: AppDB, data: unknown): Promise<void> {
  if (!isBackup(data)) throw new Error('El archivo no es un respaldo de FMFID APP.')
  if (data.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app.')
  }
  await db.transaction('rw', db.characters, db.changes, async () => {
    await db.characters.clear()
    await db.changes.clear()
    await db.characters.bulkAdd(data.characters)
    await db.changes.bulkAdd(data.changes)
  })
}
