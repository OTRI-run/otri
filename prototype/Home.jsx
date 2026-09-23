import { scrollBehavior } from '../src/lib/comfort'
import { ArrowRight, ArrowUpRight, Eye, GitBranch, Link2, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import RaceCard from './RaceCard'
import ScoreTicker from '../src/components/ScoreTicker'
import ExamplePreview, { EXAMPLE, ExampleExplanation, ExampleProfile, SyntheticPill, courseLine } from '../src/components/ExamplePreview'
import { listRaces } from './apiClient'
import { CalculatorArt, PodiumArt, SheetArt } from '../src/components/PageArt'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

// The header's "How it works" link lands on #home and leaves the section it wants here, because
// the router only knows whole pages; Home reads it once mounted and scrolls (see main.jsx, NAV).
export const HOME_SECTION_KEY = 'otri_home_section'

/**
 * The ground, drawn as a wireframe surface running back to a horizon: the thing the index
 * measures, behind the words that describe it. The height field is a fixed sum of sines, so the
 * same hills render on every load, and every line fades with distance so the type in front of it
 * is never competing with anything.
 */
function TerrainMesh() {
  const { rows, columns } = useMemo(() => {
    const COLS = 40
    const ROWS = 18
    const CX = 720
    const HORIZON = 286

    const height = (i, j) =>
      74 * Math.sin(i * 0.33 + 0.6) * Math.cos(j * 0.38) +
      42 * Math.sin(i * 0.17 - j * 0.29) +
      26 * Math.sin((i + j) * 0.48)

    // depth 0 is the horizon, depth 1 is under the reader's feet
    const project = (i, j) => {
      const t = j / ROWS
      const scale = 0.16 + 1.45 * t ** 1.55
      const ground = HORIZON + 700 * t ** 1.85
      return [CX + (i - COLS / 2) * 60 * scale, ground - height(i, j) * scale]
    }
    const line = (points) => 'M' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')

    const rows = []
    for (let j = 0; j <= ROWS; j += 1) {
      const points = []
      for (let i = 0; i <= COLS; i += 1) points.push(project(i, j))
      rows.push({ d: line(points), opacity: (0.1 + 0.85 * (j / ROWS)).toFixed(3) })
    }
    const columns = []
    for (let i = 0; i <= COLS; i += 1) {
      const points = []
      for (let j = 0; j <= ROWS; j += 1) points.push(project(i, j))
      columns.push(line(points))
    }
    return { rows, columns }
  }, [])

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-slate-900"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <defs>
        {/* the far distance dissolves, and so does the very front, so the mesh has no cut edges */}
        <linearGradient id="otri-mesh-fade" x1="0" y1="286" x2="0" y2="900" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".28" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".78" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity=".25" />
        </linearGradient>
        <mask id="otri-mesh-mask">
          <rect x="0" y="286" width="1440" height="614" fill="url(#otri-mesh-fade)" />
        </mask>
      </defs>
      <g mask="url(#otri-mesh-mask)" strokeWidth="1" opacity=".05">
        {columns.map((d, i) => (
          <path key={`c${i}`} d={d} />
        ))}
        {rows.map((row, i) => (
          <path key={`r${i}`} d={row.d} opacity={row.opacity} />
        ))}
      </g>
    </svg>
  )
}

function Eyebrow({ children, className = '' }) {
  return <p className={`font-mono text-[11px] tracking-[.08em] text-slate-500 ${className}`}>{children}</p>
}

function Heading({ children, className = '', light = false }) {
  return (
    <h2 className={`text-[clamp(30px,4vw,48px)] font-bold leading-[1.02] tracking-[-.05em] ${light ? 'text-white' : 'text-[#0b1220]'} ${className}`}>
      {children}
    </h2>
  )
}

function Gradient({ children }) {
  return <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">{children}</span>
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
const primaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-[13px] font-semibold text-white no-underline hover:bg-blue-800 ${focusRing}`
const secondaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300 ${focusRing}`
const lightButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:bg-blue-50 ${focusRing} focus-visible:outline-white`
const outlineLightButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:border-white ${focusRing} focus-visible:outline-white`
const textLink = `inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 no-underline hover:underline ${focusRing}`

/** The two actions the whole page keeps coming back to. */
function TryButtons({ onDark = false }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <a className={onDark ? lightButton : primaryButton} href="#score?example=1">
        Try an example race <ArrowRight size={15} aria-hidden="true" />
      </a>
      <a className={onDark ? outlineLightButton : secondaryButton} href="#calculator">
        Open the calculator
      </a>
    </div>
  )
}

const STEPS = [
  ['Upload your course and results', 'Bring a course GPX and CSV or XLSX results for one race distance.'],
  ['Review the output', 'Check any file issues, explore the scores, and read how they were calculated.'],
  ['Choose what to share', 'Download the scored results, prepare a podium image, or create a race page to review and publish.'],
]

const USEFUL = [
  [SheetArt, 'An accessible results page', 'Share a public link that runners can open without signing in.'],
  [CalculatorArt, 'Scores with an explanation', 'Show the course inputs, calculation and confidence notes behind the result.'],
  [PodiumArt, 'Images for your race channels', 'Prepare a podium image and suggested caption, then choose where to post them.'],
]

const QUESTIONS = [
  ['What does it cost?', 'Free. There is no paid tier.', '#faq?q=cost'],
  ['Do I need an account?', 'No account to score. An account, with a confirmed email, to publish.', '#faq?q=account'],
  ['Which files do I need?', 'A course GPX and a CSV or XLSX results file for one distance. Only a name and a finish-time column are required.', '#faq?q=columns'],
  ['What happens to my files?', 'Files you score without an account are deleted after the answer; only a hash-keyed course measurement is cached, without names.', '#faq?q=deleted'],
  ['When does anything go public?', 'Nothing is public until you press Publish. Every publish is checked, and you can unpublish at any time.', '#faq?q=unpublish'],
]

export default function Home() {
  // #contribute (a footer link, or an address someone shared) is a block near the end of the page;
  // the header's "How it works" leaves the section it wants in sessionStorage (see HOME_SECTION_KEY).
  useEffect(() => {
    const go = () => {
      let wanted = window.location.hash === '#contribute' ? 'contribute' : null
      try {
        const asked = sessionStorage.getItem(HOME_SECTION_KEY)
        if (asked) {
          sessionStorage.removeItem(HOME_SECTION_KEY)
          wanted = asked
        }
      } catch {
        // storage unavailable: the page opens at its top
      }
      if (wanted) document.getElementById(wanted)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    }
    const timer = setTimeout(go, 80) // after the page has laid out
    window.addEventListener('hashchange', go)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('hashchange', go)
    }
  }, [])

  // Published races, straight from the API. `loaded` tells the empty state apart from a failed
  // request: only a list that really came back empty says there is nothing yet.
  const [races, setRaces] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    listRaces()
      .then((all) => {
        if (cancelled) return
        setRaces(all.filter((race) => race.is_published))
        setLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const { targets, explanation } = EXAMPLE

  return (
    <>
      {/* Hero: what you get, and the real thing beside it. Not a full screen; the next section is
          meant to show under it on a laptop. */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <TerrainMesh />
        <div className={`${CONTAINER} relative grid min-w-0 items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-14`}>
          <div className="min-w-0">
            <Eyebrow className="text-blue-700">TRAIL SCORES. OPEN TO EVERYONE.</Eyebrow>
            <h1 className="mt-4 text-[clamp(38px,5.6vw,68px)] font-bold leading-[1.04] tracking-[-.06em] text-[#0b1220]">
              Know your score.
              <br />
              <span className="bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text pb-1 text-transparent">Before you race.</span>
            </h1>
            <p className="mt-6 max-w-[58ch] text-[16px] leading-7 text-slate-700 sm:text-[17px]">
              Turn your course GPX and race results into explained trail scores. Try scoring without an account, then choose whether to publish a
              race page your runners can view without signing in or subscribing.
            </p>
            <div className="mt-7">
              <TryButtons />
            </div>
            <p className="mt-5 text-[12px] font-medium text-slate-500">Free scoring · Public results without sign-in · Open methodology</p>
            <a href="#score" className={`${textLink} mt-4`}>
              Have your own files? Score my race <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
          <ExamplePreview base="" className="min-w-0" />
        </div>
      </section>

      {/* 2 / One link */}
      <section id="public" className="border-b border-slate-200 bg-slate-50 py-14 sm:py-16">
        <div className={`${CONTAINER} grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16`}>
          <div className="min-w-0">
            <Eyebrow className="mb-3">FOR YOUR RUNNERS</Eyebrow>
            <Heading>
              Share one link.
              <br />
              <Gradient>Let everyone see the scores.</Gradient>
            </Heading>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] leading-7 text-slate-700">
              When you publish a race on OTRI, runners can open its results and scores without creating an account or buying a subscription.
            </p>
            <p className="mt-3 text-[15px] leading-7 text-slate-700">You need an organizer account to publish. Your audience doesn't need one to view.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                [Link2, 'One public link'],
                [UserX, 'No account for readers'],
                [Eye, 'No subscription to view'],
              ].map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-[#0b1220]">
                  <Icon size={16} className="shrink-0 text-blue-700" aria-hidden="true" /> {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 3 / How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-b border-slate-200 bg-white py-14 sm:py-16">
        <div className={CONTAINER}>
          <Eyebrow className="mb-3">HOW IT WORKS</Eyebrow>
          <Heading>From two files to an explained result.</Heading>
          <ol className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="min-w-0 border-t-2 border-blue-700 pt-4">
                <p className="font-mono text-[11px] tracking-[.08em] text-blue-700">STEP {index + 1}</p>
                <h3 className="mt-2 text-[17px] font-bold tracking-[-.02em] text-[#0b1220]">
                  {index + 1}. {title}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-[13px] text-slate-500">Trying the scoring tool does not publish your results.</p>
        </div>
      </section>

      {/* 4 / Useful for runners */}
      <section className="border-b border-slate-200 bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-16">
        <div className={CONTAINER}>
          <Eyebrow className="mb-3">WHAT YOU CAN SHARE</Eyebrow>
          <Heading>Give your runners something useful.</Heading>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {USEFUL.map(([Art, title, text]) => (
              <article key={title} className="flex min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <Art className="h-14 w-14 shrink-0 text-blue-700 opacity-[.6]" />
                <div className="min-w-0">
                  <h3 className="text-[16px] font-bold tracking-[-.02em] text-[#0b1220]">{title}</h3>
                  <p className="mt-2 text-[14px] leading-6 text-slate-600">{text}</p>
                </div>
              </article>
            ))}
          </div>
          {/* One famous performance at a time with an illustrative score: what a number looks like.
              Decorative, not a link, and the strip says the scores are illustrative. */}
          <div className="mt-12 flex flex-col items-center">
            <ScoreTicker />
          </div>
        </div>
      </section>

      {/* Races: the published ones, or the fact that there are none yet. Hidden while the list has
          not arrived, so a failed request never reads as an empty site. */}
      {(loaded || races.length > 0) && (
        <section id="races-preview" className="border-b border-slate-200 bg-white py-14 sm:py-16">
          <div className={CONTAINER}>
            <div className="flex items-center justify-between gap-4">
              <Eyebrow>RACES</Eyebrow>
              <a href="#races" className={textLink}>
                All races <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            <Heading className="mt-3">Published races.</Heading>
            {races.length > 0 ? (
              <>
                <p className="mt-4 max-w-[60ch] text-[15px] leading-7 text-slate-700">
                  {races.every((race) => race.is_demo) ? 'Demonstration races' : 'Races'} their organizers published, all scored with the same open model. Open one to see its results page.
                </p>
                <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {races.slice(0, 4).map((race) => (
                    <RaceCard key={race.race_id} race={race} />
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-[15px] leading-7 text-slate-700">No published races yet. Score your race, review its page and publish when ready.</p>
                <a href="#score" className={`${primaryButton} mt-4`}>
                  Score my race <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5 / Explained */}
      <section id="explained" className="border-b border-slate-200 bg-slate-50 py-14 sm:py-16">
        <div className={`${CONTAINER} grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16`}>
          <div className="min-w-0 lg:order-2">
            <Eyebrow className="mb-3">THE MODEL</Eyebrow>
            <Heading>Every score explains itself.</Heading>
            <div className="mt-5 flex flex-col gap-3 text-[15px] leading-7 text-slate-700">
              <p>OTRI's current model uses the measured course and each runner's finish time. The calculation does not depend on who else entered the race.</p>
              <p>The methodology and source code are public. Each score identifies its model version.</p>
              <p>The model is still developing. Race-day weather and technical footing are not fully represented.</p>
            </div>
            <a href="#faq?q=score" className={`${secondaryButton} mt-6`}>
              Explore the explanation <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="min-w-0 lg:order-1">
            <div className="mb-2 flex items-center gap-2">
              <SyntheticPill />
              <span className="text-[12px] text-slate-500">the winner of the example race</span>
            </div>
            <ExampleExplanation className="bg-white" />
          </div>
        </div>
      </section>

      {/* 6 / Target time */}
      <section id="target" className="border-b border-slate-200 bg-white py-14 sm:py-16">
        <div className={`${CONTAINER} grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16`}>
          <div className="min-w-0">
            <Eyebrow className="mb-3">FOR RUNNERS</Eyebrow>
            <Heading>Explore a target time on your course.</Heading>
            <div className="mt-5 flex flex-col gap-3 text-[15px] leading-7 text-slate-700">
              <p>Open a course, adjust the finish time, and see how the model-based score changes.</p>
              <p>Read the explanation and confidence notes alongside the estimate. It is not a guarantee of race-day performance.</p>
            </div>
            <a href="#calculator" className={`${primaryButton} mt-6`}>
              Open the calculator <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#0b1220]">{EXAMPLE.course.name}</p>
                <p className="font-mono text-[11px] leading-5 text-slate-500 [overflow-wrap:anywhere]">{courseLine()}</p>
              </div>
              <SyntheticPill />
            </div>
            <ExampleProfile className="mt-3" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {targets.map((target) => (
                <div key={target.time} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[.08em] text-slate-500">Finish time</p>
                  <p className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-[-.02em] text-[#0b1220]">{target.time}</p>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[.08em] text-slate-500">OTRI</span>
                    <span className="font-mono text-[26px] font-bold tabular-nums text-blue-700">{target.score}</span>
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-600">
                    {(target.fraction_of_ceiling * 100).toFixed(0)} % of the ceiling rate: {target.performance_rate.toFixed(2)} of {explanation.reference_rate.toFixed(2)} km/h
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-slate-500">
              Two target times on the example course, scored by the live API with {EXAMPLE.model_label}.
            </p>
          </div>
        </div>
      </section>

      {/* 7 / Questions */}
      <section id="questions" className="border-b border-slate-200 bg-slate-50 py-14 sm:py-16">
        <div className={CONTAINER}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow className="mb-3">BEFORE YOU START</Eyebrow>
              <Heading>Questions before you upload?</Heading>
            </div>
            <a href="#faq" className={textLink}>
              All questions <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
          <dl className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {QUESTIONS.map(([question, answer, href]) => (
              <div key={question} className="grid gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto] md:items-baseline">
                <dt className="text-[15px] font-bold tracking-[-.01em] text-[#0b1220]">{question}</dt>
                <dd className="text-[14px] leading-6 text-slate-700">{answer}</dd>
                <dd className="md:text-right">
                  <a href={href} className={textLink}>
                    In the FAQ <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 8 / The primary action, once more, and the open-source note */}
      <section className="bg-[#0b1220] py-14 text-white sm:py-16">
        <div className={CONTAINER}>
          <div className="grid min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[.08em] text-blue-300">NO ACCOUNT NEEDED TO TRY</p>
              <Heading light className="mt-3">
                Try it with an example race.
              </Heading>
              <p className="mt-3 max-w-[56ch] text-[15px] leading-7 text-slate-300">
                Score the built-in example in a minute, then bring your own files. Trying the scoring tool does not publish anything.
              </p>
            </div>
            <TryButtons onDark />
          </div>

          <div id="contribute" className="mt-12 scroll-mt-24 flex flex-col gap-4 border-t border-slate-700/80 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-[11px] tracking-[.08em] text-blue-300">
                <GitBranch size={14} aria-hidden="true" /> BUILT IN THE OPEN
              </p>
              <p className="mt-2 max-w-[64ch] text-[14px] leading-6 text-slate-300">
                The scoring model, the course measurement and this site are open source, and every change to the model is a new version.
                <span className="block">Report a course that measures wrong, review the methodology, or write code.</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={GITHUB_URL} className={outlineLightButton}>
                GitHub <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} className={outlineLightButton}>
                How to contribute <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
