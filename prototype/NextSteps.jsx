import { ArrowRight, ArrowUpRight } from 'lucide-react'

// Three onward links at the end of a screen, so nobody hits a dead end.
// items: [title, description, link label, href]
export default function NextSteps({ items }) {
  return (
    <div className="mt-12 grid gap-4 border-t border-rule pt-8 sm:grid-cols-3">
      {items.map(([title, desc, label, href]) => {
        const internal = href.startsWith('#') || href.startsWith('organizer')
        return (
          <a
            key={href + label}
            href={href}
            className="group block min-w-0 rounded-[3px] border border-rule bg-white p-5 text-ink no-underline  transition hover:border-accent"
          >
            <strong className="block text-sm font-bold tracking-[-.02em]">{title}</strong>
            <span className="mt-1 block text-xs leading-5 text-muted">{desc}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent transition group-hover:gap-2">
              {label} {internal ? <ArrowRight size={13} /> : <ArrowUpRight size={13} />}
            </span>
          </a>
        )
      })}
    </div>
  )
}
