// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { STAT_NAMES, characterSheet, trainingOf, trainingTotals } from '../rules'
import type { StatName } from '../rules'
import { edward } from '../rules/fixtures'
import { repo } from './data'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

const { id: _id, createdAt: _c, updatedAt: _u, ...edwardData } = edward

beforeEach(async () => {
  localStorage.clear()
  for (const table of [db.characters, db.changes, db.npcs, db.combats, db.settings, db.dotes]) await table.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const saved = async () => (await repo.list())[0]
const temp = async (stat: StatName) => trainingOf(await saved(), stat).temporary
const perm = async (stat: StatName) => trainingOf(await saved(), stat).permanent

async function openSheet() {
  await repo.create(edwardData)
  render(<App />)
  fireEvent.click(await screen.findByText('Edward'))
  await screen.findByText('Perder entrenamiento temporal')
}

/** Escribe puntos temporales en varios stats y los guarda. */
async function loadTemps(temps: Partial<Record<StatName, number>>) {
  for (const [stat, value] of Object.entries(temps)) {
    const label = `${stat.charAt(0).toUpperCase()}${stat.slice(1)} · temporal`
    fireEvent.change(screen.getByLabelText(label.replace('Constitucion', 'Constitución').replace('Percepcion', 'Percepción').replace('Sabiduria', 'Sabiduría')), { target: { value: String(value) } })
  }
  fireEvent.click(screen.getByText('Guardar entrenamiento'))
  await waitFor(async () => {
    for (const [stat, value] of Object.entries(temps)) expect(await temp(stat as StatName)).toBe(value)
  })
}

describe('entrenamiento en la ficha', () => {
  it('es una sección de la ficha, entre las dotes y los stats derivados, y no mueve a las del final', async () => {
    await openSheet()
    const titles = Array.from(document.querySelectorAll('details.section > summary h2')).map((h) => h.textContent ?? '')
    const i = titles.indexOf('Entrenamiento')
    expect(i).toBeGreaterThan(-1)
    expect(titles[i - 1]).toMatch(/^Dotes/)
    expect(titles[i + 1]).toBe('Stats derivados')
    // "Subir puntos de Stats" sigue penúltima, justo antes del historial
    expect(titles.at(-2)).toBe('Subir puntos de Stats')
    expect(titles.at(-1)).toMatch(/^Historial de cambios/)
  })

  it('muestra el permanente y el temporal de cada stat y los totales', async () => {
    await openSheet()
    for (const label of ['Fuerza', 'Destreza', 'Constitución', 'Percepción', 'Inteligencia', 'Sabiduría', 'Carisma']) {
      expect(screen.getByLabelText(`${label} · permanente`)).toBeTruthy()
      expect(screen.getByLabelText(`${label} · temporal`)).toBeTruthy()
    }
    expect((screen.getByLabelText('Fuerza · permanente') as HTMLInputElement).value).toBe(String(edward.sources.fuerza.entrenamiento))
    expect((screen.getByLabelText('Fuerza · temporal') as HTMLInputElement).value).toBe('0')
    const totals = trainingTotals(edward)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === `Permanente: ${totals.permanent} · Temporal: 0`)).toBeTruthy()
  })

  it('se llena, se guarda con historial y suma al stat', async () => {
    await openSheet()
    const before = characterSheet(await saved()).totals.fuerza
    expect((screen.getByText('Guardar entrenamiento') as HTMLButtonElement).disabled).toBe(true) // nada que guardar
    fireEvent.change(screen.getByLabelText('Fuerza · permanente'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Fuerza · temporal'), { target: { value: '15' } })
    expect((screen.getByText('Guardar entrenamiento') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('Guardar entrenamiento'))

    expect(await screen.findByText('Entrenamiento guardado.')).toBeTruthy()
    expect(await perm('fuerza')).toBe(60)
    expect(await temp('fuerza')).toBe(15)
    const after = characterSheet(await saved()).totals.fuerza
    expect(after - before).toBeCloseTo(60 - edward.sources.fuerza.entrenamiento + 15, 6) // planos, sin multiplicador
    const history = await repo.history((await saved()).id)
    expect(history.map((h) => h.path).sort()).toEqual(['sources.fuerza.entrenamiento', 'sources.fuerza.entrenamientoTemp'])
    expect(history.every((h) => h.reason === 'Entrenamiento: actualizó los puntos permanentes y temporales')).toBe(true)
    await waitFor(() => expect((screen.getByText('Guardar entrenamiento') as HTMLButtonElement).disabled).toBe(true))
  })

  it('no permite números negativos', async () => {
    await openSheet()
    fireEvent.change(screen.getByLabelText('Destreza · temporal'), { target: { value: '-4' } })
    fireEvent.click(screen.getByText('Guardar entrenamiento'))
    await waitFor(async () => expect(await temp('destreza')).toBe(0))
  })

  it('también se ve y se edita desde la pantalla de edición, con el nombre claro', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Editar'))
    expect(await screen.findByLabelText('Fuerza · Entrenamiento permanente')).toBeTruthy()
    fireEvent.change(await screen.findByLabelText('Fuerza · Entrenamiento temporal'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), { target: { value: 'Entrenó' } })
    fireEvent.click(screen.getByText('Guardar cambios'))
    await waitFor(async () => expect(await temp('fuerza')).toBe(8))
  })
})

describe('perder entrenamiento temporal', () => {
  it('sin puntos temporales los botones están apagados y lo dice', async () => {
    await openSheet()
    expect((screen.getByText('Perder la primera mitad') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Perder todo lo temporal') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('No tiene puntos de entrenamiento temporales.')).toBeTruthy()
  })

  it('"Perder la primera mitad" pide confirmar, quita la mitad en cada stat y no toca el permanente', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10, destreza: 5, percepcion: 1 })
    const permBefore = await perm('fuerza')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    fireEvent.click(screen.getByText('Perder la primera mitad'))
    await waitFor(async () => expect(await temp('fuerza')).toBe(5))
    expect(await temp('destreza')).toBe(3) // 5 → pierde 2
    expect(await temp('percepcion')).toBe(1) // con 1 punto, la mitad es 0
    expect(await perm('fuerza')).toBe(permBefore)

    // el aviso dice qué va a pasar en cada stat, y solo en los que cambian
    const text = String(confirm.mock.calls[0][0])
    expect(text).toContain('la primera mitad de los puntos temporales')
    expect(text).toContain('Fuerza 10 → 5')
    expect(text).toContain('Destreza 5 → 3')
    expect(text).not.toContain('Percepción')
    expect(text).toContain('En total pierde 7 puntos')

    expect((await screen.findByText(/Listo: perdió la primera mitad de los puntos temporales \(7 puntos en total\)/)).textContent).toBeTruthy()
    const history = await repo.history((await saved()).id)
    expect(history.some((h) => h.reason === 'Entrenamiento: perdió la primera mitad de los puntos temporales (−7 en total)' && h.path === 'sources.fuerza.entrenamientoTemp')).toBe(true)
    // los campos muestran lo nuevo
    await waitFor(() => expect((screen.getByLabelText('Fuerza · temporal') as HTMLInputElement).value).toBe('5'))
  })

  it('"Perder todo lo temporal" los deja en 0 en los 7 stats', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10, carisma: 6, sabiduria: 2 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Perder todo lo temporal'))
    await waitFor(async () => expect(trainingTotals(await saved()).temporary).toBe(0))
    expect(await screen.findByText(/Listo: perdió todos los puntos temporales \(18 puntos en total\)/)).toBeTruthy()
    // y ya no hay nada más que perder
    await waitFor(() => expect((screen.getByText('Perder todo lo temporal') as HTMLButtonElement).disabled).toBe(true))
    expect((screen.getByText('Perder la primera mitad') as HTMLButtonElement).disabled).toBe(true)
  })

  it('si se cancela el aviso no cambia nada', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10 })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByText('Perder todo lo temporal'))
    expect(await temp('fuerza')).toBe(10)
    expect((await repo.history((await saved()).id)).every((h) => !h.reason.includes('perdió'))).toBe(true)
  })

  it('primero la mitad y después todo: pierde todo lo que quedaba', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Perder la primera mitad'))
    await waitFor(async () => expect(await temp('fuerza')).toBe(5))
    await waitFor(() => expect((screen.getByText('Perder todo lo temporal') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByText('Perder todo lo temporal'))
    await waitFor(async () => expect(await temp('fuerza')).toBe(0))
  })

  it('con cambios sin guardar no deja perder puntos y avisa que se guarde antes', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10 })
    fireEvent.change(screen.getByLabelText('Destreza · temporal'), { target: { value: '4' } })
    expect((screen.getByText('Perder todo lo temporal') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Perder la primera mitad') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Guarda los cambios antes de perder puntos.')).toBeTruthy()
  })

  it('perder puntos baja los stats del personaje exactamente lo perdido', async () => {
    await openSheet()
    await loadTemps({ fuerza: 10, destreza: 6 })
    const before = characterSheet(await saved()).totals
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Perder todo lo temporal'))
    await waitFor(async () => expect(trainingTotals(await saved()).temporary).toBe(0))
    const after = characterSheet(await saved()).totals
    expect(before.fuerza - after.fuerza).toBeCloseTo(10, 6)
    expect(before.destreza - after.destreza).toBeCloseTo(6, 6)
    for (const stat of STAT_NAMES.filter((s) => s !== 'fuerza' && s !== 'destreza')) expect(after[stat]).toBeCloseTo(before[stat], 6)
  })

  it('cada jugador tiene el suyo: perder los de uno no toca a otro', async () => {
    await repo.create(edwardData)
    await repo.create({ ...edwardData, name: 'Roy' })
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    await screen.findByText('Perder entrenamiento temporal')
    await loadTemps({ fuerza: 10 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Perder todo lo temporal'))
    await waitFor(async () => expect((await repo.list()).find((c) => c.name === 'Edward')?.sources.fuerza.entrenamientoTemp).toBe(0))
    const roy = (await repo.list()).find((c) => c.name === 'Roy')!
    expect(roy.sources.fuerza.entrenamientoTemp).toBeUndefined()
    expect(within(document.body).getAllByText('Perder todo lo temporal')).toHaveLength(1)
  })
})
