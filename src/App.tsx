import { useState } from 'react'
import { CharactersScreen } from './ui/CharactersScreen'
import { MoreScreen } from './ui/MoreScreen'
import { Placeholder } from './ui/Placeholder'
import { SheetScreen } from './ui/SheetScreen'

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
  }

  return (
    <div className="app">
      <main className={navOpen ? 'content' : 'content nav-hidden'}>
        {tab === 'personajes' &&
          (openId ? (
            <SheetScreen id={openId} onBack={() => setOpenId(null)} />
          ) : (
            <CharactersScreen onOpen={setOpenId} onGoMore={() => goTo('mas')} />
          ))}
        {tab === 'combate' && <Placeholder title="Combate" />}
        {tab === 'npcs' && <Placeholder title="NPCs" />}
        {tab === 'mas' && <MoreScreen />}
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
