import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react'
import NextSteps from './NextSteps'
import { DemoBadge } from './RaceCard'
import { getRunner, listRunners } from './apiClient'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'
const METHOD_URL = 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/RUNNER-INDEX-v1.md'

function formatHms(totalSeconds) {
  if (totalSeconds == null) return '—'
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function runnerName(runner) {
  return `${runner.first_name} ${runner.family_name}`
}

function IndexBadge({ index, provisional, size = 'sm' }) {
  if (index == null) return <span className="font-mono text-xs text-slate-400">—</span>
  return (
    <span className={`inline-flex items-baseline gap-1 font-mono font-bold text-blue-600 ${size === 'lg' ? 'text-3xl' : 'text-base'}`}>
      {index}
      {provisional && <span className="font-mono text-[8px] font-medium tracking-[.08em] text-amber-600">PROV.</span>}
    </span>
  )
}

function RunnerRow({ runner, rank }) {
  return (
    <a
      href={`#runners/${encodeURIComponent(runner.runner_id)}`}
      className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300 sm:grid-cols-[32px_minmax(0,1fr)_120px_100px_auto]"
    >
      <span className="font-mono text-xs text-slate-400">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#0b1220]">{runnerName(runner)}</span>
        <span className="block font-mono text-[10px] text-slate-500">
          {[runner.gender, runner.age_category, runner.nationality].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="hidden font-mono text-[10px] text-slate-500 sm:block">
        {runner.result_count} result{runner.result_count === 1 ? '' : 's'}
      </span>
      <span className="hidden font-mono text-[10px] text-slate-500 sm:block">{runner.last_race_date ?? ''}</span>
      <span className="flex items-center gap-2">
        <IndexBadge index={runner.index} provisional={runner.provisional} />
        <ArrowUpRight size={14} className="text-slate-300 transition group-hover:text-blue-600" />
      </span>
    </a>
  )
}

export function RunnersPage({ initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [runners, setRunners] = useState(null)
  const [error, setError] = useState(null)
  const [gender, setGender] = useState('all')

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setError(null)
      listRunners(query.trim() || undefined)
        .then((rows) => !cancelled && setRunners(rows))
        .catch((err) => !cancelled && setError(err.message))
    }, query ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const shown = useMemo(() => (runners ?? []).filter((r) => gender === 'all' || r.gender === gender), [runners, gender])

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className={CONTAINER}>
        <div className="grid min-w-0 items-end gap-6 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,.8fr)]">
          <div className="font-mono text-xs text-blue-600">02</div>
          <div className="min-w-0">
            <p className="mb-3 font-mono text-[10px] tracking-[.08em] text-slate-500">RUNNERS</p>
            <h1 className="text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
              Every runner.
              <br />
              <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">One honest number.</span>
            </h1>
          </div>
          <p className="min-w-0 text-sm leading-7 text-slate-500">
            A runner's index is the recency-weighted mean of their best three race scores from the last 24 months, built
            only from results organizers have published. Fewer than three results gives a provisional index.{' '}
            <a href={METHOD_URL} className="font-semibold text-blue-600 no-underline hover:underline">
              How it is calculated
            </a>
            .
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a runner by name…"
              aria-label="Search runners"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            {[
              ['all', 'All'],
              ['F', 'Women'],
              ['M', 'Men'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                aria-pressed={gender === value}
                className={`px-3 py-2 text-xs font-semibold ${gender === value ? 'bg-[#0b1220] text-white' : 'text-slate-500 hover:text-[#0b1220]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 font-mono text-[9px] tracking-[.08em] text-slate-400">
          {query ? 'SEARCH RESULTS' : 'ALL RUNNERS WITH PUBLISHED RESULTS · BY INDEX'}
          {runners ? ` · ${shown.length}` : ''}
        </p>

        {error && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        {runners === null && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {runners && shown.length === 0 && <p className="mt-6 text-sm text-slate-500">No runner matches that yet.</p>}
        <div className="mt-4 grid gap-2">
          {shown.map((runner, index) => (
            <RunnerRow key={runner.runner_id} runner={runner} rank={index + 1} />
          ))}
        </div>

        <NextSteps
          items={[
            ['Not listed yet?', 'Runners appear once an organizer publishes a race they finished.', 'For organizers', 'organizer/'],
            ['What would you score?', 'Pick a course and a target time. The score updates live.', 'Calculate your score', '#calculator'],
            ['Why these numbers?', 'The rule, the research behind it, and what it does not know.', 'Runner index method', METHOD_URL],
          ]}
        />
      </div>
    </section>
  )
}

function ResultRow({ result, units }) {
  const tone = result.status === 'counting' ? 'text-[#0b1220]' : result.status === 'expired' ? 'text-slate-400' : 'text-slate-600'
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${result.status === 'expired' ? 'opacity-70' : ''}`}>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{result.event_date}</td>
      <td className={`px-4 py-3 ${tone}`}>
        <a href={`#races/${encodeURIComponent(result.race_id)}`} className="font-medium no-underline hover:underline">
          {result.event_name}
        </a>
        <span className="block font-mono text-[10px] text-slate-500">
          {result.course_name} · {formatDistance(result.distance_km, units)} · {formatElevation(result.elevation_gain_m, units, { sign: '+' })}
          {result.is_demo ? ' · demo' : ''}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">
        {result.rank}
        <span className="text-slate-400"> · {formatHms(result.finish_time_seconds)}</span>
      </td>
      <td className={`px-4 py-3 font-mono text-sm font-bold ${result.status === 'counting' ? 'text-blue-600' : 'text-slate-500'}`}>{result.otri_score}</td>
      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
        {result.status === 'counting' && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] text-white">
            counts · {Math.round(result.weight * 100)}%
          </span>
        )}
        {result.status === 'eligible' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] uppercase tracking-[.06em] text-slate-600">eligible · {Math.round(result.weight * 100)}%</span>}
        {result.status === 'expired' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] uppercase tracking-[.06em] text-slate-500">expired</span>}
        <span className="mt-1 block">
          {result.status === 'expired' ? `expired ${result.expires_on}` : `full until ${result.full_until} · expires ${result.expires_on}`}
        </span>
      </td>
    </tr>
  )
}

export function RunnerProfilePage({ runnerId, onBack }) {
  const units = useUnits()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    getRunner(runnerId)
      .then((data) => !cancelled && setProfile(data))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [runnerId])

  const details = profile?.index_details

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className={CONTAINER}>
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
          <ArrowLeft size={13} /> All runners
        </button>
        {error && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        {!profile && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {profile && (
          <>
            <div className="mt-6 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">
                  {[profile.gender === 'F' ? 'WOMAN' : profile.gender === 'M' ? 'MAN' : 'RUNNER', profile.age_category, profile.nationality].filter(Boolean).join(' · ')}
                </p>
                <h1 className="mt-2 text-[clamp(32px,4.5vw,52px)] font-bold leading-[.98] tracking-[-.05em] text-[#0b1220]">{runnerName(profile)}</h1>
                <p className="mt-3 text-sm text-slate-500">
                  {profile.result_count} published result{profile.result_count === 1 ? '' : 's'}
                  {profile.last_race_date ? ` · last race ${profile.last_race_date}` : ''}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#08111f_0%,#0b1730_58%,#123b85_100%)] p-5 text-white shadow-[0_24px_70px_rgba(11,18,32,.2)]">
                <div className="flex items-center justify-between font-mono text-[8px] tracking-[.08em] text-slate-400">
                  <span>OTRI / RUNNER INDEX</span>
                  <span>{details?.version?.toUpperCase()}</span>
                </div>
                <div className="py-6 text-center">
                  <small className="font-mono text-[8px] tracking-[.08em] text-blue-300">{profile.provisional ? 'PROVISIONAL INDEX' : 'INDEX'}</small>
                  <strong className="mt-1 block bg-gradient-to-r from-white to-blue-200 bg-clip-text pb-1 text-[72px] font-bold leading-none tracking-[-.06em] text-transparent">
                    {profile.index ?? '—'}
                  </strong>
                  <span className="mt-2 block font-mono text-[10px] text-slate-400">
                    {details?.counted ?? 0} of {3} results counting · last {details?.window_months} months · as of {details?.as_of}
                  </span>
                </div>
                <p className="border-t border-slate-700/70 pt-3 text-[11px] leading-5 text-slate-400">
                  {profile.provisional
                    ? `Fewer than three results in the window. The index is the weighted mean of what is there; it firms up at three.`
                    : `Weighted mean of the best three results. Results count fully for 12 months, then fade to nothing at 24.`}
                </p>
              </div>
            </div>

            <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Race</th>
                    <th className="px-4 py-3">Rank · time</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">In the index</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.results.map((result) => (
                    <ResultRow key={result.result_id} result={result} units={units} />
                  ))}
                  {profile.results.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        No scored results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {profile.results.some((r) => r.is_demo) && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <DemoBadge /> Some of these results are synthetic demo data.
              </p>
            )}
            <p className="mt-3 font-mono text-[9px] tracking-[.05em] text-slate-400">
              Built only from races their organizers published. Is this you and something is wrong?{' '}
              <a href={`mailto:hello@otri.run?subject=${encodeURIComponent(`Runner profile ${profile.runner_id}`)}`} className="text-blue-600 underline">
                Ask for a correction or removal
              </a>
              .
            </p>
            <NextSteps
              items={[
                ['Why this index?', 'The rule, the research behind it, and what it does not know.', 'Runner index method', METHOD_URL],
                ['Beat it next time', 'Pick a course and see what time a higher score needs.', 'Calculate a score', '#calculator'],
                ['Compare', 'Every runner with published results, by index.', 'All runners', '#runners'],
              ]}
            />
          </>
        )}
      </div>
    </section>
  )
}
