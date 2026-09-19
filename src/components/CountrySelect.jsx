import { useEffect, useId, useMemo, useRef, useState } from 'react'
import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'
import 'flag-icons/css/flag-icons.min.css'

countries.registerLocale(en)

const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Every country by its English name, valued as the ISO 3166-1 alpha-3 code the API and the result
// files use. Nobody has to know that Thailand is "THA": typing "thai", "TH", "THA", "UK", "Holland"
// or "south korea" all find their country (the library's alternative names, plus both codes).
const OPTIONS = Object.entries(countries.getNames('en', { select: 'all' }))
  .map(([alpha2, names]) => {
    const all = Array.isArray(names) ? names : [names]
    const code = countries.alpha2ToAlpha3(alpha2)
    return { code, alpha2: alpha2.toLowerCase(), name: countries.getName(alpha2, 'en', { select: 'official' }), keys: [...all.map(fold), alpha2.toLowerCase(), (code ?? '').toLowerCase()] }
  })
  .filter((option) => option.code)
  .sort((a, b) => a.name.localeCompare(b.name))
const EXTRA_NAMES = { NLD: ['holland'], GBR: ['england', 'scotland', 'wales', 'britain'], USA: ['america'], ARE: ['uae', 'emirates'], LAO: ['laos'], SYR: ['syria'], MDA: ['moldova'], MKD: ['macedonia'], MMR: ['burma'] }
for (const option of OPTIONS) option.keys.push(...(EXTRA_NAMES[option.code] ?? []))
const BY_CODE = new Map(OPTIONS.map((option) => [option.code, option]))
const SHOWN = 8

/** English name for an ISO alpha-3 code, or the code itself when unknown. */
export function countryName(code) {
  if (!code) return ''
  const alpha2 = countries.alpha3ToAlpha2(String(code).toUpperCase())
  return (alpha2 && countries.getName(alpha2, 'en', { select: 'official' })) || code
}

// Best first: a name or code that starts with what was typed, then a word inside a name that does,
// then anything that contains it.
function search(text) {
  const query = fold(text)
  if (!query) return []
  const ranked = []
  for (const option of OPTIONS) {
    let rank = 9
    for (const key of option.keys) {
      if (key === query) rank = Math.min(rank, 0)
      else if (key.startsWith(query)) rank = Math.min(rank, 1)
      else if (key.split(' ').some((word) => word.startsWith(query))) rank = Math.min(rank, 2)
      else if (query.length > 2 && key.includes(query)) rank = Math.min(rank, 3)
    }
    if (rank < 9) ranked.push([rank, option])
  }
  return ranked.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, option]) => option)
}

// With nothing typed yet, the visitor's own country (from the browser's language) is the best guess.
function localGuess() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    const code = region && countries.alpha2ToAlpha3(region)
    return code ? BY_CODE.get(code) : null
  } catch {
    return null
  }
}

/** A country field you type into: suggestions as you go, arrow keys and Enter to pick, a code out. */
export default function CountrySelect({ id, value, onChange, className = '', placeholder = 'Start typing a country' }) {
  const listId = useId()
  const rootRef = useRef(null)
  const selected = value ? BY_CODE.get(String(value).toUpperCase()) : null
  const [text, setText] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // A value set from outside (a loaded profile, a reset form) shows as its name.
  useEffect(() => {
    setText(selected?.name ?? '')
  }, [selected?.code]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    if (fold(text) && text !== selected?.name) return search(text).slice(0, SHOWN)
    const guess = localGuess()
    return guess ? [guess, ...OPTIONS.filter((option) => option !== guess)].slice(0, SHOWN) : OPTIONS.slice(0, SHOWN)
  }, [text, selected?.name])

  function choose(option) {
    onChange(option.code)
    setText(option.name)
    setOpen(false)
  }

  // Leaving the field: what was typed becomes its best match, and an emptied field clears the value.
  function settle() {
    setOpen(false)
    if (!fold(text)) {
      if (value) onChange('')
      return
    }
    if (text === selected?.name) return
    const best = search(text)[0]
    if (best) choose(best)
    else setText(selected?.name ?? '')
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (options.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : 0))
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault() // pick the country, do not submit the form
      choose(options[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative" onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) settle() }}>
      <div className="relative">
        {selected && text === selected.name && <span className={`fi fi-${selected.alpha2} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-[2px]`} aria-hidden="true" />}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={placeholder}
          onChange={(event) => { setText(event.target.value); setOpen(true); setActive(0) }}
          onFocus={(event) => { setOpen(true); event.target.select() }}
          onKeyDown={onKeyDown}
          className={className}
          style={selected && text === selected.name ? { paddingLeft: '2.4rem' } : undefined}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-[0_18px_44px_rgba(15,23,42,.14)]">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No country matches “{text}”.</li>}
          {options.map((option, index) => (
            <li
              key={option.code}
              id={`${listId}-${option.code}`}
              role="option"
              aria-selected={index === active}
              tabIndex={-1}
              onMouseDown={(event) => { event.preventDefault(); choose(option) }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${index === active ? 'bg-blue-50 text-[#0b1220]' : 'text-slate-700'}`}
            >
              <span className={`fi fi-${option.alpha2} shrink-0 rounded-[2px]`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{option.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
