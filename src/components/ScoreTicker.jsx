import { useEffect, useMemo, useRef, useState } from 'react'
import Flag from './Flag'
import { Timer } from 'lucide-react'

// A slow vertical ticker over the landing headline: one well-known performance at a time, with
// its flag and the score it would carry. Decorative. Nothing here is a link, and it is hidden
// from assistive technology because a region that rewrites itself every few seconds is noise to
// a screen reader; the page says everything it needs to say in words below.
//
// The scores are illustrative, and the strip says so: OTRI has not scored these races, and a
// number shown beside a real athlete's name must not read as a claim about them.

const SHOWCASE = [
  { name: 'Louison Coiffet', country: 'FRA', race: 'Marathon du Mont-Blanc 90 km', year: 2026, time: '9:37:22', score: 946 },
  { name: 'Jim Walmsley', country: 'USA', race: 'Chianti Ultra Trail 120K', year: 2025, time: '9:59:48', score: 935 },
  { name: 'Ben Dhiman', country: 'USA', race: 'UTMB', year: 2026, time: '18:16:29', score: 985 },
  { name: 'Tom Evans', country: 'GBR', race: 'UTMB', year: 2025, time: '19:18:58', score: 972 },
  { name: 'Ruth Croft', country: 'NZL', race: 'UTMB', year: 2025, time: '22:56:23', score: 840 },
  { name: 'Jennifer Lichter', country: 'USA', race: 'Western States 100', year: 2026, time: '15:28:05', score: 840 },
  { name: 'Blandine L’Hirondel', country: 'FRA', race: 'UTMB', year: 2026, time: '21:54:49', score: 843 },
]

// Three lines keep the event and time-to-points comparison within the existing narrow card.
const ROW_PX = 96
const DWELL_MS = 3200
const SLIDE_MS = 550

function shuffled(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function OtriPointsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="12" cy="12" r="9.5" />
      <path d="m5.5 15.5 4.5-6 3 4 2-2.5 3.5 4.5" />
    </svg>
  )
}

function Row({ item }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3.5 sm:px-4" style={{ height: ROW_PX }}>
      <Flag code={item.country} showCode={false} className="shrink-0 [&>span]:text-[20px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
        <span className="truncate text-[14px] font-semibold tracking-[-.01em] text-[#0b1220]">{item.name}</span>
        <span className="text-[12px] text-slate-500">
          {item.race} {item.year}
        </span>
        <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          <span className="inline-flex shrink-0 items-center gap-1 text-slate-600" title="Finish time">
            <Timer size={13} aria-hidden="true" />
            <span>{item.time}</span>
          </span>
          <span className="text-slate-400">=</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#0b1220] px-2 py-1 text-white" title="Illustrative OTRI points">
            <OtriPointsIcon />
            <b className="text-[13px]">{item.score}</b>
            <span className="text-[9px] font-semibold tracking-wide">OTRI pts</span>
          </span>
        </span>
      </span>
    </div>
  )
}

export default function ScoreTicker({ className = '' }) {
  // Shuffled once per visit, so the strip opens on a different name each time.
  const items = useMemo(() => shuffled(SHOWCASE), [])
  // The first row is repeated after the last, so the slide from the end back to the start looks
  // like one more step down rather than a jump up; at the clone the offset is reset unseen.
  const rows = useMemo(() => [...items, items[0]], [items])
  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(true)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(false)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    reduced.current = Boolean(query?.matches)
    const onChange = (e) => (reduced.current = e.matches)
    query?.addEventListener?.('change', onChange)
    return () => query?.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (paused) return undefined
    const timer = setInterval(() => setIndex((i) => i + 1), DWELL_MS + SLIDE_MS)
    return () => clearInterval(timer)
  }, [paused])

  // Reached the clone of the first row: wait for the slide to land, then snap to the real first
  // row with the transition off, and turn it back on for the next step.
  useEffect(() => {
    if (index !== rows.length - 1) return undefined
    const timer = setTimeout(() => {
      setAnimate(false)
      setIndex(0)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)))
    }, SLIDE_MS + 20)
    return () => clearTimeout(timer)
  }, [index, rows.length])

  const transition = animate && !reduced.current ? `transform ${SLIDE_MS}ms cubic-bezier(.2,.7,.2,1)` : 'none'

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`w-full max-w-[400px] select-none ${className}`}
    >
      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-[0_10px_28px_rgba(15,23,42,.05)] backdrop-blur"
        style={{ height: ROW_PX }}
      >
        <div style={{ transform: `translateY(-${index * ROW_PX}px)`, transition }}>
          {rows.map((item, i) => (
            <Row key={`${item.name}-${i}`} item={item} />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[.12em] text-slate-400">Illustrative example scores</p>
    </div>
  )
}
