// What the browser remembers about a sign-in. The session itself is an HttpOnly cookie set by the
// API, which page scripts cannot read; localStorage only keeps the email and the admin flag so the
// header can render before /auth/me answers. No token is ever written to storage.
const LEGACY_TOKEN_KEY = 'otri_organizer_token'
const EMAIL_KEY = 'otri_organizer_email'
const ADMIN_KEY = 'otri_organizer_admin'

export function readSession() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY) // sign-ins from before the cookie migration
    const email = localStorage.getItem(EMAIL_KEY)
    const isAdmin = localStorage.getItem(ADMIN_KEY) === '1'
    return email ? { token: '', email, isAdmin } : null
  } catch {
    return null
  }
}

export function writeSession(_token, email, isAdmin = false) {
  try {
    localStorage.setItem(EMAIL_KEY, email)
    localStorage.setItem(ADMIN_KEY, isAdmin ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the header just shows nothing until the next sign-in.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(ADMIN_KEY)
  } catch {
    // ignore
  }
}
