# OTRI brand assets

Wordmark geometry and colors live in `src/brand/identity.json`. `public/brand` contains generated website downloads; this folder mirrors the current identity for repository and social use.

## Files

- `otri-logo.svg` — primary horizontal logo for light backgrounds.
- `otri-logo-dark.svg` — primary horizontal logo for dark backgrounds.
- `otri-mark.svg` — standalone closed-O survey mark for light backgrounds.
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

Keep clear space around the logo at least equal to the height of the OTRI mark's outer stroke. Never stretch, rotate, recolor, or rebuild the mark independently.
