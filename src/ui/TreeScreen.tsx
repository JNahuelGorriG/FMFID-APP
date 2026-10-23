import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { diffPaths } from '../db'
import {
  BRANCHES,
  GATE_TEXT,
  STAGES,
  STAT_NAMES,
  appliedTotals,
  branchesWithStagesDone,
  branchState,
  purchaseNode,
  treeOf,
  undoLastPurchase,
} from '../rules'
import type { BranchId, Character, Choice, NodeDef, NodeState } from '../rules'
import { repo } from './data'
import { NumberField, SelectField, TextAreaField, TextField } from './fields'
import { STAT_LABELS, fmt } from './format'

const BRANCH_LABELS: Record<BranchId, string> = { ...STAT_LABELS, heroe: 'Héroe', categoria: 'Categoría' }

function nodeTitle(node: NodeDef): string {
  if (node.label) return node.label
  if (node.options.includes('dote') && node.options.includes('hab')) return 'Dote o Hab'
  if (node.options.includes('energia')) return `${node.energy} E. // ${node.points} P. Stat`
  if (node.options.includes('mh')) return `${node.mh} MH o ${node.points} P. Stat`
  return `${node.points} Stat`
}

function choiceText(node: NodeDef, choice: Choice): string {
  switch (choice) {
    case 'stat':
      return node.branch === 'heroe'
        ? `${node.points} puntos a todos los stats`
        : node.branch === 'categoria'
          ? `${node.points} puntos repartidos según el tier`
          : `${node.points} puntos de ${STAT_LABELS[node.branch]}`
    case 'energia':
      return `${node.energy} de energía`
    case 'mh':
      return `${node.mh} MH`
    case 'dote':
      return 'Dote'
    case 'hab':
      return 'Habilidad'
  }
}

export function TreeScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const character = useLiveQuery(() => repo.get(id), [id])
  if (character === undefined) return <p className="muted">Cargando…</p>
  return <TreeView key={character.id} character={character} onBack={onBack} />
}

function TreeView({ character, onBack }: { character: Character; onBack: () => void }) {
  const tree = treeOf(character)
  const [branch, setBranch] = useState<BranchId>('fuerza')
  const [open, setOpen] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [bp, setBp] = useState(tree.bp)
  const [mh, setMh] = useState(tree.mh)
  const [dotes, setDotes] = useState(tree.dotes)
  // Si el árbol cambia desde afuera (una compra, deshacer), los campos de edición se actualizan.
  const [seen, setSeen] = useState(character.tree)
  if (seen !== character.tree) {
    setSeen(character.tree)
    setBp(tree.bp)
    setMh(tree.mh)
    setDotes(tree.dotes)
  }

  const persist = async (updated: Character, reason: string) => {
    await repo.applyChanges(character.id, diffPaths(character, updated), reason)
  }

  const states = branchState(tree, branch)
  const doneCount = (b: BranchId) => branchState(tree, b).filter((n) => n.status === 'comprado').length

  async function saveBalances() {
    await persist({ ...character, tree: { ...tree, bp, mh } }, 'Árbol: ajuste de saldo')
    setMessage('Saldos guardados.')
  }

  async function toggleGate(stage: 'stage2' | 'stage3', value: boolean) {
    await persist(
      { ...character, tree: { ...tree, gates: { ...tree.gates, [stage]: value } } },
      `Árbol: compuerta de la etapa ${stage === 'stage2' ? 2 : 3} ${value ? 'abierta' : 'cerrada'}`,
    )
  }

  async function undo() {
    if (!window.confirm(`¿Deshacer la última compra de ${BRANCH_LABELS[branch]}? Devuelve los BP y quita lo que sumó.`)) return
    try {
      await persist(undoLastPurchase(character, branch), `Árbol: deshizo la última compra de ${BRANCH_LABELS[branch]}`)
      setMessage('Compra deshecha.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo deshacer.')
    }
  }

  async function saveDotes() {
    await persist({ ...character, tree: { ...tree, dotes } }, 'Árbol: dotes actualizadas')
    setMessage('Dotes guardadas.')
  }

  // Diferencias entre lo que suman las compras y lo cargado en el personaje
  const totals = appliedTotals(tree)
  const diffs: { label: string; stored: number; expected: number; path: string }[] = []
  if (tree.purchases.length > 0) {
    for (const s of STAT_NAMES) {
      const src = character.sources[s]
      const rows: [string, number, number, string][] = [
        [`${STAT_LABELS[s]} · Árbol héroe`, src.arbolHeroe, totals.arbolHeroe[s], `sources.${s}.arbolHeroe`],
        [`${STAT_LABELS[s]} · Héroe`, src.heroe, totals.heroe[s], `sources.${s}.heroe`],
        [`${STAT_LABELS[s]} · Categoría`, src.categoria, totals.categoria[s], `sources.${s}.categoria`],
      ]
      for (const [label, stored, expected, path] of rows) {
        if (Math.abs(stored - expected) > 0.01) diffs.push({ label, stored, expected, path })
      }
    }
    if (Math.abs(character.energy.bonusMana - totals.mana) > 0.01) {
      diffs.push({ label: 'Bonos de maná', stored: character.energy.bonusMana, expected: totals.mana, path: 'energy.bonusMana' })
    }
    if (Math.abs(character.energy.bonusStamina - totals.stamina) > 0.01) {
      diffs.push({ label: 'Bonos de estamina', stored: character.energy.bonusStamina, expected: totals.stamina, path: 'energy.bonusStamina' })
    }
  }

  return (
    <section>
      <header className="sheet-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la ficha">
          ←
        </button>
        <h1 className="tight grow">Árbol de {character.name}</h1>
      </header>

      <div className="card">
        <h2>Saldo</h2>
        <div className="grid-2">
          <NumberField label="BP disponibles" value={bp} onChange={setBp} />
          <NumberField label="MH disponibles" value={mh} onChange={setMh} />
        </div>
        <button className="btn secondary" onClick={() => void saveBalances()}>
          Guardar saldos
        </button>
        <p className="muted small">
          Gastados en total: {fmt(totals.bp)} BP en {tree.purchases.length} compras.
        </p>
      </div>

      <div className="card">
        <h2>Compuertas</h2>
        {([2, 3] as const).map((stage) => {
          const key = stage === 2 ? 'stage2' : 'stage3'
          const doneRamas = branchesWithStagesDone(tree, (stage - 1) as 1 | 2).length
          return (
            <div key={stage}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tree.gates[key]}
                  onChange={(e) => void toggleGate(key, e.target.checked)}
                />
                Etapa {stage} abierta
              </label>
              <p className="muted small">
                {GATE_TEXT[stage]}. Ramas con la etapa {stage - 1} completa: {doneRamas}.
              </p>
            </div>
          )
        })}
      </div>

      <nav className="tabs" aria-label="Ramas">
        {BRANCHES.map((b) => (
          <button
            key={b}
            className={b === branch ? 'tab active' : 'tab'}
            onClick={() => {
              setBranch(b)
              setOpen(null)
            }}
          >
            {BRANCH_LABELS[b]} {doneCount(b)}/{branchState(tree, b).length}
          </button>
        ))}
      </nav>

      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}

      {STAGES.map((stage) => (
        <div key={stage}>
          <h2 className="stage-title">Etapa {stage}</h2>
          {states
            .filter((n) => n.node.stage === stage)
            .map((n) => (
              <NodeCard
                key={n.node.id}
                state={n}
                character={character}
                open={open === n.node.id}
                onOpen={() => setOpen(open === n.node.id ? null : n.node.id)}
                onBought={() => {
                  setOpen(null)
                  setMessage('')
                }}
                persist={persist}
              />
            ))}
        </div>
      ))}

      <button className="btn secondary" onClick={() => void undo()}>
        Deshacer la última compra de {BRANCH_LABELS[branch]}
      </button>

      <div className="card spaced">
        <h2>Dotes</h2>
        {dotes.length === 0 && <p className="muted small">Todavía no hay dotes.</p>}
        {dotes.map((d, i) => (
          <div key={d.id} className="ref">
            <TextField
              label={`Nombre de la dote ${i + 1}`}
              value={d.name}
              onChange={(name) => setDotes(dotes.map((x) => (x.id === d.id ? { ...x, name } : x)))}
              placeholder="Todavía sin elegir"
            />
            <TextAreaField
              label={`Descripción de la dote ${i + 1}`}
              value={d.description}
              onChange={(description) => setDotes(dotes.map((x) => (x.id === d.id ? { ...x, description } : x)))}
            />
          </div>
        ))}
        {dotes.length > 0 && (
          <button className="btn secondary" onClick={() => void saveDotes()}>
            Guardar dotes
          </button>
        )}
      </div>

      <details className="card">
        <summary>Diferencias con las compras ({diffs.length})</summary>
        {tree.purchases.length === 0 ? (
          <p className="muted small">Sin compras cargadas: no hay nada que comparar.</p>
        ) : diffs.length === 0 ? (
          <p className="muted small">Lo cargado en el personaje coincide con lo que suman las compras.</p>
        ) : (
          <>
            <p className="muted small">
              Lo que sumarían las compras contra lo que tiene el personaje. Ajustar copia el valor de las compras.
            </p>
            {diffs.map((d) => (
              <div key={d.path} className="row">
                <span className="grow small">
                  {d.label}: tiene {fmt(d.stored)}, compras {fmt(d.expected)}
                </span>
                <button
                  className="btn secondary compact"
                  aria-label={`Ajustar ${d.label}`}
                  onClick={() => void repo.applyChanges(character.id, [{ path: d.path, value: d.expected }], 'Árbol: ajuste a las compras')}
                >
                  Ajustar
                </button>
              </div>
            ))}
          </>
        )}
      </details>
    </section>
  )
}

function NodeCard({
  state,
  character,
  open,
  onOpen,
  onBought,
  persist,
}: {
  state: NodeState
  character: Character
  open: boolean
  onOpen: () => void
  onBought: () => void
  persist: (updated: Character, reason: string) => Promise<void>
}) {
  const { node, status, reason, purchase, pending } = state
  const [choice, setChoice] = useState<Choice>(node.options[0])
  const [note, setNote] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function buy() {
    try {
      const updated = purchaseNode(character, node.id, choice, { note, description })
      await persist(updated, `Árbol: ${BRANCH_LABELS[node.branch]} etapa ${node.stage} nodo ${node.index + 1} · ${choiceText(node, choice)}`)
      setError('')
      onBought()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprar.')
    }
  }

  return (
    <div className={`card node ${status === 'comprado' ? 'done' : status === 'bloqueado' ? 'locked' : ''}`}>
      <div className="head">
        <span className="grow">
          <strong>{node.index + 1}. {nodeTitle(node)}</strong>
          <span className="muted small block">{node.cost} BP</span>
        </span>
        {status === 'comprado' && <span className="chip">Comprado</span>}
        {status === 'disponible' && !pending && <span className="chip off">Disponible</span>}
        {pending && <span className="chip off">Pendiente</span>}
        {status === 'bloqueado' && <span className="chip off">Bloqueado</span>}
      </div>

      {purchase && (
        <p className="small">
          Eligió: {choiceText(node, purchase.choice)}
          {purchase.note ? ` · ${purchase.note}` : ''}
        </p>
      )}
      {status === 'bloqueado' && <p className="muted small">{reason}</p>}

      {status === 'disponible' && (
        <>
          <button className="btn secondary compact" onClick={onOpen}>
            {open ? 'Cancelar' : 'Comprar'}
          </button>
          {open && (
            <div className="ref">
              {node.options.length > 1 && (
                <SelectField
                  label={`Elección del nodo ${node.index + 1}`}
                  value={choice}
                  options={node.options.map((o) => ({ value: o, label: choiceText(node, o) }))}
                  onChange={setChoice}
                />
              )}
              {(choice === 'dote' || choice === 'hab') && (
                <>
                  <TextField
                    label={choice === 'dote' ? 'Nombre de la dote (opcional)' : 'Nombre de la habilidad (opcional)'}
                    value={note}
                    onChange={setNote}
                    placeholder="Se puede dejar en blanco y elegir después"
                  />
                  {choice === 'dote' && (
                    <TextAreaField label="Descripción (opcional)" value={description} onChange={setDescription} />
                  )}
                </>
              )}
              {error && (
                <p className="errors" role="alert">
                  {error}
                </p>
              )}
              <button className="btn" onClick={() => void buy()}>
                Confirmar compra
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
