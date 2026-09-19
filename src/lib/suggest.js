// Forgiving name matching for the search boxes: "geants tor" finds Tor des Géants, "dauwalter"
// finds Courtney Dauwalter. Accents, punctuation, case and word order are ignored.

export function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// -1: no match. 0: the name starts with what was typed. 1: every typed word starts a word of the
// name. 2: every typed word is somewhere inside it.
export function matchRank(name, query) {
  const words = normalise(query).split(' ').filter(Boolean)
  const target = normalise(name)
  if (words.length === 0 || !words.every((word) => target.includes(word))) return -1
  if (target.startsWith(words.join(' '))) return 0
  const parts = target.split(' ')
  return words.every((word) => parts.some((part) => part.startsWith(word))) ? 1 : 2
}

// The well-known names that match what was typed and are not on OTRI: offered so a visitor learns
// at once that the race or runner is not here yet, instead of staring at an empty list.
// `here`: the names OTRI does have (any of them containing the well-known name hides it).
export function knownButNotHere(names, query, here, limit = 5) {
  if (normalise(query).length < 2) return []
  const present = here.map(normalise)
  return names
    .map((name) => [name, matchRank(name, query)])
    .filter(([name, rank]) => rank >= 0 && !present.some((item) => item.includes(normalise(name))))
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length)
    .slice(0, limit)
    .map(([name]) => name)
}
