import type { AppDB, ChangeRecord, Setting } from './db'
import { migrateCombat, normalizeCombat, normalizeNpc } from './migrations'
import type { LegacyCombat, LegacyState } from './migrations'
import type { Character, Combat, Npc } from '../rules'

export const BACKUP_VERSION = 6

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
    await db.npcs.bulkAdd((data.npcs ?? []).map(normalizeNpc))
    await db.combats.bulkAdd(combats)
    await db.settings.bulkAdd(data.settings ?? [])
  })
}

const norm = (name: string): string => name.trim().toLowerCase()

export interface ExcelImportResult {
  characters: number
  npcs: number
  referenceSheets: boolean
}

/**
 * Actualiza los personajes y NPCs con los datos de un respaldo generado desde el Excel, sin tocar
 * los combates, el historial ni los ajustes. Cada personaje o NPC se empareja por nombre con el que
 * ya existe, así conserva su identidad (los combates y el historial siguen apuntando a él).
 * Del NPC se conserva su perfil de combate si el Excel no trae uno, y del personaje la clase y el
 * jugador si el Excel los trae vacíos. Los que no existían se agregan. Los precios se reemplazan.
 */
export async function importFromExcel(db: AppDB, data: unknown): Promise<ExcelImportResult> {
  if (!isBackup(data)) throw new Error('El archivo no es un respaldo de FMFID APP.')
  if (data.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app.')
  }

  return db.transaction('rw', [db.characters, db.npcs, db.settings], async () => {
    const takeBy = <T extends { name: string }>(items: T[]) => {
      const pool = new Map<string, T[]>()
      for (const item of items) pool.set(norm(item.name), [...(pool.get(norm(item.name)) ?? []), item])
      return (name: string): T | undefined => pool.get(norm(name))?.shift()
    }

    const takeChar = takeBy(await db.characters.toArray())
    const characters = data.characters.map((incoming) => {
      const existing = takeChar(incoming.name)
      if (!existing) return incoming
      return {
        ...incoming,
        id: existing.id,
        createdAt: existing.createdAt,
        className: incoming.className || existing.className,
        playerName: incoming.playerName || existing.playerName,
      }
    })

    const takeNpc = takeBy(await db.npcs.toArray())
    const npcs = (data.npcs ?? []).map((incoming) => {
      const existing = takeNpc(incoming.name)
      if (!existing) return normalizeNpc(incoming)
      return normalizeNpc({
        ...incoming,
        id: existing.id,
        createdAt: existing.createdAt,
        kind: existing.kind ?? incoming.kind,
        combat: incoming.combat ?? existing.combat,
      })
    })

    await db.characters.bulkPut(characters)
    await db.npcs.bulkPut(npcs)
    const sheets = (data.settings ?? []).find((x) => x.key === 'referenceSheets')
    if (sheets) await db.settings.put(sheets)
    return { characters: characters.length, npcs: npcs.length, referenceSheets: sheets !== undefined }
  })
}
