import { lazy, Suspense } from 'preact/compat'

// Keep the map renderer, terrain decoder and WebGL worker off the initial page load.
const CourseMap = lazy(() => import('./CourseMap'))

export default function LazyCourseMap(props) {
  return <Suspense fallback={<div role="status" style={{ minHeight: 320, display: 'grid', placeItems: 'center', color: '#70695d' }}>Loading course map…</div>}>
    <CourseMap {...props} />
  </Suspense>
}
