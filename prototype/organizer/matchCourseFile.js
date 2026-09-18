// Guess which race a course file belongs to from its file name, for the admin's bulk upload.
// A guess only pre-fills the row; the admin sees it and can change it before anything is sent.

const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.gpx$/, '')
    .replace(/(\d)\s*(km|k|mi|miles?)\b/g, '$1$2')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 || /\d/.test(word))

// "50k", "50km" and "50" name the same distance.
const distanceKey = (word) => word.match(/^(\d+)(k|km)?$/)?.[1] ?? null

function score(fileWords, race) {
  const fileDistances = new Set(fileWords.map(distanceKey).filter(Boolean))
  const eventWords = new Set(words(race.event_name))
  const year = String(race.event_date ?? '').slice(0, 4)
  let points = 0
  for (const word of new Set(fileWords)) {
    if (eventWords.has(word)) points += 2
    else if (word === year) points += 1
  }
  if (!points) return 0 // a distance alone ("50k.gpx") says nothing about which event
  const courseDistances = [...words(race.course_name).map(distanceKey).filter(Boolean), String(Math.round(race.distance_km ?? 0))]
  if (courseDistances.some((d) => fileDistances.has(d))) points += 3
  else if (fileDistances.size) points -= 2 // names another distance of the same event
  for (const word of words(race.course_name)) if (!distanceKey(word) && fileWords.includes(word)) points += 1
  return points
}

/** The race this file most plausibly is, or null when nothing matches or two races tie. */
export function guessRace(fileName, races) {
  const fileWords = words(fileName)
  const ranked = races.map((race) => ({ race, points: score(fileWords, race) })).sort((a, b) => b.points - a.points)
  const [best, next] = ranked
  if (!best || best.points < 3) return null
  if (next && next.points === best.points) return null
  return best.race
}
