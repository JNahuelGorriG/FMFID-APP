import { createRepository, db } from '../db'

/** Repositorio único de la app. */
export const repo = createRepository(db)
