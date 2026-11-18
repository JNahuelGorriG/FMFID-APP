import { buildBackupFromWorkbook } from './readExcel'

/** Un .xlsx es un zip: empieza con "PK". */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

/**
 * Lee el archivo que eligió el usuario: el Excel de la mesa (.xlsx) o el respaldo .json que genera el script.
 * Devuelve el respaldo y, si vino de un Excel, las diferencias que encontró al verificar.
 */
export async function readImportFile(file: File): Promise<{ data: unknown; fromExcel: boolean; problems: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isZip(bytes)) {
    // exceljs pesa bastante: solo se descarga cuando hace falta.
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
    } catch {
      throw new Error('No pude abrir el Excel. ¿Está dañado o protegido con contraseña?')
    }
    const { backup, problems } = buildBackupFromWorkbook(workbook)
    return { data: backup, fromExcel: true, problems }
  }
  try {
    return { data: JSON.parse(new TextDecoder().decode(bytes)), fromExcel: false, problems: 0 }
  } catch {
    throw new Error('El archivo no es un Excel (.xlsx) ni un respaldo .json.')
  }
}
