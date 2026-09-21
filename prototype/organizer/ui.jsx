import { fitFontSize } from '../../src/lib/fitText'
import { useState } from 'react'
import useFileDrop from '../../src/lib/useFileDrop'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Info, Upload, XCircle } from 'lucide-react'
import { Link } from './router'

export const INK = '#0b1220'
export const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

export function Eyebrow({ children, className = '' }) {
  return <p className={`font-mono text-[10px] tracking-[.08em] text-muted ${className}`}>{children}</p>
}

export function Gradient({ children }) {
  return <span className="text-accent">{children}</span>
}

/**
 * A page in the landing design: eyebrow, large heading, intro. With `aside`, the heading sits
 * on the left and the aside (usually a form card) on the right, like the landing's 04 section.
 */
export function Page({ title, eyebrow, intro, back, children, aside, headline }) {
  const heading = (
    <div className="min-w-0">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline hover:underline">
          <ArrowLeft size={13} /> {back.label}
        </Link>
      )}
      {eyebrow && <Eyebrow className={back ? 'mt-5' : ''}>{eyebrow}</Eyebrow>}
      {(headline || title) && (
        // A `title` is a name someone typed (an event, a distance): it is sized by its length. A
        // `headline` is written for the page and keeps the designed size.
        <h1 className="otri-fit mt-3 font-normal leading-[1.02] tracking-[-.05em] text-ink" style={{ fontSize: headline ? 'clamp(32px, 4.5vw, 52px)' : fitFontSize(title, { min: 28, vw: 4.5, max: 52 }) }}>{headline ?? title}</h1>
      )}
      {intro && <p className="mt-4 max-w-[560px] text-sm leading-7 text-muted">{intro}</p>}
    </div>
  )

  return (
    <section className="py-12 sm:py-16">
      <div className={CONTAINER}>
        {aside ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_.9fr] lg:gap-20">
            {heading}
            <div className="min-w-0">{aside}</div>
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
  return <div className={`min-w-0 rounded-[3px] border border-rule bg-white p-5  sm:p-6 ${className}`}>{children}</div>
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const inputClass =
  'w-full rounded-[3px] border border-rule bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50'

export function Button({ variant = 'primary', busy = false, disabled, className = '', children, ...rest }) {
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'
  const styles = {
    primary: 'bg-gradient-to-r from-blue-700 to-blue-500 text-white  hover:from-blue-800 hover:to-blue-600',
    secondary: 'border border-rule bg-sheet text-ink hover:border-accent',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    ghost: 'min-h-0 px-0 text-accent hover:underline',
  }
  return (
    <button disabled={disabled || busy} className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {busy && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  )
}

export function Notice({ kind = 'info', title, children }) {
  const styles = {
    info: ['border-rule bg-wash/70 text-blue-900', Info],
    success: ['border-emerald-100 bg-emerald-50/70 text-emerald-900', CheckCircle2],
    warning: ['border-amber-100 bg-amber-50/70 text-amber-900', AlertTriangle],
    error: ['border-red-100 bg-red-50/70 text-red-900', XCircle],
  }
  const [cls, Icon] = styles[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-[3px] border px-4 py-3 text-sm ${cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-[3px] border border-dashed border-rule bg-white/60 px-6 py-12 text-center">
      <p className="text-lg font-bold tracking-[-.02em] text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-[440px] text-sm leading-6 text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
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
      className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[3px] border-2 border-dashed px-4 py-8 text-center text-sm transition hover:border-blue-400 hover:bg-wash/40 ${dragging ? 'border-blue-500 bg-wash' : 'border-rule bg-slate-50'}`}
    >
      {busy ? (
        <>
          <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="font-semibold text-ink">{busyLabel}</span>
        </>
      ) : (
        <>
          <Upload size={22} className="text-accent" />
          <span className="font-semibold text-ink">{fileName ?? label}</span>
          {hint && <span className="max-w-[360px] text-xs leading-5 text-muted">{hint}</span>}
          <span className="mt-1 inline-flex min-h-10 items-center rounded-[3px] bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white ">
            {fileName ? 'Choose another file' : buttonLabel}
          </span>
        </>
      )}
      <input id={id} type="file" accept={accept} onChange={(event) => { setRefused(null); onChange(event) }} disabled={busy} className="hidden" />
    </label>
    {refused && <p className="mt-2 text-xs text-red-600" role="alert">{refused}</p>}
    </>
  )
}

// Race lifecycle, derived from what exists rather than stored: no GPX -> Draft; GPX -> Course ready;
// scored results -> Results scored. Publishing a public race page is a later phase.
export const RACE_STATUS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-muted' },
  course: { label: 'Course ready', cls: 'bg-wash text-accent' },
  scored: { label: 'Results scored', cls: 'bg-emerald-50 text-emerald-700' },
  published: { label: 'Published', cls: 'bg-accent text-white' },
}

export function raceStatus(race, hasResults) {
  if (race.is_published) return 'published'
  if (hasResults) return 'scored'
  if (race.has_gpx) return 'course'
  return 'draft'
}

export function StatusChip({ status }) {
  const s = RACE_STATUS[status] ?? RACE_STATUS.draft
  return <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${s.cls}`}>{s.label}</span>
}

/** The race wizard's steps, in the landing's numbered-row style. */
export function Stepper({ steps, current }) {
  return (
    <ol className="grid grid-cols-2 gap-x-4 border-t border-rule sm:grid-cols-4">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        const top = state === 'done' ? 'border-emerald-500' : state === 'current' ? 'border-blue-600' : 'border-transparent'
        const inner = (
          <>
            <span className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                  state === 'done' ? 'bg-emerald-500 text-white' : state === 'current' ? 'bg-accent text-white' : 'bg-slate-200 text-muted'
                }`}
              >
                {state === 'done' ? <Check size={12} /> : index + 1}
              </span>
              <span className={`text-[13px] ${state === 'current' ? 'font-bold text-ink' : state === 'done' ? 'font-semibold text-ink' : 'text-muted'}`}>
                {step.label}
              </span>
            </span>
          </>
        )
        return (
          <li key={step.label} className={`-mt-px border-t-2 pt-3 pb-2 ${top}`}>
            {step.to && state !== 'current' ? (
              <Link to={step.to} className="no-underline hover:underline">
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
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </div>
      {!ok && fixTo && (
        <Link to={fixTo} className="text-xs font-semibold text-accent no-underline hover:underline">
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
    <span className="relative block">
      <input {...props} type={shown ? 'text' : 'password'} className={`${className} pr-16`} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide the password' : 'Show the password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[3px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-muted hover:text-accent"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  )
}
