import './ReportForm.css'
import { useState } from 'preact/compat'
import { Flag as FlagIcon } from '../src/ui/icons'
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
      <p className="notice notice--success notice--plain report-form">
        Thanks. An admin will look at it{email ? ` and reply to ${email}` : ''}. Removal requests are handled first.
      </p>
    )
  }

  return (
    <div className="report-form">
      <p className="tiny muted">
        Built only from races their organizers published. {prompt}{' '}
        <button type="button" onClick={() => setOpen((v) => !v)} className="link">
          {open ? 'Close' : 'Report a problem'}
        </button>
      </p>
      {open && (
        <form onSubmit={submit} className="card stack report-form__form mt-4">
          <p className="h-4 cluster cluster--tight">
            <FlagIcon size={16} className="icon--accent" /> Report: {subjectLabel}
          </p>
          <label className="field">
            <span className="field__label">What is wrong?</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="input input--sm">
              {(REASONS[kind] ?? REASONS.runner).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Details</span>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Which result, what should it be, or why it should be removed."
              className="input report-form__details"
            />
          </label>
          <label className="field">
            <span className="field__label">Your email <span className="optional">(optional, so we can reply)</span></span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input input--sm" />
          </label>
          {error && <p className="field__error">{error}</p>}
          <div className="cluster">
            <button
              type="submit"
              disabled={state === 'sending' || message.trim().length < 10}
              className="btn btn--dark btn--sm"
            >
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <span className="tiny muted">Goes to the OTRI admins only.</span>
          </div>
        </form>
      )}
    </div>
  )
}
