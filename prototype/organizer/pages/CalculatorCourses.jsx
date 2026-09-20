import './CalculatorCourses.css'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react'
import { addCalculatorCourse, deleteCalculatorCourse, listCalculatorCourses, updateCalculatorCourse } from '../../apiClient'
import { revealElement } from '../../../src/lib/comfort'
import CountrySelect from '../../../src/components/CountrySelect'
import RaceNameList, { RACE_NAME_LIST } from '../../../src/components/RaceNameList'
import PlaceNameList, { DISTANCE_NAME_LIST, DistanceNameList, PLACE_NAME_LIST } from '../../../src/components/PlaceNameList'
import { countryOfPlace } from '../../../src/lib/placeNames'
import { formatDistance, formatElevation, useUnits } from '../../../src/lib/units'
import { Button, Card, Dropzone, Eyebrow, Field, Notice, inputClass } from '../ui'

// Admin: the courses hand-picked for the calculator's "Pick a race". A name and a GPX; the course is
// measured and offered to every visitor to try a target time on. Each can be edited afterwards
// (names, place, source, or another file). It is not a race page: it never
// appears on the races page and no results are expected.
export default function CalculatorCourses({ session }) {
  const units = useUnits()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [added, setAdded] = useState(null)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const empty = { event_name: '', course_name: '', location: '', country: '', source_url: '' }
  const [form, setForm] = useState(empty)
  const [file, setFile] = useState(null)
  // The course being changed, when the form is editing one and not adding one.
  const [editing, setEditing] = useState(null)
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const load = () => listCalculatorCourses(session.token).then(setRows).catch((err) => setError(err.message))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token])

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setAdded(null)
    setBusy(true)
    try {
      const course = editing ? await updateCalculatorCourse(editing.race_id, { ...form, file }, session.token) : await addCalculatorCourse({ ...form, file }, session.token)
      setAdded({ ...course, wasEdit: Boolean(editing) })
      setForm(empty)
      setFile(null)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function startEditing(row) {
    setEditing(row)
    setForm({ event_name: row.event_name ?? '', course_name: row.course_name ?? '', location: row.event_location ?? '', country: row.event_country ?? '', source_url: row.source_url ?? '' })
    setFile(null)
    setAdded(null)
    setError(null)
    revealElement('cc-form', { focus: true })
  }

  function stopEditing() {
    setEditing(null)
    setForm(empty)
    setFile(null)
    setError(null)
  }

  async function remove(row) {
    if (!window.confirm(`Remove "${row.event_name} · ${row.course_name}" from the calculator? Links that open it stop working.`)) return
    setBusyId(row.race_id)
    setError(null)
    try {
      await deleteCalculatorCourse(row.race_id, session.token)
      if (editing?.race_id === row.race_id) stopEditing()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const missing = !file && !editing ? 'Choose the GPX file.' : !form.event_name.trim() ? 'Enter the race name.' : !form.course_name.trim() ? 'Enter the distance name.' : null

  return (
    <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-1">
      <Card>
        <div id="cc-form" className="prototype-organizer-pages-calculator-courses-calculator-courses-div-2">
          <Eyebrow>{editing ? 'EDIT THE COURSE' : 'ADD A COURSE TO THE CALCULATOR'}</Eyebrow>
        </div>
        {editing ? (
          <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-3">
            Changing <b className="prototype-organizer-pages-calculator-courses-calculator-courses-b-4">{editing.event_name} · {editing.course_name}</b>. Leave the file empty to keep its course
            ({formatDistance(editing.distance_km, units)}, {formatElevation(editing.elevation_gain_m, units, { sign: '+' })}); drop a GPX to replace it, and it is
            measured again. An emptied field is cleared.
          </p>
        ) : (
          <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-3">
            A race name and its GPX. The course is measured and appears under “Pick a race” in the calculator for every visitor. It does not
            appear on the races page and nobody is asked for results. Use course files their organizers publish, and say where you got it.
          </p>
        )}
        <form onSubmit={submit} className="prototype-organizer-pages-calculator-courses-calculator-courses-form-5" noValidate>
          <Dropzone
            id="cc-file"
            accept=".gpx"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAdded(null); setError(null) }}
            busy={busy}
            busyLabel="Measuring the course…"
            label={editing ? 'Drop a .gpx file to replace the course, or leave empty' : 'Drop the .gpx file here, or browse'}
            hint={editing ? 'Optional. Without a file the course stays as it is.' : 'The official course of the race, up to 20 MB.'}
            fileName={file?.name}
          />
          <Field label="Race name" htmlFor="cc-name" hint="As runners know it. Add the year if the course changes between editions.">
            <input id="cc-name" required value={form.event_name} onChange={set('event_name')} list={RACE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="Lavaredo Ultra Trail" />
            <RaceNameList />
          </Field>
          <Field label="Distance name" htmlFor="cc-course" hint="How this distance is listed.">
            <input id="cc-course" required value={form.course_name} onChange={set('course_name')} list={DISTANCE_NAME_LIST} autoComplete="off" className={inputClass} placeholder="120K" />
            <DistanceNameList />
          </Field>
          <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-6">
            <Field label="Location" htmlFor="cc-location" hint="Optional.">
              <input
                id="cc-location"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value, country: current.country || countryOfPlace(event.target.value) || '' }))}
                list={PLACE_NAME_LIST}
                autoComplete="off"
                className={inputClass}
                placeholder="Cortina d’Ampezzo"
              />
              <PlaceNameList />
            </Field>
            <Field label="Country" htmlFor="cc-country" hint="Optional.">
              <CountrySelect id="cc-country" value={form.country} onChange={(value) => setForm((current) => ({ ...current, country: value }))} className={inputClass} />
            </Field>
          </div>
          <Field label="Where the file came from" htmlFor="cc-source" hint="The page you downloaded it from. Shown with the course.">
            <input id="cc-source" type="url" value={form.source_url} onChange={set('source_url')} className={inputClass} placeholder="https://www.example-race.com/course" />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          {added && (
            <Notice kind="success" title={`${added.wasEdit ? 'Saved' : 'Added'}: ${added.event_name} · ${added.course_name}`}>
              Measured at {formatDistance(added.distance_km, units)} and {formatElevation(added.elevation_gain_m, units, { sign: '+' })}.{' '}
              <a href={`../#calculator?race=${encodeURIComponent(added.race_id)}`} className="prototype-organizer-pages-calculator-courses-calculator-courses-a-7">Open it in the calculator</a>
            </Notice>
          )}
          <div>
            <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-8">
              <Button type="submit" busy={busy} disabled={Boolean(missing)}>{editing ? (file ? 'Measure and save' : 'Save changes') : 'Measure and add'}</Button>
              {editing && <Button type="button" variant="secondary" onClick={stopEditing}>Cancel</Button>}
            </div>
            {!busy && missing && <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-9">{missing}</p>}
          </div>
        </form>
      </Card>

      <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-10">
        <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-11">{rows ? `${rows.length} COURSE${rows.length === 1 ? '' : 'S'} IN THE CALCULATOR` : 'LOADING…'}</p>
        {rows?.length === 0 && <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-12">None yet. Races their organizers published or listed are offered in the calculator as well; these are the ones you add by hand.</p>}
        <ul className="prototype-organizer-pages-calculator-courses-calculator-courses-ul-13">
          {(rows ?? []).map((row) => (
            <li key={row.race_id} className={`prototype-organizer-pages-calculator-courses-calculator-courses-li-14 ${editing?.race_id === row.race_id ? "prototype-organizer-pages-calculator-courses-calculator-courses-li-15" : ''}`}>
              <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-10">
                <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-16">{row.event_name} · {row.course_name}</p>
                <p className="prototype-organizer-pages-calculator-courses-calculator-courses-p-17">
                  {formatDistance(row.distance_km, units)} · {formatElevation(row.elevation_gain_m, units, { sign: '+' })}
                  {row.event_location ? ` · ${row.event_location}` : ''}{row.event_country ? ` · ${row.event_country}` : ''}
                </p>
                {row.source_url && (
                  <a href={row.source_url} target="_blank" rel="noreferrer" className="prototype-organizer-pages-calculator-courses-calculator-courses-a-18">
                    {row.source_url.replace(/^https?:\/\//, '')} <ArrowUpRight size={11} />
                  </a>
                )}
              </div>
              <div className="prototype-organizer-pages-calculator-courses-calculator-courses-div-19">
                <a href={`../#calculator?race=${encodeURIComponent(row.race_id)}`} className="prototype-organizer-pages-calculator-courses-calculator-courses-a-20">Open</a>
                <Button variant="secondary" className="prototype-organizer-pages-calculator-courses-calculator-courses-button-21" onClick={() => startEditing(row)}>
                  <Pencil size={13} /> Edit
                </Button>
                <Button variant="secondary" busy={busyId === row.race_id} className="prototype-organizer-pages-calculator-courses-calculator-courses-button-21" onClick={() => remove(row)}>
                  <Trash2 size={13} /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
