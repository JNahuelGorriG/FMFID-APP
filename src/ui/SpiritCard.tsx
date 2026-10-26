import { SPIRIT_MAX_LEVEL, spiritPerLevel } from '../rules'
import type { RankGroup } from '../rules'
import { GROUP_LABELS, fmt } from './format'
import { Section } from './Section'

interface Props {
  level: number
  group: RankGroup
  /** Sube o baja el nivel respecto de lo guardado, así los toques seguidos no se pisan. */
  onAdjust: (delta: number) => void
}

/** Espíritu: buff de 10 niveles a los 7 stats (10 % del límite por nivel), hasta que se quite. */
export function SpiritCard({ level, group, onAdjust }: Props) {
  const perLevel = spiritPerLevel(group)
  return (
    <Section title="Espíritu" aria-label="Espíritu">
      <div className="stepper">
        <span className="small muted">Nivel de Espíritu</span>
        <div className="stepper-row">
          <button className="icon-btn" aria-label="Nivel de Espíritu: menos" onClick={() => onAdjust(-1)}>
            −
          </button>
          <strong aria-label="Nivel de Espíritu: valor">
            {level}
            <span className="muted small"> / {SPIRIT_MAX_LEVEL}</span>
          </strong>
          <button className="icon-btn" aria-label="Nivel de Espíritu: más" onClick={() => onAdjust(1)}>
            +
          </button>
        </div>
      </div>
      <p className="small">
        Cada nivel suma <strong>{fmt(perLevel)}</strong> a los 7 stats (10 % del límite de {fmt(perLevel * 10)} del grupo{' '}
        {GROUP_LABELS[group]}). Nivel {level}: <strong>+{fmt(perLevel * level)}</strong>.
      </p>
      <p className="muted small">
        Dura hasta que lo quites (nivel 0). No cuenta para el límite de los buffs ni lo aumenta, pero ocupa un lugar
        de los 4 por stat con su propio tipo.
      </p>
    </Section>
  )
}
