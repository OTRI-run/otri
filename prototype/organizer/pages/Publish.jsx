import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, Map as MapIcon } from 'lucide-react'
import { attachRaceGpx, createEvent, createRace, submitRaceResults } from '../../apiClient'
import { clearHandoff, loadHandoff } from '../../publishHandoff'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import CountrySelect from '../../../src/components/CountrySelect'
import RaceNameList, { RACE_NAME_LIST } from '../../../src/components/RaceNameList'
import PlaceNameList, { DISTANCE_NAME_LIST, DistanceNameList, PLACE_NAME_LIST } from '../../../src/components/PlaceNameList'
import { countryOfPlace } from '../../../src/lib/placeNames'
import { navigate } from '../router'
import { Button, Card, Field, Gradient, Notice, Page, inputClass } from '../ui'

// A race scored on the public "Score my race" page, turned into a race page in one step: the two
// files wait in this browser (publishHandoff.js), the organizer adds the date, and the event, the
// race, the course and the results are created in a row. Publishing stays a separate, deliberate
// press on the review page that follows.

const STEPS = ['Creating the event', 'Measuring the course', 'Scoring the results']

function Waiting({ race }) {
  const units = useUnits()
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <p className="font-mono text-[9px] tracking-[.08em] text-blue-700">WAITING IN THIS BROWSER</p>
      <p className="mt-1 text-base font-bold tracking-[-.02em] text-[#0b1220]">{race.raceName || 'Your scored race'}</p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-2"><MapIcon size={13} className="shrink-0 text-blue-600" /> <span className="min-w-0 truncate">{race.gpx.name} · {formatDistance(race.course.distance_km, units)} · {formatElevation(race.course.elevation_gain_m, units, { sign: '+' })}</span></li>
        <li className="flex items-center gap-2"><FileSpreadsheet size={13} className="shrink-0 text-blue-600" /> <span className="min-w-0 truncate">{race.results.name} · {race.summary?.finishers ?? 0} finishers scored</span></li>
      </ul>
    </div>
  )
}

export default function PublishScoredRace({ session }) {
  const [race, setRace] = useState(undefined) // undefined: loading · null: nothing waiting
  const [eventName, setEventName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('')
  const [step, setStep] = useState(null)
  const [error, setError] = useState(null)
  const created = useRef({}) // what already exists, so a retry after an error does not create it twice

  useEffect(() => {
    loadHandoff().then((waiting) => {
      setRace(waiting)
      if (waiting) {
        setEventName(waiting.raceName || '')
        setCourseName(`${Math.round(waiting.course.distance_km)}K`)
      }
    })
  }, [])

  async function create(event) {
    event.preventDefault()
    setError(null)
    const done = created.current
    try {
      setStep(0)
      if (!done.eventId) {
        done.eventId = (await createEvent({ event_name: eventName.trim(), event_date: date, location: location.trim() || null, country: country || null }, session.token)).event_id
      }
      if (!done.raceId) {
        done.raceId = (await createRace(done.eventId, { course_name: courseName.trim(), distance_km: race.course.distance_km, elevation_gain_m: race.course.elevation_gain_m }, session.token)).race_id
      }
      setStep(1)
      if (!done.course) {
        await attachRaceGpx(done.raceId, race.gpx, session.token)
        done.course = true
      }
      setStep(2)
      const submission = await submitRaceResults(done.raceId, race.results, session.token)
      if (!submission.is_valid) throw new Error(`The results file needs a fix: ${submission.errors[0]?.message ?? 'see the results step'}`)
      await clearHandoff()
      navigate(`/races/${encodeURIComponent(done.raceId)}/review`, { replace: true })
    } catch (err) {
      setError(err.message)
      setStep(null)
    }
  }

  // Two different things, which used to be one. "Not now" reads as "remind me later" and used to
  // delete the course and the results from this browser -- the only copy there is, because a race
  // scored without an account was never uploaded anywhere. Leaving is now just leaving; throwing
  // the work away says what it costs and asks first, like every other destructive action here.
  function leave() {
    navigate(session ? '/events' : '/', { replace: true })
  }

  async function discard() {
    const gone = 'Throw away this scored race? The course file and the results are stored only in this browser, so you would have to upload both again and score them again. This cannot be undone.'
    if (!window.confirm(gone)) return
    await clearHandoff()
    navigate(session ? '/events' : '/', { replace: true })
  }

  if (race === undefined) return <Page title="One moment…" />

  if (race === null) {
    return (
      <Page
        eyebrow="PUBLISH A SCORED RACE"
        headline={<>Nothing is<br /><Gradient>waiting here.</Gradient></>}
        intro="Score a race on the public site first and press “Publish this race”: the course and the results come along, so there is nothing to upload twice. A scored race waits for a day in the browser it was scored in."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="../#score" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-[13px] font-semibold text-white no-underline">
            Score my race <ArrowRight size={15} />
          </a>
          {session && <Button variant="secondary" onClick={() => navigate('/events')}>Your events</Button>}
        </div>
      </Page>
    )
  }

  if (!session) {
    return (
      <Page
        eyebrow="PUBLISH A SCORED RACE · 1 OF 2"
        headline={<>Your race is scored.<br /><Gradient>Now give it a page.</Gradient></>}
        intro="A free organizer account keeps the race and shows it to your runners. It takes an email address and a password; nobody has to approve you, and nothing is public until you press Publish."
        aside={
          <Card>
            <Waiting race={race} />
            <div className="mt-5 grid gap-3">
              <Button onClick={() => navigate('/register')}>Create my free account <ArrowRight size={15} /></Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>I already have an account</Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              You are signed in as soon as the account exists and come straight back here. We email you a link to confirm the address; you only need it before you press Publish.
            </p>
            <button type="button" onClick={discard} className="mt-3 text-xs font-semibold text-slate-500 hover:text-red-600">Forget this race</button>
          </Card>
        }
      />
    )
  }

  const busy = step !== null
  const missing = !eventName.trim() ? 'Enter the event name.' : !date ? 'Pick the race date.' : !courseName.trim() ? 'Name the distance.' : null
  return (
    <Page
      eyebrow="PUBLISH A SCORED RACE · 2 OF 2"
      headline={<>One detail left:<br /><Gradient>the race date.</Gradient></>}
      intro="The course and the results you scored are waiting in this browser. Add the date and the race page is built for you: event, course and leaderboard. You check it on the next screen and publish when you are ready."
      aside={
        <Card>
          <Waiting race={race} />
          <form onSubmit={create} className="mt-5 grid gap-4" noValidate>
            <Field label="Event name" htmlFor="pb-name" hint="As runners know it, including the year if it is an annual event.">
              <input id="pb-name" required value={eventName} onChange={(e) => setEventName(e.target.value)} list={RACE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="Doi Suthep Trail 2026" disabled={busy} />
              <RaceNameList />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Race date" htmlFor="pb-date" hint="The day this race was run.">
                <input id="pb-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} disabled={busy} />
              </Field>
              <Field label="Distance name" htmlFor="pb-course" hint="How this distance is listed.">
                <input id="pb-course" required value={courseName} onChange={(e) => setCourseName(e.target.value)} list={DISTANCE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="30K" disabled={busy} />
                <DistanceNameList />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" htmlFor="pb-location" hint="Optional.">
                <input
                  id="pb-location"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value)
                    const known = countryOfPlace(e.target.value)
                    if (known && !country) setCountry(known)
                  }}
                  list={PLACE_NAME_LIST}
                  autoComplete="off"
                  className={inputClass}
                  placeholder="Chiang Mai"
                  disabled={busy}
                />
                <PlaceNameList />
              </Field>
              <Field label="Country" htmlFor="pb-country" hint="Optional.">
                <CountrySelect id="pb-country" value={country} onChange={setCountry} className={inputClass} />
              </Field>
            </div>

            {busy && (
              <ol className="grid gap-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                {STEPS.map((label, index) => (
                  <li key={label} className={`flex items-center gap-2 ${index > step ? 'text-slate-400' : 'text-[#0b1220]'}`}>
                    {index < step ? <CheckCircle2 size={15} className="text-emerald-600" /> : index === step ? <Loader2 size={15} className="animate-spin text-blue-600" /> : <span className="inline-block h-[15px] w-[15px] rounded-full border border-slate-300" />}
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {error && <Notice kind="error" title="That did not go through.">{error} Nothing is lost: press the button again and it continues where it stopped.</Notice>}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" busy={busy} disabled={Boolean(missing)}>
                Build my race page <ArrowRight size={15} />
              </Button>
              <Button type="button" variant="secondary" onClick={leave} disabled={busy}>
                Not now
              </Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              "Not now" keeps this race waiting here for a day.{' '}
              <button type="button" onClick={discard} disabled={busy} className="font-semibold text-slate-600 underline hover:text-red-600">
                Throw it away instead
              </button>
              .
            </p>
            {!busy && missing && <p className="text-xs text-slate-500">{missing}</p>}
            <p className="text-xs leading-5 text-slate-500">Building the page publishes nothing. The next screen shows the leaderboard as runners will see it, with one Publish button.</p>
          </form>
        </Card>
      }
    />
  )
}
