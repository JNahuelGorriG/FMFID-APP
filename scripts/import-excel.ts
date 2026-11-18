/**
 * Lee el Excel del GM y genera un archivo de respaldo (respaldo.json).
 * Uso:  npx tsx scripts/import-excel.ts "ruta/al/excel.xlsx" [salida.json]
 * (La app también lee el .xlsx directamente: Más → Actualizar desde el Excel.)
 * El archivo generado contiene datos de la campaña: NO lo subas a GitHub.
 */
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { buildBackupFromWorkbook } from '../src/excel/readExcel'

async function main() {
  const [input, output = 'respaldo.json'] = process.argv.slice(2)
  if (!input) {
    console.error('Uso: npx tsx scripts/import-excel.ts "ruta/al/excel.xlsx" [salida.json]')
    process.exit(1)
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input)
  const { backup, problems } = buildBackupFromWorkbook(workbook, (line) => console.log(line))
  writeFileSync(output, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`Escrito en ${output}. Diferencias: ${problems}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
