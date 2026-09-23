// The site-wide gate OTRI stood behind before it opened (2026-09-23). Off now, and kept: the
// password's hash is also what maintenance mode accepts (Maintenance.jsx), and the gate can be
// put back with one constant should the site ever need to close to everyone again.
//
// The site is static, so this is a browser-side check: the page asks for a password, hashes it,
// compares it with the hash below, and remembers a match in this browser. It keeps the site out
// of casual view and out of search engines (index.html carries noindex while GATE_ENABLED is on);
// it is not a secret-keeping wall, since the pages themselves are still served to anyone who
// asks the CDN directly, and the API at api.otri.run stays public. To open the site, set
// GATE_ENABLED to false, drop the noindex from index.html and the Disallow from robots.txt.

import { useEffect, useState } from 'react'
import Logo from './Logo'

export const GATE_ENABLED = false
// sha256 of the password. The password itself is not in the code.
export const GATE_HASH = '67a9689fda9c251b4df5d80d8480b236fe164ac91219806b83a319a083643d1f'
export const GATE_KEY = 'otri_gate'

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function remembered() {
  try {
    return localStorage.getItem(GATE_KEY) === GATE_HASH
  } catch {
    return false
  }
}

export default function Gate({ children }) {
  const [open, setOpen] = useState(() => !GATE_ENABLED || remembered())
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) document.title = 'OTRI'
  }, [open])

  if (open) return children

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    const hash = await sha256(value.trim())
    if (hash === GATE_HASH) {
      try {
        localStorage.setItem(GATE_KEY, GATE_HASH)
      } catch {
        // a browser that keeps nothing still gets in for this page
      }
      setOpen(true)
    } else {
      setWrong(true)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 text-[#0b1220]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,.06)]">
        <Logo />
        <h1 className="mt-5 text-xl font-bold tracking-[-.03em]">Not open yet.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">OTRI is being prepared. If you were given the password, enter it here.</p>
        <label className="mt-5 block text-xs font-semibold text-slate-700" htmlFor="gate-password">
          Password
        </label>
        <input
          id="gate-password"
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setWrong(false)
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {wrong && <p className="mt-2 text-xs text-red-600">That is not the password.</p>}
        <button type="submit" disabled={busy || !value} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          Enter
        </button>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">
          Questions: <a href="mailto:hello@otri.run" className="underline">hello@otri.run</a>
        </p>
      </form>
    </div>
  )
}
