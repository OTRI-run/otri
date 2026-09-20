# OTRI brand assets

The mark, the outlined wordmark and the colours live in `src/brand/identity.json`; `python scripts/build_brand_kit.py` writes `public/brand` (the website downloads) and this folder, which mirrors the current identity for repository and social use.

The mark is a closed ring — the letter O — with a ridge inside it and a volt dot on the summit. It is a symbol, never a letter: the wordmark always spells OTRI in full, so the name can never be read as "TRI".

Colours: ink `#0b1319`, graphite `#0b131a`, night `#05090d`, paper `#f1f5f7`, volt `#cbf53f` (the one action to press, always with ink on it), cyan `#46dcea` and its deep form `#086a7c` (data and links).

## Files

- `otri-logo.svg` — primary horizontal logo for light backgrounds.
- `otri-logo-dark.svg` — primary horizontal logo for dark backgrounds.
- `otri-mark.svg` — the ring-and-ridge mark alone, for light backgrounds.
- `otri-mark-dark.svg` — standalone mark for dark backgrounds.

## Size policy

Do not create separate logo artwork for arbitrary "small / medium / large" sizes. The SVG masters are vector artwork and should be rendered at any required size without loss of quality.

For raster exports (PNG/WebP), use these practical presets:

| Use | Recommended export sizes |
| --- | --- |
| Favicon | 16, 32, 48 px mark |
| Small UI | 64, 96, 128 px mark/logo height |
| Website/header | 160–320 px logo width |
| Large web/print | 640, 1024 px logo width |
| App/social artwork | 512, 1024, 2048 px mark |
| Social card | 1200×630 px canvas, logo rendered inside with clear space |

## Naming convention

Use descriptive, usage-based names rather than vague names such as `logo-small.png`:

`otri-logo-[variant]-[size].png`

Examples: `otri-logo-light-320.png`, `otri-logo-dark-640.png`, `otri-mark-512.png`.

The shared identity JSON remains the canonical geometry. Raster files are exports from those masters, not separate artwork.

## Clear space

Keep clear space around the logo of at least half the height of the mark. Do not show the mark below 20 px, or the logo with the full name below 160 px wide. Never stretch, rotate, recolor, or rebuild the mark independently.
