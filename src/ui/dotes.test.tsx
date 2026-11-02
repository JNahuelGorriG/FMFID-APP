// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { emptyTree, purchaseNext } from '../rules'
import type { Character, Dote, NewDote } from '../rules'
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
    expect(headers).toEqual(['Tier', 'Dote', 'Tipo', 'Uso', 'Descripción', 'La tienen'])
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

    // vinculada, el selector se guarda detrás de "Cambiar dote"; soltarla del catálogo la deja con el texto que tenía
    expect(screen.queryByLabelText('Dote 1 del catálogo')).toBeNull()
    fireEvent.click(screen.getByLabelText('Cambiar la dote 1'))
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
    // el catálogo carga aparte: se espera a que la dote vinculada muestre sus datos
    await waitFor(() => expect(within(section).getByLabelText('Tier E')).toBeTruthy())
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

// ───────────────────────── orden, filtro por jugador y vista por jugador

const withDotes = (name: string, dotes: Dote[]) =>
  repo.create({ ...edwardData, name, playerName: `Jug ${name}`, tree: { ...emptyTree(), dotes } })

const idOf = async (name: string) => (await doteRepo.list()).find((d) => d.name === name)!.id

describe('ordenar y filtrar por jugador', () => {
  async function setUp() {
    await seed(catalog)
    await withDotes('Edward', [
      { id: 'a', name: 'Piña limpia', description: '', nodeId: 'fuerza:1:4', catalogId: await idOf('Piña limpia') },
      { id: 'b', name: 'Chispa (E)', description: '', nodeId: 'inteligencia:1:4' }, // a mano: se reconoce por el nombre
      { id: 'c', name: 'Inventada', description: 'x', nodeId: 'fuerza:1:9' }, // no está en el catálogo
    ])
    await withDotes('Roy', [{ id: 'd', name: 'Bip bip', description: '', nodeId: 'destreza:1:4', catalogId: await idOf('Bip bip') }])
    await openDotes()
    await screen.findByText('7 dotes')
  }

  it('cada dote dice quiénes la tienen, aunque se haya escrito a mano', async () => {
    await setUp()
    const fuerza = (await screen.findByText('Fuerza (3)')).closest('details') as HTMLElement
    const pina = within(fuerza).getByLabelText('Editar Piña limpia').closest('li') as HTMLElement
    expect(pina.textContent).toContain('La tienen: Edward')
    const inteligencia = screen.getByText('Inteligencia (1)').closest('details') as HTMLElement
    expect(inteligencia.textContent).toContain('La tienen: Edward') // "Chispa (E)" escrita a mano
    const destreza = screen.getByText('Destreza (2)').closest('details') as HTMLElement
    expect(within(destreza).getByLabelText('Editar Bip bip').closest('li')?.textContent).toContain('La tienen: Roy')
    expect(within(destreza).getByLabelText('Editar Rodar con el golpe').closest('li')?.textContent).not.toContain('La tienen')
  })

  it('se filtra por jugador y por "dotes que nadie tiene"', async () => {
    await setUp()
    const options = Array.from((screen.getByLabelText('Filtrar por jugador') as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toEqual(['Todos los jugadores', 'Edward (Jug Edward)', 'Roy (Jug Roy)', 'Dotes que nadie tiene'])

    const edward = (await repo.list()).find((c) => c.name === 'Edward')!
    fireEvent.change(screen.getByLabelText('Filtrar por jugador'), { target: { value: edward.id } })
    expect(await screen.findByText('2 de 7 dotes')).toBeTruthy()
    expect(screen.getByLabelText('Editar Piña limpia')).toBeTruthy()
    expect(screen.getByLabelText('Editar Chispa')).toBeTruthy()
    expect(screen.queryByLabelText('Editar Bip bip')).toBeNull()

    fireEvent.change(screen.getByLabelText('Filtrar por jugador'), { target: { value: 'nadie' } })
    expect(await screen.findByText('4 de 7 dotes')).toBeTruthy()
    expect(screen.queryByLabelText('Editar Piña limpia')).toBeNull()
    expect(screen.getByLabelText('Editar Placaje de rugby')).toBeTruthy()
  })

  it('el filtro de jugador se combina con los demás', async () => {
    await setUp()
    const edward = (await repo.list()).find((c) => c.name === 'Edward')!
    fireEvent.change(screen.getByLabelText('Filtrar por jugador'), { target: { value: edward.id } })
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'inteligencia' } })
    expect(await screen.findByText('1 de 7 dotes')).toBeTruthy()
    expect(screen.getByLabelText('Editar Chispa')).toBeTruthy()
  })

  it('la vista "Por jugador" agrupa las dotes de cada uno y avisa de las que no están vinculadas', async () => {
    await setUp()
    fireEvent.click(screen.getByText('Por jugador'))
    const edward = (await screen.findByText('Edward (2)')).closest('details') as HTMLElement
    expect(within(edward).getByLabelText('Editar Piña limpia')).toBeTruthy()
    expect(within(edward).getByLabelText('Editar Chispa')).toBeTruthy()
    expect(edward.textContent).toContain('Jugador: Jug Edward')
    expect(edward.textContent).toContain('1 dote(s) sin vincular con el catálogo')
    const roy = screen.getByText('Roy (1)').closest('details') as HTMLElement
    expect(within(roy).getByLabelText('Editar Bip bip')).toBeTruthy()
    // quien filtra por un jugador ve solo ese
    fireEvent.change(screen.getByLabelText('Filtrar por jugador'), { target: { value: (await repo.list()).find((c) => c.name === 'Roy')!.id } })
    await waitFor(() => expect(screen.queryByText('Edward (2)')).toBeNull())
    expect(screen.getByText('Roy (1)')).toBeTruthy()
  })

  it('se pueden ordenar por tier, por nombre y por forma de uso', async () => {
    await setUp()
    fireEvent.click(screen.getByText('Tabla'))
    const order = () => Array.from(document.querySelectorAll('[aria-label="Tabla de dotes"] tbody tr')).map((r) => r.querySelector('td.first')?.textContent)

    expect(order()).toEqual(['Hombre Araña de barrio', 'Piña limpia', 'Placaje de rugby', 'Rodar con el golpe', 'Bip bip', 'Chispa', 'Voz de mando'])

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'tier-desc' } })
    await waitFor(() => expect(order()[0]).toBe('Voz de mando'))
    expect(order().slice(0, 3)).toEqual(['Voz de mando', 'Bip bip', 'Rodar con el golpe'])

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'tier-asc' } })
    await waitFor(() => expect(order()[6]).toBe('Voz de mando'))

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'nombre' } })
    await waitFor(() => expect(order()[0]).toBe('Bip bip'))
    expect(order()).toEqual(['Bip bip', 'Chispa', 'Hombre Araña de barrio', 'Piña limpia', 'Placaje de rugby', 'Rodar con el golpe', 'Voz de mando'])

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'uso' } })
    // primero las pasivas, después las reacciones, las de batalla y las de descanso
    await waitFor(() => expect(order()[0]).toBe('Hombre Araña de barrio'))
    expect(order().slice(-3)).toEqual(['Rodar con el golpe', 'Voz de mando', 'Bip bip'])
  })

  it('el orden también rige dentro de cada stat', async () => {
    await setUp()
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'nombre' } })
    const fuerza = (await screen.findByText('Fuerza (3)')).closest('details') as HTMLElement
    await waitFor(() =>
      expect(Array.from(fuerza.querySelectorAll('.dote-head strong')).map((n) => n.textContent)).toEqual([
        'Hombre Araña de barrio',
        'Piña limpia',
        'Placaje de rugby',
      ]),
    )
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'tier-desc' } })
    await waitFor(() =>
      expect(Array.from(fuerza.querySelectorAll('.dote-head strong')).map((n) => n.textContent)[0]).toBe('Placaje de rugby'),
    )
  })
})

describe('reglas de los dotes legibles', () => {
  async function importRules() {
    await doteRepo.create(dote('Una'))
    await openDotes()
    const json = JSON.stringify({
      app: 'fmfid-app',
      kind: 'dotes',
      version: 1,
      exportedAt: '',
      dotes: [],
      sheets: [
        { id: 'dotes-reglas', title: 'Dotes: reglas generales', header: true, rows: [['Tema', 'Regla'], ['Tope', 'Todas las dotes juntas suman como máximo +3 al d20 y +2 al d8 en una misma tirada.'], ['d12', 'Reemplaza al d20 y vale d12 + 8.']] },
        { id: 'dotes-escalera', title: 'Dotes: escalera de tiers', header: true, rows: [['Tier', 'Qué hace una dote típica'], ['E', '+1 en una acción concreta'], ['D', '+2 en una acción concreta']] },
        { id: 'dotes-sinergias', title: 'Dotes: sinergias, cadenas y exclusiones', header: true, rows: [['Tipo', 'Nombre', 'Dotes que participan', 'Efecto'], ['Sinergia', 'Arcoíris', 'Lado oscuro (negra), Enfermero de guardia (blanca)', 'Con 3 dotes de color distintas, cada una pasa de +1 a +2.']] },
      ],
    })
    const file = new File([json], 'reglas.json')
    file.text = async () => json
    fireEvent.change(await screen.findByLabelText('Archivo de dotes'), { target: { files: [file] } })
    await screen.findByText('Dotes: reglas generales')
  }

  it('se muestran como una lista con el título en negrita y el texto debajo, no como una tabla', async () => {
    await importRules()
    const reglas = screen.getByText('Dotes: reglas generales').closest('details') as HTMLElement
    expect(reglas.querySelector('table')).toBeNull()
    const rows = Array.from(reglas.querySelectorAll('.rule-row'))
    expect(rows).toHaveLength(2) // sin la fila de encabezado
    expect(rows[0].querySelector('.rule-title strong')?.textContent).toBe('Tope')
    expect(rows[0].querySelector('.rule-text')?.textContent).toContain('+3 al d20 y +2 al d8')
    // el encabezado "Tema / Regla" no se repite como texto
    expect(reglas.textContent).not.toContain('Tema')
  })

  it('la escalera lleva el chip de cada tier', async () => {
    await importRules()
    const escalera = screen.getByText('Dotes: escalera de tiers').closest('details') as HTMLElement
    expect(within(escalera).getByLabelText('Tier E')).toBeTruthy()
    expect(within(escalera).getByLabelText('Tier D')).toBeTruthy()
    expect(escalera.textContent).toContain('+1 en una acción concreta')
  })

  it('las sinergias muestran el tipo y el nombre como título y cada columna con su nombre', async () => {
    await importRules()
    const sinergias = screen.getByText('Dotes: sinergias, cadenas y exclusiones').closest('details') as HTMLElement
    expect(sinergias.querySelector('.rule-title strong')?.textContent).toBe('Sinergia · Arcoíris')
    const texts = Array.from(sinergias.querySelectorAll('.rule-text')).map((t) => t.textContent)
    expect(texts[0]).toBe('Dotes que participan: Lado oscuro (negra), Enfermero de guardia (blanca)')
    expect(texts[1]).toBe('Efecto: Con 3 dotes de color distintas, cada una pasa de +1 a +2.')
  })
})

// ───────────────────────── árbol: espacios rotulados, tipo elegible y asignación directa

describe('dotes de un jugador en el árbol', () => {
  const slot = (nodeId: string, over: Partial<Dote> = {}): Dote => ({ id: nodeId, name: '', description: '', nodeId, ...over })

  async function openTreeWith(dotes: Dote[]) {
    await repo.create({ ...edwardData, tree: { ...emptyTree(), bp: 50, dotes } })
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Árbol de stats'))
    await screen.findByText('Árbol de Edward')
  }

  it('cada caja dice de qué rama, etapa y nodo es, y van en el orden del árbol', async () => {
    // cargadas en desorden: primero Percepción, después Fuerza y Destreza
    await openTreeWith([slot('percepcion:2:4'), slot('fuerza:1:9'), slot('destreza:1:4'), slot('fuerza:1:4')])
    const titles = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent).filter((t) => t?.startsWith('Dote '))
    expect(titles).toEqual([
      'Dote 1 · Fuerza · etapa 1 · nodo 5',
      'Dote 2 · Fuerza · etapa 1 · nodo 10',
      'Dote 3 · Destreza · etapa 1 · nodo 5',
      'Dote 4 · Percepción · etapa 2 · nodo 5',
    ])
  })

  it('avisa qué espacios están libres, para no ir caja por caja', async () => {
    await seed(catalog)
    await openTreeWith([slot('destreza:1:4'), slot('fuerza:1:4', { name: 'Ya escrita' })])
    expect((await screen.findByText(/Espacios libres \(1\):/)).parentElement?.textContent).toContain('Destreza · etapa 1 · nodo 5')
  })

  it('el tipo de dote lo elige quien carga: la rama solo lo sugiere', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4')])
    const tipo = (await screen.findByLabelText('Dote 1 del catálogo · tipo')) as HTMLSelectElement
    expect(tipo.value).toBe('fuerza') // sugerido por la rama
    expect(Array.from(tipo.options).find((o) => o.value === 'fuerza')?.text).toBe('Fuerza (sugerido)')
    let options = Array.from((screen.getByLabelText('Dote 1 del catálogo') as HTMLSelectElement).options).map((o) => o.text)
    expect(options.join()).toContain('Piña limpia')
    expect(options.join()).not.toContain('Bip bip')

    // en un espacio de Fuerza se carga una dote de Destreza
    fireEvent.change(tipo, { target: { value: 'destreza' } })
    options = Array.from((screen.getByLabelText('Dote 1 del catálogo') as HTMLSelectElement).options).map((o) => o.text)
    expect(options.join()).toContain('Bip bip')
    expect(options.join()).not.toContain('Piña limpia')
    fireEvent.change(screen.getByLabelText('Dote 1 del catálogo'), { target: { value: await idOf('Bip bip') } })
    fireEvent.click(screen.getByText('Guardar dotes'))
    await waitFor(async () => expect((await repo.list())[0].tree?.dotes[0]).toMatchObject({ name: 'Bip bip', catalogId: await idOf('Bip bip') }))
  })

  it('con "todos los tipos" se ven todas, cada una con su stat', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4')])
    fireEvent.change(await screen.findByLabelText('Dote 1 del catálogo · tipo'), { target: { value: 'todos' } })
    const options = Array.from((screen.getByLabelText('Dote 1 del catálogo') as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toHaveLength(8) // las 7 + "elegir"
    expect(options.join()).toContain('Voz de mando [Sabiduría]')
  })

  it('se busca dentro de las dotes por nombre, uso o descripción', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4')])
    fireEvent.change(await screen.findByLabelText('Dote 1 del catálogo · tipo'), { target: { value: 'todos' } })
    fireEvent.change(screen.getByLabelText('Dote 1 del catálogo · buscar'), { target: { value: 'huida' } })
    const options = Array.from((screen.getByLabelText('Dote 1 del catálogo') as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toHaveLength(2)
    expect(options[1]).toContain('Bip bip')
    fireEvent.change(screen.getByLabelText('Dote 1 del catálogo · buscar'), { target: { value: 'zzz' } })
    expect(await screen.findByText(/Ninguna dote coincide/)).toBeTruthy()
  })

  it('"Poner una dote en un espacio libre" la manda al espacio de su mismo stat', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4'), slot('destreza:1:4'), slot('inteligencia:1:4')])
    fireEvent.change(await screen.findByLabelText('Poner una dote en un espacio libre · tipo'), { target: { value: 'destreza' } })
    fireEvent.change(screen.getByLabelText('Poner una dote en un espacio libre'), { target: { value: await idOf('Bip bip') } })
    expect(await screen.findByText(/"Bip bip" se puso en el espacio Destreza · etapa 1 · nodo 5\. Falta guardar\./)).toBeTruthy()
    // la caja de Destreza quedó con la dote, las otras siguen libres
    expect((await screen.findByLabelText('Dote 2')).textContent).toContain('Bip bip')
    expect(screen.getByText(/Espacios libres \(2\):/)).toBeTruthy()

    fireEvent.click(screen.getByText('Guardar dotes'))
    await waitFor(async () => {
      const saved = (await repo.list())[0].tree?.dotes ?? []
      expect(saved.find((d) => d.nodeId === 'destreza:1:4')?.name).toBe('Bip bip')
      expect(saved.find((d) => d.nodeId === 'fuerza:1:4')?.name).toBe('')
    })
  })

  it('si no hay un espacio libre de ese stat, usa el primero libre y lo dice', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4'), slot('destreza:1:4', { name: 'Ocupada' })])
    fireEvent.change(await screen.findByLabelText('Poner una dote en un espacio libre · tipo'), { target: { value: 'inteligencia' } })
    fireEvent.change(screen.getByLabelText('Poner una dote en un espacio libre'), { target: { value: await idOf('Chispa') } })
    expect(await screen.findByText(/"Chispa" se puso en el espacio Fuerza · etapa 1 · nodo 5 \(no había uno libre de su stat\)/)).toBeTruthy()
  })

  it('sin espacios libres no ofrece el selector rápido', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4', { name: 'Escrita' })])
    await screen.findByLabelText('Nombre de la dote 1')
    expect(screen.queryByLabelText('Poner una dote en un espacio libre')).toBeNull()
    expect(screen.queryByText(/Espacios libres/)).toBeNull()
  })

  it('una dote ya vinculada se muestra completa y el selector está cerrado hasta tocar "Cambiar dote"', async () => {
    await seed(catalog)
    await openTreeWith([slot('fuerza:1:4', { name: 'Piña limpia', catalogId: await idOf('Piña limpia') })])
    expect((await screen.findByLabelText('Dote 1')).textContent).toContain('Piña limpia')
    expect(screen.queryByLabelText('Dote 1 del catálogo')).toBeNull()
    fireEvent.click(screen.getByLabelText('Cambiar la dote 1'))
    expect(await screen.findByLabelText('Dote 1 del catálogo')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Cerrar el selector de la dote 1'))
    await waitFor(() => expect(screen.queryByLabelText('Dote 1 del catálogo')).toBeNull())
  })

  it('al comprar una dote también se puede cambiar el tipo sugerido', async () => {
    await seed(catalog)
    let c: Character = { ...edward, tree: { ...emptyTree(), bp: 100 } }
    for (let i = 0; i < 4; i++) c = purchaseNext(c, 'fuerza', 'stat')
    const { id: _a, createdAt: _b, updatedAt: _d, ...data } = c
    await repo.create(data)
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    fireEvent.click(await screen.findByText('Árbol de stats'))
    await screen.findByText('Árbol de Edward')
    fireEvent.click(within(Array.from(document.querySelectorAll<HTMLElement>('.card.node'))[4]).getByText('Comprar'))
    fireEvent.change(await screen.findByLabelText('Elección del nodo 5'), { target: { value: 'dote' } })
    fireEvent.change(await screen.findByLabelText('Dote del catálogo · tipo'), { target: { value: 'destreza' } })
    // con una escalera en tier E solo se ofrecen las de ese tier, y se pueden mostrar todas
    expect(Array.from((screen.getByLabelText('Dote del catálogo') as HTMLSelectElement).options).map((o) => o.text).join()).not.toContain('Bip bip')
    fireEvent.click(screen.getByLabelText('Mostrar las dotes de todos los tiers'))
    fireEvent.change(screen.getByLabelText('Dote del catálogo'), { target: { value: await idOf('Bip bip') } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(async () => expect((await repo.list())[0].tree?.dotes[0]).toMatchObject({ name: 'Bip bip', nodeId: 'fuerza:1:4' }))
  })
})

describe('dotes en la ficha: orden', () => {
  it('se agrupan por stat y se pueden ordenar de otras formas', async () => {
    await seed(catalog)
    await withDotes('Edward', [
      { id: 'a', name: 'Voz de mando', description: '', nodeId: 'sabiduria:1:4', catalogId: await idOf('Voz de mando') },
      { id: 'b', name: 'Placaje de rugby', description: '', nodeId: 'fuerza:1:9', catalogId: await idOf('Placaje de rugby') },
      { id: 'c', name: 'Bip bip', description: '', nodeId: 'destreza:1:4', catalogId: await idOf('Bip bip') },
      { id: 'd', name: 'Piña limpia', description: '', nodeId: 'fuerza:1:4', catalogId: await idOf('Piña limpia') },
      { id: 'e', name: 'Mía', description: 'a mano', nodeId: 'carisma:1:4' },
    ])
    render(<App />)
    fireEvent.click(await screen.findByText('Edward'))
    const section = (await screen.findByText('Dotes (5)')).closest('details') as HTMLElement
    const names = () => Array.from(section.querySelectorAll('.dote-head strong')).map((n) => n.textContent)
    const groups = () => Array.from(section.querySelectorAll('h3.slot-title')).map((h) => h.textContent)

    // por stat y tier, con un encabezado por stat (el catálogo carga aparte: se espera a que ordene por tier)
    await waitFor(() => expect(names()).toEqual(['Piña limpia', 'Placaje de rugby', 'Bip bip', 'Voz de mando', 'Mía']))
    expect(groups()).toEqual(['Fuerza (2)', 'Destreza (1)', 'Sabiduría (1)', 'Carisma (1)'])

    fireEvent.change(within(section).getByLabelText('Ordenar las dotes'), { target: { value: 'tier' } })
    await waitFor(() => expect(groups()).toEqual([]))
    expect(names()).toEqual(['Piña limpia', 'Placaje de rugby', 'Bip bip', 'Voz de mando', 'Mía']) // las que no están en el catálogo, al final

    fireEvent.change(within(section).getByLabelText('Ordenar las dotes'), { target: { value: 'nombre' } })
    await waitFor(() => expect(names()[0]).toBe('Bip bip'))
    expect(names()).toEqual(['Bip bip', 'Mía', 'Piña limpia', 'Placaje de rugby', 'Voz de mando'])

    fireEvent.change(within(section).getByLabelText('Ordenar las dotes'), { target: { value: 'compra' } })
    await waitFor(() => expect(names()[0]).toBe('Voz de mando'))
    expect(names()).toEqual(['Voz de mando', 'Placaje de rugby', 'Bip bip', 'Piña limpia', 'Mía'])
    // la que no está vinculada dice de qué espacio es
    expect(section.textContent).toContain('Sin vincular al catálogo · Carisma · etapa 1 · nodo 5')
  })
})
