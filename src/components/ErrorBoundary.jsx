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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fc] px-6 text-center text-[#0b1220]">
        <svg className="h-14 w-14" viewBox="0 0 40 40" fill="none" aria-hidden="true">
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
        <p className="mt-6 font-mono text-[10px] tracking-[.08em] text-slate-500">SOMETHING WENT WRONG</p>
        <h1 className="mt-3 text-[clamp(28px,4.5vw,44px)] font-bold leading-[.98] tracking-[-.05em]">This page hit an error.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
          Reloading usually fixes it. If it keeps happening, tell us at{' '}
          <a href={`mailto:hello@otri.run?subject=${encodeURIComponent('OTRI page error')}&body=${encodeURIComponent(`${window.location.href}\n\n${error.message}`)}`} className="font-semibold text-blue-600">
            hello@otri.run
          </a>{' '}
          and include the address of this page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
            Reload the page
          </button>
          <a href={home} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0b1220] no-underline">
            Back to the start
          </a>
        </div>
        <details className="mt-8 max-w-lg text-left">
          <summary className="cursor-pointer font-mono text-[10px] tracking-[.08em] text-slate-400">TECHNICAL DETAILS</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-white p-3 font-mono text-[11px] text-slate-600">{String(error.stack || error.message)}</pre>
        </details>
      </div>
    )
  }
}
