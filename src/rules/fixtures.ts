import type { Character, StatSources } from './index'

/** Datos de prueba: Edward, con los números reales del Excel. */
const S = (v: number[]): StatSources => ({
  puntosIniciales: v[0] ?? 0,
  arbolHeroe: v[1] ?? 0,
  heroe: v[2] ?? 0,
  categoria: v[3] ?? 0,
  despertar: v[4] ?? 0,
  merito: v[5] ?? 0,
  entrenamiento: v[6] ?? 0,
  regalo: v[7] ?? 0,
  drogasShoko: v[8] ?? 0,
  otros: v[9] ?? 0,
})

export const edward: Character = {
  id: 'edward',
  name: 'Edward',
  playerName: 'Mauro',
  retired: false,
  className: 'Boxeador',
  tiers: {
    fuerza: 1, constitucion: 1,
    destreza: 2, percepcion: 2, carisma: 2,
    inteligencia: 3, sabiduria: 3,
  },
  multipliers: {
    fuerza: 1.1, destreza: 1, constitucion: 1.4, percepcion: 1,
    inteligencia: 0.9, sabiduria: 0.6, carisma: 1,
  },
  sources: {
    fuerza: S([103, 26, 40, 48.4, 10, 24, 50, 34]),
    destreza: S([60, 36, 40, 44, 10, 3, 50, 10]),
    constitucion: S([117, 44, 40, 61.6, 10, 10, 50, 10]),
    percepcion: S([68, 20, 40, 44, 10, 20, 50, 45]),
    inteligencia: S([14, 12, 40, 39.6, 10, 0, 0, 10]),
    sabiduria: S([40, 22, 40, 26.4, 10, 15, 20, 36]),
    carisma: S([40, 22, 40, 44, 10, 7, 0, 10]),
  },
  energy: { baseMana: 1, baseStamina: 300, bonusMana: 110, bonusStamina: 165 },
  derived: {
    physDamageWeapon: { kind: 'pesada', rankSteps: 0 },
    magicDamageWeapon: null,
    physDefenseArmor: { kind: 'pesada', rankSteps: -1 },
    magicDefenseArmor: { kind: 'ligera', rankSteps: -2 },
    magicDefenseWeights: { constitucion: 0.1, sabiduria: 0.9 },
    agilityStat: 'fuerza',
  },
  baseHealth: { leve: 10, medio: 7, letal: 3 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
