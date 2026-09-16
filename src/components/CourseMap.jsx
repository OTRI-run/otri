import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildElevationProfile, parseGpxTrackPoints, toGeoJsonLine } from '../lib/gpx'

// MapLibre's default worker-URL auto-detection breaks under Vite's
// production build (the worker chunk gets content-hashed, but MapLibre's
// internal guess doesn't account for that, causing a 404 for
// maplibre-gl-worker.mjs — the style/attribution/raster tiles load fine
// since those don't need the worker, but vector tiles never render,
// silently). Vite's `?url` import gives us the correctly-hashed URL directly.
setWorkerUrl(maplibreWorkerUrl)

// Real OpenStreetMap-based vector style, free and keyless (OpenFreeMap is a
// public service built for exactly this use case). Swap via the `styleUrl`
// prop for a self-hosted Protomaps/OpenMapTiles style in production (see
// docs/roadmap.md Phase 3).
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Open, keyless elevation tiles (AWS Open Data "Terrain Tiles", Terrarium
// encoding) used to render real 3D terrain + hillshading under the route.
const TERRAIN_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

// Free, keyless satellite imagery (Esri World Imagery), used only when the
// user switches to satellite view via this component's own toggle.
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}

function addCourseLayers(map, line, { includeHillshade }) {
  if (!map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES_URL],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
    })
  }
  if (includeHillshade && !map.getLayer('hillshade')) {
    map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'terrain-dem' })
  }
  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: line })
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#2563eb', 'line-width': 3 },
    })
  }
}

/**
 * Renders a GPX route on a map with an elevation profile beneath it.
 *
 * @param {{ gpxText?: string, styleUrl?: string, className?: string }} props
 */
export default function CourseMap({ gpxText, styleUrl = DEFAULT_STYLE_URL, className = '' }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const is3DRef = useRef(false)
  const isSatelliteRef = useRef(false)
  const [is3D, setIs3D] = useState(false)
  const [isSatellite, setIsSatellite] = useState(false)
  const mountedSatelliteRef = useRef(false)
  const mountedPitchRef = useRef(false)

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
    is3DRef.current = is3D
  }, [is3D])

  useEffect(() => {
    isSatelliteRef.current = isSatellite
  }, [isSatellite])

  // Create the map once per (line, styleUrl) change. Toggle state is read
  // from refs at load time so this effect doesn't need to depend on it.
  useEffect(() => {
    if (!mapContainerRef.current || !line) return undefined

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: isSatelliteRef.current ? SATELLITE_STYLE : styleUrl,
      attributionControl: true,
    })
    mapRef.current = map

    map.on('load', () => {
      addCourseLayers(map, line, { includeHillshade: !isSatelliteRef.current })
      map.setTerrain(is3DRef.current ? { source: 'terrain-dem', exaggeration: 1.3 } : null)

      const [first, ...rest] = line.geometry.coordinates
      const bounds = rest.reduce(
        (box, coord) => box.extend(coord),
        new LngLatBounds(first, first),
      )
      map.fitBounds(bounds, {
        padding: 64,
        pitch: is3DRef.current ? 55 : 0,
        bearing: is3DRef.current ? -12 : 0,
        duration: 0,
      })
    })

    return () => map.remove()
  }, [line, styleUrl])

  // Switch the base style between vector map and satellite imagery.
  // setStyle() discards all custom sources/layers, so they're re-added once
  // the new style finishes loading. Skipped on mount (already handled above).
  useEffect(() => {
    if (!mountedSatelliteRef.current) {
      mountedSatelliteRef.current = true
      return undefined
    }
    const map = mapRef.current
    if (!map || !line) return undefined

    const applyNewStyle = () => {
      map.setStyle(isSatellite ? SATELLITE_STYLE : styleUrl)
      map.once('style.load', () => {
        addCourseLayers(map, line, { includeHillshade: !isSatellite })
        map.setTerrain(is3DRef.current ? { source: 'terrain-dem', exaggeration: 1.3 } : null)
      })
    }

    if (map.loaded()) {
      applyNewStyle()
    } else {
      map.once('load', applyNewStyle)
    }
    return undefined
  }, [isSatellite, line, styleUrl])

  // Toggle 2D <-> 3D terrain exaggeration + camera pitch. Skipped on mount.
  useEffect(() => {
    if (!mountedPitchRef.current) {
      mountedPitchRef.current = true
      return
    }
    const map = mapRef.current
    if (!map || !map.loaded()) return

    map.setTerrain(is3D ? { source: 'terrain-dem', exaggeration: 1.3 } : null)
    map.easeTo({ pitch: is3D ? 55 : 0, bearing: is3D ? -12 : 0, duration: 400 })
  }, [is3D])

  if (!line) {
    return null
  }

  return (
    <div className={className}>
      <div className="relative">
        <div ref={mapContainerRef} className="h-80 w-full overflow-hidden rounded-xl" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            onClick={() => setIs3D((value) => !value)}
            className="rounded-md bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {is3D ? '2D' : '3D'}
          </button>
          <button
            onClick={() => setIsSatellite((value) => !value)}
            className="rounded-md bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {isSatellite ? 'Map' : 'Satellite'}
          </button>
        </div>
      </div>
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
  const height = 160
  const padding = { top: 10, right: 12, bottom: 22, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const maxDistance = profile[profile.length - 1].distanceKm || 1
  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  const elevationRange = maxElevation - minElevation || 1

  const toX = (distanceKm) => padding.left + (distanceKm / maxDistance) * chartWidth
  const toY = (elevation) => padding.top + chartHeight - ((elevation - minElevation) / elevationRange) * chartHeight
  const baselineY = padding.top + chartHeight

  const linePoints = profile
    .filter((point) => point.elevation != null)
    .map((point) => `${toX(point.distanceKm).toFixed(1)},${toY(point.elevation).toFixed(1)}`)

  const areaPoints = [`${toX(0).toFixed(1)},${baselineY.toFixed(1)}`, ...linePoints, `${toX(maxDistance).toFixed(1)},${baselineY.toFixed(1)}`].join(
    ' ',
  )

  const horizontalGridLines = Array.from({ length: 5 }, (_, index) => {
    const elevation = minElevation + (elevationRange * index) / 4
    return { y: toY(elevation), label: `${Math.round(elevation)} m` }
  })

  const verticalGridLines = Array.from({ length: 5 }, (_, index) => {
    const distanceKm = (maxDistance * index) / 4
    return { x: toX(distanceKm), label: `${distanceKm.toFixed(1)} km` }
  })

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Elevation profile">
        <defs>
          <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {horizontalGridLines.map((line) => (
          <g key={line.label}>
            <line x1={padding.left} x2={width - padding.right} y1={line.y} y2={line.y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padding.left - 6} y={line.y + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {line.label}
            </text>
          </g>
        ))}

        {verticalGridLines.map((line) => (
          <g key={line.label}>
            <line x1={line.x} x2={line.x} y1={padding.top} y2={baselineY} stroke="#eef2f7" strokeWidth="1" />
            <text x={line.x} y={height - 6} textAnchor="middle" fontSize="9" fill="#64748b">
              {line.label}
            </text>
          </g>
        ))}

        <polygon points={areaPoints} fill="url(#elevation-fill)" />
        <polyline points={linePoints.join(' ')} fill="none" stroke="#2563eb" strokeWidth="2" />
      </svg>
    </div>
  )
}
