import { ArrowUpRight, Mountain, TrendingUp } from 'lucide-react'

// A scored race, as a real link so it can be opened in a new tab and shows a URL on hover.
export default function RaceCard({ race }) {
  return (
    <a
      href={`#races/${encodeURIComponent(race.race_id)}`}
      className="group block min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left no-underline shadow-[0_10px_28px_rgba(15,23,42,.04)] transition hover:border-blue-300 hover:shadow-[0_14px_34px_rgba(37,99,235,.12)]"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-[.08em] text-blue-600">{race.race_id}</p>
        <ArrowUpRight size={14} className="text-slate-300 transition group-hover:text-blue-600" />
      </div>
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
      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-blue-600">
        <span>
          {race.leaderboard.length} scored{race.non_finishers > 0 ? ` · ${race.non_finishers} DNF` : ''}
        </span>
        <span className="text-slate-400 transition group-hover:text-blue-600">Leaderboard →</span>
      </div>
    </a>
  )
}
