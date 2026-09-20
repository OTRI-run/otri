import './ui.css'
import { fitFontSize } from '../../src/lib/fitText'
import { useState } from 'preact/compat'
import useFileDrop from '../../src/lib/useFileDrop'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Info, Upload, XCircle } from 'lucide-react'
import { Link } from './router'

export const INK = '#0b1220'
export const CONTAINER = "prototype-organizer-ui-container-style-1"

export function Eyebrow({ children, className = '' }) {
  return <p className={`prototype-organizer-ui-eyebrow-p-2 ${className}`}>{children}</p>
}

export function Gradient({ children }) {
  return <span className="prototype-organizer-ui-gradient-span-3">{children}</span>
}

/**
 * A page in the landing design: eyebrow, large heading, intro. With `aside`, the heading sits
 * on the left and the aside (usually a form card) on the right, like the landing's 04 section.
 */
export function Page({ title, eyebrow, intro, back, children, aside, headline }) {
  const heading = (
    <div className="prototype-organizer-ui-page-div-4">
      {back && (
        <Link to={back.to} className="prototype-organizer-ui-page-link-5">
          <ArrowLeft size={13} /> {back.label}
        </Link>
      )}
      {eyebrow && <Eyebrow className={back ? "prototype-organizer-ui-page-eyebrow-6" : ''}>{eyebrow}</Eyebrow>}
      {(headline || title) && (
        // A `title` is a name someone typed (an event, a distance): it is sized by its length. A
        // `headline` is written for the page and keeps the designed size.
        <h1 className="prototype-organizer-ui-page-h1-7 otri-fit" style={{ fontSize: headline ? 'clamp(32px, 4.5vw, 52px)' : fitFontSize(title, { min: 28, vw: 4.5, max: 52 }) }}>{headline ?? title}</h1>
      )}
      {intro && <p className="prototype-organizer-ui-page-p-8">{intro}</p>}
    </div>
  )

  return (
    <section className="prototype-organizer-ui-page-section-9">
      <div className={CONTAINER}>
        {aside ? (
          <div className="prototype-organizer-ui-page-div-10">
            {heading}
            <div className="prototype-organizer-ui-page-div-4">{aside}</div>
          </div>
        ) : (
          heading
        )}
        {children}
      </div>
    </section>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`prototype-organizer-ui-card-div-11 ${className}`}>{children}</div>
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="prototype-organizer-ui-field-label-12">
        {label}
      </label>
      {hint && <p className="prototype-organizer-ui-field-p-13">{hint}</p>}
      <div className="prototype-organizer-ui-field-div-14">{children}</div>
      {error && <p className="prototype-organizer-ui-field-p-15">{error}</p>}
    </div>
  )
}

export const inputClass =
  "prototype-organizer-ui-input-class-style-16"

export function Button({ variant = 'primary', busy = false, disabled, className = '', children, ...rest }) {
  const base = "prototype-organizer-ui-button-style-17"
  const styles = {
    primary: "prototype-organizer-ui-button-style-18",
    secondary: "prototype-organizer-ui-button-style-19",
    danger: "prototype-organizer-ui-button-style-20",
    ghost: "prototype-organizer-ui-button-style-21",
  }
  return (
    <button disabled={disabled || busy} className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {busy && <span aria-hidden="true" className="prototype-organizer-ui-button-span-22" />}
      {children}
    </button>
  )
}

export function Notice({ kind = 'info', title, children }) {
  const styles = {
    info: ["prototype-organizer-ui-notice-style-23", Info],
    success: ["prototype-organizer-ui-notice-style-24", CheckCircle2],
    warning: ["prototype-organizer-ui-notice-style-25", AlertTriangle],
    error: ["prototype-organizer-ui-notice-style-26", XCircle],
  }
  const [cls, Icon] = styles[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`prototype-organizer-ui-notice-div-27 ${cls}`}>
      <Icon size={16} className="prototype-organizer-ui-notice-icon-28" />
      <div className="prototype-organizer-ui-page-div-4">
        {title && <p className="prototype-organizer-ui-notice-p-29">{title}</p>}
        <div className={title ? "prototype-organizer-ui-notice-div-30" : ''}>{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="prototype-organizer-ui-empty-state-div-31">
      <p className="prototype-organizer-ui-empty-state-p-32">{title}</p>
      {children && <p className="prototype-organizer-ui-empty-state-p-33">{children}</p>}
      {action && <div className="prototype-organizer-ui-empty-state-div-34">{action}</div>}
    </div>
  )
}

/** File drop area in the calculator's style. */
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
    <label
      htmlFor={id}
      {...dropProps}
      className={`prototype-organizer-ui-dropzone-label-35 ${dragging ? "prototype-organizer-ui-dropzone-label-36" : "prototype-organizer-ui-dropzone-label-37"}`}
    >
      {busy ? (
        <>
          <span aria-hidden="true" className="prototype-organizer-ui-dropzone-span-38" />
          <span className="prototype-organizer-ui-dropzone-span-39">{busyLabel}</span>
        </>
      ) : (
        <>
          <Upload size={22} className="prototype-organizer-ui-dropzone-upload-40" />
          <span className="prototype-organizer-ui-dropzone-span-39">{fileName ?? label}</span>
          {hint && <span className="prototype-organizer-ui-dropzone-span-41">{hint}</span>}
          <span className="prototype-organizer-ui-dropzone-span-42">
            {fileName ? 'Choose another file' : buttonLabel}
          </span>
        </>
      )}
      <input id={id} type="file" accept={accept} onChange={(event) => { setRefused(null); onChange(event) }} disabled={busy} className="prototype-organizer-ui-dropzone-input-43" />
    </label>
    {refused && <p className="prototype-organizer-ui-dropzone-p-44" role="alert">{refused}</p>}
    </>
  )
}

// Race lifecycle, derived from what exists rather than stored: no GPX -> Draft; GPX -> Course ready;
// scored results -> Results scored. Publishing a public race page is a later phase.
export const RACE_STATUS = {
  draft: { label: 'Draft', cls: "prototype-organizer-ui-race-status-style-45" },
  course: { label: 'Course ready', cls: "prototype-organizer-ui-race-status-style-46" },
  scored: { label: 'Results scored', cls: "prototype-organizer-ui-race-status-style-47" },
  published: { label: 'Published', cls: "prototype-organizer-ui-race-status-style-48" },
}

export function raceStatus(race, hasResults) {
  if (race.is_published) return 'published'
  if (hasResults) return 'scored'
  if (race.has_gpx) return 'course'
  return 'draft'
}

export function StatusChip({ status }) {
  const s = RACE_STATUS[status] ?? RACE_STATUS.draft
  return <span className={`prototype-organizer-ui-status-chip-span-49 ${s.cls}`}>{s.label}</span>
}

/** The race wizard's steps, in the landing's numbered-row style. */
export function Stepper({ steps, current }) {
  return (
    <ol className="prototype-organizer-ui-stepper-ol-50">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        const top = state === 'done' ? "otri-state-13" : state === 'current' ? "otri-state-14" : "otri-state-15"
        const inner = (
          <>
            <span className="prototype-organizer-ui-stepper-span-51">
              <span
                className={`prototype-organizer-ui-stepper-span-52 ${
                  state === 'done' ? "prototype-organizer-ui-stepper-span-53" : state === 'current' ? "prototype-organizer-ui-race-status-style-48" : "prototype-organizer-ui-stepper-span-54"
                }`}
              >
                {state === 'done' ? <Check size={12} /> : index + 1}
              </span>
              <span className={`prototype-organizer-ui-stepper-span-55 ${state === 'current' ? "prototype-organizer-ui-stepper-span-56" : state === 'done' ? "prototype-organizer-ui-dropzone-span-39" : "prototype-organizer-ui-stepper-span-57"}`}>
                {step.label}
              </span>
            </span>
          </>
        )
        return (
          <li key={step.label} className={`prototype-organizer-ui-stepper-li-58 ${top}`}>
            {step.to && state !== 'current' ? (
              <Link to={step.to} className="prototype-organizer-ui-stepper-link-59">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function ChecklistRow({ ok, label, detail, fixTo, fixLabel = 'Fix' }) {
  return (
    <li className="prototype-organizer-ui-checklist-row-li-60">
      {ok ? <CheckCircle2 size={18} className="prototype-organizer-ui-checklist-row-check-circle2-61" /> : <XCircle size={18} className="prototype-organizer-ui-checklist-row-xcircle-62" />}
      <div className="prototype-organizer-ui-checklist-row-div-63">
        <p className="prototype-organizer-ui-checklist-row-p-64">{label}</p>
        {detail && <p className="prototype-organizer-ui-checklist-row-p-65">{detail}</p>}
      </div>
      {!ok && fixTo && (
        <Link to={fixTo} className="prototype-organizer-ui-checklist-row-link-66">
          {fixLabel} →
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
    <span className="prototype-organizer-ui-password-input-span-67">
      <input {...props} type={shown ? 'text' : 'password'} className={`${className} prototype-organizer-ui-password-input-input-68`} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide the password' : 'Show the password'}
        className="prototype-organizer-ui-password-input-button-69"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  )
}
