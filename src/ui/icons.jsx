// OTRI's own icons. One 24-unit grid, a 1.75 stroke, round caps and joins, drawn for this site
// so nothing on it comes from a stock set. Use them as <Icon name="mountain" /> or through the
// named exports below (<Mountain />). Every icon is decorative unless given a `title`.

const ICONS = {
  // arrows and chevrons
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  'arrow-left': 'M20 12H5M11 6l-6 6 6 6',
  'arrow-up': 'M12 20V5M6 11l6-6 6 6',
  'arrow-down': 'M12 4v15M6 13l6 6 6-6',
  'arrow-up-right': 'M7 17 17 7M8.5 7H17v8.5',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-up': 'M6 14.5l6-6 6 6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-left': 'M14.5 6l-6 6 6 6',
  // marks
  check: 'M4.5 12.5 9.5 17.5 19.5 7',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.7 2.7L16.5 9',
  x: 'M6 6l12 12M18 6 6 18',
  'x-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l4.5 4.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  alert: 'M12 3.5 21.5 20h-19L12 3.5ZM12 10v4.5M12 17.5h.01',
  'shield-check': 'M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6l-7-3ZM8.8 12.2l2.2 2.2 4.4-4.6',
  // actions
  mail: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4 19h16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  pencil: 'M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20ZM13.5 7l3.5 3.5',
  external: 'M14 4h6v6M20 4 11 13M18 14v6H4V6h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v7h14v-7',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'eye-off': 'M4 4l16 16M10 6c.7-.2 1.3-.3 2-.3 6 0 9.5 6.3 9.5 6.3s-1 1.9-3 3.6M6.5 8.4C4 10.2 2.5 12 2.5 12s3.5 6.3 9.5 6.3c1.4 0 2.6-.3 3.7-.8M9.9 9.9a3 3 0 0 0 4.2 4.2',
  key: 'M14.5 14.5a5 5 0 1 0-4.6-3L3 18.4V21h3v-2h2v-2h2l2.4-2.4c.7.3 1.4.4 2.1.4ZM15.5 8.5h.01',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11M12 15v2.5',
  'log-out': 'M10 20H4V4h6M15 8l5 4-5 4M20 12H9',
  refresh: 'M20 11a8 8 0 0 0-14.5-3.5M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5M20 20v-5h-5',
  loader: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  play: 'M7 4.5v15L20 12 7 4.5Z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12l-.1-1.2 2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5.1-1.2Z',
  // time and people
  calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 1.5M9.5 2.5h5M18.5 6.5 20 5',
  users: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 5.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.5 2.3 3.5 5.2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c0-4 3.5-6 7.5-6s7.5 2 7.5 6',
  'user-check': 'M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20c0-3.5 3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8M15 18l2 2 4-4.5',
  // things
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01',
  'hard-drive': 'M3 15h18v5H3zM3 15l3-10h12l3 10M7 17.5h.01M11 17.5h.01',
  smartphone: 'M7 2.5h10v19H7zM11 18.5h2',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  'file-text': 'M6 3h8l5 5v13H6zM14 3v5h5M9 12h6M9 16h6',
  'file-sheet': 'M6 3h8l5 5v13H6zM14 3v5h5M8.5 12h7M8.5 15.5h7M12 12v7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  'git-branch': 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a6 6 0 0 1-6 6H9',
  calculator: 'M5 3h14v18H5zM8.5 6.5h7v3.5h-7zM9 14h.01M12 14h.01M15 14h.01M9 17.5h.01M12 17.5h.01M15 17.5h.01',
  activity: 'M3 12h4l2.5-6 4 12 2.5-6h5',
  'trending-up': 'M3 17l6-6 4 4 8-8M15 7h6v6',
  flag: 'M5 21V4M5 4h13l-3 4.5 3 4.5H5',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8.5 20h7M9.5 17h5v3h-5z',
  medal: 'M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM8.5 12 5 3h5l2 4.5L14 3h5l-3.5 9',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z',
  star: 'M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7L12 3.5Z',
  // the trail
  mountain: 'M2.5 20 9 8l3.5 5.5L15.5 9l6 11h-19ZM7 11.5l2-1.5 1.8 1.6M13.7 12l1.8-1.3 1.7 1.3',
  summit: 'M3 20l7-12 3 4.5 2-2.5L21 20H3ZM13 3.5v6M13 3.5h5l-1.5 1.75L18 7h-5',
  ridge: 'M2 18l4-6 3 3 4-8 3 5 2-2 4 8',
  trail: 'M4 20c3-1 4-4 2.5-6S4 9.5 7 8s6 .5 8-1.5 2.5-3.5 5-3',
  contour: 'M12 8.5c-3 0-5.5 1.6-5.5 3.5S9 15.5 12 15.5s5.5-1.6 5.5-3.5S15 8.5 12 8.5ZM12 5c-5 0-9 3.1-9 7s4 7 9 7 9-3.1 9-7-4-7-9-7ZM12 11.5v1',
  blaze: 'M8 4h8v8H8zM8 15h8v5H8z',
  signpost: 'M12 3v18M8 21h8M5 7h11l3 2.5L16 12H5V7Z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5 13.5 13.5 8.5 15.5l2-5 5-2Z',
  shoe: 'M3 16.5c0-1 .5-1.7 1.5-2l4.5-1.5 2-4.5c.4-.7 1.1-1 1.8-.5l1.2.8 2 3.4 4 1.6c.6.3 1 .9 1 1.6V18H3v-1.5ZM3 18h18M9 13l1 1.5M11.5 11.5l1 1.5',
  track: 'M4 19l4-9 4 4 3-7 5 3M4 19h.01M8 10h.01M12 14h.01M15 7h.01M20 10h.01',
  bib: 'M4 6h16v13H4zM4 6l2-2.5M20 6l-2-2.5M8 12h8M8 15.5h5',
  elevation: 'M3 19h18M3 19c3 0 4-8 7-8s3.5 4 6 4 3.5-6 5-6',
  pace: 'M13 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM13 9v4l2.5 1.5M3 9h4M2 13h4M3 17h4',
  waypoint: 'M12 21s6-6 6-11a6 6 0 1 0-12 0c0 5 6 11 6 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
}

// Icons whose line is broken like a footpath on a map.
const DASHED = { trail: '2.6 2.6' }

export const ICON_NAMES = Object.keys(ICONS)

export function Icon({ name, size = 18, strokeWidth = 1.75, className = '', title, style, ...rest }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg
      className={`icon icon--${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={DASHED[name]}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      style={style}
      {...rest}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}

const named = (name) => (props) => <Icon name={name} {...props} />

export const ArrowRight = named('arrow-right')
export const ArrowLeft = named('arrow-left')
export const ArrowUp = named('arrow-up')
export const ArrowDown = named('arrow-down')
export const ArrowUpRight = named('arrow-up-right')
export const ChevronDown = named('chevron-down')
export const ChevronUp = named('chevron-up')
export const ChevronRight = named('chevron-right')
export const ChevronLeft = named('chevron-left')
export const Check = named('check')
export const CheckCircle = named('check-circle')
export const X = named('x')
export const XCircle = named('x-circle')
export const Plus = named('plus')
export const Minus = named('minus')
export const Menu = named('menu')
export const Search = named('search')
export const Info = named('info')
export const Alert = named('alert')
export const ShieldCheck = named('shield-check')
export const Mail = named('mail')
export const Download = named('download')
export const Upload = named('upload')
export const Copy = named('copy')
export const Trash = named('trash')
export const Pencil = named('pencil')
export const External = named('external')
export const Link = named('link')
export const Share = named('share')
export const Eye = named('eye')
export const EyeOff = named('eye-off')
export const Key = named('key')
export const Lock = named('lock')
export const LogOut = named('log-out')
export const Refresh = named('refresh')
export const Loader = named('loader')
export const Play = named('play')
export const Filter = named('filter')
export const Settings = named('settings')
export const Calendar = named('calendar')
export const Clock = named('clock')
export const Timer = named('timer')
export const Users = named('users')
export const User = named('user')
export const UserCheck = named('user-check')
export const Database = named('database')
export const Server = named('server')
export const HardDrive = named('hard-drive')
export const Smartphone = named('smartphone')
export const Code = named('code')
export const FileText = named('file-text')
export const FileSheet = named('file-sheet')
export const Image = named('image')
export const MapIcon = named('map')
export const GitBranch = named('git-branch')
export const Calculator = named('calculator')
export const Activity = named('activity')
export const TrendingUp = named('trending-up')
export const Flag = named('flag')
export const Trophy = named('trophy')
export const Medal = named('medal')
export const Globe = named('globe')
export const Star = named('star')
export const Mountain = named('mountain')
export const Summit = named('summit')
export const Ridge = named('ridge')
export const Trail = named('trail')
export const Contour = named('contour')
export const Blaze = named('blaze')
export const Signpost = named('signpost')
export const Compass = named('compass')
export const Shoe = named('shoe')
export const Track = named('track')
export const Bib = named('bib')
export const Elevation = named('elevation')
export const Pace = named('pace')
export const Waypoint = named('waypoint')
export const Sun = named('sun')
