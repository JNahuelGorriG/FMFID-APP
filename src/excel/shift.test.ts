import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { findLabelRow, findTierRow, findTreeHeader } from './readExcel'
import type { Block } from './readExcel'

const STATS = ['Fuerza', 'Destreza', 'Constitucion', 'Percepcion', 'Inteligencia', 'Sabiduria', 'Carisma ']
const block = { name: 'Conrad', player: 'Santana', tierCol: 19, tierRow: 28, treeHeader: 248 } as Block

describe('el Excel cambia de filas: las tablas se buscan por etiqueta', () => {
  it('encuentra la tabla de tiers aunque se haya corrido', () => {
    for (const shift of [0, 1, 2, -1]) {
      const ws = new ExcelJS.Workbook().addWorksheet('Stats')
      ws.getCell(27 + shift, 18).value = 'Stats de Rol'
      STATS.forEach((s, i) => {
        ws.getCell(28 + shift + i, 18).value = s
        ws.getCell(28 + shift + i, 19).value = 1
      })
      expect(findTierRow(ws, block)).toBe(28 + shift)
    }
  })

  it('encuentra el árbol por el nombre del jugador y las filas de BP por su etiqueta', () => {
    const ws = new ExcelJS.Workbook().addWorksheet('Arbol Stats')
    ws.getCell(226, 16).value = 'SANTANA'
    ws.getCell(228, 5).value = 'Fuerza'
    expect(findTreeHeader(ws, block)).toBe(228)
    const st = new ExcelJS.Workbook().addWorksheet('Stats')
    st.getCell(41, 42).value = 'BPs'
    expect(findLabelRow(st, 42, 'bps', 30, 60)).toBe(41)
    expect(findLabelRow(st, 42, 'MH', 30, 60)).toBeNull()
  })
})
