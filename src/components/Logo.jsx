import React from 'react'
import geometry from '../brand/uphill.json'
export const OTRI_INK = '#17202c'
export const OTRI_BLUE = '#3576f6'

// The exact same outlined artwork is used by the header and downloadable brand files.
export function Wordmark({ tone = 'brand', size = 30, className = '' }) {
  const ink = tone === 'white' || tone === 'on-dark' ? '#ffffff' : tone === 'black' ? '#111111' : OTRI_INK
  const accent = tone === 'brand' || tone === 'on-dark' ? OTRI_BLUE : ink
  return <svg aria-hidden="true" focusable="false" viewBox={geometry.viewBox} width={size * 203 / 74} height={size} className={`shrink-0 ${className}`} style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}>
    <path d={`${geometry.letters} ${geometry.stem}`} fill={ink} />
    <path d={geometry.summit} fill={accent} />
    <path d={geometry.arrow} fill="none" stroke={accent} strokeWidth="5" strokeLinejoin="round" />
  </svg>
}

/** The lockup used in the chrome: the wordmark, a rule, and the name written out. */
export default function Logo({ dark = false, href = '#top', showName = true, size = 30, className = '' }) {
  const tone = dark ? 'white' : 'brand'
  return (
    <a
      href={href}
      aria-label="OTRI, the Open Trail Running Index. Home"
      className={`flex min-w-0 shrink-0 items-center gap-3 no-underline ${className}`}
    >
      <Wordmark tone={tone} size={size} />
      {showName ? (
        <span
          className={`hidden shrink-0 border-l pl-3 font-mono text-[10px] leading-tight tracking-[.08em] sm:block ${
            dark ? 'border-white/25 text-slate-300' : 'border-slate-300 text-slate-500'
          }`}
        >
          Open Trail Running Index
        </span>
      ) : null}
    </a>
  )
}
