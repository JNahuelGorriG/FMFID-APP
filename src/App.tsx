import { useState } from 'react'
import { CharactersScreen } from './ui/CharactersScreen'
import { CombatScreen } from './ui/CombatScreen'
import { CombatsScreen } from './ui/CombatsScreen'
import { ParticipantScreen } from './ui/ParticipantScreen'
import { EditScreen } from './ui/EditScreen'
import { MoreScreen } from './ui/MoreScreen'
import { NpcEditScreen } from './ui/NpcEditScreen'
import { NpcScreen } from './ui/NpcScreen'
import { NpcsScreen } from './ui/NpcsScreen'
import { SheetScreen } from './ui/SheetScreen'
import { TablesScreen } from './ui/TablesScreen'
import { TreeScreen } from './ui/TreeScreen'

type Tab = 'personajes' | 'combate' | 'npcs' | 'mas'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'personajes', label: 'Personajes', icon: '👥' },
  { id: 'combate', label: 'Combate', icon: '⚔️' },
  { id: 'npcs', label: 'NPCs', icon: '👤' },
  { id: 'mas', label: 'Más', icon: '⋯' },
]

const NAV_KEY = 'fmfid-nav-open'

function readNavPreference(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) !== 'false'
  } catch {
    return true
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('personajes')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [openNpcId, setOpenNpcId] = useState<string | null>(null)
  const [editingNpc, setEditingNpc] = useState(false)
  const [showTables, setShowTables] = useState(false)
  const [openCombatId, setOpenCombatId] = useState<string | null>(null)
  const [openParticipantId, setOpenParticipantId] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(readNavPreference)

  function toggleNav() {
    const next = !navOpen
    setNavOpen(next)
    try {
      localStorage.setItem(NAV_KEY, String(next))
    } catch {
      /* sin almacenamiento: la preferencia dura solo esta sesión */
    }
  }

  function goTo(next: Tab) {
    setTab(next)
    setOpenId(null)
    setEditing(false)
    setShowTree(false)
    setOpenNpcId(null)
    setEditingNpc(false)
    setOpenCombatId(null)
    setOpenParticipantId(null)
    setShowTables(false)
  }

  return (
    <div className="app">
      <main className={navOpen ? 'content' : 'content nav-hidden'}>
        {tab === 'personajes' &&
          (openId && editing ? (
            <EditScreen
              id={openId}
              onDone={() => setEditing(false)}
              onDeleted={() => {
                setEditing(false)
                setOpenId(null)
              }}
            />
          ) : openId && showTree ? (
            <TreeScreen id={openId} onBack={() => setShowTree(false)} />
          ) : openId ? (
            <SheetScreen
              id={openId}
              onBack={() => setOpenId(null)}
              onEdit={() => setEditing(true)}
              onOpenTree={() => setShowTree(true)}
            />
          ) : (
            <CharactersScreen
              onOpen={setOpenId}
              onCreated={(id) => {
                setOpenId(id)
                setEditing(true)
              }}
              onGoMore={() => goTo('mas')}
            />
          ))}
        {tab === 'combate' &&
          (openCombatId && openParticipantId ? (
            <ParticipantScreen
              combatId={openCombatId}
              participantId={openParticipantId}
              onBack={() => setOpenParticipantId(null)}
            />
          ) : openCombatId ? (
            <CombatScreen
              id={openCombatId}
              onBack={() => setOpenCombatId(null)}
              onOpenParticipant={setOpenParticipantId}
              onDeleted={() => setOpenCombatId(null)}
            />
          ) : (
            <CombatsScreen onOpen={setOpenCombatId} />
          ))}
        {tab === 'npcs' &&
          (openNpcId && editingNpc ? (
            <NpcEditScreen
              id={openNpcId}
              onDone={() => setEditingNpc(false)}
              onDeleted={() => {
                setEditingNpc(false)
                setOpenNpcId(null)
              }}
            />
          ) : openNpcId ? (
            <NpcScreen id={openNpcId} onBack={() => setOpenNpcId(null)} onEdit={() => setEditingNpc(true)} />
          ) : (
            <NpcsScreen
              onOpen={setOpenNpcId}
              onCreated={(id) => {
                setOpenNpcId(id)
                setEditingNpc(true)
              }}
              onGoMore={() => goTo('mas')}
            />
          ))}
        {tab === 'mas' &&
          (showTables ? (
            <TablesScreen onBack={() => setShowTables(false)} />
          ) : (
            <MoreScreen onOpenTables={() => setShowTables(true)} />
          ))}
      </main>

      <button
        className={navOpen ? 'nav-toggle' : 'nav-toggle collapsed'}
        onClick={toggleNav}
        aria-label={navOpen ? 'Ocultar navegación' : 'Mostrar navegación'}
        aria-expanded={navOpen}
      >
        {navOpen ? '⌄' : '⌃'}
      </button>

      <nav className={navOpen ? 'nav' : 'nav hidden'} aria-label="Navegación principal">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'nav-item active' : 'nav-item'}
            onClick={() => goTo(t.id)}
            aria-current={t.id === tab ? 'page' : undefined}
          >
            <span aria-hidden="true">{t.icon}</span>
            <span className="small">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
