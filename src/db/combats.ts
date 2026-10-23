import type { AppDB } from './db'
import { initialState, newCombat } from '../rules'
import type { CharacterState, Combat, World } from '../rules'

export function createCombatRepository(db: AppDB) {
  /** Estados vivos de los jugadores de un combate. Si alguno no existe, se arma el inicial (sin guardarlo). */
  async function loadStates(combat: Combat): Promise<Record<string, CharacterState>> {
    const states: Record<string, CharacterState> = {}
    for (const p of combat.participants) {
      if (p.kind !== 'pc' || !p.characterId || states[p.characterId]) continue
      const saved = await db.characterStates.get(p.characterId)
      if (saved) {
        states[p.characterId] = saved
        continue
      }
      const character = await db.characters.get(p.characterId)
      if (character) states[p.characterId] = initialState(character)
    }
    return states
  }

  return {
    async create(name: string): Promise<Combat> {
      const combat = newCombat(name)
      await db.combats.add(combat)
      return combat
    },

    /** Más recientes primero. */
    async list(): Promise<Combat[]> {
      const all = await db.combats.toArray()
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async loadWorld(id: string): Promise<World | undefined> {
      const combat = await db.combats.get(id)
      if (!combat) return undefined
      return { combat, states: await loadStates(combat) }
    },

    /**
     * Aplica un cambio al combate y a los estados de sus jugadores en una sola operación,
     * y lo guarda. Es la única forma de modificarlos.
     */
    async update(id: string, change: (world: World) => World): Promise<World> {
      return db.transaction('rw', db.combats, db.characterStates, db.characters, async () => {
        const combat = await db.combats.get(id)
        if (!combat) throw new Error('Combate inexistente.')
        const next = change({ combat, states: await loadStates(combat) })
        // Jugadores recién agregados por el cambio: se les arma su estado inicial.
        const states = { ...(await loadStates(next.combat)), ...next.states }
        await db.combats.put({ ...next.combat, updatedAt: new Date().toISOString() })
        await db.characterStates.bulkPut(Object.values(states))
        return { combat: next.combat, states }
      })
    },

    /**
     * Borra un combate. Los buffs y barreras que corrían con él quedan en el personaje,
     * pero ya no bajan solos (pasan a manuales).
     */
    async remove(id: string): Promise<void> {
      await db.transaction('rw', db.combats, db.characterStates, async () => {
        const states = await db.characterStates.toArray()
        const freed = states
          .filter(
            (s) =>
              s.effects.some((e) => e.combatId === id) || s.barriers.some((b) => b.combatId === id),
          )
          .map((s) => ({
            ...s,
            effects: s.effects.map((e) => (e.combatId === id ? { ...e, combatId: null } : e)),
            barriers: s.barriers.map((b) => (b.combatId === id ? { ...b, combatId: null } : b)),
          }))
        await db.characterStates.bulkPut(freed)
        await db.combats.delete(id)
      })
    },
  }
}

export type CombatRepository = ReturnType<typeof createCombatRepository>
