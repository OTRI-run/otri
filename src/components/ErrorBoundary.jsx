import React from 'preact/compat'
import { Mark } from './Logo'
import { reportError } from '../lib/monitoring'

// Last line of defence for the apps: a render error would otherwise leave a blank page. Shows the
// OTRI mark, what went wrong, and the two things a visitor can do about it.
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
      <div className="full-screen">
        <div className="stack" style={{ maxWidth: 520, justifyItems: 'center' }}>
          <Mark size={64} />
          <p className="eyebrow mt-4">Something went wrong</p>
          <h1 className="display-2">This page hit an error.</h1>
          <p className="muted">
            Reloading usually fixes it. If it keeps happening, tell us at{' '}
            <a href={`mailto:hello@otri.run?subject=${encodeURIComponent('OTRI page error')}&body=${encodeURIComponent(`${window.location.href}\n\n${error.message}`)}`} className="link">
              hello@otri.run
            </a>{' '}
            and include the address of this page.
          </p>
          <div className="cluster cluster--center mt-2">
            <button type="button" onClick={() => window.location.reload()} className="btn btn--primary">
              Reload the page
            </button>
            <a href={home} className="btn btn--secondary">
              Back to the start
            </a>
          </div>
          <details className="details details--plain mt-6" style={{ width: '100%', textAlign: 'left' }}>
            <summary className="mono tiny muted upper">Technical details</summary>
            <pre className="code-block mt-2" style={{ whiteSpace: 'pre-wrap' }}>{String(error.stack || error.message)}</pre>
          </details>
        </div>
      </div>
    )
  }
}
