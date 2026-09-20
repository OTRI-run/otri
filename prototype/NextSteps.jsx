import './NextSteps.css'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

// Three onward links at the end of a screen, so nobody hits a dead end.
// items: [title, description, link label, href]
export default function NextSteps({ items }) {
  return (
    <div className="prototype-next-steps-next-steps-div-1">
      {items.map(([title, desc, label, href]) => {
        const internal = href.startsWith('#') || href.startsWith('organizer')
        return (
          <a
            key={href + label}
            href={href}
            className="prototype-next-steps-next-steps-a-2 otri-group"
          >
            <strong className="prototype-next-steps-next-steps-strong-3">{title}</strong>
            <span className="prototype-next-steps-next-steps-span-4">{desc}</span>
            <span className="prototype-next-steps-next-steps-span-5">
              {label} {internal ? <ArrowRight size={13} /> : <ArrowUpRight size={13} />}
            </span>
          </a>
        )
      })}
    </div>
  )
}
