import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { distanceUnit, setUnits, unitsSummary, useUnits } from '../lib/units'

function Segment({ label, options, value, onChange }) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">{label}</p>
      <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
        {options.map(([optionValue, optionLabel]) => {
          const active = optionValue === value
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              aria-pressed={active}
              className={`px-3 py-1.5 font-mono text-[11px] font-semibold transition ${
                active ? 'bg-[#0b1220] text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-[#0b1220]'
              }`}
            >
              {optionLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Header control for the site-wide display units. Remembered per browser. */
/** `compact` shows the distance unit alone ("km"): the full summary is a line of its own in a busy header. */
export default function UnitsMenu({ align = 'right', compact = false }) {
  const units = useUnits()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const speedLabel = units.distance === 'mi' ? 'mph' : 'km/h'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Display units"
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#0b1220] hover:border-blue-300"
      >
        {compact ? units.distance : unitsSummary(units)}
        <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Display units"
          className={`absolute top-full z-50 mt-2 w-56 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_18px_44px_rgba(15,23,42,.14)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <Segment
            label="DISTANCE"
            options={[
              ['km', 'km'],
              ['mi', 'mi'],
            ]}
            value={units.distance}
            onChange={(distance) => setUnits({ distance })}
          />
          <Segment
            label="ELEVATION"
            options={[
              ['m', 'm'],
              ['ft', 'ft'],
            ]}
            value={units.elevation}
            onChange={(elevation) => setUnits({ elevation })}
          />
          <Segment
            label="PACE"
            options={[
              ['pace', `min/${distanceUnit(units)}`],
              ['speed', speedLabel],
            ]}
            value={units.pace}
            onChange={(pace) => setUnits({ pace })}
          />
          <p className="text-[10px] leading-4 text-slate-400">Applies across the site. Scores never change with units.</p>
        </div>
      )}
    </div>
  )
}
