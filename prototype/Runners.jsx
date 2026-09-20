import './Runners.css'
import RankBadge from '../src/components/RankBadge'
import { fitFontSize } from '../src/lib/fitText'
import { useEffect, useMemo, useState } from 'preact/compat'
import { useDocumentTitle } from '../src/lib/title'
import { ArrowLeft, Check, Image as ImageIcon, Info, Link as LinkIcon } from '../src/ui/icons'
import { ShareRunner } from './SharePanel'
import { revealElement } from '../src/lib/comfort'
import NextSteps from './NextSteps'
import { DemoBadge } from './RaceCard'
import { getRunner, listRunners } from './apiClient'
import SearchSuggest from '../src/components/SearchSuggest'
import { RUNNER_NAMES } from '../src/lib/runnerNames'
import { knownButNotHere } from '../src/lib/suggest'
import ReportForm from './ReportForm'
import { modelShort } from '../src/lib/model'
import NotFound from '../src/components/NotFound'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import Flag from '../src/components/Flag'

const METHOD_URL = 'https://github.com/OTRI-run/otri/blob/main/docs/methodology/runner-index/RUNNER-INDEX-v1.md'

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
  if (index == null) return <span className="muted">—</span>
  return (
    <span className={`score ${size === 'lg' ? 'runners-index-badge--lg' : ''}`}>
      {index}
      {size === 'lg' && provisional && <span className="badge badge--ochre">PROV.</span>}
    </span>
  )
}

function RunnerRow({ runner, rank }) {
  return (
    <tr>
      <td className="num muted">{rank}</td>
      <td>
        <a href={`#runners/${encodeURIComponent(runner.runner_id)}`}>{runnerName(runner)}</a>
        <span className="cluster cluster--tight tiny muted mt-1">
          {runner.nationality && <Flag code={runner.nationality} />}
          <span className="mono">{[runner.gender, runner.age_category].filter(Boolean).join(' · ')}</span>
        </span>
      </td>
      <td className="hide-sm num right">
        {runner.result_count} result{runner.result_count === 1 ? '' : 's'}
      </td>
      <td className="hide-sm num right">{runner.last_race_date ?? ''}</td>
      <td className="right">
        <IndexBadge index={runner.index} provisional={runner.provisional} />
      </td>
    </tr>
  )
}

const PAGE_SIZE = 25

export function RunnersPage({ initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [runners, setRunners] = useState(null)
  const [error, setError] = useState(null)
  const [gender, setGender] = useState('all')
  // Long lists render a page at a time; search and the gender filter still cover everything loaded.
  const [visible, setVisible] = useState(PAGE_SIZE)
  useEffect(() => setVisible(PAGE_SIZE), [query, gender])

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
    <section className="section">
      <div className="wrap">
        <div className="grid grid--head">
          <div className="stack">
            <p className="eyebrow">Runners</p>
            <h1 className="display-2">
              Every runner.
              <br />
              <span className="accent">One honest number.</span>
            </h1>
          </div>
          <p className="lead">
            A runner's index is the recency-weighted mean of their best three race scores from the last 24 months, built
            only from results organizers have published. Fewer than three results gives a provisional index.{' '}
            <a href={METHOD_URL} className="link">
              How it is calculated
            </a>
            .
          </p>
        </div>

        <div className="toolbar mt-8">
          <SearchSuggest
            className="grow"
            value={query}
            onChange={setQuery}
            placeholder="Search a runner by name…"
            ariaLabel="Search runners"
            suggestions={[
              ...shown.slice(0, 6).map((runner) => ({
                key: runner.runner_id,
                label: `${runner.first_name} ${runner.family_name}`,
                detail: [runner.nationality, runner.index != null ? `index ${runner.index}` : `${runner.result_count} result${runner.result_count === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
                href: `#runners/${encodeURIComponent(runner.runner_id)}`,
              })),
              // Well-known runners with no published result here: said in the list, not by an empty page.
              ...knownButNotHere(RUNNER_NAMES, query, shown.map((runner) => `${runner.first_name} ${runner.family_name}`), 3).map((name) => ({ key: `known-${name}`, label: name, detail: 'no results on OTRI yet' })),
            ]}
          />
          <div className="seg" role="group" aria-label="Gender">
            {[
              ['all', 'All'],
              ['F', 'Women'],
              ['M', 'Men'],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setGender(value)} aria-pressed={gender === value}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="tiny muted mono mt-3" aria-live="polite">
          {query ? 'SEARCH RESULTS' : 'ALL RUNNERS WITH PUBLISHED RESULTS · BY INDEX'}
          {runners ? ` · ${shown.length}` : ''}
        </p>

        {error && <p className="notice notice--warning notice--plain mt-6">{error}</p>}
        {runners === null && !error && <p className="loading mt-6"><span className="spinner" /> Loading…</p>}
        {runners && shown.length === 0 && (
          <div className="empty mt-6">
            <p className="empty__title">{query.trim() ? `No published results for “${query.trim()}” on OTRI yet.` : 'No runners yet.'}</p>
            <p className="empty__text">
              A runner appears here when an organizer publishes a race they finished; OTRI keeps no list of every runner. Looking for your own
              score? <a href="#calculator" className="link">Work out what your time was worth</a> with the course as a GPX.
            </p>
          </div>
        )}
        {shown.length > 0 && (
          <div className="table-wrap mt-5">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Runner</th>
                  <th className="hide-sm right">Results</th>
                  <th className="hide-sm right">Last race</th>
                  <th className="right">Index</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, visible).map((runner, index) => (
                  <RunnerRow key={runner.runner_id} runner={runner} rank={index + 1} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown.length > 0 && (
          <div className="cluster cluster--between mt-5">
            <p className="tiny muted mono">
              Showing {Math.min(visible, shown.length)} of {shown.length}
            </p>
            {shown.length > visible && (
              <button type="button" onClick={() => setVisible((n) => n + PAGE_SIZE)} className="btn btn--secondary">
                Show {Math.min(PAGE_SIZE, shown.length - visible)} more
              </button>
            )}
          </div>
        )}

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
  return (
    <tr className={result.status === 'expired' ? 'is-muted' : ''}>
      <td className="hide-md num">{result.event_date}</td>
      <td className={result.status === 'eligible' ? 'muted' : ''}>
        <a href={`#races/${encodeURIComponent(result.race_id)}`}>
          {result.event_name}
        </a>
        <span className="block tiny muted mono">
          {result.course_name} · {formatDistance(result.distance_km, units)} · {formatElevation(result.elevation_gain_m, units, { sign: '+' })}
          {result.is_demo ? ' · demo' : ''}{modelShort(result.scoring_version) !== '0.1.0' ? ` · ${modelShort(result.scoring_version)}` : ''}
        </span>
        <span className="block tiny muted mono only-md mt-1">
          {result.event_date} ·{' '}
          {result.status === 'counting' ? `counts ${Math.round(result.weight * 100)}%` : result.status === 'eligible' ? 'eligible' : 'expired'}
        </span>
      </td>
      <td className="num">
        <RankBadge rank={result.rank} />
        <span className="muted"> · {formatHms(result.finish_time_seconds)}</span>
      </td>
      <td className="right">
        <span className={`score ${result.status === 'counting' ? '' : 'runners-score--out'}`}>{result.otri_score}</span>
      </td>
      <td className="hide-md tiny">
        {result.status === 'counting' && (
          <span className="badge badge--solid-moss">
            counts · {Math.round(result.weight * 100)}%
          </span>
        )}
        {result.status === 'eligible' && <span className="badge">eligible · {Math.round(result.weight * 100)}%</span>}
        {result.status === 'expired' && <span className="badge">expired</span>}
        <span className="block muted mono mt-1">
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
  useDocumentTitle(profile ? `${profile.first_name} ${profile.family_name} · OTRI` : 'Runner · OTRI')
  const [shareOpen, setShareOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const profileUrl = `${window.location.origin}${window.location.pathname}#runners/${encodeURIComponent(runnerId)}`

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    getRunner(runnerId)
      .then((data) => !cancelled && setProfile(data))
      .catch((err) => !cancelled && setError(err))
    return () => {
      cancelled = true
    }
  }, [runnerId])

  const details = profile?.index_details

  return (
    <section className="section">
      <div className="wrap">
        <button onClick={onBack} className="back">
          <ArrowLeft size={16} /> All runners
        </button>
        {error && error.status === 404 && (
          <NotFound eyebrow="RUNNER NOT FOUND" title="No runner with that id." where={runnerId} home="#runners" homeLabel="All runners" note="Runners appear here once an organizer publishes results that include them; profiles are removed on request." />
        )}
        {error && error.status !== 404 && <p className="notice notice--warning notice--plain mt-6">{error.message}</p>}
        {!profile && !error && <p className="loading mt-6"><span className="spinner" /> Loading…</p>}
        {profile && (
          <>
            <div className="page-head page-head--split mt-6">
              <div className="page-head__text">
                <p className="eyebrow">
                  {profile.nationality && <Flag code={profile.nationality} />}
                  <span>{[profile.gender === 'F' ? 'WOMAN' : profile.gender === 'M' ? 'MAN' : 'RUNNER', profile.age_category].filter(Boolean).join(' · ')}</span>
                </p>
                <h1 className="otri-fit" style={{ fontSize: fitFontSize(runnerName(profile), { min: 28, vw: 4.5, max: 52 }) }}>{runnerName(profile)}</h1>
                <p className="lead">
                  {profile.result_count} published result{profile.result_count === 1 ? '' : 's'}
                  {profile.last_race_date ? ` · last race ${profile.last_race_date}` : ''}
                </p>
                <div className="cluster cluster--tight">
                  <button
                    type="button"
                    onClick={() => {
                      setShareOpen((open) => !open)
                      if (!shareOpen) revealElement('runner-share')
                    }}
                    aria-expanded={shareOpen}
                    className="btn btn--secondary"
                  >
                    <ImageIcon size={16} /> {shareOpen ? 'Hide the image' : 'Share as an image'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(profileUrl).then(() => {
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      })
                    }}
                    className="btn btn--ghost"
                  >
                    {linkCopied ? <Check size={16} className="icon--moss" /> : <LinkIcon size={16} />} {linkCopied ? 'Link copied' : 'Copy the link'}
                  </button>
                </div>
              </div>
              <div className="panel stack">
                <div className="cluster cluster--between panel__label">
                  <span>OTRI / RUNNER INDEX</span>
                  <span>{details?.version?.toUpperCase()}</span>
                </div>
                <div className="stat stat--lg runners-index">
                  <span className="stat__label">{profile.provisional ? 'PROVISIONAL INDEX' : 'INDEX'}</span>
                  <span className="stat__value">{profile.index ?? '—'}</span>
                  <span className="tiny mono muted mt-2">
                    {details?.counted ?? 0} of {3} results counting · last {details?.window_months} months · as of {details?.as_of}
                  </span>
                </div>
                {!profile.provisional && (
                  <p className="small muted panel__rule runners-index__note">
                    Weighted mean of the best three results. Results count fully for 12 months, then fade to nothing at 24.
                  </p>
                )}
              </div>
            </div>

            {profile.provisional && (
              <div className="notice notice--info mt-6">
                <Info size={18} />
                <div className="notice__body">
                  <p className="notice__title">Provisional index</p>
                  <p>Fewer than three results in the window. The index is the weighted mean of what is there; it firms up at three.</p>
                </div>
              </div>
            )}

            {shareOpen && (
              <div id="runner-share" className="card card--pad-lg mt-8 runners-share">
                <p className="eyebrow">SHARE THIS PROFILE</p>
                <h2 className="h-2 mt-2">An image and a post, ready for your feed</h2>
                <p className="muted measure mt-2 mb-5">
                  The index and the best three races as a picture, with a post written to go with it. Pick a format, change the words if you like,
                  then download the image or send both to an app. Nothing is posted or stored by OTRI.
                </p>
                <ShareRunner
                  name={runnerName(profile)}
                  facts={[profile.nationality, profile.age_category, `${profile.result_count} published result${profile.result_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  index={profile.index}
                  provisional={profile.provisional}
                  results={profile.results}
                  url={profileUrl}
                />
              </div>
            )}

            <div className="table-wrap mt-8">
              <table className="table">
                <thead>
                  <tr>
                    <th className="hide-md">Date</th>
                    <th>Race</th>
                    <th>Rank · time</th>
                    <th className="right">Score</th>
                    <th className="hide-md">In the index</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.results.map((result) => (
                    <ResultRow key={result.result_id} result={result} units={units} />
                  ))}
                  {profile.results.length === 0 && (
                    <tr>
                      <td colSpan={5} className="table__empty">
                        No scored results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {profile.results.some((r) => r.is_demo) && (
              <p className="cluster cluster--tight small muted mt-3">
                <DemoBadge /> Some of these results are synthetic demo data.
              </p>
            )}
            <ReportForm kind="runner" subjectId={profile.runner_id} subjectLabel={runnerName(profile)} />
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
