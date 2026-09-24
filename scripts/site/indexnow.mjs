// Tells the search engines that speak IndexNow (Bing and everything built on it: DuckDuckGo,
// Yahoo, Ecosia; Yandex, Naver, Seznam) which addresses changed, right after a deploy, so a race
// page is picked up in hours rather than whenever a crawler next comes by. Google does not take
// IndexNow; it reads the sitemap through Search Console.
//
// The protocol: a key of ours is published as a text file at the site's root, and we POST the
// key with a list of addresses. The engines fetch the key file once to see that the request
// really comes from the site's owner. Nothing to sign up for, nothing secret: the key is public.
//
//   INDEXNOW_KEY=… node scripts/site/indexnow.mjs            # every address in the live sitemap
//   node scripts/site/indexnow.mjs --dry-run                 # print what would be sent
//
// Run by the Pages workflow after each deploy (.github/workflows/pages.yml).

const SITE = process.env.SITE_URL || 'https://otri.run'
const SITEMAP = process.env.SITEMAP_URL || `${SITE}/sitemap.xml`
const KEY = process.env.INDEXNOW_KEY || ''
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 10_000 // the protocol's limit per request
const dryRun = process.argv.includes('--dry-run')

if (!KEY && !dryRun) {
  console.error('indexnow: INDEXNOW_KEY is not set; nothing sent')
  process.exit(0)
}

const sitemap = await (await fetch(SITEMAP)).text()
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
if (urls.length === 0) {
  console.error(`indexnow: no addresses found in ${SITEMAP}`)
  process.exit(0)
}

const host = new URL(SITE).host
let failed = false
for (let start = 0; start < urls.length; start += BATCH) {
  const urlList = urls.slice(start, start + BATCH)
  const body = { host, key: KEY || '<key>', keyLocation: `${SITE}/${KEY || '<key>'}.txt`, urlList }
  if (dryRun) {
    console.log(JSON.stringify({ ...body, urlList: `${urlList.length} addresses, first ${urlList[0]}` }, null, 2))
    continue
  }
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
  // 200 and 202 both mean accepted; 4xx means the key or the list was not, and says why.
  console.log(`indexnow: ${urlList.length} addresses -> HTTP ${response.status}${response.status >= 400 ? ` ${await response.text()}` : ''}`)
  if (response.status >= 400) failed = true
}
process.exit(failed ? 1 : 0)
