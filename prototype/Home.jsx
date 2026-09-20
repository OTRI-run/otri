import { scrollBehavior } from '../src/lib/comfort'
import { ArrowRight, ArrowUpRight, Calculator, Database, FileText, GitBranch, Mountain, ShieldCheck, Timer, Upload, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import RaceCard from './RaceCard'
import TopographicHero from './TopographicHero'
import { listRaces } from './apiClient'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const DOCS = {
  how: `${GITHUB_URL}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`,
  methodology: `${GITHUB_URL}/blob/main/METHODOLOGY.md`,
  dataPolicy: `${GITHUB_URL}/blob/main/DATA_POLICY.md`,
}

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

function Eyebrow({ children, className = '' }) {
  return <p className={`text-[11px] font-bold uppercase tracking-[.14em] text-blue-700 ${className}`}>{children}</p>
}

function Heading({ children, className = '' }) {
  return <h2 className={`text-[clamp(32px,4vw,48px)] font-bold leading-[1.08] tracking-[-.045em] text-[#0b1220] ${className}`}>{children}</h2>
}

function Gradient({ children }) {
  return <span className="text-blue-700">{children}</span>
}

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-[13px] font-semibold text-white no-underline shadow-[0_10px_28px_rgba(37,99,235,.2)] hover:bg-blue-800'
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:border-blue-300'

export default function Home() {
  // #contribute (the footer's link or an address someone shared) is the block below.
  useEffect(() => {
    const go = () => {
      if (window.location.hash === '#contribute') document.getElementById('contribute')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    }
    const timer = setTimeout(go, 80) // after the page has laid out
    window.addEventListener('hashchange', go)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('hashchange', go)
    }
  }, [])

  const [races, setRaces] = useState([])
  useEffect(() => {
    let cancelled = false
    listRaces()
      .then((all) => {
        if (cancelled) return
        // The home page previews scored races; listings without results live on the races page.
        const rows = all.filter((race) => race.is_published)
        setRaces(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {/* Hero */}
      <section className="otri-index-hero relative isolate overflow-hidden border-b border-slate-200">
        <TopographicHero />
        <div className={`${CONTAINER} relative z-10 py-9 sm:py-14 lg:py-16`}>
          <div className="mx-auto max-w-[800px] text-center">
            <h1 className="otri-hero-wordmark text-[#0b1220]" aria-label="Open Trail Running Index">
              OPEN TRAIL<br />RUNNING INDEX
            </h1>
            <p className="mx-auto mt-5 max-w-[620px] text-[19px] leading-7 text-slate-600 sm:text-[22px] sm:leading-8">
              A score for your trail performance. Based on the course and your finish time.
            </p>
            <div className="mx-auto mt-7 grid max-w-[800px] gap-4 sm:mt-9 sm:grid-cols-2">
              {[
                {
                  Icon: Calculator,
                  audience: 'For runners',
                  title: 'Calculate my score',
                  text: 'Pick a course. Add your time. See your score.',
                  href: '#calculator',
                },
                {
                  Icon: Upload,
                  audience: 'For race organizers',
                  title: 'Score all finishers',
                  text: 'Add your course and results. Get everyone’s scores.',
                  href: '#score',
                },
              ].map(({ Icon, audience, title, text, href }) => (
                <a
                  key={href}
                  href={href}
                  data-audience={href === '#calculator' ? 'runner' : 'organizer'}
                  className="otri-index-action group flex min-w-0 flex-col rounded-2xl border p-5 text-left no-underline sm:p-7"
                >
                  <span className="flex items-center gap-3">
                    <span className="otri-action-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="otri-action-audience text-[11px] font-bold uppercase tracking-[.12em]">{audience}</span>
                  </span>
                  <span className="otri-action-title mt-4 block text-[26px] font-bold leading-8 tracking-[-.03em]">{title}</span>
                  <span className="otri-action-description mt-2 mb-6 block flex-1 text-[16px] leading-6">{text}</span>
                  <span className="otri-action-cta flex min-h-12 items-center justify-between gap-4 rounded-xl px-4 text-[15px] font-bold">
                    {href === '#calculator' ? 'Start calculating' : 'Upload race files'}
                    <ArrowRight size={20} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-5 text-[15px] text-slate-600">Free to use · No sign-up to score · Open methodology</p>
          </div>
        </div>
      </section>

      <section className="otri-home-explain bg-white py-16 sm:py-24">
        <div className={CONTAINER}>
          <div className="mx-auto max-w-[660px] text-center">
            <Eyebrow>THE IDEA IS SIMPLE</Eyebrow>
            <Heading className="mt-4">Different courses.<br /><Gradient>A common scale.</Gradient></Heading>
            <p className="mt-5 text-lg leading-7 text-slate-600">A finish time needs context. OTRI measures the course, then puts your performance on an open scoring scale.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [Mountain, '01', 'Your course', 'Distance, climb and gradients, measured from the GPX route.'],
              [Timer, '02', 'Your time', 'A finish time you have run, or a target you want to explore.'],
              [GitBranch, '03', 'Your score', 'A model-based score with its calculation and model version explained.'],
            ].map(([Icon, step, title, description]) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7">
                <div className="flex items-center justify-between"><Icon size={25} className="text-blue-700" /><span className="font-mono text-xs text-slate-400">{step}</span></div>
                <h3 className="mt-6 text-xl font-bold tracking-tight text-[#0b1220]">{title}</h3>
                <p className="mt-2 text-base leading-7 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center"><a href={DOCS.how} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-700">See how the score is calculated <ArrowUpRight size={16} /></a></div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#f5f7fb] py-16 sm:py-20">
        <div className={`${CONTAINER} grid items-center gap-10 lg:grid-cols-2 lg:gap-20`}>
          <div>
            <Eyebrow>FOR RACE ORGANIZERS</Eyebrow>
            <Heading className="mt-4">One upload.<br />Every finisher scored.</Heading>
            <p className="mt-5 max-w-[480px] text-lg leading-8 text-slate-600">Bring your course GPX and results spreadsheet. Download the scores, share them with your runners, or publish a race page.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#score" className={primaryButton}>Score my race <ArrowRight size={16} /></a>
              <a href="#score?example=1" className={secondaryButton}>Try the sample race</a>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_#17345408] sm:p-8">
            {[
              [Upload, 'Bring the files', 'Course GPX + results in CSV or Excel.'],
              [ShieldCheck, 'Check the results', 'Review scores and any file or course-quality notes.'],
              [Users, 'Choose what to share', 'Download first. Create an organizer account when you want to publish.'],
            ].map(([Icon,title,description],i)=><div key={title} className={`flex gap-4 ${i ? 'mt-6 border-t border-slate-100 pt-6' : ''}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon size={20}/></span>
              <div><h3 className="text-base font-bold text-[#0b1220]">{title}</h3><p className="mt-1 text-base leading-6 text-slate-600">{description}</p></div>
            </div>)}
          </div>
        </div>
      </section>

      {/* 03 / Races: only when there is a scored race to show */}
      {races.length > 0 && (
      <section id="races-preview" className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>SCORED RACES</Eyebrow>
            <a href="#races" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 no-underline">
              All races <ArrowRight size={14} />
            </a>
          </div>
          <div className="mt-6 grid min-w-0 gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
            <div className="min-w-0">
              <Heading>
                Scored races.
                <br />
                <Gradient>Every number explained.</Gradient>
              </Heading>
              <p className="mt-5 max-w-[440px] text-base leading-7 text-slate-500">
                {races.every((race) => race.is_demo) ? 'Demonstration races' : 'Races'} their organizers published, all scored with the same open model. A score depends only on the course and the
                runner's own finish time — never on who else raced. Open one to see its leaderboard.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                <GitBranch size={16} className="text-blue-600" />
                same course + same time + same version <b className="text-blue-600">=</b> same score
              </div>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {races.slice(0, 4).map((race) => (
                <RaceCard key={race.race_id} race={race} />
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* 04 / Method */}
      <section className="bg-[#0b1220] py-14 text-white sm:py-20">
        <div className={CONTAINER}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs tracking-[.08em] text-slate-300">OPEN BY DESIGN</p>
            <span className="font-mono text-[11px] tracking-[.08em] text-blue-400">TRANSPARENT · VERSIONED</span>
          </div>
          <h2 className="mt-5 text-[clamp(32px,4vw,48px)] font-bold leading-[1.08] tracking-[-.045em]">Built in the open.</h2>
          <div className="mt-9 grid border-t border-slate-700/80 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [FileText, 'HOW A SCORE IS MADE', 'Plain-language explainer, then every constant and where it comes from.', DOCS.how],
              [GitBranch, 'VERSIONED MODEL', 'Every score names its model version. A change to the scoring is a new version, never a silent edit.', DOCS.methodology],
              [ShieldCheck, 'DATA POLICY', 'Which results OTRI will and will not use, and why.', DOCS.dataPolicy],
              [Database, 'SOURCE CODE', 'Scoring, course measurement and this site, all public.', GITHUB_URL],
            ].map(([Icon, title, desc, href]) => (
              <a
                key={title}
                href={href}
                className="group block border-b border-slate-700/80 px-0 py-5 text-white no-underline transition hover:bg-white/5 sm:border-r sm:px-4 lg:border-b-0"
              >
                <small className="flex items-center gap-2 font-mono text-[11px] text-white">
                  <Icon size={14} className="text-blue-400" /> {title}
                </small>
                <p className="mt-3 text-[15px] leading-6 text-slate-400">{desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                  Read <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>

          {/* Contribute: the model and the course measurement get better with more eyes and more courses. */}
          <div id="contribute" className="mt-12 scroll-mt-24 rounded-2xl border border-slate-700/80 bg-white/[.03] p-6 sm:p-8">
            <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">
                <p className="font-mono text-xs tracking-[.08em] text-blue-400">CONTRIBUTE</p>
                <h3 className="mt-3 text-[clamp(26px,3.2vw,38px)] font-bold leading-[1.02] tracking-[-.045em]">Help improve the model and the course measurement.</h3>
                <p className="mt-3 text-base leading-7 text-slate-400">
                  OTRI is independent and open source. Its assumptions and limits are published. Help test the model, improve course measurement, or report a result that looks wrong.
                </p>
                <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#0b1220] no-underline hover:bg-blue-50">
                  <GitBranch size={15} /> How to contribute <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="grid min-w-0 gap-px overflow-hidden rounded-xl border border-slate-700/80 bg-slate-700/80 sm:grid-cols-2">
                {[
                  ['Challenge the scoring model', 'Read the assumptions and propose a tested, versioned improvement.', 'The model and its open questions', DOCS.how],
                  ['Improve course measurement', 'Help check how GPX tracks become distance, climb and course demand.', 'The measurement specification', `${GITHUB_URL}/blob/main/docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`],
                  ['Report what looks wrong', 'Send a course file or link with the issue you found.', 'Open an issue', `${GITHUB_URL}/issues`],
                  ['Write code', 'Contribute to scoring, course measurement, the API or this website.', 'Browse the code', GITHUB_URL],
                ].map(([title, text, cta, href]) => (
                  <a key={title} href={href} className="group block bg-[#0b1220] p-5 text-white no-underline transition hover:bg-[#101a33]">
                    <p className="text-sm font-bold tracking-[-.01em]">{title}</p>
                    <p className="mt-2 text-[15px] leading-6 text-slate-400">{text}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 transition group-hover:text-white">
                      {cta} <ArrowUpRight size={12} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#1d4ed8] py-14 text-white sm:py-16">
        <div className={`${CONTAINER} flex flex-col items-start`}>
          <p className="font-mono text-xs tracking-[.08em] text-blue-100">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="mt-2 text-[clamp(40px,5.8vw,70px)] font-bold leading-[.94] tracking-[-.065em]">
            Your course. Your time.
            <br />
            <span>Your next score.</span>
          </h2>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-semibold text-blue-600 no-underline shadow-[0_10px_30px_rgba(0,0,0,.12)]"
              href="#score"
            >
              Score my race <ArrowRight size={15} />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-4 text-[13px] font-semibold text-white no-underline hover:bg-white/10"
              href="#calculator"
            >
              Calculate a target time <Calculator size={15} />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
