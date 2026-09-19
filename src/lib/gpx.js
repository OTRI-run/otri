/**
 * Lightweight, dependency-free GPX parsing for the browser.
 *
 * This mirrors the scope of the Python `course/gpx.py` reader (trkpt
 * lat/lon/elevation) but exists purely for map/elevation-profile rendering.
 * It is NOT the authoritative source for course-difficulty scoring — that
 * lives in the Python `course/` package, per METHODOLOGY.md's reproducibility
 * requirements. Keep the two in sync in spirit, not by sharing code.
 */

const EARTH_RADIUS_M = 6371000

/** Parse a raw GPX XML string into an ordered list of { lat, lon, elevation } points. */
export function parseGpxTrackPoints(gpxText) {
  const doc = new DOMParser().parseFromString(gpxText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid GPX: not well-formed XML')
  }

  if (doc.documentElement.localName !== 'gpx' || /<!DOCTYPE|<!ENTITY/i.test(gpxText)) throw new Error('Invalid GPX document')
  if (doc.getElementsByTagNameNS('*', 'trk').length > 1) throw new Error('Select a single track')
  const segments = Array.from(doc.getElementsByTagNameNS('*', 'trkseg'))
  let trkpts = Array.from(doc.getElementsByTagNameNS('*', 'trkpt'))
  // A route (what route planners export) is drawn like a track, as the server measures it like one.
  if (trkpts.length === 0) trkpts = Array.from(doc.getElementsByTagNameNS('*', 'rtept'))
  if (trkpts.length > 100000) throw new Error('GPX exceeds point limit')
  if (trkpts.length === 0) {
    throw new Error('This GPX has no track in it')
  }

  return trkpts.map((node) => {
    const lat = Number(node.getAttribute('lat'))
    const lon = Number(node.getAttribute('lon'))
    const eleNode = node.getElementsByTagNameNS('*', 'ele')[0]
    if (eleNode?.textContent && !eleNode.textContent.trim()) throw new Error('Invalid elevation')
    const elevation = eleNode && eleNode.textContent ? Number(eleNode.textContent) : null
    if (!node.getAttribute('lat')?.trim() || !node.getAttribute('lon')?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (elevation !== null && !Number.isFinite(elevation))) throw new Error('Invalid GPX coordinates/elevation')
    return { lat, lon, elevation, segmentId: Math.max(0, segments.indexOf(node.parentNode)) }
  })
}

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dPhi = toRad(b.lat - a.lat)
  const dLambda = toRad(b.lon - a.lon)
  const phi1 = toRad(a.lat)
  const phi2 = toRad(b.lat)
  const sinDPhi = Math.sin(dPhi / 2)
  const sinDLambda = Math.sin(dLambda / 2)
  const h = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cumulative distance (km) and elevation (m) at each point, for chart rendering. */
export function buildElevationProfile(points) {
  let cumulativeMeters = 0
  return points.map((point, index) => {
    if (index > 0 && points[index - 1].segmentId === point.segmentId) {
      cumulativeMeters += haversineMeters(points[index - 1], point)
    }
    return { distanceKm: cumulativeMeters / 1000, elevation: point.elevation, segmentId: point.segmentId }
  })
}

/** Convert parsed points into a GeoJSON LineString feature for map rendering. */
export function toGeoJsonLine(points) {
  const segments = []
  for (const point of points) {
    if (!segments.length || segments[segments.length - 1].id !== point.segmentId) segments.push({ id: point.segmentId, coordinates: [] })
    segments[segments.length - 1].coordinates.push([point.lon, point.lat])
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'MultiLineString',
      coordinates: segments.map(segment => segment.coordinates),
    },
    properties: {},
  }
}
