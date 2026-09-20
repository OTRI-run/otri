import s from './Logo.module.css'
import React from 'react'

export function BrandElevation({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 12" fill="none" aria-hidden="true">
          <path d="M1 10 19 8 31 3 43 7 61 1 75 6 99 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M1 12 19 11 31 7 43 10 61 5 75 10 99 8" stroke="currentColor" strokeOpacity=".3" />
          <circle cx="61" cy="1" r="1.5" fill="currentColor" />
        </svg>
  )
}

// Keep all four letters together: the terrain motif must never replace the O.
export default function Logo({ dark = false, href = '#top' }) {
  return (
    <a href={href} className={`${s.logo} ${dark ? s.dark : ''}`} aria-label="OTRI home">
      <span className={s.wordmark}>
        OTRI
        <BrandElevation className={s.terrain} />
      </span>
    </a>
  )
}
