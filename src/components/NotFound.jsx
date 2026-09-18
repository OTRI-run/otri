// One 'not found' block for every app: unknown hash routes, missing races, missing runners.
export default function NotFound({ eyebrow = '404 · NOT FOUND', title = 'That page is not here.', where, note, home = '#home', homeLabel = 'Back to the start', secondaryHref = '#calculator', secondaryLabel = 'Calculate a score' }) {
  return (
    <div className="py-12 sm:py-16">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">{eyebrow}</p>
      <h1 className="mt-3 text-[clamp(30px,4.5vw,50px)] font-bold leading-[.98] tracking-[-.05em] text-[#0b1220]">{title}</h1>
      {where && <p className="mt-3 break-all font-mono text-xs text-slate-400">{where}</p>}
      {note && <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">{note}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={home} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white no-underline">
          {homeLabel}
        </a>
        <a href={secondaryHref} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0b1220] no-underline">
          {secondaryLabel}
        </a>
      </div>
    </div>
  )
}
