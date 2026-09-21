import { Medal, Trophy } from 'lucide-react'

// First, second and third as a results list shows them everywhere: a gold trophy, a silver and a
// bronze medal, beside the number. Any other rank, and DNF / DNS / DSQ, is the plain text it was.
const PODIUM = {
  1: { Icon: Trophy, color: '#d4a017', label: 'Winner' },
  2: { Icon: Medal, color: '#8a94a6', label: 'Second place' },
  3: { Icon: Medal, color: '#b0713b', label: 'Third place' },
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
