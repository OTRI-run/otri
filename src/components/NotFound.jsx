// One 'not found' block for every app: unknown hash routes, missing races, missing runners.
export default function NotFound({ eyebrow = '404 · NOT FOUND', title = 'That page is not here.', where, note, home = '#home', homeLabel = 'Back to the start', secondaryHref = '#calculator', secondaryLabel = 'Calculate a score' }) {
  return (
    <div className="py-12 sm:py-16">
      <p className="font-mono text-[10px] tracking-[.08em] text-muted">{eyebrow}</p>
      <h1 className="mt-3 text-[clamp(30px,4.5vw,50px)] font-normal leading-[.98] tracking-[-.05em] text-ink">{title}</h1>
      {where && <p className="mt-3 break-all font-mono text-xs text-muted">{where}</p>}
      {note && <p className="mt-4 max-w-md text-sm leading-6 text-muted">{note}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={home} className="rounded-[3px] bg-accent px-5 py-3 text-sm font-semibold text-white no-underline">
          {homeLabel}
        </a>
        <a href={secondaryHref} className="rounded-[3px] border border-rule bg-white px-5 py-3 text-sm font-semibold text-ink no-underline">
          {secondaryLabel}
        </a>
      </div>
    </div>
  )
}
