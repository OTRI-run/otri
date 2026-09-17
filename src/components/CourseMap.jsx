import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FullscreenControl, LngLatBounds, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildElevationProfile, parseGpxTrackPoints, toGeoJsonLine } from '../lib/gpx'

// MapLibre's default worker-URL auto-detection breaks under Vite's
// production build (the worker chunk gets content-hashed, but MapLibre's
// internal guess doesn't account for that, causing a 404 for
// maplibre-gl-worker.mjs — the style/attribution/raster tiles load fine
// since those don't need the worker, but vector tiles never render,
// silently). A plain `?url` import isn't enough either: the worker itself
// imports a sibling maplibre-gl-shared.mjs chunk that `?url` never traces
// (it just copies the file verbatim), so `?worker&url` is required to fully
// bundle the worker's own dependency graph and get back a working URL.
setWorkerUrl(maplibreWorkerUrl)

// Real OpenStreetMap-based vector style, free and keyless (OpenFreeMap is a
// public service built for exactly this use case). Swap via the `styleUrl`
// prop for a self-hosted Protomaps/OpenMapTiles style in production (see
// docs/roadmap.md Phase 3).
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

// Open, keyless elevation tiles (AWS Open Data "Terrain Tiles", Terrarium
// encoding) used to render real 3D terrain + hillshading under the route.
// This is the direct continuation of Mapzen's joerd elevation project (Mapzen
// itself shut down in 2017); its data-source license requires attribution —
// see https://github.com/tilezen/joerd/blob/master/docs/attribution.md.
const TERRAIN_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const TERRAIN_ATTRIBUTION =
  'Terrain data: SRTM, GMTED2010, ETOPO1, 3DEP (USGS, NOAA) via <a href="https://github.com/tilezen/joerd">Joerd</a>'

// Free, keyless satellite imagery (Esri World Imagery), used only when the
// user switches to satellite view via this component's own toggle. Glyphs are
// needed so the kilometre markers can still be labelled on top of imagery.
const SATELLITE_STYLE = {
  version: 8,
  glyphs: GLYPHS_URL,
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

const INK = '#0b1220'
const ROUTE_BLUE = '#2563eb'
const START_GREEN = '#16a34a'
const HOVER_CYAN = '#06b6d4'
const LABEL_FONT = ['Noto Sans Bold']

// ---------------------------------------------------------------------------- geometry helpers

// A "nice" tick step (1, 2, 2.5, 5 × 10^n) giving roughly `target` intervals over `range`.
function niceStep(range, target) {
  if (!(range > 0)) return 1
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (multiple * magnitude >= raw) return multiple * magnitude
  }
  return 10 * magnitude
}

// Index of the first cumulative distance >= km (binary search on a non-decreasing array).
function lowerBound(cumulativeKm, km) {
  let lo = 0
  let hi = cumulativeKm.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumulativeKm[mid] < km) lo = mid + 1
    else hi = mid
  }
  return lo
}

// [lon, lat] interpolated along the track at a given cumulative distance.
function positionAtKm(points, cumulativeKm, km) {
  const i = lowerBound(cumulativeKm, km)
  if (i === 0) return [points[0].lon, points[0].lat]
  const a = points[i - 1]
  const b = points[i]
  const da = cumulativeKm[i - 1]
  const db = cumulativeKm[i]
  const t = db > da ? Math.min(1, Math.max(0, (km - da) / (db - da))) : 0
  return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t]
}

function markerFeatures(points, cumulativeKm, stepKm) {
  const total = cumulativeKm[cumulativeKm.length - 1]
  const features = []
  for (let km = stepKm; km < total - stepKm * 0.35; km += stepKm) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: positionAtKm(points, cumulativeKm, km) },
      properties: { kind: 'km', label: String(Math.round(km * 10) / 10) },
    })
  }
  const first = points[0]
  const last = points[points.length - 1]
  features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [first.lon, first.lat] }, properties: { kind: 'start', label: 'S' } })
  features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [last.lon, last.lat] }, properties: { kind: 'finish', label: 'F' } })
  return { type: 'FeatureCollection', features }
}

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

// ---------------------------------------------------------------------------- map layers

function firstSymbolLayerId(map) {
  return map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
}

function firstLineLayerId(map) {
  return map.getStyle().layers.find((layer) => layer.type === 'line' || layer.type === 'symbol')?.id
}

function addCourseLayers(map, { line, markers }, { includeHillshade }) {
  if (!map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES_URL],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
      attribution: TERRAIN_ATTRIBUTION,
    })
  }
  if (includeHillshade && !map.getLayer('hillshade')) {
    // Soft relief under roads and labels, rather than a heavy grey wash over them.
    map.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain-dem',
        paint: {
          'hillshade-exaggeration': 0.32,
          'hillshade-shadow-color': '#334155',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#64748b',
        },
      },
      firstLineLayerId(map),
    )
  }

  const beforeLabels = firstSymbolLayerId(map)

  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: line })
    map.addLayer(
      {
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.95 },
      },
      beforeLabels,
    )
    map.addLayer(
      {
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_BLUE, 'line-width': 3.5 },
      },
      beforeLabels,
    )
  }

  if (!map.getSource('route-markers')) {
    map.addSource('route-markers', { type: 'geojson', data: markers })
    map.addLayer({
      id: 'route-km',
      type: 'circle',
      source: 'route-markers',
      filter: ['==', ['get', 'kind'], 'km'],
      paint: { 'circle-radius': 9, 'circle-color': ROUTE_BLUE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'route-km-label',
      type: 'symbol',
      source: 'route-markers',
      filter: ['==', ['get', 'kind'], 'km'],
      layout: { 'text-field': ['get', 'label'], 'text-font': LABEL_FONT, 'text-size': 10, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff' },
    })
    map.addLayer({
      id: 'route-ends',
      type: 'circle',
      source: 'route-markers',
      filter: ['!=', ['get', 'kind'], 'km'],
      paint: {
        'circle-radius': 11,
        'circle-color': ['case', ['==', ['get', 'kind'], 'start'], START_GREEN, INK],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    })
    map.addLayer({
      id: 'route-ends-label',
      type: 'symbol',
      source: 'route-markers',
      filter: ['!=', ['get', 'kind'], 'km'],
      layout: { 'text-field': ['get', 'label'], 'text-font': LABEL_FONT, 'text-size': 11, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff' },
    })
  }

  if (!map.getSource('route-hover')) {
    map.addSource('route-hover', { type: 'geojson', data: EMPTY_COLLECTION })
    map.addLayer({
      id: 'route-hover',
      type: 'circle',
      source: 'route-hover',
      paint: { 'circle-radius': 7, 'circle-color': HOVER_CYAN, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
    })
  }
}

/**
 * Renders a GPX route on a map with an elevation profile beneath it. Hovering the profile
 * shows the matching point on the map.
 *
 * @param {{ gpxText?: string, measurement?: object, styleUrl?: string, className?: string }} props
 */
export default function CourseMap({ gpxText, measurement, styleUrl = DEFAULT_STYLE_URL, className = '' }) {
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

  const profile = measurement?.profile ?? []
  const line = useMemo(() => (points.length > 1 ? toGeoJsonLine(points) : null), [points])
  const cumulativeKm = useMemo(() => buildElevationProfile(points).map((point) => point.distanceKm), [points])
  const totalKm = cumulativeKm[cumulativeKm.length - 1] ?? 0
  // One step for both the map markers and the profile's x-axis, so they line up.
  const stepKm = useMemo(() => niceStep(totalKm, 8), [totalKm])
  const markers = useMemo(
    () => (points.length > 1 && totalKm > 0 ? markerFeatures(points, cumulativeKm, stepKm) : EMPTY_COLLECTION),
    [points, cumulativeKm, stepKm, totalKm],
  )
  const courseData = useMemo(() => ({ line, markers }), [line, markers])

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
      attributionControl: {},
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new FullscreenControl(), 'top-left')
    map.addControl(new ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      addCourseLayers(map, courseData, { includeHillshade: !isSatelliteRef.current })
      map.setTerrain(is3DRef.current ? { source: 'terrain-dem', exaggeration: 1.3 } : null)

      const [first, ...rest] = line.geometry.coordinates.flat()
      const bounds = rest.reduce((box, coord) => box.extend(coord), new LngLatBounds(first, first))
      map.fitBounds(bounds, {
        padding: { top: 56, bottom: 56, left: 72, right: 72 },
        pitch: is3DRef.current ? 55 : 0,
        bearing: is3DRef.current ? -12 : 0,
        duration: 0,
      })
    })

    return () => map.remove()
  }, [line, courseData, styleUrl])

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
        addCourseLayers(map, courseData, { includeHillshade: !isSatellite })
        map.setTerrain(is3DRef.current ? { source: 'terrain-dem', exaggeration: 1.3 } : null)
      })
    }

    if (map.loaded()) {
      applyNewStyle()
    } else {
      map.once('load', applyNewStyle)
    }
    return undefined
  }, [isSatellite, line, courseData, styleUrl])

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

  // Profile hover -> dot on the map. Updates the source directly; no React re-render.
  const handleProfileHover = useCallback(
    (km) => {
      const map = mapRef.current
      const source = map?.getSource('route-hover')
      if (!source) return
      if (km == null || points.length < 2) {
        source.setData(EMPTY_COLLECTION)
        return
      }
      source.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: positionAtKm(points, cumulativeKm, km) }, properties: {} }],
      })
    },
    [points, cumulativeKm],
  )

  if (!line) {
    return null
  }

  return (
    <div className={className}>
      <div className="relative">
        <div ref={mapContainerRef} className="h-[360px] w-full overflow-hidden rounded-xl sm:h-[460px]" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            onClick={() => setIs3D((value) => !value)}
            className="rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {is3D ? '2D' : '3D'}
          </button>
          <button
            onClick={() => setIsSatellite((value) => !value)}
            className="rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {isSatellite ? 'Map' : 'Satellite'}
          </button>
        </div>
      </div>
      <ElevationProfile profile={profile} stepKm={stepKm} onHover={handleProfileHover} />
      <p className="mt-2 text-xs text-slate-500">
        {measurement
          ? `Estimated elevation · ${measurement.source.dataset} · ${measurement.version}`
          : 'Route preview. Analyze the GPX to calculate its elevation profile.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------- elevation profile

const PROFILE_HEIGHT = 220
const PAD = { top: 22, right: 18, bottom: 30, left: 52 }

function formatMetres(value) {
  return `${Math.round(value).toLocaleString('en-US')} m`
}

// Keep at most two points per pixel column (the lowest and highest), so a 100,000-point
// profile draws as fast as a 1,000-point one without losing any summit or valley floor.
function decimate(points, toX) {
  if (points.length < 4) return points
  const out = []
  let column = -1
  let lo = null
  let hi = null
  const flush = () => {
    if (!lo) return
    if (lo === hi) out.push(lo)
    else if (lo.distanceKm <= hi.distanceKm) out.push(lo, hi)
    else out.push(hi, lo)
  }
  for (const point of points) {
    const c = Math.floor(toX(point.distanceKm))
    if (c !== column) {
      flush()
      column = c
      lo = point
      hi = point
    } else {
      if (point.elevation < lo.elevation) lo = point
      if (point.elevation > hi.elevation) hi = point
    }
  }
  flush()
  return out
}

function ElevationProfile({ profile, stepKm, onHover }) {
  const wrapperRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return undefined
    setWidth(Math.floor(element.clientWidth))
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const valid = useMemo(() => profile.filter((point) => point.elevation != null), [profile])

  const geometry = useMemo(() => {
    if (valid.length < 2 || width < 80) return null
    const chartWidth = width - PAD.left - PAD.right
    const chartHeight = PROFILE_HEIGHT - PAD.top - PAD.bottom
    const maxDistance = valid[valid.length - 1].distanceKm || 1
    let minElevation = Infinity
    let maxElevation = -Infinity
    let peak = valid[0]
    for (const point of valid) {
      if (point.elevation < minElevation) minElevation = point.elevation
      if (point.elevation > maxElevation) {
        maxElevation = point.elevation
        peak = point
      }
    }
    const yStep = niceStep(Math.max(maxElevation - minElevation, 10), 4)
    const subStep = yStep / 5
    const yMin = Math.floor(minElevation / subStep) * subStep
    const yMax = Math.max(Math.ceil((maxElevation + subStep * 0.5) / subStep) * subStep, yMin + yStep)
    const toX = (km) => PAD.left + (km / maxDistance) * chartWidth
    const toY = (elevation) => PAD.top + chartHeight - ((elevation - yMin) / (yMax - yMin)) * chartHeight
    const baselineY = PAD.top + chartHeight

    const groups = []
    for (const point of valid) {
      if (!groups.length || groups[groups.length - 1].id !== point.segmentId) groups.push({ id: point.segmentId, points: [] })
      groups[groups.length - 1].points.push(point)
    }
    const paths = groups.map((group) => {
      const pts = decimate(group.points, toX)
      const coords = pts.map((point) => `${toX(point.distanceKm).toFixed(1)},${toY(point.elevation).toFixed(1)}`)
      return {
        line: coords.join(' '),
        area: [`${toX(pts[0].distanceKm).toFixed(1)},${baselineY}`, ...coords, `${toX(pts[pts.length - 1].distanceKm).toFixed(1)},${baselineY}`].join(' '),
      }
    })

    const yTicks = []
    for (let elevation = Math.ceil(yMin / yStep) * yStep; elevation <= yMax + 1e-9; elevation += yStep) {
      yTicks.push({ y: toY(elevation), label: formatMetres(elevation) })
    }
    const xTicks = []
    for (let km = 0; km <= maxDistance + 1e-9; km += stepKm) {
      xTicks.push({ x: toX(km), label: km === 0 ? '0 km' : String(Math.round(km * 10) / 10) })
    }

    return { chartWidth, chartHeight, maxDistance, toX, toY, baselineY, paths, yTicks, xTicks, peak, yMax }
  }, [valid, width, stepKm])

  const distances = useMemo(() => valid.map((point) => point.distanceKm), [valid])

  const updateHover = useCallback(
    (event) => {
      if (!geometry) return
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const km = Math.min(geometry.maxDistance, Math.max(0, ((x - PAD.left) / geometry.chartWidth) * geometry.maxDistance))
      const i = lowerBound(distances, km)
      const point = valid[i]
      // Grade over the preceding ~100 m of the profile.
      const j = lowerBound(distances, Math.max(0, point.distanceKm - 0.1))
      const back = valid[j]
      const run = (point.distanceKm - back.distanceKm) * 1000
      const grade = run > 20 ? ((point.elevation - back.elevation) / run) * 100 : null
      setHover({ km: point.distanceKm, elevation: point.elevation, grade, x: geometry.toX(point.distanceKm), y: geometry.toY(point.elevation) })
      onHover?.(point.distanceKm)
    },
    [geometry, distances, valid, onHover],
  )

  const clearHover = useCallback(() => {
    setHover(null)
    onHover?.(null)
  }, [onHover])

  const tooltipLeft = hover && geometry ? (hover.x > width - 140 ? hover.x - 12 : hover.x + 12) : 0
  const tooltipAlign = hover && geometry && hover.x > width - 140 ? 'translateX(-100%)' : 'none'

  return (
    <div ref={wrapperRef} className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {geometry ? (
        <>
          <svg
            width={width}
            height={PROFILE_HEIGHT}
            viewBox={`0 0 ${width} ${PROFILE_HEIGHT}`}
            className="block select-none"
            role="img"
            aria-label="Elevation profile"
            onMouseMove={updateHover}
            onMouseLeave={clearHover}
          >
            <defs>
              <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
                <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.04" />
              </linearGradient>
              <clipPath id="elevation-clip">
                <rect x={PAD.left} y={PAD.top} width={geometry.chartWidth} height={geometry.chartHeight} />
              </clipPath>
            </defs>

            <line x1={PAD.left} x2={width - PAD.right} y1={geometry.baselineY} y2={geometry.baselineY} stroke="#cbd5e1" strokeWidth="1" />
            {geometry.yTicks.map((tick) => (
              <g key={tick.label}>
                <line x1={PAD.left} x2={width - PAD.right} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={tick.y === geometry.baselineY ? undefined : '2 3'} />
                <text x={PAD.left - 8} y={tick.y + 3} textAnchor="end" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#64748b">
                  {tick.label}
                </text>
              </g>
            ))}

            {geometry.xTicks.map((tick, index) => (
              <g key={index}>
                <line x1={tick.x} x2={tick.x} y1={geometry.baselineY} y2={geometry.baselineY + 5} stroke="#cbd5e1" strokeWidth="1" />
                <text
                  x={tick.x}
                  y={PROFILE_HEIGHT - 9}
                  textAnchor={index === 0 ? 'start' : index === geometry.xTicks.length - 1 && tick.x > width - PAD.right - 12 ? 'end' : 'middle'}
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill="#64748b"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            <g clipPath="url(#elevation-clip)">
              {geometry.paths.map((path, index) => (
                <g key={index}>
                  <polygon points={path.area} fill="url(#elevation-fill)" />
                  <polyline points={path.line} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              ))}
            </g>

            {/* Highest point */}
            <g>
              <circle cx={geometry.toX(geometry.peak.distanceKm)} cy={geometry.toY(geometry.peak.elevation)} r="3.5" fill="#ffffff" stroke="#1d4ed8" strokeWidth="2" />
              <text
                x={geometry.toX(geometry.peak.distanceKm)}
                y={geometry.toY(geometry.peak.elevation) - 9}
                textAnchor={geometry.toX(geometry.peak.distanceKm) > width - 80 ? 'end' : geometry.toX(geometry.peak.distanceKm) < PAD.left + 60 ? 'start' : 'middle'}
                fontSize="10"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill={INK}
              >
                {formatMetres(geometry.peak.elevation)}
              </text>
            </g>

            {hover && (
              <g pointerEvents="none">
                <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={geometry.baselineY} stroke={INK} strokeWidth="1" strokeOpacity="0.35" />
                <circle cx={hover.x} cy={hover.y} r="5" fill={HOVER_CYAN} stroke="#ffffff" strokeWidth="2" />
              </g>
            )}
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute top-2 rounded-lg bg-[#0b1220] px-2.5 py-1.5 font-mono text-[10px] leading-4 text-white shadow-lg"
              style={{ left: tooltipLeft, transform: tooltipAlign }}
            >
              <div className="font-semibold">{(Math.round(hover.km * 10) / 10).toFixed(1)} km</div>
              <div className="text-slate-300">
                {formatMetres(hover.elevation)}
                {hover.grade != null && (
                  <span className={hover.grade >= 0 ? 'text-cyan-300' : 'text-blue-300'}>
                    {' '}
                    · {hover.grade >= 0 ? '+' : ''}
                    {hover.grade.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ height: PROFILE_HEIGHT }} className="flex items-center justify-center text-xs text-slate-400">
          {valid.length < 2 ? 'No elevation data in this profile.' : ''}
        </div>
      )}
    </div>
  )
}
