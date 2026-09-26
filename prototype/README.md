# The web app

The code of the OTRI website. The HTML entry points sit where the pages are served — `index.html` at the repository root (https://otri.run/), `organizer/index.html` (`/organizer/`) and `embed/index.html` (`/embed/`) — and each loads its `main.jsx` from here. Vite builds the three together (`vite.config.js`); GitHub Actions deploys the result to GitHub Pages on every push to `main`.

Everything the pages show comes from the API at runtime (`apiClient.js`, `VITE_OTRI_API_BASE_URL`); nothing is baked in at build time except the example race preview (`src/data/example-preview.json`, produced by the API itself).

## The public site (`main.jsx`)

Hash-routed pages, one component each:

| Page | File | What it does |
| --- | --- | --- |
| Home | `Home.jsx` | What you get, the example race scored by the live API, how it works, a target time on the example course. |
| Calculator | `ScoreCalculator.jsx` | A course (a listed race, a shared link or your own GPX) and a target time; the score, the plain-language explanation and "Show the maths". |
| Score a race | `ScoreRace.jsx` | Results file plus course file in, every finisher scored, nothing stored; download, share, or hand the race to the organizer app (`publishHandoff.js`). |
| Races | `RaceListing.jsx`, `RaceCard.jsx`, the race page in `main.jsx` | Published races and their results pages, with the course map and explanation. |
| Runners | `Runners.jsx` | Runner search and profiles with the runner index. |
| FAQ | `Faq.jsx` | Searchable answers; deep links such as `#faq?q=columns`. |
| API | `ApiDocs.jsx` | The three public calls with examples, the embed snippet, the badge. |
| Media | `Media.jsx` | The brand kit and press facts. |

Also here: `SharePanel.jsx` and `shareImage.js` (the podium image and share text), `ReportForm.jsx` (correction and removal requests), `NextSteps.jsx` (the "what next" block under a result).

## The organizer app (`organizer/`)

`main.jsx` with its own hash router (`router.jsx`), session handling (`session.js`) and UI kit (`ui.jsx`). Pages under `pages/`:

| Page | What it does |
| --- | --- |
| `Auth.jsx` | Sign up, sign in (password, Google, two-factor), email confirmation, password reset. |
| `Events.jsx` | The organizer's events and races. |
| `Race.jsx` | One race: facts, course file, results upload, review and publish. |
| `Publish.jsx` | A race scored on the public site, handed over to be published. |
| `Account.jsx` | Profile, password, two-factor, data export, deletion. |
| `Admin.jsx` | Admins: overview, publish reviews, reports, accounts, all events, calculator courses, shared courses, traffic, the server, and the site's maintenance switch. |
| `Suite.jsx` | Admins (preview): the race suite. A race's course plan with station links, the entry list and bib numbers, the printable bib sheet, the race-day board with the gun and manual passings, plugin settings, and the finish list handed to scoring. |
| `Station.jsx` | No account: a checkpoint's phone (`#/station/{key}`: camera or typed bib, offline queue) and a runner's own splits (`#/bib/{token}`). |
| `CalculatorCourses.jsx` | Admins: the courses offered in the calculator's "Pick a race". |

## The embedded calculator (`embed/`)

The calculator for other websites to put in an iframe (`?race=` opens a listed race's course). The snippet is on the API page.

## Shared code (`../src/`)

`src/components/` holds what more than one page uses (the course map, the results table, the score scale, the units menu, the gate and maintenance screens, the page and step art); `src/lib/` the small libraries (units, comfort, analytics, monitoring, names, score levels); `src/styles.css` the styles and animations; `src/brand/` the mark's geometry.

## Run it locally

```powershell
npm install
npm run dev
```

The pages need the API: `pip install -r requirements-dev.txt`, then `uvicorn api.app:app --reload` (see `api/README.md`), with `VITE_OTRI_API_BASE_URL` in `.env` pointing at it (`.env.example`).

While the site is not yet open, every page asks for a password once per browser (`src/components/Gate.jsx`, `GATE_ENABLED`).
