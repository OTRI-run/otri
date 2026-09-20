import './WhatWeScore.css'
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
  yes: ['Yes', "src-components-what-we-score-mark-style-1"],
  provisional: ['Provisional', "src-components-what-we-score-mark-style-2"],
  no: ['No', "src-components-what-we-score-mark-style-3"],
}

export function WhatWeScoreTable({ className = '' }) {
  return (
    <div className={className}>
      <ul className="src-components-what-we-score-what-we-score-table-ul-4">
        {WHAT_WE_SCORE.map(([state, kind, note]) => (
          <li key={kind} className="src-components-what-we-score-what-we-score-table-li-5">
            <span>
              <span className={`src-components-what-we-score-what-we-score-table-span-6 ${MARK[state][1]}`}>{MARK[state][0]}</span>
            </span>
            <span className="src-components-what-we-score-what-we-score-table-span-7">
              <b className="src-components-what-we-score-what-we-score-table-b-8">{kind}.</b> {note}
            </span>
          </li>
        ))}
      </ul>
      <p className="src-components-what-we-score-what-we-score-table-p-9">{NOT_MEASURED}</p>
    </div>
  )
}

/** The table folded behind one line, for a page where it is a side question. */
export default function WhatWeScore({ className = '' }) {
  return (
    <details className={`src-components-what-we-score-what-we-score-details-10 otri-group ${className}`}>
      <summary className="src-components-what-we-score-what-we-score-summary-11">
        <span className="src-components-what-we-score-what-we-score-span-12">Which races can OTRI score? Trail, road, vertical…</span>
      </summary>
      <WhatWeScoreTable className="src-components-what-we-score-what-we-score-what-we-score-table-13" />
    </details>
  )
}
