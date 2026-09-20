/**
 * Site-wide display units: distance (km | mi), elevation (m | ft) and pace format
 * (min per distance unit | speed). The API and every stored number stay metric; this
 * only changes how they are shown. The choice is remembered per browser in localStorage.
 */
import { useSyncExternalStore } from 'preact/compat'

export const DEFAULT_UNITS = Object.freeze({ distance: 'km', elevation: 'm', pace: 'pace' })

const STORAGE_KEY = 'otri.units'
const KM_PER_MI = 1.609344
const FT_PER_M = 3.28084

const listeners = new Set()
let current = read()

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        distance: parsed.distance === 'mi' ? 'mi' : 'km',
        elevation: parsed.elevation === 'ft' ? 'ft' : 'm',
        pace: parsed.pace === 'speed' ? 'speed' : 'pace',
      }
    }
  } catch {
    // Private mode, blocked storage: fall through to the default.
  }
  return DEFAULT_UNITS
}

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      current = read()
      notify()
    }
  })
}

export function getUnits() {
  return current
}

export function setUnits(patch) {
  current = { ...current, ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Storage unavailable: the choice still applies for this page.
  }
  notify()
}

/** React hook: the current units, re-rendering when they change (in this tab or another). */
export function useUnits() {
  return useSyncExternalStore(subscribe, getUnits, () => DEFAULT_UNITS)
}

// ------------------------------------------------------------------------------ conversions

export function kmToUnit(km, units) {
  return units.distance === 'mi' ? km / KM_PER_MI : km
}

export function metresToUnit(m, units) {
  return units.elevation === 'ft' ? m * FT_PER_M : m
}

/** 'km' or 'mi'. */
export function distanceUnit(units) {
  return units.distance === 'mi' ? 'mi' : 'km'
}

/** 'm' or 'ft'. */
export function elevationUnit(units) {
  return units.elevation === 'ft' ? 'ft' : 'm'
}

// ------------------------------------------------------------------------------ formatters

function group(value, digits) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** "14.6 km" | "9.1 mi" */
export function formatDistance(km, units, digits = 1) {
  if (km == null || !Number.isFinite(Number(km))) return '—'
  return `${group(kmToUnit(Number(km), units), digits)} ${distanceUnit(units)}`
}

/** "618 m" | "2,028 ft"; signed: "+618 m" / "-618 m" */
export function formatElevation(m, units, { sign = '' } = {}) {
  if (m == null || !Number.isFinite(Number(m))) return '—'
  const value = Math.round(metresToUnit(Number(m), units))
  return `${sign}${group(value, 0)} ${elevationUnit(units)}`
}

/** Pace or speed for a time over a distance: "6:00 /km", "9:39 /mi", "10.0 km/h", "6.2 mph". */
export function formatPace(seconds, km, units) {
  if (!km || !(km > 0) || !(seconds > 0)) return null
  const distance = kmToUnit(km, units)
  if (units.pace === 'speed') {
    const perHour = distance / (seconds / 3600)
    return `${group(perHour, 1)} ${units.distance === 'mi' ? 'mph' : 'km/h'}`
  }
  const paceSeconds = seconds / distance
  const minutes = Math.floor(paceSeconds / 60)
  const secs = Math.round(paceSeconds % 60)
  const shown = secs === 60 ? `${minutes + 1}:00` : `${minutes}:${String(secs).padStart(2, '0')}`
  return `${shown} /${distanceUnit(units)}`
}

/** A rate given in km per hour, shown in the chosen distance unit: "12.9 km/h" | "8.0 mi/h". */
export function formatRate(kmPerHour, units, digits = 1) {
  if (kmPerHour == null) return '—'
  return `${group(kmToUnit(Number(kmPerHour), units), digits)} ${distanceUnit(units)}/h`
}

/** Short label for the menu button: "km | m | min/km". */
export function unitsSummary(units) {
  const pace = units.pace === 'speed' ? (units.distance === 'mi' ? 'mph' : 'km/h') : `min/${distanceUnit(units)}`
  return `${distanceUnit(units)} | ${elevationUnit(units)} | ${pace}`
}
