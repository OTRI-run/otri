import './Events.css'
import { autoFocusOnDesktop } from '../../../src/lib/comfort'
import { useEffect, useState } from 'preact/compat'
import { ArrowRight, ArrowUpRight, CalendarDays, Plus } from 'lucide-react'
import { createEvent, deleteEvent, getEvent, listMyEvents, updateEvent } from '../../apiClient'
import { Link, navigate } from '../router'
import { hasHandoff } from '../../publishHandoff'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { Button, Card, EmptyState, Eyebrow, Field, Gradient, Notice, Page, StatusChip, formatDate, inputClass, raceStatus } from '../ui'
import CountrySelect from '../../../src/components/CountrySelect'
import RaceNameList, { RACE_NAME_LIST } from '../../../src/components/RaceNameList'
import PlaceNameList, { PLACE_NAME_LIST } from '../../../src/components/PlaceNameList'
import { countryOfPlace } from '../../../src/lib/placeNames'

export function Dashboard({ session }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listMyEvents(session.token)
      .then(setEvents)
      .catch((err) => setError(err.message))
  }, [session.token])

  return (
    <Page
      eyebrow="ORGANIZER DASHBOARD"
      headline={
        <>
          Your
          <br />
          <Gradient>events.</Gradient>
        </>
      }
      intro="An event is one edition of your race weekend. Each race distance lives inside it, with its own course and results."
    >
      <div className="prototype-organizer-pages-events-dashboard-div-1">
        <p className="prototype-organizer-pages-events-dashboard-p-2">
          {events ? `${events.length} EVENT${events.length === 1 ? '' : 'S'}` : ''}
        </p>
        {events?.length !== 0 && (
          <Button onClick={() => navigate('/events/new')}>
            <Plus size={15} /> Create event
          </Button>
        )}
      </div>
      {hasHandoff() && (
        <div className="prototype-organizer-pages-events-dashboard-div-3">
          <Notice kind="success" title="The race you scored is waiting.">
            The course and the results are in this browser.{' '}
            <Link to="/publish" className="prototype-organizer-pages-events-dashboard-link-4">Build its race page</Link>
          </Notice>
        </div>
      )}
      {error && (
        <div className="prototype-organizer-pages-events-dashboard-div-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {events === null && !error && <p className="prototype-organizer-pages-events-dashboard-p-5">Loading your events…</p>}
      {events?.length === 0 && (
        <div className="prototype-organizer-pages-events-dashboard-div-6">
          <EmptyState
            title="No events yet"
            action={
              <Button onClick={() => navigate('/events/new')}>
                Create your first event <ArrowRight size={15} />
              </Button>
            }
          >
            Start with the event name and date. You will add race distances, the course and the results next.
          </EmptyState>
        </div>
      )}
      {events?.length > 0 && (
        <div className="prototype-organizer-pages-events-dashboard-div-7">
          {events.map((event) => (
            <Link
              key={event.event_id}
              to={`/events/${encodeURIComponent(event.event_id)}`}
              className="prototype-organizer-pages-events-dashboard-link-8 otri-group"
            >
              <div className="prototype-organizer-pages-events-dashboard-div-9">
                <p className="prototype-organizer-pages-events-dashboard-p-10">
                  <CalendarDays size={11} /> {formatDate(event.event_date).toUpperCase()}
                </p>
                <ArrowUpRight size={14} className="prototype-organizer-pages-events-dashboard-arrow-up-right-11" />
              </div>
              <h2 className="prototype-organizer-pages-events-dashboard-h2-12 otri-fit">{event.event_name}</h2>
              <p className="prototype-organizer-pages-events-dashboard-p-13">
                {event.race_count === 0 ? 'No races yet' : `${event.race_count} race${event.race_count === 1 ? '' : 's'}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Page>
  )
}

export function NewEvent({ session }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const created = await createEvent(
        { event_name: name.trim(), event_date: date, location: location.trim() || null, country: country.trim() || null },
        session.token,
      )
      navigate(`/events/${encodeURIComponent(created.event_id)}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      back={{ to: '/events', label: 'Your events' }}
      eyebrow="STEP 1 OF 4 · EVENT"
      headline={
        <>
          Create
          <br />
          <Gradient>an event.</Gradient>
        </>
      }
      intro="The event is the edition, for example “Doi Suthep Trail 2027”. Race distances come next."
      aside={
        <Card>
          <form onSubmit={submit} className="prototype-organizer-pages-events-new-event-form-14" noValidate>
            <Field label="Event name" htmlFor="ev-name" hint="As runners know it, including the year if it is an annual event.">
              <input id="ev-name" autoFocus={autoFocusOnDesktop} required value={name} onChange={(e) => setName(e.target.value)} list={RACE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="Doi Suthep Trail 2027" />
              <RaceNameList />
            </Field>
            <Field label="Event date" htmlFor="ev-date" hint="The first day of the event.">
              <input id="ev-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <div className="prototype-organizer-pages-events-new-event-div-15">
              <Field label="Location" htmlFor="ev-location" hint="Town or area, as runners know it.">
                <input
                  id="ev-location"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value)
                    // A suggested place knows its country: fill it in while the country is still empty.
                    const known = countryOfPlace(e.target.value)
                    if (known && !country) setCountry(known)
                  }}
                  list={PLACE_NAME_LIST}
                  autoComplete="off"
                  className={inputClass}
                  placeholder="Chiang Mai"
                />
                <PlaceNameList />
              </Field>
              <Field label="Country" htmlFor="ev-country" hint="Where it takes place.">
                <CountrySelect id="ev-country" value={country} onChange={setCountry} className={inputClass} />
              </Field>
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="prototype-organizer-pages-events-new-event-div-16">
              <Button type="submit" busy={busy} disabled={!name.trim() || !date}>
                Create event <ArrowRight size={15} />
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/events')}>
                Cancel
              </Button>
            </div>
            {!busy && (!name.trim() || !date) && <p className="prototype-organizer-pages-events-new-event-p-17">{!name.trim() ? 'Enter the event name to continue.' : 'Pick the event date to continue.'}</p>}
          </form>
        </Card>
      }
    />
  )
}

function RaceRow({ race }) {
  const units = useUnits()
  const status = raceStatus(race, (race.finisher_count ?? 0) > 0)
  const next = status === 'draft' ? 'course' : status === 'course' ? 'results' : 'review'
  return (
    <Link
      to={`/races/${encodeURIComponent(race.race_id)}/${next}`}
      className="prototype-organizer-pages-events-race-row-link-18 otri-group"
    >
      <div className="prototype-organizer-pages-events-race-row-div-19">
        <p className="prototype-organizer-pages-events-race-row-p-20">{race.course_name}</p>
        <p className="prototype-organizer-pages-events-race-row-p-21">
          {formatDistance(race.distance_km, units)} · {formatElevation(race.elevation_gain_m, units, { sign: '+' })}
          {race.has_gpx ? ' · measured from GPX' : ''}
        </p>
      </div>
      <div className="prototype-organizer-pages-events-race-row-div-22">
        <StatusChip status={status} />
        <span className="prototype-organizer-pages-events-race-row-span-23">
          {status === 'published' ? 'Open' : status === 'scored' ? 'Review' : 'Continue'} <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  )
}

export function EventPage({ session, eventId }) {
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ event_name: '', event_date: '', location: '', country: '' })
  const [busy, setBusy] = useState(false)

  function load() {
    getEvent(eventId)
      .then((detail) => {
        setEvent(detail)
        setForm({ event_name: detail.event_name, event_date: detail.event_date, location: detail.location ?? '', country: detail.country ?? '' })
      })
      .catch((err) => setError(err.message))
  }
  useEffect(load, [eventId])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateEvent(eventId, { ...form, location: form.location.trim() || null, country: form.country.trim() || null }, session.token)
      setEditing(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${event.event_name}" and all its races and results? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteEvent(eventId, session.token)
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (error && !event) {
    return (
      <Page back={{ to: '/events', label: 'Your events' }} title="Event">
        <div className="prototype-organizer-pages-events-dashboard-div-3">
          <Notice kind="error">{error}</Notice>
        </div>
      </Page>
    )
  }
  if (!event) return <Page back={{ to: '/events', label: 'Your events' }} title="Loading…" />

  return (
    <Page back={{ to: '/events', label: 'Your events' }} eyebrow={`EVENT · ${formatDate(event.event_date).toUpperCase()}`} title={event.event_name}>
      <div className="prototype-organizer-pages-events-event-page-div-24">
        <button onClick={() => setEditing((v) => !v)} className="prototype-organizer-pages-events-event-page-button-25">
          {editing ? 'Cancel edit' : 'Edit event'}
        </button>
        <button onClick={remove} disabled={busy} className="prototype-organizer-pages-events-event-page-button-26">
          Delete event
        </button>
      </div>
      {editing && (
        <Card className="prototype-organizer-pages-events-event-page-card-27">
          <form onSubmit={save} className="prototype-organizer-pages-events-new-event-form-14" noValidate>
            <Field label="Event name" htmlFor="ed-name">
              <input id="ed-name" required value={form.event_name} onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Event date" htmlFor="ed-date">
              <input id="ed-date" required type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} className={inputClass} />
            </Field>
            <div className="prototype-organizer-pages-events-new-event-div-15">
              <Field label="Location" htmlFor="ed-location">
                <input
                  id="ed-location"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value, country: f.country || countryOfPlace(e.target.value) || '' }))}
                  list={PLACE_NAME_LIST}
                  autoComplete="off"
                  className={inputClass}
                  placeholder="Chiang Mai"
                />
                <PlaceNameList />
              </Field>
              <Field label="Country" htmlFor="ed-country">
                <CountrySelect id="ed-country" value={form.country} onChange={(value) => setForm((f) => ({ ...f, country: value }))} className={inputClass} />
              </Field>
            </div>
            <Button type="submit" busy={busy}>
              Save changes
            </Button>
          </form>
        </Card>
      )}
      {error && (
        <div className="prototype-organizer-pages-events-dashboard-div-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      <div className="prototype-organizer-pages-events-event-page-div-28">
        <div>
          <Eyebrow>STEP 2 OF 4 · RACES</Eyebrow>
          <h2 className="prototype-organizer-pages-events-event-page-h2-29">Race distances</h2>
        </div>
        <Button onClick={() => navigate(`/events/${encodeURIComponent(eventId)}/races/new`)}>
          <Plus size={15} /> Add race
        </Button>
      </div>
      {event.races.length === 0 ? (
        <div className="prototype-organizer-pages-events-event-page-div-30">
          <EmptyState
            title="Create your first race"
            action={
              <Button onClick={() => navigate(`/events/${encodeURIComponent(eventId)}/races/new`)}>
                Add a race distance <ArrowRight size={15} />
              </Button>
            }
          >
            One race per distance: “50K”, “100 mile”. Each gets its own course and results.
          </EmptyState>
        </div>
      ) : (
        <div className="prototype-organizer-pages-events-event-page-div-31">
          {event.races.map((race) => (
            <RaceRow key={race.race_id} race={race} />
          ))}
        </div>
      )}
    </Page>
  )
}
