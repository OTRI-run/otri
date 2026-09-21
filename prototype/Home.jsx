import { ArrowRight, ArrowUpRight, Calculator, Timer, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getRaceResults, listRaces } from './apiClient'
import { modelLabel } from '../src/lib/model'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const CONTAINER = 'mx-auto w-[min(1080px,calc(100%-32px))]'
const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white no-underline shadow-[0_10px_28px_rgba(37,99,235,.2)] hover:from-blue-800 hover:to-blue-600'
const textLink = 'inline-flex items-center gap-1 text-xs font-semibold text-blue-600 no-underline hover:underline'

/**
 * The landing page.
 *
 * It is deliberately short. Someone arriving here wants to look a runner up, work out what a time
 * is worth, or score their race, and every extra paragraph puts those further away. So the page is
 * one sentence, a search field, three doors, and the scores themselves. Everything that explains
 * the method lives behind a link, on the pages built to explain it.
 */
export default function Home() {
  const [races, setRaces] = useState([])
  const [recent, setRecent] = useState([])

  useEffect(() => {
    let cancelled = false
    listRaces()
      .then(async (all) => {
        if (cancelled) return
        const published = all.filter((race) => race.is_published)
        setRaces(published)
        // A handful of real finishers from the newest scored races: the product, not a description of it.
        const sample = published.filter((race) => (race.finisher_count ?? 0) > 0).slice(0, 4)
        const lists = await Promise.all(sample.map((race) => getRaceResults(race.race_id).catch(() => [])))
        const rows = sample.flatMap((race, i) =>
          lists[i]
            .filter((row) => row.status === 'finisher' && row.otri_score != null)
            .slice(0, 3)
            .map((row) => ({
              key: `${race.race_id}-${row.runner_id ?? row.family_name}`,
              name: `${row.first_name} ${row.family_name}`,
              race: race.event_name,
              score: row.otri_score,
              runnerId: row.runner_id,
              raceId: race.race_id,
            })),
        )
        if (!cancelled) setRecent(rows.sort((a, b) => b.score - a.score).slice(0, 8))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const resultCount = races.reduce((sum, race) => sum + (race.finisher_count ?? 0), 0)
  const version = races[0]?.scoring_version

  return (
    <>
      {/* The first screen: what it is, and the two people who come here. */}
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} py-14 sm:py-20`}>
          <p className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
            OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> PROTOTYPE
          </p>
          <h1 className="mt-5 max-w-[14ch] text-[clamp(44px,7vw,80px)] font-bold leading-[1.04] tracking-[-.06em] text-[#0b1220]">
            The open score
            <br />
            <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">for any trail race.</em>
          </h1>
          <p className="mt-6 max-w-[44ch] text-[17px] leading-7 text-slate-600">
            A finish time and the course it was run on, as one number from 0 to 1000.
          </p>

          <div className="mt-9 grid max-w-[680px] gap-3 sm:grid-cols-2">
            {[
              {
                who: 'I run',
                Icon: Timer,
                title: 'What is my time worth?',
                href: '#calculator',
                action: 'Open the calculator',
                more: ['Find my results', '#runners'],
              },
              {
                who: 'I organise a race',
                Icon: Upload,
                title: 'Score my whole race',
                href: '#score',
                action: 'Score my race',
                more: ['See an example', '#score?example=1'],
              },
            ].map(({ who, Icon, title, href, action, more }) => (
              <div key={who} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_10px_28px_rgba(15,23,42,.04)]">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Icon size={18} />
                  </span>
                  <span className="text-[17px] font-bold uppercase leading-6 tracking-[-.01em] text-blue-700">{who}</span>
                </span>
                <b className="mt-3 block flex-1 text-[16px] leading-6 tracking-[-.02em] text-[#0b1220]">{title}</b>
                <a className={`${primaryButton} mt-4`} href={href}>
                  {action} <ArrowRight size={15} />
                </a>
                <a className={`${textLink} mt-3 justify-center`} href={more[1]}>
                  {more[0]}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the index holds, as numbers rather than claims. */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className={`${CONTAINER} grid grid-cols-3 divide-x divide-slate-200`}>
          {[
            ['Races scored', races.length || '—'],
            ['Results', resultCount || '—'],
            ['Model', version ? modelLabel(version) : '—'],
          ].map(([label, value], i) => (
            <div key={label} className={i ? 'px-5 py-5 sm:px-7' : 'py-5 pr-5 sm:pr-7'}>
              <p className="font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">{label}</p>
              <p className="mt-1 text-[22px] font-bold tracking-[-.03em] text-[#0b1220]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The scores themselves. */}
      {recent.length > 0 && (
        <section className="border-b border-slate-200 bg-white">
          <div className={`${CONTAINER} py-14`}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[20px] font-bold tracking-[-.03em] text-[#0b1220]">Recently scored</h2>
              <a href="#races" className="text-[13px] font-semibold text-blue-600 no-underline hover:underline">
                All races
              </a>
            </div>
            <ul className="mt-4 border-t border-slate-200">
              {recent.map((row) => (
                <li key={row.key}>
                  <a
                    href={row.runnerId ? `#runners/${encodeURIComponent(row.runnerId)}` : `#races/${encodeURIComponent(row.raceId)}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-200 py-3 no-underline hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[#0b1220]">{row.name}</span>
                      <span className="block truncate text-[13px] text-slate-500">{row.race}</span>
                    </span>
                    <span className="font-mono text-[18px] font-semibold tabular-nums text-blue-600">{row.score}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* One line about the method, and the door to it. */}
      <section id="contribute" className="scroll-mt-24 bg-slate-50">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-4 py-10`}>
          <p className="text-[15px] text-slate-600">
            The model is public and versioned. Anyone can read it, check it, or propose a change.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <a href={`${GITHUB_URL}/blob/main/METHODOLOGY.md`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 no-underline hover:underline">
              The method <ArrowUpRight size={14} />
            </a>
            <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 no-underline hover:underline">
              The code <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* The bottom of the page, as it was: one invitation, in the house blue. */}
      <section className="bg-[linear-gradient(115deg,#1d4ed8_0%,#2563eb_48%,#0891b2_100%)] py-14 text-white sm:py-16">
        <div className={`${CONTAINER} flex flex-col items-start`}>
          <p className="font-mono text-[10px] tracking-[.08em] text-blue-100">OPEN TRAIL RUNNING INDEX</p>
          <h2 className="mt-2 text-[clamp(40px,5.8vw,70px)] font-bold leading-[.94] tracking-[-.065em]">
            Compare trail performances.
            <br />
            <span>Not just finish times.</span>
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
