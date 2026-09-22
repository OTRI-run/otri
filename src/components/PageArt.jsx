// A small drawing beside each page's title, all in the same round stroke as the site's mark: a
// runner, a results sheet, a summit with a flag, a podium, a winding route, a speech bubble, a
// calendar. Decorative and hidden from assistive technology; the title says what the page is.

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' }

/** The size and tone of a drawing that sits beside a page title. */
export const TITLE_ART = 'h-14 w-14 shrink-0 text-blue-700 opacity-[.55] sm:h-[76px] sm:w-[76px]'

export function RunnerArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="7" {...STROKE}>
      <circle cx="80" cy="20" r="9" />
      <path d="M72 33 L57 62" />
      <path d="M69 41 L85 51 L97 43" />
      <path d="M69 41 L53 45 L41 58" />
      <path d="M57 62 L75 79 L69 102" />
      <path d="M57 62 L42 76 L26 71" />
      <path d="M12 106 H50" strokeWidth="5" opacity=".5" />
    </svg>
  )
}

/** `face` is the colour behind the stopwatch dial: the surface the drawing sits on. */
export function SheetArt({ className = '', face = '#ffffff' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="12" y="34" width="70" height="80" rx="9" />
      <rect x="32" y="26" width="30" height="15" rx="4" />
      <path d="M26 62 H68 M26 78 H68 M26 94 H56" />
      <circle cx="94" cy="26" r="17" fill={face} />
      <path d="M94 16 V26 H101 M94 5 V9 M106 12 L103 15" />
    </svg>
  )
}

export function SummitArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <path d="M6 104 L40 46 L58 72 L82 28 L114 104" />
      <path d="M22 104 C36 86 46 92 54 82 S70 52 82 34" strokeWidth="4" strokeDasharray="1 9" opacity=".7" />
      <path d="M82 28 V8" />
      <path d="M82 8 L102 14 L82 20 Z" fill="currentColor" />
    </svg>
  )
}

export function PodiumArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="10" y="76" width="32" height="34" rx="4" />
      <rect x="44" y="58" width="32" height="52" rx="4" />
      <rect x="78" y="86" width="32" height="24" rx="4" />
      <path d="M48 14 H72 V26 A12 12 0 0 1 48 26 Z" />
      <path d="M48 18 H40 A8 8 0 0 0 48 30 M72 18 H80 A8 8 0 0 1 72 30" strokeWidth="4" />
      <path d="M60 38 V46 M50 48 H70" />
    </svg>
  )
}

export function RouteArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <path d="M16 102 C30 60 50 116 66 72 S98 34 104 18" strokeWidth="5" strokeDasharray="1 11" />
      <circle cx="16" cy="102" r="7" fill="currentColor" />
      <path d="M104 18 V4" />
      <path d="M104 4 H122 L116 10 L122 16 H104 Z" fill="currentColor" transform="translate(-2 0)" />
    </svg>
  )
}

export function QuestionArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <path d="M22 20 H98 A12 12 0 0 1 110 32 V68 A12 12 0 0 1 98 80 H56 L36 100 V80 H22 A12 12 0 0 1 10 68 V32 A12 12 0 0 1 22 20 Z" />
      <path d="M48 42 A12 12 0 1 1 66 54 C61 57 60 60 60 64" />
      <circle cx="60" cy="72" r="3.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CalendarArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="12" y="24" width="96" height="84" rx="10" />
      <path d="M12 46 H108 M36 12 V32 M84 12 V32" />
      <path d="M30 64 H40 M50 64 H60 M70 64 H80 M30 84 H40 M50 84 H60" strokeWidth="7" />
      <path d="M90 84 H100" strokeWidth="7" opacity=".45" />
    </svg>
  )
}
