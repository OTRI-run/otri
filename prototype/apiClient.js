/**
 * Minimal fetch wrapper for the OTRI API, used only by the prototype (the
 * production marketing site never calls a live backend).
 *
 * Configure the target with VITE_OTRI_API_BASE_URL (see .env.example).
 * Defaults to the local FastAPI dev server.
 */

export const API_BASE_URL = import.meta.env.VITE_OTRI_API_BASE_URL || 'http://localhost:8000'

async function request(path, options) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch (networkError) {
    throw new Error(`Could not reach the API at ${API_BASE_URL} (${networkError.message}). Is it running?`)
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      // response had no JSON body; keep statusText
    }
    throw new Error(detail)
  }
  if (response.status === 204) return null
  return response.json()
}

function authHeaders(token, extra) {
  return { Authorization: `Bearer ${token}`, ...extra }
}

export function registerOrganizer(email, password) {
  return request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export function loginOrganizer(email, password) {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
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
  return request(`/events/${encodeURIComponent(eventId)}`)
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
  return request(`/races/${encodeURIComponent(raceId)}`)
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
  const params = query ? `?q=${encodeURIComponent(query)}` : ''
  return request(`/runners${params}`)
}

/** A runner's profile: published results with the index and each result's weight. */
export function getRunner(runnerId) {
  return request(`/runners/${encodeURIComponent(runnerId)}`)
}

/** The signed-in organizer with current admin/demo flags. */
export function getMe(token) {
  return request('/auth/me', { headers: authHeaders(token) })
}

/** Scored results for a race; resolves to [] when none have been submitted yet. Unpublished
 * races need the owner's (or an admin's) token. */
export async function getRaceResults(raceId, token) {
  const response = await fetch(`${API_BASE_URL}/races/${encodeURIComponent(raceId)}/results`, token ? { headers: authHeaders(token) } : undefined)
  if (response.status === 404) return []
  if (response.status === 403) throw new Error('This race has not been published by its organizer.')
  if (!response.ok) throw new Error(response.statusText)
  return response.json()
}

export function listRaces() {
  return request('/races')
}

/** The live API's root status, including `started_at` — the last time this API process
 * (re)started, i.e. the last deploy/restart. */
export function getApiStatus() {
  return request('/')
}

/** Fetches a race's attached GPX as a File, so it can be reused with analyzeGpx()
 * exactly like a user-uploaded file (used by the "search existing race" calculator path). */
export async function fetchRaceGpxFile(raceId, token) {
  const response = await fetch(`${API_BASE_URL}/races/${encodeURIComponent(raceId)}/gpx`, token ? { headers: authHeaders(token) } : undefined)
  if (!response.ok) {
    throw new Error(`Could not load the course for this race (HTTP ${response.status}).`)
  }
  const text = await response.text()
  return new File([text], `${raceId}.gpx`, { type: 'application/gpx+xml' })
}
