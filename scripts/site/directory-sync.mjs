import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const TRACKING_DIR = resolve(ROOT, 'marketing/tracking')

if (!existsSync(TRACKING_DIR)) {
  mkdirSync(TRACKING_DIR, { recursive: true })
}

// 1. Wikidata QuickStatements payload (https://quickstatements.toolforge.org/)
const wikidataQuickStatements = `// OTRI - Open Trail Running Index
// Paste into QuickStatements v2 (https://quickstatements.toolforge.org/#/batch)
CREATE
LAST|Len|"OTRI"
LAST|Den|"open-source trail running performance scoring index and course analysis tool"
LAST|P31|Q166142/* instance of: open-source software */
LAST|P31|Q1172284/* instance of: web application */
LAST|P856|"https://otri.run/"/* official website */
LAST|P1324|"https://github.com/OTRI-run/otri"/* source code repository URL */
LAST|P275|Q188/* copyright license: MIT License */
LAST|P366|Q1165686/* use: trail running */
LAST|P366|Q17152643/* use: sports analytics */
`

// 2. AlternativeTo payload
const alternativeToPayload = {
  name: "OTRI (Open Trail Running Index)",
  url: "https://otri.run",
  sourceCode: "https://github.com/OTRI-run/otri",
  license: "Open Source (MIT)",
  platforms: ["Web", "Self-Hosted", "Linux", "Mac", "Windows"],
  categories: ["Sports & Fitness", "Running Tools", "Sports Analytics", "GPS Track Analysis"],
  shortDescription: "Open-source, explained trail running race scoring and course measurement tool from GPX and finish times.",
  longDescription: `OTRI (Open Trail Running Index) is a free, open-source performance index for trail runners and race directors.

Given a course GPX file and finish times, OTRI produces reproducible, mathematically explained performance scores without requiring a paid subscription or locked account.

Key Features:
- Fully transparent and reproducible scoring model based on Minetti energy-cost equation and flat-equivalent distance.
- GPX course analyzer with terrain gradient and DEM elevation profile validation.
- Free race scoring and instant web publication for race directors.
- Privacy-first: no athlete tracking, personal records deleted after scoring unless published.
- Public REST API and lightweight embeddable calculator widgets.
- Independent and not affiliated with commercial ranking bodies.`,
  alternativesTo: [
    "ITRA Performance Index",
    "UTMB Index",
    "Betrail"
  ],
  tags: ["trail-running", "open-source", "gpx", "sports-analytics", "running-calculator"]
}

// 3. GitHub Awesome Lists Pull Requests
const awesomeListsPrs = `# GitHub Awesome Lists — Pull Request Drafts

These drafts provide copy-paste markdown entries and PR descriptions for curated lists.

---

## 1. awesome-running / open-athletics

**Target repo:** \`dkhamsing/open-athletics\` (or \`jokecamp/awesome-running\`)  
**Proposed section:** \`Web Apps\` or \`Analysis & Performance\`  
**Markdown entry:**
\`\`\`markdown
- [OTRI](https://otri.run/) - Open Trail Running Index: open-source trail race scoring and GPX course difficulty analysis with explained scores ([Source Code](https://github.com/OTRI-run/otri)).
\`\`\`
**PR Title:** Add OTRI to sports analytics / running apps  
**PR Body:**
> Adds OTRI (Open Trail Running Index), an MIT-licensed, open-source tool for trail running course measurement (GPX) and explained performance scoring. Live at https://otri.run with repository at https://github.com/OTRI-run/otri.

---

## 2. awesome-sports-analytics

**Target repo:** Curated Sports Analytics lists  
**Proposed section:** \`Running & Track / Outdoor Endurance\`  
**Markdown entry:**
\`\`\`markdown
- [OTRI](https://otri.run/) - Open Trail Running Index calculating flat-equivalent distance and physiological cost model (Minetti et al.) for trail races ([Code](https://github.com/OTRI-run/otri)).
\`\`\`
**PR Title:** Add OTRI open trail running index  
**PR Body:**
> Adds OTRI, an open-source performance index implementation for trail running that models physiological course demand and recency-weighted athlete indices.

---

## 3. awesome-gpx / awesome-gis

**Target repo:** GPX and geospatial tool lists  
**Proposed section:** \`Elevation & Track Analysis\`  
**Markdown entry:**
\`\`\`markdown
- [OTRI Course Measurement](https://github.com/OTRI-run/otri) - Python & browser GPX analyzer computing 3D distance, segment gradients, and DEM elevation verification for trail running courses.
\`\`\`
`

writeFileSync(resolve(TRACKING_DIR, 'wikidata-quickstatements.txt'), wikidataQuickStatements, 'utf8')
writeFileSync(resolve(TRACKING_DIR, 'alternativeto-payload.json'), JSON.stringify(alternativeToPayload, null, 2) + '\n', 'utf8')
writeFileSync(resolve(TRACKING_DIR, 'awesome-lists-prs.md'), awesomeListsPrs, 'utf8')

console.log('directory-sync: generated Wikidata, AlternativeTo, and Awesome list payloads in marketing/tracking/')
