import './Publish.css'
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
    <div className="prototype-organizer-pages-publish-waiting-div-1">
      <p className="prototype-organizer-pages-publish-waiting-p-2">WAITING IN THIS BROWSER</p>
      <p className="prototype-organizer-pages-publish-waiting-p-3">{race.raceName || 'Your scored race'}</p>
      <ul className="prototype-organizer-pages-publish-waiting-ul-4">
        <li className="prototype-organizer-pages-publish-waiting-li-5"><MapIcon size={13} className="prototype-organizer-pages-publish-waiting-map-icon-6" /> <span className="prototype-organizer-pages-publish-waiting-span-7">{race.gpx.name} · {formatDistance(race.course.distance_km, units)} · {formatElevation(race.course.elevation_gain_m, units, { sign: '+' })}</span></li>
        <li className="prototype-organizer-pages-publish-waiting-li-5"><FileSpreadsheet size={13} className="prototype-organizer-pages-publish-waiting-map-icon-6" /> <span className="prototype-organizer-pages-publish-waiting-span-7">{race.results.name} · {race.summary?.finishers ?? 0} finishers scored</span></li>
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

  async function discard() {
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
        <div className="prototype-organizer-pages-publish-publish-scored-race-div-8">
          <a href="../#score" className="prototype-organizer-pages-publish-publish-scored-race-a-9">
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
            <div className="prototype-organizer-pages-publish-publish-scored-race-div-10">
              <Button onClick={() => navigate('/register')}>Create my free account <ArrowRight size={15} /></Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>I already have an account</Button>
            </div>
            <p className="prototype-organizer-pages-publish-publish-scored-race-p-11">
              You are signed in as soon as the account exists and come straight back here. We email you a link to confirm the address; you only need it before you press Publish.
            </p>
            <button type="button" onClick={discard} className="prototype-organizer-pages-publish-publish-scored-race-button-12">Forget this race</button>
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
          <form onSubmit={create} className="prototype-organizer-pages-publish-publish-scored-race-form-13" noValidate>
            <Field label="Event name" htmlFor="pb-name" hint="As runners know it, including the year if it is an annual event.">
              <input id="pb-name" required value={eventName} onChange={(e) => setEventName(e.target.value)} list={RACE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="Doi Suthep Trail 2026" disabled={busy} />
              <RaceNameList />
            </Field>
            <div className="prototype-organizer-pages-publish-publish-scored-race-div-14">
              <Field label="Race date" htmlFor="pb-date" hint="The day this race was run.">
                <input id="pb-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} disabled={busy} />
              </Field>
              <Field label="Distance name" htmlFor="pb-course" hint="How this distance is listed.">
                <input id="pb-course" required value={courseName} onChange={(e) => setCourseName(e.target.value)} list={DISTANCE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="30K" disabled={busy} />
                <DistanceNameList />
              </Field>
            </div>
            <div className="prototype-organizer-pages-publish-publish-scored-race-div-14">
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
              <ol className="prototype-organizer-pages-publish-publish-scored-race-ol-15">
                {STEPS.map((label, index) => (
                  <li key={label} className={`prototype-organizer-pages-publish-waiting-li-5 ${index > step ? "prototype-organizer-pages-publish-publish-scored-race-li-16" : "prototype-organizer-pages-publish-publish-scored-race-li-17"}`}>
                    {index < step ? <CheckCircle2 size={15} className="prototype-organizer-pages-publish-publish-scored-race-check-circle2-18" /> : index === step ? <Loader2 size={15} className="prototype-organizer-pages-publish-publish-scored-race-loader2-19" /> : <span className="prototype-organizer-pages-publish-publish-scored-race-span-20" />}
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {error && <Notice kind="error" title="That did not go through.">{error} Nothing is lost: press the button again and it continues where it stopped.</Notice>}

            <div className="prototype-organizer-pages-publish-publish-scored-race-div-21">
              <Button type="submit" busy={busy} disabled={Boolean(missing)}>
                Build my race page <ArrowRight size={15} />
              </Button>
              <Button type="button" variant="secondary" onClick={discard} disabled={busy}>
                Not now
              </Button>
            </div>
            {!busy && missing && <p className="prototype-organizer-pages-publish-publish-scored-race-p-22">{missing}</p>}
            <p className="prototype-organizer-pages-publish-publish-scored-race-p-23">Building the page publishes nothing. The next screen shows the leaderboard as runners will see it, with one Publish button.</p>
          </form>
        </Card>
      }
    />
  )
}
