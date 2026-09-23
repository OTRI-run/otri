// The three steps of "How it works" on the home page, each drawn as a small scene that plays the
// step: two files dropped into the tool, the scores appearing on the sheet with the reasons
// beside them, and the result going out as a file, a link and a picture. Same round stroke as
// the rest of the site's drawings (PageArt.jsx); the motion is CSS (src/styles.css, `.otri-step-*`),
// runs in a slow loop, and is switched off for anyone who has asked their system for less
// motion, in which case every scene stands still in its finished state.
//
// Every scene is 200 × 120 in view-box units and stretches to its box. Transform origins are in
// view-box units, as an SVG element's origin is resolved against the view box.

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const INK = '#0b1220'
const LINE = '#94a3b8'
const PAPER = '#ffffff'

const BASE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' }

/** A sheet of paper with a folded corner, drawn around (x, y) of the given size. */
function Sheet({ x, y, w, h, children }) {
  const fold = 9
  return (
    <g>
      <path
        d={`M${x + 4} ${y} H${x + w - fold} L${x + w} ${y + fold} V${y + h - 4} A4 4 0 0 1 ${x + w - 4} ${y + h} H${x + 4} A4 4 0 0 1 ${x} ${y + h - 4} V${y + 4} A4 4 0 0 1 ${x + 4} ${y} Z`}
        fill={PAPER}
        stroke={INK}
        strokeWidth="2.4"
      />
      <path d={`M${x + w - fold} ${y} V${y + fold} H${x + w}`} stroke={INK} strokeWidth="2.4" />
      {children}
    </g>
  )
}

/**
 * Step 1: the course file and the results file drop into the tool. The GPX carries a route and a
 * hill, the CSV its rows; the tray lights up as they land and a tick says both are in. Then it
 * begins again.
 */
export function UploadArt({ className = '' }) {
  return (
    <svg viewBox="0 0 200 120" className={className} {...BASE}>
      {/* The tray, dashed until something lands in it. */}
      <rect x="14" y="18" width="172" height="88" rx="12" stroke="currentColor" strokeWidth="2.4" strokeDasharray="1 0" className="otri-step-tray" />
      <path d="M100 92 V80 M92 86 L100 78 L108 86" stroke={LINE} strokeWidth="2.4" opacity="0" className="otri-step-tray-arrow" />

      {/* The course file. */}
      <g className="otri-step-file" style={{ transformOrigin: '70px 60px' }}>
        <Sheet x={44} y={30} w={48} h={58}>
          <path d="M52 66 C58 58 60 72 66 62 S74 48 84 52" stroke="currentColor" strokeWidth="2.6" />
          <path d="M52 76 L60 66 L66 72 L74 60 L84 74" stroke={LINE} strokeWidth="2" />
          <circle cx="84" cy="52" r="2.6" fill="currentColor" stroke="none" />
          <text x="68" y="44" textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="1" fill={INK} fontFamily={MONO}>
            GPX
          </text>
        </Sheet>
      </g>

      {/* The results file. */}
      <g className="otri-step-file otri-step-file-2" style={{ transformOrigin: '132px 60px' }}>
        <Sheet x={108} y={30} w={48} h={58}>
          <text x="132" y="44" textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="1" fill={INK} fontFamily={MONO}>
            CSV
          </text>
          {[54, 63, 72, 81].map((y, i) => (
            <g key={y}>
              <path d={`M116 ${y} H${132 - i * 2}`} stroke={LINE} strokeWidth="2.2" />
              <path d={`M140 ${y} H148`} stroke="currentColor" strokeWidth="2.2" />
            </g>
          ))}
        </Sheet>
      </g>

      {/* Both in: a tick on the tray's corner. */}
      <g className="otri-step-tick" style={{ transformOrigin: '176px 26px' }}>
        <circle cx="176" cy="26" r="11" fill="currentColor" stroke="none" />
        <path d="M170.5 26.5 L174.5 30.5 L182 22.5" stroke="#ffffff" strokeWidth="2.6" />
      </g>
    </svg>
  )
}

/**
 * Step 2: the scored sheet. Finishers are already on it; their scores appear one after another,
 * and a magnifying glass moves down the rows: the numbers, and the reasons behind them, are there
 * to be read.
 */
const ROWS = [
  { y: 34, name: 34, score: '812' },
  { y: 50, name: 28, score: '774' },
  { y: 66, name: 38, score: '731' },
  { y: 82, name: 24, score: '690' },
]

export function ReviewArt({ className = '' }) {
  return (
    <svg viewBox="0 0 200 120" className={className} {...BASE}>
      <rect x="24" y="14" width="152" height="92" rx="10" fill={PAPER} stroke={INK} strokeWidth="2.4" />
      {/* The header row. */}
      <path d="M24 26 H176" stroke={LINE} strokeWidth="1.6" />
      <text x="40" y="22.5" fontSize="6.5" fontWeight="700" letterSpacing="1" fill={LINE} fontFamily={MONO}>
        RUNNER
      </text>
      <text x="160" y="22.5" textAnchor="end" fontSize="6.5" fontWeight="700" letterSpacing="1" fill={LINE} fontFamily={MONO}>
        OTRI
      </text>

      {ROWS.map((row, i) => (
        <g key={row.y}>
          {/* Rank and name: already on the sheet when the scene opens. */}
          <circle cx="36" cy={row.y + 4} r="3.2" fill={i === 0 ? 'currentColor' : LINE} stroke="none" />
          <path d={`M46 ${row.y + 4} H${46 + row.name}`} stroke={i === 0 ? INK : LINE} strokeWidth="2.6" />
          <path d={`M96 ${row.y + 4} H112`} stroke={LINE} strokeWidth="2" />
          {/* The score appears. */}
          <g className="otri-step-score" style={{ transformOrigin: `${150}px ${row.y + 4}px`, animationDelay: `${0.6 + i * 0.45}s` }}>
            <rect x="136" y={row.y - 2} width="28" height="12" rx="4" fill="currentColor" stroke="none" opacity={i === 0 ? 1 : 0.78} />
            <text x="150" y={row.y + 6.6} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#ffffff" fontFamily={MONO}>
              {row.score}
            </text>
          </g>
        </g>
      ))}

      {/* The explanation beneath the first row, drawn out as a line of reasoning. */}
      <g className="otri-step-reason">
        <rect x="30" y="94" width="140" height="8" rx="4" fill="#eff6ff" stroke="none" />
        <path d="M36 98 H80 M88 98 H118 M126 98 H164" stroke="currentColor" strokeWidth="2.2" strokeDasharray="1" pathLength="1" className="otri-step-reason-line" />
      </g>

      {/* The magnifying glass, reading down the rows. */}
      <g className="otri-step-glass">
        <circle cx="118" cy="38" r="12" fill="rgba(255,255,255,.55)" stroke={INK} strokeWidth="2.6" />
        <path d="M127 47 L138 58" stroke={INK} strokeWidth="3.4" />
      </g>
    </svg>
  )
}

/**
 * Step 3: the race page in the middle, and what leaves it: the scored file, a public link and a
 * podium picture. Each path draws itself out from the page and its target lights up when the
 * line arrives; the trophy on the page is lifted between rounds.
 */
export function ShareArt({ className = '' }) {
  const target = (delay) => ({ animationDelay: `${delay}s` })
  return (
    <svg viewBox="0 0 200 120" className={className} {...BASE}>
      {/* The race page. */}
      <rect x="72" y="18" width="56" height="84" rx="8" fill={PAPER} stroke={INK} strokeWidth="2.4" />
      <path d="M82 30 H108" stroke={INK} strokeWidth="2.6" />
      <path d="M82 38 H100" stroke={LINE} strokeWidth="2" />
      {/* The podium, with the trophy lifted now and then. */}
      <rect x="80" y="76" width="12" height="16" rx="2" fill="#dbeafe" stroke="currentColor" strokeWidth="2" />
      <rect x="94" y="66" width="12" height="26" rx="2" fill="#dbeafe" stroke="currentColor" strokeWidth="2" />
      <rect x="108" y="82" width="12" height="10" rx="2" fill="#dbeafe" stroke="currentColor" strokeWidth="2" />
      <g className="otri-step-trophy" style={{ transformOrigin: '100px 56px' }}>
        <path d="M95 48 H105 V54 A5 5 0 0 1 95 54 Z" stroke="currentColor" strokeWidth="2" />
        <path d="M100 59 V62 M96 63 H104" stroke="currentColor" strokeWidth="2" />
      </g>

      {/* The lines out. Each is drawn from the page to its target. */}
      <path d="M72 44 C56 44 56 34 40 34" stroke={LINE} strokeWidth="2" strokeDasharray="1" pathLength="1" className="otri-step-line" style={target(0)} />
      <path d="M128 40 C144 40 144 30 160 30" stroke={LINE} strokeWidth="2" strokeDasharray="1" pathLength="1" className="otri-step-line" style={target(1.1)} />
      <path d="M128 82 C144 82 144 90 160 90" stroke={LINE} strokeWidth="2" strokeDasharray="1" pathLength="1" className="otri-step-line" style={target(2.2)} />

      {/* The scored file, downloaded. */}
      <g className="otri-step-target" style={{ transformOrigin: '28px 34px', ...target(0) }}>
        <circle cx="28" cy="34" r="15" fill="#eff6ff" stroke="currentColor" strokeWidth="2.2" />
        <path d="M28 25 V39 M22 34 L28 40 L34 34 M21 43 H35" stroke="currentColor" strokeWidth="2.4" />
      </g>

      {/* The public link. */}
      <g className="otri-step-target" style={{ transformOrigin: '174px 30px', ...target(1.1) }}>
        <rect x="158" y="20" width="32" height="20" rx="10" fill="#eff6ff" stroke="currentColor" strokeWidth="2.2" />
        <path d="M170 33 L178 27 M168 30 A3.6 3.6 0 1 0 172 34 M180 30 A3.6 3.6 0 1 0 176 26" stroke="currentColor" strokeWidth="2.2" />
      </g>

      {/* The podium picture. */}
      <g className="otri-step-target" style={{ transformOrigin: '174px 90px', ...target(2.2) }}>
        <rect x="160" y="78" width="30" height="24" rx="4" fill="#eff6ff" stroke="currentColor" strokeWidth="2.2" />
        <path d="M164 98 L172 88 L177 93 L181 89 L186 98" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="182" cy="84" r="2.2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}
