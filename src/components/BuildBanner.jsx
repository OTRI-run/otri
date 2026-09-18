import { useEffect, useState } from 'react'

// "Built from commit … · API last restarted …" — the same strip on the bottom of every page.
// Commit facts are injected at build time by vite.config.js; the API's start time comes from
// its root endpoint. On the static landing page the API may simply be unreachable: say so.
const COMMIT = typeof __OTRI_COMMIT__ !== 'undefined' ? __OTRI_COMMIT__ : 'unknown'
const COMMIT_FULL = typeof __OTRI_COMMIT_FULL__ !== 'undefined' ? __OTRI_COMMIT_FULL__ : ''
const COMMIT_DATE = typeof __OTRI_COMMIT_DATE__ !== 'undefined' ? __OTRI_COMMIT_DATE__ : ''
const COMMIT_URL = COMMIT_FULL ? `https://github.com/OTRI-run/otri/commit/${COMMIT_FULL}` : null
const API_BASE_URL = import.meta.env.VITE_OTRI_API_BASE_URL || 'http://localhost:8000'

export function formatTimeAgo(isoDate) {
  if (!isoDate) return null
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [label, secondsInUnit] of units) {
    const value = Math.floor(seconds / secondsInUnit)
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export default function BuildBanner() {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(COMMIT_DATE))
  const [apiStartedAt, setApiStartedAt] = useState(null)
  const [apiTimeAgo, setApiTimeAgo] = useState(null)
  const [apiUnreachable, setApiUnreachable] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setTimeAgo(formatTimeAgo(COMMIT_DATE)), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE_URL}/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
      .then((status) => {
        if (!cancelled) setApiStartedAt(status.started_at)
      })
      .catch(() => {
        if (!cancelled) setApiUnreachable(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!apiStartedAt) return undefined
    setApiTimeAgo(formatTimeAgo(apiStartedAt))
    const id = setInterval(() => setApiTimeAgo(formatTimeAgo(apiStartedAt)), 60_000)
    return () => clearInterval(id)
  }, [apiStartedAt])

  return (
    <div className="bg-[#0b1220] px-4 text-center font-mono text-[10px] leading-7 text-slate-300">
      Built from commit{' '}
      {COMMIT_URL ? (
        <a href={COMMIT_URL} target="_blank" rel="noreferrer" className="font-semibold text-white underline underline-offset-2">
          {COMMIT}
        </a>
      ) : (
        <span className="font-semibold text-white">{COMMIT}</span>
      )}
      {timeAgo ? ` · ${timeAgo}` : ''}
      {apiStartedAt && ` · API last restarted ${apiTimeAgo}`}
      {apiUnreachable && ' · API unreachable'}
    </div>
  )
}
