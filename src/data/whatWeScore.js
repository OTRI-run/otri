// What OTRI can score, and how far to trust it: the data behind the table the calculator, Score my
// race and the FAQ show (src/components/WhatWeScore.jsx), kept as plain data so the site's static
// FAQ page (scripts/site/legal-pages.mjs) can render it at build time without React. It states the
// model's limits as they are in the code (scoring/course_standard.py: the confidence rules); when
// those change, change this.

export const WHAT_WE_SCORE = [
  ['yes', 'Trail and mountain races', 'From about 5 km to 100 miles and beyond. This is what the model was built for.'],
  ['beta', 'Vertical races', 'Uphill-only courses are scored from the GPX. The setting for them rests on few races so far, so it is still being tested and every score says Low confidence.'],
  ['no', 'Races with no fixed course', '24-hour and backyard races, relays, a stage race as a whole. One stage can be scored on its own.'],
]

export const NOT_MEASURED =
  'What a score does not see: how technical the ground is, mud, snow, heat or darkness. Two courses with the same profile count the same. Altitude above 1,500 m is counted.'
