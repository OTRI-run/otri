import identity from '../brand/identity.json'

// The OTRI mark: three contour rings around a summit, opened where a trail climbs through them
// to the top. The rings take the text colour, the trail is always the blaze orange, so the same
// drawing works on paper and on the dark surfaces. `tone="mono"` draws everything in one colour.
export function Mark({ size = 40, tone = 'ink', className = '', title }) {
  const { rings, trail, trailWidth, trailDash, summit } = identity.mark
  const blaze = tone === 'mono' ? 'currentColor' : identity.colours.blaze
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      {rings.map((ring) => (
        <circle key={ring.r} cx="24" cy="24" r={ring.r} fill="none" stroke="currentColor" strokeWidth={ring.width} pathLength="360" strokeDasharray={ring.dash} transform={`rotate(${ring.rotate} 24 24)`} strokeLinecap="round" />
      ))}
      <path d={trail} fill="none" stroke={blaze} strokeWidth={trailWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={trailDash} />
      <circle cx={summit.cx} cy={summit.cy} r={summit.r} fill={blaze} />
    </svg>
  )
}

// The letters "TRI", drawn as outlines from Barlow Condensed ExtraBold so the wordmark never
// depends on a font loading. With the mark in front of them they read as OTRI.
export function Wordmark({ className = '' }) {
  const [width, height] = identity.wordmark.box
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} height={height} width={width} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={identity.wordmark.path} />
    </svg>
  )
}

/** The lockup used in every header and footer: mark, wordmark, and the full name beside them. */
export default function Logo({ dark = false, compact = false, href = '#top' }) {
  return (
    <a href={href} className={`logo ${dark ? 'logo--dark' : ''} ${compact ? 'logo--compact' : ''}`} aria-label="OTRI home">
      <Mark className="logo__mark" />
      <Wordmark className="logo__word" />
      <span className="logo__name" aria-hidden="true">
        Open Trail
        <br />
        Running Index
      </span>
    </a>
  )
}
