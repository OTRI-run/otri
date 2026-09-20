import './ErrorBoundary.css'
import React from 'react'
import { reportError } from '../lib/monitoring'

// Last line of defence for the three React apps: a render error would otherwise leave a blank
// page. Shows the OTRI mark, what went wrong, and the two things a visitor can do about it.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('OTRI page crashed', error, info?.componentStack)
    reportError(error, { componentStack: info?.componentStack })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const home = this.props.home ?? './'
    return (
      <div className="src-components-error-boundary-view-div-1">
        <svg className="src-components-error-boundary-view-svg-2" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="otriErrGrad" x1="5" y1="4" x2="35" y2="37" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60A5FA" />
              <stop offset=".48" stopColor="#2563EB" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
          </defs>
          <circle cx="20" cy="20" r="17" stroke="url(#otriErrGrad)" strokeWidth="5" />
          <path d="M7 26.5 15.5 20l4 2.7L26 16l7 6" stroke="url(#otriErrGrad)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 30c5-6 10-7 17-10" stroke="#2563EB" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
        <p className="src-components-error-boundary-view-p-3">SOMETHING WENT WRONG</p>
        <h1 className="src-components-error-boundary-view-h1-4">This page hit an error.</h1>
        <p className="src-components-error-boundary-view-p-5">
          Reloading usually fixes it. If it keeps happening, tell us at{' '}
          <a href={`mailto:hello@otri.run?subject=${encodeURIComponent('OTRI page error')}&body=${encodeURIComponent(`${window.location.href}\n\n${error.message}`)}`} className="src-components-error-boundary-view-a-6">
            hello@otri.run
          </a>{' '}
          and include the address of this page.
        </p>
        <div className="src-components-error-boundary-view-div-7">
          <button type="button" onClick={() => window.location.reload()} className="src-components-error-boundary-view-button-8">
            Reload the page
          </button>
          <a href={home} className="src-components-error-boundary-view-a-9">
            Back to the start
          </a>
        </div>
        <details className="src-components-error-boundary-view-details-10">
          <summary className="src-components-error-boundary-view-summary-11">TECHNICAL DETAILS</summary>
          <pre className="src-components-error-boundary-view-pre-12">{String(error.stack || error.message)}</pre>
        </details>
      </div>
    )
  }
}
