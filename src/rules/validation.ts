import { tierMultipliers } from './stats'
import { STAT_NAMES } from './types'
import type { Tiers } from './types'
import type { Character } from './character'

/** Devuelve la lista de problemas de un personaje. Vacía si está todo bien. */
export function validateCharacter(c: Character): string[] {
  const errors: string[] = []

  if (c.name.trim() === '') errors.push('El nombre no puede estar vacío.')

  const counts = { 1: 0, 2: 0, 3: 0 }
  for (const name of STAT_NAMES) counts[c.tiers[name]] += 1
  if (counts[1] !== 2 || counts[2] !== 3 || counts[3] !== 2) {
    errors.push('Debe haber 2 stats primarios, 3 secundarios y 2 terciarios.')
  }

  for (const name of STAT_NAMES) {
    if (!(c.multipliers[name] > 0)) errors.push(`El multiplicador de ${name} debe ser mayor que 0.`)
    for (const [source, value] of Object.entries(c.sources[name])) {
      if (!Number.isFinite(value)) errors.push(`Valor inválido en ${name}: ${source}.`)
    }
  }

  for (const [key, value] of Object.entries(c.energy)) {
    if (!(value >= 0)) errors.push(`La energía "${key}" no puede ser negativa.`)
  }
  for (const [key, value] of Object.entries(c.baseHealth)) {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`La vida "${key}" debe ser un entero de 0 o más.`)
    }
  }

  return errors
}

/** Personaje en blanco, válido y listo para editar. */
export function newCharacterTemplate(): Omit<Character, 'id' | 'createdAt' | 'updatedAt'> {
  const tiers: Tiers = {
    fuerza: 1, destreza: 1,
    constitucion: 2, percepcion: 2, inteligencia: 2,
    sabiduria: 3, carisma: 3,
  }
  const blank = {
    puntosIniciales: 0, arbolHeroe: 0, heroe: 0, categoria: 0,
    despertar: 0, merito: 0, entrenamiento: 0, regalo: 0, drogasShoko: 0, otros: 0,
  }
  return {
    name: 'Nuevo personaje',
    playerName: '',
    retired: false,
    className: '',
    tiers,
    multipliers: tierMultipliers(tiers, 'fuerza', 'sabiduria'),
    sources: {
      fuerza: { ...blank }, destreza: { ...blank }, constitucion: { ...blank },
      percepcion: { ...blank }, inteligencia: { ...blank }, sabiduria: { ...blank },
      carisma: { ...blank },
    },
    energy: { baseMana: 100, baseStamina: 100, bonusMana: 0, bonusStamina: 0 },
    derived: {
      physDamageWeapon: { kind: 'mediana', rankSteps: 0 },
      magicDamageWeapon: { kind: 'mediana', rankSteps: 0 },
      physDefenseArmor: { kind: 'ligera', rankSteps: 0 },
      magicDefenseArmor: { kind: 'ligera', rankSteps: 0 },
    },
    baseHealth: { leve: 8, medio: 5, letal: 2 },
  }
}
