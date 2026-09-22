import { autoFocusOnDesktop } from '../../../src/lib/comfort'
import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, CalendarDays, FileSpreadsheet, Mail, Mountain, ShieldCheck } from 'lucide-react'
import { completeTwoFactor, fetchPendingGoogleAddress, getAuthProviders, googleStartUrl, loginOrganizer, registerOrganizer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from '../../apiClient'
import PasswordStrength, { assessPassword } from '../../../src/components/PasswordStrength'
import { Link, navigate } from '../router'
import { hasHandoff } from '../../publishHandoff'
import { Button, Card, CONTAINER, Eyebrow, Field, Gradient, inputClass, Notice, Page, PasswordInput } from '../ui'

const DOCS = 'https://github.com/OTRI-run/otri/blob/main'
const MIN_PASSWORD = 10

// --- Sign in with Google -------------------------------------------------------------------
//
// The button is a link to the API, which runs the whole OpenID Connect flow and lands back on
// the login page with the session cookie set (see api/oauth_google.py). Nothing from Google is
// loaded on this page.

let providersPromise = null
/** Which outside sign-ins the API offers, asked once per page load. */
function useProviders() {
  const [providers, setProviders] = useState({ google: false })
  useEffect(() => {
    providersPromise = providersPromise || getAuthProviders()
    let live = true
    providersPromise.then((found) => live && setProviders(found || { google: false }))
    return () => {
      live = false
    }
  }, [])
  return providers
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

/** "Continue with Google". Shown only when the API says Google is configured. On the register
 *  page the terms are accepted by continuing, and the line under the button says so. */
function GoogleButton({ intent, acceptTerms = false, marketingOptIn = false, remember = false, hint = null, label = 'Continue with Google', divider = true }) {
  const providers = useProviders()
  if (!providers.google) return null
  const classes =
    'inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 text-[14px] font-semibold text-[#0b1220] no-underline transition hover:border-blue-300'
  return (
    <div className="grid gap-2">
      {divider && (
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.12em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}
      <a href={googleStartUrl({ intent, acceptTerms, marketingOptIn, remember })} className={classes}>
        <GoogleMark /> {label}
      </a>
      {hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  )
}

/** The line under the buttons. Continuing is what agrees to these, which is how the rest of the
 *  web does it and is valid acceptance as long as the documents are right there. */
function TermsLine() {
  return (
    <p className="text-center text-xs leading-5 text-slate-500">
      By continuing you agree to our{' '}
      <a className="font-semibold text-blue-600 no-underline hover:underline" href="/terms/" target="_blank" rel="noreferrer">
        terms of service
      </a>{' '}
      and{' '}
      <a className="font-semibold text-blue-600 no-underline hover:underline" href="/privacy/" target="_blank" rel="noreferrer">
        privacy policy
      </a>
      , and confirm you may share the race data you upload.
    </p>
  )
}

// What the login page says for each way the API can send the browser back without a session.
const GOOGLE_FAILURE = {
  denied: 'Google did not complete the sign-in. You can try again.',
  expired: 'That sign-in took too long, or was already used. Start it again.',
  'link-expired': 'That link had already been used, or it has expired. Start the sign-in again and we will send another.',
  mismatch: 'That sign-in was started in a different browser. Start it again here.',
  unverified: 'Google has not verified the email address on that account, so it cannot be used to sign in here.',
  exchange: 'Google did not accept the sign-in. Try again in a moment.',
  token: 'The sign-in from Google could not be verified. Try again.',
}

const STEPS = [
  [CalendarDays, 'EVENT', 'Name the event and its date. It holds every race distance.'],
  [Mountain, 'RACE + COURSE', 'Add each distance, then upload its GPX. OTRI measures it and compares it with your official figures.'],
  [FileSpreadsheet, 'RESULTS', 'Upload the results file. It is validated first, then every finisher is scored.'],
  [ShieldCheck, 'REVIEW', 'Check the summary and the leaderboard before it counts.'],
]

export function Welcome({ onSignedIn }) {
  return (
    <>
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_78%_28%,rgba(37,99,235,.12),transparent_30%),linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} grid min-w-0 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-24`}>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
              OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> FOR ORGANIZERS
            </div>
            <h1 className="mt-5 max-w-[760px] text-[clamp(40px,6.5vw,76px)] font-bold leading-[1.06] tracking-[-.065em] text-[#0b1220]">
              Start with
              <br />
              <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">official results.</em>
            </h1>
            <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-slate-500 sm:text-[17px]">
              Bring your course file and your results. OTRI measures the course, validates the file and gives every finisher a
              score that depends only on the course and their own time. Free, open, and the whole method is on the record.
            </p>
            <p className="mt-4 max-w-[620px] text-sm leading-6 text-slate-600">
              Rather see your scores first?{' '}
              <a href="../#score" className="font-semibold text-blue-600 no-underline hover:underline">Score your race without an account</a>, then publish it with one click: the course and the results come along.
            </p>
            <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[8px] tracking-[.08em] text-slate-500 sm:text-[9px]">
              <span className="text-blue-600">FREE</span>
              <span>OPEN SOURCE</span>
              <span>ABOUT 10 MINUTES</span>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(11,18,32,.10)] sm:p-6">
            <h2 className="font-mono text-[10px] tracking-[.08em] text-slate-500">CREATE YOUR ORGANIZER ACCOUNT</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Free, and you can build your race straight away — confirming your email is only needed to make it public.
            </p>
            <div className="mt-4">
              <SignupForm onSignedIn={onSignedIn} idPrefix="hero" />
            </div>
            <p className="mt-4 text-center text-[13px] text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-blue-600">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
            <div className="min-w-0">
              <Eyebrow>01 / HOW IT WORKS</Eyebrow>
              <h2 className="mt-3 text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
                Four steps.
                <br />
                <Gradient>Nothing hidden.</Gradient>
              </h2>
              <p className="mt-5 max-w-[440px] text-sm leading-7 text-slate-500">
                Every number you see along the way is the same number the score uses: the measured course, the validation
                report, the model version. Nothing happens behind the scenes.
              </p>
            </div>
            <div className="min-w-0 border-t border-slate-400/70">
              {STEPS.map(([Icon, title, desc], index) => (
                <div key={title} className="grid min-w-0 grid-cols-[30px_22px_minmax(0,1fr)] items-start gap-3 border-b border-slate-300 py-4">
                  <b className="pt-0.5 font-mono text-[9px] text-slate-400">0{index + 1}</b>
                  <Icon size={16} className="mt-0.5 text-blue-600" />
                  <div className="min-w-0">
                    <strong className="text-[13px] text-[#0b1220]">{title}</strong>
                    <p className="mt-0.5 text-sm leading-6 text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
            <div className="font-mono text-xs text-blue-600">02</div>
            <div className="min-w-0">
              <Eyebrow className="mb-3">WHAT YOU NEED</Eyebrow>
              <h2 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
                Four things.
                <br />
                <Gradient>That is all.</Gradient>
              </h2>
            </div>
            <p className="min-w-0 text-sm leading-7 text-slate-500">
              Have these to hand and the flow goes quickly. You can also stop after any step and finish later.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 border-y border-slate-300 lg:grid-cols-4">
            {[
              ['COURSE', 'The route as a GPX file', 'From your planner or a clean watch recording, a point at least every 30 m.'],
              ['FIGURES', 'Official distance and climb', 'OTRI shows how they compare with the measured course.'],
              ['RESULTS', 'CSV or XLSX', 'Rank, time, names, gender, bib. Dates of birth only if you may share them.'],
              ['RIGHTS', 'Permission to share', 'Your registration terms cover it; see the data policy.'],
            ].map(([label, title, desc], index) => (
              <div key={label} className={`min-w-0 px-2 py-5 sm:px-5 ${index % 2 === 1 ? 'border-l border-slate-300' : ''} ${index >= 2 ? 'border-t border-slate-300 lg:border-t-0' : ''} ${index === 2 ? 'lg:border-l' : ''}`}>
                <small className="font-mono text-[9px] tracking-[.08em] text-blue-600">{label}</small>
                <b className="mt-2 block text-lg font-bold leading-tight tracking-[-.03em] text-[#0b1220]">{title}</b>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-blue-600">
            <a className="inline-flex items-center gap-1 no-underline hover:underline" href={`${DOCS}/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`} target="_blank" rel="noreferrer">
              How scores are calculated <ArrowUpRight size={12} />
            </a>
            <a className="inline-flex items-center gap-1 no-underline hover:underline" href="/data-policy/" target="_blank" rel="noreferrer">
              Data policy <ArrowUpRight size={12} />
            </a>
            <a className="inline-flex items-center gap-1 no-underline hover:underline" href="/privacy/" target="_blank" rel="noreferrer">
              Privacy <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(115deg,#1d4ed8_0%,#2563eb_48%,#0891b2_100%)] py-14 text-white sm:py-16">
        <div className={`${CONTAINER} flex flex-col items-start`}>
          <p className="font-mono text-[10px] tracking-[.08em] text-blue-100">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="mt-2 text-[clamp(40px,5.8vw,70px)] font-bold leading-[.94] tracking-[-.065em]">
            Give your finishers
            <br />
            <span>a number that travels.</span>
          </h2>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => navigate('/register')}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-blue-600 shadow-[0_10px_30px_rgba(0,0,0,.12)]"
            >
              Create organizer account <ArrowRight size={15} />
            </button>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:bg-white/10"
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
          {footer && <p className="mt-4 text-sm text-slate-500">{footer}</p>}
        </>
      }
    />
  )
}

/** The sign-up form itself, so a page can carry it rather than link to one.
 *
 *  Arriving at the organizer site used to mean: read the page, press "Create organizer account",
 *  then choose Google or email on the next page, and only then reach a form -- three presses
 *  before you could start typing. Both ways in are on the first page now, and /register keeps the
 *  same form for anyone who arrives there directly or comes back from Google without an account.
 */
export function SignupForm({ onSignedIn, initialEmail = '', autoFocus = false, idPrefix = 'reg' }) {
  const providers = useProviders()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [news, setNews] = useState(false)
  const check = assessPassword(password, email)
  const tooShort = password.length > 0 && !check.ok
  const mismatch = confirm.length > 0 && confirm !== password
  // The two ways in are the first thing, and the password fields wait behind the second of them.
  // Reading past three fields to find the one-press way in put the quicker road behind the slower
  // one; this keeps both in sight and asks for typing only from whoever chose to type. It opens in
  // place, so choosing email is not a second page.
  const [showEmail, setShowEmail] = useState(Boolean(initialEmail))

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail)
      setShowEmail(true) // they arrived from a Google sign-in with no account: their address is known
    }
  }, [initialEmail])

  async function submit(event) {
    event.preventDefault()
    if (tooShort || mismatch) return
    setError(null)
    setBusy(true)
    try {
      // The account is signed in straight away: the organizer builds their race now and confirms
      // the address (the link we just emailed) before publishing.
      const result = await registerOrganizer(email, password, { acceptTerms: true, marketingOptIn: news })
      onSignedIn(result.access_token, result.email, result.is_admin)
      navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <GoogleButton intent="register" acceptTerms marketingOptIn={news} label="Sign up with Google" divider={false} />
      {!showEmail && (
        <>
          <Button type="button" onClick={() => setShowEmail(true)} className="min-h-12 text-[14px]">
            <Mail size={15} /> Sign up with email
          </Button>
          <TermsLine />
        </>
      )}
      {showEmail && (
        <>
      {/* Only when there is something to be "or" from: this deployment may have no Google client
          configured, and then the button above renders nothing. */}
      {providers.google && (
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">
          <span className="h-px flex-1 bg-slate-200" />
          or with an email
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}
      <Field label="Email" htmlFor={`${idPrefix}-email`} hint="We send the verification link and race notifications here.">
        <input id={`${idPrefix}-email`} autoFocus={autoFocus && autoFocusOnDesktop} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password" htmlFor={`${idPrefix}-pw`}>
        <PasswordInput id={`${idPrefix}-pw`} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        <PasswordStrength password={password} email={email} />
      </Field>
      <Field label="Confirm password" htmlFor={`${idPrefix}-pw2`} error={mismatch ? 'Passwords do not match.' : null}>
        <PasswordInput id={`${idPrefix}-pw2`} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-2 rounded-xl bg-slate-50 px-4 py-3">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input id={`${idPrefix}-news`} type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
          <span>
            Email me OTRI news: new features, scoring-model updates, organizer tips. A few times a year, unsubscribe any time in your account settings.{' '}
            <span className="text-slate-500">Optional.</span>
          </span>
        </label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" busy={busy} disabled={!email || !password || tooShort || mismatch}>
        Create account <ArrowRight size={15} />
      </Button>
      {!busy && (!email || !password || tooShort || mismatch) && (
        <p className="text-xs text-slate-500">
          {!email
            ? 'Enter your email to continue.'
            : !password || tooShort
              ? 'Choose a password of at least 10 characters.'
              : 'The two passwords do not match yet.'}
        </p>
      )}
      <TermsLine />
        </>
      )}
    </form>
  )
}

export function Register({ onSignedIn, query = {} }) {
  // A visitor sent here by a Google sign-in that found no account has already chosen, so the form
  // opens with their address in it. The address comes from a one-read cookie rather than the URL,
  // which is why it arrives a moment after the page does.
  const [fromGoogle, setFromGoogle] = useState('')

  useEffect(() => {
    if (query.google !== 'no-account') return
    let live = true
    fetchPendingGoogleAddress().then((address) => {
      if (live && address) setFromGoogle(address)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <Link to="/login" className="font-semibold text-blue-600">
            Sign in
          </Link>
        </>
      }
    >
      {query.google === 'no-account' && (
        <div className="mb-4">
          <Notice kind="info" title="No OTRI account for that Google address yet.">
            Create one here: continue with Google again, or choose a password instead.
          </Notice>
        </div>
      )}
      <SignupForm onSignedIn={onSignedIn} initialEmail={fromGoogle} autoFocus />
    </AuthCard>
  )
}


export function CheckEmail({ email }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function resend() {
    setBusy(true)
    setError(null)
    try {
      await resendVerification(email)
      setSent(true)
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
      {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
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
      {state === 'checking' && <p className="text-sm text-slate-600">One moment…</p>}
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
          <p className="mt-3 text-sm text-slate-600">
            Links expire.{' '}
            <Link to="/login" className="font-semibold text-blue-600">
              Sign in
            </Link>{' '}
            and request a new one.
          </p>
        </>
      )}
    </AuthCard>
  )
}

export function Login({ onSignedIn, afterReset = false, sessionEnded = false, query = {} }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [remember, setRemember] = useState(true)
  const [challenge, setChallenge] = useState(null) // { challenge, method }
  const [code, setCode] = useState('')

  // Google sends the browser back here (see api/app.py google_callback) signed in, needing this
  // account's second factor, waiting on a link we emailed, or not signed in with a reason.
  useEffect(() => {
    if (query.google === 'ok') {
      // The cookie is already set. Tell the app a sign-in exists and go to the welcome page, whose
      // rule for signed-in visitors takes them on to their events (or to publish a waiting race)
      // once the session is applied; the app asks /auth/me who is signed in, as for a returning
      // visitor. Not straight to /events: the app's guard runs in this same render, would see the
      // new address with the session not yet applied, and would bounce back here. And no reload:
      // a reload racing the hash change left some browsers on this address with nothing drawn.
      onSignedIn('', '', false)
      navigate('/', { replace: true })
    } else if (query.challenge) {
      setChallenge({ challenge: query.challenge, method: query.method || 'totp' })
      // A Google sign-in reaches this screen with no address typed, so the page used to read
      // "We emailed a 6-digit code to ." The address comes back from the API, not the URL.
      if ((query.method || 'totp') === 'email') fetchPendingGoogleAddress().then((a) => a && setEmail(a))
      // a challenge is used once; it should not stay in the address bar or the history
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/login`)
    } else if (query.google === 'confirm-link') {
      fetchPendingGoogleAddress().then((a) => a && setEmail(a))
    } else if (query.google === 'failed') {
      setError(GOOGLE_FAILURE[query.reason] || 'Signing in with Google did not work. Try again, or use your password.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError(null)
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
    } finally {
      setBusy(false)
    }
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
            <button type="button" onClick={() => { setChallenge(null); setCode('') }} className="font-semibold text-blue-600">
              Start over
            </button>
          </>
        }
      >
        <form onSubmit={submitCode} className="grid gap-4" noValidate>
          <Field label="Code" htmlFor="login-code">
            <input id="login-code" autoFocus inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono tracking-[.3em]`} />
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
          <Link to="/register" className="font-semibold text-blue-600">
            Create an organizer account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {afterReset && <Notice kind="success" title="Your password is changed.">Sign in with it; you will be asked for your code as usual. Every other session of this account was signed out.</Notice>}
        {sessionEnded && (
          <Notice kind="info" title="You were signed out.">
            That can happen when a session expires, or when the password, two-factor sign-in or "sign out everywhere" is used
            somewhere else. Sign in again to carry on; nothing you saved is lost.
          </Notice>
        )}
        {query.google === 'confirm-link' && (
          <Notice kind="info" title="Check your email to connect Google.">
            An OTRI account already uses {email || 'that address'}. Google told us the address was checked, but it does not run that mailbox, so
            we have sent a link there. Open it and the two are connected. Until then nothing about the account has changed.
          </Notice>
        )}
        {query.google === 'connected' && (
          <Notice kind="success" title="Your Google account is connected.">
            Press “Continue with Google” below to sign in.
          </Notice>
        )}
        <Field label="Email" htmlFor="login-email">
          <input id="login-email" autoFocus={autoFocusOnDesktop} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="login-pw">
          <PasswordInput id="login-pw" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {/* No "resend verification" here: signing in with an unconfirmed address succeeds by
            design, so this form never sees that failure. The amber bar above the signed-in app is
            where an unconfirmed organizer is offered the link again. */}
        {error && <Notice kind="error">{error}</Notice>}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Remember me on this device for 30 days
        </label>
        <Button type="submit" busy={busy} disabled={!email || !password}>
          Sign in <ArrowRight size={15} />
        </Button>
        <Link to="/forgot" className="text-sm text-slate-500 underline">
          Forgot your password?
        </Link>
        <GoogleButton intent="login" remember={remember} />
      </form>
    </AuthCard>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
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
          <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-blue-600">
            Back to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <Notice kind="error">{error}</Notice>}
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
          <Link to="/forgot" className="font-semibold underline">
            request a new one
          </Link>
          .
        </Notice>
      </AuthCard>
    )
  }
  return (
    <AuthCard title={title}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="New password" htmlFor="reset-pw">
          <PasswordInput id="reset-pw" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <PasswordStrength password={password} />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-pw2" error={mismatch ? 'Passwords do not match.' : null}>
          <PasswordInput id="reset-pw2" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <Notice kind="error">
            {error}
            {/* A reset link lives an hour, and dies early whenever the password changes or
                two-factor is touched, so this is easy to reach -- and it used to be a dead end
                with no way on from it. */}
            <span className="mt-2 block">
              <Link to="/forgot" className="font-semibold underline">
                Request a new link
              </Link>
              {', or '}
              <Link to="/login" className="font-semibold underline">
                go back to sign in
              </Link>
              .
            </span>
          </Notice>
        )}
        <Button type="submit" busy={busy} disabled={!password || tooShort || mismatch}>
          Set new password and sign in
        </Button>
      </form>
    </AuthCard>
  )
}
