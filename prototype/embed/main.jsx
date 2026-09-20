import '../../src/styles.css'
import './main.css'
import React, { useEffect } from 'preact/compat'
import { createRoot } from 'preact/compat/client'
import { ArrowUpRight } from '../../src/ui/icons'
import ScoreCalculator from '../ScoreCalculator'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import { Mark } from '../../src/components/Logo'

// The score calculator for another website's page:
//   <iframe src="https://otri.run/prototype/embed/?race=RACE_ID" ...>
// `?race=` opens a race published on OTRI, `?gpx=` a course shared from the calculator, and
// `&t=` a target time in seconds; with neither, the visitor chooses or uploads a course. The
// calculator reads these from the hash, so they are moved there before it mounts.
if (window.location.search.length > 1 && !window.location.hash) {
  window.history.replaceState(null, '', `${window.location.pathname}#calculator${window.location.search}`)
}

// The frame cannot size itself: it tells the host page how tall its content is, and the snippet
// on the API page listens for it. Nothing else is ever posted, and nothing is read from the host.
function useReportedHeight() {
  useEffect(() => {
    if (window.parent === window) return undefined
    const report = () => window.parent.postMessage({ type: 'otri:height', height: Math.ceil(document.documentElement.scrollHeight) }, '*')
    const observer = new ResizeObserver(report)
    observer.observe(document.body)
    report()
    return () => observer.disconnect()
  }, [])
}

function Embed() {
  useReportedHeight()
  return (
    <div className="embed">
      <ScoreCalculator embedded />
      <footer className="embed__foot">
        <Mark size={18} />
        <span>
          Scored by the open{' '}
          <a href="https://otri.run/prototype/#calculator" className="link link--arrow">
            OTRI model <ArrowUpRight size={13} />
          </a>
          . The score depends on the course and the time, never on who else races.
        </span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary home="./">
    <Embed />
  </ErrorBoundary>,
)
