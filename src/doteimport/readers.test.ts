// @vitest-environment jsdom
import JSZip from 'jszip'
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { readDotesFile } from './readers'
import { importDotes, db } from '../db'

vi.setConfig({ testTimeout: 30000 })

const MD = `# **Dotes de prueba**

## **Reglas generales**

| Tier | Qué hace una dote típica |
| :---- | :---- |
| E | \\+1 en una acción |

## **Fuerza**

| Tier | Dote | Uso | Descripción |
| :---- | :---- | :---- | :---- |
| E | Puño de prueba | Pasiva | \\+1 al d20 en ataques sin armas. |
| D | Mandoble de prueba | Pasiva | \\+1 al impacto con **armas grandes**. **Excluye:** Otra. |

## **Destreza**

| Tier | Dote | Uso | Descripción |
| :---- | :---- | :---- | :---- |
| C | Paso de prueba | Reacción, 2 por batalla | Esquivas. |

## **Sinergias, cadenas y exclusiones**

| Tipo | Nombre | Dotes que participan | Efecto |
| :---- | :---- | :---- | :---- |
| Sinergia | Combo | A y B | Mejor. |

# **Dotes únicas de Categoría**

## **Tanque de prueba (Edward, Roy)**

| Tier | Dote | Uso | Descripción |
| :---- | :---- | :---- | :---- |
| E | Escudo de prueba | Pasiva | Aguantas. |
`

const file = (data: BlobPart, name: string) => new File([data], name)

function checkParsed(r: Awaited<ReturnType<typeof readDotesFile>>) {
  const names = r.file.dotes.map((d) => d.name)
  expect(names).toEqual(['Puño de prueba', 'Mandoble de prueba', 'Paso de prueba', 'Escudo de prueba'])
  expect(r.file.dotes.map((d) => d.type)).toEqual(['fuerza', 'fuerza', 'destreza', 'unico'])
  expect(r.file.dotes[1].description).toBe('+1 al impacto con armas grandes. Excluye: Otra.')
  expect(r.file.dotes[3].category).toBe('Tanque de prueba')
  expect(r.file.dotes[3].suggestedFor).toEqual(['Edward', 'Roy'])
}

/** Un Word mínimo con títulos, tablas y un párrafo suelto. */
async function docx(): Promise<Uint8Array> {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const p = (t: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`
  const row = (cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`
  const table = (rows: string[][]) => `<w:tbl>${rows.map(row).join('')}</w:tbl>`
  const head = ['Tier', 'Dote', 'Uso', 'Descripción']
  const body =
    p('Reglas generales', 'Heading2') + table([['Tier', 'Qué hace'], ['E', '+1']]) +
    p('Fuerza', 'Heading2') + table([head, ['E', 'Puño de prueba', 'Pasiva', '+1 al d20 en ataques sin armas.'], ['D', 'Mandoble de prueba', 'Pasiva', '+1 al impacto con armas grandes. Excluye: Otra.']]) +
    p('Destreza') + table([head, ['C', 'Paso de prueba', 'Reacción, 2 por batalla', 'Esquivas.']]) +
    p('Dotes únicas de Categoría', 'Heading1') + p('Tanque de prueba (Edward, Roy)', 'Heading2') + p('Una frase suelta.') +
    table([head, ['E', 'Escudo de prueba', 'Pasiva', 'Aguantas.']])
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${w}><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'uint8array' })
}

/** Un PDF mínimo escrito a mano: cada texto lleva posición y tamaño. */
function pdf(pages: { x: number; y: number; size: number; text: string }[][]): Uint8Array {
  const objs: string[] = []
  const add = (s: string) => objs.push(s) // número de objeto = posición + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  pages.forEach((items, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`)
    const stream = items
      .map((t) => `BT /F1 ${t.size} Tf ${t.x} ${t.y} Td (${t.text.replace(/[()\\]/g, '\\$&')}) Tj ET`)
      .join('\n')
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 255) // Latin-1: una letra, un byte
}

const HEADER = [
  { x: 72, size: 11, text: 'Tier' },
  { x: 110, size: 11, text: 'Dote' },
  { x: 250, size: 11, text: 'Uso' },
  { x: 340, size: 11, text: 'Descripción' },
]
const at = (y: number, items: { x: number; size: number; text: string }[]) => items.map((i) => ({ ...i, y }))

describe('leer dotes de distintos archivos', () => {
  it('Markdown', async () => {
    const r = await readDotesFile(file(MD, 'dotes.md'))
    expect(r.source).toBe('texto')
    checkParsed(r)
  })

  it('Word (.docx)', async () => {
    const r = await readDotesFile(file((await docx()) as BlobPart, 'dotes.docx'))
    expect(r.source).toBe('word')
    checkParsed(r)
  })

  it('PDF: columnas, descripciones en varias líneas y fila partida entre dos páginas', async () => {
    const bytes = pdf([
      [
        { x: 72, y: 720, size: 16, text: 'Dotes de prueba' },
        { x: 72, y: 690, size: 13, text: 'Fuerza' },
        ...at(660, HEADER),
        ...at(640, [{ x: 72, size: 11, text: 'E' }, { x: 110, size: 11, text: 'Puño de prueba' }, { x: 250, size: 11, text: 'Pasiva' }, { x: 340, size: 11, text: '+1 al d20 en ataques' }]),
        ...at(626, [{ x: 340, size: 11, text: 'sin armas.' }]),
        ...at(600, [{ x: 72, size: 11, text: 'D' }, { x: 110, size: 11, text: 'Mandoble de' }, { x: 250, size: 11, text: 'Pasiva' }, { x: 340, size: 11, text: '+1 al impacto con armas' }]),
        ...at(586, [{ x: 110, size: 11, text: 'prueba' }]),
        { x: 72, y: 540, size: 12, text: 'Sinergias, cadenas y exclusiones' },
        ...at(520, [{ x: 72, size: 11, text: 'Tipo' }, { x: 150, size: 11, text: 'Nombre' }]),
        ...at(500, [{ x: 72, size: 11, text: 'Sinergia' }, { x: 150, size: 11, text: 'Combo' }]),
        { x: 72, y: 470, size: 11, text: 'Texto suelto debajo.' },
      ],
      [
        { x: 72, y: 720, size: 13, text: 'Destreza' },
        ...at(690, HEADER),
        ...at(670, [{ x: 72, size: 11, text: 'C' }, { x: 110, size: 11, text: 'Paso de prueba' }, { x: 250, size: 11, text: 'Reacción, 2' }, { x: 340, size: 11, text: 'Esquivas con' }]),
        // salto de página en medio de la fila: se repite el encabezado y sigue la descripción
      ],
      [
        ...at(720, HEADER),
        ...at(700, [{ x: 250, size: 11, text: 'por batalla' }, { x: 340, size: 11, text: 'mucho estilo.' }]),
        { x: 72, y: 660, size: 16, text: 'Dotes únicas de Categoría' },
        { x: 72, y: 630, size: 13, text: 'Tanque de prueba (Edward, Roy)' },
        ...at(600, HEADER),
        ...at(580, [{ x: 72, size: 11, text: 'E' }, { x: 110, size: 11, text: 'Escudo de prueba' }, { x: 250, size: 11, text: 'Pasiva' }, { x: 340, size: 11, text: 'Aguantas.' }]),
      ],
    ])
    const r = await readDotesFile(file(bytes as BlobPart, 'dotes.pdf'))
    expect(r.source).toBe('pdf')
    expect(r.file.dotes.map((d) => [d.type, d.tier, d.name, d.use, d.description])).toEqual([
      ['fuerza', 'E', 'Puño de prueba', 'Pasiva', '+1 al d20 en ataques sin armas.'],
      ['fuerza', 'D', 'Mandoble de prueba', 'Pasiva', '+1 al impacto con armas'],
      ['destreza', 'C', 'Paso de prueba', 'Reacción, 2 por batalla', 'Esquivas con mucho estilo.'],
      ['unico', 'E', 'Escudo de prueba', 'Pasiva', 'Aguantas.'],
    ])
    expect(r.file.dotes[3].category).toBe('Tanque de prueba')
    expect(r.file.dotes[3].suggestedFor).toEqual(['Edward', 'Roy'])
  })

  it('JSON de la app sigue funcionando y un archivo sin dotes da un aviso claro', async () => {
    const json = JSON.stringify({ app: 'fmfid-app', kind: 'dotes', version: 1, exportedAt: '', dotes: [] })
    expect((await readDotesFile(file(json, 'd.json'))).source).toBe('json')
    await expect(readDotesFile(file('hola, esto no es una lista', 'x.txt'))).rejects.toThrow(/No encontré dotes/)
  })

  it('al importar un PDF sobre un catálogo viejo, un nombre nuevo con el mismo texto es un renombre, no un duplicado', async () => {
    await db.dotes.clear()
    const old = await readDotesFile(file(MD, 'dotes.md'))
    await importDotes(db, old.file)
    const renamed = MD.replace('Paso de prueba', 'Paso de gato')
    const r = await importDotes(db, (await readDotesFile(file(renamed, 'dotes.md'))).file)
    expect(r.renamed).toBe(1)
    expect(r.added).toBe(0)
    expect((await db.dotes.toArray()).map((d) => d.name).sort()).toEqual(['Escudo de prueba', 'Mandoble de prueba', 'Paso de gato', 'Puño de prueba'])
  })
})
