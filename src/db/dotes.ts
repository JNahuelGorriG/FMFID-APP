import { DOTE_TIERS, DOTE_TYPES, mergeDotes, sortDotes, validateDote } from '../rules'
import type { CatalogDote, MergeResult, NewDote } from '../rules'
import type { AppDB } from './db'
import type { ReferenceSheet } from './settings'

const clean = (data: NewDote): NewDote => ({
  tier: data.tier,
  name: data.name.trim(),
  type: data.type,
  use: data.use.trim(),
  description: data.description.trim(),
})

function assertValid(data: NewDote): void {
  const errors = validateDote(data)
  if (errors.length > 0) throw new Error(errors.join(' '))
}

/** El catálogo de dotes de la mesa. */
export function createDoteRepository(db: AppDB) {
  return {
    /** Todas, por tipo, tier y nombre. */
    async list(): Promise<CatalogDote[]> {
      return sortDotes(await db.dotes.toArray())
    },

    async get(id: string): Promise<CatalogDote | undefined> {
      return db.dotes.get(id)
    },

    async create(data: NewDote): Promise<CatalogDote> {
      assertValid(data)
      const now = new Date().toISOString()
      const dote: CatalogDote = { ...clean(data), id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      await db.dotes.add(dote)
      return dote
    },

    async update(id: string, data: NewDote): Promise<CatalogDote> {
      assertValid(data)
      const current = await db.dotes.get(id)
      if (!current) throw new Error('Esa dote ya no existe.')
      const next: CatalogDote = { ...current, ...clean(data), updatedAt: new Date().toISOString() }
      await db.dotes.put(next)
      return next
    },

    async remove(id: string): Promise<void> {
      await db.dotes.delete(id)
    },
  }
}

/** Archivo para pasar los dotes de un lugar a otro (por ejemplo, desde el Word). */
export interface DotesFile {
  app: 'fmfid-app'
  kind: 'dotes'
  version: 1
  exportedAt: string
  dotes: NewDote[]
  /** Reglas generales y tablas de los dotes. */
  sheets?: ReferenceSheet[]
}

const DOTE_SHEETS_KEY = 'doteSheets'

export async function exportDotes(db: AppDB): Promise<DotesFile> {
  const [list, sheets] = await Promise.all([db.dotes.toArray(), db.settings.get(DOTE_SHEETS_KEY)])
  return {
    app: 'fmfid-app',
    kind: 'dotes',
    version: 1,
    exportedAt: new Date().toISOString(),
    dotes: sortDotes(list).map(clean),
    sheets: Array.isArray(sheets?.value) ? (sheets.value as ReferenceSheet[]) : [],
  }
}

function parseDotesFile(data: unknown): DotesFile {
  const d = data as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.app !== 'fmfid-app' || d.kind !== 'dotes' || !Array.isArray(d.dotes)) {
    throw new Error('El archivo no es una lista de dotes de FMFID APP.')
  }
  d.dotes.forEach((raw, i) => {
    const r = raw as Record<string, unknown>
    const ok =
      r &&
      typeof r.name === 'string' &&
      typeof r.tier === 'string' &&
      typeof r.type === 'string' &&
      (r.use === undefined || typeof r.use === 'string') &&
      (r.description === undefined || typeof r.description === 'string')
    if (!ok) throw new Error(`La dote número ${i + 1} del archivo está incompleta.`)
    if (!DOTE_TIERS.includes(r.tier as never) || !DOTE_TYPES.includes(r.type as never)) {
      throw new Error(`La dote "${String(r.name)}" tiene un tier o un tipo que no existe.`)
    }
  })
  return data as DotesFile
}

export interface DotesImportResult extends MergeResult {
  sheets: number
}

/**
 * Suma los dotes de un archivo al catálogo: las nuevas se agregan, las que ya estaban (mismo tipo y nombre) se
 * actualizan si cambiaron y nunca se borra nada. Las hojas de reglas del archivo reemplazan a las que tengan el
 * mismo id.
 */
export async function importDotes(db: AppDB, data: unknown): Promise<DotesImportResult> {
  const file = parseDotesFile(data)
  const incoming: NewDote[] = file.dotes.map((d) =>
    clean({ tier: d.tier, name: d.name, type: d.type, use: d.use ?? '', description: d.description ?? '' }),
  )
  for (const dote of incoming) assertValid(dote)

  return db.transaction('rw', [db.dotes, db.settings], async () => {
    const { next, result } = mergeDotes(await db.dotes.toArray(), incoming)
    await db.dotes.bulkPut(next)

    const sheets = file.sheets ?? []
    if (sheets.length > 0) {
      const saved = await db.settings.get(DOTE_SHEETS_KEY)
      const current = Array.isArray(saved?.value) ? (saved.value as ReferenceSheet[]) : []
      const merged = [...current.filter((s) => !sheets.some((n) => n.id === s.id)), ...sheets]
      await db.settings.put({ key: DOTE_SHEETS_KEY, value: merged })
    }
    return { ...result, sheets: sheets.length }
  })
}
