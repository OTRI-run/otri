import './ErrorBoundary.css'
import React from 'preact/compat'
import { BrandWordmark } from './Logo'
import { reportError } from '../lib/monitoring'

// Last line of defence for the OTRI entry points: a render error would otherwise leave a blank
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
        <BrandWordmark className="otri-error-wordmark" />
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
