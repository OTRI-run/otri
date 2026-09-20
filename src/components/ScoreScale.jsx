import './ScoreScale.css'
import React from 'preact/compat'
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
    <div className="src-components-score-scale-score-scale-div-1">
      <div className="src-components-score-scale-score-scale-div-2">
        <span className="src-components-score-scale-score-scale-span-3">{level.name}</span>
        <span className="src-components-score-scale-score-scale-span-4">
          {level.from >= 1000 ? 'ABOVE 1000' : level.from === 0 ? 'BELOW 300' : `${level.from} TO ${level.from + 99}`}
        </span>
      </div>
      <p className="src-components-score-scale-score-scale-p-5">{level.blurb}</p>

      <div
        className="src-components-score-scale-score-scale-div-6"
        role="img"
        aria-label={`Score ${score} on a scale from Beginner, below 300, to World class, 900 to 1000: ${level.name}.`}
      >
        <div className="src-components-score-scale-score-scale-div-7" style={{ left: position(score) }}>
          <span className="src-components-score-scale-score-scale-span-8">{score}</span>
          <span className="src-components-score-scale-score-scale-span-9" />
        </div>
        <div className="src-components-score-scale-score-scale-div-10">
          {bands.map((band, index) => {
            const from = index === 0 ? AXIS_FROM : band.from
            const to = index === bands.length - 1 ? AXIS_TO : bands[index + 1].from
            const active = band.id === level.id
            return <span key={band.id} title={band.name} style={{ width: `${((to - from) / (AXIS_TO - AXIS_FROM)) * 100}%`, background: FILL[band.id], opacity: active ? 1 : 0.7, outline: active ? '2px solid #fff' : 'none', outlineOffset: '-2px' }} />
          })}
        </div>
        <div className="src-components-score-scale-score-scale-div-11">
          {[300, 500, 700, 900].map((tick) => (
            <span key={tick} className="src-components-score-scale-score-scale-span-12" style={{ left: position(tick) }}>{tick}</span>
          ))}
          <span className="src-components-score-scale-score-scale-span-13" style={{ left: position(1000) }}>1000</span>
        </div>
        <div className="src-components-score-scale-score-scale-div-14">
          <span>BEGINNER</span>
          <span>WORLD RECORD ↑</span>
        </div>
      </div>

      <ul className="src-components-score-scale-score-scale-ul-15">
        {marathon && score < 1000 && (
          <li>
            On a flat road marathon, the same share of world-record speed is <strong className="src-components-score-scale-score-scale-strong-16">{hms(marathon)}</strong>.
          </li>
        )}
        {next && nextTime && faster > 0 && (
          <li>
            <strong className="src-components-score-scale-score-scale-strong-17">{next.name}</strong> starts at {next.from}: <strong className="src-components-score-scale-score-scale-strong-16">{hms(nextTime)}</strong> here, {hms(faster)} faster.
          </li>
        )}
      </ul>

      <details className="src-components-score-scale-score-scale-details-18 otri-group">
        <summary className="src-components-score-scale-score-scale-summary-19">
          <span className="src-components-score-scale-score-scale-span-20">ALL LEVELS +</span>
          <span className="src-components-score-scale-score-scale-span-21">ALL LEVELS −</span>
        </summary>
        <table className="src-components-score-scale-score-scale-table-22">
          <thead>
            <tr className="src-components-score-scale-score-scale-tr-23">
              <th className="src-components-score-scale-score-scale-th-24">LEVEL</th>
              <th className="src-components-score-scale-score-scale-th-25">SCORE</th>
              <th className="src-components-score-scale-score-scale-th-25">ROAD MARATHON</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((band, index) => {
              const slow = band.from > 0 ? marathonSecondsForShare(shareForScore(band.from, exponent)) : null
              const fast = index > 0 ? marathonSecondsForShare(shareForScore(LEVELS[index - 1].from, exponent)) : null
              const range = band.from >= 1000 ? `under ${hm(slow)}` : band.from === 0 ? `over ${hm(fast)}` : `${hm(fast)} to ${hm(slow)}`
              return (
                <tr key={band.id} className={`src-components-score-scale-score-scale-tr-26 ${band.id === level.id ? "src-components-score-scale-score-scale-strong-17" : "src-components-score-scale-score-scale-tr-27"}`}>
                  <td className="src-components-score-scale-score-scale-td-28">
                    <i className="src-components-score-scale-score-scale-i-29" style={{ background: FILL[band.id] }} />
                    {band.name}
                  </td>
                  <td className="src-components-score-scale-score-scale-td-30">{band.from >= 1000 ? '1000+' : band.from === 0 ? 'under 300' : `${band.from} to ${band.from + 99}`}</td>
                  <td className="src-components-score-scale-score-scale-td-30">{range}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="src-components-score-scale-score-scale-p-31">
          The names are a reading aid; the numbers are exact. A score is a share of the fastest pace a human has held on a course this demanding, and the road marathon column is that same share of the marathon world best (2:00:35). One scale for everyone. Rough ground is not measured yet, so on technical trails scores run a little under these road times.
        </p>
      </details>
    </div>
  )
}
