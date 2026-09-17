import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { CheckEmail, Forgot, Login, Register, Reset, Verify, Welcome } from './pages/Auth'
import { Dashboard, EventPage, NewEvent } from './pages/Events'
import { CourseStep, NewRace, ResultsStep, ReviewStep } from './pages/Race'
import { Link, match, navigate, useRoute } from './router'
import { clearSession, readSession, writeSession } from './session'

function Header({ session, onSignOut }) {
  return (
    <header className="sticky top-0 z-50 h-[64px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full w-[min(1120px,calc(100%-28px))] items-center gap-4">
        <a href="../../" className="text-[15px] font-bold tracking-[-.02em] text-[#0b1220] no-underline">
          OTRI
        </a>
        <Link to="/" className="font-mono text-[10px] tracking-[.08em] text-slate-500 no-underline">
          FOR ORGANIZERS
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link to="/events" className="font-semibold text-[#0b1220] no-underline">
                Events
              </Link>
              <span className="hidden text-xs text-slate-500 sm:inline">{session.email}</span>
              <button onClick={onSignOut} className="text-xs font-semibold text-blue-600">
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="font-semibold text-blue-600 no-underline">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
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
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1220]">
      <Header session={session} onSignOut={signOut} />
      <main>{page}</main>
      <footer className="mx-auto w-[min(1120px,calc(100%-28px))] py-10 text-xs text-slate-400">
        OTRI · scores depend only on the course and each finisher's own time ·{' '}
        <a className="underline" href="https://github.com/OTRI-run/otri/blob/main/docs/methodology/HOW-OTRI-SCORES.md" target="_blank" rel="noreferrer">
          how it works
        </a>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto w-[min(760px,calc(100%-28px))] py-16">
      <h1 className="text-2xl font-bold text-[#0b1220]">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        <Link to="/" className="font-semibold text-blue-600">Back to the start</Link>
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
