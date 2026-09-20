# Frontend design system

The site is Preact with Vite. Everything visible is drawn by OTRI's own CSS in `src/ui/`: no
Tailwind, no utility compiler, no third-party icon set, no external font request. The icons and
the logo are ours (`src/ui/icons.jsx`, `src/components/Logo.jsx`, `src/brand/identity.json`).

## The idea

**An instrument for the mountains.** Dark graphite chrome, hero and data panels; cool near-white
surfaces for long reading. One volt-lime signal for the thing you are meant to press, ice cyan for
data and links. A fine measurement grid behind surfaces, concentric contour rings for terrain,
corner brackets on readouts, mono labels on every figure. Sharp corners: 4px on controls, 6px on
cards. Precise, modern, a little geeky — never rustic, never hand-drawn.

Readability comes first. Body text is 17px IBM Plex Sans at 1.6, nothing meant to be read is set
below 13px, and every text/background pair was measured (the ratios are in `src/ui/tokens.css`):
text on paper 17.1:1, muted text 6.1:1, links 5.7:1, ink on volt 14.9:1, chalk on graphite 16.5:1.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Display | Space Grotesk 700 | headings, the wordmark, big readouts (`.display-1`, `.readout`, `.panel__number`) |
| Body | IBM Plex Sans 400/500/600 | everything read in sentences |
| Data | IBM Plex Mono 400/600 | labels, figures, code, tables (`.mono`, `.num`, `.eyebrow`) |

All three are SIL OFL and self-hosted from `src/ui/fonts/`.

## Colour

Two families of token, and the distinction matters:

- **The flipping set** — `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--line`,
  `--line-strong`, `--text`, `--text-muted`, `--text-faint`, `--accent-text`. These change inside
  a dark section, so a component written once is correct on both grounds.
- **The fixed set** — `--ink`, `--chalk`, `--graphite`, `--slate`, `--night`, `--volt`, `--cyan`,
  `--mint`, `--amber`, `--rose` and their `-deep` / `-pale` forms. These never change, for anything
  drawn on its own background: a button, a badge, a chart, a panel.

`.on-dark`, `.section--dark`, `.section--night`, `.panel`, `.card--dark` and `.card--night`
re-point the flipping set. A light surface nested inside one of them (`.card`, `.notice`, `.menu`,
`.listbox`, `.empty`, `.table-wrap`, `.dropzone`, or `.on-light`) points it back. Because of this
you almost never write a colour on an element: use the class and let the ground decide.

Volt is the action colour and is **only ever a fill with `--ink` on it** — as text on a light
surface it is unreadable (1.2:1). Accent text is `--accent-text`: teal on light, volt on dark.

## Files

| File | What it holds |
| --- | --- |
| `src/ui/tokens.css` | Colours, type, spacing, radii, shadows, motion. The only place a colour is written. |
| `src/ui/fonts.css` | The three self-hosted families. |
| `src/ui/base.css` | Reset, type scale, links, `.prose`, and the light/dark token flip. |
| `src/ui/layout.css` | `.wrap`, `.section`, `.stack`, `.cluster`, `.grid--*`, spacing helpers, page and section heads. |
| `src/ui/components.css` | Buttons, badges, chips, cards, panels, forms, tables, notices, menus, tabs, steps, meters. |
| `src/ui/shell.css` | The dark header, navigation, footer, build strip, logo lockup. |
| `src/ui/patterns.css` | The grid and contour backgrounds, the hero, the facts strip, the signpost, the ticker. |
| `src/ui/icons.jsx` | The icon set. `<Icon name="mountain" size={18} />` or `<Mountain size={18} />`. |
| `src/components/Logo.jsx` | `Logo` (lockup), `Mark` (the ring), `Wordmark` (OTRI in full). |

`src/styles.css` imports `src/ui/index.css`; every HTML entry imports `src/styles.css` once.

A page or component may have a stylesheet next to it (`prototype/Faq.css`) for what is truly its
own. Such a file uses the tokens (`var(--cyan)`), never a literal colour, and prefixes its classes
with the page (`.faq-…`, `.calc-…`, `.auth-…`). It must never redefine a system class.

## Rules

- **No utility soup.** A `className` names a thing (`card`, `btn btn--primary`) plus at most a
  couple of helpers (`mt-4`, `muted`). More than that means the page needs its own class.
- **Colours only from tokens.** In CSS `var(--cyan)`; in JS that cannot read CSS (canvas, MapLibre
  paint, SVG built as a string) read the hex from `src/brand/identity.json`. Never a hex in a
  stylesheet, and never a colour from a retired identity (blue, violet, or the warm paper/pine/
  blaze set).
- **Icons only from `src/ui/icons.jsx`.** Pass `size`, and `title` when the icon carries meaning.
- **One primary action per view** (`.btn--primary`, volt). `.btn--dark` is the second-strongest;
  everything else is `.btn--secondary` or `.btn--ghost`.
- **Keyboard focus** is global (`:focus-visible`). Do not remove outlines.
- **Motion** honours `prefers-reduced-motion`; transitions use `--quick` / `--calm`.
- **Touch targets** at least 34px, and 44px for anything primary.

## Catalogue

Layout: `.wrap` (`--narrow`, `--wide`) · `.section` (`--tight`, `--card`/`--surface`, `--quiet`,
`--grid`, `--dark`, `--night`, `--line-top`, `--line-bottom`) · `.stack` (`--tight`, `--loose`) ·
`.cluster` (`--tight`, `--loose`, `--between`, `--end`, `--center`, `--top`, `--baseline`) ·
`.grid` (`--2`, `--3`, `--4`, `--aside`, `--aside-narrow`, `--split`, `--head`, `--tight`,
`--flush`, `--2-sm`) · `.push`, `.grow`, `.min0`, `.w-full` · `.mt-1…16`, `.mb-1…12`, `.mx-auto` ·
`.hide-sm`, `.only-sm`, `.hide-md`, `.only-md` · `.page-head` (`--split`, `__text`) ·
`.section-head` (`__no`, `--single`) · `.next-steps` · `.toolbar`.

Text: `.display-1`, `.display-2`, `.h-1…4`, `.lead`, `.small`, `.tiny`, `.muted`, `.ink`, `.mono`,
`.num`, `.readout`, `.measure`, `.balance`, `.center`, `.right`, `.upper`, `.nowrap`, `.truncate`,
`.break`, `.accent`, `.link` (`--quiet`, `--arrow`, `--up`), `.prose`, `.sr-only`.

Marks: `.eyebrow` (`--plain`, `--cyan`, `--ink`, `--sm`) · `.waypoint` (`--volt`, `--cyan`,
`--done`, `--todo`, `--sm`, `--lg`) · `.badge` (`--cyan`, `--mint`, `--amber`, `--rose`, `--volt`,
`--solid`, `--dot`, `--live`, `--lg`) · `.chip` · `.seg` (`--mono`, `--sm`) · `.pill-count` ·
`.avatar` (`--admin`) · `.kbd` · `.code-inline` · `.code-block` (`.c`, `.k`, `.s`) · `.icon-box`
(`--volt`, `--quiet`, `--outline`, `--lg`, `--sm`) · `.icon--accent`, `.icon--volt`, `.icon--muted`.

Buttons: `.btn` + `--primary` | `--dark` | `--secondary` | `--ghost` | `--danger` | `--chalk`,
sizes `--sm`, `--lg`, `--block`, `--icon`, `--wide`, `--mono`; `aria-busy="true"` with a
`.spinner` child. `.spinner` (`--lg`) alone for loading. `.back`. `.to-top`.

Surfaces: `.card` (`--pad-sm`, `--pad-lg`, `--flush`, `--surface`, `--quiet`, `--outline`,
`--strong`, `--dashed`, `--dark`, `--night`, `--link`; parts `__head`, `__body`, `__foot`,
`__title`, `__meta`, `__arrow`) · `.panel` (`--slate`, `--bracket`; `__label`, `__number`,
`__rule`) · `.empty` · `.notice` (`--info`, `--success`, `--warning`, `--error`, `--plain`) ·
`.details` (`--plain`, `--quiet`; `__body`) · `.grid-bg`, `.topo`, `.topo--dark`, `.topo--faint` ·
`.rule` · `.hero` (`__inner`, `__title`, `__lead`, `__actions`, `__art`) · `.facts` · `.signpost`
(`__arm`, `__arm--primary`, `__no`, `__label`, `__note`) · `.ticker` (`__list`, `__row`).

Forms: `.field` (`__label`, `__hint`, `__error`, `__row`) · `.input` (`--sm`, `--lg`, `--mono`) ·
`.input-wrap` (`__end`) · `.check` · `.radio-list` · `.range` · `.dropzone` (`--compact`,
`.is-dragging`; `__title`, `__hint`).

Data: `.table-wrap` · `.table` (`--tight`, `--flush`; `.num`, `.right`, `.score`, `tr.is-muted`,
`__empty`) · `.kv` (`--rows`) · `.stat` (`--lg`) · `.meter` (`--volt`, `--thin`, `--bands`).

Navigation: `.tabs` · `.steps` (`__item[data-state]`) · `.checklist` · `.menu` · `.popover` ·
`.listbox` · `.tooltip` · `.site-header`, `.site-nav`, `.site-subnav`, `.site-bar`,
`.site-footer`, `.build-strip`, `.logo` (`--dark`, `--on-light`, `--compact`).

## Icon names

`arrow-right/left/up/down`, `arrow-up-right`, `chevron-down/up/right/left`, `check`,
`check-circle`, `x`, `x-circle`, `plus`, `minus`, `menu`, `search`, `info`, `alert`,
`shield-check`, `mail`, `download`, `upload`, `copy`, `trash`, `pencil`, `external`, `link`,
`share`, `eye`, `eye-off`, `key`, `lock`, `log-out`, `refresh`, `loader`, `play`, `filter`,
`settings`, `calendar`, `clock`, `timer`, `users`, `user`, `user-check`, `database`, `server`,
`hard-drive`, `smartphone`, `code`, `file-text`, `file-sheet`, `image`, `map`, `git-branch`,
`calculator`, `activity`, `trending-up`, `flag`, `trophy`, `medal`, `globe`, `star`, and the
terrain set: `mountain`, `summit`, `ridge`, `trail`, `contour`, `blaze`, `signpost`, `compass`,
`shoe`, `track`, `bib`, `elevation`, `pace`, `waypoint`, `sun`.

## Brand assets

`src/brand/identity.json` holds the mark geometry, the outlined wordmark and the colours. The mark
is a closed ring — the letter O — with a ridge inside it and a volt dot on the summit; it is a
symbol, and the wordmark always spells OTRI in full so the name can never be read as "TRI".

`python scripts/build_brand_kit.py` writes the SVGs in `public/brand`, the favicon and
`media/brand`; `node scripts/build_brand_png.mjs` renders the PNGs, the site icons, `og-image.png`,
the email mark and the ZIP with Chrome or Edge (set `CHROME` if the browser is not found).

## Verification

`npm run build`, then open the home page, the calculator, Score my race, the races list and a
leaderboard, a runner page, the FAQ, and the organizer sign-in and race wizard at a desktop width
and at 375px. Check keyboard focus, the units menu, file selection, a server error, and that no
text drops below 13px. Loading a page other than a course map must not fetch the map code
(`LazyCourseMap.jsx`).
