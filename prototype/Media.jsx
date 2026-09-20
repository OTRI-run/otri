import './Media.css'
import { useState } from 'react'
import { Check, Copy, Download, Mail } from 'lucide-react'

// Media and brand: the logo as files, and what may be done with them. For a journalist, a race
// that wants to say its results were scored here, an app that uses the API. The files are built by
// scripts/build_brand_kit.py (letters as outlines, so they need no font) and live in public/brand.

const CONTAINER = "prototype-media-container-style-1"
const BRAND = new URL('../brand/', window.location.href.split('#')[0]).href
const file = (name) => `${BRAND}${name}`

const LABEL = "prototype-media-label-style-2"
const H2 = "prototype-media-h2-style-3"

// The chequered ground says "transparent" without a word, as every design tool does.
const CHECKER = {
  backgroundColor: '#fff',
  backgroundImage: 'linear-gradient(45deg,#eef2f7 25%,transparent 25%,transparent 75%,#eef2f7 75%),linear-gradient(45deg,#eef2f7 25%,transparent 25%,transparent 75%,#eef2f7 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,8px 8px',
}

const LOGOS = [
  { title: 'Logo', note: 'The first choice, on white and very light backgrounds.', svg: 'otri-logo.svg', png: 'otri-logo-1600.png', ground: 'light', width: 300 },
  { title: 'Logo for dark backgrounds', note: 'Colour kept, letters in white.', svg: 'otri-logo-on-dark.svg', png: 'otri-logo-on-dark-1600.png', ground: 'dark', width: 300 },
  { title: 'Logo, white', note: 'On colour and on photographs.', svg: 'otri-logo-white.svg', png: 'otri-logo-white-1600.png', ground: 'blue', width: 300 },
  { title: 'Logo, one colour', note: 'Where only one ink prints: a bib, a stamp, a fax.', svg: 'otri-logo-black.svg', ground: 'light', width: 300 },
  { title: 'Compact', note: 'Without the full name, where space is tight.', svg: 'otri-logo-compact.svg', png: 'otri-logo-compact-1200.png', ground: 'light', width: 150 },
  { title: 'Compact, white', note: 'The same, on dark or colour.', svg: 'otri-logo-compact-white.svg', png: 'otri-logo-compact-white-1200.png', ground: 'dark', width: 150 },
  { title: 'Mark', note: 'Alone only where OTRI is already named: an icon, a small size.', svg: 'otri-mark.svg', png: 'otri-mark-1024.png', ground: 'checker', width: 84 },
  { title: 'Profile picture', note: 'A square that survives being cut to a circle.', png: 'otri-avatar-1024.png', alt: 'otri-avatar-light-1024.png', ground: 'dark', width: 96, round: true },
]

const GROUNDS = { light: { background: '#fff' }, dark: { background: '#0b1220' }, blue: { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }, checker: CHECKER }

const COLOURS = [
  { name: 'Blue', hex: '#2563eb', use: 'The mark, links, every call to action', text: '#fff' },
  { name: 'Deep blue', hex: '#1d4ed8', use: 'Where the gradient of the mark ends', text: '#fff' },
  { name: 'Sky', hex: '#60a5fa', use: 'Where it begins', text: '#0b1220' },
  { name: 'Cyan', hex: '#06b6d4', use: 'The full name, accents in charts', text: '#0b1220' },
  { name: 'Ink', hex: '#0b1220', use: 'Text, dark backgrounds', text: '#fff' },
  { name: 'Paper', hex: '#f7f9fc', use: 'Page backgrounds', text: '#0b1220', border: true },
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
    <a href={href} download className="prototype-media-file-link-a-4">
      <Download size={12} /> {children}
    </a>
  )
}

function LogoCard({ logo }) {
  return (
    <figure className="prototype-media-logo-card-figure-5">
      <div className="prototype-media-logo-card-div-6" style={GROUNDS[logo.ground]}>
        <img src={file(logo.svg ?? logo.png)} alt={`OTRI: ${logo.title.toLowerCase()}`} style={{ width: logo.width, maxWidth: '100%' }} className={logo.round ? "prototype-media-logo-card-img-7" : ''} loading="lazy" />
      </div>
      <figcaption className="prototype-media-logo-card-figcaption-8">
        <div>
          <p className="prototype-media-logo-card-p-9">{logo.title}</p>
          <p className="prototype-media-logo-card-p-10">{logo.note}</p>
        </div>
        <div className="prototype-media-logo-card-div-11">
          {logo.svg && <FileLink href={file(logo.svg)}>SVG</FileLink>}
          {logo.png && <FileLink href={file(logo.png)}>PNG</FileLink>}
          {logo.alt && <FileLink href={file(logo.alt)}>PNG, light</FileLink>}
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
  { label: 'Do not put it on a busy or low-contrast ground', ground: 'repeating-linear-gradient(45deg,#2563eb 0 9px,#60a5fa 9px 18px)' },
]

export default function Media() {
  const [copied, copy] = useCopy()
  return (
    <>
      <section className="prototype-media-media-section-12">
        <div className={`${CONTAINER} prototype-media-media-div-13`}>
          <div className={LABEL}>
            OPEN TRAIL RUNNING INDEX <span className="prototype-media-media-span-14">·</span> MEDIA AND BRAND
          </div>
          <h1 className="prototype-media-media-h1-15">
            Our logo,
            <br />
            <em className="prototype-media-media-em-16">yours to use.</em>
          </h1>
          <p className="prototype-media-media-p-17">
            Writing about OTRI, showing that your race was scored with it, or building on the API? Take the logo. You do not need to ask, only to use it as it is and not to suggest that OTRI approves anything: it measures, it does not certify.
          </p>
          <div className="prototype-media-media-div-18">
            <a href={file('otri-brand-kit.zip')} download className="prototype-media-media-a-19">
              <Download size={16} /> Download the whole kit <span className="prototype-media-media-span-20">ZIP · 0.7 MB</span>
            </a>
            <a href="mailto:hello@otri.run?subject=Press" className="prototype-media-media-a-21">
              <Mail size={16} /> Press: hello@otri.run
            </a>
          </div>
        </div>
      </section>

      <div className={`${CONTAINER} prototype-media-media-div-22`}>
        <section aria-labelledby="media-logos">
          <p className={LABEL}>01 · LOGOS</p>
          <h2 id="media-logos" className={`${H2} prototype-media-media-h2-23`}>Pick the one for your background.</h2>
          <p className="prototype-media-media-p-24">
            SVG for the web and for print (it stays sharp at any size and needs no font), PNG with a transparent background for everything that takes no SVG: slides, documents, social posts.
          </p>
          <div className="prototype-media-media-div-25">
            {LOGOS.map((logo) => (
              <LogoCard key={logo.title} logo={logo} />
            ))}
          </div>
        </section>

        <section aria-labelledby="media-badge" className="prototype-media-media-section-26">
          <div>
            <p className={LABEL}>02 · FOR RACES</p>
            <h2 id="media-badge" className={`${H2} prototype-media-media-h2-23`}>Scored with OTRI.</h2>
            <p className="prototype-media-media-p-27">
              A badge for your results page, next to results you scored here. It says what happened, which is all OTRI can say about a race: there is no “OTRI certified” and no “OTRI approved”, because OTRI approves no races. Link it to your race on otri.run if you published it, so runners can see how every score came about.
            </p>
            <div className="prototype-media-media-div-28">
              <span className="prototype-media-media-span-29">
                <img src={file('otri-badge-scored.svg')} alt="Scored with OTRI" height="32" style={{ height: 32 }} />
              </span>
              <span className="prototype-media-media-span-30">
                <img src={file('otri-badge-scored-dark.svg')} alt="Scored with OTRI, dark" height="32" style={{ height: 32 }} />
              </span>
            </div>
            <div className="prototype-media-media-div-31">
              <FileLink href={file('otri-badge-scored.svg')}>Light, SVG</FileLink>
              <FileLink href={file('otri-badge-scored-dark.svg')}>Dark, SVG</FileLink>
            </div>
          </div>
          <div className="prototype-media-media-div-32">
            <div className="prototype-media-media-div-33">
              <span className="prototype-media-media-span-34">HTML for your results page</span>
              <button type="button" onClick={() => copy('badge', BADGE_HTML)} className="prototype-media-media-button-35">
                {copied === 'badge' ? <Check size={12} /> : <Copy size={12} />} {copied === 'badge' ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="prototype-media-media-pre-36"><code>{BADGE_HTML}</code></pre>
          </div>
        </section>

        <section aria-labelledby="media-space" className="prototype-media-media-section-37">
          <p className={LABEL}>03 · SPACE AND SIZE</p>
          <h2 id="media-space" className={`${H2} prototype-media-media-h2-23`}>Give it room. Keep it readable.</h2>
          <div className="prototype-media-media-div-38">
            <div className="prototype-media-media-div-39">
              <div className="prototype-media-media-div-40">
                {/* Half the mark's height on every side: drawn, so nobody has to measure. */}
                <div className="prototype-media-media-div-41" style={{ background: 'repeating-linear-gradient(45deg,rgba(37,99,235,.07) 0 6px,transparent 6px 12px)' }}>
                  <div className="prototype-media-media-div-42">
                    <img src={file('otri-logo.svg')} alt="" style={{ height: 52, display: 'block' }} />
                  </div>
                  <span className="prototype-media-media-span-43">½ mark</span>
                  <span className="prototype-media-media-span-44">½</span>
                </div>
              </div>
              <p className="prototype-media-media-p-45">Clear space</p>
              <p className="prototype-media-media-p-46">Keep at least half the height of the mark free on every side: no text, no other logo, no edge of the page. The files already carry a little of it.</p>
            </div>
            <div className="prototype-media-media-div-39">
              <div className="prototype-media-media-div-47">
                <div className="prototype-media-media-div-48">
                  <img src={file('otri-logo.svg')} alt="" style={{ width: 120 }} className="prototype-media-media-img-49" />
                  <p className="prototype-media-media-p-50">120 px · 30 mm</p>
                </div>
                <div className="prototype-media-media-div-48">
                  <img src={file('otri-logo-compact.svg')} alt="" style={{ width: 64 }} className="prototype-media-media-img-49" />
                  <p className="prototype-media-media-p-50">64 px · 16 mm</p>
                </div>
                <div className="prototype-media-media-div-48">
                  <img src={file('otri-mark.svg')} alt="" style={{ width: 24 }} className="prototype-media-media-img-49" />
                  <p className="prototype-media-media-p-50">24 px · 6 mm</p>
                </div>
              </div>
              <p className="prototype-media-media-p-45">Smallest sizes</p>
              <p className="prototype-media-media-p-46">Below these the full name stops being readable: switch to the compact logo, then to the mark, instead of shrinking further.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-dont" className="prototype-media-media-section-37">
          <p className={LABEL}>04 · PLEASE DO NOT</p>
          <h2 id="media-dont" className={`${H2} prototype-media-media-h2-23`}>Use it as it is.</h2>
          <div className="prototype-media-media-div-25">
            {DONT.map((item) => (
              <div key={item.label} className="prototype-media-media-div-51">
                <div className="prototype-media-media-div-52" style={{ background: item.ground ?? '#fff' }}>
                  <img src={file(item.ground ? 'otri-logo-compact-white.svg' : 'otri-logo-compact.svg')} alt="" style={{ width: 120, ...item.style }} />
                  <span className="prototype-media-media-span-53" aria-hidden="true">×</span>
                </div>
                <p className="prototype-media-media-p-54">{item.label}</p>
              </div>
            ))}
          </div>
          <ul className="prototype-media-media-ul-55">
            <li>Do not suggest that OTRI approves, certifies, sanctions or sponsors a race, a product or a runner.</li>
            <li>Do not make it part of your own logo, app icon or product name.</li>
            <li>Do not redraw it or set the wordmark in another typeface.</li>
            <li>Do not show it larger than your own name on your own material.</li>
          </ul>
        </section>

        <section aria-labelledby="media-colour" className="prototype-media-media-section-37">
          <p className={LABEL}>05 · COLOUR AND TYPE</p>
          <h2 id="media-colour" className={`${H2} prototype-media-media-h2-23`}>Six colours, two typefaces.</h2>
          <div className="prototype-media-media-div-56">
            {COLOURS.map((colour) => (
              <button
                key={colour.hex}
                type="button"
                onClick={() => copy(colour.hex, colour.hex)}
                title={`Copy ${colour.hex}`}
                className={`prototype-media-media-button-57 otri-group ${colour.border ? "prototype-media-media-button-58" : ''}`}
                style={{ background: colour.hex, color: colour.text }}
              >
                <span className="prototype-media-media-span-59">
                  {colour.name} {copied === colour.hex ? <Check size={14} /> : <Copy size={13} className="prototype-media-media-copy-60" />}
                </span>
                <span>
                  <span className="prototype-media-media-span-61">{copied === colour.hex ? 'copied' : colour.hex}</span>
                  <span className="prototype-media-media-span-62">{colour.use}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="prototype-media-media-div-63">
            <div className="prototype-media-media-div-39">
              <p className="prototype-media-media-p-64" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>Aa 1000</p>
              <p className="prototype-media-media-p-65">Inter</p>
              <p className="prototype-media-media-p-46">Bold for the wordmark and headlines, regular for text. Open licence (SIL OFL). The site itself uses your device’s own sans-serif, which is its closest relative.</p>
            </div>
            <div className="prototype-media-media-div-39">
              <p className="prototype-media-media-p-66">04:12:37</p>
              <p className="prototype-media-media-p-65">JetBrains Mono</p>
              <p className="prototype-media-media-p-46">For the full name, for labels, and for every number that is a measurement: times, distances, scores. Open licence (SIL OFL).</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-words" className="prototype-media-media-section-67">
          <div>
            <p className={LABEL}>06 · IN WORDS</p>
            <h2 id="media-words" className={`${H2} prototype-media-media-h2-23`}>How to write about OTRI.</h2>
            <dl className="prototype-media-media-dl-68">
              <div>
                <dt className="prototype-media-media-dt-69">The name</dt>
                <dd>OTRI, in capitals. In full: Open Trail Running Index. Not “the OTRI index”: the I already is the index.</dd>
              </div>
              <div>
                <dt className="prototype-media-media-dt-69">The number</dt>
                <dd>An OTRI score: “she ran an OTRI score of 742”. Runners have an OTRI index, built from their scores.</dd>
              </div>
              <div>
                <dt className="prototype-media-media-dt-69">What it is not</dt>
                <dd>Not a federation, a ranking body or a label for races. A race is “scored with OTRI”, never “OTRI certified”.</dd>
              </div>
            </dl>
          </div>
          <div className="prototype-media-media-div-39">
            <div className="prototype-media-media-div-70">
              <p className="prototype-media-media-p-71">ABOUT OTRI · FREE TO QUOTE</p>
              <button type="button" onClick={() => copy('about', BOILERPLATE)} className="prototype-media-media-button-72">
                {copied === 'about' ? <Check size={12} /> : <Copy size={12} />} {copied === 'about' ? 'copied' : 'copy'}
              </button>
            </div>
            <p className="prototype-media-media-p-73">{BOILERPLATE}</p>
          </div>
        </section>

        <p className="prototype-media-media-p-74">
          OTRI’s code and methodology are open source. The name and the logo are not part of that licence: they say that something comes from, or was scored with, this project. Another format, a question, an interview:{' '}
          <a href="mailto:hello@otri.run" className="prototype-media-media-a-75">hello@otri.run</a>.
        </p>
      </div>
    </>
  )
}
