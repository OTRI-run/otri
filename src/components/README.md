# components

Reusable UI components.

- `CourseMap.jsx` — renders a GPX route on a [MapLibre GL JS](https://maplibre.org/) map (BSD-3, no API key) with an elevation profile beneath it. Uses `../lib/gpx.js` for parsing. Defaults to MapLibre's open demo style (`https://demotiles.maplibre.org/style.json`) so it works with zero paid infrastructure; pass a `styleUrl` prop to point at a self-hosted OpenStreetMap-based style (e.g. Protomaps, OpenMapTiles) for production — see `docs/roadmap.md` Phase 3.

```jsx
<CourseMap gpxText={gpxFileContents} className="mt-6" />
```

Not yet wired into any page — this is a ready-to-use building block for the future organizer-upload / GPX-predictor UI (`docs/roadmap.md` Phase 4).
