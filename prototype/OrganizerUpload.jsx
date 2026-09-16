import { useEffect, useState } from 'react'
import {
  createRace,
  loginOrganizer,
  registerOrganizer,
  requestPasswordReset,
  resetPassword,
  submitRaceResults,
  verifyEmail,
} from './apiClient'

const TOKEN_STORAGE_KEY = 'otri_organizer_token'
const EMAIL_STORAGE_KEY = 'otri_organizer_email'

const emptyForm = {
  race_id: '',
  race_name: '',
  event_date: '',
  course_name: '',
  distance_km: '',
  elevation_gain_m: '',
}

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

function OrganizerAuthGate({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const resetToken = new URLSearchParams(window.location.search).get('reset_token')

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setForgotSent(true)
        return
      }
      const action = mode === 'login' ? loginOrganizer : registerOrganizer
      const result = await action(email, password)
      localStorage.setItem(TOKEN_STORAGE_KEY, result.access_token)
      localStorage.setItem(EMAIL_STORAGE_KEY, result.email)
      onAuthenticated(result.access_token, result.email)
    } catch (err) {
      setError(err.message)
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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {mode !== 'forgot' && (
            <input
              required
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Please wait\u2026' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {mode === 'login' && (
        <button
          onClick={() => {
            setMode('forgot')
            setForgotSent(false)
            setError(null)
          }}
          className="mt-2 text-xs text-slate-500 underline"
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
          className="mt-2 text-xs text-slate-500 underline"
        >
          Back to sign in
        </button>
      )}
    </div>
  )
}

export default function OrganizerUpload() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [organizerEmail, setOrganizerEmail] = useState(() => localStorage.getItem(EMAIL_STORAGE_KEY))
  const [form, setForm] = useState(emptyForm)
  const [raceCreated, setRaceCreated] = useState(null)
  const [resultsFile, setResultsFile] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function updateField(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  async function handleCreateRace(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const race = await createRace(
        {
          ...form,
          distance_km: Number(form.distance_km),
          elevation_gain_m: Number(form.elevation_gain_m),
        },
        token,
      )
      setRaceCreated(race)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitResults() {
    if (!raceCreated || !resultsFile) return
    setError(null)
    setBusy(true)
    try {
      setSubmission(await submitRaceResults(raceCreated.race_id, resultsFile, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(EMAIL_STORAGE_KEY)
    setToken(null)
    setOrganizerEmail(null)
    setRaceCreated(null)
    setSubmission(null)
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">ORGANIZER UPLOAD</p>
        {token && (
          <p className="text-xs text-slate-500">
            Signed in as <strong>{organizerEmail}</strong> ·{' '}
            <button onClick={handleLogout} className="font-semibold text-blue-600">
              Log out
            </button>
          </p>
        )}
      </div>
      <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#0b1220]">Register a race, then submit results.</h2>
      <p className="mt-2 max-w-[620px] text-sm text-slate-500">
        Calls the live API's organizer workflow (<code>POST /races</code> then{' '}
        <code>POST /races/{'{race_id}'}/results</code>), protected by a real organizer login (<code>POST /auth/register</code>{' '}
        / <code>POST /auth/login</code>). Prototype-only persistence: accounts live in a local SQLite file and races
        are appended to a demo CSV file on the server, not a real database — see <code>api/README.md</code>.
      </p>

      {!token ? (
        <OrganizerAuthGate
          onAuthenticated={(newToken, email) => {
            setToken(newToken)
            setOrganizerEmail(email)
          }}
        />
      ) : !raceCreated ? (
        <form onSubmit={handleCreateRace} className="mt-5 grid max-w-[520px] gap-3">
          <input
            required
            placeholder="Race ID (e.g. MY-RACE-001)"
            value={form.race_id}
            onChange={updateField('race_id')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Race name"
            value={form.race_name}
            onChange={updateField('race_name')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={form.event_date}
            onChange={updateField('event_date')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Course name"
            value={form.course_name}
            onChange={updateField('course_name')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            step="0.1"
            placeholder="Distance (km)"
            value={form.distance_km}
            onChange={updateField('distance_km')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            step="1"
            placeholder="Elevation gain (m)"
            value={form.elevation_gain_m}
            onChange={updateField('elevation_gain_m')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create race'}
          </button>
        </form>
      ) : (
        <div className="mt-5 max-w-[520px]">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Race <strong>{raceCreated.race_id}</strong> created. Now upload a result file (CSV/XLSX).
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => setResultsFile(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <button
              onClick={handleSubmitResults}
              disabled={!resultsFile || busy}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Submit results'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {submission && (
        <div className="mt-5 max-w-[640px]">
          {submission.is_valid ? (
            <div>
              <p className="text-sm font-semibold text-emerald-700">Valid — {submission.scores.length} finisher(s) scored.</p>
              {submission.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-600">
                  {submission.warnings.map((warning, index) => (
                    <li key={index}>
                      row {warning.row} · {warning.field}: {warning.message}
                    </li>
                  ))}
                </ul>
              )}
              <table className="mt-3 w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Runner</th>
                    <th className="px-3 py-2">OTRI score</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.scores.map((row) => (
                    <tr key={row.bib_number ?? `${row.family_name}-${row.first_name}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.rank}</td>
                      <td className="px-3 py-2">
                        {row.first_name} {row.family_name}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-blue-600">{row.otri_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-red-600">Invalid file — {submission.errors.length} error(s).</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-red-600">
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
    </section>
  )
}
