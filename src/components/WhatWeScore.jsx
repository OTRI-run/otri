// What OTRI can score, and how far to trust it: one table, shown wherever someone is about to bring
// a race (the calculator, Score my race, the FAQ). It states the model's limits as they are in the
// code (scoring/course_standard.py: the confidence rules); when those change, change this.

export const WHAT_WE_SCORE = [
  ['yes', 'Trail and mountain races', 'From about 5 km to 100 miles and beyond. This is what the model was built for.'],
  ['yes', 'Road races', 'A flat, well-measured course is the easy case. It still needs the course as a GPX.'],
  ['provisional', 'Vertical races', 'Scored from the GPX, always at Low confidence: the setting for uphill-only courses rests on a single race so far.'],
  ['provisional', 'Very steep courses', 'Ground steeper than 45% is scored as if it were 45%, so it earns too little. Low confidence when that is more than a fifth of the course.'],
  ['provisional', 'Very short races', 'Under about 1.5 km of flat-equivalent effort the score runs high. Low confidence.'],
  ['no', 'Races with no fixed course', '24-hour and backyard races, relays, a stage race as a whole. One stage can be scored on its own.'],
]

export const NOT_MEASURED =
  'What a score does not see: how technical the ground is, mud, snow, heat or darkness. Two courses with the same profile count the same. Altitude above 1,500 m is counted.'

const MARK = {
  yes: ['Yes', 'badge badge--moss'],
  provisional: ['Provisional', 'badge badge--ochre'],
  no: ['No', 'badge'],
}

export function WhatWeScoreTable({ className = '' }) {
  return (
    <div className={className}>
      <ul className="stack stack--tight">
        {WHAT_WE_SCORE.map(([state, kind, note]) => (
          <li key={kind} className="cluster cluster--top" style={{ gap: 12, paddingBlock: 6, borderBottom: 'var(--border)' }}>
            <span>
              <span className={MARK[state][1]} style={{ minWidth: 96, justifyContent: 'center' }}>{MARK[state][0]}</span>
            </span>
            <span className="small muted grow">
              <b className="ink">{kind}.</b> {note}
            </span>
          </li>
        ))}
      </ul>
      <p className="tiny muted mt-3">{NOT_MEASURED}</p>
    </div>
  )
}

/** The table folded behind one line, for a page where it is a side question. */
export default function WhatWeScore({ className = '' }) {
  return (
    <details className={`details ${className}`}>
      <summary>
        <span>Which races can OTRI score? Trail, road, vertical…</span>
      </summary>
      <WhatWeScoreTable className="details__body" />
    </details>
  )
}
