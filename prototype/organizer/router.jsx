import { willNavigate } from '../../src/lib/comfort'
import { useEffect, useState } from 'preact/compat'

// Hash routing, on purpose: the site is static on GitHub Pages, so `/prototype/organizer/#/verify?token=…`
// is a URL an email can point at and a refresh can return to, with no server-side rewrites.

function parseHash(hash) {
  const raw = (hash || '#/').replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  const segments = path.split('/').filter(Boolean)
  const query = Object.fromEntries(new URLSearchParams(queryPart).entries())
  return { path, segments, query }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to, { replace = false } = {}) {
  willNavigate() // the next page opens at its top (src/lib/comfort.js)
  const target = to.startsWith('#') ? to : `#${to}`
  if (replace) {
    window.location.replace(`${window.location.pathname}${window.location.search}${target}`)
  } else {
    window.location.hash = target
  }
}

export function Link({ to, className = '', children, ...rest }) {
  const href = to.startsWith('#') ? to : `#${to}`
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  )
}

/** Matches `/events/:id/races/new` style patterns against the current path. */
export function match(pattern, path) {
  const expected = pattern.split('/').filter(Boolean)
  const actual = path.split('/').filter(Boolean)
  if (expected.length !== actual.length) return null
  const params = {}
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i])
    else if (expected[i] !== actual[i]) return null
  }
  return params
}
