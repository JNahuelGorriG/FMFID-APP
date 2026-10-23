// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { edward } from '../rules/fixtures'
import { combatRepo, npcRepo, repo } from './data'
import { defaultEnemyProfile, emptyTree, newNpcTemplate, purchaseNext } from '../rules'
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
    fireEvent.click(screen.getByText('Cargar valores de la tabla'))
    await waitFor(async () => {
      const [c] = await combatRepo.list()
      expect(c.participants[0].pc?.armor).toEqual({ type: 'pesada', rank: 'C', bonus: 130, bonusTarget: 'fisica', usesMax: 18, usesLeft: 18 })
    })
  })

  it('participante: al pasar el límite de 4 buffs pide elegir cuál sale', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    goTo('Agregar')
    fireEvent.click(await screen.findByText('Agregar jugador'))
    goTo('Turnos')
    await openFirstParticipant()

    const types = ['pasivo', 'pocion', 'estilo', 'estado']
    for (const [i, typeId] of types.entries()) {
      fireEvent.change(await screen.findByLabelText('Tipo'), { target: { value: typeId } })
      fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '10' } })
      fireEvent.click(screen.getByText('Agregar efecto'))
      await waitFor(() => expect(screen.getAllByText('Activo')).toHaveLength(i + 1))
    }
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'armamento' } })
    fireEvent.click(screen.getByText('Agregar efecto'))
    expect((await screen.findByRole('alert')).textContent).toContain('Ya hay 4 buffs activos')

    fireEvent.click(screen.getAllByText('Quitar')[0])
    await waitFor(() => expect(screen.queryByText(/Ya hay 4 buffs/)).toBeNull())
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

    fireEvent.click(await screen.findByText('Deshacer último ataque'))
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
    fireEvent.change(screen.getByLabelText('Suma a'), { target: { value: 'inteligencia' } })
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
    fireEvent.change(screen.getByLabelText('Suma a'), { target: { value: 'constitucion' } })
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
})
