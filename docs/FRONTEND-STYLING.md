# Frontend styling

The frontend uses regular CSS and CSS Modules, compiled by Vite. There is no Tailwind dependency, utility scanner, runtime styling engine or UI component framework.

- `src/tokens.css`: shared graphite/coral palette, surfaces and control radii.
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
