import BackToTop from '../../src/components/BackToTop'
import { installDropGuard, installScrollMemory, installSearchShortcut } from '../../src/lib/comfort'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, ChevronDown, Mail } from 'lucide-react'
import '../../src/styles.css'
import Logo from '../../src/components/Logo'
import GitHubMark from '../../src/components/GitHubMark'
import UnitsMenu from '../../src/components/UnitsMenu'
import { logoutOrganizer, getMe, resendVerification, whenSessionEnds } from '../apiClient'
import BuildBanner from '../../src/components/BuildBanner'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import Gate from '../../src/components/Gate'
import Maintenance from '../../src/components/Maintenance'
import { initMonitoring } from '../../src/lib/monitoring'
import { countPages } from '../../src/lib/analytics'
import { useDocumentTitle } from '../../src/lib/title'
import SharedNotFound from '../../src/components/NotFound'
import { AccountPage } from './pages/Account'
import { AdminEvents } from './pages/Admin'
import PublishScoredRace from './pages/Publish'
import { forgetExpiredHandoff, hasHandoff } from '../publishHandoff'
import { CheckEmail, Forgot, Login, Register, Reset, Verify, Welcome } from './pages/Auth'
import { Dashboard, EventPage, NewEvent } from './pages/Events'
import { CourseStep, NewRace, ResultsStep, ReviewStep } from './pages/Race'
import { Link, match, navigate, useRoute } from './router'
import { clearSession, readSession, writeSession } from './session'
import { CONTAINER } from './ui'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'

function initialOf(email) {
  return (email || '?').trim().charAt(0).toUpperCase()
}

// Account menu: avatar + chevron opens email, role, the app's pages and Sign out. Keeps the
// header to five things: logo, badge, Your events, Admin, and this.
function AccountMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const item = 'block rounded-lg px-3 py-2 text-sm text-[#0b1220] no-underline hover:bg-slate-50'
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-1 pl-1 pr-2 hover:border-blue-300"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold text-white ${session.isAdmin ? 'bg-amber-500' : 'bg-blue-600'}`}>
          {initialOf(session.email)}
        </span>
        <ChevronDown size={13} className={`text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,.14)]">
          <div className="px-3 py-2">
            <p className="truncate font-mono text-xs text-[#0b1220]" title={session.email}>
              {session.email}
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[9px] tracking-[.08em] text-slate-500">
              ORGANIZER
              {session.isAdmin && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-bold text-white">ADMIN</span>}
            </p>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <Link to="/events" className={item} onClick={() => setOpen(false)}>
            Your events
          </Link>
          <Link to="/account" className={item} onClick={() => setOpen(false)}>
            Account settings
          </Link>
          {session.isAdmin && (
            <Link to="/admin" className={item} onClick={() => setOpen(false)}>
              Admin dashboard
            </Link>
          )}
          <a href="../#home" className={item}>
            Public site ↗
          </a>
          <a href={GITHUB_URL} className={item}>
            GitHub ↗
          </a>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={onSignOut} className={`${item} w-full text-left`}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Header({ session, onSignOut, onLogin = false }) {
  return (
    <>
      <header className="sticky top-0 z-50 h-[68px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className={`${CONTAINER} flex h-full min-w-0 items-center gap-4`}>
          <Logo href="../#home" />
          <Link
            to="/"
            className="hidden shrink-0 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[9px] font-medium tracking-[.08em] text-blue-600 no-underline sm:flex"
          >
            <i className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_0_3px_#dbeafe]" />
            FOR ORGANIZERS
          </Link>
          <nav className="ml-auto flex shrink-0 items-center gap-3 sm:gap-5">
            {session && (
              <Link to="/events" className="hidden text-[13px] font-semibold text-[#0b1220] no-underline md:inline">
                Your events
              </Link>
            )}
            {session?.isAdmin && (
              <Link
                to="/admin"
                className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[9px] tracking-[.08em] text-amber-700 no-underline md:inline-flex"
              >
                ADMIN
              </Link>
            )}
            <a href="../#home" className="hidden items-center gap-1 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-950 lg:inline-flex">
              Public site <ArrowUpRight size={13} />
            </a>
            <span className="hidden sm:block">
              <UnitsMenu compact />
            </span>
            {session ? (
              <AccountMenu session={session} onSignOut={onSignOut} />
            ) : onLogin ? (
              <Link to="/register" className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white no-underline hover:bg-blue-700">
                Create account
              </Link>
            ) : (
              <Link to="/login" className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white no-underline hover:bg-blue-700">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      {/* Small screens: the app's pages in their own row. */}
      <div className="border-b border-slate-200 bg-white md:hidden">
        <div className={`${CONTAINER} flex items-center gap-5`}>
          {session ? (
            <Link to="/events" className="py-3 text-[13px] font-semibold text-[#0b1220] no-underline">
              Your events
            </Link>
          ) : (
            <Link to="/" className="py-3 text-[13px] font-semibold text-[#0b1220] no-underline">
              For organizers
            </Link>
          )}
          {session?.isAdmin && (
            <Link to="/admin" className="py-3 font-mono text-[9px] tracking-[.08em] text-amber-700 no-underline">
              ADMIN
            </Link>
          )}
          <a href="../#home" className="py-3 text-[13px] font-medium text-slate-500 no-underline">
            Public site
          </a>
          <div className="ml-auto py-1.5 sm:hidden">
            <UnitsMenu />
          </div>
        </div>
      </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6">
      <div className={`${CONTAINER} flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center`}>
        <Logo href="../#home" />
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-slate-500">
          <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 font-semibold text-[#0b1220] no-underline hover:text-blue-600">
            <GitHubMark size={15} />
            GitHub
          </a>
          <a href="mailto:hello@otri.run" className="inline-flex items-center gap-1.5 no-underline hover:text-blue-600">
            <Mail size={14} />
            hello@otri.run
          </a>
        </nav>
        <span className="font-mono text-[8px] tracking-[.08em] text-slate-500">OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT</span>
      </div>
    </footer>
  )
}

initMonitoring()
countPages()

function organizerTitle(path) {
  if (path.startsWith('/publish')) return 'Publish your scored race · OTRI organizers'
  if (path.startsWith('/login')) return 'Sign in · OTRI organizers'
  if (path.startsWith('/register')) return 'Create account · OTRI organizers'
  if (path.startsWith('/forgot') || path.startsWith('/reset')) return 'Reset password · OTRI organizers'
  if (path.startsWith('/verify') || path.startsWith('/check-email')) return 'Verify email · OTRI organizers'
  if (path.startsWith('/account')) return 'Account settings · OTRI organizers'
  if (path.startsWith('/admin')) return 'Admin · OTRI organizers'
  if (path.startsWith('/events/new')) return 'New event · OTRI organizers'
  if (path.startsWith('/events/')) return 'Event · OTRI organizers'
  if (path.startsWith('/events')) return 'Your events · OTRI organizers'
  if (path.startsWith('/races/')) return 'Race · OTRI organizers'
  return 'OTRI for organizers'
}

function App() {
  const route = useRoute()
  useDocumentTitle(organizerTitle(route.path))
  const [session, setSession] = useState(() => readSession())
  const [sessionEnded, setSessionEnded] = useState(false)

  // A scored race left in this browser is deleted after a day, whoever opens OTRI next. It used to
  // be deleted only by the code that reads it, so a visitor who never came back to /publish kept
  // the results file -- with every finisher's name in it -- indefinitely.
  useEffect(() => {
    forgetExpiredHandoff()
  }, [])

  function signIn(token, email, isAdmin = false) {
    writeSession()
    setSession({ token, email, isAdmin, pending: false })
  }
  // Signing out is the server ending the session, not the app forgetting it. The session lives in
  // an HttpOnly cookie that no page script can clear, so if the request does not arrive the
  // account is still open -- and the app used to look signed out anyway. Somebody on a shared
  // computer would walk away from a live session. Now it waits for the answer and says so if it
  // did not come.
  const [signOutFailed, setSignOutFailed] = useState(null)
  async function signOut() {
    setSignOutFailed(null)
    try {
      await logoutOrganizer()
    } catch (err) {
      // A session that was already gone is a sign-out that succeeded.
      if (err?.status !== 401) {
        setSignOutFailed(err.message)
        return
      }
    }
    clearSession()
    setSession(null)
    navigate('/', { replace: true })
  }

  // Signed-out visitors hitting an authenticated route go to sign-in; signed-in visitors on the
  // welcome page go straight to their events.
  // Admin/demo flags can change server-side; refresh them for a stored session.
  // Who is signed in comes from the API, never from storage: on load (and after each sign-in) ask
  // /auth/me and fill in the email and admin flag.
  const signedIn = Boolean(session)
  useEffect(() => {
    if (!signedIn) return
    getMe('')
      .then((me) => {
        setSession((current) => (current ? { ...current, email: me.email, isAdmin: me.is_admin, emailVerified: me.email_verified, pending: false } : current))
      })
      .catch((err) => {
        // The cookie expired or was revoked (sign out everywhere, password change elsewhere):
        // forget the remembered sign-in instead of showing a header for a dead session.
        if (err?.status === 401) {
          clearSession()
          setSession(null)
        }
      })
  }, [signedIn])

  // Any call, anywhere in the app, that comes back 401 means this session is over. Say so once and
  // offer the way back, instead of leaving a signed-in header above a screen that cannot do
  // anything. Reachable by the organizer's own actions: changing the password, turning two-factor
  // on, or signing out everywhere in another tab all revoke every token the account has.
  useEffect(() => {
    whenSessionEnds(() => {
      clearSession()
      setSession(null)
      setSessionEnded(true)
      if (/^#\/(events|races|admin|account)/.test(window.location.hash)) navigate('/login', { replace: true })
    })
    return () => whenSessionEnds(null)
  }, [])

  const needsAuth = /^\/(events|races|admin|account)/.test(route.path)
  useEffect(() => {
    // Read the live hash, not the rendered route: signing out navigates to '/' and clears the
    // session in the same tick, and the render in between still carries the old route.
    const liveNeedsAuth = /^#\/(events|races|admin|account)/.test(window.location.hash)
    if (liveNeedsAuth && !session) navigate('/login', { replace: true })
    // A race scored on the public site may be waiting to become a race page (publishHandoff.js).
    if (route.path === '/' && session) navigate(hasHandoff() ? '/publish' : '/events', { replace: true })
  }, [route.path, needsAuth, session])

  // The confirmation link may be opened in another tab: ask again when this one gets the focus back.
  const unconfirmed = session?.emailVerified === false
  useEffect(() => {
    if (!unconfirmed) return undefined
    const refresh = () => getMe('').then((me) => setSession((current) => (current ? { ...current, emailVerified: me.email_verified } : current))).catch(() => {})
    // On focus, for the usual case: the link was opened in another tab. And on every route change,
    // for the case it missed -- confirming in this tab and pressing Continue is an in-app hash
    // navigation, which fires no focus event, so the amber "confirm your email" bar stayed up
    // contradicting the success the visitor had just been shown.
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [unconfirmed, route.path])

  let page = null
  let params
  if (route.path === '/') page = session ? null : <Welcome onSignedIn={signIn} />
  else if (route.path === '/publish') page = <PublishScoredRace session={session} />
  else if (route.path === '/register') page = <Register onSignedIn={signIn} query={route.query} />
  else if (route.path === '/login') page = <Login onSignedIn={signIn} afterReset={Boolean(route.query?.reset)} sessionEnded={sessionEnded} query={route.query} />
  else if (route.path === '/forgot') page = <Forgot />
  else if (route.path === '/check-email') page = <CheckEmail email={route.query.email} />
  else if (route.path === '/verify') page = <Verify token={route.query.token} />
  else if (route.path === '/reset') page = <Reset token={route.query.token} onSignedIn={signIn} />
  else if (session && route.path === '/admin') page = session.isAdmin ? <AdminEvents session={session} /> : <NotFound />
  else if (session && route.path === '/account') page = <AccountPage session={session} onToken={signIn} onSignOut={signOut} />
  else if (session && route.path === '/events') page = <Dashboard session={session} />
  else if (session && route.path === '/events/new') page = <NewEvent session={session} />
  else if (session && (params = match('/events/:id/races/new', route.path))) page = <NewRace session={session} eventId={params.id} />
  else if (session && (params = match('/events/:id', route.path))) page = <EventPage session={session} eventId={params.id} />
  else if (session && (params = match('/races/:id/course', route.path))) page = <CourseStep session={session} raceId={params.id} />
  else if (session && (params = match('/races/:id/results', route.path))) page = <ResultsStep session={session} raceId={params.id} />
  else if (session && (params = match('/races/:id/review', route.path))) page = <ReviewStep session={session} raceId={params.id} />
  else if (session && (params = match('/races/:id', route.path))) navigate(`/races/${encodeURIComponent(params.id)}/course`, { replace: true })
  else if (!needsAuth) page = <NotFound />

  return (
    <div id="top" className="flex min-h-screen max-w-full flex-col overflow-x-clip bg-[#f7f9fc] text-[#0b1220]">
      <Header session={session} onSignOut={signOut} onLogin={route.path.startsWith('/login')} />
      {signOutFailed && (
        <div className="border-b border-red-200 bg-red-50">
          <div className={`${CONTAINER} flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px] text-red-800`} role="alert">
            <span className="min-w-0">
              <strong className="font-semibold">You are still signed in.</strong> Signing out did not reach OTRI ({signOutFailed}), so this
              session is still open. Try again, and do not leave this computer until it works.
            </span>
            <button type="button" onClick={signOut} className="font-semibold text-red-900 underline">
              Sign out again
            </button>
          </div>
        </div>
      )}
      {unconfirmed && <ConfirmEmailBar email={session.email} />}
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" className="flex-1">{page}</main>
      <Footer />
      <BackToTop />
      <BuildBanner />
    </div>
  )
}

// Signed in with an address nobody has confirmed yet: everything works except making a race public.
function ConfirmEmailBar({ email }) {
  // "Sent again" on a failure leaves somebody waiting for mail that was never sent -- and the
  // usual reason to fail here is the per-address limit, i.e. pressing it too often.
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState(null)
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className={`${CONTAINER} flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px] text-amber-900`}>
        <Mail size={14} className="shrink-0" />
        <span className="min-w-0">
          Confirm your email to publish: we sent a link to <strong className="font-semibold">{email}</strong>. You can build your race in the meantime.
        </span>
        <button
          type="button"
          disabled={sent}
          onClick={() => {
            setFailed(null)
            resendVerification(email).then(() => setSent(true)).catch((err) => setFailed(err.message))
          }}
          className="font-semibold text-amber-900 underline disabled:no-underline"
        >
          {sent ? 'Sent again' : 'Send it again'}
        </button>
        {failed && <span role="alert" className="min-w-0 text-amber-800">{failed}</span>}
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <section className="py-4">
      <div className={CONTAINER}>
        <SharedNotFound where={window.location.hash} home="#/" homeLabel="Back to the start" secondaryHref="../#calculator" note="Organizer pages need you to be signed in; admin pages need an admin account." />
      </div>
    </section>
  )
}

installScrollMemory()
installDropGuard()
installSearchShortcut()

createRoot(document.getElementById('root')).render(
  <ErrorBoundary home="./">
    <Gate>
      <Maintenance>
        <App />
      </Maintenance>
    </Gate>
  </ErrorBoundary>,
)
