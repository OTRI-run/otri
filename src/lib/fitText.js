// Names come from organizers and files, and they come long: "Hardrock 100 Clockwise 2026 · 160K"
// in a headline sized for "Doi Trail · 25K" runs to three heavy lines or off the side of a phone.
// A headline that shows a name asks here how large it may be.

/**
 * A CSS font-size for a headline showing `text`: `clamp(min, vw, max)` as designed for a short name,
 * scaled down as the name grows. Pair it with the `otri-fit` class (balanced lines, and a break
 * inside a word only when a single word is wider than the column).
 */
export function fitFontSize(text, { min, vw, max }) {
  const length = String(text ?? '').trim().length
  const scale = length <= 18 ? 1 : length <= 28 ? 0.86 : length <= 40 ? 0.74 : length <= 56 ? 0.64 : 0.56
  const floor = Math.max(22, Math.round(min * Math.max(scale, 0.85)))
  return `clamp(${floor}px, ${(vw * scale).toFixed(2)}vw, ${Math.round(max * scale)}px)`
}
