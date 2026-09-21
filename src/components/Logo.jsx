import React from 'react'

/**
 * The OTRI wordmark.
 *
 * It is the name, set as type, and nothing else. The previous lockup put a circular emblem where
 * the O belongs and printed only the letters TRI beside it, so readers saw "tri" and the name was
 * lost. A mark that has to be explained is not a mark, so there is no symbol here at all: the o is
 * a letter, in the word, where it can be read.
 *
 * The raised arrow is punctuation, not a letter. It is the same arrow used on outbound links
 * across the site, borrowed here to say that the index points outward at the sport.
 */
export default function Logo({ href = '#top', showName = true, className = '' }) {
  return (
    <a
      href={href}
      aria-label="OTRI, the Open Trail Running Index. Home"
      className={`flex min-w-0 shrink-0 items-center gap-3 no-underline ${className}`}
    >
      <span className="shrink-0 text-[27px] font-black leading-none tracking-[-.07em] text-current" aria-hidden="true">
        otri
        {/* Drawn rather than typed: the character U+2197 is shown as a colour emoji on Windows,
            which would put a blue tile in the middle of the wordmark. */}
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
        <span className="hidden shrink-0 border-l border-current/25 pl-3 font-mono text-[10px] leading-tight tracking-[.08em] opacity-60 sm:block">
          Open Trail Running Index
        </span>
      ) : null}
    </a>
  )
}
