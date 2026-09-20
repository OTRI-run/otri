import './Auth.css'
import { autoFocusOnDesktop } from '../../../src/lib/comfort'
import { useEffect, useState } from 'preact/compat'
import { ArrowRight, ArrowUpRight, Calendar, FileSheet, Mountain, ShieldCheck } from '../../../src/ui/icons'
import { completeTwoFactor, loginOrganizer, registerOrganizer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from '../../apiClient'
import PasswordStrength, { assessPassword } from '../../../src/components/PasswordStrength'
import { Link, navigate } from '../router'
import { hasHandoff } from '../../publishHandoff'
import { Button, Card, CONTAINER, Eyebrow, Field, Gradient, inputClass, Notice, Page, PasswordInput } from '../ui'

const DOCS = 'https://github.com/OTRI-run/otri/blob/main'
const MIN_PASSWORD = 10

const STEPS = [
  [Calendar, 'EVENT', 'Name the event and its date. It holds every race distance.'],
  [Mountain, 'RACE + COURSE', 'Add each distance, then upload its GPX. OTRI measures it and compares it with your official figures.'],
  [FileSheet, 'RESULTS', 'Upload the results file. It is validated first, then every finisher is scored.'],
  [ShieldCheck, 'REVIEW', 'Check the summary and the leaderboard before it counts.'],
]

export function Welcome() {
  return (
    <>
      {/* The start: the pitch on the left, the route in four waypoints on the right. */}
      <section className="section topo section--line-bottom">
        <div className={`${CONTAINER} grid grid--split`}>
          <div className="stack">
            <p className="eyebrow">
              OPEN TRAIL RUNNING INDEX <span className="sep">·</span> FOR ORGANIZERS
            </p>
            <h1 className="display-2">
              Start with
              <br />
              <em className="accent">official results.</em>
            </h1>
            <p className="lead">
              Bring your course file and your results. OTRI measures the course, validates the file and gives every finisher a
              score that depends only on the course and their own time. Free, open, and the whole method is on the record.
            </p>
            <div className="cluster mt-2">
              <Button className="btn--lg" onClick={() => navigate('/register')}>
                Create organizer account <ArrowRight size={18} />
              </Button>
              <Button variant="secondary" className="btn--lg" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </div>
            <p className="small muted measure">
              Rather see your scores first?{' '}
              <a href="../#score" className="link">Score your race without an account</a>, then publish it with one click: the course and the results come along.
            </p>
            <div className="facts mt-2">
              <span>FREE</span>
              <span>OPEN SOURCE</span>
              <span>ABOUT 10 MINUTES</span>
            </div>
          </div>

          <div className="card card--night on-dark auth-flow">
            <div className="auth-flow__head">
              <span className="panel__label">OTRI / ORGANIZERS</span>
              <span className="panel__label auth-flow__live">
                <i aria-hidden="true" />
                FOUR STEPS
              </span>
            </div>
            <div className="auth-flow__intro">
              <small className="panel__label">YOUR RACE, SCORED</small>
              <strong className="h-2 auth-flow__title">
                Course in. Scores out.
              </strong>
              <span className="small muted">Stop at any step and come back. Everything is saved as you go.</span>
            </div>
            <ol className="auth-flow__list">
              {STEPS.map(([Icon, title, desc], index) => (
                <li key={title}>
                  <b className="mono">0{index + 1}</b>
                  <Icon size={16} />
                  <span className="truncate">
                    {title} <small>{desc.split('.')[0].toLowerCase()}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="auth-flow__foot">
              <b>OTRI INDEX</b>
              <span>COURSE + TIME + VERSION = SCORE</span>
            </div>
          </div>
        </div>
      </section>

      {/* 01 · The four steps, in full. */}
      <section className="section section--card">
        <div className={CONTAINER}>
          <div className="grid grid--aside">
            <div className="stack">
              <Eyebrow>01 / HOW IT WORKS</Eyebrow>
              <h2 className="display-2">
                Four steps.
                <br />
                <Gradient>Nothing hidden.</Gradient>
              </h2>
              <p className="lead">
                Every number you see along the way is the same number the score uses: the measured course, the validation
                report, the model version. Nothing happens behind the scenes.
              </p>
            </div>
            <ol className="auth-steps">
              {STEPS.map(([Icon, title, desc], index) => (
                <li key={title}>
                  <b className="waypoint">0{index + 1}</b>
                  <Icon size={18} className="icon--accent" />
                  <div className="min0">
                    <strong className="h-4">{title}</strong>
                    <p className="small muted mt-1">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 02 · What to have to hand. */}
      <section className="section section--quiet section--line-top">
        <div className={CONTAINER}>
          <div className="section-head">
            <span className="waypoint section-head__no">02</span>
            <div className="stack">
              <Eyebrow>WHAT YOU NEED</Eyebrow>
              <h2 className="display-2">
                Four things.
                <br />
                <Gradient>Ten minutes.</Gradient>
              </h2>
            </div>
            <p className="lead">
              Have these to hand and the whole flow takes about ten minutes. You can also stop after any step and finish later.
            </p>
          </div>
          <div className="grid grid--4 grid--flush mt-10">
            {[
              ['COURSE', 'The route as a GPX file', 'From your planner or a clean watch recording, a point at least every 30 m.'],
              ['FIGURES', 'Official distance and climb', 'OTRI shows how they compare with the measured course.'],
              ['RESULTS', 'CSV or XLSX', 'Rank, time, names, gender, bib. Dates of birth only if you may share them.'],
              ['RIGHTS', 'Permission to share', 'Your registration terms cover it; see the data policy.'],
            ].map(([label, title, desc]) => (
              <div key={label} className="auth-need">
                <small className="eyebrow eyebrow--sm">{label}</small>
                <b className="h-4 block mt-2">{title}</b>
                <span className="small muted block mt-1">{desc}</span>
              </div>
            ))}
          </div>
          <div className="cluster cluster--loose mt-8">
            <a className="link link--arrow link--up small" href={`${DOCS}/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`} target="_blank" rel="noreferrer">
              How scores are calculated <ArrowUpRight size={14} />
            </a>
            <a className="link link--arrow link--up small" href={`${DOCS}/DATA_POLICY.md`} target="_blank" rel="noreferrer">
              Data policy <ArrowUpRight size={14} />
            </a>
            <a className="link link--arrow link--up small" href={`${DOCS}/PRIVACY.md`} target="_blank" rel="noreferrer">
              Privacy <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="section section--dark topo--dark">
        <div className={`${CONTAINER} stack`}>
          <p className="eyebrow">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="display-2">
            Give your finishers
            <br />
            <span className="accent">a number that travels.</span>
          </h2>
          <div className="cluster mt-2">
            <button
              onClick={() => navigate('/register')}
              className="btn btn--chalk btn--lg"
            >
              Create organizer account <ArrowRight size={15} />
            </button>
            <a
              className="btn btn--secondary btn--lg"
              href="../#score"
            >
              Score your race first, no account <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

function AuthCard({ title, intro, children, footer, eyebrow = 'FOR ORGANIZERS' }) {
  return (
    <Page
      eyebrow={eyebrow}
      title={title}
      intro={intro}
      aside={
        <>
          {hasHandoff() && (
            <div className="mb-4">
              <Notice kind="success" title="Your scored race is waiting.">
                Sign in from this browser and it becomes a race page in one step, with nothing to upload again.
              </Notice>
            </div>
          )}
          <Card>{children}</Card>
          {footer && <p className="small muted mt-4">{footer}</p>}
        </>
      }
    />
  )
}

export function Register({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [news, setNews] = useState(false)
  const check = assessPassword(password, email)
  const tooShort = password.length > 0 && !check.ok
  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event) {
    event.preventDefault()
    if (tooShort || mismatch || !acceptTerms) return
    setError(null)
    setBusy(true)
    try {
      // The account is signed in straight away: the organizer builds their race now and confirms
      // the address (the link we just emailed) before publishing.
      const result = await registerOrganizer(email, password, { acceptTerms, marketingOptIn: news })
      onSignedIn(result.access_token, result.email, result.is_admin)
      navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      eyebrow="ORGANIZER ACCOUNT"
      title={
        <>
          Create your
          <br />
          <Gradient>organizer account.</Gradient>
        </>
      }
      intro="You can build your race straight away; confirming your email is only needed to make it public. One account can hold every event you organize."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="stack" noValidate>
        <Field label="Work email" htmlFor="reg-email" hint="We send the verification link and race notifications here.">
          <input id="reg-email" autoFocus={autoFocusOnDesktop} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="reg-pw">
          <PasswordInput id="reg-pw" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <PasswordStrength password={password} email={email} />
        </Field>
        <Field label="Confirm password" htmlFor="reg-pw2" error={mismatch ? 'Passwords do not match.' : null}>
          <PasswordInput id="reg-pw2" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        <div className="card card--quiet card--pad-sm stack stack--tight">
          <label className="check">
            <input id="reg-terms" type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              I agree to the{' '}
              <a className="link" href={`${DOCS}/TERMS.md`} target="_blank" rel="noreferrer">
                terms of service
              </a>{' '}
              and the{' '}
              <a className="link" href={`${DOCS}/PRIVACY.md`} target="_blank" rel="noreferrer">
                privacy policy
              </a>
              , and I confirm I may share the race data I upload (
              <a className="link" href={`${DOCS}/DATA_POLICY.md`} target="_blank" rel="noreferrer">
                data policy
              </a>
              ). <span className="muted">Required.</span>
            </span>
          </label>
          <label className="check">
            <input id="reg-news" type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
            <span>
              Email me OTRI news: new features, scoring-model updates, organizer tips. A few times a year, unsubscribe any time in your account settings.{' '}
              <span className="muted">Optional.</span>
            </span>
          </label>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!email || !password || tooShort || mismatch || !acceptTerms}>
          Create account <ArrowRight size={15} />
        </Button>
        {!busy && (!email || !password || tooShort || mismatch || !acceptTerms) && (
          <p className="tiny muted">
            {!email
              ? 'Enter your work email to continue.'
              : !password || tooShort
                ? 'Choose a password of at least 10 characters.'
                : mismatch
                  ? 'The two passwords do not match yet.'
                  : 'Tick the terms box to continue.'}
          </p>
        )}
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
    <AuthCard
      eyebrow="ORGANIZER ACCOUNT"
      title={
        <>
          Check
          <br />
          <Gradient>your email.</Gradient>
        </>
      }
      intro={`We sent a verification link to ${email || 'your address'}. Open it to activate your account.`}
    >
      <Notice kind="info" title="Nothing arriving?">
        Check spam, then resend. The link is valid for a limited time.
      </Notice>
      <div className="cluster mt-4">
        <Button variant="secondary" busy={busy} onClick={resend} disabled={!email || sent}>
          {sent ? 'Sent again' : 'Resend link'}
        </Button>
        <Link to="/login" className="link small">
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
    <AuthCard
      eyebrow="ORGANIZER ACCOUNT"
      title={
        <>
          Verifying
          <br />
          <Gradient>your email.</Gradient>
        </>
      }
    >
      {state === 'checking' && <p className="small muted">One moment…</p>}
      {state === 'ok' && (
        <>
          <Notice kind="success" title="Your email is confirmed.">
            You can publish your races now.
          </Notice>
          <Button className="mt-4" onClick={() => navigate('/')}>
            Continue <ArrowRight size={15} />
          </Button>
        </>
      )}
      {state === 'missing' && <Notice kind="warning">This link is missing its token. Open the link from your email again.</Notice>}
      {state === 'error' && (
        <>
          <Notice kind="error" title="This link did not work.">
            {message}
          </Notice>
          <p className="small muted mt-3">
            Links expire.{' '}
            <Link to="/login" className="link">
              Sign in
            </Link>{' '}
            and request a new one.
          </p>
        </>
      )}
    </AuthCard>
  )
}

export function Login({ onSignedIn, afterReset = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [remember, setRemember] = useState(true)
  const [challenge, setChallenge] = useState(null) // { challenge, method }
  const [code, setCode] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setNeedsVerification(false)
    setBusy(true)
    try {
      const result = await loginOrganizer(email, password, remember)
      if (result.requires_2fa) {
        setChallenge({ challenge: result.challenge, method: result.method })
        return
      }
      onSignedIn(result.access_token, result.email, result.is_admin)
      navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
    } catch (err) {
      setError(/invalid email or password/i.test(err.message) ? 'That email and password do not match. Check both, or use “Forgot your password?” below.' : err.message)
      if (/verif/i.test(err.message)) setNeedsVerification(true)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    await resendVerification(email)
    setResent(true)
  }

  async function submitCode(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await completeTwoFactor(challenge.challenge, code)
      onSignedIn(result.access_token, result.email, result.is_admin)
      navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <AuthCard
        eyebrow="SECOND STEP"
        title={
          <>
            One more
            <br />
            <Gradient>code.</Gradient>
          </>
        }
        intro={challenge.method === 'email' ? `We emailed a 6-digit code to ${email}. It expires in 10 minutes.` : 'Enter the 6-digit code from your authenticator app.'}
        footer={
          <>
            Lost your device? Enter one of your recovery codes instead.{' '}
            <button type="button" onClick={() => { setChallenge(null); setCode('') }} className="link">
              Start over
            </button>
          </>
        }
      >
        <form onSubmit={submitCode} className="stack" noValidate>
          <Field label="Code" htmlFor="login-code">
            <input id="login-code" autoFocus inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} input--mono auth-code`} />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" busy={busy} disabled={code.trim().length < 6}>
            Sign in <ArrowRight size={15} />
          </Button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={
        <>
          Welcome
          <br />
          <Gradient>back.</Gradient>
        </>
      }
      intro="Sign in to add events, upload courses and score results."
      footer={
        <>
          New to OTRI?{' '}
          <Link to="/register" className="link">
            Create an organizer account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="stack" noValidate>
        {afterReset && <Notice kind="success" title="Your password is changed.">Sign in with it; you will be asked for your code as usual. Every other session of this account was signed out.</Notice>}
        <Field label="Email" htmlFor="login-email">
          <input id="login-email" autoFocus={autoFocusOnDesktop} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="login-pw">
          <PasswordInput id="login-pw" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <Notice kind="error">
            {error}
            {needsVerification && (
              <div className="mt-2">
                {resent ? (
                  <span>A new verification link is on its way.</span>
                ) : (
                  <button type="button" onClick={resend} className="link">
                    Resend verification email
                  </button>
                )}
              </div>
            )}
          </Notice>
        )}
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me on this device for 30 days
        </label>
        <Button type="submit" busy={busy} disabled={!email || !password}>
          Sign in <ArrowRight size={15} />
        </Button>
        <Link to="/forgot" className="link small">
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
    <AuthCard
      title={
        <>
          Reset your
          <br />
          <Gradient>password.</Gradient>
        </>
      }
      intro="Enter your account email and we will send a link to choose a new password."
    >
      {sent ? (
        <>
          <Notice kind="success">If that email has an account, a reset link has been sent.</Notice>
          <Link to="/login" className="link small block mt-4">
            Back to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="stack" noValidate>
          <Field label="Email" htmlFor="forgot-email">
            <input id="forgot-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Button type="submit" busy={busy} disabled={!email}>
            Send reset link
          </Button>
          <Link to="/login" className="link small">
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
  const tooShort = password.length > 0 && !assessPassword(password).ok
  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event) {
    event.preventDefault()
    if (tooShort || mismatch) return
    setError(null)
    setBusy(true)
    try {
      const result = await resetPassword(token, password)
      if (result.requires_2fa) {
        // A reset link is not a second factor: the password is changed, the sign-in asks for the code.
        navigate('/login?reset=1', { replace: true })
        return
      }
      onSignedIn(result.access_token, result.email, result.is_admin)
      navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const title = (
    <>
      Choose a
      <br />
      <Gradient>new password.</Gradient>
    </>
  )

  if (!token) {
    return (
      <AuthCard title={title}>
        <Notice kind="warning">
          This link is missing its token. Open the link from your email again, or{' '}
          <Link to="/forgot" className="link">
            request a new one
          </Link>
          .
        </Notice>
      </AuthCard>
    )
  }
  return (
    <AuthCard title={title}>
      <form onSubmit={submit} className="stack" noValidate>
        <Field label="New password" htmlFor="reset-pw">
          <PasswordInput id="reset-pw" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <PasswordStrength password={password} />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-pw2" error={mismatch ? 'Passwords do not match.' : null}>
          <PasswordInput id="reset-pw2" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!password || tooShort || mismatch}>
          Set new password and sign in
        </Button>
      </form>
    </AuthCard>
  )
}
