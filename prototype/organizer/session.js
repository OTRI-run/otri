// Same storage keys the previous organizer tab used, so an existing sign-in carries over.
const TOKEN_KEY = 'otri_organizer_token'
const EMAIL_KEY = 'otri_organizer_email'
const ADMIN_KEY = 'otri_organizer_admin'

export function readSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const email = localStorage.getItem(EMAIL_KEY)
    const isAdmin = localStorage.getItem(ADMIN_KEY) === '1'
    return token && email ? { token, email, isAdmin } : null
  } catch {
    return null
  }
}

export function writeSession(token, email, isAdmin = false) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EMAIL_KEY, email)
    localStorage.setItem(ADMIN_KEY, isAdmin ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the session simply does not persist across reloads.
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
