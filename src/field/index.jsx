import { ArrowUpRight } from 'lucide-react'
import s from './field.module.css'

/** OTRI Field: shared interface primitives. Native semantics, no runtime styling. */
export function FieldLabel({ children, className = '' }) {
  return <p className={`${s.label} ${className}`}>{children}</p>
}
export function FieldFrame({ children, as: Tag = 'div', className = '', ...props }) {
  return <Tag className={`${s.frame} ${className}`} {...props}>{children}</Tag>
}
export function FieldAction({ href, number, audience, children, tone = 'ink', ...props }) {
  return <a href={href} className={s.action} data-tone={tone} {...props}>
    <span className={s.actionNumber} aria-hidden="true">{number}</span>
    <span className={s.actionCopy}><span className={s.audience}>{audience}</span><strong>{children}</strong></span>
    <span className={s.actionArrow}><ArrowUpRight aria-hidden="true"/></span>
  </a>
}
export function FieldHeading({ number, label, title, description, children }) {
  return <header className={s.heading}>
    <div className={s.headingMeta}><span className={s.number} aria-hidden="true">{number}</span><FieldLabel>{label}</FieldLabel></div>
    <h1>{title}</h1><p className={s.description}>{description}</p>{children}
  </header>
}
export function FieldRule({ left, right }) {
  return <div className={s.rule}><span>{left}</span><span>{right}</span></div>
}
