import '../../src/styles.css'
import './main.css'
import BackToTop from '../../src/components/BackToTop'
import { installDropGuard, installScrollMemory, installSearchShortcut } from '../../src/lib/comfort'
import { useEffect, useRef, useState } from 'preact/compat'
import { createRoot } from 'preact/compat/client'
import { ArrowUpRight, ChevronDown, LogOut, Mail } from '../../src/ui/icons'
import Logo from '../../src/components/Logo'
import UnitsMenu from '../../src/components/UnitsMenu'
import { logoutOrganizer, getMe, resendVerification } from '../apiClient'
import BuildBanner from '../../src/components/BuildBanner'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import { initMonitoring } from '../../src/lib/monitoring'
import { useDocumentTitle } from '../../src/lib/title'
import SharedNotFound from '../../src/components/NotFound'
import { AccountPage } from './pages/Account'
import { AdminEvents } from './pages/Admin'
import PublishScoredRace from './pages/Publish'
import { hasHandoff } from '../publishHandoff'
import { CheckEmail, Forgot, Login, Register, Reset, Verify, Welcome } from './pages/Auth'
import { Dashboard, EventPage, NewEvent } from './pages/Events'
import { CourseStep, NewRace, ResultsStep, ReviewStep } from './pages/Race'
import { Link, match, navigate, useRoute } from './router'
import { clearSession, readSession, writeSession } from './session'

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
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="account-trigger">
        <span className={`avatar ${session.isAdmin ? 'avatar--admin' : ''}`}>{initialOf(session.email)}</span>
        <ChevronDown size={14} style={{ transition: 'transform var(--quick) var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div role="menu" className="menu menu--right" style={{ width: 272 }}>
          <div className="menu__head">
            <p title={session.email}>{session.email}</p>
            <p className="cluster cluster--tight mt-1">
              <span className="badge">Organizer</span>
              {session.isAdmin && <span className="badge badge--ochre">Admin</span>}
            </p>
          </div>
          <div className="menu__sep" />
          <Link to="/events" className="menu__item" onClick={() => setOpen(false)}>Your events</Link>
          <Link to="/account" className="menu__item" onClick={() => setOpen(false)}>Account settings</Link>
          {session.isAdmin && (
            <Link to="/admin" className="menu__item" onClick={() => setOpen(false)}>Admin dashboard</Link>
          )}
          <a href="../#home" className="menu__item">Public site <ArrowUpRight size={14} /></a>
          <a href={GITHUB_URL} className="menu__item">GitHub <ArrowUpRight size={14} /></a>
          <div className="menu__sep" />
          <button type="button" onClick={onSignOut} className="menu__item"><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

function Header({ session, onSignOut }) {
  return (
    <>
      <header className="site-header">
        <div className="wrap site-header__inner">
          <div className="site-header__brand">
            <Logo href="../#home" compact />
            <Link to="/" className="badge badge--solid-moss hide-sm">For organizers</Link>
          </div>
          <nav className="site-nav" aria-label="Organizer">
            {session && <Link to="/events" className="site-nav__link">Your events</Link>}
            {session?.isAdmin && <Link to="/admin" className="site-nav__link"><span className="badge badge--ochre">Admin</span></Link>}
            <a href="../#home" className="site-nav__link">Public site <ArrowUpRight size={14} /></a>
            <span className="site-nav__sep" aria-hidden="true" />
            <UnitsMenu compact />
            {session ? (
              <AccountMenu session={session} onSignOut={onSignOut} />
            ) : (
              <Link to="/login" className="btn btn--dark btn--sm" style={{ marginLeft: 8 }}>Sign in</Link>
            )}
          </nav>
          <div className="site-header__mobile">
            {session ? <AccountMenu session={session} onSignOut={onSignOut} /> : <Link to="/login" className="btn btn--dark btn--sm">Sign in</Link>}
          </div>
        </div>
      </header>
      {/* Small screens: the app's pages in their own row. */}
      <nav className="site-subnav" aria-label="Organizer pages">
        <div className="wrap site-subnav__inner">
          {session ? <Link to="/events" className="site-nav__link">Your events</Link> : <Link to="/" className="site-nav__link">For organizers</Link>}
          {session?.isAdmin && <Link to="/admin" className="site-nav__link">Admin</Link>}
          <a href="../#home" className="site-nav__link">Public site</a>
          <div className="push">
            <UnitsMenu compact />
          </div>
        </div>
      </nav>
    </>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <div>
          <Logo href="../#home" dark />
          <p className="site-footer__tag">Your race, scored with an open method. Nothing is public until you press Publish.</p>
        </div>
        <div className="site-footer__col">
          <h4>Organizers</h4>
          <ul>
            <li><Link to="/">Start here</Link></li>
            <li><Link to="/events">Your events</Link></li>
            <li><a href="../#score">Score a race without an account</a></li>
            <li><a href={`${GITHUB_URL}/blob/main/docs/organizer-upload.md`}>Organizer documentation <ArrowUpRight size={13} /></a></li>
          </ul>
        </div>
        <div className="site-footer__col">
          <h4>OTRI</h4>
          <ul>
            <li><a href="../#home">Public site</a></li>
            <li><a href="../#faq">FAQ</a></li>
            <li><a href={GITHUB_URL}>Source on GitHub <ArrowUpRight size={13} /></a></li>
            <li><a href={`${GITHUB_URL}/blob/main/PRIVACY.md`}>Privacy <ArrowUpRight size={13} /></a></li>
            <li><a href="mailto:hello@otri.run"><Mail size={14} /> hello@otri.run</a></li>
          </ul>
        </div>
      </div>
      <div className="wrap site-footer__bottom">
        <span>Open · Transparent · Reproducible · Independent</span>
        <a href="https://otri.run">otri.run</a>
      </div>
    </footer>
  )
}

initMonitoring()

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

  function signIn(token, email, isAdmin = false) {
    writeSession()
    setSession({ token, email, isAdmin, pending: false })
  }
  function signOut() {
    logoutOrganizer()
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
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [unconfirmed])

  let page = null
  let params
  if (route.path === '/') page = session ? null : <Welcome />
  else if (route.path === '/publish') page = <PublishScoredRace session={session} />
  else if (route.path === '/register') page = <Register onSignedIn={signIn} />
  else if (route.path === '/login') page = <Login onSignedIn={signIn} afterReset={Boolean(route.query?.reset)} />
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
    <div id="top" className="site">
      <Header session={session} onSignOut={signOut} />
      {unconfirmed && <ConfirmEmailBar email={session.email} />}
      <main>{page}</main>
      <Footer />
      <BackToTop />
      <BuildBanner />
    </div>
  )
}

// Signed in with an address nobody has confirmed yet: everything works except making a race public.
function ConfirmEmailBar({ email }) {
  const [sent, setSent] = useState(false)
  return (
    <div className="site-bar">
      <div className="wrap site-bar__inner">
        <Mail size={16} />
        <span className="min0">
          Confirm your email to publish: we sent a link to <strong>{email}</strong>. You can build your race in the meantime.
        </span>
        <button type="button" disabled={sent} onClick={() => resendVerification(email).then(() => setSent(true)).catch(() => setSent(true))}>
          {sent ? 'Sent again' : 'Send it again'}
        </button>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <section className="section section--tight">
      <div className="wrap">
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
    <App />
  </ErrorBoundary>,
)
