import {
  createCombatRepository,
  createNpcRepository,
  createRepository,
  createSettingsRepository,
  db,
} from '../db'

/** Repositorios únicos de la app. */
export const repo = createRepository(db)
export const npcRepo = createNpcRepository(db)
export const combatRepo = createCombatRepository(db)
export const settingsRepo = createSettingsRepository(db)
