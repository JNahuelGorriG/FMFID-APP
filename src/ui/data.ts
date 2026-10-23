import { createNpcRepository, createRepository, db } from '../db'

/** Repositorios únicos de la app. */
export const repo = createRepository(db)
export const npcRepo = createNpcRepository(db)
