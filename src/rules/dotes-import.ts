import { DOTE_TIERS } from './dotes'
import type { DoteTier, DoteType, NewDote } from './dotes'
import { normalizeDoteName } from './dotes'
import { STAT_NAMES } from './types'

/** Lo que se lee de un documento: títulos y filas de tabla, en el orden en que aparecen. */
export type DocBlock = { kind: 'heading'; text: string } | { kind: 'row'; cells: string[] }

const STAT_BY_TITLE: Record<string, DoteType> = Object.fromEntries(STAT_NAMES.map((s) => [normalizeDoteName(s), s]))

/** Quita marcas de Markdown, escapes y espacios de más. */
export function cleanText(s: string): string {
  return s
    .replace(/​/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const CATEGORY_TITLE = /^([^()|]{2,60}?)\s*\(([^()|]{2,60})\)$/

/** ¿Este texto corto parece un título de sección de dotes (un stat, "Dotes únicas" o "Categoría (Personaje)")? */
export function looksLikeDoteHeading(text: string): boolean {
  const t = cleanText(text)
  if (t.length === 0 || t.length > 70) return false
  return normalizeDoteName(t) in STAT_BY_TITLE || /dotes unicas/.test(normalizeDoteName(t)) || CATEGORY_TITLE.test(t)
}

/** Lee un texto en Markdown (el que exporta Google Docs): líneas con # son títulos y las de | son filas. */
export function blocksFromMarkdown(text: string): DocBlock[] {
  const blocks: DocBlock[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#')) {
      const title = cleanText(line.replace(/^#+/, ''))
      if (title) blocks.push({ kind: 'heading', text: title })
    } else if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cleanText)
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
      blocks.push({ kind: 'row', cells })
    } else if (looksLikeDoteHeading(line)) {
      blocks.push({ kind: 'heading', text: cleanText(line) })
    }
  }
  return blocks
}

export interface ParsedDotes {
  dotes: NewDote[]
  /** Filas de tabla que parecían dotes pero estaban incompletas. */
  skipped: number
}

/**
 * Arma las dotes a partir de títulos y filas. Un título con el nombre de un stat marca el tipo de las que siguen;
 * "Dotes únicas" pasa a las únicas, y dentro de ellas "Categoría (Personaje)" marca la categoría y a quién se
 * sugiere. Solo cuentan las filas de cuatro columnas que empiezan con un tier (E a S): las demás tablas se ignoran.
 */
export function dotesFromBlocks(blocks: DocBlock[]): ParsedDotes {
  const dotes: NewDote[] = []
  let skipped = 0
  let type: DoteType | null = null
  let category: string | undefined
  let suggestedFor: string[] | undefined

  for (const block of blocks) {
    if (block.kind === 'heading') {
      const title = cleanText(block.text)
      const key = normalizeDoteName(title)
      if (key in STAT_BY_TITLE) {
        type = STAT_BY_TITLE[key]
        category = undefined
        suggestedFor = undefined
      } else if (/dotes unicas/.test(key)) {
        type = 'unico'
        category = undefined
        suggestedFor = undefined
      } else if (type === 'unico') {
        const m = CATEGORY_TITLE.exec(title)
        if (m) {
          category = m[1].trim()
          suggestedFor = m[2].split(/,|\sy\s/).map((n) => n.trim()).filter(Boolean)
        } else {
          type = null
        }
      } else {
        type = null
      }
      continue
    }
    const [tier, name, use, ...rest] = block.cells
    if (type === null || !DOTE_TIERS.includes(tier as DoteTier) || block.cells.length < 4) continue
    const description = rest.join(' ').trim()
    if (!name || !description) {
      skipped++
      continue
    }
    dotes.push({
      tier: tier as DoteTier,
      name,
      type,
      use: use ?? '',
      description,
      ...(type === 'unico' && category ? { category } : {}),
      ...(type === 'unico' && suggestedFor?.length ? { suggestedFor } : {}),
    })
  }
  return { dotes, skipped }
}
