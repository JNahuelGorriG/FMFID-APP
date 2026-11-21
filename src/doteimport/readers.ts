import { blocksFromMarkdown, cleanText, dotesFromBlocks, looksLikeDoteHeading } from '../rules'
import type { DocBlock, NewDote } from '../rules'
import type { DotesFile } from '../db'

export type DoteSource = 'json' | 'pdf' | 'word' | 'texto'

const startsWith = (bytes: Uint8Array, ...codes: number[]) => codes.every((c, i) => bytes[i] === c)

// ───────────────────────── PDF

interface Piece {
  text: string
  x: number
  y: number
  h: number
}

const HEADER_WORDS = ['Tier', 'Dote', 'Uso', 'Descripción']
const TIER_CELL = /^[EDCBAS]$/

/**
 * Lee un PDF con tablas de dotes (por ejemplo el que exporta Google Docs). Agrupa lo escrito en líneas por su
 * posición, toma como columnas las de la fila "Tier · Dote · Uso · Descripción", y arma una fila por cada tier que
 * empieza; las líneas siguientes sin tier son la continuación de la fila (descripciones largas, saltos de página).
 */
export async function blocksFromPdf(data: Uint8Array): Promise<DocBlock[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const g = globalThis as { pdfjsWorker?: unknown }
  if (typeof window !== 'undefined' && !g.pdfjsWorker) {
    // El lector corre en la misma página: es un archivo que se importa de vez en cuando, y así no hace falta
    // servir el archivo del worker aparte.
    // @ts-ignore: el módulo del worker no trae tipos
    g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  }
  const doc = await pdfjs.getDocument({ data: data.slice(), useSystemFonts: true }).promise

  const pages: Piece[][] = []
  const heights: number[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    const pieces: Piece[] = []
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      pieces.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], h: item.height })
      heights.push(item.height)
    }
    pages.push(pieces)
  }
  heights.sort((a, b) => a - b)
  const body = heights[Math.floor(heights.length / 2)] ?? 11

  const blocks: DocBlock[] = []
  let cols: number[] | null = null
  let table = false
  let current: string[] | null = null
  const flush = () => {
    if (current) blocks.push({ kind: 'row', cells: current.map(cleanText) })
    current = null
  }

  for (const pieces of pages) {
    // líneas de arriba hacia abajo
    const lines: Piece[][] = []
    for (const p of [...pieces].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last[0].y - p.y) <= 2) last.push(p)
      else lines.push([p])
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x)
      const text = line.map((p) => p.text).join(' ')
      const words = line.map((p) => p.text)
      if (HEADER_WORDS.every((w) => words.includes(w))) {
        cols = HEADER_WORDS.map((w) => line.find((p) => p.text === w)!.x)
        table = true
        continue
      }
      const big = Math.max(...line.map((p) => p.h)) > body + 0.5
      if (big || (!table && looksLikeDoteHeading(text))) {
        flush()
        table = false
        blocks.push({ kind: 'heading', text })
        continue
      }
      if (!table || !cols) continue
      const cells = cols.map(() => '')
      for (const p of line) {
        let i = 0
        cols.forEach((x, k) => {
          if (p.x >= x - 3) i = k
        })
        cells[i] = cells[i] ? `${cells[i]} ${p.text}` : p.text
      }
      if (TIER_CELL.test(cells[0])) {
        flush()
        current = cells
      } else if (cells.slice(1).every((c) => c === '')) {
        // texto suelto debajo de la tabla: la tabla terminó
        flush()
        table = false
      } else if (current) {
        cells.forEach((c, k) => {
          if (c) current![k] = current![k] ? `${current![k]} ${c}` : c
        })
      }
    }
  }
  flush()
  return blocks
}

// ───────────────────────── Word

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const kids = (node: Element, name: string): Element[] =>
  Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name)

function paragraphText(p: Element): string {
  let out = ''
  const walk = (node: Element) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue
      const el = child as Element
      if (el.localName === 't') out += el.textContent ?? ''
      else if (el.localName === 'tab' || el.localName === 'br') out += ' '
      else walk(el)
    }
  }
  walk(p)
  return cleanText(out)
}

/** Lee un .docx: los párrafos con estilo de título (o que parecen uno) y las filas de las tablas. */
export async function blocksFromDocx(data: Uint8Array): Promise<DocBlock[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(data)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('Ese archivo comprimido no es un documento de Word.')
  const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml')
  const body = xml.getElementsByTagNameNS(W, 'body')[0]
  if (!body) throw new Error('No pude leer el contenido del documento de Word.')

  const blocks: DocBlock[] = []
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.localName === 'p') {
      const text = paragraphText(el)
      if (!text) continue
      const style = kids(el, 'pPr')[0] ? kids(kids(el, 'pPr')[0], 'pStyle')[0]?.getAttribute('w:val') ?? '' : ''
      if (/^(heading|titulo|título|title)/i.test(style) || looksLikeDoteHeading(text)) blocks.push({ kind: 'heading', text })
    } else if (el.localName === 'tbl') {
      for (const tr of kids(el, 'tr')) {
        const cells = kids(tr, 'tc').map((tc) => cleanText(kids(tc, 'p').map(paragraphText).join(' ')))
        blocks.push({ kind: 'row', cells })
      }
    }
  }
  return blocks
}

// ───────────────────────── Entrada

export interface ReadDotes {
  file: DotesFile
  source: DoteSource
  /** Filas que parecían dotes pero estaban incompletas. */
  skipped: number
}

const dotesFile = (dotes: NewDote[]): DotesFile => ({
  app: 'fmfid-app',
  kind: 'dotes',
  version: 1,
  exportedAt: new Date().toISOString(),
  dotes,
})

/**
 * Lee un archivo de dotes sea cual sea su formato: el .json de la app, un PDF, un Word (.docx) o un texto en
 * Markdown. En los documentos busca tablas de Tier, Dote, Uso y Descripción bajo títulos con el stat ("Fuerza"…),
 * "Dotes únicas" y, para las únicas, "Categoría (Personaje)".
 */
export async function readDotesFile(file: File): Promise<ReadDotes> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let source: DoteSource
  let blocks: DocBlock[]

  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46)) {
    source = 'pdf'
    blocks = await blocksFromPdf(bytes)
  } else if (startsWith(bytes, 0x50, 0x4b)) {
    source = 'word'
    blocks = await blocksFromDocx(bytes)
  } else {
    const text = new TextDecoder().decode(bytes)
    if (text.trimStart().startsWith('{')) {
      try {
        return { file: JSON.parse(text) as DotesFile, source: 'json', skipped: 0 }
      } catch {
        throw new Error('El archivo parece un .json pero está dañado.')
      }
    }
    source = 'texto'
    blocks = blocksFromMarkdown(text)
  }

  const { dotes, skipped } = dotesFromBlocks(blocks)
  if (dotes.length === 0) {
    throw new Error(
      'No encontré dotes en el archivo. Busco tablas con las columnas Tier, Dote, Uso y Descripción bajo títulos como "Fuerza" o "Dotes únicas".',
    )
  }
  return { file: dotesFile(dotes), source, skipped }
}
