import { useEffect, useMemo, useRef, useState } from 'react'
import Flag from './Flag'
import { Timer, Trophy } from 'lucide-react'

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
const ROW_PX = 112
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

function EqualsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false" className="shrink-0 text-slate-400">
      <path d="M4 7h12M4 13h12" />
    </svg>
  )
}

function Row({ item }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5 px-3.5 text-center sm:px-4" style={{ height: ROW_PX }}>
      <span className="flex min-w-0 items-center justify-center gap-2">
        <Flag code={item.country} showCode={false} className="shrink-0 [&>span]:text-[16px]" />
        <span className="min-w-0 text-[15px] font-bold leading-tight tracking-[-.02em] text-[#0b1220]">{item.name}</span>
      </span>
      <span className="text-[12px] leading-tight text-slate-500">
        {item.race} {item.year}
      </span>
      <span className="flex min-w-0 items-center justify-center gap-2 font-mono text-[12px] tabular-nums">
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-slate-600" title="Finish time">
          <Timer size={13} className="shrink-0" aria-hidden="true" />
          <span>{item.time}</span>
        </span>
        <EqualsIcon />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0b1220] px-2 py-1 text-white" title="Illustrative OTRI score">
          <span className="text-[10px] font-semibold tracking-wide">OTRI</span>
          <b className="text-[13px]">{item.score}</b>
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
      className={`w-full max-w-[300px] select-none ${className}`}
    >
      <div className="overflow-hidden rounded-2xl border border-[#d8c59e] bg-linear-to-b from-[#fffdf7] to-white shadow-[0_6px_20px_rgba(110,83,35,.08)]">
        <div className="mx-5 flex items-center justify-center gap-2 border-b border-[#e9dfca] pb-2 pt-3 text-[#8a682c]">
          <Trophy size={13} strokeWidth={1.6} aria-hidden="true" />
          <span className="text-[9px] font-semibold uppercase tracking-[.2em]">Race winner</span>
        </div>
        <div className="overflow-hidden" style={{ height: ROW_PX }}>
          <div style={{ transform: `translateY(-${index * ROW_PX}px)`, transition }}>
            {rows.map((item, i) => (
              <Row key={`${item.name}-${i}`} item={item} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[.12em] text-slate-400">Illustrative example scores</p>
    </div>
  )
}
