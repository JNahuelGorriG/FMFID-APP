import { STAT_NAMES, TECHNIQUES, characterSheet } from '../rules'
import type { Character } from '../rules'
import { FLAT_KEYS, INNATE_KEYS, SOURCE_LABELS, STAT_LABELS, fmt, fmtOrDash } from './format'

export interface ReportOptions {
  /** Daño, defensas, velocidad y alcance. */
  derived: boolean
  /** Ki, Kyushu, Esencia y las demás. */
  techniques: boolean
  /** De dónde sale cada stat: sus fuentes y su multiplicador. */
  breakdown: boolean
  /** Fecha del informe (por defecto, hoy). */
  date?: Date
}

const LINE = '='.repeat(44)
const pad = (label: string, width = 14) => `${label}:`.padEnd(width)

function block(character: Character, options: ReportOptions): string[] {
  const sheet = characterSheet(character)
  const out: string[] = []
  const who = [
    character.playerName ? `Jugador: ${character.playerName}` : '',
    character.className ? `Clase: ${character.className}` : '',
  ].filter(Boolean)

  out.push(LINE, character.name.toUpperCase())
  if (who.length > 0) out.push(who.join(' · '))
  out.push(`Rango ${sheet.rank?.name ?? 'sin rango'} · Promedio de stats: ${fmt(sheet.average)}`, LINE, '')

  out.push('STATS')
  for (const stat of STAT_NAMES) out.push(`  ${pad(STAT_LABELS[stat])}${fmt(sheet.totals[stat])}`)

  out.push('', 'ENERGÍA Y VIDA')
  out.push(`  Maná: ${fmt(sheet.mana)} · Estamina: ${fmt(sheet.stamina)}`)
  const h = character.baseHealth
  out.push(`  Vida base: ${h.leve} leves · ${h.medio} medios · ${h.letal} letales`)

  if (options.derived) {
    const d = sheet.derived
    out.push('', 'DAÑO Y DEFENSAS')
    out.push(`  Daño físico: ${fmt(d.physDamage)} (con arma de referencia: ${fmtOrDash(d.physDamageWithWeapon)})`)
    out.push(`  Daño mágico: ${fmt(d.magicDamage)} (con arma de referencia: ${fmtOrDash(d.magicDamageWithWeapon)})`)
    out.push(`  Defensa física: ${fmt(d.physDefenseCA)} con armadura (CA) · ${fmt(d.physDefenseSA)} natural (SA)`)
    out.push(`  Defensa mágica: ${fmt(d.magicDefenseCA)} con armadura (CA) · ${fmt(d.magicDefenseSA)} natural (SA)`)
    out.push(`  Velocidad: ${fmt(d.speed)} · Alcance físico: ${fmt(d.physReach)} · Alcance mágico: ${fmt(d.magicReach)}`)
  }

  if (options.techniques) {
    out.push('', 'POTENCIACIONES')
    const t = sheet.derived.techniques
    out.push(`  ${TECHNIQUES.map((x) => `${x.name} ${fmt(t[x.key])}`).join(' · ')}`)
  }

  if (options.breakdown) {
    out.push('', 'DESGLOSE DE STATS (fuentes con multiplicador, y fuentes planas)')
    for (const stat of STAT_NAMES) {
      const s = character.sources[stat]
      const innate = INNATE_KEYS.map((k) => `${SOURCE_LABELS[k]} ${fmt(s[k])}`).join(' + ')
      const flat = FLAT_KEYS.map((k) => `${SOURCE_LABELS[k]} ${fmt(s[k])}`).join(' + ')
      out.push(`  ${STAT_LABELS[stat]} = (${innate}) × ${fmt(character.multipliers[stat])} + ${flat}`)
    }
  }

  return out
}

/** El informe de texto con los stats de uno o más personajes. */
export function statsReport(characters: Character[], options: ReportOptions): string {
  const date = (options.date ?? new Date()).toLocaleDateString('es-AR')
  const lines: string[] = [`FMFID APP · Stats de ${characters.length === 1 ? 'un personaje' : 'personajes'}`, `Generado el ${date}`, '']
  characters.forEach((c, i) => {
    if (i > 0) lines.push('', '')
    lines.push(...block(c, options))
  })
  return `${lines.join('\n')}\n`
}

/** Nombre del archivo: con el nombre del personaje si es uno solo. */
export function statsFileName(characters: Character[], date = new Date()): string {
  const day = date.toISOString().slice(0, 10)
  if (characters.length !== 1) return `fmfid-stats-${day}.txt`
  const slug = characters[0].name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `fmfid-stats-${slug || 'personaje'}-${day}.txt`
}
