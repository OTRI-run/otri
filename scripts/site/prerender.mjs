// Real pages for the races, runners and calculator courses the app shows under #races/<id>,
// #runners/<id> and #calculator?race=<id>.
//
// A hash route is one address to a search engine, so at build time every published race and
// every runner with a published result gets a page of its own: /races/<id>/ and /runners/<id>/,
// with the results in plain HTML, a title, a description, a canonical address and event
// structured data. The page also loads the app's own scripts, so a person who arrives from a
// search gets the interactive page in place (prototype/main.jsx turns the path into the hash
// route as it boots); a crawler, or a reader without JavaScript, gets the HTML.
//
// The data comes from the API at build time (VITE_OTRI_API_BASE_URL). A race published later has
// no page until the next build: the deploy workflow also runs on a daily schedule and on a
// repository_dispatch the API sends when a race is published, unpublished or listed. A race that
// is unpublished simply has no page in the next build, and GitHub Pages serves 404 for it.
//
// Every static rule is scoped under .otri-static, so that once the app has rendered nothing of
// this styling touches the app's own header, nav and main.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SITE = 'https://otri.run'
const RUNNER_LIMIT = 500 // what GET /runners allows in one call; enough for now, paginate when it is not

const escape = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const formatSeconds = (seconds) => {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
const km = (value) => `${Number(value).toFixed(1)} km`
const metres = (value) => `${Math.round(Number(value)).toLocaleString('en-US')} m`
const year = (isoDate) => (isoDate ? String(isoDate).slice(0, 4) : '')

const CSS = `
.otri-static{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#17202c;background:#f7f9fc;min-height:100vh;-webkit-font-smoothing:antialiased}
.otri-static a{color:#3576f6}
.otri-static .bar{margin:0 auto;width:min(1120px,calc(100% - 32px));display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px;border-bottom:1px solid #e2e8f0}
.otri-static .brand{font-weight:700;letter-spacing:-.02em;text-decoration:none;color:#17202c}
.otri-static .links{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;font-weight:600}
.otri-static .links a{color:#475569;text-decoration:none}
.otri-static .page{margin:0 auto;width:min(920px,calc(100% - 32px));padding:48px 0 80px}
.otri-static .eyebrow{margin:0 0 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#64748b;text-transform:uppercase}
.otri-static h1{margin:0 0 10px;font-size:clamp(30px,5vw,46px);font-weight:700;letter-spacing:-.05em;line-height:1.05}
.otri-static .facts{margin:0 0 24px;font-size:14px;line-height:1.7;color:#475569}
.otri-static .open{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin:0 0 28px}
.otri-static table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;font-size:14px}
.otri-static th,.otri-static td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.otri-static th{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
.otri-static td.n{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.otri-static td.score{font-weight:700;color:#1d4ed8}
.otri-static .note{margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b}
.otri-static .profile{display:block;width:100%;height:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin:0 0 8px}
.otri-static .axis{display:flex;justify-content:space-between;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:#64748b;margin:0 0 24px}
.otri-static footer{margin:48px auto 0;width:min(1120px,calc(100% - 32px));padding:22px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b}
`

/** The page's frame: what a crawler reads, inside #root so the app replaces it when it boots. */
function document({ title, description, canonical, jsonLd, body, assetTags }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#0b1220" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="OTRI" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE}/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
${assetTags}
</head>
<body>
<div id="root"><div class="otri-static">
<div class="bar"><a class="brand" href="/">OTRI · Open Trail Running Index</a><nav class="links"><a href="/#races">Races</a><a href="/#runners">Runners</a><a href="/#calculator">Calculator</a><a href="/faq/">FAQ</a></nav></div>
<main class="page">
${body}
</main>
<footer>OTRI · Open Trail Running Index · <a href="/how-otri-scores/">How a score is made</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/data-policy/">Data policy</a></footer>
</div></div>
</body>
</html>
`
}

const raceLabel = (race) => `${race.event_name} · ${race.course_name}`

export function renderRacePage(race, results, assetTags) {
  const finishers = results.filter((row) => row.status === 'finisher' || row.otri_score != null)
  const winner = finishers.find((row) => row.rank === 1) ?? finishers[0]
  const place = [race.event_location, race.event_country].filter(Boolean).join(', ')
  const when = race.event_date ? new Date(`${race.event_date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const title = `${raceLabel(race)}${year(race.event_date) ? ` ${year(race.event_date)}` : ''} results and OTRI scores`
  const description = finishers.length
    ? `${raceLabel(race)}${place ? `, ${place}` : ''}${when ? `, ${when}` : ''}: ${finishers.length} finishers scored on the ${km(race.distance_km)}, +${metres(race.elevation_gain_m)} course.${winner ? ` Winner ${winner.first_name} ${winner.family_name} in ${formatSeconds(winner.finish_time_seconds)}, OTRI ${winner.otri_score}.` : ''} Every score explained, from the course and the finish time alone.`
    : `${raceLabel(race)}${place ? `, ${place}` : ''}${when ? `, ${when}` : ''}: the ${km(race.distance_km)}, +${metres(race.elevation_gain_m)} course on OTRI, the Open Trail Running Index. Results and scores follow when the organizer publishes them.`
  const canonical = `${SITE}/races/${encodeURIComponent(race.race_id)}/`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: raceLabel(race),
    sport: 'Trail running',
    startDate: race.event_date || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place ? { '@type': 'Place', name: race.event_location || race.event_country, address: { '@type': 'PostalAddress', addressLocality: race.event_location || undefined, addressCountry: race.event_country || undefined } } : undefined,
    organizer: race.organizer_display ? { '@type': 'Organization', name: race.organizer_display, url: race.organizer_website || undefined } : undefined,
    url: canonical,
    description,
  }
  const rows = finishers
    .map(
      (row) =>
        `<tr><td class="n">${escape(row.rank)}</td><td>${row.runner_id ? `<a href="/runners/${encodeURIComponent(row.runner_id)}/">` : ''}${escape(row.first_name)} ${escape(row.family_name)}${row.runner_id ? '</a>' : ''}${row.nationality ? ` <span class="n">${escape(row.nationality)}</span>` : ''}</td><td class="n">${formatSeconds(row.finish_time_seconds)}</td><td class="n score">${row.otri_score ?? '—'}</td></tr>`,
    )
    .join('\n')
  const notFinished = results.length - finishers.length
  const body = `
<p class="eyebrow">Scored race${race.is_demo ? ' · demonstration data' : ''}</p>
<h1>${escape(raceLabel(race))}</h1>
<p class="facts">${[when, place, `${km(race.distance_km)} · +${metres(race.elevation_gain_m)}${race.elevation_loss_m != null ? ` · −${metres(race.elevation_loss_m)}` : ''}`, finishers.length ? `${finishers.length} finishers${notFinished ? `, ${notFinished} did not finish` : ''}` : 'results to come'].filter(Boolean).map(escape).join(' · ')}${race.organizer_display ? `<br>Published by ${race.organizer_website ? `<a href="${escape(race.organizer_website)}">${escape(race.organizer_display)}</a>` : escape(race.organizer_display)}` : ''}</p>
<a class="open" href="/#races/${encodeURIComponent(race.race_id)}">Open the race page with the course map and every score explained</a>
${finishers.length ? `<table><thead><tr><th>Rank</th><th>Runner</th><th>Time</th><th>OTRI</th></tr></thead><tbody>\n${rows}\n</tbody></table>` : ''}
<p class="note">An OTRI score is worked out from the course and the finish time alone, never from who else raced: 1000 is record-run level for that much ground. <a href="/how-otri-scores/">How a score is made</a>. Scores under model ${escape(race.scoring_version || 'OTRI 0.1.0')}.</p>
`
  return document({ title: `${title} · OTRI`, description, canonical, jsonLd, body, assetTags })
}

export function renderRunnerPage(runner, assetTags) {
  const name = `${runner.first_name} ${runner.family_name}`.trim()
  const results = [...(runner.results ?? [])].sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
  const title = `${name}: trail running results and OTRI index`
  const best = results.reduce((top, row) => (row.otri_score > (top?.otri_score ?? -1) ? row : top), null)
  const description = `${name}${runner.nationality ? ` (${runner.nationality})` : ''} on OTRI, the Open Trail Running Index: ${results.length} scored result${results.length === 1 ? '' : 's'}${runner.index != null ? `, runner index ${runner.index}${runner.provisional ? ' (provisional)' : ''}` : ''}${best ? `, best score ${best.otri_score} at ${best.event_name} ${best.course_name}` : ''}.`
  const canonical = `${SITE}/runners/${encodeURIComponent(runner.runner_id)}/`
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Person', name, nationality: runner.nationality || undefined, url: canonical, description }
  const rows = results
    .map(
      (row) =>
        `<tr><td class="n">${escape(row.event_date)}</td><td><a href="/races/${encodeURIComponent(row.race_id)}/">${escape(row.event_name)} · ${escape(row.course_name)}</a></td><td class="n">${escape(row.rank)}</td><td class="n">${formatSeconds(row.finish_time_seconds)}</td><td class="n score">${row.otri_score}</td></tr>`,
    )
    .join('\n')
  const body = `
<p class="eyebrow">Runner</p>
<h1>${escape(name)}</h1>
<p class="facts">${[runner.nationality, runner.gender && runner.gender !== 'X' ? runner.gender : null, runner.index != null ? `Runner index ${runner.index}${runner.provisional ? ' (provisional)' : ''}` : null, `${results.length} scored result${results.length === 1 ? '' : 's'}`].filter(Boolean).map(escape).join(' · ')}</p>
<a class="open" href="/#runners/${encodeURIComponent(runner.runner_id)}">Open the profile with the index explained</a>
${results.length ? `<table><thead><tr><th>Date</th><th>Race</th><th>Rank</th><th>Time</th><th>OTRI</th></tr></thead><tbody>\n${rows}\n</tbody></table>` : ''}
<p class="note">The runner index is the recency-weighted mean of the best three published scores of the last 24 months. Results are shown as their organizers published them; <a href="/#faq?q=remove">a runner can ask for a correction or removal</a>.</p>
`
  return document({ title: `${title} · OTRI`, description, canonical, jsonLd, body, assetTags })
}

/** The course's elevation profile as a drawing, from the stored measurement. */
function profileSvg(measurement) {
  const points = (measurement?.profile ?? []).filter((p) => Number.isFinite(p.distanceKm) && Number.isFinite(p.elevation))
  if (points.length < 2) return ''
  const W = 640
  const H = 160
  const pad = { top: 10, bottom: 6, side: 4 }
  const maxD = points[points.length - 1].distanceKm || 1
  let minE = Infinity
  let maxE = -Infinity
  for (const p of points) {
    if (p.elevation < minE) minE = p.elevation
    if (p.elevation > maxE) maxE = p.elevation
  }
  const x = (d) => pad.side + (d / maxD) * (W - pad.side * 2)
  const y = (e) => pad.top + (1 - (e - minE) / (maxE - minE || 1)) * (H - pad.top - pad.bottom)
  // At most two points per pixel column: a 100,000-point file draws as fast as a small one.
  const step = Math.max(1, Math.floor(points.length / W / 2))
  const line = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => `${x(p.distanceKm).toFixed(1)},${y(p.elevation).toFixed(1)}`).join(' ')
  const area = `${x(0).toFixed(1)},${H} ${line} ${x(maxD).toFixed(1)},${H}`
  return `<svg class="profile" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile: ${km(maxD)}, from ${metres(minE)} to ${metres(maxE)}"><polygon points="${area}" fill="#dbeafe"/><polyline points="${line}" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round"/></svg>
<p class="axis"><span>0 km · ${metres(points[0].elevation)}</span><span>high point ${metres(maxE)}</span><span>${km(maxD)}</span></p>`
}

export function renderCoursePage(race, measurement, assetTags) {
  const place = [race.event_location, race.event_country].filter(Boolean).join(', ')
  const edition = race.edition_year ? ` ${race.edition_year}` : ''
  const title = `${raceLabel(race)}${edition} course: ${km(race.distance_km)}, +${metres(race.elevation_gain_m)}`
  const description = `The ${raceLabel(race)}${edition} course${place ? ` in ${place}` : ''} on OTRI: ${km(race.distance_km)} with ${metres(race.elevation_gain_m)} of climb${race.elevation_loss_m != null ? ` and ${metres(race.elevation_loss_m)} of descent` : ''}, measured from the official course file. Type a target finish time and see the OTRI score it would earn, with every step of the calculation explained.`
  const canonical = `${SITE}/courses/${encodeURIComponent(race.race_id)}/`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    description,
    about: { '@type': 'SportsEvent', name: raceLabel(race), sport: 'Trail running', location: place ? { '@type': 'Place', name: place } : undefined, url: race.source_url || undefined },
  }
  const facts = [place, race.edition_year ? `${race.edition_year} edition` : null, `${km(race.distance_km)} · +${metres(race.elevation_gain_m)}${race.elevation_loss_m != null ? ` · −${metres(race.elevation_loss_m)}` : ''}`, race.measurement_status ? `measured at ${race.measurement_status === 'ok' ? 'High' : 'Low'} confidence` : null].filter(Boolean).map(escape).join(' · ')
  const body = `
<p class="eyebrow">Course in the calculator</p>
<h1>${escape(raceLabel(race))}</h1>
<p class="facts">${facts}${race.source_url ? `<br>Course file from <a href="${escape(race.source_url)}" rel="nofollow">${escape(race.source_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>` : ''}</p>
<a class="open" href="/#calculator?race=${encodeURIComponent(race.race_id)}">Try a target time on this course</a>
${profileSvg(measurement)}
<p class="note">Pick a finish time and OTRI says what it would score, from the course and the time alone: the course is measured every 50 m and costed by gradient, and your speed over that flat-equivalent distance is compared with the fastest anyone has sustained over that much ground. <a href="/how-otri-scores/">How a score is made</a>. This is a course for trying a target time, not a race page; results are never expected here.</p>
`
  return document({ title: `${title} · OTRI`, description, canonical, jsonLd, body, assetTags })
}

async function getJson(base, path) {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

/**
 * Fetches what is public and writes a page per race and per runner under `distDir`. Returns the
 * sitemap entries. An API that cannot be reached means no pages and a warning, never a failed
 * build: the daily schedule tries again.
 */
export async function prerenderPublic({ apiBase, distDir, assetTags, log = console }) {
  const entries = []
  let races
  try {
    races = await getJson(apiBase, '/races')
  } catch (error) {
    log.warn(`prerender: could not list races from ${apiBase} (${error.message}); no race or runner pages this build`)
    return entries
  }
  const racePages = races.filter((race) => !race.calculator_only && (race.is_published || race.is_listed))
  const coursePages = races.filter((race) => race.calculator_only && race.has_gpx)
  for (const race of racePages) {
    let results = []
    if (race.is_published) {
      try {
        results = await getJson(apiBase, `/races/${encodeURIComponent(race.race_id)}/results`)
      } catch (error) {
        log.warn(`prerender: ${race.race_id}: results unavailable (${error.message}); page without them`)
      }
    }
    const dir = join(distDir, 'races', race.race_id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), renderRacePage(race, results, assetTags))
    entries.push({ loc: `${SITE}/races/${encodeURIComponent(race.race_id)}/`, lastmod: String(race.published_at || race.event_date || '').slice(0, 10) })
  }
  for (const course of coursePages) {
    let measurement = null
    try {
      measurement = await getJson(apiBase, `/races/${encodeURIComponent(course.race_id)}/measurement`)
    } catch (error) {
      log.warn(`prerender: course ${course.race_id}: measurement unavailable (${error.message}); page without the profile`)
    }
    const dir = join(distDir, 'courses', course.race_id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), renderCoursePage(course, measurement, assetTags))
    entries.push({ loc: `${SITE}/courses/${encodeURIComponent(course.race_id)}/`, lastmod: String(course.published_at || course.event_date || '').slice(0, 10) })
  }
  let runners = []
  try {
    runners = await getJson(apiBase, `/runners?limit=${RUNNER_LIMIT}`)
  } catch (error) {
    log.warn(`prerender: could not list runners (${error.message}); no runner pages this build`)
  }
  let runnerPages = 0
  for (const summary of runners) {
    try {
      const runner = await getJson(apiBase, `/runners/${encodeURIComponent(summary.runner_id)}`)
      const dir = join(distDir, 'runners', runner.runner_id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.html'), renderRunnerPage(runner, assetTags))
      entries.push({ loc: `${SITE}/runners/${encodeURIComponent(runner.runner_id)}/`, lastmod: String(runner.last_race_date || '').slice(0, 10) })
      runnerPages += 1
    } catch (error) {
      log.warn(`prerender: runner ${summary.runner_id}: ${error.message}`)
    }
  }
  log.info(`prerender: ${racePages.length} race page${racePages.length === 1 ? '' : 's'}, ${coursePages.length} course page${coursePages.length === 1 ? '' : 's'}, ${runnerPages} runner page${runnerPages === 1 ? '' : 's'} from ${apiBase}`)
  return entries
}
