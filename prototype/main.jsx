import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Mountain, TrendingUp } from 'lucide-react'
import CourseMap from '../src/components/CourseMap'
import GpxTester from './GpxTester'
import OrganizerUpload from './OrganizerUpload'
import racesData from './data/races.json'
import '../src/styles.css'

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[9px] font-medium tracking-[.08em] text-blue-600">
      <i className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_0_3px_#dbeafe]" />
      {children}
    </span>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-50 h-[68px] border-b border-slate-200/90 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full min-w-0 w-[min(1120px,calc(100%-28px))] items-center gap-4">
        <a href="../" className="flex items-center gap-1 text-[13px] font-semibold text-[#0b1220] no-underline">
          <ArrowLeft size={14} /> OTRI
        </a>
        <div className="ml-auto">
          <Badge>PROTOTYPE · NOT FINAL DESIGN</Badge>
        </div>
      </div>
    </header>
  )
}

function RaceCard({ race, onSelect }) {
  return (
    <button
      onClick={() => onSelect(race.race_id)}
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300 hover:shadow-[0_14px_34px_rgba(37,99,235,.12)]"
    >
      <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">{race.race_id}</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#0b1220]">{race.race_name}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {race.course_name} · {race.event_date}
      </p>
      <div className="mt-4 flex gap-4 font-mono text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <TrendingUp size={12} className="text-blue-600" />
          {race.distance_km} km
        </span>
        <span className="flex items-center gap-1">
          <Mountain size={12} className="text-blue-600" />+{race.elevation_gain_m} m
        </span>
      </div>
      <div className="mt-4 text-xs font-semibold text-blue-600">
        {race.leaderboard.length} scored{race.non_finishers > 0 ? ` · ${race.non_finishers} DNF` : ''}
      </div>
    </button>
  )
}

function Leaderboard({ race, onBack }) {
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
        <ArrowLeft size={13} /> All races
      </button>
      <h2 className="mt-4 text-3xl font-bold tracking-[-.04em] text-[#0b1220]">{race.race_name}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {race.course_name} · {race.distance_km} km · +{race.elevation_gain_m} m · {race.event_date}
      </p>
      {race.non_finishers > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {race.non_finishers} runner(s) did not finish (excluded from scoring).
        </p>
      )}
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[.06em] text-slate-500">
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Runner</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">OTRI score</th>
              <th className="px-4 py-3">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {race.leaderboard.map((row) => (
              <tr key={row.bib_number ?? `${row.family_name}-${row.first_name}`} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.rank}</td>
                <td className="px-4 py-3 font-medium text-[#0b1220]">
                  {row.first_name} {row.family_name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.finish_time ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-blue-600">{row.otri_score}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{row.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[9px] tracking-[.05em] text-slate-400">
        scoring_version {race.leaderboard[0]?.scoring_version ?? 'n/a'} · single-race relative baseline, not yet cross-race calibrated
      </p>
    </div>
  )
}

function SampleCourseSection({ sampleCourse }) {
  return (
    <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">SAMPLE COURSE / GPX VIEWER</p>
      <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#0b1220]">{sampleCourse.name}</h3>
      <p className="mt-1 text-xs text-slate-500">{sampleCourse.note}</p>
      <CourseMap gpxText={sampleCourse.gpx_text} className="mt-4" />
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] text-slate-500">
        <span>{sampleCourse.features.distance_km} km</span>
        <span>+{sampleCourse.features.elevation_gain_m} m</span>
        <span>-{sampleCourse.features.elevation_loss_m} m</span>
        <span>
          steep grade +{(sampleCourse.features.max_climb_grade * 100).toFixed(1)}% / -
          {(sampleCourse.features.max_descent_grade * 100).toFixed(1)}%
        </span>
      </div>
    </section>
  )
}

const TABS = [
  { id: 'races', label: 'Races' },
  { id: 'gpx', label: 'GPX tester' },
  { id: 'organizer', label: 'Organizer upload' },
]

function TabNav({ active, onChange }) {
  return (
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`border-b-2 px-3 py-2 text-sm font-semibold ${
            active === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-[#0b1220]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('races')
  const [selectedRaceId, setSelectedRaceId] = useState(null)
  const selectedRace = useMemo(
    () => racesData.races.find((race) => race.race_id === selectedRaceId) ?? null,
    [selectedRaceId],
  )

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1220]">
      <Header />
      <main className="mx-auto w-[min(1120px,calc(100%-28px))] py-12">
        <p className="font-mono text-[10px] tracking-[.08em] text-slate-500">PROTOTYPE</p>
        <h1 className="mt-2 max-w-[640px] text-[clamp(32px,5vw,52px)] font-bold leading-[1.05] tracking-[-.05em]">
          Ingestion → scoring → course, wired end to end.
        </h1>
        <p className="mt-4 max-w-[620px] text-sm leading-7 text-slate-500">
          Every score below was computed by the real Python pipeline (<code>ingestion</code> → <code>scoring</code> →{' '}
          <code>course</code>) against synthetic demo data, then exported to static JSON for this page — see{' '}
          <code>scripts/build_prototype_data.py</code>. The GPX tester and organizer upload tabs call the live API.
        </p>

        <TabNav active={activeTab} onChange={setActiveTab} />

        {activeTab === 'races' && (
          <>
            {selectedRace ? (
              <div className="mt-10">
                <Leaderboard race={selectedRace} onBack={() => setSelectedRaceId(null)} />
              </div>
            ) : (
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {racesData.races.map((race) => (
                  <RaceCard key={race.race_id} race={race} onSelect={setSelectedRaceId} />
                ))}
              </div>
            )}

            {!selectedRace && <SampleCourseSection sampleCourse={racesData.sample_course} />}
          </>
        )}

        {activeTab === 'gpx' && <GpxTester />}
        {activeTab === 'organizer' && <OrganizerUpload />}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
