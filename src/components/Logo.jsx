import React from 'react'

/**
 * The OTRI lockup: the name, then the name written out.
 *
 * The mark it replaces set a circular emblem where the O belongs and printed only the letters TRI
 * beside it, so readers saw "tri" and the name was lost. There is no symbol here at all: the o is
 * a letter, in the word, where it can be read.
 *
 * The raised arrow is punctuation rather than a letter. It is drawn as a path because the
 * character U+2197 is shown as a colour emoji on Windows, which would put a blue tile in the
 * middle of the word.
 */
export default function Logo({ dark = false, href = '#top', showName = true }) {
  return (
    <a
      href={href}
      aria-label="OTRI, the Open Trail Running Index. Home"
      className="flex min-w-0 shrink-0 items-center gap-3 no-underline"
    >
      <span
        aria-hidden="true"
        className={`shrink-0 text-[27px] font-black leading-none tracking-[-.07em] ${dark ? 'text-white' : 'text-[#0b1220]'}`}
      >
        otri
        <svg
          viewBox="0 0 12 12"
          className="ml-[3px] inline-block h-[9px] w-[9px] align-super"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 9.5 9.5 2.5" />
          <path d="M4.2 2.5h5.3v5.3" />
        </svg>
      </span>
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
