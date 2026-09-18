// What the browser remembers about a sign-in. The session itself is an HttpOnly cookie set by the
// API, which page scripts cannot read; localStorage only keeps the email and admin flag for the
// header, and (from older sign-ins) a bearer token that keeps working until it expires.
const TOKEN_KEY = 'otri_organizer_token'
const EMAIL_KEY = 'otri_organizer_email'
const ADMIN_KEY = 'otri_organizer_admin'

export function readSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || ''
    const email = localStorage.getItem(EMAIL_KEY)
    const isAdmin = localStorage.getItem(ADMIN_KEY) === '1'
    return email ? { token, email, isAdmin } : null
  } catch {
    return null
  }
}

export function writeSession(token, email, isAdmin = false) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    localStorage.setItem(EMAIL_KEY, email)
    localStorage.setItem(ADMIN_KEY, isAdmin ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the header just shows nothing until the next sign-in.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(ADMIN_KEY)
  } catch {
    // ignore
  }
}
