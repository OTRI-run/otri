import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Mail } from 'lucide-react'
import '../../src/styles.css'
import Logo from '../../src/components/Logo'
import UnitsMenu from '../../src/components/UnitsMenu'
import { CheckEmail, Forgot, Login, Register, Reset, Verify, Welcome } from './pages/Auth'
import { Dashboard, EventPage, NewEvent } from './pages/Events'
import { CourseStep, NewRace, ResultsStep, ReviewStep } from './pages/Race'
import { Link, match, navigate, useRoute } from './router'
import { clearSession, readSession, writeSession } from './session'
import { Button, CONTAINER } from './ui'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'

function Header({ session, onSignOut }) {
  return (
    <>
      <header className="sticky top-0 z-50 h-[68px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className={`${CONTAINER} flex h-full min-w-0 items-center`}>
          <Logo href="../#home" />
          <Link
            to="/"
            className="ml-6 hidden shrink-0 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[9px] font-medium tracking-[.08em] text-blue-600 no-underline sm:flex"
          >
            <i className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_0_3px_#dbeafe]" />
            FOR ORGANIZERS
          </Link>
          <nav className="ml-auto hidden shrink-0 items-center gap-7 md:flex">
            <a href="../#calculator" className="text-[13px] font-medium text-slate-500 no-underline hover:text-slate-950">
              Calculate score
            </a>
            <a href="../#races" className="text-[13px] font-medium text-slate-500 no-underline hover:text-slate-950">
              Races
            </a>
            {session && (
              <Link to="/events" className="text-[13px] font-semibold text-[#0b1220] no-underline">
                Your events
              </Link>
            )}
            <a className="flex items-center gap-1 text-[13px] font-semibold text-[#0b1220] no-underline" href={GITHUB_URL}>
              GitHub <ArrowUpRight size={14} />
            </a>
            <UnitsMenu />
            {session ? (
              <button onClick={onSignOut} className="text-[13px] font-medium text-slate-500 hover:text-slate-950" title={session.email}>
                Sign out
              </button>
            ) : (
              <Link to="/login" className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white no-underline hover:bg-blue-700">
                Sign in
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            {session ? (
              <button onClick={onSignOut} className="text-xs font-semibold text-slate-500">
                Sign out
              </button>
            ) : (
              <Link to="/login" className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white no-underline">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {/* Small screens: section links in their own row. */}
      <div className="border-b border-slate-200 bg-white md:hidden">
        <div className={`${CONTAINER} flex items-center gap-5`}>
          <a href="../#calculator" className="py-3 text-[13px] font-medium text-slate-500 no-underline">
            Calculate score
          </a>
          <a href="../#races" className="py-3 text-[13px] font-medium text-slate-500 no-underline">
            Races
          </a>
          {session && (
            <Link to="/events" className="py-3 text-[13px] font-semibold text-[#0b1220] no-underline">
              Your events
            </Link>
          )}
          <div className="ml-auto py-1.5">
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

  function signIn(token, email) {
    writeSession(token, email)
    setSession({ token, email })
  }
  function signOut() {
    clearSession()
    setSession(null)
    navigate('/', { replace: true })
  }

  // Signed-out visitors hitting an authenticated route go to sign-in; signed-in visitors on the
  // welcome page go straight to their events.
  const needsAuth = /^\/(events|races)/.test(route.path)
  useEffect(() => {
    // Read the live hash, not the rendered route: signing out navigates to '/' and clears the
    // session in the same tick, and the render in between still carries the old route.
    const liveNeedsAuth = /^#\/(events|races)/.test(window.location.hash)
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
    </div>
  )
}

function NotFound() {
  return (
    <section className="py-16">
      <div className={CONTAINER}>
        <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">404</p>
        <h1 className="mt-3 text-[clamp(32px,4.5vw,52px)] font-bold leading-[.98] tracking-[-.05em] text-[#0b1220]">Page not found.</h1>
        <div className="mt-6">
          <Button onClick={() => navigate('/')}>Back to the start</Button>
        </div>
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')).render(<App />)
