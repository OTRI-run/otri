// Counting visits, without following anybody.
//
// OTRI counts its own readers rather than handing them to somebody else's analytics. Nothing is
// written to the browser: no cookie, no localStorage, no identifier of any kind. The API turns the
// address and the browser string into a digest that contains today's date and throws both away,
// so the same person tomorrow is a different number and no two days can be joined. See
// api/analytics.py.
//
// The beacon is fire-and-forget. If it fails, is blocked, or is switched off, the page behaves
// exactly as it does now: nothing here is on the path to anything a visitor came for.

import { API_BASE_URL } from '../../prototype/apiClient'

/** Whether this visitor has asked not to be counted. Both of the signals browsers send for it. */
function askedNotToBeCounted() {
  try {
    const dnt = window.doNotTrack ?? navigator.doNotTrack ?? navigator.msDoNotTrack
    // Global Privacy Control is the one with legal weight in some places; Do Not Track is the one
    // most people have actually heard of. OTRI keeps nothing personal either way, so honouring
    // them costs a count and nothing else.
    return navigator.globalPrivacyControl === true || dnt === '1' || dnt === 'yes'
  } catch {
    return false
  }
}

function send(body) {
  const url = `${API_BASE_URL}/site/hit`
  const payload = JSON.stringify(body)
  try {
    // sendBeacon survives the page being closed, which a fetch does not. It posts as plain text so
    // it never asks for a CORS preflight; the API reads the body, not the content type.
    if (navigator.sendBeacon?.(url, new Blob([payload], { type: 'text/plain;charset=UTF-8' }))) return
  } catch {
    // fall through
  }
  try {
    fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, mode: 'cors' }).catch(() => {})
  } catch {
    // a page that cannot count is still a page
  }
}

/** The page as its shape, not as one particular race: the API drops ids too, this saves the trip. */
function here() {
  const { pathname, hash } = window.location
  return (pathname + (hash || '')).slice(0, 200)
}

let last = null

/** Count this page view. Called on load and on every route change. */
export function pageView() {
  if (askedNotToBeCounted()) return
  const path = here()
  if (path === last) return // a hash change that did not change the page
  last = path
  let zone = ''
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    zone = ''
  }
  send({ p: path, r: document.referrer || '', tz: zone })
}

/**
 * Count something worth counting: a score worked out, a course measured, a race scored. The list
 * of names the API accepts is fixed (api/analytics.py ACTIONS); anything else is dropped there.
 */
export function action(name) {
  if (askedNotToBeCounted()) return
  send({ p: here(), e: name })
}

/** Count the page now, and again whenever the route changes. Safe to call more than once. */
let watching = false
export function countPages() {
  pageView()
  if (watching) return
  watching = true
  window.addEventListener('hashchange', pageView)
  window.addEventListener('popstate', pageView)
}
