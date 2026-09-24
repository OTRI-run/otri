// The site's static pages: the legal documents and the guides, rendered from Markdown at the
// repository root and under docs/, and the FAQ, rendered from the same data the app's FAQ page
// uses. The app itself is hash-routed, which search engines read as one address, so these are the
// pages that carry OTRI's words where a crawler can read them: real addresses (/faq/, /how-otri-
// scores/, /privacy/ …), a title and description each, structured data, and a sitemap listing
// them. Each page is rendered at build time, and in the dev and preview servers on every request;
// the Markdown and the data stay the single source.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { FAQ } from '../../src/data/faq.js'
import { NOT_MEASURED, WHAT_WE_SCORE } from '../../src/data/whatWeScore.js'
import { prerenderPublic } from './prerender.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = 'https://otri.run'
const REPO = 'https://github.com/OTRI-run/otri/blob/main'

// The mark's geometry, the same file the site's Logo component draws from.
const GEOMETRY = JSON.parse(readFileSync(resolve(HERE, '../../src/brand/uphill.json'), 'utf8'))

/** Pages rendered from a Markdown file. `dir` is the file's folder, for its relative links. */
export const MARKDOWN_PAGES = [
  { path: 'how-otri-scores', file: 'docs/methodology/0.1.0/HOW-OTRI-SCORES.md', title: 'How a score is made', description: 'How an OTRI trail-running score is calculated from the course and the finish time, where every constant comes from, what the model does not see, and how to question a number.', kind: 'guide' },
  { path: 'what-is-a-gpx', file: 'docs/WHAT-IS-A-GPX.md', title: 'What is a GPX file?', description: 'What a GPX course file is, where to get one for a trail race before or after the day, and what makes a file that measures well.', kind: 'guide' },
  { path: 'result-files', file: 'docs/RESULT-FILES.md', title: 'Result files', description: 'What OTRI reads from a race results file: the columns it recognises in many languages, how non-finishers are handled, and what stops an upload.', kind: 'guide' },
  { path: 'privacy', file: 'PRIVACY.md', title: 'Privacy policy', description: 'What personal data OTRI keeps about organizers and runners, why, for how long, and your rights.', kind: 'legal' },
  { path: 'terms', file: 'TERMS.md', title: 'Terms of service', description: 'The terms for an organizer account on OTRI, the Open Trail Running Index.', kind: 'legal' },
  { path: 'data-policy', file: 'DATA_POLICY.md', title: 'Data policy', description: 'Where OTRI\'s race data may come from, what stays restricted, provenance, corrections and privacy.', kind: 'legal' },
]
/** Kept for anything that imported the old name. */
export const LEGAL_PAGES = MARKDOWN_PAGES.filter((page) => page.kind === 'legal')
export const FAQ_PAGE = { path: 'faq', title: 'FAQ', description: 'Plain answers about OTRI trail-running scores: what a score means, which races can be scored, courses and GPX files, the runner index, publishing a race, and the project.', kind: 'guide' }

/** Documents that have a page of their own, by file name: a link to the file becomes a link to the page. */
const PAGE_BY_FILE = Object.fromEntries(MARKDOWN_PAGES.map((page) => [posix.basename(page.file), `/${page.path}/`]))

const NAV = [
  ['/', 'Home'],
  ['/#calculator', 'Calculator'],
  ['/#score', 'Score a race'],
  ['/faq/', 'FAQ'],
  ['/how-otri-scores/', 'How a score is made'],
]

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f7f9fc;color:#17202c;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#3576f6}
header{background:#fff;border-bottom:1px solid #e2e8f0}
.bar{margin:0 auto;width:min(1120px,calc(100% - 32px));display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.logo{display:flex;align-items:center;gap:12px;min-width:0;flex-shrink:0;text-decoration:none;color:#17202c}
.logo svg{display:block;flex-shrink:0;max-width:100%;overflow:visible}
.logo .name{display:flex;flex-direction:column;justify-content:center;flex-shrink:0;border-left:1px solid #cbd5e1;padding-left:12px;font-size:13px;font-weight:600;line-height:1.12;letter-spacing:-.02em}
@media (min-width:640px){.logo .name{font-size:16px}}
nav{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;font-weight:600}
nav a{color:#475569;text-decoration:none}
nav a[aria-current]{color:#17202c}
nav a:hover{color:#17202c}
main{margin:0 auto;width:min(760px,calc(100% - 32px));padding:56px 0 80px}
.eyebrow{margin:0 0 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#64748b;text-transform:uppercase}
h1{margin:0 0 8px;font-size:clamp(34px,5vw,50px);font-weight:700;letter-spacing:-.05em;line-height:1}
.meta{margin:0 0 36px;font-size:13px;line-height:1.6;color:#64748b}
.lead{margin:0 0 28px;font-size:17px;line-height:1.6;color:#334155}
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
.doc .open{font-size:13px}
.cta{margin:28px 0 0;display:flex;flex-wrap:wrap;gap:10px}
.cta a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:600;text-decoration:none}
.cta a.quiet{background:#fff;color:#17202c;border:1px solid #cbd5e1}
footer{border-top:1px solid #e2e8f0;background:#fff}
.foot{margin:0 auto;width:min(1120px,calc(100% - 32px));display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:space-between;padding:22px 0;font-size:13px;color:#64748b}
.foot a{color:#475569;text-decoration:none}
.foot a:hover{color:#17202c}
@media (max-width:560px){.bar{flex-direction:column;align-items:flex-start;padding:14px 0}}
`

// The site's header lockup: the wordmark at 30 px, a rule, and the name written out.
const WORDMARK =
  '<a class="logo" href="/" aria-label="OTRI, the Open Trail Running Index. Home">' +
  `<svg aria-hidden="true" focusable="false" viewBox="${GEOMETRY.viewBox}" width="${(30 * 203) / 74}" height="30">` +
  `<path d="${GEOMETRY.letters} ${GEOMETRY.stem}" fill="#17202c"/>` +
  `<path d="${GEOMETRY.summit}" fill="#3576f6"/>` +
  `<path d="${GEOMETRY.arrow}" fill="none" stroke="#3576f6" stroke-width="5" stroke-linejoin="round"/>` +
  '</svg><span class="name"><span>Open Trail</span><span>Running Index</span></span></a>'

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A relative Markdown link, resolved: to the page a document has here, or to the file on GitHub. */
function resolveDocLink(href, dir) {
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href
  const [file, hash = ''] = href.split('#')
  const page = PAGE_BY_FILE[posix.basename(file)]
  if (page) return page + (hash ? `#${hash}` : '')
  return `${REPO}/${posix.normalize(posix.join(dir, file))}${hash ? `#${hash}` : ''}`
}

let docIndex = null
/** Every Markdown file under docs/ by its file name, for links that give the name alone. */
function docByName(root) {
  if (docIndex) return docIndex
  docIndex = {}
  const walk = (dir) => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const path = posix.join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.md')) docIndex[entry.name] = path
    }
  }
  walk('docs')
  return docIndex
}

/** The Markdown as HTML, with the repository's conventions turned into the site's. */
function renderMarkdown(markdown, dir, root) {
  // The first heading is the page title, so it is not repeated in the body.
  const withoutTitle = markdown.replace(/^# .*\n+/, '')
  let html = marked.parse(withoutTitle, { gfm: true })
  html = html.replace(/href="([^"]+)"/g, (_, href) => `href="${escape(resolveDocLink(href, dir))}"`)
  // A document naming one of the others in backticks links to its page; any other repository
  // file named that way links to the repository.
  for (const [file, page] of Object.entries(PAGE_BY_FILE)) {
    html = html.replaceAll(`<code>${file}</code>`, `<a href="${page}">${MARKDOWN_PAGES.find((p) => p.path === page.slice(1, -1)).title}</a>`)
  }
  // A file named in backticks: beside this document, else anywhere under docs/, else at the root.
  html = html.replace(/<code>([A-Z_-]+\.md|docs\/[\w./-]+\.md)<\/code>/g, (_, file) => {
    const target = file.includes('/') ? file : existsSync(resolve(root, dir, file)) ? posix.join(dir, file) : docByName(root)[file] ?? file
    return `<a href="${REPO}/${target}">${file}</a>`
  })
  return html
}

/** The FAQ as HTML: the groups, each question with its answer, and the app link that searches it. */
function renderFaq() {
  const parts = []
  for (const group of FAQ) {
    parts.push(`<h2 id="${slug(group.group)}">${escape(group.group)}</h2>`)
    for (const item of group.items) {
      parts.push(`<h3 id="${slug(item.q)}">${escape(item.q)}</h3>`)
      parts.push(`<p>${escape(item.a)}</p>`)
      if (item.table) {
        parts.push('<table><thead><tr><th>Scored?</th><th>Races</th><th>Notes</th></tr></thead><tbody>')
        for (const [mark, what, note] of WHAT_WE_SCORE) parts.push(`<tr><td>${{ yes: 'Yes', beta: 'Yes, in test', no: 'No' }[mark] ?? escape(mark)}</td><td>${escape(what)}</td><td>${escape(note)}</td></tr>`)
        parts.push('</tbody></table>')
        parts.push(`<p>${escape(NOT_MEASURED)}</p>`)
      }
      if (item.link) parts.push(`<p class="open"><a href="${escape(item.link[0])}">${escape(item.link[1])}</a></p>`)
    }
  }
  return parts.join('\n')
}

function faqJsonLd() {
  const entities = FAQ.flatMap((group) =>
    group.items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  )
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities }
}

function articleJsonLd(page, changed) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.description,
    dateModified: changed || undefined,
    inLanguage: 'en',
    isAccessibleForFree: true,
    author: { '@type': 'Organization', name: 'OTRI, the Open Trail Running Index', url: SITE },
    publisher: { '@type': 'Organization', name: 'OTRI, the Open Trail Running Index', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
    mainEntityOfPage: `${SITE}/${page.path}/`,
  }
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

function shell({ page, body, changed, lead = '', jsonLd, cta = '' }) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === `/${page.path}/` ? ' aria-current="page"' : ''}>${label}</a>`).join('')
  const updated = changed ? `Last changed ${changed.slice(0, 10)}.` : ''
  const legal = LEGAL_PAGES.map((p) => `<a href="/${p.path}/">${p.title}</a>`).join(' · ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#17202c" />
<title>${escape(page.title)} · OTRI</title>
<meta name="description" content="${escape(page.description)}" />
<link rel="canonical" href="${SITE}/${page.path}/" />
<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="LLM context" />
<link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml" title="OTRI Search" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="OTRI" />
<meta property="og:title" content="${escape(page.title)} · OTRI" />
<meta property="og:description" content="${escape(page.description)}" />
<meta property="og:url" content="${SITE}/${page.path}/" />
<meta property="og:image" content="${SITE}/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="bar">${WORDMARK}<nav aria-label="Site">${nav}</nav></div></header>
<main>
<p class="eyebrow">OTRI · Open Trail Running Index</p>
<h1>${escape(page.title)}</h1>
<p class="meta">${updated}</p>
${lead}
<article class="doc">${body}</article>
${cta}
</main>
<footer><div class="foot"><span>OTRI · Open Trail Running Index · <a href="https://github.com/OTRI-run/otri">Open source</a></span><span>${legal} · <a href="mailto:hello@otri.run">hello@otri.run</a></span></div></footer>
</body>
</html>
`
}

export function renderMarkdownPage(page, root) {
  // Windows line endings would stop the title regex: a carriage return is a line end in JavaScript.
  const markdown = readFileSync(resolve(root, page.file), 'utf8').replace(/\r\n/g, '\n')
  const changed = lastChanged(page.file, root)
  const cta =
    page.kind === 'guide'
      ? '<div class="cta"><a href="/#calculator">Open the calculator</a><a class="quiet" href="/#score">Score my race</a><a class="quiet" href="/faq/">Read the FAQ</a></div>'
      : ''
  return shell({ page, body: renderMarkdown(markdown, posix.dirname(page.file), root), changed, jsonLd: articleJsonLd(page, changed), cta })
}

export function renderFaqPage(root) {
  const changed = lastChanged('src/data/faq.js', root)
  const lead = '<p class="lead">Plain answers to the questions runners and organizers ask, in the order they tend to ask them. Every claim here is also in the methodology pages; when the two disagree, the pages win. <a href="/#faq">Search the FAQ in the app</a>.</p>'
  const cta = '<div class="cta"><a href="/#calculator">Open the calculator</a><a class="quiet" href="/#score">Score my race</a><a class="quiet" href="/how-otri-scores/">How a score is made</a></div>'
  return shell({ page: FAQ_PAGE, body: renderFaq(), changed, lead, jsonLd: faqJsonLd(), cta })
}

/** Backwards-compatible name for the legal pages. */
export const renderLegalPage = (page, root) => renderMarkdownPage(page, root)

/** The sitemap: the real addresses, with the day each one's source last changed. `extra` are the
 *  race and runner pages of a build (scripts/site/prerender.mjs). */
export function renderSitemap(root, { commitDate = '', extra = [] } = {}) {
  const day = (iso) => (iso || commitDate || new Date().toISOString()).slice(0, 10)
  const urls = [
    { loc: `${SITE}/`, lastmod: day(commitDate) },
    { loc: `${SITE}/${FAQ_PAGE.path}/`, lastmod: day(lastChanged('src/data/faq.js', root)) },
    ...MARKDOWN_PAGES.map((page) => ({ loc: `${SITE}/${page.path}/`, lastmod: day(lastChanged(page.file, root)) })),
    ...extra.map((entry) => ({ loc: entry.loc, lastmod: day(entry.lastmod) })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`
}

export const ALL_PAGES = [FAQ_PAGE, ...MARKDOWN_PAGES]

export default function legalPages({ commitDate = '' } = {}) {
  let root = process.cwd()
  let building = false
  let outDir = 'dist'
  const render = (page) => (page === FAQ_PAGE ? renderFaqPage(root) : renderMarkdownPage(page, root))
  function serve(req, res, next, { redirectEntities = true } = {}) {
    const url = (req.url || '').split('?')[0]
    if (url === '/sitemap.xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      return res.end(renderSitemap(root, { commitDate }))
    }
    // The race and runner pages exist as files only in a build; in the dev server the app's own
    // route is the same page.
    const entity = redirectEntities && url.match(/^\/(races|runners|courses)\/([^/]+)\/?(?:index\.html)?$/)
    if (entity) {
      res.statusCode = 302
      res.setHeader('Location', entity[1] === 'courses' ? `/#calculator?race=${entity[2]}` : `/#${entity[1]}/${entity[2]}`)
      return res.end()
    }
    const page = ALL_PAGES.find((p) => url === `/${p.path}` || url === `/${p.path}/` || url === `/${p.path}/index.html`)
    if (!page) return next()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(render(page))
  }
  return {
    name: 'otri-static-pages',
    configResolved(config) {
      root = config.root
      building = config.command === 'build'
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      // The preview serves a build, where the race and runner pages are real files.
      server.middlewares.use((req, res, next) => serve(req, res, next, { redirectEntities: false }))
    },
    generateBundle() {
      for (const page of ALL_PAGES) {
        this.emitFile({ type: 'asset', fileName: `${page.path}/index.html`, source: render(page) })
      }
    },
    // With the bundle written, the race and runner pages are rendered from the API around the
    // app's own script and stylesheet tags, and the sitemap lists everything.
    async closeBundle() {
      if (!building) return
      const dist = resolve(root, outDir)
      const index = readFileSync(resolve(dist, 'index.html'), 'utf8')
      const assetTags = [...index.matchAll(/<(?:script[^>]*type="module"[^>]*|link[^>]*rel="(?:stylesheet|modulepreload)"[^>]*)>(?:<\/script>)?/g)]
        .map((match) => match[0].replaceAll('"./assets/', '"/assets/'))
        .join('\n')
      const apiBase = (process.env.VITE_OTRI_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
      const extra = await prerenderPublic({ apiBase, distDir: dist, assetTags })
      writeFileSync(resolve(dist, 'sitemap.xml'), renderSitemap(root, { commitDate, extra }))
    },
  }
}
