import { useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { willNavigate } from '../lib/comfort'

/**
 * A search box that also offers the best few matches to jump to: type "sri", press the arrow and
 * Enter, and the runner's page opens without scanning the list. The list below the box keeps
 * filtering as before; suggestions are a shortcut, not a replacement.
 *
 * `suggestions`: [{ key, label, detail, href }], already ranked and cut by the caller. One without
 * `href` is a well-known name OTRI has nothing for yet: it is drawn muted, and choosing it puts the
 * name in the box, so the page below can say what to do about it.
 */
export default function SearchSuggest({ value, onChange, suggestions, placeholder, ariaLabel, className = '' }) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const shown = open && value.trim().length >= 2 && suggestions.length > 0

  function go(suggestion) {
    setOpen(false)
    if (!suggestion.href) return onChange(suggestion.label)
    willNavigate()
    window.location.hash = suggestion.href
  }

  function onKeyDown(event) {
    if (!shown) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => {
        const next = index + (event.key === 'ArrowDown' ? 1 : -1)
        return next < -1 ? suggestions.length - 1 : next >= suggestions.length ? -1 : next
      })
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      go(suggestions[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false) }}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-[3px] border border-rule bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {shown && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-[3px] border border-rule bg-white py-1 ">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              tabIndex={-1}
              onMouseDown={(event) => { event.preventDefault(); go(suggestion) }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${index === active ? 'bg-wash' : ''}`}
            >
              <span className={`min-w-0 truncate font-medium ${suggestion.href ? 'text-ink' : 'text-muted'}`}>{suggestion.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted">{suggestion.detail}</span>
            </li>
          ))}
          <li className="border-t border-rule px-3 pt-1.5 pb-1 font-mono text-[9px] tracking-[.06em] text-muted" aria-hidden="true">↑ ↓ TO CHOOSE · ENTER TO OPEN</li>
        </ul>
      )}
    </div>
  )
}
