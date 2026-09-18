// What the browser remembers about a sign-in: only that one exists. The session itself is an
// HttpOnly cookie set by the API, which page scripts cannot read; who is signed in (email, admin)
// is asked from /auth/me on every load. Nothing personal is ever written to browser storage.
const SIGNED_IN_KEY = 'otri_organizer_signed_in'
const LEGACY_KEYS = ['otri_organizer_token', 'otri_organizer_email', 'otri_organizer_admin']

export function readSession() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key) // sign-ins from before this change
    return localStorage.getItem(SIGNED_IN_KEY) === '1' ? { token: '', email: '', isAdmin: false, pending: true } : null
  } catch {
    return null
  }
}

export function writeSession() {
  try {
    localStorage.setItem(SIGNED_IN_KEY, '1')
  } catch {
    // Private mode or blocked storage: the next load simply starts signed out.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SIGNED_IN_KEY)
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
