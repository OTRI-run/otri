import { Medal, Trophy } from '../ui/icons'

// First, second and third as a results list shows them everywhere: a gold trophy, a silver and a
// bronze medal, beside the number. Any other rank, and DNF / DNS / DSQ, is the plain text it was.
const PODIUM = {
  1: { Icon: Trophy, color: 'var(--gold)', label: 'Winner' },
  2: { Icon: Medal, color: 'var(--silver)', label: 'Second place' },
  3: { Icon: Medal, color: 'var(--bronze)', label: 'Third place' },
}

export default function RankBadge({ rank }) {
  const place = PODIUM[Number(rank)]
  if (!place || !/^\d+$/.test(String(rank))) return <>{rank}</>
  const { Icon, color, label } = place
  return (
    <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }} title={label}>
      <Icon size={16} strokeWidth={2.2} />
      <span className="ink">{rank}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
