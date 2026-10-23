/**
 * Lee el Excel del GM y genera un archivo de respaldo (respaldo.json) que se puede
 * importar desde la app (Más → Importar respaldo).
 *
 * Uso:  npx tsx scripts/import-excel.ts "ruta/al/excel.xlsx" [salida.json]
 *
 * Importa: stats por fuente, multiplicadores, tiers, energías (base y bonos),
 * vida base y equipo de referencia. No importa el árbol, cristales ni buffs.
 * El archivo generado contiene datos de la campaña: NO lo subas a GitHub.
 */
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { BACKUP_VERSION } from '../src/db/backup'
import type { BackupFile } from '../src/db/backup'
import {
  BRANCHES,
  NODES_PER_STAGE,
  STAGES,
  STAT_NAMES,
  appliedFor,
  appliedTotals,
  characterSheet,
  emptyTree,
  findNode,
  nodeId,
} from '../src/rules'
import type {
  Character,
  CharacterTree,
  Choice,
  DerivedConfig,
  Health,
  Npc,
  Purchase,
  StatName,
  StatSources,
  Tier,
  Tiers,
} from '../src/rules'

const SOURCE_KEYS: (keyof StatSources)[] = [
  'puntosIniciales', 'arbolHeroe', 'heroe', 'categoria',
  'despertar', 'merito', 'entrenamiento', 'regalo', 'drogasShoko', 'otros',
]

interface Block {
  name: string
  player: string
  className: string
  retired: boolean
  /** Fila del nombre en el bloque de datos (columna A). */
  top: number
  /** Columna (1-based) y fila inicial de los tiers de este personaje. */
  tierCol: number
  tierRow: number
  health: Health
  derived: DerivedConfig
  /** Promedio de stats corregido por el GM, solo para verificar. */
  expectedAverage?: number
  /** Fila de la cabecera de su copia del árbol en la hoja "Arbol Stats" y su columna en la tabla de BP. */
  treeHeader: number
  bpColumn: number | null
}

/**
 * Equipo de referencia, tomado de las fórmulas del Excel. Los desplazamientos de fila
 * (MATCH(...)+1 baja un rango) están convertidos a pasos de rango (+1 = un rango más).
 */
const BLOCKS: Block[] = [
  {
    name: 'Colt', player: 'Denis', className: 'Ranger', retired: false, top: 1, tierCol: 19, tierRow: 2,
    treeHeader: 41, bpColumn: 43,
    health: { leve: 8, medio: 5, letal: 2 }, expectedAverage: 458,
    derived: {
      physDamageWeapon: { kind: 'mediana', rankSteps: 0 },
      magicDamageWeapon: { kind: 'mediana', rankSteps: 0 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -2 },
      magicDefenseArmor: { kind: 'pesada', rankSteps: -2 },
    },
  },
  {
    name: 'Conrad', player: 'Santana', className: 'Espartano', retired: false, top: 11, tierCol: 19, tierRow: 28,
    treeHeader: 248, bpColumn: 47,
    health: { leve: 8, medio: 6, letal: 2 }, expectedAverage: 367,
    derived: {
      physDamageWeapon: { kind: 'grande', rankSteps: 1 },
      magicDamageWeapon: { kind: 'pequena', rankSteps: -1 },
      physDefenseArmor: { kind: 'mediana', rankSteps: -1 },
      magicDefenseArmor: { kind: 'ligera', rankSteps: -1 },
      agilityStat: 'fuerza',
    },
  },
  {
    name: 'Roy', player: 'Maxi', className: '', retired: false, top: 21, tierCol: 27, tierRow: 2,
    treeHeader: 77, bpColumn: 45,
    health: { leve: 8, medio: 5, letal: 2 }, expectedAverage: 319,
    derived: {
      physDamageWeapon: { kind: 'pequena', rankSteps: -1 },
      magicDamageWeapon: { kind: 'grande', rankSteps: 1 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -2 },
      magicDefenseArmor: { kind: 'mediana', rankSteps: -1 },
    },
  },
  {
    name: 'Edward', player: 'Mauro', className: 'Boxeador', retired: false, top: 31, tierCol: 27, tierRow: 28,
    treeHeader: 111, bpColumn: 46,
    health: { leve: 10, medio: 7, letal: 3 }, expectedAverage: 477,
    derived: {
      physDamageWeapon: { kind: 'pesada', rankSteps: 0 },
      magicDamageWeapon: null,
      physDefenseArmor: { kind: 'pesada', rankSteps: -1 },
      magicDefenseArmor: { kind: 'ligera', rankSteps: -2 },
      magicDefenseWeights: { constitucion: 0.1, sabiduria: 0.9 },
      agilityStat: 'fuerza',
    },
  },
  {
    name: 'Saizo', player: 'Facu', className: '', retired: false, top: 41, tierCol: 35, tierRow: 2,
    treeHeader: 145, bpColumn: 44,
    health: { leve: 8, medio: 5, letal: 2 }, expectedAverage: 399,
    derived: {
      physDamageWeapon: { kind: 'mediana', rankSteps: 1 },
      magicDamageWeapon: { kind: 'pequena', rankSteps: -1 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -1 },
      magicDefenseArmor: { kind: 'ligera', rankSteps: -2 },
    },
  },
  {
    name: 'Hernán', player: 'Juan', className: '', retired: false, top: 51, tierCol: 35, tierRow: 28,
    treeHeader: 179, bpColumn: 48,
    health: { leve: 8, medio: 5, letal: 2 }, expectedAverage: 405,
    derived: {
      physDamageWeapon: null,
      magicDamageWeapon: { kind: 'pesada', rankSteps: 1 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -2 },
      magicDefenseArmor: { kind: 'pesada', rankSteps: 0 },
    },
  },
  {
    name: 'Enjin', player: 'Marcos', className: '', retired: false, top: 61, tierCol: 27, tierRow: 54,
    treeHeader: 283, bpColumn: 49,
    health: { leve: 8, medio: 5, letal: 2 }, expectedAverage: 289,
    derived: {
      physDamageWeapon: { kind: 'mediana', rankSteps: 1 },
      magicDamageWeapon: { kind: 'pequena', rankSteps: 0 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -1 },
      magicDefenseArmor: { kind: 'mediana', rankSteps: -1 },
    },
  },
  {
    name: 'Ciro', player: 'Marcos (anterior)', className: '', retired: true, top: 71, tierCol: 19, tierRow: 54,
    treeHeader: 213, bpColumn: null,
    health: { leve: 8, medio: 5, letal: 2 },
    derived: {
      physDamageWeapon: { kind: 'pequena', rankSteps: -1 },
      magicDamageWeapon: { kind: 'grande', rankSteps: 1 },
      physDefenseArmor: { kind: 'ligera', rankSteps: -2 },
      magicDefenseArmor: { kind: 'mediana', rankSteps: -2 },
    },
  },
]

type Cell = ExcelJS.CellValue

/** Valor calculado de una celda (si es fórmula, su resultado). */
function valueOf(cell: Cell): unknown {
  if (cell !== null && typeof cell === 'object' && 'result' in cell) return cell.result
  return cell
}

const num = (cell: Cell): number => {
  const v = valueOf(cell)
  return typeof v === 'number' ? v : 0
}

/** Lee "S1" o "S3" (súper stat) o un número; devuelve el tier. */
function parseTier(cell: Cell): Tier | null {
  const v = valueOf(cell)
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : NaN
  return n === 1 || n === 2 || n === 3 ? n : null
}

/** "S1" es un súper primario y "S3" un súper terciario. */
function parseSuper(cell: Cell): 'primario' | 'terciario' | null {
  const v = valueOf(cell)
  if (typeof v !== 'string') return null
  const t = v.trim().toUpperCase()
  return t === 'S1' ? 'primario' : t === 'S3' ? 'terciario' : null
}

/** Tiers por defecto a partir de los multiplicadores (para personajes sin columna de tiers). */
function tiersFromMultipliers(multipliers: Record<StatName, number>): Tiers {
  const tiers = {} as Tiers
  for (const name of STAT_NAMES) {
    const m = multipliers[name]
    tiers[name] = m >= 1.05 ? 1 : m >= 1 ? 2 : 3
  }
  return tiers
}

/** De "(100+M8+M7+M9+50+50)*1.5" saca la base (primer número) y la suma de bonos (el resto). */
function parseEnergy(cell: Cell): { base: number; bonus: number; total: number } {
  const formula = cell !== null && typeof cell === 'object' && 'formula' in cell ? String(cell.formula) : ''
  const match = formula.match(/\(([0-9A-Z.+]+)\)\*1\.5/)
  if (!match) throw new Error(`No pude leer la fórmula de energía: ${formula}`)
  const numbers = match[1].split('+').filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number)
  const [base = 0, ...bonuses] = numbers
  return { base, bonus: bonuses.reduce((a, b) => a + b, 0), total: num(cell) }
}

function readCharacter(ws: ExcelJS.Worksheet, block: Block): { character: Character; excel: ExcelCheck } {
  const stats = {} as Record<StatName, StatSources>
  const multipliers = {} as Record<StatName, number>
  const totalCells = {} as Record<StatName, number>

  STAT_NAMES.forEach((name, i) => {
    const row = block.top + 2 + i
    const sources = {} as StatSources
    SOURCE_KEYS.forEach((key, c) => {
      sources[key] = num(ws.getCell(row, 2 + c).value)
    })
    stats[name] = sources
    multipliers[name] = num(ws.getCell(row, 14).value) || 1
    totalCells[name] = num(ws.getCell(row, 13).value)
  })

  let tiers: Tiers
  const superStats: Character['superStats'] = {}
  if (block.tierCol > 0) {
    tiers = {} as Tiers
    STAT_NAMES.forEach((name, i) => {
      const cell = ws.getCell(block.tierRow + i, block.tierCol).value
      const t = parseTier(cell)
      if (t === null) throw new Error(`Falta el tier de ${name} para ${block.name}`)
      tiers[name] = t
      const special = parseSuper(cell)
      if (special) superStats[name] = special
    })
  } else {
    tiers = tiersFromMultipliers(multipliers)
  }

  const energyRow = (label: string): number => {
    for (let r = block.top; r < block.top + 10; r++) {
      if (String(valueOf(ws.getCell(r, 15).value) ?? '').trim() === label) return r
    }
    throw new Error(`No encontré "${label}" para ${block.name}`)
  }
  const mana = parseEnergy(ws.getCell(energyRow('Mana Total'), 16).value)
  const stamina = parseEnergy(ws.getCell(energyRow('Estamina Total'), 16).value)

  const stamp = new Date().toISOString()
  const character: Character = {
    id: crypto.randomUUID(),
    name: block.name,
    playerName: block.player,
    retired: block.retired,
    className: block.className,
    tiers,
    ...(Object.keys(superStats).length > 0 ? { superStats } : {}),
    multipliers,
    sources: stats,
    energy: { baseMana: mana.base, baseStamina: stamina.base, bonusMana: mana.bonus, bonusStamina: stamina.bonus },
    derived: block.derived,
    baseHealth: block.health,
    createdAt: stamp,
    updatedAt: stamp,
  }
  return { character, excel: { totals: totalCells, mana: mana.total, stamina: stamina.total } }
}

interface ExcelCheck {
  totals: Record<StatName, number>
  mana: number
  stamina: number
}

/** Dos verdes que se usaron para marcar lo comprado. */
const GREENS = ['FFC4D79B', 'FFB6D7A8']

/** Elecciones que la hoja deja ambiguas y el GM ya confirmó. */
const CONFIRMED_CHOICES: Record<string, Choice> = {
  'Hernán:fuerza:1:3': 'mh',
}
const TREE_COLUMNS = [5, 8, 11, 14, 17, 20, 23, 26, 29]

/** Lo que dice la celda de una opción elegida, pasado a elección. null si todavía muestra las dos opciones. */
function choiceFromText(text: string, options: Choice[]): Choice | null {
  const t = text.toLowerCase()
  if (options.length === 1) return options[0]
  if (t.includes('//') || /\bo\b/.test(t) && !/^dote$|^hab$/.test(t)) return null
  if (options.includes('energia') && /(\be\b|energ)/.test(t)) return 'energia'
  if (options.includes('mh') && t.includes('mh')) return 'mh'
  if (options.includes('stat') && t.includes('stat')) return 'stat'
  if (options.includes('dote') && t.startsWith('dote')) return 'dote'
  if (options.includes('hab') && t.startsWith('hab')) return 'hab'
  return null
}

interface TreeReport {
  purchases: number
  spent: number
  unknown: string[]
  gaps: string[]
  mismatches: string[]
}

/** Lee las compras de una copia del árbol: lo que está pintado de verde es lo comprado. */
function readTree(
  ws: ExcelJS.Worksheet,
  header: number,
  character: Character,
  bp: number,
  mh: number,
): { tree: CharacterTree; report: TreeReport } {
  const purchases: Purchase[] = []
  const report: TreeReport = { purchases: 0, spent: 0, unknown: [], gaps: [], mismatches: [] }
  const stamp = new Date().toISOString()

  BRANCHES.forEach((branch, b) => {
    let gap = false
    for (const stage of STAGES) {
      for (let index = 0; index < NODES_PER_STAGE; index++) {
        const row = header + 1 + (stage - 1) * 11 + index
        const cell = ws.getCell(row, TREE_COLUMNS[b])
        const fill = cell.fill as ExcelJS.FillPattern | undefined
        const green = fill?.type === 'pattern' && GREENS.includes(fill.fgColor?.argb ?? '')
        const node = findNode(nodeId(branch, stage, index))
        if (!green) {
          // Un nodo de dote o habilidad sin comprar no frena a los de abajo (los jugadores lo eligen después).
          if (node && !(node.options.includes('dote') && node.options.includes('hab'))) gap = true
          continue
        }
        const text = String(valueOf(cell.value) ?? '').trim()
        if (!node) {
          report.mismatches.push(`${branch} etapa ${stage} nodo ${index + 1}: está pintado pero la plantilla no tiene nodo ("${text}")`)
          continue
        }
        if (gap) report.gaps.push(`${branch} etapa ${stage} nodo ${index + 1}: comprado después de un nodo sin comprar`)
        let choice = CONFIRMED_CHOICES[`${character.name}:${node.id}`] ?? choiceFromText(text, node.options)
        // Dote o habilidad que todavía no se decidió: no suma stats, se deja como habilidad sin nombre.
        if (choice === null && node.options.includes('dote') && node.options.includes('hab')) choice = 'hab'
        if (choice === null) {
          report.unknown.push(`${branch} etapa ${stage} nodo ${index + 1}: "${text}"`)
          continue
        }
        if (/energia/i.test(text) && !node.options.includes('energia')) {
          report.mismatches.push(`${branch} etapa ${stage} nodo ${index + 1}: la copia dice "${text}" y la plantilla "${node.options.join(' o ')}"`)
        }
        purchases.push({
          nodeId: node.id,
          branch,
          stage,
          index,
          cost: node.cost,
          choice,
          note: choice === 'dote' || choice === 'hab' ? (/^(dote|hab|dote o hab)$/i.test(text) ? '' : text) : '',
          applied: appliedFor(character, node, choice),
          at: stamp,
        })
      }
    }
  })

  report.purchases = purchases.length
  report.spent = purchases.reduce((sum, p) => sum + p.cost, 0)
  const dotes = purchases
    .filter((p) => p.choice === 'dote')
    .map((p) => ({ id: p.nodeId, name: p.note, description: '', nodeId: p.nodeId }))
  const stage2 = purchases.some((p) => p.stage >= 2)
  const stage3 = purchases.some((p) => p.stage >= 3)
  return {
    tree: { ...emptyTree(), bp, mh, gates: { stage2, stage3 }, purchases, dotes },
    report,
  }
}

/** Compara lo que suman las compras con las fuentes del personaje. Devuelve las diferencias. */
function compareTree(character: Character, tree: CharacterTree): string[] {
  const totals = appliedTotals(tree)
  const diffs: string[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  for (const stat of STAT_NAMES) {
    const src = character.sources[stat]
    if (!near(src.arbolHeroe, totals.arbolHeroe[stat])) {
      diffs.push(`${stat} Árbol Héroe: Excel ${src.arbolHeroe} / compras ${totals.arbolHeroe[stat]}`)
    }
    if (!near(src.heroe, totals.heroe[stat])) diffs.push(`${stat} Héroe: Excel ${src.heroe} / compras ${totals.heroe[stat]}`)
    if (!near(src.categoria, totals.categoria[stat])) {
      diffs.push(`${stat} Categoría: Excel ${src.categoria} / compras ${totals.categoria[stat]}`)
    }
  }
  if (!near(character.energy.bonusMana, totals.mana)) diffs.push(`bonos de maná: Excel ${character.energy.bonusMana} / compras ${totals.mana}`)
  if (!near(character.energy.bonusStamina, totals.stamina)) diffs.push(`bonos de estamina: Excel ${character.energy.bonusStamina} / compras ${totals.stamina}`)
  return diffs
}

/** Lee una hoja entera como tabla de texto, para consultarla en la app. */
function readSheetGrid(workbook: ExcelJS.Workbook, name: string): string[][] {
  const ws = workbook.getWorksheet(name)
  if (!ws) return []
  const rows: string[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: string[] = []
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = valueOf(ws.getCell(r, c).value)
      row.push(v === null || v === undefined ? '' : String(v).trim())
    }
    while (row.length > 0 && row[row.length - 1] === '') row.pop()
    rows.push(row)
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop()
  return rows
}

/** Lee la hoja "Lista NPCs": datos descriptivos, sin perfil de combate. */
function readNpcs(workbook: ExcelJS.Workbook): Npc[] {
  const ws = workbook.getWorksheet('Lista NPCs')
  if (!ws) return []
  const text = (row: number, col: number): string => {
    const v = valueOf(ws.getCell(row, col).value)
    const s = v === null || v === undefined ? '' : String(v).trim()
    return s === '-' ? '' : s
  }
  const npcs: Npc[] = []
  const stamp = new Date().toISOString()
  for (let r = 2; r <= ws.rowCount; r++) {
    const name = text(r, 1)
    if (name === '') continue
    npcs.push({
      id: crypto.randomUUID(),
      kind: 'npc',
      name,
      role: text(r, 2),
      rank: text(r, 3),
      element: text(r, 4),
      guild: text(r, 5),
      realm: text(r, 6),
      race: text(r, 7),
      affiliation: text(r, 8),
      occupation: text(r, 9),
      personality: text(r, 10),
      details: text(r, 11),
      combat: null,
      createdAt: stamp,
      updatedAt: stamp,
    })
  }
  return npcs
}

async function main() {
  const [input, output = 'respaldo.json'] = process.argv.slice(2)
  if (!input) {
    console.error('Uso: npx tsx scripts/import-excel.ts "ruta/al/excel.xlsx" [salida.json]')
    process.exit(1)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input)
  const ws = workbook.getWorksheet('Stats')
  if (!ws) throw new Error('No encontré la hoja "Stats".')
  const treeSheet = workbook.getWorksheet('Arbol Stats')

  const characters: Character[] = []
  let problems = 0
  console.log('\nVerificación contra los valores calculados del Excel:\n')

  for (const block of BLOCKS) {
    const { character: base, excel } = readCharacter(ws, block)
    let character = base
    const treeLines: string[] = []
    if (treeSheet) {
      const bp = block.bpColumn ? Number(valueOf(ws.getCell(39, block.bpColumn).value)) || 0 : 0
      const mh = block.bpColumn ? Number(valueOf(ws.getCell(40, block.bpColumn).value)) || 0 : 0
      const { tree, report } = readTree(treeSheet, block.treeHeader, base, bp, mh)
      character = { ...base, tree }
      treeLines.push(`árbol: ${report.purchases} compras, ${report.spent} BP gastados, ${bp} BP y ${mh} MH disponibles`)
      for (const t of report.unknown) treeLines.push(`  ? elección sin definir: ${t}`)
      for (const t of report.gaps) treeLines.push(`  ! ${t}`)
      for (const t of report.mismatches) treeLines.push(`  ! ${t}`)
      for (const d of compareTree(base, tree)) treeLines.push(`  ≠ ${d}`)
    }
    const sheet = characterSheet(character)
    characters.push(character)

    const diffs: string[] = []
    for (const name of STAT_NAMES) {
      if (Math.abs(sheet.totals[name] - excel.totals[name]) > 0.01) {
        diffs.push(`${name}: app ${sheet.totals[name].toFixed(2)} / Excel ${excel.totals[name]}`)
      }
    }
    if (sheet.mana !== excel.mana) diffs.push(`maná: app ${sheet.mana} / Excel ${excel.mana}`)
    if (sheet.stamina !== excel.stamina) diffs.push(`estamina: app ${sheet.stamina} / Excel ${excel.stamina}`)

    const avg = Math.round(sheet.average)
    const expected = block.expectedAverage
    if (expected !== undefined && Math.abs(avg - expected) > 1) {
      diffs.push(`promedio: app ${avg} / GM ${expected}`)
    }

    const status = diffs.length === 0 ? 'OK ' : 'REVISAR'
    problems += diffs.length
    console.log(`${status}  ${block.name.padEnd(7)} rango ${(sheet.rank?.name ?? '-').padEnd(4)} promedio ${sheet.average.toFixed(1)}  maná ${sheet.mana}  estamina ${sheet.stamina}`)
    for (const d of diffs) console.log(`        - ${d}`)
    for (const l of treeLines) console.log(`        ${l}`)
  }

  const npcs = readNpcs(workbook)
  const backup: BackupFile = {
    app: 'fmfid-app',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    characters,
    changes: [],
    npcs,
    combats: [],
    settings: [
      {
        key: 'referenceSheets',
        value: [{ id: 'precios', title: 'Precios', rows: readSheetGrid(workbook, 'Precios') }],
      },
    ],
  }
  writeFileSync(output, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`\n${characters.length} personajes y ${npcs.length} NPCs escritos en ${output}. Diferencias encontradas: ${problems}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
