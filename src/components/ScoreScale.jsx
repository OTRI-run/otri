import './ScoreScale.css'
import React from 'preact/compat'
import { LEVELS, levelFor, marathonSecondsForShare, nextLevel, shareForScore } from '../lib/scoreLevels'

// Where a score stands: a scale from Beginner to World class with the score marked on it. For the
// dark score panel of the calculator. What the bands mean is in src/lib/scoreLevels.js.

const AXIS_FROM = 200 // everything below is one band anyway; starting here gives the others room
const AXIS_TO = 1100 // room to show a score above 1000 as what it is
const position = (score) => `${((Math.min(AXIS_TO, Math.max(AXIS_FROM, score)) - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100}%`

// The bands are a calibrated ramp, left to right: deep ice cyan up to volt at the record end. The
// fill is drawn by the stylesheet from each band's index (`--i`), see ScoreScale.css.
const bandIndex = (band) => LEVELS.length - 1 - LEVELS.indexOf(band)

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
    <div className="score-scale">
      <div className="cluster cluster--between cluster--baseline score-scale__head">
        <span className="score-scale__level">{level.name}</span>
        <span className="mono score-scale__range">
          {level.from >= 1000 ? 'ABOVE 1000' : level.from === 0 ? 'BELOW 300' : `${level.from} TO ${level.from + 99}`}
        </span>
      </div>
      <p className="small muted mt-2 score-scale__blurb">{level.blurb}</p>

      <div
        className="score-scale__axis"
        role="img"
        aria-label={`Score ${score} on a scale from Beginner, below 300, to World class, 900 to 1000: ${level.name}.`}
      >
        <div className="score-scale__marker" style={{ left: position(score) }}>
          <span className="score-scale__marker-value">{score}</span>
          <span className="score-scale__marker-tip" />
        </div>
        <div className="score-scale__bands">
          {bands.map((band, index) => {
            const from = index === 0 ? AXIS_FROM : band.from
            const to = index === bands.length - 1 ? AXIS_TO : bands[index + 1].from
            const active = band.id === level.id
            return (
              <span
                key={band.id}
                title={band.name}
                className={`score-scale__band ${active ? 'is-active' : ''} ${band.from >= 1000 ? 'score-scale__band--record' : ''}`}
                style={{ width: `${((to - from) / (AXIS_TO - AXIS_FROM)) * 100}%`, '--i': bandIndex(band) }}
              />
            )
          })}
        </div>
        <div className="score-scale__ticks">
          {[300, 500, 700, 900].map((tick) => (
            <span key={tick} style={{ left: position(tick) }}>{tick}</span>
          ))}
          <span className="score-scale__tick--record" style={{ left: position(1000) }}>1000</span>
        </div>
        <div className="score-scale__ends">
          <span>BEGINNER</span>
          <span>WORLD RECORD ↑</span>
        </div>
      </div>

      <ul className="score-scale__notes small muted">
        {marathon && score < 1000 && (
          <li>
            On a flat road marathon, the same share of world-record speed is <strong className="mono ink">{hms(marathon)}</strong>.
          </li>
        )}
        {next && nextTime && faster > 0 && (
          <li>
            <strong className="ink">{next.name}</strong> starts at {next.from}: <strong className="mono ink">{hms(nextTime)}</strong> here, {hms(faster)} faster.
          </li>
        )}
      </ul>

      <details className="details details--plain details--quiet score-scale__more">
        <summary>
          <span className="score-scale__more-closed">ALL LEVELS +</span>
          <span className="score-scale__more-open">ALL LEVELS −</span>
        </summary>
        <table className="score-scale__table">
          <thead>
            <tr>
              <th>LEVEL</th>
              <th className="right">SCORE</th>
              <th className="right">ROAD MARATHON</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((band, index) => {
              const slow = band.from > 0 ? marathonSecondsForShare(shareForScore(band.from, exponent)) : null
              const fast = index > 0 ? marathonSecondsForShare(shareForScore(LEVELS[index - 1].from, exponent)) : null
              const range = band.from >= 1000 ? `under ${hm(slow)}` : band.from === 0 ? `over ${hm(fast)}` : `${hm(fast)} to ${hm(slow)}`
              return (
                <tr key={band.id} className={band.id === level.id ? 'is-current' : ''}>
                  <td>
                    <i className={`score-scale__swatch ${band.from >= 1000 ? 'score-scale__band--record' : ''}`} style={{ '--i': bandIndex(band) }} />
                    {band.name}
                  </td>
                  <td className="right mono">{band.from >= 1000 ? '1000+' : band.from === 0 ? 'under 300' : `${band.from} to ${band.from + 99}`}</td>
                  <td className="right mono">{range}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="tiny muted mt-3">
          The names are a reading aid; the numbers are exact. A score is a share of the fastest pace a human has held on a course this demanding, and the road marathon column is that same share of the marathon world best (2:00:35). One scale for everyone. Rough ground is not measured yet, so on technical trails scores run a little under these road times.
        </p>
      </details>
    </div>
  )
}
