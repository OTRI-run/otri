import { fitFontSize } from '../../src/lib/fitText'
import { useState } from 'preact/compat'
import useFileDrop from '../../src/lib/useFileDrop'
import { Alert, ArrowLeft, ArrowRight, Check, CheckCircle, Info, Upload, XCircle } from '../../src/ui/icons'
import { Link } from './router'

// The organizer app's small kit, on top of the design system in src/ui. Pages compose these and
// the system's classes; a page adds its own stylesheet only for what is truly its own.

export const INK = '#17261f'
export const CONTAINER = 'wrap'

export function Eyebrow({ children, className = '' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

/** The orange word in a heading. */
export function Gradient({ children }) {
  return <span className="accent">{children}</span>
}

/**
 * A page: eyebrow, large heading, intro. With `aside`, the heading sits on the left and the aside
 * (usually a form card) on the right on wide screens.
 */
export function Page({ title, eyebrow, intro, back, children, aside, headline }) {
  const heading = (
    <div className="page-head__text">
      {back && (
        <Link to={back.to} className="back">
          <ArrowLeft size={16} /> {back.label}
        </Link>
      )}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {(headline || title) && (
        // A `title` is a name someone typed (an event, a distance): it is sized by its length. A
        // `headline` is written for the page and keeps the designed size.
        <h1 className="otri-fit" style={{ fontSize: headline ? 'clamp(36px, 4.8vw, 60px)' : fitFontSize(title, { min: 30, vw: 4.8, max: 60 }) }}>{headline ?? title}</h1>
      )}
      {intro && <p className="lead">{intro}</p>}
    </div>
  )

  return (
    <section className="section">
      <div className={CONTAINER}>
        {aside ? (
          <div className="page-head page-head--split">
            {heading}
            <div className="min0">{aside}</div>
          </div>
        ) : (
          <div className="page-head">{heading}</div>
        )}
        {children}
      </div>
    </section>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor} className="field__label">
        {label}
      </label>
      {hint && <p className="field__hint">{hint}</p>}
      <div>{children}</div>
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}

export const inputClass = 'input'

export function Button({ variant = 'primary', busy = false, disabled, className = '', children, ...rest }) {
  const styles = {
    primary: 'btn btn--primary',
    dark: 'btn btn--dark',
    secondary: 'btn btn--secondary',
    danger: 'btn btn--danger',
    ghost: 'btn btn--ghost',
  }
  return (
    <button disabled={disabled || busy} aria-busy={busy || undefined} className={`${styles[variant] ?? styles.primary} ${className}`} {...rest}>
      {busy && <span aria-hidden="true" className="spinner" />}
      {children}
    </button>
  )
}

export function Notice({ kind = 'info', title, children }) {
  const styles = {
    info: ['notice--info', Info],
    success: ['notice--success', CheckCircle],
    warning: ['notice--warning', Alert],
    error: ['notice--error', XCircle],
  }
  const [cls, Icon] = styles[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`notice ${cls}`}>
      <Icon size={18} />
      <div className="notice__body">
        {title && <p className="notice__title">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

/** File drop area, the same on every upload. */
export function Dropzone({ id, accept, onChange, busy = false, busyLabel = 'Working…', label, hint, fileName, buttonLabel = 'Choose file' }) {
  const [refused, setRefused] = useState(null)
  // A dropped file goes the same way as a chosen one: the caller reads event.target.files.
  const { dragging, dropProps } = useFileDrop({
    accept,
    disabled: busy,
    onFiles: (files) => {
      setRefused(null)
      onChange({ target: { files, value: '' } })
    },
    onReject: setRefused,
  })
  return (
    <>
      <label htmlFor={id} {...dropProps} className={`dropzone ${dragging ? 'is-dragging' : ''}`}>
        {busy ? (
          <>
            <span aria-hidden="true" className="spinner spinner--lg" />
            <span className="dropzone__title">{busyLabel}</span>
          </>
        ) : (
          <>
            <Upload size={26} />
            <span className="dropzone__title">{fileName ?? label}</span>
            {hint && <span className="dropzone__hint">{hint}</span>}
            <span className="btn btn--primary btn--sm mt-1">{fileName ? 'Choose another file' : buttonLabel}</span>
          </>
        )}
        <input id={id} type="file" accept={accept} onChange={(event) => { setRefused(null); onChange(event) }} disabled={busy} />
      </label>
      {refused && <p className="field__error mt-2" role="alert">{refused}</p>}
    </>
  )
}

// Race lifecycle, derived from what exists rather than stored: no GPX -> Draft; GPX -> Course ready;
// scored results -> Results scored; published -> Published.
export const RACE_STATUS = {
  draft: { label: 'Draft', cls: 'badge' },
  course: { label: 'Course ready', cls: 'badge badge--sky' },
  scored: { label: 'Results scored', cls: 'badge badge--moss' },
  published: { label: 'Published', cls: 'badge badge--solid-moss' },
}

export function raceStatus(race, hasResults) {
  if (race.is_published) return 'published'
  if (hasResults) return 'scored'
  if (race.has_gpx) return 'course'
  return 'draft'
}

export function StatusChip({ status }) {
  const s = RACE_STATUS[status] ?? RACE_STATUS.draft
  return <span className={s.cls}>{s.label}</span>
}

/** The race wizard's steps: waypoints on a route, the current one lit. */
export function Stepper({ steps, current }) {
  return (
    <ol className="steps">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        const inner = (
          <>
            <span className={`waypoint waypoint--sm ${state === 'done' ? 'waypoint--done' : state === 'current' ? 'waypoint--blaze' : 'waypoint--todo'}`}>
              {state === 'done' ? <Check size={13} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="steps__label">{step.label}</span>
          </>
        )
        return (
          <li key={step.label} className="steps__item" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            {step.to && state !== 'current' ? <Link to={step.to}>{inner}</Link> : inner}
          </li>
        )
      })}
    </ol>
  )
}

export function ChecklistRow({ ok, label, detail, fixTo, fixLabel = 'Fix' }) {
  return (
    <li className={`checklist__row ${ok ? 'is-ok' : 'is-todo'}`}>
      {ok ? <CheckCircle size={20} /> : <XCircle size={20} />}
      <div className="grow">
        <p className="small" style={{ fontWeight: 600 }}>{label}</p>
        {detail && <p className="tiny muted">{detail}</p>}
      </div>
      {!ok && fixTo && (
        <Link to={fixTo} className="link link--arrow small">
          {fixLabel} <ArrowRight size={14} />
        </Link>
      )}
    </li>
  )
}

export function formatDate(iso) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

/** A password field with a way to look at what was typed: a mistyped password is otherwise found
 * out only after the form has been sent. Takes what an <input> takes. */
export function PasswordInput({ className = '', ...props }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="input-wrap">
      <input {...props} type={shown ? 'text' : 'password'} className={`${className} input`} style={{ paddingRight: 76 }} />
      <span className="input-wrap__end">
        <button type="button" onClick={() => setShown((value) => !value)} aria-pressed={shown} aria-label={shown ? 'Hide the password' : 'Show the password'} className="btn btn--ghost btn--sm mono" style={{ minHeight: 32, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
    </span>
  )
}
