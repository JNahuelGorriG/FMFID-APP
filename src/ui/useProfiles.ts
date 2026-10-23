import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { buildProfile } from '../rules'
import type { Combat, Profile } from '../rules'
import { repo } from './data'

/** Perfiles (stats efectivos, daño y defensas) de los participantes de un combate. */
export function useProfiles(combat: Combat | undefined): Profile[] | undefined {
  const characters = useLiveQuery(() => repo.list({ includeRetired: true }), [])
  return useMemo(() => {
    if (!combat || !characters) return undefined
    const byId = new Map(characters.map((c) => [c.id, c]))
    return combat.participants
      .map((p) => buildProfile(p, p.characterId ? byId.get(p.characterId) : undefined))
      .filter((p): p is Profile => p !== null)
  }, [combat, characters])
}
