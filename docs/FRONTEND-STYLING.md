# Frontend styling

The frontend runs on Preact with Vite. The established interactive components use `preact/compat` to preserve form and event behavior. Styles are regular CSS and CSS Modules. There is no Tailwind dependency, utility scanner, runtime styling engine or UI component framework.

- `src/tokens.css`: shared violet/lavender palette, surfaces and control radii.
- `src/foundation.css`: static reset, sizing/font tokens and animation property defaults.
- `prototype/Home.module.css`: homepage composition.
- `prototype/Shell.module.css`: navigation and footer.
- `prototype/ToolPage.module.css`: calculator and race-upload workspaces.
- Other components import a neighboring CSS file. Their existing layout combinations were migrated into scoped component selectors; edit those rules directly. Do not add utility strings to JSX.

New components can use CSS Modules. Preserve visible focus, disabled states, native `hidden` behavior, mobile layouts and reduced-motion support. Keep the calculator explanations and scoring-file help visible by default.

## Loading

`LazyCourseMap.jsx` loads the map renderer only when a course map is rendered. Keep consumers pointed at this wrapper. Vite emits country flags as separate SVG assets, so visitors download only displayed flags rather than every country's image inside the initial stylesheet.

## Verification

Run `npm ci` and `npm run build`. Check the homepage, calculator, race upload, race/runner lists and organizer authentication at desktop and narrow mobile widths. Exercise unit changes, file selection, disabled submission, server errors and calculator course switching. A new homepage session should not request the `CourseMap` JavaScript or stylesheet.

The static reset/property primitives retain their original third-party notice in `THIRD_PARTY_NOTICES.md`.

The shared wordmark geometry lives in `src/brand/identity.json`. Run `python scripts/build_brand_kit.py`, then `CHROME=/path/to/chrome node scripts/build_brand_png.mjs` to regenerate icons, logo downloads and the ZIP. Outfit is self-hosted via Fontsource, with no third-party font requests.

The public homepage is shared by both entry points. Optional tool routes are loaded through Preact lazy/Suspense. Vite’s Preact preset aliases React-based third-party components to `preact/compat`; React DOM is not in the client bundle.
