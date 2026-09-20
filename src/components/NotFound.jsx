import './NotFound.css'
// One 'not found' block for every app: unknown hash routes, missing races, missing runners.
export default function NotFound({ eyebrow = '404 · NOT FOUND', title = 'That page is not here.', where, note, home = '#home', homeLabel = 'Back to the start', secondaryHref = '#calculator', secondaryLabel = 'Calculate a score' }) {
  return (
    <div className="src-components-not-found-not-found-div-1">
      <p className="src-components-not-found-not-found-p-2">{eyebrow}</p>
      <h1 className="src-components-not-found-not-found-h1-3">{title}</h1>
      {where && <p className="src-components-not-found-not-found-p-4">{where}</p>}
      {note && <p className="src-components-not-found-not-found-p-5">{note}</p>}
      <div className="src-components-not-found-not-found-div-6">
        <a href={home} className="src-components-not-found-not-found-a-7">
          {homeLabel}
        </a>
        <a href={secondaryHref} className="src-components-not-found-not-found-a-8">
          {secondaryLabel}
        </a>
      </div>
    </div>
  )
}
