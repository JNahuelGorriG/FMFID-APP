import { describe, expect, it } from 'vitest'
import {
  BRANCHES,
  appliedTotals,
  branchNodes,
  branchState,
  characterSheet,
  completedBranches,
  emptyTree,
  energySplit,
  findNode,
  orientation,
  purchaseNext,
  statTotal,
  treeOf,
  undoLastPurchase,
} from './index'
import type { Character, Choice, BranchId } from './index'
import { edward } from './fixtures'

const withBp = (bp: number, base: Character = edward): Character => ({ ...base, tree: { ...emptyTree(), bp } })

/** Compra n nodos de una rama, siempre con la primera opción. */
function buy(c: Character, branch: BranchId, choices: Choice[]): Character {
  return choices.reduce((acc, choice) => purchaseNext(acc, branch, choice), c)
}

describe('estructura del árbol', () => {
  it('hay 9 ramas: 30 nodos las de stat y Categoría, 28 la de Héroe', () => {
    expect(BRANCHES).toHaveLength(9)
    expect(branchNodes('fuerza')).toHaveLength(30)
    expect(branchNodes('categoria')).toHaveLength(30)
    expect(branchNodes('heroe')).toHaveLength(28)
  })

  it('los costos suman 14, 24 y 34 BP por etapa', () => {
    const sum = (stage: number) =>
      branchNodes('fuerza').filter((n) => n.stage === stage).reduce((s, n) => s + n.cost, 0)
    expect([sum(1), sum(2), sum(3)]).toEqual([14, 24, 34])
  })

  it('cada tipo de nodo ofrece sus opciones', () => {
    const [stat, e25, e30, mh, dote] = branchNodes('fuerza')
    expect(stat.options).toEqual(['stat'])
    expect([e25.options, e25.energy, e25.points]).toEqual([['energia', 'stat'], 25, 2])
    expect([e30.options, e30.energy, e30.points]).toEqual([['energia', 'stat'], 30, 3])
    expect([mh.options, mh.mh, mh.points]).toEqual([['mh', 'stat'], 2, 4])
    expect(dote.options).toEqual(['dote', 'hab'])
  })

  it('Héroe tiene habilidades fijas y Categoría un dote único', () => {
    const heroe = branchNodes('heroe')
    expect(heroe[4]).toMatchObject({ label: 'Analizar Armamento', options: ['hab'] })
    expect(heroe[9]).toMatchObject({ label: 'Mapa' })
    expect(branchNodes('categoria')[4]).toMatchObject({ label: 'Dote único', options: ['dote'] })
  })

  it('un id de nodo se puede volver a buscar', () => {
    expect(findNode('fuerza:1:1')?.cost).toBe(1)
    expect(findNode('heroe:3:4')).toBeUndefined()
    expect(findNode('nada:1:1')).toBeUndefined()
  })
})

describe('comprar nodos', () => {
  it('descuenta BP y suma el stat a la fuente Árbol Héroe de esa rama', () => {
    const after = purchaseNext(withBp(5), 'fuerza', 'stat')
    expect(after.sources.fuerza.arbolHeroe).toBe(edward.sources.fuerza.arbolHeroe + 2)
    expect(after.sources.destreza.arbolHeroe).toBe(edward.sources.destreza.arbolHeroe)
    expect(treeOf(after).bp).toBe(4)
    expect(treeOf(after).purchases[0]).toMatchObject({ nodeId: 'fuerza:1:0', choice: 'stat', cost: 1 })
  })

  it('un nodo de elección: energía o puntos de stat', () => {
    const base = buy(withBp(10), 'fuerza', ['stat'])
    const energy = purchaseNext(base, 'fuerza', 'energia')
    expect(energy.energy.bonusStamina).toBe(edward.energy.bonusStamina + 25)
    expect(energy.sources.fuerza.arbolHeroe).toBe(base.sources.fuerza.arbolHeroe)

    const points = purchaseNext(base, 'fuerza', 'stat')
    expect(points.sources.fuerza.arbolHeroe).toBe(base.sources.fuerza.arbolHeroe + 2)
    expect(points.energy.bonusStamina).toBe(edward.energy.bonusStamina)
  })

  it('"2 MH o 4 P. Stat": mejora de habilidad o puntos', () => {
    const base = buy(withBp(10), 'fuerza', ['stat', 'stat', 'stat'])
    const mh = purchaseNext(base, 'fuerza', 'mh')
    expect(treeOf(mh).mh).toBe(2)
    const points = purchaseNext(base, 'fuerza', 'stat')
    expect(points.sources.fuerza.arbolHeroe).toBe(base.sources.fuerza.arbolHeroe + 4)
    expect(treeOf(points).mh).toBe(0)
  })

  it('una opción que no existe en el nodo da error', () => {
    expect(() => purchaseNext(withBp(5), 'fuerza', 'mh')).toThrow()
    expect(() => purchaseNext(withBp(5), 'fuerza', 'energia')).toThrow() // el primer nodo es solo "2 Stat"
  })

  it('si faltan BP no compra y avisa', () => {
    expect(() => purchaseNext(withBp(0), 'fuerza', 'stat')).toThrow(/Faltan BP/)
  })

  it('el nodo de dote o habilidad: la dote se anota (nombre y descripción opcionales)', () => {
    const base = buy(withBp(20), 'fuerza', ['stat', 'stat', 'stat', 'stat'])
    const dote = purchaseNext(base, 'fuerza', 'dote', { note: 'Golpe certero', description: 'Ignora 10 de defensa' })
    expect(treeOf(dote).dotes).toEqual([
      { id: 'fuerza:1:4', name: 'Golpe certero', description: 'Ignora 10 de defensa', nodeId: 'fuerza:1:4' },
    ])

    const blank = purchaseNext(base, 'fuerza', 'dote')
    expect(treeOf(blank).dotes[0]).toMatchObject({ name: '', description: '' })

    const hab = purchaseNext(base, 'fuerza', 'hab', { note: 'Corte veloz' })
    expect(treeOf(hab).dotes).toEqual([])
    expect(treeOf(hab).purchases.at(-1)).toMatchObject({ choice: 'hab', note: 'Corte veloz' })
  })
})

describe('orden y compuertas', () => {
  const stage1 = (): Character => buy(withBp(200), 'fuerza', ['stat', 'stat', 'stat', 'stat', 'hab', 'stat', 'stat', 'stat', 'stat', 'hab'])

  it('se compra de arriba hacia abajo: solo el primer nodo sin comprar está disponible', () => {
    const state = branchState(treeOf(withBp(5)), 'fuerza')
    expect(state[0].status).toBe('disponible')
    expect(state[1].status).toBe('bloqueado')
    expect(state[1].reason).toMatch(/nodos de arriba/)
  })

  it('al completar la etapa 1, la 2 espera la compuerta', () => {
    const c = stage1()
    expect(treeOf(c).purchases).toHaveLength(10)
    const next = branchState(treeOf(c), 'fuerza').find((n) => n.status !== 'comprado')
    expect(next?.status).toBe('bloqueado')
    expect(next?.reason).toMatch(/Compuerta cerrada/)
    expect(() => purchaseNext(c, 'fuerza', 'stat')).toThrow(/Compuerta cerrada/)
  })

  it('con la compuerta abierta se sigue, y cada rama avanza por su cuenta', () => {
    const open = { ...stage1(), tree: { ...treeOf(stage1()), gates: { stage2: true, stage3: false } } }
    const after = purchaseNext(open, 'fuerza', 'stat')
    expect(treeOf(after).purchases.at(-1)?.nodeId).toBe('fuerza:2:0')

    // otra rama sigue en su etapa 1
    const other = purchaseNext(open, 'destreza', 'stat')
    expect(treeOf(other).purchases.at(-1)?.nodeId).toBe('destreza:1:0')
  })

  it('una rama completa avisa', () => {
    expect(() => {
      let c: Character = { ...withBp(500), tree: { ...emptyTree(), bp: 500, gates: { stage2: true, stage3: true } } }
      for (let i = 0; i < 31; i++) c = purchaseNext(c, 'fuerza', i === 0 || i % 5 !== 4 ? 'stat' : 'hab')
    }).toThrow(/ya está completa/)
  })

  it('las ramas completas se cuentan', () => {
    let c: Character = { ...withBp(500), tree: { ...emptyTree(), bp: 500, gates: { stage2: true, stage3: true } } }
    for (let i = 0; i < 30; i++) c = purchaseNext(c, 'fuerza', i % 5 === 4 ? 'hab' : 'stat')
    expect(completedBranches(treeOf(c))).toEqual(['fuerza'])
  })
})

describe('reparto de la energía', () => {
  it('estamina para Fuerza, Destreza y Constitución; maná para Inteligencia, Sabiduría y Carisma', () => {
    expect(energySplit('fuerza', 25, 'magica')).toEqual({ mana: 0, stamina: 25 })
    expect(energySplit('constitucion', 25, 'magica')).toEqual({ mana: 0, stamina: 25 })
    expect(energySplit('inteligencia', 30, 'fisica')).toEqual({ mana: 30, stamina: 0 })
    expect(energySplit('carisma', 25, 'fisica')).toEqual({ mana: 25, stamina: 0 })
  })

  it('Percepción reparte a partes iguales y Héroe da el mismo valor a las dos', () => {
    expect(energySplit('percepcion', 25, 'fisica')).toEqual({ mana: 12.5, stamina: 12.5 })
    expect(energySplit('heroe', 25, 'fisica')).toEqual({ mana: 25, stamina: 25 })
  })

  it('Categoría da 2/3 a la orientación del personaje y 1/3 a la otra', () => {
    const phys = energySplit('categoria', 30, 'fisica')
    expect(phys.stamina).toBeCloseTo(20, 6)
    expect(phys.mana).toBeCloseTo(10, 6)
    const mag = energySplit('categoria', 30, 'magica')
    expect(mag.mana).toBeCloseTo(20, 6)
    expect(mag.stamina).toBeCloseTo(10, 6)
  })

  it('la orientación sale de las bases de energía', () => {
    expect(orientation({ energy: { baseMana: 100, baseStamina: 200, bonusMana: 0, bonusStamina: 0 } })).toBe('fisica')
    expect(orientation({ energy: { baseMana: 200, baseStamina: 100, bonusMana: 0, bonusStamina: 0 } })).toBe('magica')
    expect(orientation({ energy: { baseMana: 100, baseStamina: 100, bonusMana: 0, bonusStamina: 0 } })).toBe('neutra')
    expect(orientation(edward)).toBe('fisica') // Edward: base de estamina 300 y de maná 1
  })
})

describe('Héroe y Categoría', () => {
  it('Héroe: los puntos van a todos los stats (fuente Héroe) y la energía a las dos', () => {
    const c = buy(withBp(20), 'heroe', ['stat', 'energia'])
    for (const stat of ['fuerza', 'destreza', 'constitucion', 'percepcion', 'inteligencia', 'sabiduria', 'carisma'] as const) {
      expect(c.sources[stat].heroe).toBe(edward.sources[stat].heroe + 2)
    }
    expect(c.energy.bonusMana).toBe(edward.energy.bonusMana + 25)
    expect(c.energy.bonusStamina).toBe(edward.energy.bonusStamina + 25)
  })

  it('Categoría: los puntos van a todos los stats y se ven multiplicados por el multiplicador de cada uno', () => {
    const c = purchaseNext(withBp(5), 'categoria', 'stat')
    const before = statTotal(edward.sources.fuerza, edward.multipliers.fuerza)
    const after = statTotal(c.sources.fuerza, c.multipliers.fuerza)
    expect(after - before).toBeCloseTo(2 * 1.1, 6) // Fuerza de Edward ×1,1
    const sab = statTotal(c.sources.sabiduria, c.multipliers.sabiduria) - statTotal(edward.sources.sabiduria, edward.multipliers.sabiduria)
    expect(sab).toBeCloseTo(2 * 0.6, 6) // Sabiduría de Edward ×0,6
  })

  it('Categoría: la energía va 2/3 a la orientación (Edward es físico)', () => {
    const c = buy(withBp(10), 'categoria', ['stat', 'energia'])
    expect(c.energy.bonusStamina).toBeCloseTo(edward.energy.bonusStamina + 25 * (2 / 3), 6)
    expect(c.energy.bonusMana).toBeCloseTo(edward.energy.bonusMana + 25 / 3, 6)
  })

  it('las habilidades de Héroe y el dote único no tocan stats', () => {
    let c = buy(withBp(40), 'heroe', ['stat', 'stat', 'stat', 'stat'])
    const before = characterSheet(c).totals
    c = purchaseNext(c, 'heroe', 'hab')
    expect(characterSheet(c).totals).toEqual(before)
    expect(treeOf(c).purchases.at(-1)?.nodeId).toBe('heroe:1:4')
  })
})

describe('deshacer y totales', () => {
  it('deshacer la última compra devuelve BP y quita lo que sumó', () => {
    const base = buy(withBp(10), 'fuerza', ['stat', 'energia'])
    const undone = undoLastPurchase(base, 'fuerza')
    expect(treeOf(undone).bp).toBe(9)
    expect(undone.energy.bonusStamina).toBe(edward.energy.bonusStamina)
    expect(treeOf(undone).purchases).toHaveLength(1)
    expect(() => undoLastPurchase(withBp(1), 'fuerza')).toThrow()
  })

  it('deshacer una dote la quita de la lista', () => {
    const c = purchaseNext(buy(withBp(20), 'fuerza', ['stat', 'stat', 'stat', 'stat']), 'fuerza', 'dote', { note: 'X' })
    expect(treeOf(undoLastPurchase(c, 'fuerza')).dotes).toEqual([])
  })

  it('deshacer una MH resta las MH', () => {
    const c = buy(withBp(20), 'fuerza', ['stat', 'stat', 'stat', 'mh'])
    expect(treeOf(c).mh).toBe(2)
    expect(treeOf(undoLastPurchase(c, 'fuerza')).mh).toBe(0)
  })

  it('suma lo aplicado por las compras', () => {
    const c = buy(buy(withBp(40), 'fuerza', ['stat', 'energia']), 'heroe', ['stat'])
    const totals = appliedTotals(treeOf(c))
    expect(totals.arbolHeroe.fuerza).toBe(2)
    expect(totals.heroe).toBe(2)
    expect(totals.stamina).toBe(25)
    expect(totals.bp).toBe(3)
  })

  it('un personaje sin árbol empieza vacío', () => {
    expect(treeOf(edward)).toEqual(emptyTree())
  })
})
