# Frontend design system

The site is Preact with Vite. Everything visible is drawn by OTRI's own CSS in `src/ui/`: no
Tailwind, no utility compiler, no third-party icon set, no external font request. Icons and the
logo are ours (`src/ui/icons.jsx`, `src/components/Logo.jsx`, `src/brand/identity.json`).

## The idea

A day on a trail, drawn like a good map. Chalk paper for the ground, pine ink for the words,
moss green for the brand, and the blaze orange of a painted trail marker for the one thing on
a screen you are meant to press. Contour lines sit faintly behind surfaces; a ridge silhouette
divides sections; numbered steps are waypoints; the big action links are fingerposts.

Readability comes first. Body text is 17px Barlow at 1.6 line height, nothing readable is set
below 13px, and every text/background pair was measured (`src/ui/tokens.css` lists the ratios).
Headings are Barlow Condensed, data is JetBrains Mono. All three are self-hosted (`src/ui/fonts/`).

## Files

| File | What it holds |
| --- | --- |
| `src/ui/tokens.css` | Colours, type sizes, spacing, radii, shadows, motion. The only place a colour is written. |
| `src/ui/base.css` | Reset, type defaults, headings, links, `.prose`, dark-surface colour flips. |
| `src/ui/layout.css` | `.wrap`, `.section`, `.stack`, `.cluster`, `.grid--*`, spacing helpers, page and section heads. |
| `src/ui/components.css` | Buttons, badges, chips, cards, panels, forms, tables, notices, menus, tabs, steps, details, meters. |
| `src/ui/shell.css` | Header, navigation, footer, build strip, logo lockup. |
| `src/ui/patterns.css` | Contour backgrounds, ridge divider, hero, facts strip, signpost, ticker. |
| `src/ui/icons.jsx` | The icon set. `<Icon name="mountain" size={18} />` or `<Mountain size={18} />`. |
| `src/components/Logo.jsx` | `Logo` (lockup), `Mark` (the rings), `Wordmark` (the letters). |

`src/styles.css` imports `src/ui/index.css`; every HTML entry imports `src/styles.css` once.

A page or component may have a stylesheet next to it (`prototype/Faq.css`) for what is truly
its own: a chart, a particular grid, an animation. Such a file uses the tokens (`var(--moss)`),
never a literal colour, and prefixes its classes with the page (`.faq-…`, `.calc-…`, `.auth-…`).
It must never redefine a system class.

## Rules

- **No inline utility soup.** A `className` names a thing (`card`, `btn btn--primary`) and, at
  most, a couple of helpers (`mt-4`, `muted`). If an element needs more than that, it gets a
  page class.
- **Colours only from tokens.** In CSS `var(--pine)`; in JS (canvas, SVG attributes) read the
  same hex values from `src/brand/identity.json` or `getComputedStyle`. Never a Tailwind palette
  value (`#2563eb`, `slate-500`) and never the old violet/red identity.
- **Icons only from `src/ui/icons.jsx`.** `lucide-react` is gone. Pass `size` and, when the icon
  carries meaning on its own, `title`.
- **Type scale.** `h1` – `h4` are styled by default; use `.display-1/.display-2/.h-1/.h-2/.h-3/.h-4`
  to pick a size regardless of the tag. Body copy is the default; `.lead`, `.small`, `.tiny`,
  `.muted`, `.mono`, `.num`. Never set a font size below 13px for anything meant to be read.
- **One primary action per view** (`.btn--primary`). Dark buttons (`.btn--dark`) are for the
  second-strongest action; everything else is `.btn--secondary` or `.btn--ghost`.
- **Dark surfaces** (`.section--dark`, `.section--night`, `.card--dark`, `.panel`, `.on-dark`)
  flip the text tokens themselves. Components placed inside them need no extra colour classes.
- **Keyboard focus** is global (`:focus-visible`). Do not remove outlines.
- **Motion** honours `prefers-reduced-motion`. Keep transitions on the `--quick`/`--calm` tokens.
- **Touch targets** at least 40px high: buttons, chips, nav links and inputs already are.

## Catalogue

Layout: `.wrap` (`--narrow`, `--wide`) · `.section` (`--tight`, `--card`, `--gravel`, `--dark`,
`--night`, `--line-top`, `--line-bottom`) · `.stack` (`--tight`, `--loose`) · `.cluster`
(`--tight`, `--loose`, `--between`, `--end`, `--center`, `--top`, `--baseline`) · `.grid`
(`--2`, `--3`, `--4`, `--aside`, `--aside-narrow`, `--split`, `--head`, `--tight`, `--flush`,
`--2-sm`) · `.push`, `.grow`, `.min0`, `.w-full` · `.mt-1…16`, `.mb-1…12`, `.mx-auto` ·
`.hide-sm`, `.only-sm`, `.hide-md`, `.only-md` · `.page-head` (`--split`, `__text`) ·
`.section-head` (`__no`, `--single`) · `.next-steps` · `.toolbar`.

Text: `.display-1`, `.display-2`, `.h-1…4`, `.lead`, `.small`, `.tiny`, `.muted`, `.ink`,
`.mono`, `.num`, `.measure`, `.balance`, `.center`, `.right`, `.upper`, `.nowrap`, `.truncate`,
`.break`, `.accent` (the orange word in a heading), `.link` (`--quiet`, `--arrow`, `--up`),
`.prose`, `.sr-only`.

Marks: `.eyebrow` (`--plain`, `--moss`, `--ink`, `--sm`) · `.waypoint` (`--blaze`, `--moss`,
`--done`, `--todo`, `--sm`, `--lg`) · `.badge` (`--moss`, `--blaze`, `--ochre`, `--sky`,
`--berry`, `--solid`, `--solid-blaze`, `--solid-moss`, `--dot`, `--live`, `--lg`) · `.chip`
(`[aria-pressed]`) · `.seg` (`--mono`, `--sm`; children `[aria-pressed]`) · `.pill-count` ·
`.avatar` (`--admin`) · `.kbd` · `.code-inline` · `.code-block` (`.c` comment, `.k` keyword,
`.s` string) · `.icon-box` (`--blaze`, `--gravel`, `--outline`, `--lg`, `--sm`) · `.icon--moss`,
`.icon--blaze`, `.icon--stone`.

Buttons: `.btn` + `--primary` | `--dark` | `--secondary` | `--ghost` | `--danger` | `--on-dark` |
`--paper`, sizes `--sm`, `--lg`, `--block`, `--icon`, `--wide`; `aria-busy="true"` with a
`.spinner` child. `.spinner` (`--lg`) alone for loading. `.back` for a back link. `.to-top`.

Surfaces: `.card` (`--pad-sm`, `--pad-lg`, `--flush`, `--white`, `--gravel`, `--outline`,
`--strong`, `--dashed`, `--dark`, `--night`, `--link`; parts `__head`, `__body`, `__foot`,
`__title`, `__meta`, `__arrow`) · `.panel` (`--pine`; `__label`, `__number`, `__rule`) ·
`.empty` (`__title`, `__text`, `__action`) · `.notice` (`--info`, `--success`, `--warning`,
`--error`, `--plain`; `__title`, `__body`) · `.details` (`--plain`, `--quiet`; `__body`) ·
`.topo`, `.topo--dark`, `.topo--faint` · `.ridge-after` (`--card`, `--dark`, `--night`) ·
`.rule` · `.hero` (`__inner`, `__title`, `__lead`, `__actions`, `__art`) · `.facts` ·
`.signpost` (`__arm`, `__arm--blaze`, `__no`, `__label`, `__note`) · `.ticker` (`__list`, `__row`).

Forms: `.field` (`__label`, `__hint`, `__error`, `__row`; `.optional`) · `.input` (`--sm`,
`--lg`, `--mono`; also on `select`, `textarea`; `aria-invalid`) · `.input-wrap` (an `.icon`
first child sits inside the field; `__end` for trailing buttons) · `.check` · `.radio-list` ·
`.range` · `.dropzone` (`--compact`, `.is-dragging`; `__title`, `__hint`).

Data: `.table-wrap` · `.table` (`--tight`, `--flush`; `th.num`, `td.num`, `.right`, `.score`,
`tr.is-muted`, `__empty`) · `.kv` (`--rows`) · `.stat` (`--lg`; `__value`, `__label`) · `.meter`
(`--blaze`, `--thin`, `--bands` with `span.is-on`).

Navigation: `.tabs` (`__tab[aria-selected]`) · `.steps` (`__item[data-state=done|current|todo]`,
`__label`) · `.checklist` (`__row.is-ok|.is-todo`) · `.menu` (`--right`, `--left`; `__item`,
`__item--danger`, `__sep`, `__head`) · `.popover` · `.listbox` (`__item[aria-selected]`,
`.is-quiet`, `__meta`, `__hint`, `__empty`) · `.tooltip` · `.site-header`, `.site-nav`,
`.site-nav__link[aria-current]`, `.site-subnav`, `.site-bar`, `.site-footer`, `.build-strip`,
`.logo` (`--dark`, `--compact`).

## Icon names

`arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `arrow-up-right`, `chevron-down/up/right/left`,
`check`, `check-circle`, `x`, `x-circle`, `plus`, `minus`, `menu`, `search`, `info`, `alert`,
`shield-check`, `mail`, `download`, `upload`, `copy`, `trash`, `pencil`, `external`, `link`,
`share`, `eye`, `eye-off`, `key`, `lock`, `log-out`, `refresh`, `loader`, `play`, `filter`,
`settings`, `calendar`, `clock`, `timer`, `users`, `user`, `user-check`, `database`, `server`,
`hard-drive`, `smartphone`, `code`, `file-text`, `file-sheet`, `image`, `map`, `git-branch`,
`calculator`, `activity`, `trending-up`, `flag`, `trophy`, `medal`, `globe`, `star`, and the
trail set: `mountain`, `summit`, `ridge`, `trail`, `contour`, `blaze`, `signpost`, `compass`,
`shoe`, `track`, `bib`, `elevation`, `pace`, `waypoint`, `sun`.

Former lucide names map as: `ArrowUpRight→ArrowUpRight`, `Check→Check`, `CheckCircle2→CheckCircle`,
`XCircle→XCircle`, `AlertTriangle→Alert`, `ShieldCheck→ShieldCheck`, `Trash2→Trash`,
`Share2→Share`, `FileSpreadsheet→FileSheet`, `Link2→Link`, `ExternalLink→External`,
`Image→Image`, `Map→MapIcon`, `Flag→Flag`, `KeyRound→Key`, `RefreshCw→Refresh`,
`Loader2→Loader`, `Code2→Code`, `CalendarDays→Calendar`, `Timer→Timer`, `Mountain→Mountain`,
`TrendingUp→TrendingUp`, `Activity→Activity`, `Database→Database`, `Server→Server`,
`HardDrive→HardDrive`, `Smartphone→Smartphone`, `Users→Users`, `UserCheck→UserCheck`,
`Medal→Medal`, `Trophy→Trophy`, `Play→Play`, `Pencil→Pencil`, `Plus→Plus`, `LogOut→LogOut`,
`Eye→Eye`, `EyeOff→EyeOff`, `Copy→Copy`, `Download→Download`, `Upload→Upload`, `Mail→Mail`,
`Search→Search`, `Info→Info`, `GitBranch→GitBranch`, `Calculator→Calculator`,
`FileText→FileText`, `ChevronDown→ChevronDown`, `ArrowLeft→ArrowLeft`, `ArrowRight→ArrowRight`,
`ArrowUp→ArrowUp`.

## Brand assets

`src/brand/identity.json` holds the mark geometry, the outlined wordmark and colours.
`python scripts/build_brand_kit.py` writes the SVGs of `public/brand`, the favicon and
`media/brand`; `node scripts/build_brand_png.mjs` renders the PNGs, the site icons and the ZIP
with Chrome or Edge (set `CHROME` to the browser path if it is not found).

## Verification

`npm run build`, then open the home page, the calculator, Score my race, the races list and a
leaderboard, a runner page, the FAQ, and the organizer sign-in and race wizard at a desktop
width and at 375px. Check keyboard focus, the units menu, file selection, a server error, and
that text never drops below 13px. Loading pages other than a course map must not fetch the
map code (see `LazyCourseMap.jsx`).
