import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Mail, Search } from 'lucide-react'
import NextSteps from './NextSteps'

const DOCS = 'https://github.com/OTRI-run/otri/blob/main'
const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

// Plain answers to the questions runners and organizers ask, in the order they tend to ask them.
// Every claim here is also in the methodology pages; when the two disagree, the pages win.
const FAQ = [
  {
    group: 'Scores',
    items: [
      {
        q: 'What is an OTRI score?',
        a: 'A number from 0 to 1000 for one performance on one course. It is your speed over the course, as a share of the fastest a human has ever sustained over a course of that demand, raised to a fixed power. Only two things go in: the course and your finish time.',
        tags: 'definition meaning number scale',
      },
      {
        q: 'Why does the score not depend on who else raced?',
        a: 'By design. Same course, same time, same model version gives the same score anywhere, whether you ran alone or in a field of five thousand. Winner time, field strength, finishing position and previous results are never used, so a score from a village race and a score from a championship mean the same thing.',
        tags: 'field competitors winner rank relative',
      },
      {
        q: 'What does 1000 mean?',
        a: 'The best rate a human has sustained over that much course demand, read from a curve through three public world-best performances: 5000 m, marathon and 24 hours. A 5 km world record and a 24-hour world record both score 1000. Everything else is a share of that.',
        tags: 'maximum world record best ceiling',
      },
      {
        q: 'Why is the slowest score around 200 and not zero?',
        a: 'The curve only reaches zero at infinite time, and it falls slowly at the bottom: at 110 hours on a 170 km mountain course you would still score about 215. In practice, the slowest official finisher of a real race lands between roughly 200 and 300, and anyone slower is pulled at the cut-off and has no score. The calculator’s slider therefore stops at 200; type a time to go beyond it.',
        tags: 'zero minimum floor slider slow dnf cut-off cutoff bottom',
      },
      {
        q: 'How is a mountain course compared with a flat one?',
        a: 'The route is cut into 50 m pieces and each is weighed by how much harder its gradient is than flat running, using a published energy-cost model. That gives the course’s flat-equivalent kilometres, its demand. Sustained steep ground (20 % and steeper) and altitude above 1,500 m add a further factor. A flat road course is untouched by that factor.',
        tags: 'hills elevation climb gradient demand flat equivalent terrain altitude',
      },
      {
        q: 'Why does a 100-mile mountain winner score 984 and not 1000?',
        a: 'Because the ceiling is built from road and track records, and a mountain course costs more than its gradient profile says: rock, roots, mud and exposure are invisible to a GPX file. The model prices sustained steep ground and altitude; it cannot price footing. That limitation is written down, not hidden.',
        tags: 'ultra mountain technical footing limit',
      },
      {
        q: 'My score changed since last time. Why?',
        a: 'The model changed. Every change that can move a score gets a new public version, is announced in the changelog, and the old version stays available so any published score can be reproduced. The model in production is OTRI model 0.1.0; the next one will be 0.2.0. Scores are only comparable under the same version.',
        tags: 'version changed different update history 0.1.0 0.2.0',
      },
      {
        q: 'What do High and Low confidence mean?',
        a: 'Whether another device recording the same route would have produced the same number. High needs elevation from the terrain model and a track dense enough that switchbacks are not cut short (a point at least every 30 m on average). Anything else is Low, and the page says why; so is a course mostly steeper than 45% or shorter than 1.5 flat-km, where the model has nothing to check itself against. Confidence affects trust, never the number.',
        tags: 'confidence high low trust reproducible sparse',
      },
      {
        q: 'Why does a vertical race have finish times but no scores?',
        a: 'Because the model would get it wrong. One part of the score prices sustained steep ground, and it was tuned on mountain courses where up to a quarter of the distance is that steep and much of it is descent. On an uphill-only course, such as a vertical kilometre, nearly all of it is, and that factor over-scores everyone by about 60%: a mid-pack 50 minutes would score like a world best. Until it is recalibrated on vertical-race data, a course with more than half its distance at 20% or steeper is listed with ranks and times only, and it does not count toward a runner index.',
        tags: 'vertical kilometer kilometre vk uphill only not scored no score steep',
      },
      {
        q: 'Another index gives me a different number. Which is right?',
        a: 'They measure different things and OTRI is not calibrated to any other index, so the numbers will differ. What you can check with OTRI is consistency: the same course, time and version give the same score everywhere, and every constant behind the number is on the record.',
        tags: 'compare other index different rating',
      },
      {
        q: 'Can I reproduce a score myself?',
        a: 'Yes. The code is public, every API response carries the scoring version, the measurement version, the elevation source and a hash of the measured course, and old versions remain selectable. You need only the GPX file and the finish time.',
        tags: 'reproduce verify audit open source api',
      },
    ],
  },
  {
    group: 'Courses and GPX files',
    items: [
      {
        q: 'What is a GPX file and where do I get one?',
        a: 'A GPX file is the route as a list of coordinates, the format every watch, phone app and route planner can export. Race organizers usually publish the official course file before the race; otherwise export your own recording from your device or app. A dense recording (a point at least every 30 m) measures best.',
        link: [`${DOCS}/docs/WHAT-IS-A-GPX.md`, 'The full guide'],
        tags: 'gpx file route track download export watch garmin strava planner',
      },
      {
        q: 'My watch recorded elevation. Why does OTRI use a terrain model instead?',
        a: 'So that two devices on the same route agree. Elevation is read from a named, checksummed public terrain dataset (Copernicus GLO-30) wherever its tiles are installed; the course page says which source was used. Where no tiles are installed, the file’s own elevations are used and the score is marked Low confidence.',
        tags: 'elevation barometer dem terrain copernicus watch',
      },
      {
        q: 'Two files of the same route give different numbers. Why?',
        a: 'A sparsely recorded track cuts the switchbacks into straight lines, so the course measures shorter than it is. Above a median point spacing of 30 m the measurement is flagged and its score marked Low. Upload the densest recording you have, ideally the organizer’s official file.',
        tags: 'different numbers same route sparse density points switchbacks',
      },
      {
        q: 'Can I score a course that has not been published yet?',
        a: 'Yes. The calculator accepts any GPX file: pick a target time and see the score and every step of the calculation. A course scored this way is a projection at Low confidence until the organizer publishes the official file and results.',
        tags: 'calculator before race predict target time upload',
      },
    ],
  },
  {
    group: 'Runners and the runner index',
    items: [
      {
        q: 'What is the runner index?',
        a: 'One number per runner: the recency-weighted mean of their best three race scores from the last 24 months, built only from results organizers have published. With fewer than three results it is shown as provisional. It is a separate, versioned rule, not part of the race score.',
        link: [`${DOCS}/docs/methodology/runner-index/RUNNER-INDEX-v1.md`, 'How the index is calculated'],
        tags: 'runner index profile best three 24 months provisional',
      },
      {
        q: 'How are my results from different races matched to one profile?',
        a: 'By name, gender and year of birth as they appear in the organizers’ result files. If two of your results ended up on separate profiles, or someone else’s result landed on yours, use “Report a problem” on the page and it will be fixed by hand.',
        tags: 'match profile duplicate wrong person name birth year',
      },
      {
        q: 'I am on a leaderboard and do not want to be. What can I do?',
        a: 'Use “Report a problem” on the race or runner page, or write to hello@otri.run. The organizer who published the results is responsible for them; OTRI removes a row on request, as described in the privacy policy.',
        link: [`${DOCS}/PRIVACY.md`, 'Privacy policy'],
        tags: 'remove delete privacy name leaderboard opt out',
      },
    ],
  },
  {
    group: 'For organizers',
    items: [
      {
        q: 'What does it cost?',
        a: 'Nothing. OTRI is free and open source, built so that small races and local organizers get the same quality of scoring as the big ones.',
        tags: 'cost price free money',
      },
      {
        q: 'What do I need to get my race scored?',
        a: 'Three things: the course as a GPX file, the official results as CSV or XLSX (the layout your timing company already exports), and permission to share them. The whole flow takes about ten minutes: create an account, add the event and its distances, upload the course, upload the results, review, publish.',
        link: ['organizer/', 'Start as an organizer'],
        tags: 'organizer start upload results course requirements time',
      },
      {
        q: 'Which result file formats and columns are accepted?',
        a: 'CSV or XLSX, one row per participant. Column names are matched loosely (rank, time, last name, first name, gender, status, bib, nationality, birth date are recognised in most spellings) and extra columns are ignored. The results step shows an example file and validates yours before anything is scored.',
        tags: 'csv xlsx excel columns format results file',
      },
      {
        q: 'Can I correct or remove published results?',
        a: 'Yes. Upload a corrected file to replace the results, unpublish a race from its review page, or delete a race or an event. Deleting your account removes everything you uploaded.',
        tags: 'correct fix remove unpublish delete race event',
      },
      {
        q: 'Do you use my results to change the model?',
        a: 'No. A score never depends on the field, and the production model is not fitted to uploaded results. Calibration studies, when they happen, use separately licensed data and are published as a new model version.',
        link: [`${DOCS}/DATA_POLICY.md`, 'Data policy'],
        tags: 'data policy calibration use results training',
      },
    ],
  },
  {
    group: 'The project',
    items: [
      {
        q: 'Where is the full method written down?',
        a: 'Start with the plain-language explainer, which also lists every constant and where it comes from, then the specification of the model in production.',
        link: [`${DOCS}/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`, 'How a score is made'],
        tags: 'method methodology documentation spec paper',
      },
      {
        q: 'Is this the finished product?',
        a: 'No. It is a working prototype, built in the open: the bar at the bottom of every page shows the exact commit you are looking at. Things will move. What will not move silently is a published score.',
        tags: 'prototype beta finished status',
      },
      {
        q: 'Who is behind OTRI, and how can I help?',
        a: 'A community project by runners and organizers who wanted an index they could inspect. Code, methodology and this site are on GitHub; issues, pull requests, methodology review and test races are all welcome.',
        link: [`${DOCS}/CONTRIBUTING.md`, 'Get involved'],
        tags: 'who contribute help github community contact',
      },
    ],
  },
]

const ALL = FAQ.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group })))

function normalise(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function FaqPage({ initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  // A new #faq?q=… link while the page is already open (or the FAQ nav link, which clears it).
  useEffect(() => setQuery(initialQuery), [initialQuery])
  const words = useMemo(() => normalise(query).split(/\s+/).filter(Boolean), [query])
  const matches = useMemo(() => {
    if (!words.length) return ALL
    return ALL.filter((item) => {
      const hay = normalise(`${item.q} ${item.a} ${item.tags} ${item.group}`)
      return words.every((word) => hay.includes(word))
    })
  }, [words])

  // Keep the search in the URL so an answer can be shared: #faq?q=zero
  useEffect(() => {
    const next = query ? `#faq?q=${encodeURIComponent(query)}` : '#faq'
    if (window.location.hash !== next && window.location.hash.startsWith('#faq')) window.history.replaceState(null, '', next)
  }, [query])

  const groups = FAQ.map((group) => ({ ...group, items: group.items.filter((item) => matches.includes(item) || matches.some((m) => m.q === item.q)) })).filter((g) => g.items.length)

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className={CONTAINER}>
        <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
          <div className="font-mono text-xs text-blue-600">04</div>
          <div className="min-w-0">
            <p className="mb-3 font-mono text-[10px] tracking-[.08em] text-slate-500">QUESTIONS</p>
            <h1 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
              Asked often.
              <br />
              <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">Answered plainly.</span>
            </h1>
          </div>
          <p className="min-w-0 text-sm leading-7 text-slate-500">
            Short answers about scores, courses, the runner index and publishing a race. The long answers live in the
            methodology pages, linked where they matter.
          </p>
        </div>

        <div className="mt-10 max-w-[640px]">
          <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the questions, e.g. zero, GPX, confidence, cost…"
            aria-label="Search the FAQ"
            autoFocus={Boolean(initialQuery)}
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-9 pr-3 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-500" aria-live="polite">
            {query ? `${matches.length} of ${ALL.length} questions match` : `${ALL.length} questions`}
          </p>
        </div>

        {groups.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Nothing matches <b>{query}</b>. Ask us directly:{' '}
            <a href={`mailto:hello@otri.run?subject=${encodeURIComponent(`Question: ${query}`)}`} className="inline-flex items-center gap-1 font-semibold text-blue-600 no-underline hover:underline">
              <Mail size={14} /> hello@otri.run
            </a>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.group} className="mt-10">
            <p className="mb-3 font-mono text-[11px] tracking-[.08em] text-slate-500">{group.group.toUpperCase()}</p>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
              {group.items.map((item) => (
                <details key={item.q} open={words.length > 0} className="group px-5 py-4 sm:px-6">
                  <summary className="cursor-pointer list-none text-[15px] font-semibold text-[#0b1220] marker:content-none">
                    <span className="flex items-start justify-between gap-4">
                      <span>{item.q}</span>
                      <span aria-hidden="true" className="mt-1 shrink-0 font-mono text-xs text-slate-400 transition group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[720px] text-sm leading-7 text-slate-600">{item.a}</p>
                  {item.link && (
                    <a href={item.link[0]} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 no-underline hover:underline" target={item.link[0].startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                      {item.link[1]} <ArrowUpRight size={14} />
                    </a>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}

        <NextSteps
          items={[
            ['Still a question?', 'Write to us; answers that come up more than once end up on this page.', 'hello@otri.run', 'mailto:hello@otri.run'],
            ['See it work', 'Pick a course, drag a time, watch the score and its reasoning update.', 'Calculate your score', '#calculator'],
            ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', `${DOCS}/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`],
          ]}
        />
      </div>
    </section>
  )
}
