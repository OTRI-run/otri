import './Media.css'
import { useState } from 'preact/compat'
import { Check, Copy, Download, Mail } from '../src/ui/icons'
import { Mark } from '../src/components/Logo'
import identity from '../src/brand/identity.json'

// Media and brand: the logo as files, and what may be done with them. For a journalist, a race
// that wants to say its results were scored here, an app that uses the API. The files are built by
// scripts/build_brand_kit.py (letters as outlines, so they need no font) and live in public/brand.

const BRAND = new URL('../brand/', window.location.href.split('#')[0]).href
const file = (name) => `${BRAND}${name}`
const KIT_SIZE = '0.5 MB'

// Every logo card: what to show, on which ground, and the files behind it as [label, name].
// Grounds are drawn by Media.css: light is paper, dark is night, colour is moss.
const LOGOS = [
  { title: 'Logo', note: 'The first choice, on paper and other light backgrounds.', preview: 'otri-logo.svg', ground: 'light', width: 300, files: [['SVG', 'otri-logo.svg'], ['PNG', 'otri-logo-1600.png']] },
  { title: 'Logo for dark backgrounds', note: 'Letters and rings in paper; the trail keeps its orange.', preview: 'otri-logo-on-dark.svg', ground: 'dark', width: 300, files: [['SVG', 'otri-logo-on-dark.svg'], ['PNG', 'otri-logo-on-dark-1600.png']] },
  { title: 'Logo, white', note: 'One colour, on moss, on any colour, on photographs.', preview: 'otri-logo-white.svg', ground: 'colour', width: 300, files: [['SVG', 'otri-logo-white.svg'], ['PNG', 'otri-logo-white-1600.png']] },
  { title: 'Logo, one colour', note: 'Where only one ink prints: a bib, a stamp, a fax.', preview: 'otri-logo-black.svg', ground: 'light', width: 300, files: [['SVG', 'otri-logo-black.svg']] },
  { title: 'Compact', note: 'The mark and the wordmark without the full name, where space is tight.', preview: 'otri-logo-compact.svg', ground: 'light', width: 150, files: [['SVG', 'otri-logo-compact.svg'], ['PNG', 'otri-logo-compact-1200.png'], ['On dark, SVG', 'otri-logo-compact-on-dark.svg'], ['Black, SVG', 'otri-logo-compact-black.svg']] },
  { title: 'Compact, white', note: 'The same, on dark or colour.', preview: 'otri-logo-compact-white.svg', ground: 'dark', width: 150, files: [['SVG', 'otri-logo-compact-white.svg'], ['PNG', 'otri-logo-compact-white-1200.png']] },
  { title: 'Mark', note: 'Alone only where OTRI is already named: an icon, a small size.', preview: 'otri-mark.svg', ground: 'checker', width: 84, files: [['SVG', 'otri-mark.svg'], ['PNG 1024', 'otri-mark-1024.png'], ['PNG 512', 'otri-mark-512.png'], ['On dark, SVG', 'otri-mark-on-dark.svg'], ['White, SVG', 'otri-mark-white.svg'], ['White, PNG', 'otri-mark-white-1024.png'], ['Black, SVG', 'otri-mark-black.svg']] },
  { title: 'Profile picture', note: 'A square that survives being cut to a circle.', preview: 'otri-avatar-1024.png', ground: 'dark', width: 96, round: true, files: [['PNG', 'otri-avatar-1024.png'], ['PNG, light', 'otri-avatar-light-1024.png']] },
]

// The palette, read from the same file the logo is drawn from. `on` names the ink that reads on it.
const C = identity.colours
const COLOURS = [
  { name: 'Pine', hex: C.pine, token: '--pine', use: 'Text and dark surfaces', on: 'paper' },
  { name: 'Paper', hex: C.paper, token: '--paper', use: 'The page', on: 'pine', border: true },
  { name: 'Blaze', hex: C.blaze, token: '--blaze', use: 'The trail marker: the one thing to press', on: 'pine' },
  { name: 'Moss', hex: C.moss, token: '--moss', use: 'The brand green', on: 'paper' },
  { name: 'Fern', hex: C.fern, token: '--fern', use: 'The accent on dark surfaces', on: 'pine' },
  { name: 'Night', hex: C.night, token: '--night', use: 'The darkest surface', on: 'paper' },
]

// The smallest the logo may be shown, from the kit's README: [file, width in px, caption].
const SIZES = [
  ['otri-logo.svg', 160, '160 px · 40 mm'],
  ['otri-logo-compact.svg', 64, '64 px · 16 mm'],
  ['otri-mark.svg', 20, '20 px · 5 mm'],
]

const BOILERPLATE =
  'OTRI, the Open Trail Running Index, turns a finish time on any trail course into one comparable score. The course is measured from its GPX track, climbing and descending are weighed for how steep they are, and the result is a number that means the same on a flat 10K and a mountain 100-miler. The method, the code and every constant are open source: anyone can recompute a score. OTRI is free for organizers and runners, needs no membership, and approves or certifies nothing; it measures. otri.run'

const BADGE_HTML = `<a href="https://otri.run" title="Scored with OTRI, the Open Trail Running Index">
  <img src="${file('otri-badge-scored.svg')}" alt="Scored with OTRI" height="32">
</a>`

function useCopy() {
  const [copied, setCopied] = useState(null)
  const copy = (key, text) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      window.setTimeout(() => setCopied((now) => (now === key ? null : now)), 1600)
    })
  return [copied, copy]
}

function FileLink({ href, children }) {
  return (
    <a href={href} download className="btn btn--secondary btn--sm">
      <Download size={14} /> {children}
    </a>
  )
}

function LogoCard({ logo }) {
  return (
    <figure className="card card--flush media-logo">
      <div className={`media-logo__ground media-ground--${logo.ground}`}>
        <img src={file(logo.preview)} alt={`OTRI: ${logo.title.toLowerCase()}`} style={{ width: logo.width }} className={logo.round ? 'media-logo__round' : ''} loading="lazy" />
      </div>
      <figcaption className="media-logo__caption">
        <div>
          <p className="h-4">{logo.title}</p>
          <p className="small muted mt-1">{logo.note}</p>
        </div>
        <div className="cluster cluster--tight media-logo__files">
          {logo.files.map(([label, name]) => (
            <FileLink key={name} href={file(name)}>{label}</FileLink>
          ))}
        </div>
      </figcaption>
    </figure>
  )
}

// Wrong uses, shown and not only told: the same logo, mistreated in CSS.
const DONT = [
  { label: 'Do not stretch or squeeze it', style: { transform: 'scaleX(1.5)' } },
  { label: 'Do not recolour it', style: { filter: 'hue-rotate(140deg) saturate(1.6)' } },
  { label: 'Do not tilt it or add effects', style: { transform: 'rotate(-9deg)', filter: 'drop-shadow(3px 4px 2px rgba(0,0,0,.45))' } },
  { label: 'Do not put it on a busy or low-contrast ground', ground: 'repeating-linear-gradient(45deg, var(--blaze) 0 9px, var(--fern) 9px 18px)' },
]

function CopyButton({ active, onClick }) {
  return (
    <button type="button" onClick={onClick} className="btn btn--ghost btn--sm">
      {active ? <Check size={14} /> : <Copy size={14} />} {active ? 'copied' : 'copy'}
    </button>
  )
}

export default function Media() {
  const [copied, copy] = useCopy()
  return (
    <>
      <section className="section section--tight section--line-bottom topo">
        <div className="wrap">
          <div className="page-head">
            <p className="eyebrow">
              Open Trail Running Index <span className="sep">·</span> Media and brand
            </p>
            <h1 className="display-2">
              Our logo,
              <br />
              <em className="accent">yours to use.</em>
            </h1>
            <p className="lead">
              Writing about OTRI, showing that your race was scored with it, or building on the API? Take the logo. You do not need to ask, only to use it as it is and not to suggest that OTRI approves anything: it measures, it does not certify.
            </p>
            <div className="cluster">
              <a href={file('otri-brand-kit.zip')} download className="btn btn--primary">
                <Download size={16} /> Download the whole kit <span className="media-kit__meta">SVG + PNG · ZIP · {KIT_SIZE}</span>
              </a>
              <a href="mailto:hello@otri.run?subject=Press" className="btn btn--ghost">
                <Mail size={16} /> Press: hello@otri.run
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap section">
        <section aria-labelledby="media-logos" className="media-block">
          <p className="eyebrow">01 · Logos</p>
          <h2 id="media-logos" className="h-1 mt-2">Pick the one for your background.</h2>
          <p className="muted measure mt-3">
            SVG for the web and print (the letters are drawn as outlines, so the files need no font and stay sharp at any size), PNG with a transparent background for everything that takes no SVG: slides, documents, social posts. Use the colour logo on paper-light backgrounds, the on-dark one on dark backgrounds and photographs, the white one on colour, the black one where only one ink prints. The link preview image is in the kit too: <a href={file('otri-share-card.svg')} download className="link">otri-share-card.svg</a>.
          </p>
          <div className="grid grid--4 mt-6">
            {LOGOS.map((logo) => (
              <LogoCard key={logo.title} logo={logo} />
            ))}
          </div>
        </section>

        <section aria-labelledby="media-mark" className="media-block grid grid--aside">
          <div>
            <p className="eyebrow">02 · The mark</p>
            <h2 id="media-mark" className="h-1 mt-2">Three contour lines, one trail, the summit.</h2>
            <p className="muted measure mt-3">
              The mark is a summit drawn the way a map draws it: three contour rings around the top. Each ring is opened where a trail climbs through it, the dashed orange line of a footpath on that same map, up to the point at the centre. Read as a letter, it is the O of OTRI; the wordmark that follows it supplies the rest. The rings take the colour of the text around them, paper on dark and pine on light, and the trail is always the blaze orange.
            </p>
          </div>
          <div className="grid grid--2 grid--2-sm grid--tight">
            <div className="media-mark media-ground--light"><Mark size={140} /></div>
            <div className="media-mark media-ground--dark on-dark"><Mark size={140} /></div>
          </div>
        </section>

        <section aria-labelledby="media-badge" className="media-block grid grid--aside">
          <div>
            <p className="eyebrow">03 · For races</p>
            <h2 id="media-badge" className="h-1 mt-2">Scored with OTRI.</h2>
            <p className="muted measure mt-3">
              A badge for your results page, next to results you scored here. It says what happened, which is all OTRI can say about a race: there is no “OTRI certified” and no “OTRI approved”, because OTRI approves no races. Link it to your race on otri.run if you published it, so runners can see how every score came about.
            </p>
            <div className="cluster mt-5">
              <span className="media-badge media-ground--light">
                <img src={file('otri-badge-scored.svg')} alt="Scored with OTRI" height="32" />
              </span>
              <span className="media-badge media-ground--dark">
                <img src={file('otri-badge-scored-dark.svg')} alt="Scored with OTRI, dark" height="32" />
              </span>
            </div>
            <div className="cluster cluster--tight mt-4">
              <FileLink href={file('otri-badge-scored.svg')}>Light, SVG</FileLink>
              <FileLink href={file('otri-badge-scored-dark.svg')}>Dark, SVG</FileLink>
            </div>
          </div>
          <div className="media-code">
            <div className="media-code__bar">
              <span className="eyebrow eyebrow--plain eyebrow--sm">HTML for your results page</span>
              <CopyButton active={copied === 'badge'} onClick={() => copy('badge', BADGE_HTML)} />
            </div>
            <pre className="code-block"><code>{BADGE_HTML}</code></pre>
          </div>
        </section>

        <section aria-labelledby="media-space" className="media-block">
          <p className="eyebrow">04 · Space and size</p>
          <h2 id="media-space" className="h-1 mt-2">Give it room. Keep it readable.</h2>
          <div className="grid grid--2 mt-6">
            <div className="card">
              <div className="media-space">
                {/* Half the mark's height on every side: drawn, so nobody has to measure. */}
                <div className="media-space__pad">
                  <div className="media-space__logo">
                    <img src={file('otri-logo.svg')} alt="" />
                  </div>
                  <span className="media-space__note media-space__note--top">½ mark</span>
                  <span className="media-space__note media-space__note--left">½</span>
                </div>
              </div>
              <p className="h-4 mt-3">Clear space</p>
              <p className="small muted mt-1">Keep at least half the height of the mark free on every side: no text, no other logo, no edge of the page. The files already carry a little of it.</p>
            </div>
            <div className="card">
              <div className="media-sizes">
                {SIZES.map(([name, width, caption]) => (
                  <div key={name} className="center">
                    <img src={file(name)} alt="" style={{ width }} className="mx-auto" />
                    <p className="tiny muted mono mt-2">{caption}</p>
                  </div>
                ))}
              </div>
              <p className="h-4 mt-3">Smallest sizes</p>
              <p className="small muted mt-1">Do not show the logo with the full name narrower than 160 px, or the mark smaller than 20 px. Below that the letters stop being readable: switch to the compact logo, then to the mark, instead of shrinking further.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-dont" className="media-block">
          <p className="eyebrow">05 · Please do not</p>
          <h2 id="media-dont" className="h-1 mt-2">Use it as it is.</h2>
          <div className="grid grid--4 mt-6">
            {DONT.map((item) => (
              <div key={item.label} className="card card--flush">
                <div className="media-dont__ground media-ground--light" style={item.ground ? { background: item.ground } : undefined}>
                  <img src={file(item.ground ? 'otri-logo-compact-white.svg' : 'otri-logo-compact.svg')} alt="" style={{ width: 120, ...item.style }} />
                  <span className="media-dont__cross" aria-hidden="true">×</span>
                </div>
                <p className="media-dont__label small">{item.label}</p>
              </div>
            ))}
          </div>
          <ul className="media-dont__list small muted mt-6">
            <li>Do not suggest that OTRI approves, certifies, sanctions or sponsors a race, a product or a runner.</li>
            <li>Do not make it part of your own logo, app icon or product name.</li>
            <li>Do not redraw it, recolour it, or set the wordmark in another typeface.</li>
            <li>Do not show it larger than your own name on your own material.</li>
          </ul>
        </section>

        <section aria-labelledby="media-colour" className="media-block">
          <p className="eyebrow">06 · Colour and letters</p>
          <h2 id="media-colour" className="h-1 mt-2">A day on a trail, drawn like a map.</h2>
          <p className="muted measure mt-3">
            Chalk paper for the ground, pine ink for the words, moss for the brand, and the blaze orange of a painted trail marker for the one thing to press. Each swatch copies its value; the names are the tokens the site itself uses.
          </p>
          <div className="media-swatches mt-6">
            {COLOURS.map((colour) => (
              <button
                key={colour.hex}
                type="button"
                onClick={() => copy(colour.hex, colour.hex)}
                title={`Copy ${colour.hex}`}
                className={`media-swatch media-swatch--on-${colour.on} ${colour.border ? 'media-swatch--line' : ''}`}
                style={{ background: colour.hex }}
              >
                <span className="media-swatch__name">
                  {colour.name} {copied === colour.hex ? <Check size={14} /> : <Copy size={13} />}
                </span>
                <span>
                  <span className="media-swatch__hex">{copied === colour.hex ? 'copied' : colour.hex}</span>
                  <span className="media-swatch__token">var({colour.token})</span>
                  <span className="media-swatch__use">{colour.use}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid--3 mt-5">
            <div className="card">
              <p className="media-type media-type--display">OTRI 1000</p>
              <p className="h-4 mt-4">Barlow Condensed ExtraBold</p>
              <p className="small muted mt-1">The wordmark and every heading on the site. In the logo files the letters are drawn as outlines, so nothing needs the font installed.</p>
            </div>
            <div className="card">
              <p className="media-type media-type--mono">04:12:37</p>
              <p className="h-4 mt-4">JetBrains Mono</p>
              <p className="small muted mt-1">The full name under the wordmark, set bold, and every measurement on the site: times, distances, scores.</p>
            </div>
            <div className="card">
              <p className="media-type media-type--body">Course + time = score.</p>
              <p className="h-4 mt-4">Barlow</p>
              <p className="small muted mt-1">The text face. All three are self-hosted and under the SIL Open Font License, so anything written about OTRI can be set in them.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-words" className="media-block grid grid--aside">
          <div>
            <p className="eyebrow">07 · In words</p>
            <h2 id="media-words" className="h-1 mt-2">How to write about OTRI.</h2>
            <dl className="stack mt-4">
              <div>
                <dt className="h-4">The name</dt>
                <dd className="small muted mt-1">OTRI, in capitals. In full: Open Trail Running Index. Not “the OTRI index”: the I already is the index.</dd>
              </div>
              <div>
                <dt className="h-4">The number</dt>
                <dd className="small muted mt-1">An OTRI score: “she ran an OTRI score of 742”. Runners have an OTRI index, built from their scores.</dd>
              </div>
              <div>
                <dt className="h-4">What it is not</dt>
                <dd className="small muted mt-1">Not a federation, a ranking body or a label for races. A race is “scored with OTRI”, never “OTRI certified”.</dd>
              </div>
            </dl>
          </div>
          <div className="card">
            <div className="cluster cluster--between">
              <p className="eyebrow eyebrow--plain eyebrow--sm">ABOUT OTRI · FREE TO QUOTE</p>
              <CopyButton active={copied === 'about'} onClick={() => copy('about', BOILERPLATE)} />
            </div>
            <p className="small mt-3">{BOILERPLATE}</p>
          </div>
        </section>

        <p className="media-foot small muted">
          OTRI’s code and methodology are open source. The name and the logo are not part of that licence: they say that something comes from, or was scored with, this project. Another format, a question, an interview:{' '}
          <a href="mailto:hello@otri.run" className="link">hello@otri.run</a>.
        </p>
      </div>
    </>
  )
}
