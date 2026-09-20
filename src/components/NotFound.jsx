import { Mark } from './Logo'

// One 'not found' block for every app: unknown hash routes, missing races, missing runners.
export default function NotFound({ eyebrow = '404 · Not found', title = 'That page is not here.', where, note, home = '#home', homeLabel = 'Back to the start', secondaryHref = '#calculator', secondaryLabel = 'Calculate a score' }) {
  return (
    <div className="section-tight stack" style={{ paddingBlock: 'var(--s-12)' }}>
      <Mark size={48} tone="mono" className="icon--muted" />
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display-2">{title}</h1>
      {where && <p className="mono tiny muted break">{where}</p>}
      {note && <p className="muted measure">{note}</p>}
      <div className="cluster mt-2">
        <a href={home} className="btn btn--primary">{homeLabel}</a>
        <a href={secondaryHref} className="btn btn--secondary">{secondaryLabel}</a>
      </div>
    </div>
  )
}
