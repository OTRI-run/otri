import { useEffect, useState } from 'react'
import {
  attachRaceGpx,
  createEvent,
  createRace,
  deleteEvent,
  deleteRace,
  getEvent,
  listMyEvents,
  listScoringModels,
  loginOrganizer,
  registerOrganizer,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  submitRaceResults,
  updateEvent,
  updateRace,
  verifyEmail,
} from './apiClient'

const TOKEN_STORAGE_KEY = 'otri_organizer_token'
const EMAIL_STORAGE_KEY = 'otri_organizer_email'

const inputClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm'
const primaryButtonClass = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
const dangerLinkClass = 'text-xs font-semibold text-red-600 underline disabled:opacity-50'
const subtleLinkClass = 'text-xs font-semibold text-blue-600 underline disabled:opacity-50'
const emptyRaceForm = { course_name: '', distance_km: '', elevation_gain_m: '', scoring_version: '' }

function EmailVerificationNotice() {
  const [status, setStatus] = useState(null) // null | 'checking' | 'ok' | 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('verify_email')
    if (!token) return
    setStatus('checking')
    verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch((err) => {
        setStatus('error')
        setMessage(err.message)
      })
  }, [])

  if (!status) return null
  return (
    <p className={`mt-3 text-xs ${status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
      {status === 'checking' && 'Verifying your email…'}
      {status === 'ok' && 'Email verified — you can sign in normally.'}
      {status === 'error' && `Could not verify email: ${message}`}
    </p>
  )
}

function PasswordResetForm({ token, onDone }) {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await resetPassword(token, newPassword)
      onDone(result.access_token, result.email)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-3">
      <p className="text-sm text-slate-600">Choose a new password.</p>
      <input
        required
        type="password"
        placeholder="New password (min. 8 characters)"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Please wait…' : 'Set new password'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}

function ResendVerificationLink({ email }) {
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent'

  async function handleClick() {
    setStatus('sending')
    try {
      await resendVerification(email)
    } finally {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return <p className="mt-2 text-xs text-emerald-700">If that account needs verifying, a new link was just sent.</p>
  }
  return (
    <button onClick={handleClick} disabled={status === 'sending'} className={`mt-2 ${subtleLinkClass}`}>
      {status === 'sending' ? 'Sending…' : 'Resend verification email'}
    </button>
  )
}

function OrganizerAuthGate({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [registered, setRegistered] = useState(false)
  const resetToken = new URLSearchParams(window.location.search).get('reset_token')

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setNeedsVerification(false)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setForgotSent(true)
        return
      }
      if (mode === 'register') {
        await registerOrganizer(email, password)
        setRegistered(true)
        return
      }
      const result = await loginOrganizer(email, password)
      localStorage.setItem(TOKEN_STORAGE_KEY, result.access_token)
      localStorage.setItem(EMAIL_STORAGE_KEY, result.email)
      onAuthenticated(result.access_token, result.email)
    } catch (err) {
      setError(err.message)
      if (mode === 'login' && /verify/i.test(err.message)) {
        setNeedsVerification(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (resetToken) {
    return (
      <div className="mt-5 max-w-[400px]">
        <EmailVerificationNotice />
        <PasswordResetForm
          token={resetToken}
          onDone={(accessToken, organizerEmail) => {
            localStorage.setItem(TOKEN_STORAGE_KEY, accessToken)
            localStorage.setItem(EMAIL_STORAGE_KEY, organizerEmail)
            onAuthenticated(accessToken, organizerEmail)
          }}
        />
      </div>
    )
  }

  if (mode === 'register' && registered) {
    return (
      <div className="mt-5 max-w-[400px]">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Account created. Check <strong>{email}</strong> for a verification link before signing in.
        </p>
        <ResendVerificationLink email={email} />
        <button
          onClick={() => {
            setMode('login')
            setRegistered(false)
            setError(null)
          }}
          className={`mt-3 block ${subtleLinkClass}`}
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="mt-5 max-w-[400px]">
      <EmailVerificationNotice />
      <div className="flex gap-2 text-sm font-semibold">
        <button
          onClick={() => setMode('login')}
          className={mode === 'login' ? 'text-blue-600' : 'text-slate-400'}
        >
          Sign in
        </button>
        <span className="text-slate-300">/</span>
        <button
          onClick={() => setMode('register')}
          className={mode === 'register' ? 'text-blue-600' : 'text-slate-400'}
        >
          Create account
        </button>
      </div>
      {mode === 'forgot' && forgotSent ? (
        <p className="mt-3 text-sm text-emerald-700">
          If that email has an account, a password reset link has been sent.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3">
          <input
            required
            type="email"
            placeholder="Organizer email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
          {mode !== 'forgot' && (
            <input
              required
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          )}
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Please wait\u2026' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {needsVerification && <ResendVerificationLink email={email} />}
      {mode === 'login' && (
        <button
          onClick={() => {
            setMode('forgot')
            setForgotSent(false)
            setError(null)
          }}
          className="mt-2 block text-xs text-slate-500 underline"
        >
          Forgot password?
        </button>
      )}
      {mode === 'forgot' && (
        <button
          onClick={() => {
            setMode('login')
            setForgotSent(false)
            setError(null)
          }}
          className="mt-2 block text-xs text-slate-500 underline"
        >
          Back to sign in
        </button>
      )}
    </div>
  )
}

function ScoringModelSelect({ value, onChange, scoringModels }) {
  return (
    <div>
      <select value={value} onChange={onChange} className={inputClass}>
        {scoringModels.map((model) => (
          <option key={model.version} value={model.version}>
            {model.name}
          </option>
        ))}
      </select>
      {value && (
        <p className="mt-1 max-w-[420px] text-[11px] text-slate-500">
          {scoringModels.find((model) => model.version === value)?.description}
        </p>
      )}
    </div>
  )
}

function RaceRow({ race, token, scoringModels, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    course_name: race.course_name,
    distance_km: String(race.distance_km),
    elevation_gain_m: String(race.elevation_gain_m),
    scoring_version: race.scoring_version,
  })
  const [gpxBusy, setGpxBusy] = useState(false)
  const [resultsFile, setResultsFile] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSave(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await updateRace(
        race.race_id,
        {
          course_name: form.course_name,
          distance_km: Number(form.distance_km),
          elevation_gain_m: Number(form.elevation_gain_m),
          scoring_version: form.scoring_version,
        },
        token,
      )
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete distance "${race.course_name}"? This also deletes any submitted results.`)) return
    setError(null)
    setBusy(true)
    try {
      await deleteRace(race.race_id, token)
      onChanged()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleGpxUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setGpxBusy(true)
    try {
      await attachRaceGpx(race.race_id, file, token)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setGpxBusy(false)
      event.target.value = ''
    }
  }

  async function handleSubmitResults() {
    if (!resultsFile) return
    setError(null)
    setBusy(true)
    try {
      setSubmission(await submitRaceResults(race.race_id, resultsFile, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      {editing ? (
        <form onSubmit={handleSave} className="grid gap-2 sm:grid-cols-3">
          <input
            required
            value={form.course_name}
            onChange={(event) => setForm((prev) => ({ ...prev, course_name: event.target.value }))}
            className={inputClass}
            placeholder="Distance name (e.g. 50K)"
          />
          <input
            required
            type="number"
            step="0.1"
            value={form.distance_km}
            onChange={(event) => setForm((prev) => ({ ...prev, distance_km: event.target.value }))}
            className={inputClass}
            placeholder="Distance (km)"
          />
          <input
            required
            type="number"
            step="1"
            value={form.elevation_gain_m}
            onChange={(event) => setForm((prev) => ({ ...prev, elevation_gain_m: event.target.value }))}
            className={inputClass}
            placeholder="Elevation gain (m)"
          />
          <ScoringModelSelect
            value={form.scoring_version}
            onChange={(event) => setForm((prev) => ({ ...prev, scoring_version: event.target.value }))}
            scoringModels={scoringModels}
          />
          <div className="flex gap-3 sm:col-span-3">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-slate-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#0b1220]">{race.course_name}</p>
            <p className="text-xs text-slate-500">
              {race.distance_km} km · {race.elevation_gain_m} m gain · {race.has_gpx ? 'GPX attached' : 'no GPX yet'}
            </p>
            <p className="text-xs text-slate-400">
              Scoring: {scoringModels.find((model) => model.version === race.scoring_version)?.name ?? race.scoring_version}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setEditing(true)} className={subtleLinkClass}>
              Edit
            </button>
            <button onClick={handleDelete} disabled={busy} className={dangerLinkClass}>
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <label className="text-xs text-slate-500">
          {race.has_gpx ? 'Replace GPX' : 'Attach GPX'}:{' '}
          <input type="file" accept=".gpx" disabled={gpxBusy} onChange={handleGpxUpload} className="text-xs" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => setResultsFile(event.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <button
          onClick={handleSubmitResults}
          disabled={!resultsFile || busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit results'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {submission && (
        <div className="mt-3">
          {submission.is_valid ? (
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                Valid — {submission.scores.length} finisher(s) scored.
              </p>
              {submission.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-600">
                  {submission.warnings.map((warning, index) => (
                    <li key={index}>
                      row {warning.row} · {warning.field}: {warning.message}
                    </li>
                  ))}
                </ul>
              )}
              <table className="mt-2 w-full min-w-[360px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 font-mono uppercase tracking-[.06em] text-slate-500">
                    <th className="px-2 py-1">Rank</th>
                    <th className="px-2 py-1">Runner</th>
                    <th className="px-2 py-1">OTRI score</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.scores.map((row) => (
                    <tr key={row.bib_number ?? `${row.family_name}-${row.first_name}`} className="border-b border-slate-100">
                      <td className="px-2 py-1 font-mono text-slate-500">{row.rank}</td>
                      <td className="px-2 py-1">
                        {row.first_name} {row.family_name}
                      </td>
                      <td className="px-2 py-1 font-mono font-bold text-blue-600">{row.otri_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-red-600">Invalid file — {submission.errors.length} error(s).</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                {submission.errors.map((issue, index) => (
                  <li key={index}>
                    row {issue.row ?? '-'} · {issue.field ?? 'file'}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, token, scoringModels, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ event_name: event.event_name, event_date: event.event_date })
  const [raceForm, setRaceForm] = useState({
    ...emptyRaceForm,
    scoring_version: scoringModels[0]?.version ?? '',
  })
  const [addingRace, setAddingRace] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function refreshDetail() {
    setDetail(await getEvent(event.event_id))
  }

  async function handleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && !detail) {
      try {
        await refreshDetail()
      } catch (err) {
        setError(err.message)
      }
    }
  }

  async function handleSaveEvent(submitEvent) {
    submitEvent.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await updateEvent(event.event_id, form, token)
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteEvent() {
    if (!window.confirm(`Delete event "${event.event_name}"? This also deletes all its distances and results.`)) return
    setError(null)
    setBusy(true)
    try {
      await deleteEvent(event.event_id, token)
      onChanged()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleAddRace(submitEvent) {
    submitEvent.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await createRace(
        event.event_id,
        {
          course_name: raceForm.course_name,
          distance_km: Number(raceForm.distance_km),
          elevation_gain_m: Number(raceForm.elevation_gain_m),
          scoring_version: raceForm.scoring_version || undefined,
        },
        token,
      )
      setRaceForm({ ...emptyRaceForm, scoring_version: scoringModels[0]?.version ?? '' })
      setAddingRace(false)
      await refreshDetail()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={handleExpand} className="text-left">
          <p className="text-sm font-bold text-[#0b1220]">{event.event_name}</p>
          <p className="text-xs text-slate-500">
            {event.event_date} · {event.race_count} distance(s)
          </p>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing((value) => !value)} className={subtleLinkClass}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={handleDeleteEvent} disabled={busy} className={dangerLinkClass}>
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSaveEvent} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            required
            value={form.event_name}
            onChange={(fieldEvent) => setForm((prev) => ({ ...prev, event_name: fieldEvent.target.value }))}
            className={inputClass}
            placeholder="Event name"
          />
          <input
            required
            type="date"
            value={form.event_date}
            onChange={(fieldEvent) => setForm((prev) => ({ ...prev, event_date: fieldEvent.target.value }))}
            className={inputClass}
          />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {expanded && (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
          {detail?.races.map((race) => (
            <RaceRow
              key={race.race_id}
              race={race}
              token={token}
              scoringModels={scoringModels}
              onChanged={async () => {
                await refreshDetail()
                onChanged()
              }}
            />
          ))}

          {addingRace ? (
            <form onSubmit={handleAddRace} className="grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-3">
              <input
                required
                value={raceForm.course_name}
                onChange={(fieldEvent) => setRaceForm((prev) => ({ ...prev, course_name: fieldEvent.target.value }))}
                className={inputClass}
                placeholder="Distance name (e.g. 50K)"
              />
              <input
                required
                type="number"
                step="0.1"
                value={raceForm.distance_km}
                onChange={(fieldEvent) => setRaceForm((prev) => ({ ...prev, distance_km: fieldEvent.target.value }))}
                className={inputClass}
                placeholder="Distance (km)"
              />
              <input
                required
                type="number"
                step="1"
                value={raceForm.elevation_gain_m}
                onChange={(fieldEvent) => setRaceForm((prev) => ({ ...prev, elevation_gain_m: fieldEvent.target.value }))}
                className={inputClass}
                placeholder="Elevation gain (m)"
              />
              <ScoringModelSelect
                value={raceForm.scoring_version}
                onChange={(fieldEvent) => setRaceForm((prev) => ({ ...prev, scoring_version: fieldEvent.target.value }))}
                scoringModels={scoringModels}
              />
              <div className="flex gap-3 sm:col-span-3">
                <button type="submit" disabled={busy} className={primaryButtonClass}>
                  {busy ? 'Adding…' : 'Add distance'}
                </button>
                <button type="button" onClick={() => setAddingRace(false)} className="text-xs font-semibold text-slate-500">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAddingRace(true)} className={`${subtleLinkClass} text-left`}>
              + Add another distance
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function EventsDashboard({ token, organizerEmail, onLogout }) {
  const [events, setEvents] = useState(null)
  const [scoringModels, setScoringModels] = useState([])
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ event_name: '', event_date: '' })
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      setEvents(await listMyEvents(token))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    refresh()
    listScoringModels().then(setScoringModels).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreateEvent(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await createEvent(form, token)
      setForm({ event_name: '', event_date: '' })
      setCreating(false)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Signed in as <strong>{organizerEmail}</strong> ·{' '}
          <button onClick={onLogout} className="font-semibold text-blue-600">
            Log out
          </button>
        </p>
      </div>

      {creating ? (
        <form onSubmit={handleCreateEvent} className="mt-4 grid max-w-[520px] gap-3 rounded-lg border border-dashed border-slate-300 p-4">
          <input
            required
            value={form.event_name}
            onChange={(event) => setForm((prev) => ({ ...prev, event_name: event.target.value }))}
            className={inputClass}
            placeholder="Event name"
          />
          <input
            required
            type="date"
            value={form.event_date}
            onChange={(event) => setForm((prev) => ({ ...prev, event_date: event.target.value }))}
            className={inputClass}
          />
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? 'Creating…' : 'Create event'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-xs font-semibold text-slate-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className={`mt-4 ${primaryButtonClass}`}>
          + New event
        </button>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-5 grid max-w-[720px] gap-3">
        {events === null && <p className="text-sm text-slate-500">Loading your events…</p>}
        {events?.length === 0 && <p className="text-sm text-slate-500">No events yet — create one above.</p>}
        {events?.map((event) => (
          <EventCard key={event.event_id} event={event} token={token} scoringModels={scoringModels} onChanged={refresh} />
        ))}
      </div>
    </div>
  )
}

export default function OrganizerUpload() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [organizerEmail, setOrganizerEmail] = useState(() => localStorage.getItem(EMAIL_STORAGE_KEY))

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(EMAIL_STORAGE_KEY)
    setToken(null)
    setOrganizerEmail(null)
  }

  return (
    <section className="mt-10">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">ORGANIZER DASHBOARD</p>
      <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">
        Create events, add distances, attach a GPX, then submit results.
      </h2>
      <p className="mt-2 max-w-[640px] text-sm text-slate-500">
        Calls the live API's organizer workflow: an event (<code>POST /events</code>) can hold multiple race
        distances (<code>POST /events/{'{event_id}'}/races</code>), each with its own GPX (
        <code>POST /races/{'{race_id}'}/gpx</code>) and results file. Requires a verified organizer account — see{' '}
        <code>api/README.md</code>.
      </p>

      {!token ? (
        <OrganizerAuthGate
          onAuthenticated={(newToken, email) => {
            setToken(newToken)
            setOrganizerEmail(email)
          }}
        />
      ) : (
        <EventsDashboard token={token} organizerEmail={organizerEmail} onLogout={handleLogout} />
      )}
    </section>
  )
}
