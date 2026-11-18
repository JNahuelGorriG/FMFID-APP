// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoreScreen } from './MoreScreen'
import { db, importFromExcel, previewExcel } from '../db'
import { buildBackupFromWorkbook } from '../excel/readExcel'
import { newNpcTemplate } from '../rules'
import { npcRepo } from './data'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

beforeEach(async () => {
  localStorage.clear()
  for (const t of [db.characters, db.changes, db.npcs, db.combats, db.settings, db.dotes]) await t.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Excel mínimo con solo la hoja de NPCs: nombre, rol, rango... */
async function npcWorkbook(rows: string[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Lista NPCs')
  ws.addRow(['Nombre', 'Rol', 'Rango'])
  for (const r of rows) ws.addRow(r)
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

describe('importar desde el Excel', () => {
  it('rechaza un archivo que no es el Excel de la mesa', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Otra cosa')
    expect(() => buildBackupFromWorkbook(wb)).toThrow(/no parece el Excel de la mesa/)
  })

  it('solo agregar nuevos no pisa los NPCs existentes; "no tocar" deja todo igual', async () => {
    const mine = await npcRepo.create({ ...newNpcTemplate('npc'), name: 'Aria', role: 'EDITADO POR MÍ' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await npcWorkbook([['Aria', 'del Excel', 'B'], ['Nuevo 1', 'x', 'C'], ['Nuevo 2', 'y', 'D']])).buffer as ArrayBuffer)
    const { backup } = buildBackupFromWorkbook(wb)

    expect((await previewExcel(db, backup)).npcs).toEqual({ total: 3, nuevos: 2 })

    await importFromExcel(db, backup, { characters: 'no', npcs: 'no', prices: false })
    expect(await db.npcs.count()).toBe(1)

    const r = await importFromExcel(db, backup, { characters: 'no', npcs: 'nuevos', prices: false })
    expect(r.newNpcs).toBe(2)
    expect((await npcRepo.get(mine.id))?.role).toBe('EDITADO POR MÍ')
    expect(await db.npcs.count()).toBe(3)

    await importFromExcel(db, backup, { characters: 'no', npcs: 'todo', prices: false })
    expect((await npcRepo.get(mine.id))?.role).toBe('del Excel')
    expect(await db.npcs.count()).toBe(3)
  })

  it('la pantalla acepta un .xlsx, muestra qué trae y aplica solo lo elegido', async () => {
    await npcRepo.create({ ...newNpcTemplate('npc'), name: 'Aria', role: 'MÍO' })
    render(<MoreScreen onOpenTables={() => {}} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    expect(input.accept).toContain('.xlsx')

    fireEvent.click(await screen.findByText('Actualizar desde el Excel'))
    const bytes = await npcWorkbook([['Aria', 'del Excel', 'B'], ['Nuevo', 'x', 'C']])
    const file = new File([bytes as BlobPart], 'AAA_GM.xlsx')
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('AAA_GM.xlsx')).toBeTruthy()
    fireEvent.change(await screen.findByLabelText(/^NPCs \(2 en el archivo, 1 nuevos\)/), { target: { value: 'nuevos' } })
    fireEvent.click(screen.getByText('Aplicar'))

    await waitFor(async () => expect(await db.npcs.count()).toBe(2))
    expect((await npcRepo.list('Aria'))[0].role).toBe('MÍO')
    expect(await screen.findByText(/NPCs: 1 nuevos, 0 actualizados/)).toBeTruthy()
  })

  it('avisa si en "respaldo completo" eligen un Excel', async () => {
    render(<MoreScreen onOpenTables={() => {}} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.click(await screen.findByText('Importar respaldo completo'))
    fireEvent.change(input, { target: { files: [new File([(await npcWorkbook([])) as BlobPart], 'x.xlsx')] } })
    expect(await screen.findByText(/es un Excel/)).toBeTruthy()
  })
})
