/**
 * Minimal fetch wrapper for the OTRI API, used only by the prototype (the
 * production marketing site never calls a live backend).
 *
 * Configure the target with VITE_OTRI_API_BASE_URL (see .env.example).
 * Defaults to the local FastAPI dev server.
 */

export const API_BASE_URL = import.meta.env.VITE_OTRI_API_BASE_URL || 'http://localhost:8000'

// The organizer app identifies itself so the API keeps the session in an HttpOnly cookie instead
// of the response body; the same header is the CSRF guard on state-changing requests.
const CLIENT_HEADERS = { 'X-OTRI-Client': 'web' }

function withCredentials(options = {}) {
  return { credentials: 'include', ...options, headers: { ...CLIENT_HEADERS, ...(options.headers || {}) } }
}

// What to say when the answer carries no message of its own: the proxy in front of the API answers
// an oversized upload or a timeout with a page of HTML, not with JSON.
const FRIENDLY_STATUS = {
  413: 'That file is too large (the limit is 20 MB). For a GPX, export it with fewer points; for results, upload one race distance per file.',
  429: 'Too many tries in a short time. Wait a minute and try again.',
  502: 'OTRI is restarting. Try again in a moment.',
  503: 'OTRI is restarting. Try again in a moment.',
  504: 'That took too long and was stopped. Try again; if it keeps happening with this file, tell us.',
}

// FastAPI answers a missing or malformed field with a list of {loc, msg}: say which field, in words.
function readableDetail(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const names = { gpx: 'the course file (GPX)', results: 'the results file', file: 'the file' }
    return detail
      .map((item) => {
        const field = item?.loc?.[item.loc.length - 1]
        if (item?.type === 'missing') return `${names[field] ?? field} is missing`
        return `${names[field] ?? field ?? 'request'}: ${item?.msg ?? 'not accepted'}`
      })
      .join('; ')
      .replace(/^./, (first) => first.toUpperCase())
  }
  return detail ? JSON.stringify(detail) : null
}

// The server refuses a body over 20 MB, and a refusal that late is a dropped connection, not a
// message. Said before anything is sent, naming the file.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

function checkUploadSize(body) {
  if (typeof FormData === 'undefined' || !(body instanceof FormData)) return
  let total = 0
  for (const value of body.values()) {
    if (!(value instanceof Blob)) continue
    total += value.size
    if (value.size === 0) throw new Error(`“${value.name ?? 'The file'}” is empty. Export it again and upload that.`)
    if (value.size > MAX_UPLOAD_BYTES) {
      const isGpx = /\.gpx$/i.test(value.name ?? '')
      throw new Error(`“${value.name ?? 'The file'}” is ${(value.size / 1048576).toFixed(0)} MB; the limit is 20 MB. ${isGpx ? 'Export the course with fewer points (one every 5 to 10 m is plenty).' : 'Upload one race distance per file, or save it as CSV.'}`)
    }
  }
  if (total > MAX_UPLOAD_BYTES) throw new Error('Together the files are larger than 20 MB, which is the limit for one upload. Export the course with fewer points (one every 5 to 10 m is plenty).')
}

async function request(path, options) {
  checkUploadSize(options?.body)
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, withCredentials(options))
  } catch (networkError) {
    throw new Error(import.meta.env?.DEV ? `Could not reach the API at ${API_BASE_URL} (${networkError.message}). Is it running?` : 'Could not reach OTRI. Check your connection and try again; a very large file can also end a connection.')
  }

  if (!response.ok) {
    let detail = FRIENDLY_STATUS[response.status] ?? response.statusText
    try {
      const body = await response.json()
      detail = readableDetail(body.detail ?? body) ?? detail
    } catch {
      // response had no JSON body; keep statusText
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

function authHeaders(token, extra) {
  // A stored bearer token (older sign-ins) still works; new sign-ins rely on the cookie alone.
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
}

export function logoutOrganizer() {
  return request('/auth/logout', { method: 'POST' }).catch(() => null)
}

export function registerOrganizer(email, password, { acceptTerms = false, marketingOptIn = false } = {}) {
  return request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, accept_terms: acceptTerms, marketing_opt_in: marketingOptIn }),
  })
}

export function loginOrganizer(email, password, remember = false) {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember }),
  })
}

/** Second step of sign-in: an authenticator code, an emailed code, or a recovery code. */
export function completeTwoFactor(challenge, code) {
  return request('/auth/login/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, code }) })
}

const json = (token, body) => ({ headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
function sessionToken() {
  try {
    return localStorage.getItem('otri_organizer_token')
  } catch {
    return null
  }
}
export function fetchNewsletterCsv() {
  return fetch(`${API_BASE_URL}/admin/newsletter.csv`, withCredentials({ headers: authHeaders(sessionToken()) })).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText))))
}
export function updateProfile(profile) {
  return request('/auth/profile', { method: 'PATCH', ...json(sessionToken(), profile) })
}
export function changePassword(currentPassword, newPassword) {
  return request('/auth/change-password', { method: 'POST', ...json(sessionToken(), { current_password: currentPassword, new_password: newPassword }) })
}
export function logoutEverywhere(password) {
  return request('/auth/logout-all', { method: 'POST', ...json(sessionToken(), { password }) })
}
export function deleteOwnAccount(password) {
  return request('/auth/account', { method: 'DELETE', ...json(sessionToken(), { password }) })
}
export function fetchAccountExport() {
  return fetch(`${API_BASE_URL}/auth/export`, withCredentials({ headers: authHeaders(sessionToken()) })).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText))))
}
export function totpSetup() {
  return request('/auth/2fa/totp/setup', { method: 'POST', headers: authHeaders(sessionToken()) })
}
export function totpEnable(code) {
  return request('/auth/2fa/totp/enable', { method: 'POST', ...json(sessionToken(), { code }) })
}
export function emailTwoFactorStart() {
  return request('/auth/2fa/email/start', { method: 'POST', headers: authHeaders(sessionToken()) })
}
export function emailTwoFactorEnable(code) {
  return request('/auth/2fa/email/enable', { method: 'POST', ...json(sessionToken(), { code }) })
}
export function disableTwoFactor(password) {
  return request('/auth/2fa/disable', { method: 'POST', ...json(sessionToken(), { password }) })
}
export function regenerateRecoveryCodes(password) {
  return request('/auth/2fa/recovery-codes', { method: 'POST', ...json(sessionToken(), { password }) })
}

export function verifyEmail(token) {
  return request('/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export function resendVerification(email) {
  return request('/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export function requestPasswordReset(email) {
  return request('/auth/request-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
}

export function listMyEvents(token) {
  return request('/events?mine=true', { headers: authHeaders(token) })
}

export function listScoringModels() {
  return request('/scoring/models')
}

export function getEvent(eventId) {
  // Signed in, the owner sees every race of the event; anyone else sees the public ones.
  return request(`/events/${encodeURIComponent(eventId)}`, { headers: authHeaders(sessionToken()) })
}

export function createEvent(payload, token) {
  return request('/events', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
}

export function updateEvent(eventId, payload, token) {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
}

export function deleteEvent(eventId, token) {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function createRace(eventId, payload, token) {
  return request(`/events/${encodeURIComponent(eventId)}/races`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
}

export function updateRace(raceId, payload, token) {
  return request(`/races/${encodeURIComponent(raceId)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
}

export function deleteRace(raceId, token) {
  return request(`/races/${encodeURIComponent(raceId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function attachRaceGpx(raceId, file, token) {
  const formData = new FormData()
  formData.append('file', file)
  return request(`/races/${encodeURIComponent(raceId)}/gpx`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  })
}

export function submitRaceResults(raceId, file, token) {
  const formData = new FormData()
  formData.append('file', file)
  return request(`/races/${encodeURIComponent(raceId)}/results`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  })
}

export function analyzeGpx(file, finishTimeSeconds) {
  const formData = new FormData()
  formData.append('file', file)
  if (finishTimeSeconds != null) {
    formData.append('finish_time_seconds', String(finishTimeSeconds))
  }
  return request('/gpx/analyze', { method: 'POST', body: formData })
}

/** Validate a results file and score it against a course file, with no account (nothing is created on OTRI until the organizer publishes). */
export function scoreRace({ results, gpx, raceName }) {
  const formData = new FormData()
  formData.append('results', results)
  formData.append('gpx', gpx)
  if (raceName) formData.append('race_name', raceName)
  return request('/score', { method: 'POST', body: formData })
}

/** Stores an uploaded GPX (with the user's consent, on "Share") so a calculator link can reopen it. */
export function shareGpx(file, name) {
  const formData = new FormData()
  formData.append('file', file)
  if (name) formData.append('name', name)
  return request('/gpx/share', { method: 'POST', body: formData })
}

/** The GPX behind a share link, as a File so it can be analysed like an upload. */
export async function fetchSharedGpxFile(shareId, name) {
  const response = await fetch(`${API_BASE_URL}/gpx/shared/${encodeURIComponent(shareId)}`)
  if (response.status === 404) throw new Error('This shared course is no longer available.')
  if (!response.ok) throw new Error(`Could not load the shared course (HTTP ${response.status}).`)
  const text = await response.text()
  return new File([text], `${name || shareId}.gpx`, { type: 'application/gpx+xml' })
}

export function getRace(raceId) {
  // A race that is not public yet answers only to its owner.
  return request(`/races/${encodeURIComponent(raceId)}`, { headers: authHeaders(sessionToken()) })
}

/** The stored, versioned measurement for a race with an attached GPX (404 if none). */
export function getRaceMeasurement(raceId, token) {
  return request(`/races/${encodeURIComponent(raceId)}/measurement`, token ? { headers: authHeaders(token) } : undefined)
}

/** Make a race's results, course and measurement public (owner or admin). */
export function publishRace(raceId, token) {
  return request(`/races/${encodeURIComponent(raceId)}/publish`, { method: 'POST', headers: authHeaders(token) })
}

export function unpublishRace(raceId, token) {
  return request(`/races/${encodeURIComponent(raceId)}/publish`, { method: 'DELETE', headers: authHeaders(token) })
}

/** Every event on the platform with owners and publish state. Admin only. */
export function listAdminEvents(token) {
  return request('/admin/events', { headers: authHeaders(token) })
}

/** Runners with published results: all (by index) or a name search. */
export function listRunners(query) {
  // Up to the API's maximum so the page's search and filters cover every runner; the page renders 25 at a time.
  const params = query ? `?q=${encodeURIComponent(query)}&limit=500` : '?limit=500'
  return request(`/runners${params}`)
}

/** A runner's profile: published results with the index and each result's weight. */
export function getRunner(runnerId) {
  return request(`/runners/${encodeURIComponent(runnerId)}`)
}

export function getAdminOverview(token) {
  return request('/admin/overview', { headers: authHeaders(token) })
}

/** A correction or removal request from the public site (no account needed). */
export function submitReport(payload) {
  return request('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
}

export function listAdminReports(token, status = 'open') {
  return request(`/admin/reports?status=${encodeURIComponent(status)}`, { headers: authHeaders(token) })
}

export function resolveAdminReport(reportId, resolution, token) {
  return request(`/admin/reports/${reportId}/resolve`, { method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ resolution }) })
}

export function deleteAdminReport(reportId, token) {
  return request(`/admin/reports/${reportId}`, { method: 'DELETE', headers: authHeaders(token) })
}

export function deleteAdminRunner(runnerId, token) {
  return request(`/admin/runners/${encodeURIComponent(runnerId)}`, { method: 'DELETE', headers: authHeaders(token) })
}

export function getAdminServer(token) {
  return request('/admin/server', { headers: authHeaders(token) })
}

export function listAdminOrganizers(token) {
  return request('/admin/organizers', { headers: authHeaders(token) })
}

export function verifyAdminOrganizer(organizerId, token) {
  return request(`/admin/organizers/${organizerId}/verify`, { method: 'POST', headers: authHeaders(token) })
}

export function deleteAdminOrganizer(organizerId, token) {
  return request(`/admin/organizers/${organizerId}`, { method: 'DELETE', headers: authHeaders(token) })
}

/** Admin: the courses hand-picked for the calculator's "Pick a race". */
export function listCalculatorCourses(token) {
  return request('/admin/calculator-courses', { headers: authHeaders(token) })
}

export function addCalculatorCourse({ file, event_name, course_name, location, country, source_url }, token) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('event_name', event_name.trim())
  formData.append('course_name', course_name.trim())
  if (location?.trim()) formData.append('location', location.trim())
  if (country?.trim()) formData.append('country', country.trim())
  if (source_url?.trim()) formData.append('source_url', source_url.trim())
  return request('/admin/calculator-courses', { method: 'POST', headers: authHeaders(token), body: formData })
}

/** Change a calculator course; `file` is optional and replaces its GPX. Empty fields are cleared. */
export function updateCalculatorCourse(raceId, { file, event_name, course_name, location, country, source_url }, token) {
  const formData = new FormData()
  if (file) formData.append('file', file)
  formData.append('event_name', event_name.trim())
  formData.append('course_name', course_name.trim())
  formData.append('location', (location ?? '').trim())
  formData.append('country', (country ?? '').trim())
  formData.append('source_url', (source_url ?? '').trim())
  return request(`/admin/calculator-courses/${encodeURIComponent(raceId)}`, { method: 'PATCH', headers: authHeaders(token), body: formData })
}

export function deleteCalculatorCourse(raceId, token) {
  return request(`/admin/calculator-courses/${encodeURIComponent(raceId)}`, { method: 'DELETE', headers: authHeaders(token) })
}

/** A link that downloads a race's course file: sanitized by the API (positions and elevations only). */
export function raceGpxDownloadUrl(raceId) {
  return `${API_BASE_URL}/races/${encodeURIComponent(raceId)}/gpx?download=1`
}

export function listSharedCourses(token) {
  return request('/admin/shared-courses', { headers: authHeaders(token) })
}

export function deleteSharedCourse(shareId, token) {
  return request(`/admin/shared-courses/${encodeURIComponent(shareId)}`, { method: 'DELETE', headers: authHeaders(token) })
}

/** The signed-in organizer with current admin/demo flags. */
export function getMe(token) {
  return request('/auth/me', { headers: authHeaders(token) })
}

/** Scored results for a race; resolves to [] when none have been submitted yet. Unpublished
 * races need the owner's (or an admin's) token. */
export async function getRaceResults(raceId, token) {
  const response = await fetch(`${API_BASE_URL}/races/${encodeURIComponent(raceId)}/results`, withCredentials({ headers: authHeaders(token) }))
  if (response.status === 404) return []
  if (response.status === 403) throw new Error('This race has not been published by its organizer.')
  if (!response.ok) throw new Error(response.statusText)
  return response.json()
}

export function listRaces() {
  return request('/races')
}

/** Owner or admin: show a race publicly before it has results, or take the listing down. */
export function setRaceListed(raceId, listed, token) {
  return request(`/races/${encodeURIComponent(raceId)}/listing`, { method: listed ? 'POST' : 'DELETE', headers: authHeaders(token) })
}

/** The live API's root status, including `started_at` — the last time this API process
 * (re)started, i.e. the last deploy/restart. */
export function getApiStatus() {
  return request('/')
}

/** Fetches a race's attached GPX as a File, so it can be reused with analyzeGpx()
 * exactly like a user-uploaded file (used by the "search existing race" calculator path). */
export async function fetchRaceGpxFile(raceId, token) {
  const response = await fetch(`${API_BASE_URL}/races/${encodeURIComponent(raceId)}/gpx`, withCredentials({ headers: authHeaders(token) }))
  if (!response.ok) {
    throw new Error(`Could not load the course for this race (HTTP ${response.status}).`)
  }
  const text = await response.text()
  return new File([text], `${raceId}.gpx`, { type: 'application/gpx+xml' })
}
