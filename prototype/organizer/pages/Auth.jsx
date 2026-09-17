import { useEffect, useState } from 'react'
import { loginOrganizer, registerOrganizer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from '../../apiClient'
import { Link, navigate } from '../router'
import { Button, Card, Field, Notice, Page, inputClass } from '../ui'

const DOCS = 'https://github.com/OTRI-run/otri/blob/main'
const MIN_PASSWORD = 8

export function Welcome() {
  return (
    <Page eyebrow="OTRI FOR ORGANIZERS" title="Add your race to OTRI." intro="Create your race, verify the course, and submit official results. OTRI measures the course, validates the file and scores every finisher.">
      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_320px]">
        <Card>
          <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">HOW IT WORKS</p>
          <ol className="mt-3 space-y-3">
            {[
              ['Account', 'Create an organizer account and confirm your email.'],
              ['Event', 'Name the event and its date — the container for your race distances.'],
              ['Race', 'Add each distance with its official length and climb.'],
              ['Course', 'Upload the GPX. OTRI measures it and shows you how it compares with your official figures.'],
              ['Results & review', 'Upload the results file, check the validation summary, and review everything before it counts.'],
            ].map(([label, text], index) => (
              <li key={label} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-[11px] font-bold text-white">{index + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-[#0b1220]">{label}</p>
                  <p className="text-sm text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs text-slate-500">About 10 minutes with the GPX and results file to hand. You can stop at any step and come back — everything is saved as you go.</p>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="text-sm font-semibold text-[#0b1220]">You will need</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>· The course as a GPX file</li>
              <li>· Official distance and elevation gain</li>
              <li>· Results as CSV/XLSX (rank, time, names, gender, bib)</li>
              <li>· The right to share those results</li>
            </ul>
            <div className="mt-5 grid gap-2">
              <Button onClick={() => navigate('/register')}>Create organizer account</Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </div>
          </Card>
          <p className="text-xs text-slate-500">
            <a className="underline" href={`${DOCS}/docs/methodology/HOW-OTRI-SCORES.md`} target="_blank" rel="noreferrer">How scores are calculated</a>
            {' · '}
            <a className="underline" href={`${DOCS}/DATA_POLICY.md`} target="_blank" rel="noreferrer">Data policy</a>
            {' · '}
            <a className="underline" href={`${DOCS}/PRIVACY.md`} target="_blank" rel="noreferrer">Privacy</a>
          </p>
        </div>
      </div>
    </Page>
  )
}

function AuthCard({ title, intro, children, footer }) {
  return (
    <Page eyebrow="OTRI FOR ORGANIZERS" title={title} intro={intro}>
      <Card className="mt-6 max-w-[460px]">{children}</Card>
      {footer && <p className="mt-4 text-sm text-slate-500">{footer}</p>}
    </Page>
  )
}

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event) {
    event.preventDefault()
    if (tooShort || mismatch) return
    setError(null)
    setBusy(true)
    try {
      await registerOrganizer(email, password)
      navigate(`/check-email?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Create your organizer account" intro="You will confirm your email before adding a race." footer={<>Already have an account? <Link to="/login" className="font-semibold text-blue-600">Sign in</Link></>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Work email" htmlFor="reg-email" hint="We send the verification link and race notifications here.">
          <input id="reg-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="reg-pw" hint={`At least ${MIN_PASSWORD} characters.`} error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : null}>
          <input id="reg-pw" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Confirm password" htmlFor="reg-pw2" error={mismatch ? 'Passwords do not match.' : null}>
          <input id="reg-pw2" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!email || !password || tooShort || mismatch}>
          Create account
        </Button>
        <p className="text-xs text-slate-500">
          By creating an account you confirm you have the right to share the race data you upload. See the{' '}
          <a className="underline" href={`${DOCS}/DATA_POLICY.md`} target="_blank" rel="noreferrer">data policy</a>.
        </p>
      </form>
    </AuthCard>
  )
}

export function CheckEmail({ email }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  async function resend() {
    setBusy(true)
    try {
      await resendVerification(email)
    } finally {
      setBusy(false)
      setSent(true)
    }
  }
  return (
    <AuthCard title="Check your email" intro={`We sent a verification link to ${email || 'your address'}. Open it to activate your account.`}>
      <Notice kind="info" title="Nothing arriving?">
        Check spam, then resend. The link is valid for a limited time.
      </Notice>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" busy={busy} onClick={resend} disabled={!email || sent}>
          {sent ? 'Sent again' : 'Resend link'}
        </Button>
        <Link to="/login" className="text-sm font-semibold text-blue-600">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  )
}

export function Verify({ token }) {
  const [state, setState] = useState(token ? 'checking' : 'missing')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!token) return
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch((err) => {
        setState('error')
        setMessage(err.message)
      })
  }, [token])
  return (
    <AuthCard title="Verifying your email">
      {state === 'checking' && <p className="text-sm text-slate-600">One moment…</p>}
      {state === 'ok' && (
        <>
          <Notice kind="success" title="Your email is verified.">
            You can sign in and add your first event.
          </Notice>
          <Button className="mt-4" onClick={() => navigate('/login')}>
            Sign in
          </Button>
        </>
      )}
      {state === 'missing' && <Notice kind="warning">This link is missing its token. Open the link from your email again.</Notice>}
      {state === 'error' && (
        <>
          <Notice kind="error" title="This link did not work.">
            {message}
          </Notice>
          <p className="mt-3 text-sm text-slate-600">
            Links expire. <Link to="/login" className="font-semibold text-blue-600">Sign in</Link> and request a new one.
          </p>
        </>
      )}
    </AuthCard>
  )
}

export function Login({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setNeedsVerification(false)
    setBusy(true)
    try {
      const result = await loginOrganizer(email, password)
      onSignedIn(result.access_token, result.email)
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err.message)
      if (/verif/i.test(err.message)) setNeedsVerification(true)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    await resendVerification(email)
    setResent(true)
  }

  return (
    <AuthCard title="Sign in" footer={<>New to OTRI? <Link to="/register" className="font-semibold text-blue-600">Create an organizer account</Link></>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Email" htmlFor="login-email">
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="login-pw">
          <input id="login-pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <Notice kind="error">
            {error}
            {needsVerification && (
              <div className="mt-2">
                {resent ? (
                  <span>A new verification link is on its way.</span>
                ) : (
                  <button type="button" onClick={resend} className="font-semibold underline">
                    Resend verification email
                  </button>
                )}
              </div>
            )}
          </Notice>
        )}
        <Button type="submit" busy={busy} disabled={!email || !password}>
          Sign in
        </Button>
        <Link to="/forgot" className="text-sm text-slate-500 underline">
          Forgot your password?
        </Link>
      </form>
    </AuthCard>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await requestPasswordReset(email)
    } finally {
      setBusy(false)
      setSent(true)
    }
  }
  return (
    <AuthCard title="Reset your password" intro="Enter your account email and we will send a link to choose a new password.">
      {sent ? (
        <>
          <Notice kind="success">If that email has an account, a reset link has been sent.</Notice>
          <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-blue-600">
            Back to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Email" htmlFor="forgot-email">
            <input id="forgot-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Button type="submit" busy={busy} disabled={!email}>
            Send reset link
          </Button>
          <Link to="/login" className="text-sm text-slate-500 underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  )
}

export function Reset({ token, onSignedIn }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event) {
    event.preventDefault()
    if (tooShort || mismatch) return
    setError(null)
    setBusy(true)
    try {
      const result = await resetPassword(token, password)
      onSignedIn(result.access_token, result.email)
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthCard title="Choose a new password">
        <Notice kind="warning">This link is missing its token. Open the link from your email again, or <Link to="/forgot" className="font-semibold underline">request a new one</Link>.</Notice>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="New password" htmlFor="reset-pw" hint={`At least ${MIN_PASSWORD} characters.`} error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : null}>
          <input id="reset-pw" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-pw2" error={mismatch ? 'Passwords do not match.' : null}>
          <input id="reset-pw2" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!password || tooShort || mismatch}>
          Set new password and sign in
        </Button>
      </form>
    </AuthCard>
  )
}
