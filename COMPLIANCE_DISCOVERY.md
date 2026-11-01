# Repository discovery — 2026-11-01

Recorded before application changes, against dev c7468027adda93529da6b28163e4305e0a7bd4b8. This is a technical inventory, not a legal certification.

| Area | Evidence and existing behavior |
| --- | --- |
| Viewer | Root `index.html` imports `src/main.ts`; Vite builds the editor. Video, SEI, encoder/export, renderer and map modules are separate under `src/core/`. |
| Introduction | `intro/content.json`, `intro/intro.css`, `intro/intro.js`, `intro/scene.svg`; `scripts/build-intro.mjs` generates independent static HTML into ignored `public/intro/`, before dev/build. These are not viewer entry points. |
| Localization | Viewer `src/core/i18n.ts`: five inline dictionaries plus de/fr/es JSON; tutorial has its own shared locale table. Eight languages: en, ko, ja, zh-CN, zh-TW, de, fr, es. Intro uses the same eight languages with slugs en, kr, jp, zh-cn, zh-tw, de, fr, es. |
| Analytics | Only root `index.html`: unconditional external gtag.js and `gtag('config','G-E05V74Q9Q7')`; automatic page view. No custom event calls, GTM container, alternative ID, region detection, or consent code found. Intro has no GA integration. Remote GA enhanced-measurement/account settings are not in this repository and have not been inspected. |
| Maps | `src/core/mapLoader.ts`: Image requests to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, zoom 16 by default, current-area 3×3 tiles, in-memory tile/pending caches. Renderer uses the map for preview and export; no whole-trace upload endpoint. |
| Map attribution issue | `src/core/renderer.ts` draws only `Map: OpenStreetMap`, in the TIME column, conditional on map. It omits “contributors” and a copyright/license URL; availability depends on layout/options. Evidence warrants owner review against OSM attribution requirements. No map or renderer changes authorized in this task. |
| Storage | localStorage: ct_theme, ct_theme_dev, ct_language, ct_view_mode, ct_auto_next, ct_telemetry_order; ct_layout is removed as legacy cleanup. No application IndexedDB, sessionStorage or cookie writes found. Existing GA may set cookies. Browser HTTP caches also apply. |
| Service worker | `public/sw.js`: network-first fetch with caches.match on failure; no cache.put/add, no pre-caching, no video persistence. Viewer registers `./sw.js`. Scope is per deployed viewer base, not a source dev directory. |
| External assets | Application icons, steering PNG, scene SVG and CSS are local public assets; no downloaded fonts or font CDN found. Browser/system fonts are referenced. Feedback links open a Google Form, not an embedded uploader. |
| Deployments | `.github/workflows/deploy.yml` checks out main and dev separately, tests/builds each, then combines artifacts into one Pages deployment. Main base `/CT-dashcam-studio-WEB/`; dev base `/CT-dashcam-studio-WEB/dev/`. VITE_BASE_PATH controls assets. No source `dev/` folder. Both share origin `https://mhsong282828221212123123123.github.io`. |
| Licensing | No root LICENSE or notices before this change. Package is private, version 1.0.0, no SPDX license. Only direct runtime library mp4-muxer, installed/locked 5.2.2 (package range ^5.1.4), MIT. Its two type-package dependencies have no runtime JavaScript. Numerous core module headers identify Python ports. At this pre-migration discovery snapshot, the Python sibling repository had an MIT license, copyright 2026 Companion Turret; its original code has since migrated to GPL-3.0-only. Icon/steering provenance is not documented sufficiently to certify redistribution. |

## Scoped implementation decisions

- GPL-3.0-only covers original project code to the extent the owner can license it; preserve MIT notices and record uncertain assets/copying separately.
- Basic Consent Mode v2, opt-in everywhere. One origin-local versioned consent record across dev/prod/intro/viewer. No geographic service.
- Retain the single existing GA ID and viewer page-view scope. Intro/legal pages share preferences but do not acquire new analytics tracking. Dev remains identifiable by its URL and an environment config field, not a different/unconfirmed ID.
- No editor, decoder, exporter, encoder, renderer, map loader or service-worker modifications. No map consent gate. No new dependencies.
- Publish generated HTML legal documents under each build's own base path. Canonical legal policy is English, with localized navigation and plain-language consent UI in all eight languages.
- Develop, test and deploy dev only; main remains unchanged. Document remote GA settings, ownership/provenance and OSM attribution limitations instead of claiming full compliance.
