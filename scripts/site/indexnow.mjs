import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tells the search engines that speak IndexNow (Bing and everything built on it: DuckDuckGo,
// Yahoo, Ecosia; Yandex, Naver, Seznam) which addresses changed, right after a deploy, so a race
// page is picked up in hours rather than whenever a crawler next comes by. Google does not take
// IndexNow; it reads the sitemap through Search Console.
//
// The protocol: a key of ours is published as a text file at the site's root, and we POST the
// key with a list of addresses. The engines fetch the key file once to see that the request
// really comes from the site's owner. Nothing to sign up for, nothing secret: the key is public.
//
//   node scripts/site/indexnow.mjs                         # index using auto-detected key
//   node scripts/site/indexnow.mjs --dry-run                 # print what would be sent
//   node scripts/site/indexnow.mjs --archive                 # also ping Wayback Machine archive
//   node scripts/site/indexnow.mjs --all-endpoints           # send to all search engine hubs
//
// Run by the Pages workflow after each deploy (.github/workflows/pages.yml).

const SITE = process.env.SITE_URL || 'https://otri.run'
const SITEMAP = process.env.SITEMAP_URL || `${SITE}/sitemap.xml`
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://indexnow.naver.com/indexnow',
]
const BATCH = 10_000 // the protocol's limit per request
const dryRun = process.argv.includes('--dry-run')
const archive = process.argv.includes('--archive')
const allEndpoints = process.argv.includes('--all-endpoints')

function findKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY
  for (const dir of ['public', 'dist']) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      if (/^[0-9a-f]{32}\.txt$/i.test(file)) {
        return file.replace(/\.txt$/i, '')
      }
    }
  }
  return ''
}

const KEY = findKey()
if (!KEY && !dryRun) {
  console.error('indexnow: no INDEXNOW_KEY found in environment or public/*.txt; nothing sent')
  process.exit(0)
}

async function loadSitemapUrls() {
  try {
    const response = await fetch(SITEMAP, { signal: AbortSignal.timeout(6000) })
    if (response.ok) {
      const text = await response.text()
      const urls = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
      if (urls.length > 0) return urls
    }
  } catch {
    // Network lookup failed, fallback to local disk
  }

  for (const localPath of ['dist/sitemap.xml', 'public/sitemap.xml']) {
    if (existsSync(localPath)) {
      const text = readFileSync(localPath, 'utf8')
      const urls = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
      if (urls.length > 0) return urls
    }
  }
  return []
}

const urls = await loadSitemapUrls()
if (urls.length === 0) {
  console.error(`indexnow: no addresses found in sitemap (${SITEMAP} or local disk)`)
  process.exit(0)
}

const host = new URL(SITE).host
const targetEndpoints = allEndpoints ? ENDPOINTS : [ENDPOINTS[0]]
let failed = false

for (const endpoint of targetEndpoints) {
  const endpointName = new URL(endpoint).host
  for (let start = 0; start < urls.length; start += BATCH) {
    const urlList = urls.slice(start, start + BATCH)
    const body = { host, key: KEY || '<key>', keyLocation: `${SITE}/${KEY || '<key>'}.txt`, urlList }
    if (dryRun) {
      console.log(`[dry-run] ${endpointName}: ${urlList.length} addresses, first ${urlList[0]}`)
      continue
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
      console.log(`indexnow (${endpointName}): ${urlList.length} addresses -> HTTP ${response.status}${response.status >= 400 ? ` ${await response.text()}` : ''}`)
      if (response.status >= 400) failed = true
    } catch (err) {
      console.warn(`indexnow (${endpointName}): fetch failed: ${err.message}`)
    }
  }
}

if (archive && !dryRun) {
  // Submit primary core URLs to Wayback Machine save endpoint
  const archiveCandidates = urls.slice(0, 15)
  console.log(`archive: submitting ${archiveCandidates.length} key URLs to Wayback Machine...`)
  for (const url of archiveCandidates) {
    try {
      const res = await fetch(`https://web.archive.org/save/${url}`, {
        method: 'GET',
        headers: { 'User-Agent': 'OTRI-Indexer/1.0 (+https://otri.run)' },
        signal: AbortSignal.timeout(8000),
      })
      console.log(`archive: ${url} -> HTTP ${res.status}`)
    } catch (e) {
      console.warn(`archive: ${url} -> ${e.message}`)
    }
  }
}

process.exit(failed ? 1 : 0)
