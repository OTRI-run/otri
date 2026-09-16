# components

Reusable UI components.

- `CourseMap.jsx` — renders a GPX route on a [MapLibre GL JS](https://maplibre.org/) map (BSD-3, no API key) with real 3D terrain/hillshading and an elevation profile beneath it. Uses `../lib/gpx.js` for parsing. Defaults to [OpenFreeMap](https://openfreemap.org/)'s free, keyless "liberty" style plus AWS's open elevation tiles (Terrarium encoding) for terrain — no paid infrastructure required. Pass a `styleUrl` prop to point at a self-hosted OpenStreetMap-based style (e.g. Protomaps, OpenMapTiles) for production — see `docs/roadmap.md` Phase 3.

Includes built-in **2D/3D** and **Map/Satellite** toggle buttons (top-right of the map). Satellite imagery is Esri World Imagery — free and keyless, same reasoning as the terrain tiles.

```jsx
<CourseMap gpxText={gpxFileContents} className="mt-6" />
```

Not yet wired into any page — this is a ready-to-use building block for the future organizer-upload / GPX-predictor UI (`docs/roadmap.md` Phase 4).
