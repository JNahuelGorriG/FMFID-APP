// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { edward } from '../rules/fixtures'
import { combatRepo, npcRepo, repo } from './data'
import { defaultEnemyProfile, emptyTree, newNpcTemplate, purchaseNext, updateParticipant } from '../rules'
import type { Character } from '../rules'

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(async () => {
  localStorage.clear()
  await db.characters.clear()
  await db.changes.clear()
  await db.npcs.clear()
  await db.combats.clear()
})
afterEach(() => cleanup())

describe('app', () => {
  it('sin personajes invita a importar', async () => {
    render(<App />)
    expect(await screen.findByText('Todavía no hay personajes.')).toBeTruthy()
  })

  it('lista personajes con su rango y oculta los retirados', async () => {
    await repo.create(edwardData)
    await repo.create({ ...edwardData, name: 'Ciro', retired: true })
    render(<App />)
    expect(await screen.findByText('Edward')).toBeTruthy()
    expect(screen.getByText('C+')).toBeTruthy()
    expect(screen.queryByText('Ciro')).toBeNull()

    fireEvent.click(screen.getByLabelText('Mostrar retirados'))
    expect(await screen.findByText('Ciro')).toBeTruthy()
  })

  it('la ficha muestra los 7 stats a la vez con sus totales', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))

    const stats = await screen.findByLabelText('Stats')
    for (const label of ['Fuerza', 'Destreza', 'Constitución', 'Percepción', 'Inteligencia', 'Sabiduría', 'Carisma']) {
      expect(stats.textContent).toContain(label)
    }
    expect(stats.textContent).toContain('357,1')
    expect(stats.textContent).toContain('447,6')
    expect(screen.getByText('840')).toBeTruthy()
    expect(screen.getByText('2.290')).toBeTruthy()
  })

  it('la navegación se oculta y recuerda la preferencia', async () => {
    const { container } = render(<App />)
    const nav = container.querySelector('nav')!
    expect(nav.className).toBe('nav')

    fireEvent.click(screen.getByLabelText('Ocultar navegación'))
    expect(nav.className).toBe('nav hidden')
    expect(localStorage.getItem('fmfid-nav-open')).toBe('false')
  })

  it('cambia de sección desde la barra', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Combate' })).toBeTruthy())
    fireEvent.click(screen.getByText('Más'))
    await waitFor(() => expect(screen.getByText('Exportar respaldo')).toBeTruthy())
  })

  it('edita un dato, guarda con motivo y lo muestra en la ficha y el historial', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Editar'))

    fireEvent.change(await screen.findByLabelText('Fuerza · Entrenamiento'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), { target: { value: 'Entrenó en el dojo' } })
    expect(screen.getByText('1 dato(s) para guardar.')).toBeTruthy()
    fireEvent.click(screen.getByText('Guardar cambios'))

    const stats = await screen.findByLabelText('Stats')
    expect(stats.textContent).toContain('367,1')
    expect(await screen.findByText('Historial de cambios (1)')).toBeTruthy()
    expect(screen.getByText('Entrenó en el dojo')).toBeTruthy()
    expect(screen.getByText('Fuerza · Entrenamiento: 50 → 60')).toBeTruthy()
  })

  it('no guarda un personaje inválido y explica el problema', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Editar'))

    fireEvent.change(await screen.findByLabelText('Carisma · Tier'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Guardar cambios'))

    expect((await screen.findByRole('alert')).textContent).toContain('2 stats primarios')
    const saved = (await repo.list())[0]
    expect(saved.tiers.carisma).toBe(2)
  })

  it('crea un personaje nuevo y abre su edición', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Nuevo personaje'))
    expect(await screen.findByText('Editar personaje')).toBeTruthy()
    expect((await repo.list()).map((c) => c.name)).toEqual(['Nuevo personaje'])
  })

  it('cancelar sin cambios vuelve a la ficha', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Editar'))
    fireEvent.click(await screen.findByText('Cancelar'))
    expect(await screen.findByLabelText('Stats')).toBeTruthy()
  })

  it('NPCs: lista, busca y abre un NPC con perfil de combate', async () => {
    await npcRepo.create({ ...newNpcTemplate(), name: 'Amber', rank: 'C+', realm: 'Aventurero', combat: defaultEnemyProfile('C+') })
    await npcRepo.create({ ...newNpcTemplate(), name: 'Aino', rank: 'D', realm: 'Olderion' })
    render(<App />)
    fireEvent.click(screen.getByText('NPCs'))
    expect(await screen.findByText('Amber')).toBeTruthy()
    expect(screen.getByText('Aino')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar NPC'), { target: { value: 'olderion' } })
    await waitFor(() => expect(screen.queryByText('Amber')).toBeNull())
    fireEvent.change(screen.getByLabelText('Buscar NPC'), { target: { value: '' } })

    fireEvent.click(await screen.findByText('Amber'))
    const stats = await screen.findByLabelText('Stats del NPC')
    expect(stats.textContent).toContain('350')
    expect(screen.getByText('980 · 1.430')).toBeTruthy()
  })

  it('NPCs: crea el perfil de combate y lo edita a mano', async () => {
    await npcRepo.create({ ...newNpcTemplate(), name: 'Aino', rank: 'D' })
    render(<App />)
    fireEvent.click(screen.getByText('NPCs'))
    fireEvent.click(await screen.findByText('Aino'))
    fireEvent.click(await screen.findByText('Crear perfil de combate'))
    fireEvent.change(await screen.findByLabelText('Fuerza · Valor a mano'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Vida máxima'), { target: { value: '30' } })
    fireEvent.click(screen.getByText('Guardar cambios'))

    const stats = await screen.findByLabelText('Stats del NPC')
    expect(stats.textContent).toContain('500')
    expect(stats.textContent).toContain('a mano')
    const saved = (await npcRepo.list())[0]
    expect(saved.combat?.rank).toBe('D')
    expect(saved.combat?.hp.max).toBe(30)
  })

  async function openNewCombat() {
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    fireEvent.change(await screen.findByLabelText('Nombre del nuevo combate'), { target: { value: 'Frente norte' } })
    fireEvent.click(screen.getByText('Nuevo combate'))
    await screen.findByRole('heading', { name: 'Frente norte' })
  }

  const goTo = (tab: string) => fireEvent.click(within(screen.getByLabelText('Secciones del combate')).getByText(tab))

  async function openFirstParticipant() {
    const name = await waitFor(() => {
      const el = document.querySelector('.participant .name')
      if (!el) throw new Error('todavía no está el participante')
      return el
    })
    fireEvent.click(name)
  }

  /** Agrega a Edward (iniciativa 10) y a un Goblin enemigo (iniciativa 5). */
  async function setUpDuel() {
    await repo.create(edwardData)
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Goblin', rank: 'C+', combat: defaultEnemyProfile('C+') })
    await openNewCombat()
    goTo('Agregar')
    fireEvent.change(await screen.findByLabelText('Iniciativa del jugador'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText('Agregar jugador'))
    fireEvent.click(await screen.findByRole('option', { name: /Goblin/ }))
    fireEvent.change(await screen.findByLabelText('Iniciativa del NPC'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Agregar al combate'))
    await waitFor(async () => expect(await combatNames()).toEqual(['Edward', 'Goblin']))
  }

  const combatNames = async () => {
    const [c] = await combatRepo.list()
    return c?.participants.map((p) => p.name)
  }

  it('combate: crea un campo con nombre, arma el orden y avanza turnos y rondas', async () => {
    await repo.create(edwardData)
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Goblin', rank: 'D', combat: defaultEnemyProfile('D') })
    await openNewCombat()

    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    fireEvent.click(await screen.findByRole('option', { name: /Goblin/ }))
    fireEvent.change(await screen.findByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Agregar al combate'))
    await waitFor(async () => expect(await combatNames()).toEqual(['Edward', 'Goblin 1', 'Goblin 2']))

    goTo('Turnos')
    fireEvent.change(await screen.findByLabelText('Iniciativa de Edward'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Iniciativa de Goblin 1'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Iniciativa de Goblin 2'), { target: { value: '5' } })
    await waitFor(() => {
      const names = Array.from(document.querySelectorAll('.participant .name')).map((n) => n.textContent)
      expect(names).toEqual(['Edward', 'Goblin 1', 'Goblin 2'])
    })

    fireEvent.click(screen.getByText('Empezar combate'))
    expect(await screen.findByText('Empieza el combate. Turno de Edward.')).toBeTruthy()
    expect(screen.getByText('Su turno')).toBeTruthy()

    fireEvent.click(screen.getByText('Siguiente turno'))
    fireEvent.click(await screen.findByText('Siguiente ronda'))
    expect(await screen.findByText('Inicio de la ronda 2.')).toBeTruthy()
    expect(screen.getByText(/Ronda 2/)).toBeTruthy()
  })

  it('combate: hay varios campos de batalla a la vez, cada uno con su nombre', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Combate'))
    for (const name of ['Frente norte', 'Aldea']) {
      fireEvent.change(await screen.findByLabelText('Nombre del nuevo combate'), { target: { value: name } })
      fireEvent.click(screen.getByText('Nuevo combate'))
      await screen.findByRole('heading', { name })
      fireEvent.click(screen.getByLabelText('Volver a los combates'))
    }
    expect(await screen.findByText('Frente norte')).toBeTruthy()
    expect(screen.getByText('Aldea')).toBeTruthy()
  })

  it('combate: un NPC se marca aliado o enemigo', async () => {
    await setUpDuel()
    goTo('Turnos')
    fireEvent.change(await screen.findByLabelText('Bando de Goblin'), { target: { value: 'aliado' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.side).toBe('aliado')
    })
  })

  it('participante: baja la vida y un buff cambia los valores', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.click(await screen.findByLabelText('Leves: menos'))
    await waitFor(() => expect(screen.getByLabelText('Leves: valor').textContent).toContain('9'))

    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Agregar efecto'))
    expect(await screen.findByText('Valores con efectos')).toBeTruthy()
    expect(screen.getByText('357,1 → 457,1 (+100)')).toBeTruthy()
  })

  it('participante: la armadura se pone, se carga desde la tabla y lleva sus usos', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.click(await screen.findByText('Poner armadura'))
    fireEvent.change(await screen.findByLabelText('Tipo de armadura'), { target: { value: 'pesada' } })
    fireEvent.change(screen.getByLabelText('Rango de la armadura'), { target: { value: 'C' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.armor).toEqual({ type: 'pesada', rank: 'C', bonus: 130, bonusTarget: 'fisica', usesMax: 18, usesLeft: 18 })
    })
  })

  it('participante: al pasar los 4 buffs de un stat, el más débil queda sin lugar y vuelve si se libera uno', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    // 4 buffs de tipos distintos sobre Fuerza, de 10 a 40, y un quinto de 50
    const adds: [string, string][] = [['pasivo', '10'], ['pocion', '20'], ['estilo', '30'], ['estado', '40'], ['armamento', '50']]
    for (const [i, [typeId, value]] of adds.entries()) {
      fireEvent.change(await screen.findByLabelText('Tipo'), { target: { value: typeId } })
      fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value } })
      fireEvent.click(screen.getByText('Agregar efecto'))
      await waitFor(async () => expect(await edwardEffects()).toHaveLength(i + 1))
    }

    // el más débil (10) queda listado pero sin lugar, y no se pregunta nada
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await screen.findByText('Sin lugar')).closest('li')?.textContent).toContain('Aumento pasivo')
    expect(screen.getAllByText('Activo')).toHaveLength(4)

    // al quitar el más fuerte, el que estaba sin lugar vuelve solo
    fireEvent.click(screen.getByLabelText('Quitar Aumento por armamento'))
    await waitFor(() => expect(screen.queryByText('Sin lugar')).toBeNull())
    expect(screen.getAllByText('Activo')).toHaveLength(4)
  })

  it('comparar: tabla con los combatientes y filtros por bando', async () => {
    await setUpDuel()
    goTo('Comparar')
    const table = await screen.findByLabelText('Tabla comparativa')
    expect(table.textContent).toContain('Edward')
    expect(table.textContent).toContain('Goblin')
    expect(table.textContent).toContain('Fuerza')

    fireEvent.click(screen.getByText('Jugadores'))
    await waitFor(() => expect(screen.getByLabelText('Tabla comparativa').textContent).not.toContain('Goblin'))
    fireEvent.click(screen.getByText('Enemigos'))
    await waitFor(() => expect(screen.getByLabelText('Tabla comparativa').textContent).toContain('Goblin'))
  })

  it('checks: un stat de un combatiente contra el resto, con rangos y resultado', async () => {
    await setUpDuel()
    goTo('Checks')
    const results = await screen.findByLabelText('Resultados del check')
    expect(results.textContent).toContain('Goblin')
    expect(results.textContent).toContain('Fallo crítico 1-2')

    fireEvent.change(screen.getByLabelText('Tirada (d20, opcional)'), { target: { value: '12' } })
    await waitFor(() => expect(screen.getByLabelText('Resultados del check').textContent).toContain('Éxito'))
  })

  it('ataque: un jugador golpea a un NPC y se puede deshacer', async () => {
    await setUpDuel()
    goTo('Ataque')
    // Edward Destreza 253 contra Percepción 250 del Goblin: diferencia +3, nivel normal
    fireEvent.change(await screen.findByLabelText('Tirada del atacante (d20)'), { target: { value: '15' } })
    expect(await screen.findByText('Ataque: Éxito')).toBeTruthy()

    fireEvent.click(await screen.findByText('Confirmar y aplicar'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.hpCurrent).toBe(8) // herida media: 2 puntos
    })

    fireEvent.click(await screen.findByText('Deshacer última acción'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.hpCurrent).toBe(10)
      expect(c.history).toEqual([])
    })
  })

  it('ataque: un NPC golpea a un jugador con d8 de resistencia y le baja la vida', async () => {
    await setUpDuel()
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Atacante'), { target: { value: (await combatRepo.list())[0].participants[1].id } })
    // Goblin Destreza 350 contra Percepción 297 de Edward: +53, normal. Un NPC no tira: tira el jugador.
    fireEvent.change(await screen.findByLabelText('Tirada del defensor (d20)'), { target: { value: '3' } })
    expect(await screen.findByText('Resultado del defensor: Fallo mayor')).toBeTruthy()
    expect(screen.getByText('Ataque: Éxito mayor')).toBeTruthy()

    fireEvent.change(await screen.findByLabelText('d8 de resistencia'), { target: { value: '3' } }) // 3 + 6 = 9
    expect(await screen.findByText(/Resistencia 9/)).toBeTruthy()
    fireEvent.click(screen.getByText('Confirmar y aplicar'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      const edwardState = c.participants.find((p) => p.name === 'Edward')?.pc
      expect(edwardState?.health).toEqual({ leve: 10, medio: 6, letal: 3 }) // la herida leve en fila 6-10 es 1 medio
    })
  })

  it('ataque: un fallo no aplica daño y queda registrado', async () => {
    await setUpDuel()
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Tirada del atacante (d20)'), { target: { value: '4' } })
    fireEvent.click(await screen.findByText('Registrar fallo'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.alerts[0].text).toContain('Edward falla contra Goblin')
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.hpCurrent).toBe(10)
    })
  })

  it('ataque: muestra el nivel inverso para el defensor ("tenés que tirar con...")', async () => {
    await setUpDuel()
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Stat del atacante'), { target: { value: 'fuerza' } })
    fireEvent.change(screen.getByLabelText('Stat del defensor'), { target: { value: 'constitucion' } })
    // Fuerza 357 contra Constitución 250 del Goblin: +107, rango medio → Mayor para el atacante, Menor para el defensor
    expect(await screen.findByText(/Si tira el atacante:/)).toBeTruthy()
    const line = screen.getByText(/Si tira el atacante:/).textContent ?? ''
    expect(line).toContain('Mayor')
    expect(line).toContain('Menor')

    fireEvent.change(screen.getByLabelText('Quién tira el d20'), { target: { value: 'defensor' } })
    expect(await screen.findByText(/tira con/)).toBeTruthy()
    expect(screen.getByLabelText('Tirada del defensor (d20)')).toBeTruthy()
  })

  it('checks: el afectado puede tirar con el nivel inverso', async () => {
    await setUpDuel()
    goTo('Checks')
    fireEvent.change(await screen.findByLabelText('Su stat'), { target: { value: 'fuerza' } })
    const results = await screen.findByLabelText('Resultados del check')
    expect(results.textContent).toContain('tira con')
    fireEvent.change(screen.getByLabelText('Quién tira el d20'), { target: { value: 'target' } })
    fireEvent.change(screen.getByLabelText('Tirada (d20, opcional)'), { target: { value: '12' } })
    await waitFor(() => expect(screen.getByLabelText('Resultados del check').textContent).toContain('Resultado de Goblin'))
  })

  it('participante: la saturación se escribe a mano, sube con atajos y se resetea', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.click(await screen.findByText('Curó 1 medio (+3 %)'))
    fireEvent.click(screen.getByText('Curó 1 letal (+9 %)'))
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('12'))

    fireEvent.change(screen.getByLabelText('Saturación (%)'), { target: { value: '40' } })
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40'))

    fireEvent.change(screen.getByLabelText('Saturación (%)'), { target: { value: '250' } }) // tope en 100
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'))

    fireEvent.click(screen.getByText('Poner en 0'))
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0'))
  })

  it('participante: los NPC aliados y enemigos también tienen barra de saturación', async () => {
    await setUpDuel()
    goTo('Turnos')
    const names = await waitFor(() => {
      const els = Array.from(document.querySelectorAll('.participant .name'))
      if (els.length < 2) throw new Error('faltan participantes')
      return els
    })
    fireEvent.click(names[1]) // el Goblin
    fireEvent.change(await screen.findByLabelText('Saturación (%)'), { target: { value: '25' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.saturation).toBe(25)
    })
  })

  it('participante: la armadura suma a un solo stat, editable', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()
    fireEvent.click(await screen.findByText('Poner armadura'))
    fireEvent.change(await screen.findByLabelText('La armadura suma a'), { target: { value: 'magica' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.armor?.bonusTarget).toBe('magica')
    })
  })

  it('NPCs: al buscar un rango solo salen los de ese rango exacto', async () => {
    for (const [name, rank] of [['Bela', 'B'], ['Brix', 'B+'], ['Abel', 'A'], ['Dorn', 'D']]) {
      await npcRepo.create({ ...newNpcTemplate(), name, rank })
    }
    render(<App />)
    fireEvent.click(screen.getByText('NPCs'))
    fireEvent.change(await screen.findByLabelText('Buscar NPC'), { target: { value: 'B' } })
    await waitFor(() => {
      expect(screen.queryByText('Brix')).toBeNull()
      expect(screen.queryByText('Abel')).toBeNull()
    })
    expect(screen.getByText('Bela')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar NPC'), { target: { value: 'B+' } })
    await waitFor(() => expect(screen.getByText('Brix')).toBeTruthy())
    expect(screen.queryByText('Bela')).toBeNull()
  })

  it('ataque: intercambiar roles cambia el defensor y con él la escala', async () => {
    await setUpDuel()
    goTo('Ataque')
    expect(await screen.findByText(/La escala es la del defensor: Goblin/)).toBeTruthy()
    fireEvent.click(screen.getByText('⇅ Intercambiar roles'))
    expect(await screen.findByText(/La escala es la del defensor: Edward/)).toBeTruthy()
  })

  it('agregar: se busca en el bestiario, se ve el rango y se puede cambiar para este combate', async () => {
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Lobo', rank: 'D', combat: defaultEnemyProfile('D') })
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Lobo alfa', rank: 'B', combat: defaultEnemyProfile('B') })
    await npcRepo.create({ ...newNpcTemplate('npc'), name: 'Alice', rank: 'SS+', combat: defaultEnemyProfile('SS+') })
    await openNewCombat()
    goTo('Agregar')

    // el bestiario es la lista por defecto: no aparece Alice, y cada uno muestra su rango
    const list = await screen.findByRole('listbox', { name: 'Resultados' })
    expect(within(list).getByText('Lobo')).toBeTruthy()
    expect(within(list).getByText('B')).toBeTruthy()
    expect(within(list).queryByText('Alice')).toBeNull()

    // búsqueda por rango exacto
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'B' } })
    await waitFor(() => expect(within(screen.getByRole('listbox', { name: 'Resultados' })).queryByText('Lobo')).toBeNull())

    // elegir al lobo D pero agregarlo como rango A
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'lobo' } })
    fireEvent.click(await screen.findByRole('option', { name: /^Lobo\s*D$/ }))
    fireEvent.change(await screen.findByLabelText('Rango en este combate'), { target: { value: 'A' } })
    fireEvent.click(screen.getByText('Agregar al combate'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].npc?.profile.rank).toBe('A')
      expect(c.participants[0].name).toBe('Lobo')
    })

    // en la lista de NPCs sí está Alice
    fireEvent.click(within(screen.getByRole('group', { name: 'Lista' })).getByText('NPCs'))
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '' } })
    expect(await screen.findByRole('option', { name: /Alice/ })).toBeTruthy()
  })

  it('NPCs: el bestiario se separa de los NPCs únicos', async () => {
    await npcRepo.create({ ...newNpcTemplate('npc'), name: 'Alice', rank: 'SS+' })
    await npcRepo.create({ ...newNpcTemplate('bestia'), name: 'Lobo', rank: 'D' })
    render(<App />)
    fireEvent.click(screen.getByText('NPCs'))
    expect(await screen.findByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Lobo')).toBeNull()

    fireEvent.click(screen.getByText('Bestiario'))
    expect(await screen.findByText('Lobo')).toBeTruthy()
    expect(screen.queryByText('Alice')).toBeNull()

    fireEvent.click(screen.getByText('Nueva bestia'))
    expect(await screen.findByText('Editar NPC')).toBeTruthy()
    const beasts = await npcRepo.list('', 'bestia')
    expect(beasts.some((b) => b.name === 'Nueva bestia' && b.combat !== null)).toBe(true)
  })

  it('tablas: se consultan los rangos, éxitos, daños, equipo, jugadores y precios', async () => {
    await repo.create(edwardData)
    await db.settings.put({
      key: 'referenceSheets',
      value: [{ id: 'precios', title: 'Precios', rows: [['MISIONES', 'Mazmorra'], ['S+', '125000']] }],
    })
    render(<App />)
    fireEvent.click(screen.getByText('Más'))
    fireEvent.click(await screen.findByText('Ver tablas'))

    expect((await screen.findByText('Promedio mínimo')) && true).toBe(true)
    const pick = (value: string) => fireEvent.change(screen.getByLabelText('Tabla'), { target: { value } })

    pick('danos')
    expect(await screen.findByText('1 letal + 1 medio')).toBeTruthy()
    pick('exitos')
    expect(await screen.findByText('Éxito asegurado')).toBeTruthy()
    pick('armaduras')
    expect(await screen.findByText('Ligera')).toBeTruthy()
    pick('entrenamiento')
    expect(await screen.findByText('7')).toBeTruthy()
    pick('jugadores')
    const comparison = await screen.findByLabelText('Comparativa entre jugadores')
    expect(comparison.textContent).toContain('Edward')
    expect(comparison.textContent).toContain('357,1')
    pick('precios')
    expect(await screen.findByText('125.000')).toBeTruthy()
  })

  it('participante: una potenciación (Kyushu) se aplica como buff con su valor, y termina con la habilidad', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    // Edward: Kyushu = round(0,82·(0,07·115,04 + 0,03·158,04)) + 5·3 = 25
    const option = await screen.findByRole('option', { name: 'Kyushu (+25)' })
    expect(option).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Potenciación'), { target: { value: 'kyushu' } })
    // depende de cómo la use el jugador: hay que elegir a qué stat suma
    fireEvent.click(screen.getByText('Aplicar potenciación'))
    expect((await screen.findByRole('alert')).textContent).toContain('Elige a qué stat suma')
    fireEvent.click(screen.getByLabelText('Suma a Inteligencia'))
    fireEvent.click(screen.getByText('Aplicar potenciación'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      const effects = c.participants[0].pc?.effects ?? []
      expect(effects).toHaveLength(1)
      expect(effects[0]).toMatchObject({
        name: 'Kyushu', kind: 'buff', typeId: 'habilidad', target: 'inteligencia', flat: 25, percent: 0,
        duration: { unit: 'habilidad' },
      })
    })

    fireEvent.click(await screen.findByText('Terminó la habilidad'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.effects).toEqual([])
    })
  })

  it('participante: la potenciación se puede cambiar de stat al aplicarla', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.change(await screen.findByLabelText('Potenciación'), { target: { value: 'ki' } })
    fireEvent.click(screen.getByLabelText('Suma a Constitución'))
    fireEvent.click(screen.getByText('Aplicar potenciación'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.effects[0]).toMatchObject({ name: 'Ki', target: 'constitucion' })
    })
  })

  /** Abre el árbol de Edward. */
  async function openTree(extra: Partial<Character> = {}) {
    await repo.create({ ...edwardData, ...extra })
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Árbol de stats'))
    await screen.findByText('Árbol de Edward')
  }

  const edwardInDb = async () => (await repo.list())[0]

  it('árbol: se cargan los BP, se compra un nodo y suma el stat con su historial', async () => {
    await openTree()
    fireEvent.change(screen.getByLabelText('BP disponibles'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Guardar saldos'))
    await waitFor(async () => expect((await edwardInDb()).tree?.bp).toBe(10))

    fireEvent.click(screen.getAllByText('Comprar')[0])
    fireEvent.click(await screen.findByText('Confirmar compra'))

    await waitFor(async () => {
      const c = await edwardInDb()
      expect(c.tree?.bp).toBe(9)
      expect(c.tree?.purchases).toHaveLength(1)
      expect(c.sources.fuerza.arbolHeroe).toBe(edward.sources.fuerza.arbolHeroe + 2)
    })
    expect(await screen.findByText('Comprado')).toBeTruthy()
    const history = await repo.history((await edwardInDb()).id)
    expect(history.some((h) => h.path === 'tree.purchases' && h.reason.includes('Fuerza etapa 1 nodo 1'))).toBe(true)
  })

  it('árbol: sin BP suficientes avisa y no compra', async () => {
    await openTree()
    fireEvent.click(screen.getAllByText('Comprar')[0])
    fireEvent.click(await screen.findByText('Confirmar compra'))
    expect((await screen.findByRole('alert')).textContent).toContain('Faltan BP')
    expect((await edwardInDb()).tree).toBeUndefined()
  })

  it('árbol: la etapa 2 espera la compuerta y el GM la abre', async () => {
    let c: Character = { ...edward, tree: { ...emptyTree(), bp: 100 } }
    for (let i = 0; i < 10; i++) c = purchaseNext(c, 'fuerza', i % 5 === 4 ? 'hab' : 'stat')
    const { id: _i, createdAt: _c, updatedAt: _u, ...data } = c
    await openTree(data)

    expect(await screen.findByText(/Compuerta cerrada/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Etapa 2 abierta'))
    await waitFor(async () => expect((await edwardInDb()).tree?.gates.stage2).toBe(true))
    await waitFor(() => expect(screen.queryByText(/Compuerta cerrada: Completar 4 ramas/)).toBeNull())
  })

  it('árbol: una dote se compra sin nombre, queda pendiente y se completa después', async () => {
    let c: Character = { ...edward, tree: { ...emptyTree(), bp: 50 } }
    for (let i = 0; i < 4; i++) c = purchaseNext(c, 'fuerza', 'stat')
    const { id: _i, createdAt: _c, updatedAt: _u, ...data } = c
    await openTree(data)

    // el nodo 5 (dote) y el 6 están disponibles: se compra el 6 y la dote queda pendiente
    const buyButtons = await screen.findAllByText('Comprar')
    fireEvent.click(buyButtons[1])
    fireEvent.click(await screen.findByText('Confirmar compra'))
    await waitFor(async () => expect((await edwardInDb()).tree?.purchases).toHaveLength(5))
    expect(await screen.findByText('Pendiente')).toBeTruthy()

    // ahora la dote, en blanco
    fireEvent.click(screen.getAllByText('Comprar')[0])
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect((await edwardInDb()).tree?.dotes).toHaveLength(1))
    expect((await edwardInDb()).tree?.dotes[0].name).toBe('')

    // y se le pone nombre después
    fireEvent.change(await screen.findByLabelText('Nombre de la dote 1'), { target: { value: 'Golpe certero' } })
    fireEvent.click(screen.getByText('Guardar dotes'))
    await waitFor(async () => expect((await edwardInDb()).tree?.dotes[0].name).toBe('Golpe certero'))
  })

  it('árbol: deshacer la última compra devuelve los BP y quita el stat', async () => {
    let c: Character = { ...edward, tree: { ...emptyTree(), bp: 5 } }
    c = purchaseNext(c, 'fuerza', 'stat')
    const { id: _i, createdAt: _c, updatedAt: _u, ...data } = c
    await openTree(data)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Deshacer la última compra de Fuerza'))
    await waitFor(async () => {
      const after = await edwardInDb()
      expect(after.tree?.bp).toBe(5)
      expect(after.tree?.purchases).toHaveLength(0)
      expect(after.sources.fuerza.arbolHeroe).toBe(edward.sources.fuerza.arbolHeroe)
    })
  })

  it('árbol: muestra las diferencias con las compras y se pueden ajustar', async () => {
    let c: Character = { ...edward, tree: { ...emptyTree(), bp: 5 } }
    c = purchaseNext(c, 'fuerza', 'stat')
    // el personaje ya traía puntos de antes que las compras no explican
    c = { ...c, sources: { ...c.sources, fuerza: { ...c.sources.fuerza, arbolHeroe: 40 } } }
    const { id: _i, createdAt: _c, updatedAt: _u, ...data } = c
    await openTree(data)
    fireEvent.click(screen.getByText(/Diferencias con las compras/))
    fireEvent.click(await screen.findByLabelText('Ajustar Fuerza · Árbol héroe'))
    await waitFor(async () => expect((await edwardInDb()).sources.fuerza.arbolHeroe).toBe(2))
  })

  it('edición: los súper stats se pueden cambiar', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Editar'))
    fireEvent.change(await screen.findByLabelText('Súper primario'), { target: { value: 'fuerza' } })
    fireEvent.click(screen.getByText('Guardar cambios'))
    await waitFor(async () => expect((await edwardInDb()).superStats).toEqual({ fuerza: 'primario', sabiduria: 'terciario' }))
  })

  it('ataque: el daño contra defensa está siempre a la vista, antes de tirar el d20, con su escala', async () => {
    await setUpDuel()
    goTo('Ataque')
    const card = await screen.findByLabelText('Daño contra defensa')
    // Edward (daño físico con arma 485,9) contra el Goblin (defensa SA 380): +105,9 en rango C+ (grupo Medio)
    expect(card.textContent).toContain('diferencia +105,9')
    expect(card.textContent).toContain('herida medio')
    const scale = within(screen.getByLabelText('Escala del daño'))
    expect(scale.getByText('hasta 75')).toBeTruthy()
    expect(scale.getByText('76 a 150')).toBeTruthy()
    expect(scale.getByText('151 a 300')).toBeTruthy()
    expect(scale.getByText('más de 300')).toBeTruthy()
    expect(within(screen.getByLabelText('Escala del daño')).getAllByRole('row').some((r) => r.className === 'hit')).toBe(true)
  })

  it('ataque: contra un jugador se ve la tabla de daños con sus resultados antes de tirar', async () => {
    await setUpDuel()
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Atacante'), { target: { value: (await combatRepo.list())[0].participants[1].id } })
    const table = await screen.findByLabelText('Tabla de daños')
    expect(table.textContent).toContain('Resistencia')
    expect(table.textContent).toContain('1-5')
    expect(screen.getByText(/Para aplicar el daño falta el resultado del impacto/)).toBeTruthy()
  })

  it('ataque: el d20 no cambia el daño, y se puede aplicar sin tirada de impacto', async () => {
    await setUpDuel()
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Atacante'), { target: { value: (await combatRepo.list())[0].participants[1].id } })
    const before = (await screen.findByLabelText('Daño contra defensa')).textContent
    fireEvent.change(await screen.findByLabelText('Tirada del defensor (d20)'), { target: { value: '1' } })
    expect((await screen.findByLabelText('Daño contra defensa')).textContent).toContain('herida leve')
    expect(before).toContain('herida leve') // igual antes y después de la tirada

    fireEvent.click(screen.getByLabelText('Aplicar el daño sin depender de la tirada de impacto'))
    fireEvent.change(await screen.findByLabelText('d8 de resistencia'), { target: { value: '3' } })
    fireEvent.click(await screen.findByText('Confirmar y aplicar'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Edward')?.pc?.health.medio).toBe(6) // leve en fila 6-10: 1 medio
    })
  })

  it('curación: se ve la tabla en las tablas de la mesa', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Más'))
    fireEvent.click(await screen.findByText('Ver tablas'))
    fireEvent.change(await screen.findByLabelText('Tabla'), { target: { value: 'curaciones' } })
    expect(await screen.findByText('7L 5M + 2Xb (40)')).toBeTruthy()
    expect(screen.getByText('8L + 1Lb (9)')).toBeTruthy()
  })

  it('curación: un jugador herido se cura con el nivel y la opción que elige, y suma saturación', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByLabelText('Leves: menos'))
      await waitFor(() => expect(screen.getByLabelText('Leves: valor').textContent).toContain(String(9 - i)))
    }

    fireEvent.change(screen.getByLabelText('Nivel de curación'), { target: { value: '3' } })
    expect(screen.getByLabelText('Opción 1: 8L')).toBeTruthy()
    expect(screen.getByLabelText('Opción 2: 2L 1M')).toBeTruthy()
    fireEvent.click(screen.getByText('Aplicar curación'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      const pc = c.participants[0].pc
      expect(pc?.health.leve).toBe(10) // recuperó los 3 leves que le faltaban
      expect(pc?.saturation).toBe(3)
      expect(c.alerts[0].text).toContain('recibe una curación de nivel 3')
    })
  })

  it('curación: una opción con barrera la agrega y se puede deshacer', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.change(await screen.findByLabelText('Nivel de curación'), { target: { value: '4' } }) // B
    fireEvent.click(screen.getByLabelText('Opción 1: 8L + 1Lb'))
    fireEvent.click(screen.getByText('Aplicar curación'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.barriers[0].wounds).toEqual({ leve: 1, medio: 0, letal: 0 })
    })

    // deshacer desde Ataque (última acción)
    // queda registrada como última acción del combate, para poder deshacerla
    const [c] = await combatRepo.list()
    expect(c.history[0].text).toContain('recibe una curación de nivel 4')
    expect(c.alerts[0].text).toContain('barrera de 1 leve')
  })

  it('armadura: al elegir tipo y rango se cargan solos el valor y los usos de la tabla', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.click(await screen.findByText('Poner armadura'))
    expect((await screen.findByRole('status')).textContent).toContain('Armadura puesta')

    // D+ no está en la tabla de usos: usa los de D (ligera: 7)
    fireEvent.change(await screen.findByLabelText('Rango de la armadura'), { target: { value: 'D+' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.armor).toMatchObject({ type: 'ligera', rank: 'D+', bonus: 50, usesMax: 7, usesLeft: 7 })
    })
    expect(screen.getByRole('status').textContent).toContain('usos 7/7')

    fireEvent.change(screen.getByLabelText('Tipo de armadura'), { target: { value: 'pesada' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.armor).toMatchObject({ type: 'pesada', rank: 'D+', bonus: 100, usesMax: 13 })
    })
  })

  it('ataque: la armadura puesta cuenta en la defensa y se ven las dos defensas para elegir cuál participa', async () => {
    await setUpDuel()
    // Edward con armadura pesada rango C: suma 130 a la defensa física
    const [before] = await combatRepo.list()
    const edwardId = before.participants.find((p) => p.name === 'Edward')!.id
    await combatRepo.update(before.id, (c) =>
      updateParticipant(c, edwardId, (p) => ({
        ...p,
        pc: p.pc ? { ...p.pc, armor: { type: 'pesada', rank: 'C', bonus: 130, bonusTarget: 'fisica', usesMax: 18, usesLeft: 18 } } : null,
      })),
    )
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Atacante'), { target: { value: before.participants.find((p) => p.name === 'Goblin')!.id } })

    // defensa física: CA 447,6 + armadura 130 = 577,6 (con armadura)
    await waitFor(() =>
      expect(screen.getByLabelText('Daño contra defensa').textContent).toContain('Defensa física: 577,6 (CA 447,6 + armadura 130)'),
    )
    const card = screen.getByLabelText('Daño contra defensa')
    // defensa mágica: la armadura no suma
    expect(card.textContent).toContain('Defensa mágica:')
    expect(screen.getByLabelText('Defensa física participa')).toHaveProperty('checked', true)

    fireEvent.click(screen.getByLabelText('Defensa mágica participa'))
    await waitFor(() => expect(screen.getByLabelText('Defensa mágica participa')).toHaveProperty('checked', true))
    expect((await screen.findByLabelText('Daño contra defensa')).textContent).toContain('Participa la defensa mágica')
  })

  it('ataque: una armadura con usos en 0 no se toma por rota y suma a la defensa', async () => {
    await setUpDuel()
    const [before] = await combatRepo.list()
    const edwardId = before.participants.find((p) => p.name === 'Edward')!.id
    await combatRepo.update(before.id, (c) =>
      updateParticipant(c, edwardId, (p) => ({
        ...p,
        pc: p.pc ? { ...p.pc, armor: { type: 'ligera', rank: 'SS', bonus: 50, bonusTarget: 'fisica', usesMax: 0, usesLeft: 0 } } : null,
      })),
    )
    goTo('Ataque')
    fireEvent.change(await screen.findByLabelText('Atacante'), { target: { value: before.participants.find((p) => p.name === 'Goblin')!.id } })
    await waitFor(() =>
      expect(screen.getByLabelText('Daño contra defensa').textContent).toContain('Defensa física: 497,6 (CA 447,6 + armadura 50)'),
    )
  })

  it('arma: se equipa y se completa sola con la tabla de armas al elegir tamaño y rango', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    fireEvent.click(await screen.findByText('Equipar arma'))
    // Edward es C+: arma mediana C+ suma 80
    await waitFor(() => expect(screen.getByText(/Arma equipada: Mediana C\+ · suma 80 al daño físico/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Tamaño del arma'), { target: { value: 'grande' } })
    fireEvent.change(await screen.findByLabelText('Rango del arma'), { target: { value: 'B' } })
    fireEvent.change(screen.getByLabelText('El arma suma a'), { target: { value: 'ambos' } })
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.weapon).toEqual({ size: 'grande', rank: 'B', bonus: 120, bonusTarget: 'ambos' })
    })

    fireEvent.click(screen.getByText('Quitar arma'))
    await waitFor(async () => expect((await combatRepo.list())[0].participants[0].pc?.weapon).toBeNull())
  })

  it('arma: un NPC también puede equipar un arma', async () => {
    await setUpDuel()
    goTo('Turnos')
    const names = await waitFor(() => {
      const els = Array.from(document.querySelectorAll('.participant .name'))
      if (els.length < 2) throw new Error('faltan participantes')
      return els
    })
    fireEvent.click(names[1]) // el Goblin
    fireEvent.click(await screen.findByText('Equipar arma'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.weapon).toMatchObject({ size: 'mediana', rank: 'C+' })
    })
  })

  it('ataque: el arma equipada y las potenciaciones se ven en el origen del daño y lo suman', async () => {
    await setUpDuel()
    const [before] = await combatRepo.list()
    const edwardId = before.participants.find((p) => p.name === 'Edward')!.id
    await combatRepo.update(before.id, (c) =>
      updateParticipant(c, edwardId, (p) => ({
        ...p,
        pc: p.pc ? { ...p.pc, weapon: { size: 'grande', rank: 'C', bonus: 80, bonusTarget: 'fisico' } } : null,
      })),
    )
    goTo('Ataque')
    // el arma se guardó recién: se espera a que la pantalla muestre el estado actualizado
    await waitFor(() => {
      const origin = within(screen.getByLabelText('Daño contra defensa')).getByLabelText('Origen del daño')
      expect(origin.textContent).toContain('405,9 = base 325,9 + arma Grande C 80') // base 325,9 + arma 80
    })

    // Esencia (+34) y E. Reinforced (+66) para el daño físico
    fireEvent.click(screen.getByLabelText('Sumar Esencia'))
    fireEvent.click(screen.getByLabelText('Sumar E. Reinforced'))
    await waitFor(() => {
      const text = within(screen.getByLabelText('Daño contra defensa')).getByLabelText('Origen del daño').textContent ?? ''
      expect(text).toContain('505,9')
      expect(text).toContain('+ Esencia 34')
      expect(text).toContain('+ E. Reinforced 66')
    })
    // 505,9 contra la defensa SA 380 del Goblin: +125,9
    expect(screen.getByLabelText('Daño contra defensa').textContent).toContain('diferencia +125,9')

    // para el daño mágico las opciones son Kyushu y Magyushuru
    fireEvent.change(screen.getByLabelText('Tipo de ataque'), { target: { value: 'magico' } })
    expect(await screen.findByLabelText('Sumar Kyushu')).toBeTruthy()
    expect(screen.getByLabelText('Sumar Magyushuru')).toBeTruthy()
    expect(screen.queryByLabelText('Sumar Esencia')).toBeNull()
  })

  /** Agrega a Edward a un combate nuevo y abre su panel. */
  async function openEdwardPanel() {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()
    await screen.findByLabelText('Afecta a Fuerza')
  }
  const edwardEffects = async () => (await combatRepo.list())[0].participants[0].pc?.effects ?? []

  it('buffs: un mismo buff se aplica a varios stats de una vez', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Bendición' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '20' } })
    expect((screen.getByLabelText('Afecta a Fuerza') as HTMLInputElement).checked).toBe(true) // por defecto
    fireEvent.click(screen.getByLabelText('Afecta a Destreza'))
    fireEvent.click(screen.getByLabelText('Afecta a Defensa física'))
    fireEvent.click(screen.getByText('Agregar efecto'))

    await waitFor(async () => expect(await edwardEffects()).toHaveLength(3))
    const effects = await edwardEffects()
    expect(effects.map((e) => e.target).sort()).toEqual(['defensaFisica', 'destreza', 'fuerza'])
    expect(effects.every((e) => e.name === 'Bendición' && e.flat === 20 && e.kind === 'buff')).toBe(true)
    expect(new Set(effects.map((e) => e.id)).size).toBe(3)
  })

  it('debuffs: "Los 7 stats" los elige todos, y sin ninguno avisa', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Clase'), { target: { value: 'debuff' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '10' } })

    fireEvent.click(screen.getAllByText('Limpiar')[1]) // el selector manual es el segundo
    fireEvent.click(screen.getByText('Agregar efecto'))
    expect((await screen.findByRole('alert')).textContent).toContain('Elige al menos un stat')
    expect(await edwardEffects()).toEqual([])

    fireEvent.click(screen.getAllByText('Los 7 stats')[1])
    fireEvent.click(screen.getByText('Agregar efecto'))
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(7))
    expect((await edwardEffects()).every((e) => e.kind === 'debuff')).toBe(true)
  })

  it('potenciaciones: una potenciación suma a varios stats a la vez', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Potenciación'), { target: { value: 'kyushu' } })
    fireEvent.click(screen.getByLabelText('Suma a Inteligencia'))
    fireEvent.click(screen.getByLabelText('Suma a Sabiduría'))
    fireEvent.click(screen.getByText('Aplicar potenciación'))
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(2))
    const effects = await edwardEffects()
    expect(effects.map((e) => e.target).sort()).toEqual(['inteligencia', 'sabiduria'])
    expect(effects.every((e) => e.name === 'Kyushu' && e.flat === 25)).toBe(true)
  })

  it('buffs: con varios stats entra en todos, y en el que estaba lleno queda sin lugar el más débil', async () => {
    await openEdwardPanel()
    // 4 buffs sobre Fuerza: de 10 a 40
    for (const [i, [typeId, value]] of [['pasivo', '10'], ['pocion', '20'], ['estilo', '30'], ['estado', '40']].entries()) {
      fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: typeId } })
      fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value } })
      fireEvent.click(screen.getByText('Agregar efecto'))
      await waitFor(async () => expect(await edwardEffects()).toHaveLength(i + 1))
    }

    // un quinto buff de 25 sobre Fuerza y Destreza a la vez: no pregunta nada
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'armamento' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '25' } })
    fireEvent.click(screen.getByLabelText('Afecta a Destreza'))
    fireEvent.click(screen.getByText('Agregar efecto'))
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(6))
    expect(screen.queryByRole('alert')).toBeNull()

    // en Fuerza queda sin lugar el más débil (10); en Destreza entra
    const row = (await screen.findByText('Sin lugar')).closest('li') as HTMLElement
    expect(row.textContent).toContain('Aumento pasivo')
    expect(screen.getAllByText('Sin lugar')).toHaveLength(1)
  })

  it('barreras: la barrera de un jugador se edita a mano sin pasar por el combate', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Barrera: leves'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Barrera: medios'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Agregar barrera'))
    const barriers = async () => (await combatRepo.list())[0].participants[0].pc?.barriers ?? []
    await waitFor(async () => expect(await barriers()).toHaveLength(1))

    // recibe 1 daño leve: se le resta ese punto
    fireEvent.click(await screen.findByLabelText('Barrera 1: leves: menos'))
    await waitFor(async () => expect((await barriers())[0].wounds).toEqual({ leve: 2, medio: 1, letal: 0 }))

    // también se puede subir
    fireEvent.click(screen.getByLabelText('Barrera 1: letales: más'))
    await waitFor(async () => expect((await barriers())[0].wounds).toEqual({ leve: 2, medio: 1, letal: 1 }))

    // la duración se cambia
    fireEvent.change(screen.getByLabelText('Barrera 1: duración'), { target: { value: '5' } })
    await waitFor(async () => expect((await barriers())[0].duration).toEqual({ unit: 'rondas', remaining: 5 }))
    fireEvent.change(screen.getByLabelText('Barrera 1 dura'), { target: { value: 'manual' } })
    await waitFor(async () => expect((await barriers())[0].duration.unit).toBe('manual'))
  })

  it('barreras: si una barrera queda en 0 en todo, desaparece', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Barrera: leves'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Agregar barrera'))
    const barriers = async () => (await combatRepo.list())[0].participants[0].pc?.barriers ?? []
    await waitFor(async () => expect(await barriers()).toHaveLength(1))

    fireEvent.click(await screen.findByLabelText('Barrera 1: leves: menos'))
    await waitFor(async () => expect(await barriers()).toHaveLength(0))
    await waitFor(() => expect(screen.queryByText(/Barrera 1 ·/)).toBeNull())
  })

  it('barreras: la barrera de un NPC (en puntos) también se edita a mano', async () => {
    await setUpDuel()
    goTo('Turnos')
    const names = await waitFor(() => {
      const els = Array.from(document.querySelectorAll('.participant .name'))
      if (els.length < 2) throw new Error('faltan participantes')
      return els
    })
    fireEvent.click(names[1]) // el Goblin
    fireEvent.change(await screen.findByLabelText('Barrera: puntos'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Agregar barrera'))
    const points = async () => (await combatRepo.list())[0].participants.find((p) => p.name === 'Goblin')?.npc?.barriers ?? []
    await waitFor(async () => expect(await points()).toHaveLength(1))

    fireEvent.click(await screen.findByLabelText('Barrera 1: puntos: menos'))
    await waitFor(async () => expect((await points())[0].points).toBe(4))
    for (let i = 3; i >= 0; i--) {
      fireEvent.click(screen.getByLabelText('Barrera 1: puntos: menos'))
      if (i > 0) await waitFor(async () => expect((await points())[0].points).toBe(i))
    }
    await waitFor(async () => expect(await points()).toHaveLength(0))
  })

  /** Agrega un buff con el nombre, valor, tipo y duración dados sobre los stats marcados (además de Fuerza). */
  async function addBuff(opts: { name: string; flat: number; type?: string; unit?: string; extra?: string[]; only?: string[] }) {
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: opts.name } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: String(opts.flat) } })
    if (opts.type) fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: opts.type } })
    if (opts.unit) fireEvent.change(screen.getByLabelText('Dura'), { target: { value: opts.unit } })
    // el formulario recuerda los stats marcados: se parte siempre de solo Fuerza más los indicados
    fireEvent.click(screen.getAllByText('Limpiar')[1])
    for (const label of opts.only ?? ['Fuerza', ...(opts.extra ?? [])]) fireEvent.click(screen.getByLabelText(`Afecta a ${label}`))
    fireEvent.click(screen.getByText('Agregar efecto'))
  }

  it('buffs: un buff de varios stats se ve como uno solo y se quita de una vez', async () => {
    await openEdwardPanel()
    await addBuff({ name: 'Furia', flat: 20, extra: ['Destreza', 'Constitución', 'Percepción'] })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(4))

    // una sola fila con los 4 stats
    const row = (await screen.findAllByText('Furia'))[0].closest('li') as HTMLElement
    expect(row.textContent).toContain('Fuerza, Destreza, Constitución, Percepción')
    expect(screen.getAllByText('Furia')).toHaveLength(1)

    fireEvent.click(await screen.findByLabelText('Quitar Furia'))
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(0))
  })

  it('buffs: se edita un buff completo (la habilidad sube de nivel) en todos sus stats', async () => {
    await openEdwardPanel()
    await addBuff({ name: 'Furia', flat: 20, extra: ['Destreza', 'Constitución'] })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(3))
    const groupBefore = (await edwardEffects())[0].group

    fireEvent.click(await screen.findByLabelText('Editar Furia'))
    expect(await screen.findByText(/Estás editando el buff completo/)).toBeTruthy()
    expect((screen.getByLabelText('Valor fijo') as HTMLInputElement).value).toBe('20')
    expect((screen.getByLabelText('Afecta a Constitución') as HTMLInputElement).checked).toBe(true)

    // sube a 35, saca Constitución y suma Carisma
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '35' } })
    fireEvent.click(screen.getByLabelText('Afecta a Constitución'))
    fireEvent.click(screen.getByLabelText('Afecta a Carisma'))
    fireEvent.click(screen.getByText('Guardar cambios'))

    await waitFor(async () => {
      const effects = await edwardEffects()
      expect(effects.map((e) => e.target).sort()).toEqual(['carisma', 'destreza', 'fuerza'])
      expect(effects.every((e) => e.flat === 35 && e.name === 'Furia')).toBe(true)
      expect(new Set(effects.map((e) => e.group))).toEqual(new Set([groupBefore]))
    })
    expect(screen.queryByText('Cancelar edición')).toBeNull()
  })

  it('buffs: cancelar la edición no cambia nada', async () => {
    await openEdwardPanel()
    await addBuff({ name: 'Furia', flat: 20 })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(1))
    fireEvent.click(await screen.findByLabelText('Editar Furia'))
    fireEvent.change(await screen.findByLabelText('Valor fijo'), { target: { value: '99' } })
    fireEvent.click(screen.getByText('Cancelar edición'))
    expect((await edwardEffects())[0].flat).toBe(20)
    expect(screen.getByText('Agregar efecto')).toBeTruthy()
  })

  it('habilidad: "Terminó la habilidad" quita todos los efectos de la habilidad, sean del tipo que sean', async () => {
    await openEdwardPanel()
    // 1) tipo habilidad sobre varios stats
    await addBuff({ name: 'Furia', flat: 20, type: 'habilidad', extra: ['Destreza', 'Constitución'] })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(3))
    // 2) otro tipo, pero que dura hasta que termine la habilidad
    await addBuff({ name: 'Foco', flat: 10, type: 'potenciador', unit: 'habilidad' })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(4))
    // 3) un buff normal que no es de la habilidad
    await addBuff({ name: 'Poción', flat: 5, type: 'pocion', unit: 'manual' })
    await waitFor(async () => expect(await edwardEffects()).toHaveLength(5))

    fireEvent.click(await screen.findByText('Terminó la habilidad'))
    await waitFor(async () => {
      const effects = await edwardEffects()
      expect(effects.map((e) => e.name)).toEqual(['Poción'])
    })
  })

  it('límite de buffs: se recorta, avisa, se puede operar por encima y se puede levantar', async () => {
    await openEdwardPanel()
    // Edward es C+ (límite 300): Inteligencia natural 115 y Carisma natural 173 → tope 473
    await addBuff({ name: 'Sobrecarga', flat: 400, only: ['Inteligencia'] })
    const caps = await screen.findByLabelText('Límite de los buffs')
    await waitFor(() => expect(within(caps).getByLabelText('Buffs recortados').textContent).toContain('Inteligencia limitada a 473'))
    expect(within(caps).getByLabelText('Buffs recortados').textContent).toContain('el buff daba +400 y solo suma +358')
    expect(await screen.findByText('115 → 473 (+358)')).toBeTruthy()

    // operar por encima del límite en ese stat
    fireEvent.click(screen.getByLabelText('Operar por encima del límite: Inteligencia'))
    await waitFor(async () => {
      expect((await combatRepo.list())[0].participants[0].pc?.statCaps.open).toEqual(['inteligencia'])
    })
    expect(await screen.findByText('115 → 515 (+400)')).toBeTruthy()
    expect(screen.getByLabelText('Operando por encima del límite').textContent).toContain('consecuencias')

    // volver a poner el tope y levantar el límite 100 puntos
    fireEvent.click(screen.getByText('Restablecer los topes'))
    await waitFor(async () => expect((await combatRepo.list())[0].participants[0].pc?.statCaps.open).toEqual([]))
    fireEvent.change(screen.getByLabelText('Aumento fijo sin origen'), { target: { value: '100' } })
    await waitFor(async () => expect((await combatRepo.list())[0].participants[0].pc?.statCaps.raise).toBe(100))
    expect(await screen.findByText('115 → 515 (+400)')).toBeTruthy() // 573 de tope: el buff entra entero
    expect(screen.queryByLabelText('Buffs recortados')).toBeNull()
  })

  it('límite de buffs: un botón quita todos los topes', async () => {
    await openEdwardPanel()
    fireEvent.click(await screen.findByText('Quitar todos los topes'))
    await waitFor(async () => {
      expect((await combatRepo.list())[0].participants[0].pc?.statCaps.open).toHaveLength(7)
    })
    expect((screen.getByLabelText('Operar por encima del límite: Fuerza') as HTMLInputElement).checked).toBe(true)
  })

  it('límite de buffs: los NPC también tienen la tarjeta', async () => {
    await setUpDuel()
    goTo('Turnos')
    const names = await waitFor(() => {
      const els = Array.from(document.querySelectorAll('.participant .name'))
      if (els.length < 2) throw new Error('faltan participantes')
      return els
    })
    fireEvent.click(names[1])
    const card = await screen.findByLabelText('Límite de los buffs')
    expect(card.textContent).toContain('grupo Medio')
    expect(card.textContent).toContain('300')
  })

  it('espíritu: en el panel del jugador se sube de nivel hasta 10 y suma el 10 % del límite a los 7 stats', async () => {
    await openEdwardPanel()
    const card = await screen.findByLabelText('Espíritu')
    expect(card.textContent).toContain('suma 30 a los 7 stats') // Edward es C+: límite 300

    for (let i = 1; i <= 3; i++) {
      fireEvent.click(screen.getByLabelText('Nivel de Espíritu: más'))
      await waitFor(async () => expect((await edwardEffects()).filter((e) => e.typeId === 'espiritu')[0]?.level).toBe(i))
    }
    const spirit = (await edwardEffects()).filter((e) => e.typeId === 'espiritu')
    expect(spirit).toHaveLength(7)
    expect(spirit.every((e) => e.flat === 90 && e.duration.unit === 'manual')).toBe(true)
    expect(new Set(spirit.map((e) => e.target)).size).toBe(7)

    // sube y baja de nivel, y en 0 desaparece
    fireEvent.click(screen.getByLabelText('Nivel de Espíritu: menos'))
    await waitFor(async () => expect((await edwardEffects())[0].flat).toBe(60))
    fireEvent.click(screen.getByLabelText('Nivel de Espíritu: menos'))
    fireEvent.click(screen.getByLabelText('Nivel de Espíritu: menos'))
    await waitFor(async () => expect(await edwardEffects()).toEqual([]))
  })

  it('espíritu: no pasa de nivel 10 y no cuenta para el límite de buffs', async () => {
    await openEdwardPanel()
    const more = screen.getByLabelText('Nivel de Espíritu: más')
    for (let i = 0; i < 12; i++) fireEvent.click(more)
    await waitFor(async () => expect((await edwardEffects())[0]?.level).toBe(10))
    expect((await edwardEffects())[0].flat).toBe(300) // 100 % del límite
    const caps = screen.getByLabelText('Límite de los buffs')
    await waitFor(() => expect(caps.textContent).toContain('Espíritu +300 (aparte: no cuenta para el límite)'))
  })

  it('pestaña Buffs: un buff se aplica a varios combatientes de una vez', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.click(await screen.findByText('Todos'))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Bendición' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '20' } })
    fireEvent.click(screen.getByLabelText('Afecta a Destreza'))
    fireEvent.click(screen.getByText('Aplicar a 2 combatiente(s)'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      for (const p of c.participants) {
        const effects = p.pc?.effects ?? p.npc?.effects ?? []
        expect(effects.map((e) => e.target).sort()).toEqual(['destreza', 'fuerza'])
        expect(effects.every((e) => e.name === 'Bendición' && e.flat === 20)).toBe(true)
      }
      // cada combatiente recibe su propio buff
      const groups = c.participants.map((p) => (p.pc?.effects ?? p.npc?.effects ?? [])[0].group)
      expect(new Set(groups).size).toBe(2)
    })
    // y se ve en el resumen de cada uno
    expect((await screen.findByLabelText('Efectos de Goblin')).textContent).toContain('Bendición')
    expect(screen.getByLabelText('Efectos de Edward').textContent).toContain('Fuerza, Destreza')
  })

  it('pestaña Buffs: aplica solo a los elegidos y avisa si no hay nadie', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.change(await screen.findByLabelText('Valor fijo'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('Aplicar a 0 combatiente(s)'))
    expect((await screen.findByRole('alert')).textContent).toContain('Elige a quiénes')

    fireEvent.click(screen.getByText('Enemigos'))
    fireEvent.click(await screen.findByText('Aplicar a 1 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.effects).toHaveLength(1)
      expect(c.participants.find((p) => p.name === 'Edward')?.pc?.effects).toHaveLength(0)
    })
  })

  it('pestaña Buffs: un debuff a varios y quitarlo desde el resumen', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.click(await screen.findByText('Todos'))
    fireEvent.change(screen.getByLabelText('Clase'), { target: { value: 'debuff' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Maldición' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Los 7 stats'))
    fireEvent.click(screen.getByText('Aplicar a 2 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.every((p) => (p.pc?.effects ?? p.npc?.effects ?? []).length === 7)).toBe(true)
    })

    fireEvent.click(await screen.findByLabelText('Quitar Maldición de Goblin'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.effects).toHaveLength(0)
      expect(c.participants.find((p) => p.name === 'Edward')?.pc?.effects).toHaveLength(7)
    })
  })

  it('pestaña Buffs: el Espíritu se aplica a varios con el valor de cada rango, y se quita con nivel 0', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.click(await screen.findByText('Todos'))
    fireEvent.click(screen.getByText('Espíritu', { selector: 'button' }))
    fireEvent.change(await screen.findByLabelText('Nivel de Espíritu'), { target: { value: '3' } })
    // Edward (C+) y el Goblin (C+) son grupo Medio: 30 por nivel
    expect(screen.getByText(/Edward \(C\+, Medio\): \+30 por nivel/)).toBeTruthy()
    fireEvent.click(screen.getByText('Aplicar Espíritu a 2 combatiente(s)'))

    await waitFor(async () => {
      const [c] = await combatRepo.list()
      for (const p of c.participants) {
        const spirit = (p.pc?.effects ?? p.npc?.effects ?? []).filter((e) => e.typeId === 'espiritu')
        expect(spirit).toHaveLength(7)
        expect(spirit.every((e) => e.flat === 90 && e.level === 3)).toBe(true)
      }
    })

    fireEvent.change(screen.getByLabelText('Nivel de Espíritu'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('Quitar Espíritu a 2 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.every((p) => (p.pc?.effects ?? p.npc?.effects ?? []).length === 0)).toBe(true)
    })
  })

  it('pestaña Buffs: "Terminó la habilidad" a varios quita lo de la habilidad solo a los elegidos', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.click(await screen.findByText('Todos'))
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'habilidad' } })
    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('Aplicar a 2 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.every((p) => (p.pc?.effects ?? p.npc?.effects ?? []).length === 1)).toBe(true)
    })

    fireEvent.click(screen.getByText('Enemigos'))
    fireEvent.click(await screen.findByText('Terminó la habilidad de 1 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants.find((p) => p.name === 'Goblin')?.npc?.effects).toHaveLength(0)
      expect(c.participants.find((p) => p.name === 'Edward')?.pc?.effects).toHaveLength(1)
    })
  })

  it('aumento del límite: se agrega con su origen, sube el límite y "Terminó la habilidad" lo quita', async () => {
    await openEdwardPanel()
    await addBuff({ name: 'Sobrecarga', flat: 400, only: ['Inteligencia'] })
    expect(await screen.findByText('115 → 473 (+358)')).toBeTruthy() // recortado por el límite de 300

    // no se elige entre los stats, tiene su propio formulario
    expect(screen.queryByLabelText('Afecta a Aumento del límite')).toBeNull()

    fireEvent.change(screen.getByLabelText('Origen del aumento'), { target: { value: 'habilidad' } })
    fireEvent.change(screen.getByLabelText('Nombre del aumento'), { target: { value: 'Furia' } })
    fireEvent.change(screen.getByLabelText('Aumento fijo del límite'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Agregar aumento'))

    await waitFor(async () => {
      const raise = (await edwardEffects()).find((e) => e.target === 'limite')
      expect(raise).toMatchObject({ name: 'Furia', typeId: 'habilidad', flat: 100, kind: 'buff' })
      expect(raise?.duration.unit).toBe('habilidad') // una habilidad dura hasta que termine
    })
    // el límite pasa a 400 y el buff entra entero
    expect(await screen.findByText('115 → 515 (+400)')).toBeTruthy()
    expect(screen.getByLabelText('Cuenta del límite').textContent).toContain('Límite base 300 + 100 (Furia, Aumento por habilidad) = 400')

    fireEvent.click(await screen.findByText('Terminó la habilidad'))
    await waitFor(async () => expect((await edwardEffects()).some((e) => e.target === 'limite')).toBe(false))
    expect(await screen.findByText('115 → 473 (+358)')).toBeTruthy()
  })

  it('aumento del límite: se edita desde su propio formulario y se suma al de otro origen', async () => {
    await openEdwardPanel()
    fireEvent.change(screen.getByLabelText('Origen del aumento'), { target: { value: 'estado' } })
    fireEvent.change(screen.getByLabelText('Nombre del aumento'), { target: { value: 'Enfurecido' } })
    fireEvent.change(screen.getByLabelText('Aumento fijo del límite'), { target: { value: '50' } })
    fireEvent.click(screen.getByText('Agregar aumento'))
    await waitFor(async () => expect((await edwardEffects()).filter((e) => e.target === 'limite')).toHaveLength(1))

    fireEvent.click(await screen.findByLabelText('Editar Enfurecido'))
    expect(await screen.findByText('Editar aumento del límite')).toBeTruthy()
    expect((screen.getByLabelText('Aumento fijo del límite') as HTMLInputElement).value).toBe('50')
    fireEvent.change(screen.getByLabelText('Aumento fijo del límite'), { target: { value: '150' } })
    fireEvent.click(screen.getByText('Guardar aumento'))
    await waitFor(async () => {
      const raises = (await edwardEffects()).filter((e) => e.target === 'limite')
      expect(raises).toHaveLength(1)
      expect(raises[0].flat).toBe(150)
    })
    await waitFor(() => expect(screen.getByLabelText('Cuenta del límite').textContent).toContain('= 450'))
  })

  it('aumento del límite: sin valor avisa y no agrega nada', async () => {
    await openEdwardPanel()
    fireEvent.click(screen.getByText('Agregar aumento'))
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('Indica cuánto sube el límite')
    expect(await edwardEffects()).toEqual([])
  })

  it('pestaña Buffs: el aumento del límite se aplica a varios, aparte del Espíritu', async () => {
    await setUpDuel()
    goTo('Buffs')
    fireEvent.click(await screen.findByText('Todos'))
    fireEvent.click(screen.getByText('Aumento del límite', { selector: 'button' }))
    fireEvent.change(await screen.findByLabelText('Origen del aumento'), { target: { value: 'estado' } })
    fireEvent.change(screen.getByLabelText('Nombre del aumento'), { target: { value: 'Furia' } })
    fireEvent.change(screen.getByLabelText('Aumento fijo del límite'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Aplicar a 2 combatiente(s)'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      for (const p of c.participants) {
        const raises = (p.pc?.effects ?? p.npc?.effects ?? []).filter((e) => e.target === 'limite')
        expect(raises).toHaveLength(1)
        expect(raises[0]).toMatchObject({ typeId: 'estado', flat: 80, name: 'Furia' })
      }
    })
    expect((await screen.findByLabelText('Efectos de Edward')).textContent).toContain('Aumento del límite')
  })
})
