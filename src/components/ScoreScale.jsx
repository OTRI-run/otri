import React from 'react'
import { LEVELS, levelFor, marathonSecondsForShare, nextLevel, shareForScore } from '../lib/scoreLevels'

// Where a score stands: a scale from Beginner to World class with the score marked on it. For the
// dark score panel of the calculator. What the bands mean is in src/lib/scoreLevels.js.

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

export default function ScoreScale({ score, share, exponent, targetSeconds, timeForScore }) {
  const level = levelFor(score)
  const next = nextLevel(score)
  const bands = [...LEVELS].reverse() // left to right
  const marathon = marathonSecondsForShare(share ?? shareForScore(score, exponent))
  const nextTime = next && timeForScore ? timeForScore(next.from) : null
  const faster = nextTime && targetSeconds ? targetSeconds - nextTime : null

  return (
    <div className="mx-auto mt-5 w-full max-w-[340px] text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[19px] font-bold tracking-[-.03em] text-white">{level.name}</span>
        <span className="font-mono text-[9px] tracking-[.08em] text-slate-400">
          {level.from >= 1000 ? 'ABOVE 1000' : level.from === 0 ? 'BELOW 300' : `${level.from} TO ${level.from + 99}`}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-[1.45] text-slate-300">{level.blurb}</p>

      <div
        className="relative mt-7"
        role="img"
        aria-label={`Score ${score} on a scale from Beginner, below 300, through World class at 900, and open above 1000: ${level.name}.`}
      >
        <div className="pointer-events-none absolute -top-[22px] -translate-x-1/2 transition-[left] duration-300" style={{ left: position(score) }}>
          <span className="block rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-[#0b1220] shadow">{score}</span>
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
        <div className="relative mt-1 h-3 font-mono text-[8px] text-slate-500">
          {[300, 500, 700, 900].map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2" style={{ left: position(tick) }}>{tick}</span>
          ))}
          <span className="absolute -translate-x-1/2 text-slate-300" style={{ left: position(1000) }}>1000</span>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] tracking-[.08em] text-slate-500">
          <span>BEGINNER</span>
          <span>WORLD RECORD ↑</span>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-slate-700/70 pt-3 text-[12px] leading-[1.45] text-slate-300">
        {marathon && score < 1000 && (
          <li>
            On a flat road marathon, the same share of world-record speed is <strong className="font-mono text-white">{hms(marathon)}</strong>.
          </li>
        )}
        {next && nextTime && faster > 0 && (
          <li>
            <strong className="text-white">{next.name}</strong> starts at {next.from}: <strong className="font-mono text-white">{hms(nextTime)}</strong> here, {hms(faster)} faster.
          </li>
        )}
      </ul>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none font-mono text-[9px] tracking-[.08em] text-blue-300 hover:text-white">
          <span className="group-open:hidden">ALL LEVELS +</span>
          <span className="hidden group-open:inline">ALL LEVELS −</span>
        </summary>
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-left font-mono text-[8px] tracking-[.06em] text-slate-500">
              <th className="pb-1 font-medium">LEVEL</th>
              <th className="pb-1 text-right font-medium">SCORE</th>
              <th className="pb-1 text-right font-medium">ROAD MARATHON</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((band, index) => {
              const slow = band.from > 0 ? marathonSecondsForShare(shareForScore(band.from, exponent)) : null
              const fast = index > 0 ? marathonSecondsForShare(shareForScore(LEVELS[index - 1].from, exponent)) : null
              const range = band.from >= 1000 ? `under ${hm(slow)}` : band.from === 0 ? `over ${hm(fast)}` : `${hm(fast)} to ${hm(slow)}`
              return (
                <tr key={band.id} className={`border-t border-slate-700/50 ${band.id === level.id ? 'text-white' : 'text-slate-400'}`}>
                  <td className="py-1">
                    <i className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: FILL[band.id] }} />
                    {band.name}
                  </td>
                  <td className="py-1 text-right font-mono">{band.from >= 1000 ? '1000+' : band.from === 0 ? 'under 300' : `${band.from} to ${band.from + 99}`}</td>
                  <td className="py-1 text-right font-mono">{range}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] leading-[1.5] text-slate-500">
          The names are a reading aid; the numbers are exact. A score is a share of the fastest pace a human has held on a course this demanding, and the road marathon column is that same share of the marathon world best (2:00:35). One scale for everyone. Rough ground is not measured yet, so on technical trails scores run a little under these road times.
        </p>
      </details>
    </div>
  )
}
