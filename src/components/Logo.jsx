import React from 'react'
import identity from '../brand/identity.json'

/**
 * The OTRI mark.
 *
 * The four letters are outlines of IBM Plex Mono SemiBold, opened up 16 per cent, so the capital I
 * keeps its crossbars and the O stays a true circle. That is what stops the name being read as
 * "TRI": nothing is ever allowed to stand in for a letter. The rule under the word is a
 * cartographic scale bar, the device every survey sheet carries to declare what it measures.
 *
 * Both drawings take `currentColor`, so one file works on the white chrome and on a dark ground.
 */

/** The wordmark: OTRI over the scale bar. Use this wherever there is room to read the name. */
export function Wordmark({ height = 26, className = '' }) {
  const { box, letters, ticks, cells } = identity.wordmark
  return (
    <svg
      className={className}
      viewBox={`0 0 ${box[0]} ${box[1]}`}
      height={height}
      role="img"
      aria-label="OTRI"
      focusable="false"
    >
      <g fill="currentColor">
        <path d={letters} />
        <g dangerouslySetInnerHTML={{ __html: ticks }} />
      </g>
      <g stroke="currentColor" strokeWidth="3" dangerouslySetInnerHTML={{ __html: cells }} />
    </svg>
  )
}

/**
 * The icon: the four letters stacked two by two on a filled plate, with the scale bar as its base.
 * Drawn separately rather than shrinking the wordmark, because below about forty pixels the
 * single line of letters stops being readable. This is the favicon and the app tile.
 */
export function Mark({ size = 32, className = '' }) {
  const { rowWidth, top, bottom } = identity.icon
  const k = 30 / rowWidth
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" fill="currentColor" />
      <g fill="var(--otri-plate, #fff)">
        <g transform={`translate(9 4) scale(${k})`}>
          <path d={top} />
        </g>
        <g transform={`translate(9 ${4 + 100 * k + 3.5}) scale(${k})`}>
          <path d={bottom} />
        </g>
        <rect x="9" y="39.5" width="30" height="4.5" />
      </g>
    </svg>
  )
}

/**
 * The lockup used in the chrome: the wordmark, a rule, and the name written out. The name is real
 * text so it can be read, selected and translated, rather than painted on by a stylesheet.
 */
export default function Logo({ href = '#top', showName = true, height = 26, className = '' }) {
  return (
    <a
      href={href}
      aria-label="OTRI home"
      className={`flex min-w-0 shrink-0 items-center gap-3 text-[#172033] no-underline ${className}`}
    >
      <Wordmark height={height} className="shrink-0" />
      {showName ? (
        <span className="hidden shrink-0 border-l border-slate-300 pl-3 font-mono text-[10px] leading-[1.35] tracking-[.1em] text-slate-500 sm:block">
          {identity.fullName}
        </span>
      ) : null}
    </a>
  )
}
