import './Runners.css'
import RankBadge from '../src/components/RankBadge'
import { fitFontSize } from '../src/lib/fitText'
import { useEffect, useMemo, useState } from 'react'
import { useDocumentTitle } from '../src/lib/title'
import { ArrowLeft, ArrowUpRight, Check, Image as ImageIcon, Link2 } from 'lucide-react'
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

const CONTAINER = "prototype-runners-container-style-1"
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
  if (index == null) return <span className="prototype-runners-index-badge-span-2">—</span>
  return (
    <span className={`prototype-runners-index-badge-span-3 ${size === 'lg' ? "prototype-runners-index-badge-span-4" : "prototype-runners-index-badge-span-5"}`}>
      {index}
      {size === 'lg' && provisional && <span className="prototype-runners-index-badge-span-6">PROV.</span>}
    </span>
  )
}

function RunnerRow({ runner, rank }) {
  return (
    <a
      href={`#runners/${encodeURIComponent(runner.runner_id)}`}
      className="prototype-runners-runner-row-a-7 otri-group"
    >
      <span className="prototype-runners-index-badge-span-2">{rank}</span>
      <span className="prototype-runners-runner-row-span-8">
        <span className="prototype-runners-runner-row-span-9">{runnerName(runner)}</span>
        <span className="prototype-runners-runner-row-span-10">
          {runner.nationality && <Flag code={runner.nationality} />}
          <span>{[runner.gender, runner.age_category].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
      <span className="prototype-runners-runner-row-span-11">
        {runner.result_count} result{runner.result_count === 1 ? '' : 's'}
      </span>
      <span className="prototype-runners-runner-row-span-11">{runner.last_race_date ?? ''}</span>
      <span className="prototype-runners-runner-row-span-12">
        <IndexBadge index={runner.index} provisional={runner.provisional} />
        <ArrowUpRight size={14} className="prototype-runners-runner-row-arrow-up-right-13" />
      </span>
    </a>
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
    <section className="prototype-runners-runners-page-section-14">
      <div className={CONTAINER}>
        <div className="prototype-runners-runners-page-div-15">
          <div className="prototype-runners-runners-page-div-16">02</div>
          <div className="prototype-runners-runner-row-span-8">
            <p className="prototype-runners-runners-page-p-17">RUNNERS</p>
            <h1 className="prototype-runners-runners-page-h1-18">
              Every runner.
              <br />
              <span className="prototype-runners-runners-page-span-19">One honest number.</span>
            </h1>
          </div>
          <p className="prototype-runners-runners-page-p-20">
            A runner's index is the recency-weighted mean of their best three race scores from the last 24 months, built
            only from results organizers have published. Fewer than three results gives a provisional index.{' '}
            <a href={METHOD_URL} className="prototype-runners-runners-page-a-21">
              How it is calculated
            </a>
            .
          </p>
        </div>

        <div className="prototype-runners-runners-page-div-22">
          <SearchSuggest
            className="prototype-runners-runners-page-search-suggest-23"
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
          <div className="prototype-runners-runners-page-div-24">
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
                className={`prototype-runners-runners-page-button-25 ${gender === value ? "prototype-runners-runners-page-button-26" : "prototype-runners-runners-page-button-27"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="prototype-runners-runners-page-p-28">
          {query ? 'SEARCH RESULTS' : 'ALL RUNNERS WITH PUBLISHED RESULTS · BY INDEX'}
          {runners ? ` · ${shown.length}` : ''}
        </p>

        {error && <p className="prototype-runners-runners-page-p-29">{error}</p>}
        {runners === null && !error && <p className="prototype-runners-runners-page-p-30">Loading…</p>}
        {runners && shown.length === 0 && (
          <div className="prototype-runners-runners-page-div-31">
            <p className="prototype-runners-runners-page-p-32">{query.trim() ? `No published results for “${query.trim()}” on OTRI yet.` : 'No runners yet.'}</p>
            <p className="prototype-runners-runners-page-p-33">
              A runner appears here when an organizer publishes a race they finished; OTRI keeps no list of every runner. Looking for your own
              score? <a href="#calculator" className="prototype-runners-runners-page-a-21">Work out what your time was worth</a> with the course as a GPX.
            </p>
          </div>
        )}
        <div className="prototype-runners-runners-page-div-34">
          <div className="prototype-runners-runners-page-div-35">
            <span>#</span>
            <span>Runner</span>
            <span className="prototype-runners-runners-page-span-36">Results</span>
            <span className="prototype-runners-runners-page-span-36">Last race</span>
            <span className="prototype-runners-runners-page-span-36">Index</span>
          </div>
          <div className="prototype-runners-runners-page-div-37">
            {shown.slice(0, visible).map((runner, index) => (
              <RunnerRow key={runner.runner_id} runner={runner} rank={index + 1} />
            ))}
          </div>
        </div>
        {shown.length > 0 && (
          <div className="prototype-runners-runners-page-div-38">
            <p className="prototype-runners-runners-page-p-39">
              Showing {Math.min(visible, shown.length)} of {shown.length}
            </p>
            {shown.length > visible && (
              <button
                type="button"
                onClick={() => setVisible((n) => n + PAGE_SIZE)}
                className="prototype-runners-runners-page-button-40"
              >
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
  const tone = result.status === 'counting' ? "otri-state-6" : result.status === 'expired' ? "otri-state-7" : "otri-state-8"
  return (
    <tr className={`prototype-runners-result-row-tr-41 ${result.status === 'expired' ? "prototype-runners-result-row-tr-42" : ''}`}>
      <td className="prototype-runners-result-row-td-43">{result.event_date}</td>
      <td className={`prototype-runners-result-row-td-44 ${tone}`}>
        <a href={`#races/${encodeURIComponent(result.race_id)}`} className="prototype-runners-result-row-a-45">
          {result.event_name}
        </a>
        <span className="prototype-runners-result-row-span-46">
          {result.course_name} · {formatDistance(result.distance_km, units)} · {formatElevation(result.elevation_gain_m, units, { sign: '+' })}
          {result.is_demo ? ' · demo' : ''}{modelShort(result.scoring_version) !== '0.1.0' ? ` · ${modelShort(result.scoring_version)}` : ''}
        </span>
        <span className="prototype-runners-result-row-span-47">
          {result.event_date} ·{' '}
          {result.status === 'counting' ? `counts ${Math.round(result.weight * 100)}%` : result.status === 'eligible' ? 'eligible' : 'expired'}
        </span>
      </td>
      <td className="prototype-runners-result-row-td-48">
        <RankBadge rank={result.rank} />
        <span className="prototype-runners-result-row-span-49"> · {formatHms(result.finish_time_seconds)}</span>
      </td>
      <td className={`prototype-runners-result-row-td-50 ${result.status === 'counting' ? "prototype-runners-result-row-td-51" : "prototype-runners-result-row-td-52"}`}>{result.otri_score}</td>
      <td className="prototype-runners-result-row-td-53">
        {result.status === 'counting' && (
          <span className="prototype-runners-result-row-span-54">
            counts · {Math.round(result.weight * 100)}%
          </span>
        )}
        {result.status === 'eligible' && <span className="prototype-runners-result-row-span-55">eligible · {Math.round(result.weight * 100)}%</span>}
        {result.status === 'expired' && <span className="prototype-runners-result-row-span-56">expired</span>}
        <span className="prototype-runners-result-row-span-57">
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
    <section className="prototype-runners-runners-page-section-14">
      <div className={CONTAINER}>
        <button onClick={onBack} className="prototype-runners-runner-profile-page-button-58">
          <ArrowLeft size={13} /> All runners
        </button>
        {error && error.status === 404 && (
          <NotFound eyebrow="RUNNER NOT FOUND" title="No runner with that id." where={runnerId} home="#runners" homeLabel="All runners" note="Runners appear here once an organizer publishes results that include them; profiles are removed on request." />
        )}
        {error && error.status !== 404 && <p className="prototype-runners-runners-page-p-29">{error.message}</p>}
        {!profile && !error && <p className="prototype-runners-runners-page-p-30">Loading…</p>}
        {profile && (
          <>
            <div className="prototype-runners-runner-profile-page-div-59">
              <div className="prototype-runners-runner-row-span-8">
                <p className="prototype-runners-runner-profile-page-p-60">
                  {profile.nationality && <Flag code={profile.nationality} />}
                  <span>{[profile.gender === 'F' ? 'WOMAN' : profile.gender === 'M' ? 'MAN' : 'RUNNER', profile.age_category].filter(Boolean).join(' · ')}</span>
                </p>
                <h1 className="prototype-runners-runner-profile-page-h1-61 otri-fit" style={{ fontSize: fitFontSize(runnerName(profile), { min: 28, vw: 4.5, max: 52 }) }}>{runnerName(profile)}</h1>
                <p className="prototype-runners-runner-profile-page-p-62">
                  {profile.result_count} published result{profile.result_count === 1 ? '' : 's'}
                  {profile.last_race_date ? ` · last race ${profile.last_race_date}` : ''}
                </p>
                <div className="prototype-runners-runner-profile-page-div-63">
                  <button
                    type="button"
                    onClick={() => {
                      setShareOpen((open) => !open)
                      if (!shareOpen) revealElement('runner-share')
                    }}
                    aria-expanded={shareOpen}
                    className="prototype-runners-runner-profile-page-button-64"
                  >
                    <ImageIcon size={15} /> {shareOpen ? 'Hide the image' : 'Share as an image'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(profileUrl).then(() => {
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      })
                    }}
                    className="prototype-runners-runner-profile-page-button-65"
                  >
                    {linkCopied ? <Check size={15} className="prototype-runners-runner-profile-page-check-66" /> : <Link2 size={15} />} {linkCopied ? 'Link copied' : 'Copy the link'}
                  </button>
                </div>
              </div>
              <div className="prototype-runners-runner-profile-page-div-67">
                <div className="prototype-runners-runner-profile-page-div-68">
                  <span>OTRI / RUNNER INDEX</span>
                  <span>{details?.version?.toUpperCase()}</span>
                </div>
                <div className="prototype-runners-runner-profile-page-div-69">
                  <small className="prototype-runners-runner-profile-page-small-70">{profile.provisional ? 'PROVISIONAL INDEX' : 'INDEX'}</small>
                  <strong className="prototype-runners-runner-profile-page-strong-71">
                    {profile.index ?? '—'}
                  </strong>
                  <span className="prototype-runners-runner-profile-page-span-72">
                    {details?.counted ?? 0} of {3} results counting · last {details?.window_months} months · as of {details?.as_of}
                  </span>
                </div>
                <p className="prototype-runners-runner-profile-page-p-73">
                  {profile.provisional
                    ? `Fewer than three results in the window. The index is the weighted mean of what is there; it firms up at three.`
                    : `Weighted mean of the best three results. Results count fully for 12 months, then fade to nothing at 24.`}
                </p>
              </div>
            </div>

            {shareOpen && (
              <div id="runner-share" className="prototype-runners-runner-profile-page-div-74">
                <p className="prototype-runners-runner-profile-page-p-75">SHARE THIS PROFILE</p>
                <h2 className="prototype-runners-runner-profile-page-h2-76">An image and a post, ready for your feed</h2>
                <p className="prototype-runners-runner-profile-page-p-77">
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

            <div className="prototype-runners-runner-profile-page-div-78">
              <table className="prototype-runners-runner-profile-page-table-79">
                <thead>
                  <tr className="prototype-runners-runner-profile-page-tr-80">
                    <th className="prototype-runners-runner-profile-page-th-81">Date</th>
                    <th className="prototype-runners-result-row-td-44">Race</th>
                    <th className="prototype-runners-result-row-td-44">Rank · time</th>
                    <th className="prototype-runners-result-row-td-44">Score</th>
                    <th className="prototype-runners-runner-profile-page-th-81">In the index</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.results.map((result) => (
                    <ResultRow key={result.result_id} result={result} units={units} />
                  ))}
                  {profile.results.length === 0 && (
                    <tr>
                      <td colSpan={5} className="prototype-runners-runner-profile-page-td-82">
                        No scored results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {profile.results.some((r) => r.is_demo) && (
              <p className="prototype-runners-runner-profile-page-p-83">
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
