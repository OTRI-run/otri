import { useEffect, useRef, useState } from 'preact/compat'
import { ChevronDown } from '../ui/icons'
import { distanceUnit, setUnits, unitsSummary, useUnits } from '../lib/units'

function Segment({ label, options, value, onChange }) {
  return (
    <div className="stack stack--tight">
      <p className="eyebrow eyebrow--plain eyebrow--sm">{label}</p>
      <div className="seg seg--mono seg--sm">
        {options.map(([optionValue, optionLabel]) => (
          <button key={optionValue} type="button" onClick={() => onChange(optionValue)} aria-pressed={optionValue === value}>
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Header control for the site-wide display units. Remembered per browser. `compact` shows the
 * distance unit alone ("km"): the full summary is a line of its own in a busy header. */
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
        className="btn btn--secondary btn--sm mono"
        style={{ minHeight: 36, paddingInline: 10 }}
      >
        {compact ? units.distance : unitsSummary(units)}
        <ChevronDown size={14} style={{ transition: 'transform var(--quick) var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div role="dialog" aria-label="Display units" className={`popover ${align === 'right' ? 'popover--right' : 'popover--left'} stack`}>
          <Segment label="Distance" options={[['km', 'km'], ['mi', 'mi']]} value={units.distance} onChange={(distance) => setUnits({ distance })} />
          <Segment label="Elevation" options={[['m', 'm'], ['ft', 'ft']]} value={units.elevation} onChange={(elevation) => setUnits({ elevation })} />
          <Segment label="Pace" options={[['pace', `min/${distanceUnit(units)}`], ['speed', speedLabel]]} value={units.pace} onChange={(pace) => setUnits({ pace })} />
          <p className="tiny muted">Applies across the site. Scores never change with units.</p>
        </div>
      )}
    </div>
  )
}
