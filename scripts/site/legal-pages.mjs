// The legal documents live as Markdown at the repository root. This Vite plugin publishes them
// as pages of the site, /privacy/, /terms/ and /data-policy/, so that the sign-up form, the
// footer and outside parties (Google's sign-in review among them) point at otri.run rather than
// at GitHub. The Markdown stays the single source: the page is rendered at build time, and in
// the dev and preview servers on every request.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

// The mark's geometry, the same file the site's Logo component draws from.
const GEOMETRY = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/brand/uphill.json'), 'utf8'))

export const LEGAL_PAGES = [
  { path: 'privacy', file: 'PRIVACY.md', title: 'Privacy policy' },
  { path: 'terms', file: 'TERMS.md', title: 'Terms of service' },
  { path: 'data-policy', file: 'DATA_POLICY.md', title: 'Data policy' },
]

const REPO = 'https://github.com/OTRI-run/otri/blob/main'

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f7f9fc;color:#17202c;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#3576f6}
header{background:#fff;border-bottom:1px solid #e2e8f0}
.bar{margin:0 auto;width:min(1120px,calc(100% - 32px));display:flex;align-items:center;justify-content:space-between;gap:16px;height:68px}
.logo{display:flex;align-items:center;gap:12px;min-width:0;flex-shrink:0;text-decoration:none;color:#17202c}
.logo svg{display:block;flex-shrink:0;max-width:100%;overflow:visible}
.logo .name{display:flex;flex-direction:column;justify-content:center;flex-shrink:0;border-left:1px solid #cbd5e1;padding-left:12px;font-size:13px;font-weight:600;line-height:1.12;letter-spacing:-.02em}
@media (min-width:640px){.logo .name{font-size:16px}}
nav{display:flex;gap:18px;font-size:13px;font-weight:600}
nav a{color:#475569;text-decoration:none}
nav a[aria-current]{color:#17202c}
nav a:hover{color:#17202c}
main{margin:0 auto;width:min(760px,calc(100% - 32px));padding:56px 0 80px}
.eyebrow{margin:0 0 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#64748b;text-transform:uppercase}
h1{margin:0 0 8px;font-size:clamp(34px,5vw,50px);font-weight:700;letter-spacing:-.05em;line-height:1}
.meta{margin:0 0 36px;font-size:13px;line-height:1.6;color:#64748b}
.doc{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:clamp(24px,4vw,44px);font-size:15px;line-height:1.7;color:#334155}
.doc h2{margin:36px 0 12px;font-size:20px;letter-spacing:-.02em;color:#17202c;font-weight:700}
.doc h2:first-child{margin-top:0}
.doc h3{margin:24px 0 8px;font-size:16px;color:#17202c}
.doc p{margin:0 0 14px}
.doc ul,.doc ol{margin:0 0 14px;padding-left:22px}
.doc li{margin:4px 0}
.doc li p{margin:0}
.doc strong{color:#17202c}
.doc code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.85em;background:#f1f5f9;border-radius:5px;padding:1px 5px;color:#334155;word-break:break-word}
.doc pre{overflow:auto;background:#f1f5f9;border-radius:10px;padding:14px 16px}
.doc pre code{background:none;padding:0}
.doc table{border-collapse:collapse;width:100%;margin:0 0 14px;font-size:14px}
.doc th,.doc td{text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.doc blockquote{margin:0 0 14px;padding:4px 16px;border-left:3px solid #cbd5e1;color:#475569}
.doc hr{border:0;border-top:1px solid #e2e8f0;margin:28px 0}
footer{border-top:1px solid #e2e8f0;background:#fff}
.foot{margin:0 auto;width:min(1120px,calc(100% - 32px));display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:space-between;padding:22px 0;font-size:13px;color:#64748b}
.foot a{color:#475569;text-decoration:none}
.foot a:hover{color:#17202c}
@media (max-width:560px){.bar{height:auto;flex-direction:column;align-items:flex-start;padding:14px 0}nav{flex-wrap:wrap;gap:12px 16px}}
`

// The site's header lockup: the wordmark at 30 px, a rule, and the name written out.
const WORDMARK =
  '<a class="logo" href="/" aria-label="OTRI, the Open Trail Running Index. Home">' +
  `<svg aria-hidden="true" focusable="false" viewBox="${GEOMETRY.viewBox}" width="${(30 * 203) / 74}" height="30">` +
  `<path d="${GEOMETRY.letters} ${GEOMETRY.stem}" fill="#17202c"/>` +
  `<path d="${GEOMETRY.summit}" fill="#3576f6"/>` +
  `<path d="${GEOMETRY.arrow}" fill="none" stroke="#3576f6" stroke-width="5" stroke-linejoin="round"/>` +
  '</svg><span class="name"><span>Open Trail</span><span>Running Index</span></span></a>'

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The Markdown as HTML, with the repository's conventions turned into the site's. */
function renderBody(markdown) {
  // The first heading is the page title, so it is not repeated in the body.
  const withoutTitle = markdown.replace(/^# .*\n+/, '')
  let html = marked.parse(withoutTitle, { gfm: true })
  // A document naming one of the others in backticks links to its page; any other repository
  // file named that way links to the repository.
  for (const page of LEGAL_PAGES) {
    html = html.replaceAll(`<code>${page.file}</code>`, `<a href="/${page.path}/">${page.title}</a>`)
  }
  html = html.replace(/<code>([A-Z_-]+\.md|docs\/[\w./-]+\.md)<\/code>/g, (_, file) => `<a href="${REPO}/${file}">${file}</a>`)
  return html
}

/** When this one document last changed, not when the repository last did.
 *  The build used to pass one date -- the HEAD commit's -- to all three pages, so any commit
 *  anywhere re-dated every policy, and the date a reader would rely on to know whether the terms
 *  had changed since they accepted them was wrong. */
export function lastChanged(file, root) {
  try {
    return execSync(`git log -1 --format=%cI -- ${file}`, { cwd: root }).toString().trim()
  } catch {
    return ''
  }
}

export function renderLegalPage(page, root, { commitDate = '' } = {}) {
  // Windows line endings would stop the title regex: a carriage return is a line end in JavaScript.
  const markdown = readFileSync(resolve(root, page.file), 'utf8').replace(/\r\n/g, '\n')
  const title = (markdown.match(/^# (.*)$/m) || [null, page.title])[1]
  const nav = LEGAL_PAGES.map((p) => `<a href="/${p.path}/"${p === page ? ' aria-current="page"' : ''}>${p.title}</a>`).join('')
  const changed = lastChanged(page.file, root) || commitDate
  const updated = changed ? `Last changed ${changed.slice(0, 10)}.` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#17202c" />
<meta name="description" content="${escape(page.title)} of OTRI, the Open Trail Running Index." />
<link rel="canonical" href="https://otri.run/${page.path}/" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${escape(page.title)} · OTRI</title>
<style>${CSS}</style>
</head>
<body>
<header><div class="bar">${WORDMARK}<nav>${nav}<a href="/">Home</a></nav></div></header>
<main>
<p class="eyebrow">OTRI · Open Trail Running Index</p>
<h1>${escape(title)}</h1>
<p class="meta">${updated}</p>
<article class="doc">${renderBody(markdown)}</article>
</main>
<footer><div class="foot"><span>OTRI · Open Trail Running Index</span><span>${LEGAL_PAGES.map((p) => `<a href="/${p.path}/">${p.title}</a>`).join(' · ')} · <a href="mailto:hello@otri.run">hello@otri.run</a></span></div></footer>
</body>
</html>
`
}

export default function legalPages({ commitDate = '' } = {}) {
  let root = process.cwd()
  function serve(req, res, next) {
    const url = (req.url || '').split('?')[0]
    const page = LEGAL_PAGES.find((p) => url === `/${p.path}` || url === `/${p.path}/` || url === `/${p.path}/index.html`)
    if (!page) return next()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(renderLegalPage(page, root, { commitDate }))
  }
  return {
    name: 'otri-legal-pages',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
    generateBundle() {
      for (const page of LEGAL_PAGES) {
        this.emitFile({ type: 'asset', fileName: `${page.path}/index.html`, source: renderLegalPage(page, root, { commitDate }) })
      }
    },
  }
}
