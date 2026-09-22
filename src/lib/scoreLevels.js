// Where a score stands, in words. A reading aid on top of the model, not part of it: the model says
// "this is 66% of the fastest pace a human has held on a course this demanding" (score 702), and
// these bands give that a name a runner already uses.
//
// The edges are round scores, and what they mean is exact, not estimated: a score is
// 1000 x share^0.85 (docs/methodology/0.1.0/HOW-OTRI-SCORES.md), so every score is a share of
// world-best speed, and because the ceiling curve runs through the marathon world best, that share
// is also a time on a flat road marathon: 700 is 3:03, 600 is 3:40, 500 is 4:33, 400 is 5:54. No claim is made
// about how many runners are in a band: OTRI has no such data yet, and would not guess.
//
// Trail scores run a little lower than the road times suggest, because rough ground slows everyone
// and the model does not yet measure it; the FAQ says so.

export const MARATHON_WORLD_BEST_SECONDS = 2 * 3600 + 35 // 2:00:35, one of the three anchors of the ceiling curve
export const MODEL_EXPONENT = 0.85

export const LEVELS = [
  { id: 'beyond', from: 1000, name: 'Beyond the record', short: 'Record+', blurb: 'Faster than a record run on a course like this. For a target, a dream; for a result, check the course and the time.' },
  { id: 'world', from: 900, name: 'World class', short: 'World', blurb: 'The pace of the best in the world. A winning 100-mile mountain run scored 984.' },
  { id: 'elite', from: 800, name: 'Elite', short: 'Elite', blurb: 'Professional and national-level pace.' },
  { id: 'expert', from: 700, name: 'Expert', short: 'Expert', blurb: 'Years of structured training: the pace of a three-hour road marathoner and faster.' },
  { id: 'advanced', from: 600, name: 'Advanced', short: 'Advanced', blurb: 'A trained, experienced runner.' },
  { id: 'trained', from: 500, name: 'Trained', short: 'Trained', blurb: 'Runs regularly and races with a plan.' },
  { id: 'intermediate', from: 400, name: 'Intermediate', short: 'Intermed.', blurb: 'Finishes comfortably, running most of the way.' },
  { id: 'recreational', from: 300, name: 'Recreational', short: 'Recreat.', blurb: 'Out for the day: running the flats and downs, walking the climbs.' },
  { id: 'beginner', from: 0, name: 'Beginner', short: 'Beginner', blurb: 'Hiking pace, or a first race. Everyone starts here.' },
]

export function levelFor(score) {
  return LEVELS.find((level) => score >= level.from) ?? LEVELS[LEVELS.length - 1]
}

// Share of world-best speed behind a score. The exponent is read off the estimate itself when it
// can be (raw score and share both come from the API), so this follows the model, not a copy of it.
export function exponentOf(estimate) {
  const share = estimate?.breakdown?.fraction_of_ceiling
  const raw = estimate?.otri_raw
  if (share > 0 && raw > 0 && Math.abs(share - 1) > 0.02) {
    const exponent = Math.log(raw / 1000) / Math.log(share)
    if (exponent > 0.5 && exponent < 1.5) return exponent
  }
  return MODEL_EXPONENT
}

export function shareForScore(score, exponent = MODEL_EXPONENT) {
  return Math.pow(Math.max(score, 1) / 1000, 1 / exponent)
}

// The same share of world-best speed on a flat road marathon, in seconds.
export function marathonSecondsForShare(share) {
  return share > 0 ? Math.round(MARATHON_WORLD_BEST_SECONDS / share) : null
}

// What it takes to reach the next band: its name and first score, or null at the top.
export function nextLevel(score) {
  const index = LEVELS.indexOf(levelFor(score))
  return index > 0 ? LEVELS[index - 1] : null
}
