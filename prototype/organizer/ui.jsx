import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Link } from './router'

export const INK = '#0b1220'

export function Page({ title, eyebrow, intro, back, children, wide = false }) {
  return (
    <div className={`mx-auto w-[min(${wide ? '1120px' : '760px'},calc(100%-28px))] py-10`}>
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
          <ArrowLeft size={13} /> {back.label}
        </Link>
      )}
      {eyebrow && <p className={`${back ? 'mt-4' : ''} font-mono text-[10px] tracking-[.08em] text-slate-500`}>{eyebrow}</p>}
      {title && <h1 className="mt-2 text-3xl font-bold tracking-[-.03em] text-[#0b1220]">{title}</h1>}
      {intro && <p className="mt-2 max-w-[600px] text-sm text-slate-500">{intro}</p>}
      {children}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,.04)] ${className}`}>{children}</div>
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-[#0b1220]">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50'

export function Button({ variant = 'primary', busy = false, disabled, className = '', children, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'border border-slate-300 bg-white text-[#0b1220] hover:border-blue-300',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    ghost: 'text-blue-600 hover:underline',
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
    info: ['border-blue-100 bg-blue-50/70 text-blue-900', Info],
    success: ['border-emerald-100 bg-emerald-50/70 text-emerald-900', CheckCircle2],
    warning: ['border-amber-100 bg-amber-50/70 text-amber-900', AlertTriangle],
    error: ['border-red-100 bg-red-50/70 text-red-900', XCircle],
  }
  const [cls, Icon] = styles[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`}>
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
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <p className="text-base font-semibold text-[#0b1220]">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-[440px] text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Race lifecycle, derived from what exists rather than stored: no GPX -> Draft; GPX -> Course ready;
// scored results -> Results scored. Publishing a public race page is a later phase.
export const RACE_STATUS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  course: { label: 'Course ready', cls: 'bg-blue-50 text-blue-700' },
  scored: { label: 'Results scored', cls: 'bg-emerald-50 text-emerald-700' },
}

export function raceStatus(race, hasResults) {
  if (hasResults) return 'scored'
  if (race.has_gpx) return 'course'
  return 'draft'
}

export function StatusChip({ status }) {
  const s = RACE_STATUS[status] ?? RACE_STATUS.draft
  return <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${s.cls}`}>{s.label}</span>
}

export function Stepper({ steps, current }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        return (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                state === 'done' ? 'bg-emerald-600 text-white' : state === 'current' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {state === 'done' ? <Check size={13} /> : index + 1}
            </span>
            {step.to && state !== 'current' ? (
              <Link to={step.to} className={state === 'done' ? 'font-semibold text-[#0b1220]' : 'text-slate-500'}>
                {step.label}
              </Link>
            ) : (
              <span className={state === 'current' ? 'font-semibold text-blue-700' : 'text-slate-500'}>{step.label}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function ChecklistRow({ ok, label, detail, fixTo, fixLabel = 'Fix' }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#0b1220]">{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
      {!ok && fixTo && (
        <Link to={fixTo} className="text-xs font-semibold text-blue-600">
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
