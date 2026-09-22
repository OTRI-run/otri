import { useState } from 'react'
import { Flag as FlagIcon } from 'lucide-react'
import { submitReport } from './apiClient'

const REASONS = {
  runner: [
    ['not_me', 'This is not me / two people are merged'],
    ['wrong_result', 'A result or time is wrong'],
    ['remove_my_data', 'Remove my profile or results'],
    ['other', 'Something else'],
  ],
  race: [
    ['wrong_result', 'A result or time is wrong'],
    ['wrong_course', 'The course or distance is wrong'],
    ['remove_my_data', 'Remove my name from this race'],
    ['other', 'Something else'],
  ],
  shared_course: [
    ['wrong_course', 'This course file is wrong or misleading'],
    ['remove_my_data', 'This is my file, please remove it'],
    ['other', 'Something else'],
  ],
}

/**
 * "Something wrong?" — a small form that files a report for the admins, who see it on the
 * dashboard next to the actions that fix it. No account needed; an email is optional.
 */
export default function ReportForm({ kind, subjectId, subjectLabel, prompt = 'Is this you and something is wrong?' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REASONS[kind]?.[0]?.[0] ?? 'other')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setState('sending')
    try {
      await submitReport({ kind, subject_id: subjectId, subject_label: subjectLabel, reason, message, reporter_email: email || null, page_url: window.location.href })
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">
        Thanks. An admin will look at it{email ? ` and reply to ${email}` : ''}. Removal requests are handled first.
      </p>
    )
  }

  return (
    <div className="mt-3">
      {/* This is the only way in to the correction and removal form on a runner profile or a
          leaderboard, so it is readable text rather than 9px of pale grey. */}
      <p className="text-xs leading-5 text-slate-600">
        Built only from races their organizers published. {prompt}{' '}
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-blue-600 underline">
          {open ? 'Close' : 'Report a problem'}
        </button>
      </p>
      {open && (
        <form onSubmit={submit} className="mt-3 grid max-w-[560px] gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#0b1220]">
            <FlagIcon size={14} className="text-blue-600" /> Report: {subjectLabel}
          </p>
          <label className="text-xs text-slate-600">
            What is wrong?
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0b1220]">
              {(REASONS[kind] ?? REASONS.runner).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Details
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Which result, what should it be, or why it should be removed."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0b1220]"
            />
          </label>
          <label className="text-xs text-slate-600">
            Your email (optional, so we can reply)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0b1220]" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={state === 'sending' || message.trim().length < 10}
              className="inline-flex min-h-10 items-center rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <span className="text-[11px] text-slate-500">Goes to the OTRI admins only.</span>
          </div>
        </form>
      )}
    </div>
  )
}
