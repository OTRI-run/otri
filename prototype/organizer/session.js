// Same storage keys the previous organizer tab used, so an existing sign-in carries over.
const TOKEN_KEY = 'otri_organizer_token'
const EMAIL_KEY = 'otri_organizer_email'

export function readSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const email = localStorage.getItem(EMAIL_KEY)
    return token && email ? { token, email } : null
  } catch {
    return null
  }
}

export function writeSession(token, email) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // Private mode or blocked storage: the session simply does not persist across reloads.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
  } catch {
    // ignore
  }
}
