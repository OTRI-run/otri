import React from 'react'

export const OTRI_INK = '#17202c'
export const OTRI_BLUE = '#3576f6'

/**
 * The OTRI wordmark.
 *
 * The name is set as type, so the o is a letter and the word cannot be read as "tri". The only
 * drawn parts are the two marks that sit above the line: a summit standing in for the tittle of
 * the i, and the arrow that follows the word. The i is written with a dotless ı so the summit has
 * the place to itself.
 *
 * Both marks are sized in em, so the whole lockup scales with one font size.
 */
export function Wordmark({ tone = 'brand', size = 27, className = '' }) {
  const letters = tone === 'white' ? '#ffffff' : OTRI_INK
  const accent = tone === 'brand' ? OTRI_BLUE : letters
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 leading-none tracking-[-.045em] ${className}`}
      style={{ fontSize: size, color: letters, fontFamily: "'OTRI Wordmark', system-ui, sans-serif", fontWeight: 400 }}
    >
      otr
      <span className="relative inline-block">
        {/* U+0131, the dotless i: the summit below is its tittle */}
        {'ı'}
        <svg
          viewBox="0 0 10 8"
          className="absolute left-1/2 w-[0.32em] -translate-x-1/2"
          style={{ bottom: '0.63em', color: accent }}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5 0 10 8H0z" />
        </svg>
      </span>
      <svg
        viewBox="0 0 12 12"
        className="ml-[0.06em] inline-block h-[0.33em] w-[0.33em] align-super"
        style={{ color: accent }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2.4 9.6 9.6 2.4" />
        <path d="M4 2.4h5.6V8" />
      </svg>
    </span>
  )
}

/** The lockup used in the chrome: the wordmark, a rule, and the name written out. */
export default function Logo({ dark = false, href = '#top', showName = true, size = 27, className = '' }) {
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
