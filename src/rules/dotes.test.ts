import { describe, expect, it } from 'vitest'
import {
  DOTE_TIERS,
  DOTE_TYPES,
  USE_SUGGESTIONS,
  allowedTiers,
  doteOwners,
  filterDotes,
  isFreeSlot,
  ladderTier,
  matchDote,
  mergeDotes,
  normalizeDoteName,
  ownedDotes,
  slotPlace,
  sortBySlot,
  sortDotes,
  sortDotesBy,
  sortOwned,
  kindsOfUse,
  validateDote,
} from './index'
import type { CatalogDote, Dote, NewDote } from './index'

const make = (over: Partial<NewDote> & { name: string }, id = over.name): CatalogDote => ({
  id,
  tier: 'E',
  type: 'fuerza',
  use: 'Pasiva',
  description: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('catálogo de dotes: estructura', () => {
  it('hay 6 tiers y 8 tipos: los 7 stats y las únicas', () => {
    expect([...DOTE_TIERS]).toEqual(['E', 'D', 'C', 'B', 'A', 'S'])
    expect([...DOTE_TYPES]).toEqual(['fuerza', 'destreza', 'constitucion', 'percepcion', 'inteligencia', 'sabiduria', 'carisma', 'unico'])
  })

  it('los usos más comunes se ofrecen como sugerencia', () => {
    expect(USE_SUGGESTIONS).toContain('Pasiva')
    expect(USE_SUGGESTIONS).toContain('Reacción, 2 por batalla')
    expect(USE_SUGGESTIONS).toContain('Pasiva y 2 por descanso largo')
  })
})

describe('formas de uso', () => {
  it('reconoce pasivas, reacciones, acciones adicionales, batallas y descansos', () => {
    expect(kindsOfUse('Pasiva')).toEqual(['pasiva'])
    expect(kindsOfUse('Reacción, 2 por batalla')).toEqual(['reaccion', 'batalla'])
    expect(kindsOfUse('Acción adicional, 1 por batalla')).toEqual(['accion', 'batalla'])
    expect(kindsOfUse('2 por descanso largo')).toEqual(['descanso'])
    expect(kindsOfUse('Pasiva y 2 por descanso largo')).toEqual(['pasiva', 'descanso'])
    expect(kindsOfUse('Descanso corto')).toEqual(['descanso'])
    expect(kindsOfUse('lo que sea')).toEqual([])
  })
})

describe('emparejar por nombre', () => {
  const catalog = [
    make({ name: 'Hombre Araña de barrio', type: 'fuerza' }),
    make({ name: 'Ojo de halcón', type: 'percepcion' }),
    make({ name: 'Ojo de halcón', type: 'unico', tier: 'S' }, 'unica'),
  ]

  it('ignora tildes, mayúsculas y el (E) del tier al final', () => {
    expect(normalizeDoteName('  Hombre Araña de Barrio (E) ')).toBe('hombre arana de barrio')
    expect(normalizeDoteName('Ojo de halcón (D)')).toBe('ojo de halcon')
    expect(normalizeDoteName('Placaje (fuerte)')).toBe('placaje (fuerte)') // un paréntesis que no es un tier se conserva
  })

  it('encuentra la dote del catálogo con el nombre que se escribió a mano', () => {
    expect(matchDote('Hombre Araña de barrio (E)', catalog)?.name).toBe('Hombre Araña de barrio')
    expect(matchDote('hombre arana de barrio', catalog)?.type).toBe('fuerza')
  })

  it('si hay dos con el mismo nombre, prefiere la del tipo pedido', () => {
    expect(matchDote('Ojo de halcón', catalog, 'unico')?.id).toBe('unica')
    expect(matchDote('Ojo de halcón', catalog, 'percepcion')?.type).toBe('percepcion')
  })

  it('devuelve null si no hay coincidencia o el nombre está vacío', () => {
    expect(matchDote('No existe', catalog)).toBeNull()
    expect(matchDote('   ', catalog)).toBeNull()
  })
})

describe('ordenar y filtrar', () => {
  const list = [
    make({ name: 'Zeta', type: 'carisma', tier: 'S' }),
    make({ name: 'Beta', type: 'fuerza', tier: 'D', use: 'Reacción, 2 por batalla', description: 'Cuando te impacta un ataque físico, +1 al d8' }),
    make({ name: 'Alfa', type: 'fuerza', tier: 'E' }),
    make({ name: 'Gamma', type: 'unico', tier: 'C', use: '2 por descanso largo' }),
    make({ name: 'Épsilon', type: 'fuerza', tier: 'E' }),
  ]

  it('van por tipo, por tier y por nombre', () => {
    expect(sortDotes(list).map((d) => d.name)).toEqual(['Alfa', 'Épsilon', 'Beta', 'Zeta', 'Gamma'])
  })

  it('filtra por tipo, por tier y por forma de uso', () => {
    expect(filterDotes(list, { type: 'fuerza' })).toHaveLength(3)
    expect(filterDotes(list, { tier: 'E' }).map((d) => d.name)).toEqual(['Alfa', 'Épsilon'])
    expect(filterDotes(list, { kind: 'reaccion' }).map((d) => d.name)).toEqual(['Beta'])
    expect(filterDotes(list, { kind: 'descanso' }).map((d) => d.name)).toEqual(['Gamma'])
    expect(filterDotes(list, { type: 'todos', tier: 'todos', kind: 'todos' })).toHaveLength(5)
  })

  it('busca en el nombre, el uso y la descripción sin importar tildes', () => {
    expect(filterDotes(list, { query: 'epsilon' }).map((d) => d.name)).toEqual(['Épsilon'])
    expect(filterDotes(list, { query: 'D8' }).map((d) => d.name)).toEqual(['Beta'])
    expect(filterDotes(list, { query: 'reaccion' }).map((d) => d.name)).toEqual(['Beta'])
    expect(filterDotes(list, { query: 'nada de nada' })).toEqual([])
  })

  it('los filtros se combinan', () => {
    expect(filterDotes(list, { type: 'fuerza', tier: 'E', query: 'alfa' }).map((d) => d.name)).toEqual(['Alfa'])
  })
})

describe('validar', () => {
  const ok: NewDote = { tier: 'E', name: 'Chispa', type: 'inteligencia', use: 'Pasiva', description: '' }

  it('una dote completa está bien, y el uso y la descripción pueden quedar vacíos', () => {
    expect(validateDote(ok)).toEqual([])
    expect(validateDote({ ...ok, use: '', description: '' })).toEqual([])
  })

  it('pide nombre, tier y tipo válidos', () => {
    expect(validateDote({ ...ok, name: '   ' })).toEqual(['La dote necesita un nombre.'])
    expect(validateDote({ ...ok, tier: 'Z' as never })).toHaveLength(1)
    expect(validateDote({ ...ok, type: 'poder' as never })).toHaveLength(1)
  })
})

describe('sumar dotes al catálogo (importar)', () => {
  const base = [make({ name: 'Chispa', type: 'inteligencia', description: 'vieja' })]

  it('agrega las nuevas, actualiza las que cambiaron y deja las iguales', () => {
    const incoming: NewDote[] = [
      { tier: 'E', name: 'Chispa', type: 'inteligencia', use: 'Pasiva', description: 'nueva' }, // cambió
      { tier: 'E', name: 'Nueva', type: 'fuerza', use: 'Pasiva', description: '' }, // nueva
    ]
    const { next, result } = mergeDotes(base, incoming, '2026-02-02T00:00:00.000Z')
    expect(result).toEqual({ added: 1, updated: 1, unchanged: 0 })
    expect(next).toHaveLength(2)
    const chispa = next.find((d) => d.name === 'Chispa')!
    expect(chispa.description).toBe('nueva')
    expect(chispa.id).toBe('Chispa') // conserva su identidad
    expect(chispa.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(chispa.updatedAt).toBe('2026-02-02T00:00:00.000Z')
  })

  it('una dote igual no cuenta como cambio', () => {
    const { result } = mergeDotes(base, [{ tier: 'E', name: 'Chispa', type: 'inteligencia', use: 'Pasiva', description: 'vieja' }])
    expect(result).toEqual({ added: 0, updated: 0, unchanged: 1 })
  })

  it('si solo cambia cómo está escrito el nombre, se actualiza el nombre y no se duplica', () => {
    const { next, result } = mergeDotes(base, [{ tier: 'E', name: 'CHISPA', type: 'inteligencia', use: 'Pasiva', description: 'vieja' }])
    expect(result).toEqual({ added: 0, updated: 1, unchanged: 0 })
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('CHISPA')
  })

  it('el mismo nombre en otro tipo es otra dote', () => {
    const { next, result } = mergeDotes(base, [{ tier: 'S', name: 'Chispa', type: 'unico', use: '', description: '' }])
    expect(result.added).toBe(1)
    expect(next).toHaveLength(2)
  })

  it('nunca borra lo que ya estaba', () => {
    expect(mergeDotes(base, []).next).toEqual(base)
  })
})

describe('la escalera de tiers', () => {
  it('cada dote avanza un paso: E, D, C, B, A, S y de nuevo E', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(ladderTier)).toEqual(['E', 'D', 'C', 'B', 'A', 'S', 'E', 'D'])
  })

  it('se puede elegir del tier que toca o de uno más bajo', () => {
    expect(allowedTiers(0)).toEqual(['E'])
    expect(allowedTiers(2)).toEqual(['E', 'D', 'C'])
    expect(allowedTiers(5)).toEqual(['E', 'D', 'C', 'B', 'A', 'S'])
    expect(allowedTiers(6)).toEqual(['E']) // vuelve a empezar
  })
})

describe('ordenar de varias formas', () => {
  const list = [
    make({ name: 'Zeta', type: 'carisma', tier: 'S', use: '2 por descanso largo' }),
    make({ name: 'Beta', type: 'fuerza', tier: 'D', use: 'Reacción, 2 por batalla' }),
    make({ name: 'Alfa', type: 'fuerza', tier: 'E', use: 'Pasiva' }),
    make({ name: 'Gamma', type: 'destreza', tier: 'E', use: '1 por batalla' }),
    make({ name: 'Delta', type: 'unico', tier: 'C', use: 'Algo raro' }),
  ]
  const names = (sort: Parameters<typeof sortDotesBy>[1]) => sortDotesBy(list, sort).map((d) => d.name)

  it('por stat y tier (el de siempre)', () => {
    expect(names('tipo')).toEqual(['Alfa', 'Beta', 'Gamma', 'Zeta', 'Delta'])
  })

  it('por tier, de menor a mayor y al revés, desempatando por stat y nombre', () => {
    expect(names('tier-asc')).toEqual(['Alfa', 'Gamma', 'Beta', 'Delta', 'Zeta'])
    expect(names('tier-desc')).toEqual(['Zeta', 'Delta', 'Beta', 'Alfa', 'Gamma'])
  })

  it('por nombre', () => {
    expect(names('nombre')).toEqual(['Alfa', 'Beta', 'Delta', 'Gamma', 'Zeta'])
  })

  it('por forma de uso: pasivas, reacciones, de batalla, de descanso y al final las que no tienen forma conocida', () => {
    expect(names('uso')).toEqual(['Alfa', 'Beta', 'Gamma', 'Zeta', 'Delta'])
  })

  it('no modifica la lista original', () => {
    const before = list.map((d) => d.name)
    sortDotesBy(list, 'nombre')
    expect(list.map((d) => d.name)).toEqual(before)
  })
})

describe('quién tiene cada dote', () => {
  const catalog = [
    make({ name: 'Piña limpia', type: 'fuerza' }, 'pina'),
    make({ name: 'Chispa', type: 'inteligencia' }, 'chispa'),
    make({ name: 'Bip bip', type: 'destreza' }, 'bip'),
  ]
  const owned = (id: string, name: string, nodeId: string, catalogId?: string): Dote => ({ id, name, description: '', nodeId, ...(catalogId ? { catalogId } : {}) })
  const person = (id: string, name: string, dotes: Dote[]) => ({
    id,
    name,
    playerName: `Jug ${name}`,
    tree: { bp: 0, mh: 0, gates: { stage2: false, stage3: false }, purchases: [], dotes },
  })
  const ed = person('1', 'Edward', [owned('a', 'Piña limpia', 'fuerza:1:4', 'pina'), owned('b', 'chispa (E)', 'inteligencia:1:4'), owned('c', 'Inventada', 'fuerza:1:9')])
  const roy = person('2', 'Roy', [owned('d', 'Piña limpia', 'fuerza:1:4', 'pina')])

  it('una dote del catálogo, vinculada o escrita igual, se reconoce', () => {
    expect(ownedDotes(ed, catalog).map((o) => o.catalog?.id ?? null)).toEqual(['pina', 'chispa', null])
  })

  it('una vinculación a una dote borrada cae en el nombre', () => {
    const huérfana = person('3', 'X', [owned('e', 'Bip bip', 'destreza:1:4', 'borrada')])
    expect(ownedDotes(huérfana, catalog)[0].catalog?.id).toBe('bip')
  })

  it('arma el mapa de quiénes tienen cada una, sin repetir a nadie', () => {
    const doble = person('1', 'Edward', [...ed.tree.dotes, owned('z', 'Piña limpia', 'fuerza:1:9', 'pina')])
    const owners = doteOwners(catalog, [doble, roy])
    expect(owners.get('pina')?.map((o) => o.name)).toEqual(['Edward', 'Roy'])
    expect(owners.get('chispa')?.map((o) => o.name)).toEqual(['Edward'])
    expect(owners.has('bip')).toBe(false)
  })

  it('filtra por jugador y por "nadie"', () => {
    const owners = doteOwners(catalog, [ed, roy])
    expect(filterDotes(catalog, { owner: '2' }, owners).map((d) => d.id)).toEqual(['pina'])
    expect(filterDotes(catalog, { owner: '1' }, owners).map((d) => d.id)).toEqual(['pina', 'chispa'])
    expect(filterDotes(catalog, { owner: 'nadie' }, owners).map((d) => d.id)).toEqual(['bip'])
    expect(filterDotes(catalog, { owner: 'todos' }, owners)).toHaveLength(3)
  })

  it('ordena las dotes de un personaje: por stat, por tier, por nombre o como las compró', () => {
    const cat = [
      make({ name: 'Uno', type: 'fuerza', tier: 'D' }, 'u'),
      make({ name: 'Dos', type: 'fuerza', tier: 'E' }, 'd'),
      make({ name: 'Tres', type: 'destreza', tier: 'S' }, 't'),
    ]
    const p = person('9', 'P', [owned('1', 'Tres', 'destreza:1:4', 't'), owned('2', 'Suelta', 'carisma:1:4'), owned('3', 'Uno', 'fuerza:1:4', 'u'), owned('4', 'Dos', 'fuerza:1:9', 'd')])
    const name = (o: ReturnType<typeof ownedDotes>[number]) => o.catalog?.name ?? o.owned.name
    const items = ownedDotes(p, cat)
    expect(sortOwned(items, 'tipo').map(name)).toEqual(['Dos', 'Uno', 'Tres', 'Suelta'])
    expect(sortOwned(items, 'tier').map(name)).toEqual(['Dos', 'Uno', 'Tres', 'Suelta']) // la que no está en el catálogo, al final
    expect(sortOwned(items, 'nombre').map(name)).toEqual(['Dos', 'Suelta', 'Tres', 'Uno'])
    expect(sortOwned(items, 'compra').map(name)).toEqual(['Tres', 'Suelta', 'Uno', 'Dos'])
  })
})

describe('espacios de dote del árbol', () => {
  const slot = (nodeId: string, over: Partial<Dote> = {}): Dote => ({ id: nodeId, name: '', description: '', nodeId, ...over })

  it('lee de qué rama, etapa y nodo es una dote', () => {
    expect(slotPlace('fuerza:1:4')).toEqual({ branch: 'fuerza', stage: 1, node: 5 })
    expect(slotPlace('categoria:3:9')).toEqual({ branch: 'categoria', stage: 3, node: 10 })
    expect(slotPlace('rama:1:4')).toBeNull()
    expect(slotPlace('fuerza:x:4')).toBeNull()
  })

  it('las ordena por rama, etapa y nodo, con las desconocidas al final', () => {
    const order = sortBySlot([slot('percepcion:2:4'), slot('raro'), slot('fuerza:1:9'), slot('destreza:1:4'), slot('fuerza:1:4'), slot('fuerza:2:4')])
    expect(order.map((d) => d.nodeId)).toEqual(['fuerza:1:4', 'fuerza:1:9', 'fuerza:2:4', 'destreza:1:4', 'percepcion:2:4', 'raro'])
  })

  it('un espacio está libre si no tiene dote del catálogo ni nada escrito', () => {
    expect(isFreeSlot(slot('fuerza:1:4'))).toBe(true)
    expect(isFreeSlot(slot('fuerza:1:4', { name: '   ' }))).toBe(true)
    expect(isFreeSlot(slot('fuerza:1:4', { name: 'Algo' }))).toBe(false)
    expect(isFreeSlot(slot('fuerza:1:4', { catalogId: 'x' }))).toBe(false)
  })
})
