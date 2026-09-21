import React from 'react'

// OTRI brand lockup: emblem + wordmark. The "OPEN TRAIL RUNNING INDEX" tagline is drawn by
// src/styles.css against aria-label="OTRI home", so every page that uses this component gets
// the identical lockup as the landing page.
export default function Logo({ dark = false, href = '#top' }) {
  const gradientId = dark ? 'otriLogoDark' : 'otriLogoLight'
  return (
    <a href={href} className="group flex min-w-0 shrink-0 items-center gap-2 no-underline" aria-label="OTRI home">
      <svg className="h-9 w-9 shrink-0" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="5" y1="4" x2="35" y2="37" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset=".48" stopColor="#2563EB" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="17" stroke={`url(#${gradientId})`} strokeWidth="5" />
        <path d="M7 26.5 15.5 20l4 2.7L26 16l7 6" stroke={`url(#${gradientId})`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 30c5-6 10-7 17-10" stroke={dark ? '#fff' : '#2563EB'} strokeWidth="3.4" strokeLinecap="round" />
      </svg>
      <span className={`shrink-0 text-[26px] font-bold tracking-[-.09em] ${dark ? 'text-white' : 'text-[#0b1220]'}`}>TRI</span>
    </a>
  )
}
