import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  ARMOR_USES,
  D20_RANGES,
  HEALING_TABLE,
  OUTCOME_ORDER,
  RANKS,
  STAT_NAMES,
  THRESHOLDS,
  TRAINING_TABLE,
  WOUND_TABLE,
  armorBonus,
  characterSheet,
  healingText,
  healingValue,
  weaponBonus,
} from '../rules'
import type { ArmorType, WeaponSize } from '../rules'
import { repo, settingsRepo } from './data'
import { SelectField } from './fields'
import { GROUP_LABELS, LEVEL_LABELS, OUTCOME_LABELS, STAT_LABELS, fmt, rangeText, woundsText } from './format'

type TableId =
  | 'rangos'
  | 'umbrales'
  | 'exitos'
  | 'danos'
  | 'curaciones'
  | 'usos'
  | 'armaduras'
  | 'armas'
  | 'entrenamiento'
  | 'jugadores'
  | 'precios'

const TABLES: { value: TableId; label: string }[] = [
  { value: 'rangos', label: 'Rangos de aventurero' },
  { value: 'umbrales', label: 'Rangos y sus éxitos y fallos (diferencia de stats)' },
  { value: 'exitos', label: 'Tabla de éxitos (d20)' },
  { value: 'danos', label: 'Tabla de daños' },
  { value: 'curaciones', label: 'Tabla de curaciones' },
  { value: 'usos', label: 'Usos de las armaduras' },
  { value: 'armaduras', label: 'Stats de armaduras' },
  { value: 'armas', label: 'Stats de armas' },
  { value: 'entrenamiento', label: 'Stats de entrenamiento' },
  { value: 'jugadores', label: 'Comparativa entre jugadores' },
  { value: 'precios', label: 'Precios' },
]

const LEVELS_IN_ORDER = ['menor-plus', 'menor', 'normal', 'mayor', 'mayor-plus'] as const
const ARMOR_TYPES: ArmorType[] = ['ligera', 'mediana', 'pesada']
const WEAPON_SIZES: WeaponSize[] = ['pequena', 'mediana', 'grande', 'pesada']
const ranksDescending = [...RANKS].reverse()

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="card table-wrap">
      <table className="cmp ref">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={c === 0 ? 'first' : ''}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TablesScreen({ onBack }: { onBack: () => void }) {
  const [table, setTable] = useState<TableId>('rangos')

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a Más">
          ←
        </button>
        <h1 className="tight grow">Tablas de la mesa</h1>
      </header>

      <SelectField label="Tabla" value={table} options={TABLES} onChange={setTable} />

      {table === 'rangos' && (
        <DataTable
          head={['Rango', 'Promedio mínimo', 'Grupo']}
          rows={RANKS.map((r) => [r.name, r.minAverage, GROUP_LABELS[r.group]])}
        />
      )}

      {table === 'umbrales' && (
        <>
          <p className="muted small">
            Diferencia de stats entre atacante y defensor. La fila es la del rango del defensor.
          </p>
          <DataTable
            head={['Rango', 'Grupo', 'Normal', 'Mayor / Menor', 'Mayor+ / Menor+', 'Fallo / Éxito inmune']}
            rows={ranksDescending.map((r) => {
              const t = THRESHOLDS[r.group]
              return [
                r.name,
                GROUP_LABELS[r.group],
                `±0 a ${t.normal}`,
                `±${t.normal + 1} a ${t.mayor}`,
                `±${t.mayor + 1} a ${t.mayorPlus}`,
                `≥ ±${t.mayorPlus + 1}`,
              ]
            })}
          />
        </>
      )}

      {table === 'exitos' && (
        <DataTable
          head={['Nivel', ...OUTCOME_ORDER.map((o) => OUTCOME_LABELS[o])]}
          rows={[
            ['Éxito asegurado', 'Éxito automático', '', '', '', '', ''],
            ...[...LEVELS_IN_ORDER].reverse().map((level) => [
              LEVEL_LABELS[level],
              ...D20_RANGES[level].map(rangeText),
            ]),
            ['Fallo inmune', 'Fallo automático', '', '', '', '', ''],
          ]}
        />
      )}

      {table === 'danos' && (
        <>
          <p className="muted small">
            Filas: resultado de resistencia (d8 + 6, con d6 en los extremos). Columnas: categoría de herida.
          </p>
          <DataTable
            head={['Resistencia', 'Normal (leve)', 'Menor (medio)', 'Menor+ (fuerte)', 'Fallo (letal)']}
            rows={WOUND_TABLE.map((row) => [
              rangeText([row.min, row.max]),
              woundsText(row.cells.leve),
              woundsText(row.cells.medio),
              woundsText(row.cells.fuerte),
              woundsText(row.cells.letal),
            ])}
          />
        </>
      )}

      {table === 'curaciones' && (
        <>
          <p className="muted small">
            Para pociones y curación por energía (maná o estamina). L = leve, M = medio, X = letal y b = barrera de vida.
            Cada nivel ofrece 1 a 3 formas de usar la misma curación. Entre paréntesis, el valor en leves (3 por un medio, 9
            por un letal) para comparar: lo curado + la barrera.
          </p>
          <DataTable
            head={['Nivel', 'Rango', 'Opción 1', 'Opción 2', 'Opción 3']}
            rows={HEALING_TABLE.map((l) => [
              l.level,
              l.rank,
              ...[0, 1, 2].map((i) => {
                const o = l.options[i]
                return o ? `${healingText(o)} (${healingValue(o).total})` : ''
              }),
            ])}
          />
        </>
      )}

      {table === 'usos' && (
        <>
          <p className="muted small">Usos totales / golpes fuertes que aguanta / golpes letales que aguanta.</p>
          <DataTable
            head={['Rango', 'Ligera', 'Mediana', 'Pesada']}
            rows={(['S', 'A', 'B', 'C', 'D', 'E'] as const).map((rank) => [
              rank,
              ...ARMOR_TYPES.map((t) => {
                const u = ARMOR_USES[t][rank]
                return `${u.total} / ${u.fuerte} / ${u.letal}`
              }),
            ])}
          />
        </>
      )}

      {table === 'armaduras' && (
        <DataTable
          head={['Rango', 'Ligera', 'Mediana', 'Pesada']}
          rows={ranksDescending.map((r) => [r.name, ...ARMOR_TYPES.map((t) => armorBonus(r, t))])}
        />
      )}

      {table === 'armas' && (
        <DataTable
          head={['Rango', 'Pequeña', 'Mediana', 'Grande', 'Pesada']}
          rows={ranksDescending.map((r) => [r.name, ...WEAPON_SIZES.map((w) => weaponBonus(r, w))])}
        />
      )}

      {table === 'entrenamiento' && (
        <>
          <p className="muted small">Cuánto se puede entrenar según la cantidad de despertares.</p>
          <DataTable
            head={['Despertares', 'Stats permanentes', 'Stats temporales']}
            rows={TRAINING_TABLE.map((t) => [t.awakenings, t.permanent, t.temporary])}
          />
        </>
      )}

      {table === 'jugadores' && <PlayersComparison />}
      {table === 'precios' && <PricesTable />}
    </section>
  )
}

function PlayersComparison() {
  const characters = useLiveQuery(() => repo.list(), [])
  if (characters === undefined) return <p className="muted">Cargando…</p>
  if (characters.length === 0) return <p className="muted small">No hay personajes activos.</p>

  const sheets = characters.map((c) => ({ name: c.name, sheet: characterSheet(c) }))
  const rows: { label: string; values: (number | string)[]; numeric: boolean }[] = [
    { label: 'Rango', values: sheets.map((s) => s.sheet.rank?.name ?? '—'), numeric: false },
    { label: 'Promedio', values: sheets.map((s) => s.sheet.average), numeric: true },
    ...STAT_NAMES.map((n) => ({ label: STAT_LABELS[n], values: sheets.map((s) => s.sheet.totals[n]), numeric: true })),
    { label: 'Maná', values: sheets.map((s) => s.sheet.mana), numeric: true },
    { label: 'Estamina', values: sheets.map((s) => s.sheet.stamina), numeric: true },
  ]

  const extremes = STAT_NAMES.map((n) => {
    const sorted = [...sheets].sort((a, b) => b.sheet.totals[n] - a.sheet.totals[n])
    const high = sorted[0]
    const low = sorted[sorted.length - 1]
    return [
      STAT_LABELS[n],
      `${high.name} (${fmt(high.sheet.totals[n])})`,
      `${low.name} (${fmt(low.sheet.totals[n])})`,
    ]
  })

  return (
    <>
      <div className="card table-wrap" aria-label="Comparativa entre jugadores">
        <table className="cmp">
          <thead>
            <tr>
              <th />
              {sheets.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const nums = row.numeric ? (row.values as number[]) : []
              const max = Math.max(...nums)
              const min = Math.min(...nums)
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((v, i) => (
                    <td
                      key={sheets[i].name}
                      className={row.numeric && max !== min ? (v === max ? 'max' : v === min ? 'min' : '') : ''}
                    >
                      {typeof v === 'number' ? fmt(v) : v}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h2>Más alto y más bajo</h2>
      <DataTable head={['Stat', 'Más alto', 'Más bajo']} rows={extremes} />
    </>
  )
}

function PricesTable() {
  const sheets = useLiveQuery(() => settingsRepo.getReferenceSheets(), [])
  if (sheets === undefined) return <p className="muted">Cargando…</p>
  const prices = sheets.find((s) => s.id === 'precios')
  if (!prices || prices.rows.length === 0) {
    return <p className="muted small">No hay precios cargados. Importa un respaldo generado con el importador.</p>
  }
  const width = Math.max(...prices.rows.map((r) => r.length))
  const format = (cell: string): string =>
    cell !== '' && /^-?\d+(\.\d+)?$/.test(cell) && Math.abs(Number(cell)) >= 1000 ? Number(cell).toLocaleString('es-AR') : cell
  return (
    <DataTable
      head={Array.from({ length: width }, () => '')}
      rows={prices.rows.map((r) => Array.from({ length: width }, (_, i) => format(r[i] ?? '')))}
    />
  )
}
