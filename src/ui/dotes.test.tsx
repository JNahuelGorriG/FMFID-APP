// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { emptyTree, purchaseNext } from '../rules'
import type { Character, NewDote } from '../rules'
import { edward } from '../rules/fixtures'
import { doteRepo, repo, settingsRepo } from './data'

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

const dote = (name: string, over: Partial<NewDote> = {}): NewDote => ({
  tier: 'E',
  name,
  type: 'fuerza',
  use: 'Pasiva',
  description: `Descripción de ${name}`,
  ...over,
})

async function seed(list: NewDote[]) {
  for (const d of list) await doteRepo.create(d)
}

async function openDotes() {
  render(<App />)
  fireEvent.click(screen.getByText('Dotes', { selector: '.nav-item span, .nav-item *' }))
  await screen.findByText('Buscar y filtrar')
}

const catalog = [
  dote('Hombre Araña de barrio', { tier: 'E', description: '+1 al trepar, colgarte o cargar a alguien encima.' }),
  dote('Placaje de rugby', { tier: 'D', description: '+2 al embestir, derribar o empujar a alguien.' }),
  dote('Piña limpia', { tier: 'E', description: '+1 al d20 de impacto en ataques sin armas.' }),
  dote('Rodar con el golpe', { tier: 'C', type: 'destreza', use: 'Reacción, 2 por batalla', description: 'Cuando te impacta un ataque físico, +1 al d8 de resistencia.' }),
  dote('Bip bip', { tier: 'B', type: 'destreza', use: '2 por descanso largo', description: 'Ventaja en una tirada de huida.' }),
  dote('Chispa', { tier: 'E', type: 'inteligencia', description: '+1 al d20 al lanzar magia de maná.' }),
  dote('Voz de mando', { tier: 'S', type: 'sabiduria', use: '1 por batalla', description: 'Tu conjuro va con d10 de éxito.' }),
]

describe('pestaña Dotes', () => {
  it('está en la barra, entre NPCs y Más', async () => {
    render(<App />)
    const labels = Array.from(document.querySelectorAll('.nav-item')).map((n) => n.textContent ?? '')
    expect(labels.map((l) => l.replace(/[^A-Za-zÁ-ú]/g, ''))).toEqual(['Personajes', 'Combate', 'NPCs', 'Dotes', 'Más'])
  })

  it('sin dotes explica cómo empezar', async () => {
    await openDotes()
    expect(await screen.findByText('Todavía no hay dotes.')).toBeTruthy()
    expect(screen.getByText('0 dotes')).toBeTruthy()
  })

  it('las agrupa por stat, con su tier, uso y descripción', async () => {
    await seed(catalog)
    await openDotes()
    expect(await screen.findByText('Fuerza (3)')).toBeTruthy()
    expect(screen.getByText('Destreza (2)')).toBeTruthy()
    expect(screen.getByText('Inteligencia (1)')).toBeTruthy()
    expect(screen.queryByText(/Carisma \(/)).toBeNull() // un tipo sin dotes no aparece
    expect(screen.getByText('7 dotes')).toBeTruthy()

    const fuerza = screen.getByText('Fuerza (3)').closest('details') as HTMLElement
    // dentro de un tipo van por tier y nombre
    const names = Array.from(fuerza.querySelectorAll('.dote-head strong')).map((n) => n.textContent)
    expect(names).toEqual(['Hombre Araña de barrio', 'Piña limpia', 'Placaje de rugby'])
    expect(within(fuerza).getAllByLabelText('Tier E')).toHaveLength(2)
    expect(within(fuerza).getByLabelText('Tier D')).toBeTruthy()
    expect(within(fuerza).getByText('+2 al embestir, derribar o empujar a alguien.')).toBeTruthy()

    const destreza = screen.getByText('Destreza (2)').closest('details') as HTMLElement
    expect(destreza.textContent).toContain('Reacción, 2 por batalla')
    expect(destreza.textContent).toContain('2 por descanso largo')
  })

  it('crea una dote nueva con tier, nombre, tipo, uso y descripción', async () => {
    await openDotes()
    fireEvent.click(await screen.findByText('Nueva dote'))
    fireEvent.change(await screen.findByLabelText('Tier'), { target: { value: 'C' } })
    fireEvent.change(screen.getByLabelText('Nombre de la dote'), { target: { value: 'Mirada de águila' } })
    fireEvent.change(screen.getByLabelText('Tipo de dote'), { target: { value: 'percepcion' } })
    fireEvent.change(screen.getByLabelText('Uso'), { target: { value: 'Reacción, 1 por batalla' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Ves lo que otros no ven.' } })
    fireEvent.click(screen.getByText('Guardar dote'))

    expect(await screen.findByText('Dote "Mirada de águila" creada.')).toBeTruthy()
    const [saved] = await doteRepo.list()
    expect(saved).toMatchObject({ tier: 'C', name: 'Mirada de águila', type: 'percepcion', use: 'Reacción, 1 por batalla', description: 'Ves lo que otros no ven.' })
    expect(await screen.findByText('Percepción (1)')).toBeTruthy()
  })

  it('el formulario ofrece los usos más comunes y el tipo "dotes únicas"', async () => {
    await openDotes()
    fireEvent.click(await screen.findByText('Nueva dote'))
    await screen.findByLabelText('Uso')
    const options = Array.from(document.querySelectorAll('#usos-de-dotes option')).map((o) => (o as HTMLOptionElement).value)
    expect(options).toContain('Pasiva')
    expect(options).toContain('Reacción, 2 por batalla')
    const types = Array.from((screen.getByLabelText('Tipo de dote') as HTMLSelectElement).options).map((o) => o.text)
    expect(types).toEqual(['Fuerza', 'Destreza', 'Constitución', 'Percepción', 'Inteligencia', 'Sabiduría', 'Carisma', 'Dotes únicas'])
  })

  it('pide un nombre y no deja repetir una dote del mismo tipo (en otro tipo sí)', async () => {
    await seed([dote('Chispa', { type: 'inteligencia' })])
    await openDotes()
    fireEvent.click(await screen.findByText('Nueva dote'))
    fireEvent.click(await screen.findByText('Guardar dote'))
    expect((await screen.findByRole('alert')).textContent).toContain('necesita un nombre')

    fireEvent.change(screen.getByLabelText('Nombre de la dote'), { target: { value: 'chispa' } })
    fireEvent.change(screen.getByLabelText('Tipo de dote'), { target: { value: 'inteligencia' } })
    fireEvent.click(screen.getByText('Guardar dote'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Ya hay una dote "Chispa"'))
    expect(await doteRepo.list()).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('Tipo de dote'), { target: { value: 'unico' } })
    fireEvent.click(screen.getByText('Guardar dote'))
    await waitFor(async () => expect(await doteRepo.list()).toHaveLength(2))
  })

  it('edita una dote existente y la borra con confirmación', async () => {
    await seed(catalog)
    await openDotes()
    fireEvent.click(await screen.findByLabelText('Editar Piña limpia'))
    expect((await screen.findByLabelText('Nombre de la dote') as HTMLInputElement).value).toBe('Piña limpia')
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'D' } })
    fireEvent.change(screen.getByLabelText('Uso'), { target: { value: '1 por batalla' } })
    fireEvent.click(screen.getByText('Guardar dote'))
    await waitFor(async () => {
      const found = (await doteRepo.list()).find((d) => d.name === 'Piña limpia')
      expect([found?.tier, found?.use]).toEqual(['D', '1 por batalla'])
    })

    fireEvent.click(await screen.findByLabelText('Editar Chispa'))
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(await screen.findByText('Borrar dote'))
    expect((await doteRepo.list()).some((d) => d.name === 'Chispa')).toBe(true) // dijo que no
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Borrar dote'))
    await waitFor(async () => expect((await doteRepo.list()).some((d) => d.name === 'Chispa')).toBe(false))
  })

  it('busca y filtra por tipo, tier y forma de uso', async () => {
    await seed(catalog)
    await openDotes()
    await screen.findByText('7 dotes')

    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'destreza' } })
    expect(await screen.findByText('2 de 7 dotes')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'todos' } })

    fireEvent.change(screen.getByLabelText('Filtrar por tier'), { target: { value: 'E' } })
    expect(await screen.findByText('3 de 7 dotes')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Filtrar por tier'), { target: { value: 'todos' } })

    fireEvent.change(screen.getByLabelText('Filtrar por uso'), { target: { value: 'reaccion' } })
    expect(await screen.findByText('1 de 7 dotes')).toBeTruthy()
    expect(screen.getByLabelText('Editar Rodar con el golpe')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Filtrar por uso'), { target: { value: 'descanso' } })
    expect(await screen.findByLabelText('Editar Bip bip')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Filtrar por uso'), { target: { value: 'todos' } })

    fireEvent.change(screen.getByLabelText('Buscar dote'), { target: { value: 'trepar' } })
    expect(await screen.findByText('1 de 7 dotes')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar dote'), { target: { value: 'nada que ver' } })
    expect(await screen.findByText('Ninguna dote coincide con lo que buscas.')).toBeTruthy()
  })

  it('se puede ver como una tabla global, con la misma información y filtros', async () => {
    await seed(catalog)
    await openDotes()
    fireEvent.click(await screen.findByText('Tabla'))
    const table = await screen.findByLabelText('Tabla de dotes')
    const headers = Array.from(table.querySelectorAll('th')).map((h) => h.textContent)
    expect(headers).toEqual(['Tier', 'Dote', 'Tipo', 'Uso', 'Descripción'])
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(7)
    expect(rows[0].textContent).toContain('Hombre Araña de barrio')
    expect(rows[0].textContent).toContain('Fuerza')
    expect(rows[3].textContent).toContain('Rodar con el golpe')
    expect(rows[3].textContent).toContain('Destreza')
    expect(rows[3].textContent).toContain('Reacción, 2 por batalla')

    fireEvent.change(screen.getByLabelText('Filtrar por tier'), { target: { value: 'S' } })
    await waitFor(() => expect(table.ownerDocument.querySelectorAll('[aria-label="Tabla de dotes"] tbody tr')).toHaveLength(1))
    // desde la tabla también se edita
    fireEvent.click(screen.getByLabelText('Editar Voz de mando'))
    expect((await screen.findByLabelText('Nombre de la dote') as HTMLInputElement).value).toBe('Voz de mando')
  })

  it('importa un archivo de dotes y cuenta lo que pasó', async () => {
    await seed([dote('Chispa', { type: 'inteligencia', description: 'vieja' })])
    await openDotes()
    const json = JSON.stringify({
      app: 'fmfid-app',
      kind: 'dotes',
      version: 1,
      exportedAt: '',
      dotes: [dote('Chispa', { type: 'inteligencia', description: 'nueva' }), dote('Mandoble', { tier: 'D' })],
      sheets: [{ id: 'dotes-reglas', title: 'Dotes: reglas generales', rows: [['Regla', 'Detalle'], ['Tope', '+3 al d20']], header: true }],
    })
    const file = new File([json], 'dotes.json', { type: 'application/json' })
    file.text = async () => json
    fireEvent.change(await screen.findByLabelText('Archivo de dotes'), { target: { files: [file] } })

    expect(await screen.findByText(/Dotes: 1 nuevas, 1 actualizadas y 0 sin cambios, y 1 hoja\(s\) de reglas/)).toBeTruthy()
    expect((await doteRepo.list()).map((d) => d.name).sort()).toEqual(['Chispa', 'Mandoble'])
    // las reglas quedan para consultar
    expect(await screen.findByText('Dotes: reglas generales')).toBeTruthy()
    expect((await settingsRepo.getDoteSheets())[0].rows[1]).toEqual(['Tope', '+3 al d20'])
  })

  it('rechaza un archivo que no es de dotes y no cambia nada', async () => {
    await seed([dote('Chispa')])
    await openDotes()
    const json = JSON.stringify({ app: 'otra-cosa' })
    const file = new File([json], 'raro.json')
    file.text = async () => json
    fireEvent.change(await screen.findByLabelText('Archivo de dotes'), { target: { files: [file] } })
    expect(await screen.findByText(/no es una lista de dotes/)).toBeTruthy()
    expect(await doteRepo.list()).toHaveLength(1)
  })

  it('exporta los dotes a un archivo', async () => {
    await seed(catalog)
    const created: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (created.push(b as Blob), 'blob:fake'))
    URL.revokeObjectURL = vi.fn()
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    await openDotes()
    fireEvent.click(await screen.findByText('Exportar dotes (.json)'))
    await waitFor(() => expect(created).toHaveLength(1))
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(created[0])
    })
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ app: 'fmfid-app', kind: 'dotes' })
    expect(parsed.dotes).toHaveLength(7)
    expect(names[0]).toMatch(/^fmfid-dotes-\d{4}-\d{2}-\d{2}\.json$/)
    expect(await screen.findByText('Se exportaron 7 dotes.')).toBeTruthy()
  })
})

describe('dotes en el árbol y la ficha', () => {
  /** Edward con 4 nodos comprados de Fuerza: el 5.º (dote o habilidad) está disponible. */
  async function openTreeAtDote(extra: Partial<Character> = {}, bp = 100) {
    let c: Character = { ...edward, tree: { ...emptyTree(), bp } }
    for (let i = 0; i < 4; i++) c = purchaseNext(c, 'fuerza', 'stat')
    const { id: _a, createdAt: _b, updatedAt: _d, ...data } = { ...c, ...extra }
    await repo.create(data)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Árbol de stats'))
    await screen.findByText('Árbol de Edward')
  }
  const nodeCard = (n: number) => Array.from(document.querySelectorAll<HTMLElement>('.card.node'))[n - 1]
  const ownedDotes = async () => (await repo.list())[0].tree?.dotes ?? []

  it('al comprar una dote se elige del catálogo: solo las del tier que toca y de la rama', async () => {
    await seed(catalog)
    await openTreeAtDote()
    fireEvent.click(within(nodeCard(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })

    expect(await screen.findByText(/te toca una de tier/)).toBeTruthy()
    const select = screen.getByLabelText('Dote del catálogo') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.text)
    // sin dotes todavía: tier E, y solo de Fuerza
    expect(labels).toEqual([
      'Escribir a mano o decidir después',
      'E · Hombre Araña de barrio (Pasiva)',
      'E · Piña limpia (Pasiva)',
    ])

    fireEvent.click(screen.getByLabelText('Mostrar las dotes de todos los tiers'))
    expect(Array.from((screen.getByLabelText('Dote del catálogo') as HTMLSelectElement).options).map((o) => o.text)).toContain('D · Placaje de rugby (Pasiva)')
    expect(Array.from((screen.getByLabelText('Dote del catálogo') as HTMLSelectElement).options).map((o) => o.text).join()).not.toContain('Chispa')
  })

  it('elegir una dote del catálogo la muestra, no pide escribirla y queda anotada con su vínculo', async () => {
    await seed(catalog)
    await openTreeAtDote()
    fireEvent.click(within(nodeCard(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    expect(screen.getByLabelText('Nombre de la dote (opcional)')).toBeTruthy() // a mano, mientras no se elija una

    const piña = (await doteRepo.list()).find((d) => d.name === 'Piña limpia')!
    fireEvent.change(await screen.findByLabelText('Dote del catálogo'), { target: { value: piña.id } })
    const preview = await screen.findByLabelText('Dote elegida')
    expect(preview.textContent).toContain('Piña limpia')
    expect(preview.textContent).toContain('+1 al d20 de impacto en ataques sin armas.')
    expect(screen.queryByLabelText('Nombre de la dote (opcional)')).toBeNull()

    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect(await ownedDotes()).toHaveLength(1))
    expect((await ownedDotes())[0]).toMatchObject({ name: 'Piña limpia', catalogId: piña.id, description: '+1 al d20 de impacto en ataques sin armas.' })
    const c = (await repo.list())[0]
    expect(c.tree?.purchases.at(-1)).toMatchObject({ nodeId: 'fuerza:1:4', choice: 'dote', note: 'Piña limpia' })
  })

  it('la escalera avanza con cada dote: con una ya tiene, también se ofrecen las de tier D', async () => {
    await seed(catalog)
    await openTreeAtDote()
    const first = (await doteRepo.list()).find((d) => d.name === 'Piña limpia')!
    fireEvent.click(within(nodeCard(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    fireEvent.change(await screen.findByLabelText('Dote del catálogo'), { target: { value: first.id } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect(await ownedDotes()).toHaveLength(1))

    // los nodos 6 a 9 y el 10, la segunda dote
    for (let n = 6; n <= 9; n++) {
      await waitFor(() => expect(within(nodeCard(n)).queryByText('Comprar')).toBeTruthy())
      fireEvent.click(within(nodeCard(n)).getByText('Comprar'))
      fireEvent.click(await screen.findByText('Confirmar compra'))
      await waitFor(async () => expect((await repo.list())[0].tree?.purchases.some((p) => p.nodeId === `fuerza:1:${n - 1}`)).toBe(true))
    }
    await waitFor(() => expect(within(nodeCard(10)).queryByText('Comprar')).toBeTruthy())
    fireEvent.click(within(nodeCard(10)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 10'), { target: { value: 'dote' } })
    const labels = Array.from((await screen.findByLabelText('Dote del catálogo') as HTMLSelectElement).options).map((o) => o.text)
    expect(labels.join()).toContain('E · Hombre Araña de barrio')
    expect(labels.join()).toContain('D · Placaje de rugby') // el segundo paso de la escalera
  })

  it('si no hay dotes de esa rama en el catálogo, lo avisa y se puede escribir a mano', async () => {
    await seed([dote('Chispa', { type: 'inteligencia' })])
    await openTreeAtDote()
    fireEvent.click(within(nodeCard(5)).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    expect(await screen.findByText(/No hay dotes de fuerza en el catálogo/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nombre de la dote (opcional)'), { target: { value: 'A mano' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect((await ownedDotes())[0]).toMatchObject({ name: 'A mano' }))
    expect('catalogId' in (await ownedDotes())[0]).toBe(false)
  })

  it('"Vincular todo con el catálogo" empareja por nombre las dotes ya cargadas a mano', async () => {
    await seed(catalog)
    // el GM ya había cargado estas dotes a mano, con el tier en el nombre y el uso en la descripción
    await openTreeAtDote({
      tree: {
        ...emptyTree(),
        dotes: [
          { id: 'fuerza:1:4', name: 'Hombre Araña de barrio (E)', description: 'Pasiva\n+1 al trepar, colgarte o cargar a alguien encima.', nodeId: 'fuerza:1:4' },
          { id: 'fuerza:1:9', name: 'Una inventada', description: 'x', nodeId: 'fuerza:1:9' },
        ],
      },
    })
    fireEvent.click(await screen.findByText('Vincular todo con el catálogo'))
    expect(await screen.findByText(/Se vincularon 1 dote\(s\) con el catálogo y 1 quedaron sin coincidencia/)).toBeTruthy()
    // la vinculada se ve con su ficha; la otra sigue a mano
    expect((await screen.findByLabelText('Dote 1')).textContent).toContain('Hombre Araña de barrio')
    expect((screen.getByLabelText('Nombre de la dote 2') as HTMLInputElement).value).toBe('Una inventada')

    fireEvent.click(screen.getByText('Guardar dotes'))
    await waitFor(async () => {
      const [a, b] = await ownedDotes()
      expect(a.name).toBe('Hombre Araña de barrio')
      expect(a.catalogId).toBeTruthy()
      expect(b.catalogId).toBeUndefined()
    })
  })

  it('una dote se puede vincular o cambiar a mano con el selector de cada dote', async () => {
    await seed(catalog)
    await openTreeAtDote({
      tree: { ...emptyTree(), dotes: [{ id: 'fuerza:1:4', name: '', description: '', nodeId: 'fuerza:1:4' }] },
    })
    const placaje = (await doteRepo.list()).find((d) => d.name === 'Placaje de rugby')!
    fireEvent.change(await screen.findByLabelText('Dote 1 del catálogo'), { target: { value: placaje.id } })
    expect((await screen.findByLabelText('Dote 1')).textContent).toContain('+2 al embestir, derribar o empujar a alguien.')
    fireEvent.click(screen.getByText('Guardar dotes'))
    await waitFor(async () => expect((await ownedDotes())[0]).toMatchObject({ name: 'Placaje de rugby', catalogId: placaje.id }))

    // soltarla del catálogo la deja con el texto que tenía
    fireEvent.change(await screen.findByLabelText('Dote 1 del catálogo'), { target: { value: '' } })
    expect((await screen.findByLabelText('Nombre de la dote 1') as HTMLInputElement).value).toBe('Placaje de rugby')
  })

  it('si se borra la dote del catálogo, el jugador conserva su texto', async () => {
    await seed(catalog)
    const piña = (await doteRepo.list()).find((d) => d.name === 'Piña limpia')!
    await openTreeAtDote({
      tree: { ...emptyTree(), dotes: [{ id: 'fuerza:1:4', name: 'Piña limpia', description: 'su texto', nodeId: 'fuerza:1:4', catalogId: piña.id }] },
    })
    expect((await screen.findByLabelText('Dote 1')).textContent).toContain('+1 al d20 de impacto en ataques sin armas.')
    await doteRepo.remove(piña.id)
    expect((await screen.findByLabelText('Nombre de la dote 1') as HTMLInputElement).value).toBe('Piña limpia')
  })

  it('la ficha muestra las dotes del personaje con su tier y uso', async () => {
    await seed(catalog)
    const piña = (await doteRepo.list()).find((d) => d.name === 'Piña limpia')!
    await repo.create({
      ...edwardData,
      tree: {
        ...emptyTree(),
        dotes: [
          { id: 'a', name: 'Piña limpia', description: 'viejo', nodeId: 'fuerza:1:4', catalogId: piña.id },
          { id: 'b', name: 'Escrita a mano', description: 'texto propio', nodeId: 'fuerza:1:9' },
        ],
      },
    })
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    const section = (await screen.findByText('Dotes (2)')).closest('details') as HTMLElement
    expect(within(section).getByLabelText('Tier E')).toBeTruthy()
    expect(section.textContent).toContain('Piña limpia')
    expect(section.textContent).toContain('+1 al d20 de impacto en ataques sin armas.') // del catálogo, no el texto viejo
    expect(section.textContent).not.toContain('viejo')
    expect(section.textContent).toContain('Escrita a mano')
    expect(section.textContent).toContain('texto propio')
  })

  it('la ficha sin dotes lo explica', async () => {
    await repo.create(edwardData)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    expect(await screen.findByText(/Todavía no tiene dotes/)).toBeTruthy()
  })
})
