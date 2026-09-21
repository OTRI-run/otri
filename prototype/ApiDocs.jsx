import { useState } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { API_BASE_URL } from './apiClient'

// The public contract of the scoring tool: the three calls that need no account, and the
// calculator as an iframe. The full, generated reference is the API's own /docs.

const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'
const EMBED_URL = new URL('./embed/', window.location.href.split('#')[0]).href

const SCORE_CURL = `curl -X POST ${API_BASE_URL}/score \\
  -F "results=@results.csv" \\
  -F "gpx=@course.gpx" \\
  -F "race_name=Doi Suthep Trail 30K"`

const SCORE_CSV_CURL = `# The scored list as a CSV download
curl -X POST "${API_BASE_URL}/score?format=csv" \\
  -F "results=@results.xlsx" -F "gpx=@course.gpx" \\
  -o scored.csv`

const SCORE_JS = `const form = new FormData()
form.append('results', resultsFile)   // CSV or Excel
form.append('gpx', courseFile)        // the official track of the race

const response = await fetch('${API_BASE_URL}/score', { method: 'POST', body: form })
const race = await response.json()

if (!race.is_valid) console.table(race.errors)   // row, field, message
else console.table(race.scores)                  // rank, name, finish_time_seconds, otri_score`

const SCORE_RESPONSE = `{
  "stored": false,
  "is_valid": true,
  "scoring_version": "0.10.0-course-standard-vertical",
  "course": {
    "name": "Doi Suthep Trail 30K", "source": "gpx",
    "distance_km": 30.412, "elevation_gain_m": 1874.0,
    "confidence": "High", "quality_flags": [], "not_scored_reason": null
  },
  "summary": { "finishers": 412, "non_finishers": 38, "best_score": 811, "median_score": 487 },
  "errors": [], "warnings": [ { "severity": "warning", "row": 17, "field": "nationality", "message": "…" } ],
  "scores": [
    { "rank": 1, "bib_number": "101", "family_name": "Srisuk", "first_name": "Anong", "gender": "F",
      "finish_time_seconds": 11553, "otri_score": 811, "confidence": "High", "status": "finisher",
      "performance_rate": 0.7312, "quality_flags": [] }
  ],
  "measurement": { "version": "course-measurement-v3", "status": "ok", "…": "…" }
}`

const ANALYZE_CURL = `# One runner, one target time (4:30:00) on a course
curl -X POST ${API_BASE_URL}/gpx/analyze \\
  -F "file=@course.gpx" -F "finish_time_seconds=16200"`

const EMBED_SNIPPET = `<iframe id="otri-calculator" title="OTRI score calculator"
  src="${EMBED_URL}?race=YOUR_RACE_ID"
  style="width:100%;height:900px;border:0" loading="lazy"></iframe>
<script>
  // Optional: let the frame grow to its content instead of scrolling.
  addEventListener('message', (event) => {
    if (event.origin === '${new URL(EMBED_URL).origin}' && event.data?.type === 'otri:height')
      document.getElementById('otri-calculator').style.height = event.data.height + 'px'
  })
</script>`

function Code({ children, label }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // no clipboard access: the text is selectable
    }
  }
  return (
    <div className="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <span className="font-mono text-[9px] uppercase tracking-[.08em] text-slate-400">{label}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-300 hover:text-white">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-5 text-slate-100"><code>{children}</code></pre>
    </div>
  )
}

function Endpoint({ method, path, children }) {
  return (
    <section className="mt-10 min-w-0 scroll-mt-24" id={path.replace(/\W+/g, '-').replace(/^-/, '')}>
      <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-[-.02em] text-[#0b1220]">
        <span className="rounded-md bg-blue-600 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">{method}</span>
        <code className="font-mono text-lg">{path}</code>
      </h2>
      <div className="mt-2 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  )
}

export default function ApiDocs() {
  return (
    <>
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_78%_28%,rgba(37,99,235,.12),transparent_30%),linear-gradient(180deg,#fff_0%,#f8fbff_100%)]">
        <div className={`${CONTAINER} py-12 sm:py-14`}>
          <div className="font-mono text-[10px] font-medium tracking-[.1em] text-blue-600">
            OPEN TRAIL RUNNING INDEX <span className="text-slate-300">·</span> API AND EMBED
          </div>
          <h1 className="mt-5 max-w-[760px] text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-.06em] text-[#0b1220]">
            Scoring as a tool,
            <br />
            <em className="not-italic bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 bg-clip-text text-transparent">not a gatekeeper.</em>
          </h1>
          <p className="mt-5 max-w-[680px] text-base leading-7 text-slate-600">
            Everything the site does with a course and a results file is a public HTTP call: free, with no key, no account and no approval. Use it from a timing system, a race website or a notebook. The model is open source, so a score from the API can be recomputed by anyone.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] tracking-[.06em] text-slate-600">
            {['FREE', 'NO API KEY', 'ANY ORIGIN (CORS)', 'VERSIONED MODEL'].map((tag) => (
              <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      <div className={`${CONTAINER} grid min-w-0 gap-10 pb-20 lg:grid-cols-[minmax(0,1fr)_300px]`}>
        <div className="min-w-0">
          <Endpoint method="POST" path="/score">
            <p>
              A results file validated and scored against a course. Send <code>results</code> (CSV or Excel) and the course as <code>gpx</code>. Both are required: a score rests on where the climbing is, which a distance and a climb figure cannot say. Optional: <code>race_name</code>, <code>scoring_version</code>, and <code>?format=csv</code> for a download instead of JSON. The GUI for this call is <a href="#score" className="font-semibold text-blue-600 no-underline hover:underline">Score my race</a>.
            </p>
            <Code label="curl">{SCORE_CURL}</Code>
            <Code label="curl · CSV back">{SCORE_CSV_CURL}</Code>
            <Code label="javascript · from any website">{SCORE_JS}</Code>
            <Code label="response (shortened)">{SCORE_RESPONSE}</Code>
            <ul className="mt-4 list-disc space-y-1.5 pl-5">
              <li>A results file with errors answers <code>200</code> with <code>is_valid: false</code>, the <code>errors</code> by row and field, and no scores. A file that cannot be read at all, or a broken course file, answers <code>422</code>.</li>
              <li><code>course.confidence</code> is <code>High</code> only when the course was measured against verified terrain data; otherwise <code>Low</code>, with the reasons in <code>course.quality_flags</code>. An uphill-only course comes back with finish times and <code>otri_score: null</code>, and <code>course.not_scored_reason</code> says why.</li>
              <li>The results file is the export you already have (timing company, ITRA or UTMB sheet): CSV, TSV or XLSX, with a finish time and a name. Position, gender (also from a category such as SEH or M40-44), status, bib, nationality and birth year are read where present; headers are matched in eight languages. The answer's <code>columns</code> and <code>ignored_columns</code> say how the file was read.</li>
            </ul>
          </Endpoint>

          <Endpoint method="POST" path="/gpx/analyze">
            <p>
              One course measured, and with <code>finish_time_seconds</code> one time scored on it: the call behind the <a href="#calculator" className="font-semibold text-blue-600 no-underline hover:underline">calculator</a>. The answer carries the measured course (<code>features</code>, <code>measurement</code>) and the <code>estimate</code> with every intermediate of the score in <code>breakdown</code>.
            </p>
            <Code label="curl">{ANALYZE_CURL}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/scoring/models">
            <p>The scoring model versions this API can score with: today one, OTRI model 0.1.0. Every score names its <code>scoring_version</code>, and a published version never changes its output, so a score can be recomputed next year.</p>
          </Endpoint>

          <section className="mt-12 min-w-0 scroll-mt-24" id="embed">
            <h2 className="text-xl font-bold tracking-[-.02em] text-[#0b1220]">The calculator on your website</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Runners try a target time on your course before race day. Paste the snippet where the calculator should appear. <code>?race=</code> takes the id of a race published on OTRI (it is in the race page's address); <code>?gpx=</code> takes a course shared from the calculator's Share button; with neither, the visitor uploads a course. <code>&amp;t=16200</code> presets a time in seconds.
            </p>
            <Code label="html">{EMBED_SNIPPET}</Code>
            <p className="mt-3 text-sm">
              <a href={EMBED_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 no-underline hover:underline">
                Open the embedded calculator on its own <ArrowUpRight size={13} />
              </a>
            </p>
          </section>
        </div>

        <aside className="min-w-0 lg:pt-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 lg:sticky lg:top-24">
            <p className="font-mono text-[9px] tracking-[.08em] text-slate-500">BASE URL</p>
            <p className="mt-1 break-all font-mono text-xs text-[#0b1220]">{API_BASE_URL}</p>
            <p className="mt-4 font-mono text-[9px] tracking-[.08em] text-slate-500">FAIR USE</p>
            <ul className="mt-1 space-y-1.5">
              <li><code>/score</code>: 10 calls a minute per address</li>
              <li><code>/gpx/analyze</code>: 60 a minute</li>
              <li>20 MB per request, 50,000 result rows</li>
              <li>Over the limit answers <code>429</code> with <code>Retry-After</code></li>
            </ul>
            <p className="mt-4 font-mono text-[9px] tracking-[.08em] text-slate-500">YOUR FILES</p>
            <p className="mt-1"><code>/score</code> answers and forgets: the files are not kept and no race is created. To keep a race and show it to runners, publish it from an organizer account.</p>
            <p className="mt-4 font-mono text-[9px] tracking-[.08em] text-slate-500">STABILITY</p>
            <p className="mt-1">The project is pre-1.0. Fields are added, not renamed; a change to how scores are computed is always a new <code>scoring_version</code>, never a silent change to an old one.</p>
            <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 font-semibold text-blue-600 no-underline hover:underline">
              Full reference (OpenAPI) <ArrowUpRight size={13} />
            </a>
          </div>
        </aside>
      </div>
    </>
  )
}
