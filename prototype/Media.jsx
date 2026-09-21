import { useState } from 'react'
import { Check, Copy, Download, Mail } from 'lucide-react'

// Media and brand: the logo as files, and what may be done with them. For a journalist, a race
// that wants to say its results were scored here, an app that uses the API. The files are built by
// scripts/build_brand_kit.py (letters as outlines, so they need no font) and live in public/brand.

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'
const BRAND = new URL('../brand/', window.location.href.split('#')[0]).href
const file = (name) => `${BRAND}${name}`

const LABEL = 'font-mono text-[10px] font-medium tracking-[.1em] text-blue-600'
const H2 = 'text-[clamp(22px,3vw,30px)] font-bold tracking-[-.04em] text-[#0b1220]'

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
  { title: 'Icon', note: 'The summit and the arrow alone, for an avatar or an app tile, where OTRI is already named.', svg: 'otri-mark.svg', png: 'otri-mark-1024.png', ground: 'checker', width: 84 },
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
    <a href={href} download className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-[11px] font-semibold text-[#0b1220] no-underline hover:border-blue-400 hover:text-blue-700">
      <Download size={12} /> {children}
    </a>
  )
}

function LogoCard({ logo }) {
  return (
    <figure className="m-0 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex h-[150px] items-center justify-center px-6" style={GROUNDS[logo.ground]}>
        <img src={file(logo.svg ?? logo.png)} alt={`OTRI: ${logo.title.toLowerCase()}`} style={{ width: logo.width, maxWidth: '100%' }} className={logo.round ? 'rounded-full' : ''} loading="lazy" />
      </div>
      <figcaption className="flex flex-1 flex-col gap-3 border-t border-slate-200 p-4">
        <div>
          <p className="text-sm font-semibold text-[#0b1220]">{logo.title}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{logo.note}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
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
      <section className="border-b border-slate-200 bg-white">
        <div className={`${CONTAINER} py-12 sm:py-14`}>
          <div className={LABEL}>
            Media and brand
          </div>
          <h1 className="mt-5 max-w-[760px] text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-.06em] text-[#0b1220]">
            Our logo,
            <br />
            <em className="not-italic text-blue-700">yours to use.</em>
          </h1>
          <p className="mt-5 max-w-[680px] text-base leading-7 text-slate-600">
            Writing about OTRI, showing that your race was scored with it, or building on the API? Take the logo. You do not need to ask, only to use it as it is and not to suggest that OTRI approves anything: it measures, it does not certify.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={file('otri-brand-kit.zip')} download className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white no-underline shadow-[0_8px_24px_rgba(37,99,235,.28)] hover:bg-blue-700">
              <Download size={16} /> Download the whole kit <span className="font-mono text-[11px] font-medium text-blue-100">ZIP · 0.7 MB</span>
            </a>
            <a href="mailto:hello@otri.run?subject=Press" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-[#0b1220] no-underline hover:border-blue-300">
              <Mail size={16} /> Press: hello@otri.run
            </a>
          </div>
        </div>
      </section>

      <div className={`${CONTAINER} py-12`}>
        <section aria-labelledby="media-logos">
          <p className={LABEL}>01 · LOGOS</p>
          <h2 id="media-logos" className={`${H2} mt-2`}>Pick the one for your background.</h2>
          <p className="mt-2 max-w-[680px] text-sm leading-7 text-slate-600">
            The letters are drawn as outlines, so an SVG needs no font and stays sharp at any size. PNG with a transparent background is there for anything that takes no SVG: slides, documents, social posts.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LOGOS.map((logo) => (
              <LogoCard key={logo.title} logo={logo} />
            ))}
          </div>
        </section>

        <section aria-labelledby="media-badge" className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <p className={LABEL}>02 · FOR RACES</p>
            <h2 id="media-badge" className={`${H2} mt-2`}>Scored with OTRI.</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              A badge for your results page, next to results you scored here. It says what happened, which is all OTRI can say about a race: there is no “OTRI certified” and no “OTRI approved”, because OTRI approves no races. Link it to your race on otri.run if you published it, so runners can see how every score came about.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <span className="inline-flex rounded-xl border border-slate-200 bg-white p-4">
                <img src={file('otri-badge-scored.svg')} alt="Scored with OTRI" height="32" style={{ height: 32 }} />
              </span>
              <span className="inline-flex rounded-xl bg-slate-700 p-4">
                <img src={file('otri-badge-scored-dark.svg')} alt="Scored with OTRI, dark" height="32" style={{ height: 32 }} />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <FileLink href={file('otri-badge-scored.svg')}>Light, SVG</FileLink>
              <FileLink href={file('otri-badge-scored-dark.svg')}>Dark, SVG</FileLink>
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220]">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <span className="font-mono text-[9px] uppercase tracking-[.08em] text-slate-400">HTML for your results page</span>
              <button type="button" onClick={() => copy('badge', BADGE_HTML)} className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-300 hover:text-white">
                {copied === 'badge' ? <Check size={12} /> : <Copy size={12} />} {copied === 'badge' ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-5 text-slate-100"><code>{BADGE_HTML}</code></pre>
          </div>
        </section>

        <section aria-labelledby="media-space" className="mt-16">
          <p className={LABEL}>03 · SPACE AND SIZE</p>
          <h2 id="media-space" className={`${H2} mt-2`}>Give it room. Keep it readable.</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex justify-center py-4">
                {/* Half the mark's height on every side: drawn, so nobody has to measure. */}
                <div className="relative inline-block p-[26px] outline-dashed outline-1 outline-blue-300" style={{ background: 'repeating-linear-gradient(45deg,rgba(37,99,235,.07) 0 6px,transparent 6px 12px)' }}>
                  <div className="bg-white">
                    <img src={file('otri-logo.svg')} alt="" style={{ height: 52, display: 'block' }} />
                  </div>
                  <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-[9px] text-blue-600">½ mark</span>
                  <span className="absolute left-0.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-blue-600">½</span>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-[#0b1220]">Clear space</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">Keep at least half the height of the mark free on every side: no text, no other logo, no edge of the page. The files already carry a little of it.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-end justify-center gap-10 py-4">
                <div className="text-center">
                  <img src={file('otri-logo.svg')} alt="" style={{ width: 120 }} className="mx-auto block" />
                  <p className="mt-2 font-mono text-[10px] text-slate-500">120 px · 30 mm</p>
                </div>
                <div className="text-center">
                  <img src={file('otri-logo-compact.svg')} alt="" style={{ width: 64 }} className="mx-auto block" />
                  <p className="mt-2 font-mono text-[10px] text-slate-500">64 px · 16 mm</p>
                </div>
                <div className="text-center">
                  <img src={file('otri-mark.svg')} alt="" style={{ width: 24 }} className="mx-auto block" />
                  <p className="mt-2 font-mono text-[10px] text-slate-500">24 px · 6 mm</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-[#0b1220]">Smallest sizes</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">Below these the full name stops being readable: switch to the compact logo, then to the mark, instead of shrinking further.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-dont" className="mt-16">
          <p className={LABEL}>04 · PLEASE DO NOT</p>
          <h2 id="media-dont" className={`${H2} mt-2`}>Use it as it is.</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DONT.map((item) => (
              <div key={item.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="relative flex h-[120px] items-center justify-center overflow-hidden" style={{ background: item.ground ?? '#fff' }}>
                  <img src={file(item.ground ? 'otri-logo-compact-white.svg' : 'otri-logo-compact.svg')} alt="" style={{ width: 120, ...item.style }} />
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold leading-none text-white" aria-hidden="true">×</span>
                </div>
                <p className="border-t border-slate-200 p-3 text-[13px] leading-5 text-slate-700">{item.label}</p>
              </div>
            ))}
          </div>
          <ul className="mt-6 grid gap-x-10 gap-y-2 text-sm leading-7 text-slate-600 sm:grid-cols-2">
            <li>Do not suggest that OTRI approves, certifies, sanctions or sponsors a race, a product or a runner.</li>
            <li>Do not make it part of your own logo, app icon or product name.</li>
            <li>Do not redraw it or set the wordmark in another typeface.</li>
            <li>Do not show it larger than your own name on your own material.</li>
          </ul>
        </section>

        <section aria-labelledby="media-colour" className="mt-16">
          <p className={LABEL}>05 · COLOUR AND TYPE</p>
          <h2 id="media-colour" className={`${H2} mt-2`}>Six colours, two typefaces.</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {COLOURS.map((colour) => (
              <button
                key={colour.hex}
                type="button"
                onClick={() => copy(colour.hex, colour.hex)}
                title={`Copy ${colour.hex}`}
                className={`group flex min-h-[132px] flex-col justify-between rounded-2xl p-4 text-left transition hover:-translate-y-0.5 ${colour.border ? 'border border-slate-200' : ''}`}
                style={{ background: colour.hex, color: colour.text }}
              >
                <span className="flex items-center justify-between text-sm font-semibold">
                  {colour.name} {copied === colour.hex ? <Check size={14} /> : <Copy size={13} className="opacity-0 transition group-hover:opacity-70" />}
                </span>
                <span>
                  <span className="block font-mono text-[12px]">{copied === colour.hex ? 'copied' : colour.hex}</span>
                  <span className="mt-1 block text-[11px] leading-4 opacity-75">{colour.use}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-[44px] font-bold leading-none tracking-[-.05em] text-[#0b1220]" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>Aa 1000</p>
              <p className="mt-4 text-sm font-semibold text-[#0b1220]">Inter</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">Bold for the wordmark and headlines, regular for text. Open licence (SIL OFL). The site itself uses your device’s own sans-serif, which is its closest relative.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-[30px] font-bold leading-none tracking-[.06em] text-blue-600">04:12:37</p>
              <p className="mt-4 text-sm font-semibold text-[#0b1220]">JetBrains Mono</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">For the full name, for labels, and for every number that is a measurement: times, distances, scores. Open licence (SIL OFL).</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="media-words" className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className={LABEL}>06 · IN WORDS</p>
            <h2 id="media-words" className={`${H2} mt-2`}>How to write about OTRI.</h2>
            <dl className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <div>
                <dt className="font-semibold text-[#0b1220]">The name</dt>
                <dd>OTRI, in capitals. In full: Open Trail Running Index. Not “the OTRI index”: the I already is the index.</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#0b1220]">The number</dt>
                <dd>An OTRI score: “she ran an OTRI score of 742”. Runners have an OTRI index, built from their scores.</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#0b1220]">What it is not</dt>
                <dd>Not a federation, a ranking body or a label for races. A race is “scored with OTRI”, never “OTRI certified”.</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] font-medium tracking-[.08em] text-slate-500">ABOUT OTRI · FREE TO QUOTE</p>
              <button type="button" onClick={() => copy('about', BOILERPLATE)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#0b1220] hover:border-blue-400">
                {copied === 'about' ? <Check size={12} /> : <Copy size={12} />} {copied === 'about' ? 'copied' : 'copy'}
              </button>
            </div>
            <p className="mt-3 text-[15px] leading-7 text-slate-700">{BOILERPLATE}</p>
          </div>
        </section>

        <p className="mt-14 border-t border-slate-200 pt-6 text-[13px] leading-6 text-slate-500">
          OTRI’s code and methodology are open source. The name and the logo are not part of that licence: they say that something comes from, or was scored with, this project. Another format, a question, an interview:{' '}
          <a href="mailto:hello@otri.run" className="font-medium text-blue-600">hello@otri.run</a>.
        </p>
      </div>
    </>
  )
}
