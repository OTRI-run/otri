import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, Share2 } from 'lucide-react'
import { FORMATS, canvasToBlob, drawLeaderboard, drawRunnerCard, drawScoreCard } from './shareImage'

// Sharing, for the two people who have something to show: an organizer with scored results (a
// podium image and a post written for them) and a runner with a target time. The image is drawn in
// the browser and the text is only a suggestion to edit; nothing is posted or stored by OTRI.

function formatHms(totalSeconds) {
  if (totalSeconds == null) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${Math.floor(totalSeconds / 3600)}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(Math.round(totalSeconds % 60))}`
}

// A race name as a hashtag, when it makes a usable one: long names and names that are mostly
// digits read as noise, and a post is better without them.
function hashtag(text) {
  const tag = `#${String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(19|20)\d\d\b/g, '').replace(/[^A-Za-z0-9]+/g, '')}`
  return tag.length > 2 && tag.length <= 28 && (tag.match(/[0-9]/g) ?? []).length <= 6 ? tag : ''
}
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'otri'

function Choice({ label, options, value, onChange }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] tracking-[.08em] text-muted">{label}</p>
      <div className="mt-1.5 inline-flex flex-wrap overflow-hidden rounded-[3px] border border-rule bg-white">
        {options.map(([id, text, title]) => (
          <button key={id} type="button" title={title} onClick={() => onChange(id)} aria-pressed={value === id} className={`px-3 py-1.5 text-xs font-semibold transition ${value === id ? 'bg-ink text-white' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

// The preview, the suggested text and what to do with them. `draw(canvas, format)` paints the image.
function Panel({ draw, fileName, suggestedText, url, children }) {
  const canvasRef = useRef(null)
  const [format, setFormat] = useState('post')
  const [text, setText] = useState(suggestedText)
  const [edited, setEdited] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, format)
  }, [draw, format])
  // A new suggestion replaces the text until the visitor has made it their own.
  useEffect(() => {
    if (!edited) setText(suggestedText)
  }, [suggestedText, edited])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copying is blocked in this browser: select the text and copy it by hand.')
    }
  }

  async function download() {
    const blob = await canvasToBlob(canvasRef.current)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${fileName}-${format}.png`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function share() {
    setError(null)
    try {
      const file = new File([await canvasToBlob(canvasRef.current)], `${fileName}-${format}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text })
      else await navigator.share({ text, url })
    } catch (err) {
      if (err?.name !== 'AbortError') setError('This browser cannot hand the image to an app: download it and attach it to your post.')
    }
  }

  const ratio = FORMATS[format].width / FORMATS[format].height
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <canvas ref={canvasRef} aria-label="Preview of the share image" className="mx-auto block w-full max-w-[300px] rounded-[3px] " style={{ aspectRatio: String(ratio) }} />
        <p className="mt-2 text-center font-mono text-[10px] text-muted">{FORMATS[format].width} × {FORMATS[format].height} · {FORMATS[format].hint}</p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {children}
          <Choice label="FORMAT" value={format} onChange={setFormat} options={Object.entries(FORMATS).map(([id, f]) => [id, f.label, f.hint])} />
        </div>
        <label className="mt-4 block font-mono text-[9px] tracking-[.08em] text-muted">
          TEXT FOR YOUR POST · EDIT IT FREELY
          <textarea value={text} onChange={(event) => { setText(event.target.value); setEdited(true) }} rows={9} className="mt-1.5 w-full rounded-[3px] border border-rule bg-white px-3 py-2.5 font-sans text-sm leading-6 tracking-normal text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        {edited && (
          <button type="button" onClick={() => setEdited(false)} className="mt-1 text-xs font-semibold text-accent hover:underline">Write it again from the selection</button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={download} className="inline-flex min-h-10 items-center gap-2 rounded-[3px] bg-ink px-4 text-xs font-semibold text-white">
            <Download size={14} /> Download image
          </button>
          <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-2 rounded-[3px] border border-rule bg-white px-4 text-xs font-semibold text-ink hover:border-accent">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Text copied' : 'Copy text'}
          </button>
          {(canShareFiles || typeof navigator?.share === 'function') && (
            <button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-[3px] border border-rule bg-white px-4 text-xs font-semibold text-ink hover:border-accent">
              <Share2 size={14} /> Share…
            </button>
          )}
        </div>
        {url && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            Or post the link:
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="font-semibold text-accent no-underline hover:underline">Facebook</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${text}`)}`} target="_blank" rel="noreferrer" className="font-semibold text-accent no-underline hover:underline">WhatsApp</a>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 240))}`} target="_blank" rel="noreferrer" className="font-semibold text-accent no-underline hover:underline">X</a>
          </p>
        )}
        {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
        <p className="mt-3 text-[11px] leading-5 text-muted">Facebook and Instagram take the image as an attachment: download it, then paste the text. On a phone, Share… hands both to the app.</p>
      </div>
    </div>
  )
}

const GROUPS = [
  ['all', 'Overall'],
  ['F', 'Women'],
  ['M', 'Men'],
]
const MEDAL_EMOJI = ['🥇', '🥈', '🥉']

/** For an organizer: the podium of a scored race. `scores` are the API's rows; `url` when the race has a public page. */
export function ShareResults({ raceName, distanceKm, elevationGainM, scores, url }) {
  const [count, setCount] = useState(3)
  const [group, setGroup] = useState('all')
  const finishers = useMemo(() => scores.filter((row) => row.status === 'finisher' && row.finish_time_seconds != null).sort((a, b) => a.finish_time_seconds - b.finish_time_seconds), [scores])
  const available = useMemo(() => GROUPS.filter(([id]) => id === 'all' || finishers.some((row) => row.gender === id)), [finishers])
  const rows = useMemo(
    () =>
      finishers
        .filter((row) => group === 'all' || row.gender === group)
        .slice(0, count)
        .map((row, index) => ({ place: index + 1, name: `${row.first_name} ${row.family_name}`.trim(), time: formatHms(row.finish_time_seconds), score: row.otri_score })),
    [finishers, group, count],
  )
  const name = raceName || 'Our race'
  const groupWord = group === 'F' ? ' women' : group === 'M' ? ' men' : ''
  const heading = `Top ${rows.length}${groupWord}`
  const facts = `${distanceKm.toFixed(1)} km · +${Math.round(elevationGainM)} m · ${finishers.length} finishers`
  const scored = rows.some((row) => row.score != null)

  const draw = useMemo(
    () => (canvas, format) => drawLeaderboard(canvas, { format, raceName: name, facts, heading: `${heading} · official results`, rows, note: scored ? 'Scored with the open OTRI model · otri.run' : 'otri.run' }),
    [name, facts, heading, rows, scored],
  )
  const suggestedText = useMemo(() => {
    const lines = rows.map((row, index) => `${MEDAL_EMOJI[index] ?? `${row.place}.`} ${row.name} · ${row.time}${row.score != null ? ` · OTRI ${row.score}` : ''}`)
    return [
      `🏁 ${name}: the results are in!`,
      '',
      `${heading}:`,
      ...lines,
      '',
      scored
        ? `All ${finishers.length} finishers are scored with the open OTRI model. A score depends only on the course and the runner's own time, never on who else raced, so it can be compared from race to race.`
        : `Congratulations to all ${finishers.length} finishers!`,
      ...(url ? ['', `Full results and every score explained: ${url}`] : []),
      '',
      [hashtag(name), '#trailrunning', '#trailrace', '#OTRI'].filter(Boolean).join(' '),
    ].join('\n')
  }, [rows, name, heading, scored, finishers.length, url])

  if (finishers.length === 0) return null
  return (
    <Panel draw={draw} fileName={`${slug(name)}-${heading.toLowerCase().replace(/\s+/g, '-')}`} suggestedText={suggestedText} url={url}>
      <Choice label="HOW MANY" value={count} onChange={setCount} options={[[3, 'Top 3'], [5, 'Top 5'], [10, 'Top 10']]} />
      {available.length > 1 && <Choice label="WHO" value={group} onChange={setGroup} options={available} />}
    </Panel>
  )
}

/** For a runner: a target time on a course and what it is worth. */
export function ShareTarget({ courseName, distanceKm, elevationGainM, seconds, score, fractionOfCeiling, url }) {
  const time = formatHms(seconds)
  const facts = `${distanceKm.toFixed(1)} km · +${Math.round(elevationGainM)} m`
  const percent = fractionOfCeiling != null ? Math.round(fractionOfCeiling * 100) : null
  const draw = useMemo(
    () => (canvas, format) =>
      drawScoreCard(canvas, { format, heading: 'My target', courseName, facts, time, score, detail: percent != null ? `${percent}% of the best a human has run over that much ground` : null, note: 'What is your time worth? · otri.run' }),
    [courseName, facts, time, score, percent],
  )
  const suggestedText = [
    `🎯 My target for ${courseName}: ${time}.`,
    `That would be worth ${score} OTRI points${percent != null ? `, ${percent}% of the best a human has run over that much ground` : ''}.`,
    '',
    url ? `What would your time be worth? Try it: ${url}` : 'What would your time be worth? Try any course at otri.run',
    '',
    [hashtag(courseName), '#trailrunning', '#OTRI'].filter(Boolean).join(' '),
  ].join('\n')
  return <Panel draw={draw} fileName={`${slug(courseName)}-target`} suggestedText={suggestedText} url={url} />
}

// A runner's profile: their index and best results, as an image and a post. Most people who share a
// profile share their own, so the text starts in the first person; "Someone else" rewrites it.
export function ShareRunner({ name, facts, index, provisional, results, url }) {
  const [mine, setMine] = useState(true)
  const best = useMemo(
    () => [...results].filter((result) => result.otri_score != null).sort((a, b) => b.otri_score - a.otri_score).slice(0, 3),
    [results],
  )
  const rows = useMemo(
    () => best.map((result) => ({ race: result.event_name, detail: [result.course_name, formatHms(result.finish_time_seconds), String(result.event_date ?? '').slice(0, 4)].filter(Boolean).join(' · '), score: result.otri_score })),
    [best],
  )
  const indexLabel = provisional ? 'Provisional OTRI index' : 'OTRI index'
  const draw = useMemo(
    () => (canvas, format) => drawRunnerCard(canvas, { format, heading: 'Runner index', name, facts, index, indexLabel, results: rows, note: 'One open score for any trail race · otri.run' }),
    [name, facts, index, indexLabel, rows],
  )
  const whose = mine ? 'My' : `${name}'s`
  const suggestedText = [
    index != null ? `🏃 ${whose} OTRI index: ${index}${provisional ? ' (provisional, fewer than three results so far)' : ''}.` : `🏃 ${whose} results on OTRI.`,
    ...(best.length
      ? ['', `${mine ? 'My best' : 'Best'} race${best.length === 1 ? '' : 's'}:`, ...best.map((result) => `• ${result.event_name} · ${result.course_name}: ${formatHms(result.finish_time_seconds)}, ${result.otri_score} points`)]
      : []),
    '',
    `${provisional ? 'The index becomes firm with three races in the last 24 months; until then it is provisional.' : `The index is the weighted mean of ${mine ? 'my' : 'the'} best three race scores of the last 24 months.`} A score depends only on the course and the time, never on who else raced.`,
    '',
    url ? `${mine ? 'My profile' : 'The profile'}: ${url}` : 'otri.run',
    '',
    '#trailrunning #OTRI',
  ].join('\n')
  return (
    <Panel draw={draw} fileName={`${slug(name)}-otri-index`} suggestedText={suggestedText} url={url}>
      <Choice label="WHOSE PROFILE" options={[['me', 'It is me'], ['other', 'Someone else']]} value={mine ? 'me' : 'other'} onChange={(id) => setMine(id === 'me')} />
    </Panel>
  )
}
