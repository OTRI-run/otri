import { ArrowRight, ArrowUpRight } from '../src/ui/icons'

// Three onward links at the end of a screen, so nobody hits a dead end.
// items: [title, description, link label, href]
export default function NextSteps({ items }) {
  return (
    <div className="next-steps">
      {items.map(([title, desc, label, href]) => {
        const internal = href.startsWith('#') || href.startsWith('organizer')
        return (
          <a key={href + label} href={href} className="card card--link stack stack--tight">
            <strong className="h-4">{title}</strong>
            <span className="small muted">{desc}</span>
            <span className={`link link--arrow ${internal ? '' : 'link--up'} small mt-1`}>
              {label} {internal ? <ArrowRight size={15} /> : <ArrowUpRight size={15} />}
            </span>
          </a>
        )
      })}
    </div>
  )
}
