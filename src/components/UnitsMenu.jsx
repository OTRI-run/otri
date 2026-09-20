import { useEffect, useRef, useState } from 'react'
import styles from './UnitsMenu.module.css'
import { ChevronDown } from 'lucide-react'
import { distanceUnit, setUnits, unitsSummary, useUnits } from '../lib/units'

function Segment({ label, options, value, onChange }) {
  return (
    <div>
      <p className={styles.label}>{label}</p>
      <div className={styles.segment}>
        {options.map(([optionValue, optionLabel]) => {
          const active = optionValue === value
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              aria-pressed={active}
              className={active ? styles.active : undefined}
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
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Display units"
        className={styles.trigger}
      >
        {compact ? units.distance : unitsSummary(units)}
        <ChevronDown size={12} className={open ? styles.open : undefined} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Display units"
          className={`${styles.dialog} ${align === 'right' ? styles.right : styles.left}`}
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
          <p className={styles.note}>Applies across the site. Scores never change with units.</p>
        </div>
      )}
    </div>
  )
}
