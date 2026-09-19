import { DISTANCE_NAMES, PLACES } from '../lib/placeNames'

/** `<input list={PLACE_NAME_LIST}>` anywhere on a page that renders <PlaceNameList /> once: towns
 * and areas where trail races are held, plus `extra` (the organizer's own earlier locations), as
 * typing suggestions. The field stays free text. */
export const PLACE_NAME_LIST = 'otri-place-names'
export const DISTANCE_NAME_LIST = 'otri-distance-names'

export default function PlaceNameList({ extra = [] }) {
  const own = [...new Set(extra.filter(Boolean))]
  const known = PLACES.map(([name]) => name).filter((name) => !own.includes(name))
  return (
    <datalist id={PLACE_NAME_LIST}>
      {[...own, ...known].map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
}

/** How a race distance is usually listed: "50K", "100 mile", "Vertical". */
export function DistanceNameList() {
  return (
    <datalist id={DISTANCE_NAME_LIST}>
      {DISTANCE_NAMES.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
}
