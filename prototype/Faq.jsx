import { WhatWeScoreTable } from '../src/components/WhatWeScore'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Mail, Search } from 'lucide-react'
import NextSteps from './NextSteps'
import { QuestionArt, TITLE_ART } from '../src/components/PageArt'
import { FAQ } from '../src/data/faq'

const DOCS = 'https://github.com/OTRI-run/otri/blob/main'
const CONTAINER = 'mx-auto w-[min(1120px,calc(100%-28px))]'

const ALL = FAQ.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group })))

function normalise(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function FaqPage({ initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  // A new #faq?q=… link while the page is already open (or the FAQ nav link, which clears it).
  useEffect(() => setQuery(initialQuery), [initialQuery])
  const words = useMemo(() => normalise(query).split(/\s+/).filter(Boolean), [query])
  const matches = useMemo(() => {
    if (!words.length) return ALL
    return ALL.filter((item) => {
      const hay = normalise(`${item.q} ${item.a} ${item.tags} ${item.group} ${item.search ?? ''}`)
      return words.every((word) => hay.includes(word))
    })
  }, [words])

  // Keep the search in the URL so an answer can be shared: #faq?q=zero
  useEffect(() => {
    const next = query ? `#faq?q=${encodeURIComponent(query)}` : '#faq'
    if (window.location.hash !== next && window.location.hash.startsWith('#faq')) window.history.replaceState(null, '', next)
  }, [query])

  const groups = FAQ.map((group) => ({ ...group, items: group.items.filter((item) => matches.includes(item) || matches.some((m) => m.q === item.q)) })).filter((g) => g.items.length)

  return (
    <section className="bg-[linear-gradient(135deg,#f3f7fc_0%,#eef4ff_55%,#f7fbff_100%)] py-14 sm:py-20">
      <div className={CONTAINER}>
        {/* The same two-column header as the races page: see Runners.jsx. */}
        <div className="grid min-w-0 items-end gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]">
          <div className="min-w-0">
            <p className="mb-3 font-mono text-[10px] tracking-[.08em] text-slate-500">QUESTIONS</p>
            <div className="flex items-center gap-4 sm:gap-6">
              <QuestionArt className={TITLE_ART} />
              <h1 className="min-w-0 text-[clamp(38px,5vw,62px)] font-bold leading-[.94] tracking-[-.06em] text-[#0b1220]">
                Asked often.
                <br />
                <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">Answered plainly.</span>
              </h1>
            </div>
          </div>
          <p className="min-w-0 text-sm leading-7 text-slate-500">
            Short answers about scores, courses, the runner index and publishing a race. The long answers live in the
            methodology pages, linked where they matter.
          </p>
        </div>

        <div className="mt-10 max-w-[640px]">
          <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the questions, e.g. zero, GPX, confidence, cost…"
            aria-label="Search the FAQ"
            autoFocus={Boolean(initialQuery)}
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-9 pr-3 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-500" aria-live="polite">
            {query ? `${matches.length} of ${ALL.length} questions match` : `${ALL.length} questions`}
          </p>
        </div>

        {groups.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Nothing matches <b>{query}</b>. Ask us directly:{' '}
            <a href={`mailto:hello@otri.run?subject=${encodeURIComponent(`Question: ${query}`)}`} className="inline-flex items-center gap-1 font-semibold text-blue-600 no-underline hover:underline">
              <Mail size={14} /> hello@otri.run
            </a>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.group} className="mt-10">
            <h2 className="mb-3 font-mono text-[11px] font-normal tracking-[.08em] text-slate-600">{group.group.toUpperCase()}</h2>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,.04)]">
              {group.items.map((item) => (
                <details key={item.q} open={words.length > 0} className="group px-5 py-4 sm:px-6">
                  <summary className="cursor-pointer list-none text-[15px] font-semibold text-[#0b1220] marker:content-none">
                    {/* The question is a heading, so the FAQ can be moved through by headings.
                        A <summary> on its own is not one, which left ~30 questions unreachable
                        that way. The h3 sits inside the summary so the disclosure still works. */}
                    <span className="flex items-start justify-between gap-4">
                      <h3 className="m-0 text-[15px] font-semibold">{item.q}</h3>
                      <span aria-hidden="true" className="mt-1 shrink-0 font-mono text-xs text-slate-500 transition group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[720px] text-sm leading-7 text-slate-600">{item.a}</p>
                  {item.table && <WhatWeScoreTable className="mt-3 max-w-[720px]" />}
                  {item.link && (
                    <a href={item.link[0]} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 no-underline hover:underline" target={item.link[0].startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                      {item.link[1]} <ArrowUpRight size={14} />
                    </a>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}

        <NextSteps
          items={[
            ['Still a question?', 'Write to us; answers that come up more than once end up on this page.', 'hello@otri.run', 'mailto:hello@otri.run'],
            ['See it work', 'Pick a course, drag a time, watch the score and its reasoning update.', 'Calculate your score', '#calculator'],
            ['Why these numbers?', 'The plain-language explainer, then every constant in the model.', 'How a score is made', '/how-otri-scores/'],
          ]}
        />
      </div>
    </section>
  )
}
