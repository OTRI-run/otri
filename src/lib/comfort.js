// The small things that make a page comfortable, shared by the public site and the organizer app:
// where the page is scrolled to after a navigation, scrolling to the outcome of an action, and
// files dropped on the page.

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 'smooth', unless the visitor asked their system for less motion. */
export const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth')

/** Bring the outcome of an action into view (a score, a validation report, an error), below the
 * fixed header, once it has been drawn. Does nothing when it is already fully visible. */
export function revealElement(target, { block = 'start', delay = 60, focus = false } = {}) {
  setTimeout(() => {
    const element = typeof target === 'string' ? document.getElementById(target) : target
    if (!element) return
    const box = element.getBoundingClientRect()
    const visible = box.top >= 72 && box.bottom <= window.innerHeight
    if (!visible) element.scrollIntoView({ behavior: scrollBehavior(), block })
    if (focus) {
      if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1')
      element.style.outline = 'none' // focus moves for screen readers and the keyboard; a ring around a whole section helps nobody
      element.focus({ preventScroll: true })
    }
  }, delay)
}

// ---------------------------------------------------------------------------- navigation

let forward = false

/** Call before changing the hash in code: the next page opens at its top. */
export function willNavigate() {
  forward = true
}

/**
 * Hash-routed pages do not get the browser's own scroll handling: a link opened the next page at
 * the scroll position of the last one (a footer link showed the new page's footer), and Back
 * landed at the top of a list instead of where the visitor had been. With this, a link or a
 * navigation in code opens the page at its top, the browser's Back and Forward return to the
 * remembered position, and a hash that names an element on the page is left to the browser.
 */
export function installScrollMemory() {
  if (typeof window === 'undefined' || window.__otriScrollMemory) return
  window.__otriScrollMemory = true
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  const positions = new Map()
  let current = window.location.hash

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest?.('a[href]')
      if (link && link.getAttribute('href').startsWith('#') && !event.defaultPrevented) forward = true
    },
    true,
  )
  let ticking = false
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        positions.set(current, window.scrollY)
        ticking = false
      })
    },
    { passive: true },
  )
  window.addEventListener('hashchange', () => {
    const next = window.location.hash
    const wasForward = forward
    forward = false
    // The same page with another query (a search box or a filter writing itself into the URL).
    const samePage = next.split('?')[0] === current.split('?')[0]
    current = next
    if (samePage) return
    let tries = 0
    const settle = () => {
      const id = decodeURIComponent(next.slice(1).split('?')[0])
      if (id && !id.includes('/') && document.getElementById(id)) return // a place on the page: the browser's job
      const wanted = wasForward ? 0 : positions.get(next) ?? 0
      const reachable = document.documentElement.scrollHeight - window.innerHeight
      // A list that is still loading is too short to scroll back into: wait for it, briefly.
      if (wanted > reachable && tries++ < 25) return void setTimeout(settle, 80)
      window.scrollTo({ top: wanted })
    }
    requestAnimationFrame(settle)
  })
}

// ---------------------------------------------------------------------------- dropped files

/** Without this, a file dropped beside a drop zone makes the browser open it and leave the page,
 * taking whatever was filled in with it. */
export function installDropGuard() {
  if (typeof window === 'undefined' || window.__otriDropGuard) return
  window.__otriDropGuard = true
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
    })
  }
}

/** Does this file fit an <input accept="…"> list such as ".gpx,.csv,text/csv"? */
export function fileMatches(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  return accept
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .some((part) => (part.startsWith('.') ? name.endsWith(part) : part.endsWith('/*') ? file.type.startsWith(part.slice(0, -1)) : file.type === part))
}

// ---------------------------------------------------------------------------- keyboard

/** "/" puts the cursor in the page's search box (races, runners, the FAQ, the calculator's race
 * search), as on most sites with one. Ignored while typing anywhere. */
export function installSearchShortcut() {
  if (typeof window === 'undefined' || window.__otriSearchShortcut) return
  window.__otriSearchShortcut = true
  window.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]')
    if (typing) return
    const box = [...document.querySelectorAll('input[type="search"], input[aria-label^="Search"]')].find((input) => input.offsetParent !== null && !input.disabled)
    if (!box) return
    event.preventDefault()
    box.focus()
    box.select?.()
  })
}

/** Put the cursor in a form's first field when the page opens, except on touch screens, where it
 * would throw the keyboard over the page before it has been read. */
export const autoFocusOnDesktop = typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches
