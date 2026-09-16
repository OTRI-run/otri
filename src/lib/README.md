# lib

Shared, framework-agnostic utilities used by components.

- `gpx.js` — browser-side GPX parsing and elevation-profile/GeoJSON helpers for `components/CourseMap.jsx`. Rendering-only; not the authoritative course-scoring source (see `../../course/README.md`).

Keep this UI-adjacent (formatting, parsing, view-model shaping). Domain scoring logic belongs in the Python `ingestion/`, `scoring/`, and `course/` packages, not here.
