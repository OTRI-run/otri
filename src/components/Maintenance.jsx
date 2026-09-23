// The site closed for maintenance, and the way past it for the people doing the maintenance.
//
// The pages are static files on a CDN, so the switch lives in the API: an admin closes the site
// from the admin page (POST /admin/site/maintenance) and every page asks GET /site/status as it
// opens. Closed, it shows this notice instead of itself and asks again every half minute, so it
// opens on its own when the site is back. Three ways through, so the site can be checked while
// it is closed: an admin who is signed in (the API says so), anyone who enters the site password
// (the same one the pre-launch gate takes, remembered in this browser), and a build made with
// VITE_OTRI_MAINTENANCE=1, which is closed whatever the API says -- for the day the API itself
// is what is being worked on. When the API cannot be reached the site opens as usual: a notice
// that appears because the check failed would close the site by accident far more often than on
// purpose, and each page says for itself when the API is away.

import { useEffect, useRef, useState } from 'react'
import { getMe, getSiteStatus } from '../../prototype/apiClient'
import Logo from './Logo'
import { GATE_HASH, sha256 } from './Gate'

// A build that is closed no matter what the API says (see the GitHub Pages workflow).
const FORCED = import.meta.env.VITE_OTRI_MAINTENANCE === '1'
const BYPASS_KEY = 'otri_maintenance_bypass'
const LAST_KEY = 'otri_maintenance_last'
const POLL_MS = 30_000
const WAIT_MS = 4_000

const DEFAULT_MESSAGE = 'OTRI is being worked on and will be back shortly. Nothing you published is affected.'

function remembered(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function remember(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // a browser that keeps nothing: the choice still holds for this page
  }
}

/** Whether the visitor may see the site while it is closed: the password, or an admin session. */
async function hasWayThrough() {
  if (remembered(BYPASS_KEY) === GATE_HASH) return true
  if (remembered('otri_organizer_signed_in') !== '1') return false
  try {
    const me = await getMe()
    return Boolean(me?.is_admin)
  } catch {
    return false
  }
}

/** Asks the API whether the site is closed. Resolves to null when it could not be reached in time. */
async function askStatus() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WAIT_MS)
  try {
    const status = await getSiteStatus(controller.signal)
    return status?.maintenance ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function since(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Wraps a whole app. `compact` is for the calculator that other sites show in an iframe, where a
 * notice has a small frame and no room for a form.
 */
export default function Maintenance({ children, compact = false }) {
  // 'checking' holds the page back only when the last visit found the site closed: a visitor who
  // was just turned away should not see the site flash before the notice. Everyone else sees the
  // site at once and the notice replaces it if the answer says so.
  const [state, setState] = useState(() => {
    if (FORCED) return 'checking'
    return remembered(LAST_KEY) === 'closed' ? 'checking' : 'open'
  })
  const [notice, setNotice] = useState({ message: '', since: null })
  // Closed while the visitor was already inside: a banner says so and the page stays. A form
  // half filled in is worth more than a tidy notice.
  const [closingBanner, setClosingBanner] = useState(false)
  const passed = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer = null
    // The first answer decides what the page shows; a later one, while the visitor is inside,
    // only adds the banner.
    let first = true

    const check = async () => {
      const initial = first
      first = false
      const closed = FORCED ? { on: true, message: '', since: null } : await askStatus()
      if (cancelled) return
      if (!closed || !closed.on) {
        if (closed) remember(LAST_KEY, null)
        setState('open')
        setClosingBanner(false)
        return
      }
      remember(LAST_KEY, 'closed')
      setNotice({ message: closed.message || '', since: closed.since })
      if (!passed.current) passed.current = await hasWayThrough()
      if (cancelled) return
      setClosingBanner(true)
      if (passed.current) {
        setState('open')
        return
      }
      if (initial) setState('closed')
      else setState((current) => (current === 'checking' ? 'closed' : current))
    }

    // While closed, ask again every half minute; while open, ask again when the tab comes back.
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await check()
        if (!cancelled) schedule()
      }, POLL_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    check().then(() => {
      if (!cancelled) schedule()
    })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // The first answer decides between the site and the notice; if none comes, the site it is.
  useEffect(() => {
    if (state !== 'checking') return undefined
    const giveUp = setTimeout(() => setState((current) => (current === 'checking' ? 'open' : current)), WAIT_MS + 500)
    return () => clearTimeout(giveUp)
  }, [state])

  if (state === 'checking') {
    // Nothing yet: the page's own loading mark has just been replaced, and a blank of a second
    // reads better than a notice that then vanishes.
    return <div className="min-h-screen bg-[#f7f9fc]" aria-busy="true" />
  }

  if (state === 'open') {
    return (
      <>
        {closingBanner && !compact && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[12px] font-medium text-amber-900">
            OTRI is closed for maintenance.{' '}
            {passed.current ? 'You can see it because you are signed in as an admin or entered the site password.' : 'Finish what you are doing; the next page you open will show the notice.'}
          </div>
        )}
        {children}
      </>
    )
  }

  return (
    <Notice
      compact={compact}
      message={notice.message}
      since={notice.since}
      onPass={() => {
        passed.current = true
        setState('open')
      }}
    />
  )
}

function Notice({ compact, message, since: closedAt, onPass }) {
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    document.title = 'OTRI — closed for maintenance'
    return () => {
      document.title = 'OTRI'
    }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    const hash = await sha256(value.trim())
    if (hash === GATE_HASH) {
      remember(BYPASS_KEY, GATE_HASH)
      onPass()
    } else {
      setWrong(true)
      setBusy(false)
    }
  }

  const when = since(closedAt)

  if (compact) {
    return (
      <div className="flex min-h-[220px] items-center justify-center bg-[#f7f9fc] px-4 py-6 text-center text-[#0b1220]">
        <div>
          <Logo showName={false} size={24} className="justify-center" />
          <p className="mt-3 text-sm font-semibold">Closed for maintenance.</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{message || 'Back shortly.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 text-[#0b1220]">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,.06)] sm:p-8">
        <Logo />
        <p className="mt-6 font-mono text-[11px] tracking-[.08em] text-amber-700">CLOSED FOR MAINTENANCE</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-.03em]">Back shortly.</h1>
        <p className="mt-3 text-[15px] leading-7 text-slate-700">{message || DEFAULT_MESSAGE}</p>
        <p className="mt-4 text-[12px] leading-5 text-slate-500">
          {when ? `Closed since ${when}. ` : ''}This page checks every half minute and opens by itself when the site is back.
        </p>
        <p className="mt-2 text-[12px] leading-5 text-slate-500">
          Questions: <a href="mailto:hello@otri.run" className="underline">hello@otri.run</a>
        </p>

        <div className="mt-6 border-t border-slate-200 pt-4">
          {asking ? (
            <form onSubmit={submit}>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="maintenance-password">
                Site password
              </label>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">For the people working on OTRI. Admins who are signed in get through without it.</p>
              <input
                id="maintenance-password"
                type="password"
                autoComplete="off"
                autoFocus
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  setWrong(false)
                }}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {wrong && <p className="mt-2 text-xs text-red-600">That is not the password.</p>}
              <button
                type="submit"
                disabled={busy || !value}
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                Open the site for me
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className="text-[12px] font-medium text-slate-500 underline-offset-2 hover:text-[#0b1220] hover:underline">
              Working on OTRI? Enter the site password
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
