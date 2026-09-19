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
  yes: ['Yes', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  provisional: ['Provisional', 'bg-amber-50 text-amber-700 border-amber-200'],
  no: ['No', 'bg-slate-100 text-slate-600 border-slate-200'],
}

export function WhatWeScoreTable({ className = '' }) {
  return (
    <div className={className}>
      <ul className="divide-y divide-slate-100">
        {WHAT_WE_SCORE.map(([state, kind, note]) => (
          <li key={kind} className="grid gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[92px_minmax(0,1fr)]">
            <span>
              <span className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[.06em] ${MARK[state][1]}`}>{MARK[state][0]}</span>
            </span>
            <span className="min-w-0 text-[13px] leading-5 text-slate-600">
              <b className="text-[#0b1220]">{kind}.</b> {note}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{NOT_MEASURED}</p>
    </div>
  )
}

/** The table folded behind one line, for a page where it is a side question. */
export default function WhatWeScore({ className = '' }) {
  return (
    <details className={`group rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 ${className}`}>
      <summary className="cursor-pointer list-none font-semibold text-[#0b1220]">
        <span className="text-blue-600">Which races can OTRI score? Trail, road, vertical…</span>
      </summary>
      <WhatWeScoreTable className="mt-2" />
    </details>
  )
}
