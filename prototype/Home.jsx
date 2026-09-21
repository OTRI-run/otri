import { ArrowUpRight, Calculator, Search, Upload, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getRaceResults, listRaces } from './apiClient'
import { modelLabel } from '../src/lib/model'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const CONTAINER = 'mx-auto w-[min(1080px,calc(100%-32px))]'

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
  const [term, setTerm] = useState('')

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

  const search = (event) => {
    event.preventDefault()
    const q = term.trim()
    window.location.hash = q ? `#runners?q=${encodeURIComponent(q)}` : '#runners'
  }

  return (
    <>
      {/* The first screen: what it is, and the three things you can do. */}
      <section className="border-b border-slate-200 bg-white">
        <div className={`${CONTAINER} flex flex-col items-center py-16 text-center sm:py-24`}>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-slate-500">Open Trail Running Index</p>
          <h1 className="mt-4 max-w-[17ch] text-balance text-[clamp(38px,6vw,64px)] font-bold leading-[1.02] tracking-[-.04em] text-[#0b1220]">
            One score for any trail race.
          </h1>
          <p className="mt-5 max-w-[48ch] text-balance text-[17px] leading-7 text-slate-600">
            A finish time and the course it was run on, as one number from 0 to 1000.
          </p>

          <form onSubmit={search} className="mt-8 flex w-full max-w-[520px] items-center gap-2" role="search">
            <label htmlFor="home-search" className="sr-only">
              Search for a runner
            </label>
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="home-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search for a runner"
                className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[15px] text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-600"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center rounded-lg bg-blue-600 px-5 text-[14px] font-semibold text-white hover:bg-blue-700"
            >
              Search
            </button>
          </form>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <a href="#calculator" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 no-underline hover:underline">
              What is my time worth? <ArrowUpRight size={14} />
            </a>
            <a href="#score" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600 no-underline hover:underline">
              Score my race <ArrowUpRight size={14} />
            </a>
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

      {/* Three doors. One line each, because the page they open explains itself. */}
      <section className="border-b border-slate-200 bg-white">
        <div className={`${CONTAINER} grid gap-px bg-slate-200 py-0 sm:grid-cols-3`}>
          {[
            [Calculator, 'Calculator', 'Try a time on any course.', '#calculator'],
            [Upload, 'Score a race', 'Two files, every finisher scored.', '#score'],
            [Users, 'Runners and races', 'Browse everything scored so far.', '#races'],
          ].map(([Icon, title, line, href]) => (
            <a key={title} href={href} className="group bg-white py-8 no-underline sm:px-7 sm:first:pl-0">
              <Icon size={18} className="text-blue-600" />
              <p className="mt-3 text-[17px] font-bold tracking-[-.02em] text-[#0b1220]">{title}</p>
              <p className="mt-1 text-[14px] text-slate-600">{line}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600 group-hover:underline">
                Open <ArrowUpRight size={13} />
              </span>
            </a>
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
    </>
  )
}
