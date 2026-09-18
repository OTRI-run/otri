import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, ChevronDown, Mail } from 'lucide-react'
import '../../src/styles.css'
import Logo from '../../src/components/Logo'
import UnitsMenu from '../../src/components/UnitsMenu'
import { getMe } from '../apiClient'
import BuildBanner from '../../src/components/BuildBanner'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import SharedNotFound from '../../src/components/NotFound'
import { AccountPage } from './pages/Account'
import { AdminEvents } from './pages/Admin'
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

function Header({ session, onSignOut }) {
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
              <UnitsMenu />
            </span>
            {session ? (
              <AccountMenu session={session} onSignOut={onSignOut} />
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
        <a href="mailto:hello@otri.run" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 no-underline hover:text-blue-600">
          <Mail size={14} />
          hello@otri.run
        </a>
        <span className="font-mono text-[8px] tracking-[.08em] text-slate-500">OPEN · TRANSPARENT · REPRODUCIBLE · INDEPENDENT</span>
      </div>
    </footer>
  )
}

function App() {
  const route = useRoute()
  const [session, setSession] = useState(() => readSession())

  function signIn(token, email, isAdmin = false) {
    writeSession(token, email, isAdmin)
    setSession({ token, email, isAdmin })
  }
  function signOut() {
    clearSession()
    setSession(null)
    navigate('/', { replace: true })
  }

  // Signed-out visitors hitting an authenticated route go to sign-in; signed-in visitors on the
  // welcome page go straight to their events.
  // Admin/demo flags can change server-side; refresh them for a stored session.
  useEffect(() => {
    if (!session?.token) return
    const token = session.token
    getMe(token)
      .then((me) => {
        writeSession(token, me.email, me.is_admin)
        setSession((current) => (current && current.token === token ? { ...current, isAdmin: me.is_admin } : current))
      })
      .catch(() => {})
  }, [session?.token])

  const needsAuth = /^\/(events|races|admin|account)/.test(route.path)
  useEffect(() => {
    // Read the live hash, not the rendered route: signing out navigates to '/' and clears the
    // session in the same tick, and the render in between still carries the old route.
    const liveNeedsAuth = /^#\/(events|races|admin|account)/.test(window.location.hash)
    if (liveNeedsAuth && !session) navigate('/login', { replace: true })
    if (route.path === '/' && session) navigate('/events', { replace: true })
  }, [route.path, needsAuth, session])

  let page = null
  let params
  if (route.path === '/') page = session ? null : <Welcome />
  else if (route.path === '/register') page = <Register />
  else if (route.path === '/login') page = <Login onSignedIn={signIn} />
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
      <Header session={session} onSignOut={signOut} />
      <main className="flex-1">{page}</main>
      <Footer />
      <BuildBanner />
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

createRoot(document.getElementById('root')).render(
  <ErrorBoundary home="./">
    <App />
  </ErrorBoundary>,
)
