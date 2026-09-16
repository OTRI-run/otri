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
  return response.json()
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

export function createRace(payload, token) {
  return request('/races', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
}

export function submitRaceResults(raceId, file, token) {
  const formData = new FormData()
  formData.append('file', file)
  return request(`/races/${encodeURIComponent(raceId)}/results`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
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
