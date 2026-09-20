import './ReportForm.css'
import { useState } from 'preact/compat'
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
      <p className="prototype-report-form-report-form-p-1">
        Thanks. An admin will look at it{email ? ` and reply to ${email}` : ''}. Removal requests are handled first.
      </p>
    )
  }

  return (
    <div className="prototype-report-form-report-form-div-2">
      <p className="prototype-report-form-report-form-p-3">
        Built only from races their organizers published. {prompt}{' '}
        <button type="button" onClick={() => setOpen((v) => !v)} className="prototype-report-form-report-form-button-4">
          {open ? 'Close' : 'Report a problem'}
        </button>
      </p>
      {open && (
        <form onSubmit={submit} className="prototype-report-form-report-form-form-5">
          <p className="prototype-report-form-report-form-p-6">
            <FlagIcon size={14} className="prototype-report-form-report-form-flag-icon-7" /> Report: {subjectLabel}
          </p>
          <label className="prototype-report-form-report-form-label-8">
            What is wrong?
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="prototype-report-form-report-form-select-9">
              {(REASONS[kind] ?? REASONS.runner).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="prototype-report-form-report-form-label-8">
            Details
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Which result, what should it be, or why it should be removed."
              className="prototype-report-form-report-form-select-9"
            />
          </label>
          <label className="prototype-report-form-report-form-label-8">
            Your email (optional, so we can reply)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="prototype-report-form-report-form-select-9" />
          </label>
          {error && <p className="prototype-report-form-report-form-p-10">{error}</p>}
          <div className="prototype-report-form-report-form-div-11">
            <button
              type="submit"
              disabled={state === 'sending' || message.trim().length < 10}
              className="prototype-report-form-report-form-button-12"
            >
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <span className="prototype-report-form-report-form-span-13">Goes to the OTRI admins only.</span>
          </div>
        </form>
      )}
    </div>
  )
}
