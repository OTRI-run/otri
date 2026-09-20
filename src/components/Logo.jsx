import identity from '../brand/identity.json'

/**
 * The OTRI mark: a closed ring — the O — with a ridge inside it and a volt dot on the summit.
 * The ring and the ridge take the current text colour and the summit is always volt, so one
 * drawing works on the light reading surfaces and on the graphite chrome. It is a symbol, never
 * a letter: the wordmark beside it always spells the name in full.
 */
export function Mark({ size = 40, tone = 'brand', className = '', title }) {
  const { ring, ridge, ridgeWidth, summit } = identity.mark
  const summitFill = tone === 'mono' ? 'currentColor' : identity.colours.volt
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      <circle cx={ring.cx} cy={ring.cy} r={ring.r} stroke="currentColor" strokeWidth={ring.width} />
      <path d={ridge} stroke="currentColor" strokeWidth={ridgeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={summit.cx} cy={summit.cy} r={summit.r} fill={summitFill} />
    </svg>
  )
}

/** OTRI, all four letters, as outlines from Space Grotesk Bold: it never waits for a font. */
export function Wordmark({ className = '' }) {
  const [width, height] = identity.wordmark.box
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={identity.wordmark.path} />
    </svg>
  )
}

/** The lockup in every header and footer: mark, the name in full, then what the name stands for. */
export default function Logo({ dark = false, onLight = false, compact = false, href = '#top' }) {
  return (
    <a href={href} className={`logo ${dark ? 'logo--dark' : ''} ${onLight ? 'logo--on-light' : ''} ${compact ? 'logo--compact' : ''}`} aria-label="OTRI home">
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
