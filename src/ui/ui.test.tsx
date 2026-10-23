// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { db } from '../db'
import { edward } from '../rules/fixtures'
import { npcRepo, repo } from './data'
import { defaultEnemyProfile, newNpcTemplate } from '../rules'

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(async () => {
  localStorage.clear()
  await db.characters.clear()
  await db.changes.clear()
  await db.npcs.clear()
  await db.combats.clear()
  await db.characterStates.clear()
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

  async function openFirstParticipant() {
    const name = await waitFor(() => {
      const el = document.querySelector('.participant .name')
      if (!el) throw new Error('todavía no está el participante')
      return el
    })
    fireEvent.click(name)
  }

  it('combate: crea un campo con nombre, arma el orden y avanza turnos y rondas', async () => {
    await repo.create(edwardData)
    await npcRepo.create({ ...newNpcTemplate(), name: 'Goblin', rank: 'D', combat: defaultEnemyProfile('D') })
    await openNewCombat()

    fireEvent.click(await screen.findByText('Agregar jugador'))
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Agregar NPC'))
    expect(await screen.findByText('Goblin 2')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Iniciativa de Edward'), { target: { value: '20' } })
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
    expect(screen.getByText('Ronda 2')).toBeTruthy()
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

  it('participante: baja la vida y un buff cambia los valores', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    fireEvent.click(await screen.findByText('Agregar jugador'))
    await openFirstParticipant()

    fireEvent.click(await screen.findByLabelText('Leves: menos'))
    await waitFor(() => expect(screen.getByLabelText('Leves: valor').textContent).toContain('9'))

    fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Agregar efecto'))
    expect(await screen.findByText('Valores con efectos')).toBeTruthy()
    expect(screen.getByText('357,1 → 457,1 (+100)')).toBeTruthy()
  })

  it('participante: al pasar el límite de 4 buffs pide elegir cuál sale', async () => {
    await repo.create(edwardData)
    await openNewCombat()
    fireEvent.click(await screen.findByText('Agregar jugador'))
    await openFirstParticipant()

    const types = ['pasivo', 'pocion', 'estilo', 'estado']
    for (const [i, typeId] of types.entries()) {
      fireEvent.change(await screen.findByLabelText('Tipo'), { target: { value: typeId } })
      fireEvent.change(screen.getByLabelText('Valor fijo'), { target: { value: '10' } })
      fireEvent.click(screen.getByText('Agregar efecto'))
      // esperar a que se guarde antes de agregar el siguiente
      await waitFor(() => expect(screen.getAllByText('Activo')).toHaveLength(i + 1))
    }
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'armamento' } })
    fireEvent.click(screen.getByText('Agregar efecto'))
    expect((await screen.findByRole('alert')).textContent).toContain('Ya hay 4 buffs activos')

    // "Quitar" dentro del aviso reemplaza a uno
    const quitar = screen.getAllByText('Quitar')[0]
    fireEvent.click(quitar)
    await waitFor(() => expect(screen.queryByText(/Ya hay 4 buffs/)).toBeNull())
    expect(screen.getAllByText('Activo')).toHaveLength(4)
  })
})
