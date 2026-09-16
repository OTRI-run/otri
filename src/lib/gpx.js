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

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))
  if (trkpts.length === 0) {
    throw new Error('Invalid GPX: no <trkpt> points found')
  }

  return trkpts.map((node) => {
    const lat = parseFloat(node.getAttribute('lat'))
    const lon = parseFloat(node.getAttribute('lon'))
    const eleNode = node.getElementsByTagName('ele')[0]
    const elevation = eleNode && eleNode.textContent ? parseFloat(eleNode.textContent) : null
    return { lat, lon, elevation }
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
    if (index > 0) {
      cumulativeMeters += haversineMeters(points[index - 1], point)
    }
    return { distanceKm: cumulativeMeters / 1000, elevation: point.elevation }
  })
}

/** Convert parsed points into a GeoJSON LineString feature for map rendering. */
export function toGeoJsonLine(points) {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map((point) => [point.lon, point.lat]),
    },
    properties: {},
  }
}
