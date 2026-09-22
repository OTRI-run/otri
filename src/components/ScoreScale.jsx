import React from 'react'
import { LEVELS, levelFor, marathonSecondsForShare, nextLevel, shareForScore } from '../lib/scoreLevels'

// Where a score stands: a scale from Beginner to World class with the score marked on it. For the
// dark score panel of the calculator. What the bands mean is in src/lib/scoreLevels.js.
//
// Type sizes here have a floor of 11px and every value outranks its own label. The first version
// set axis ticks and captions at 8px in slate-500 on a near-black panel, which is under three to
// one for contrast and unreadable on a phone held at arm's length -- on the one screen whose whole
// job is to be read.

const AXIS_FROM = 200 // everything below is one band anyway; starting here gives the others room
const AXIS_TO = 1100 // room to show a score above 1000 as what it is
const position = (score) => `${((Math.min(AXIS_TO, Math.max(AXIS_FROM, score)) - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100}%`

// Light to deep along the scale; the band above the record is the cyan the panel uses for "above 1000".
const FILL = { beginner: '#334e7a', recreational: '#2f5c9e', intermediate: '#2a69c4', trained: '#2f74ee', advanced: '#4b8df8', expert: '#6ea8fb', elite: '#9cc4fd', world: '#dbeafe', beyond: '#67e8f9' }

function hms(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function hm(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

function bandRange(band) {
  if (band.from >= 1000) return 'above 1000'
  if (band.from === 0) return 'below 300'
  return `${band.from}–${band.from + 99}`
}

export default function ScoreScale({ score, share, exponent, targetSeconds, timeForScore }) {
  const level = levelFor(score)
  const next = nextLevel(score)
  const bands = [...LEVELS].reverse() // left to right
  const marathon = marathonSecondsForShare(share ?? shareForScore(score, exponent))
  const nextTime = next && timeForScore ? timeForScore(next.from) : null
  const faster = nextTime && targetSeconds ? targetSeconds - nextTime : null

  return (
    <div className="mx-auto mt-6 w-full max-w-[360px] text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[20px] font-bold tracking-[-.03em] text-white">{level.name}</span>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-200">{bandRange(level)}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-slate-200">{level.blurb}</p>

      <div
        className="relative mt-8"
        role="img"
        aria-label={`Score ${score} on a scale from Beginner, below 300, through World class at 900, and open above 1000: ${level.name}.`}
      >
        <div className="pointer-events-none absolute -top-[24px] -translate-x-1/2 transition-[left] duration-300" style={{ left: position(score) }}>
          <span className="block rounded-md bg-white px-2 py-0.5 font-mono text-[12px] font-bold leading-tight text-[#0b1220] shadow">{score}</span>
          <span className="mx-auto block h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-white" />
        </div>
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
          {bands.map((band, index) => {
            const from = index === 0 ? AXIS_FROM : band.from
            const to = index === bands.length - 1 ? AXIS_TO : bands[index + 1].from
            const active = band.id === level.id
            return <span key={band.id} title={band.name} style={{ width: `${((to - from) / (AXIS_TO - AXIS_FROM)) * 100}%`, background: FILL[band.id], opacity: active ? 1 : 0.7, outline: active ? '2px solid #fff' : 'none', outlineOffset: '-2px' }} />
          })}
        </div>
        <div className="relative mt-1.5 h-4 font-mono text-[11px] text-slate-400">
          {[300, 500, 700, 900].map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2" style={{ left: position(tick) }}>{tick}</span>
          ))}
          <span className="absolute -translate-x-1/2 font-semibold text-slate-200" style={{ left: position(1000) }}>1000</span>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
          <span>Beginner</span>
          <span>Record run</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2 border-t border-white/15 pt-4 text-[13px] leading-[1.5] text-slate-200">
        {marathon && score < 1000 && (
          <li>
            The same share of record-run speed on a flat road marathon is{' '}
            <strong className="font-mono font-semibold text-white">{hms(marathon)}</strong>.
          </li>
        )}
        {next && nextTime && faster > 0 && (
          <li>
            <strong className="font-semibold text-white">{next.name}</strong> starts at {next.from}. That is{' '}
            <strong className="font-mono font-semibold text-white">{hms(nextTime)}</strong> here, {hms(faster)} faster.
          </li>
        )}
      </ul>

      <details className="group mt-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-[13px] font-semibold text-blue-200 hover:bg-white/10 hover:text-white">
          <span className="text-[15px] leading-none transition-transform group-open:rotate-45">+</span>
          <span className="group-open:hidden">Show all levels</span>
          <span className="hidden group-open:inline">Hide all levels</span>
        </summary>
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
              <th className="pb-1.5 font-semibold">Level</th>
              <th className="pb-1.5 text-right font-semibold">Score</th>
              <th className="pb-1.5 text-right font-semibold">Road marathon</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((band, index) => {
              const slow = band.from > 0 ? marathonSecondsForShare(shareForScore(band.from, exponent)) : null
              const fast = index > 0 ? marathonSecondsForShare(shareForScore(LEVELS[index - 1].from, exponent)) : null
              const range = band.from >= 1000 ? `under ${hm(slow)}` : band.from === 0 ? `over ${hm(fast)}` : `${hm(fast)} to ${hm(slow)}`
              const here = band.id === level.id
              return (
                <tr key={band.id} className={`border-t border-white/10 ${here ? 'font-semibold text-white' : 'text-slate-300'}`}>
                  <td className="py-1.5">
                    <i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: FILL[band.id] }} />
                    {band.name}
                  </td>
                  <td className="py-1.5 text-right font-mono">{bandRange(band)}</td>
                  <td className="py-1.5 text-right font-mono">{range}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] leading-[1.6] text-slate-400">
          The names are a reading aid; the numbers are exact. A score is a share of the fastest pace a human has held on a
          course this demanding, and the road marathon column is that same share of the marathon record (2:00:35). One
          scale for everyone. Rough ground is not measured yet, so on technical trails scores run a little under these
          road times.
        </p>
      </details>
    </div>
  )
}
