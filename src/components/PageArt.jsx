// A small drawing beside each page's title, all in the same round stroke as the site's mark: a
// runner, a results sheet, a summit with a flag, a podium, a finish line, a speech bubble, a
// calendar, a calculator. Decorative and hidden from assistive technology; the title says what
// the page is.
//
// Each one moves a little, in the way its subject would: the runner bobs and the ground slides
// under him, the stopwatch ticks, the trail's dots climb the mountain, the flag and the banner
// stir, the scores rise out of the calculator. The motion is CSS (src/styles.css, `.otri-*`),
// slow, and switched off entirely for anyone who has asked for reduced motion, so a still copy
// is always the fallback. Transform origins are in viewBox units: an SVG element's origin is
// resolved against the view box by default.

import { useEffect, useState } from 'react'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' }

/** Whether the visitor has asked for reduced motion. The CSS animations honour that on their own;
 *  this is for motion that CSS cannot switch off, such as an SVG motion path. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const onChange = (event) => setReduced(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** The size and tone of a drawing that sits beside a page title. */
export const TITLE_ART = 'h-14 w-14 shrink-0 text-blue-700 opacity-[.55] sm:h-[76px] sm:w-[76px]'

/** A trail runner climbing: leaning into the slope, arms and legs swinging from the shoulder and
 *  the hip in opposite phase, the body dipping with each footfall, and the trail streaming back
 *  downhill under him. */
export function RunnerArt({ className = '' }) {
  const bob = { transformOrigin: '60px 60px', animationDuration: '.72s' }
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="7" {...STROKE}>
      {/* The slope, rising to the right, with the trail's dashes running back down it. */}
      <path d="M2 112 L118 68" strokeWidth="5" opacity=".35" />
      <path d="M2 112 L118 68" strokeWidth="5" opacity=".6" strokeDasharray="7 11" className="otri-run" />
      <g className="otri-bob" style={bob}>
        {/* Head, and the torso leaning into the hill. */}
        <circle cx="78" cy="22" r="8" />
        <path d="M71 34 L55 62" />
        {/* Arms swing from the shoulder, one forward as the other goes back. */}
        <g className="otri-swing" style={{ transformOrigin: '70px 40px' }}>
          <path d="M70 40 L84 50 L96 42" />
        </g>
        <g className="otri-swing-back" style={{ transformOrigin: '70px 40px' }}>
          <path d="M70 40 L56 46 L46 58" />
        </g>
        {/* Legs swing from the hip, opposite to the arm on the same side. */}
        <g className="otri-swing-back" style={{ transformOrigin: '55px 62px' }}>
          <path d="M55 62 L73 78 L68 100" />
        </g>
        <g className="otri-swing" style={{ transformOrigin: '55px 62px' }}>
          <path d="M55 62 L42 78 L28 74" />
        </g>
      </g>
    </svg>
  )
}

/** `face` is the colour behind the stopwatch dial: the surface the drawing sits on. The hand
 *  sweeps round, and the rows write themselves onto the sheet one after another. */
export function SheetArt({ className = '', face = '#ffffff' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="12" y="34" width="70" height="80" rx="9" />
      <rect x="32" y="26" width="30" height="15" rx="4" />
      <path d="M26 62 H68" strokeDasharray="50" className="otri-write" style={{ animationDelay: '0s' }} />
      <path d="M26 78 H68" strokeDasharray="50" className="otri-write" style={{ animationDelay: '.5s' }} />
      <path d="M26 94 H56" strokeDasharray="50" className="otri-write" style={{ animationDelay: '1s' }} />
      <circle cx="94" cy="26" r="17" fill={face} />
      <path d="M94 5 V9 M106 12 L103 15" />
      <path d="M94 16 V26 H101" className="otri-tick" style={{ transformOrigin: '94px 26px' }} />
    </svg>
  )
}

/** A climber's marker makes its way up the ridge to the flag, pauses at the top, and starts again
 *  from the foot of the mountain. The flag stirs. With reduced motion the marker rests at the
 *  summit. The dotted trail this used to have moved oddly at title size and is gone. */
const RIDGE = 'M6 104 L40 46 L58 72 L82 28'

export function SummitArt({ className = '' }) {
  const reduced = useReducedMotion()
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <path d={`${RIDGE} L114 104`} />
      <path d="M82 28 V8" />
      <path d="M82 8 L102 14 L82 20 Z" fill="currentColor" className="otri-wave" style={{ transformOrigin: '82px 14px' }} />
      {reduced ? (
        <circle cx="82" cy="28" r="6" fill="currentColor" stroke="none" />
      ) : (
        <circle r="6" fill="currentColor" stroke="none">
          {/* Along the ridge in 3.4 s, held at the summit for the last stretch of each cycle. */}
          <animateMotion dur="4.4s" repeatCount="indefinite" path={RIDGE} calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.78;1" />
        </circle>
      )}
    </svg>
  )
}

/** The trophy is lifted a little, again and again. */
export function PodiumArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="10" y="76" width="32" height="34" rx="4" />
      <rect x="44" y="58" width="32" height="52" rx="4" />
      <rect x="78" y="86" width="32" height="24" rx="4" />
      <g className="otri-bob" style={{ transformOrigin: '60px 30px', animationDuration: '2.6s' }}>
        <path d="M48 14 H72 V26 A12 12 0 0 1 48 26 Z" />
        <path d="M48 18 H40 A8 8 0 0 0 48 30 M72 18 H80 A8 8 0 0 1 72 30" strokeWidth="4" />
        <path d="M60 38 V46 M50 48 H70" />
      </g>
    </svg>
  )
}

/** A finish line: the banner stirs between its poles, and the checkered strip streams past. */
export function FinishArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <defs>
        <clipPath id="otri-finish-strip">
          <rect x="8" y="96" width="104" height="16" />
        </clipPath>
      </defs>
      <path d="M18 24 V110 M102 24 V110" />
      <g className="otri-wave" style={{ transformOrigin: '60px 18px', animationDuration: '3.4s' }}>
        <rect x="10" y="18" width="100" height="28" rx="5" />
        <text x="60" y="38" textAnchor="middle" fontSize="15" fontWeight="800" letterSpacing="2" fill="currentColor" stroke="none" fontFamily={MONO}>
          FINISH
        </text>
      </g>
      <g clipPath="url(#otri-finish-strip)" fill="currentColor" stroke="none">
        <g className="otri-flow">
          {[8, 34, 60, 86, 112, 138].map((x) => (
            <rect key={`a${x}`} x={x} y="96" width="13" height="8" />
          ))}
          {[21, 47, 73, 99, 125, 151].map((x) => (
            <rect key={`b${x}`} x={x} y="104" width="13" height="8" />
          ))}
        </g>
      </g>
      <rect x="8" y="96" width="104" height="16" strokeWidth="3" />
    </svg>
  )
}

/** The bubble floats and the question mark breathes. */
export function QuestionArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <g className="otri-bob" style={{ transformOrigin: '60px 60px', animationDuration: '3.2s' }}>
        <path d="M22 20 H98 A12 12 0 0 1 110 32 V68 A12 12 0 0 1 98 80 H56 L36 100 V80 H22 A12 12 0 0 1 10 68 V32 A12 12 0 0 1 22 20 Z" />
        <g className="otri-pulse" style={{ transformOrigin: '58px 56px' }}>
          <path d="M48 42 A12 12 0 1 1 66 54 C61 57 60 60 60 64" />
          <circle cx="60" cy="72" r="3.5" fill="currentColor" stroke="none" />
        </g>
      </g>
    </svg>
  )
}

/** Race days light up one after another across the month. */
export function CalendarArt({ className = '' }) {
  const marks = [
    [30, 64],
    [50, 64],
    [70, 64],
    [30, 84],
    [50, 84],
    [90, 84],
  ]
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="12" y="24" width="96" height="84" rx="10" />
      <path d="M12 46 H108 M36 12 V32 M84 12 V32" />
      {marks.map(([x, y], i) => (
        <path key={`${x}-${y}`} d={`M${x} ${y} H${x + 10}`} strokeWidth="7" className="otri-pop" style={{ animationDelay: `${i * 0.45}s` }} />
      ))}
    </svg>
  )
}

/** A calculator with scores rising out of its screen, up to 1000. */
export function CalculatorArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} strokeWidth="6" {...STROKE}>
      <rect x="24" y="40" width="64" height="76" rx="9" />
      <rect x="34" y="50" width="44" height="16" rx="3" />
      <path d="M38 78 H46 M56 78 H64 M74 78 H82 M38 92 H46 M56 92 H64 M74 92 H82 M38 106 H46 M56 106 H64 M74 106 H82" strokeWidth="5" />
      <g fill="currentColor" stroke="none" fontFamily={MONO} fontWeight="700">
        <text x="30" y="34" fontSize="13" className="otri-float" style={{ animationDelay: '0s' }}>499</text>
        <text x="66" y="24" fontSize="12" opacity=".7" className="otri-float" style={{ animationDelay: '-1.4s' }}>720</text>
        <text x="46" y="12" fontSize="14" className="otri-float" style={{ animationDelay: '-2.8s' }}>1000</text>
      </g>
    </svg>
  )
}
