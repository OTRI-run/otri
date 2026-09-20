import { lazy, Suspense } from 'preact/compat'

// Keep the map renderer, terrain decoder and WebGL worker off the initial page load.
const CourseMap = lazy(() => import('./CourseMap'))

export default function LazyCourseMap(props) {
  return <Suspense fallback={<div role="status" className="loading" style={{ minHeight: 320, justifyContent: 'center' }}><span className="spinner" /> Loading the course map…</div>}>
    <CourseMap {...props} />
  </Suspense>
}
