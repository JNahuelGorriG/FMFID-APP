import { describe, expect, it } from 'vitest'
import {
  DOTE_TIERS,
  DOTE_TYPES,
  USE_SUGGESTIONS,
  allowedTiers,
  filterDotes,
  ladderTier,
  matchDote,
  mergeDotes,
  normalizeDoteName,
  sortDotes,
  useKinds,
  validateDote,
} from './index'
import type { CatalogDote, NewDote } from './index'

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
    expect(useKinds('Pasiva')).toEqual(['pasiva'])
    expect(useKinds('Reacción, 2 por batalla')).toEqual(['reaccion', 'batalla'])
    expect(useKinds('Acción adicional, 1 por batalla')).toEqual(['accion', 'batalla'])
    expect(useKinds('2 por descanso largo')).toEqual(['descanso'])
    expect(useKinds('Pasiva y 2 por descanso largo')).toEqual(['pasiva', 'descanso'])
    expect(useKinds('Descanso corto')).toEqual(['descanso'])
    expect(useKinds('lo que sea')).toEqual([])
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
