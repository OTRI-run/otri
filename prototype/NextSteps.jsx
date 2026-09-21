import { ArrowRight, ArrowUpRight } from 'lucide-react'

// Three onward links at the end of a screen, so nobody hits a dead end.
// items: [title, description, link label, href]
export default function NextSteps({ items }) {
  return (
    <div className="mt-12 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-3">
      {items.map(([title, desc, label, href]) => {
        const internal = href.startsWith('#') || href.startsWith('organizer')
        return (
          <a
            key={href + label}
            href={href}
            className="group block min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-[#0b1220] no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300"
          >
            <strong className="block text-sm font-bold tracking-[-.02em]">{title}</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{desc}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition group-hover:gap-2">
              {label} {internal ? <ArrowRight size={13} /> : <ArrowUpRight size={13} />}
            </span>
          </a>
        )
      })}
    </div>
  )
}
