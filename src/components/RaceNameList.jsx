import { RACE_NAMES } from '../lib/raceNames'

/** `<input list={RACE_NAME_LIST}>` anywhere on a page that renders this once: well-known race names
 * as typing suggestions. The field stays free text. */
export const RACE_NAME_LIST = 'otri-race-names'

export default function RaceNameList() {
  return (
    <datalist id={RACE_NAME_LIST}>
      {RACE_NAMES.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
}
