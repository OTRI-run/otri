import React from 'react'

// Keep all four letters together: the terrain motif must never replace the O.
export default function Logo({ dark = false, href = '#top' }) {
  return (
    <a href={href} className="group flex min-w-0 shrink-0 items-center no-underline" aria-label="OTRI home">
      <span className={`otri-wordmark ${dark ? 'text-white' : 'text-[#0b1220]'}`}>
        <span className={dark ? 'text-sky-300' : 'text-blue-600'}>O</span>TRI
        <svg className="otri-wordmark-terrain" viewBox="0 0 100 12" fill="none" aria-hidden="true">
          <path d="M1 10 19 8 31 3 43 7 61 1 75 6 99 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M1 12 19 11 31 7 43 10 61 5 75 10 99 8" stroke="currentColor" strokeOpacity=".3" />
          <circle cx="61" cy="1" r="1.5" fill="currentColor" />
        </svg>
      </span>
    </a>
  )
}
