import { Medal, Trophy } from 'lucide-react'

// First, second and third as a results list shows them everywhere: a gold trophy, a silver and a
// bronze medal, beside the number. Any other rank, and DNF / DNS / DSQ, is the plain text it was.
const PODIUM = {
  1: { Icon: Trophy, color: '#d4a017', label: 'Winner' },
  2: { Icon: Medal, color: '#8a94a6', label: 'Second place' },
  3: { Icon: Medal, color: '#b0713b', label: 'Third place' },
}

// The whole row of a podium place, not only its badge: a wash of the medal's colour and a bar of
// it down the left edge, so first, second and third stand out of a long leaderboard at a glance.
// Anything else gets nothing, and the caller adds its own striping for those.
const PODIUM_ROW = {
  1: 'bg-[#fff8e1] border-l-4 border-l-[#d4a017] hover:bg-[#fff3c9]',
  2: 'bg-[#f4f6f9] border-l-4 border-l-[#8a94a6] hover:bg-[#eceff4]',
  3: 'bg-[#fbf1e8] border-l-4 border-l-[#b0713b] hover:bg-[#f7e7d8]',
}

// Fourth to tenth share one quieter mark, a blue wash and bar, so the top ten reads as a block
// under the three medals without competing with them.
const TOP_TEN_ROW = 'bg-blue-50/60 border-l-4 border-l-blue-300 hover:bg-blue-50'

/** Row classes for a podium rank, a top-ten rank, or '' for any other. */
export function podiumRowClass(rank) {
  if (!/^\d+$/.test(String(rank))) return ''
  const place = Number(rank)
  return PODIUM_ROW[place] ?? (place <= 10 ? TOP_TEN_ROW : '')
}

export default function RankBadge({ rank }) {
  const place = PODIUM[Number(rank)]
  if (!place || !/^\d+$/.test(String(rank))) return <>{rank}</>
  const { Icon, color, label } = place
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color }} title={label}>
      <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
      <span className="text-[#0b1220]">{rank}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
