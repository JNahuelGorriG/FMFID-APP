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
import { STAT_NAMES, characterSheet } from '../src/rules'
import type { Character, DerivedConfig, Health, Npc, StatName, StatSources, Tier, Tiers } from '../src/rules'

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
}

/**
 * Equipo de referencia, tomado de las fórmulas del Excel. Los desplazamientos de fila
 * (MATCH(...)+1 baja un rango) están convertidos a pasos de rango (+1 = un rango más).
 */
const BLOCKS: Block[] = [
  {
    name: 'Colt', player: 'Denis', className: 'Ranger', retired: false, top: 1, tierCol: 19, tierRow: 2,
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
  if (block.tierCol > 0) {
    tiers = {} as Tiers
    STAT_NAMES.forEach((name, i) => {
      const t = parseTier(ws.getCell(block.tierRow + i, block.tierCol).value)
      if (t === null) throw new Error(`Falta el tier de ${name} para ${block.name}`)
      tiers[name] = t
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

  const characters: Character[] = []
  let problems = 0
  console.log('\nVerificación contra los valores calculados del Excel:\n')

  for (const block of BLOCKS) {
    const { character, excel } = readCharacter(ws, block)
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
