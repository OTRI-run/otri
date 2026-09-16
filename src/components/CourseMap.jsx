import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildElevationProfile, parseGpxTrackPoints, toGeoJsonLine } from '../lib/gpx'

// Open, no-API-key demo style so this component works with zero paid
// infrastructure. Swap via the `styleUrl` prop for a self-hosted
// Protomaps/OpenMapTiles style in production (see docs/roadmap.md Phase 3).
const DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

/**
 * Renders a GPX route on a map with an elevation profile beneath it.
 *
 * @param {{ gpxText?: string, styleUrl?: string, className?: string }} props
 */
export default function CourseMap({ gpxText, styleUrl = DEFAULT_STYLE_URL, className = '' }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)

  const points = useMemo(() => {
    if (!gpxText) return []
    try {
      return parseGpxTrackPoints(gpxText)
    } catch {
      return []
    }
  }, [gpxText])

  const profile = useMemo(() => buildElevationProfile(points), [points])
  const line = useMemo(() => (points.length > 1 ? toGeoJsonLine(points) : null), [points])

  useEffect(() => {
    if (!mapContainerRef.current || !line) return undefined

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      attributionControl: true,
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: line })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#2563eb', 'line-width': 3 },
      })

      const [first, ...rest] = line.geometry.coordinates
      const bounds = rest.reduce(
        (box, coord) => box.extend(coord),
        new maplibregl.LngLatBounds(first, first),
      )
      map.fitBounds(bounds, { padding: 32, duration: 0 })
    })

    return () => map.remove()
  }, [line, styleUrl])

  if (!line) {
    return null
  }

  return (
    <div className={className}>
      <div ref={mapContainerRef} className="h-80 w-full overflow-hidden rounded-xl" />
      <ElevationProfile profile={profile} />
    </div>
  )
}

function ElevationProfile({ profile }) {
  const elevations = profile.map((point) => point.elevation).filter((elevation) => elevation != null)
  if (elevations.length < 2) {
    return null
  }

  const width = 600
  const height = 120
  const maxDistance = profile[profile.length - 1].distanceKm || 1
  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  const elevationRange = maxElevation - minElevation || 1

  const toX = (distanceKm) => (distanceKm / maxDistance) * width
  const toY = (elevation) => height - ((elevation - minElevation) / elevationRange) * height

  const pathPoints = profile
    .filter((point) => point.elevation != null)
    .map((point) => `${toX(point.distanceKm).toFixed(1)},${toY(point.elevation).toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-24 w-full" role="img" aria-label="Elevation profile">
      <polyline points={pathPoints} fill="none" stroke="#2563eb" strokeWidth="2" />
    </svg>
  )
}
