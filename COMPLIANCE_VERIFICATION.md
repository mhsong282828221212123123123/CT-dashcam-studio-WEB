# Compliance change verification — 2026-11-01

Technical validation only; not a legal clearance certificate. Baseline dev c746802. Only dev is authorized for publication. Unchanged production remains at main 2977b2e until a separate owner-approved promotion.

## Commands and build scope

- `npm test`: **182 passed**, 13 files, including 27 consent/legal tests and the existing 155 tests. Covers malformed/absent consent, rejection, acceptance, all four Consent Mode signals, unchanged measurement ID, idempotence, withdrawal, cross-tab updates, back/forward restoration, storage errors, no added intro tracking, eight locales, legal generation, GPL hash and SPDX metadata.
- `npm run build` with `VITE_BASE_PATH=/CT-dashcam-studio-WEB/`: passed, including `tsc`. This is a local production-path validation build, not production deployment.
- Same build with `VITE_BASE_PATH=/CT-dashcam-studio-WEB/dev/`: passed, including `tsc`.
- `node scripts/verify-legal-build.mjs` after each base build: 16 HTML pages, **532 local links/assets** checked, zero errors, no deployed Markdown links or QA harness, no unconditional Google script.
- No lint command is configured; none is falsely reported as run. No dependency installation/addition or video-library replacement is part of the implementation.
- DEV editor bundle `index-CeXpXgvV.js`, stylesheet `index-B7Wr5aYv.css` and worker `seiWorker-CTFh4gyI.js` retain the baseline content-hashed filenames. All source files under `src/`, including editor, encoder/exporter, SEI parser, renderer, map engine and i18n, are unchanged. Consent/links/styles are separate first-party assets and HTML additions. Existing introduction CSS/JS/scene are also unchanged. Existing Pages workflow and service worker are unchanged.

## Real browser integration

Browser: ChatGPT in-app Chromium, local Vite server on 127.0.0.1:5173, DEV base. A committed developer-only harness `test/privacy-qa.html` displays sanitized Resource Timing observations and can load the existing generated 30fps MP4 test pattern as four local File objects. It does not use user footage and is outside public/dist. The map check uses a public Paris landmark, not a user's GPS trace. No browser security protections were disabled. This is not physical iPhone/Android testing.

### A. First visit / no consent

Displayed nonmodal notice; editor controls remain available. Observed `consent:null`, GA disable flag true, tag count 0, config count 0, cookie names empty, no Google resources. No external consent/geolocation request. Choice UI is a named region rather than a blocking dialog; no inert background/focus trap.

### B. Accepted

Observed tag count 1, config count 1, existing ID `G-E05V74Q9Q7`, `_ga` and `_ga_E05V74Q9Q7` cookie names. Resource Timing showed `https://www.google-analytics.com/g/collect`, event `page_view`, matching ID, Consent Mode signal `G101` (analytics granted/ad storage denied), and page location stripped to `/CT-dashcam-studio-WEB/dev/` without query. Repeated acceptance did not create another config or page_view. The remote property also generated an enhanced-measurement `scroll` event while accepted; this was not an application-added event. All three advertising consent fields are also asserted denied in the local queue tests.

This proves browser-side tag/request behavior, not successful receipt in a private Google Analytics report. No GA account/report credentials were used, and account-side enhanced measurement/retention/property configuration remains an owner check.

### C. Rejected

Observed choice denied, disable flag true, tag/config count 0, no Google resources/cookies. Loaded four generated camera files, selected the clip, and saw Play change to Pause with a one-second clip timeline. Existing map loader issued nine expected HTTPS requests for the sample area; rendered/sample requests were independent of analytics.

Ran the real existing MP4 export at Compact 960×540: application showed 100% and “Video rendering completed successfully!”. Observed the exact output Blob without changing it: **341,570 bytes**, MIME `video/mp4`, top-level `ftyp`, `moov`, `mdat` boxes present. A browser download-event wait on the containing QA tab timed out (iframe/download-event limitation); completion and actual MP4 bytes were verified separately. This is not a claim that a physical-device save dialog or every codec/device was tested.

### D. Withdrawal and sharing

After acceptance, Reject changed the disable flag to true, updated the persisted choice and removed accessible GA cookie names. Subsequent playback/language interaction produced no additional observed GA collection entries. Already loaded tag and historical Resource Timing entries remain; removing a script cannot recall executed code or already sent requests, and the implementation does not claim otherwise. Fresh denied navigation loads no tag.

In a second Korean introduction tab, acceptance enabled the already open viewer via the storage event with one config/page_view. Rejection from that intro tab disabled the viewer and cleared its accessible GA cookies. Introduction pages themselves had no GA tag/config. Shared consent storage is origin-local, not language/base-path specific. Unit tests also cover inaccessible storage and preference deletion.

**Deployment limitation:** old production code does not contain the new storage listener/consent gate. Dev-only publication cannot stop its unconditional GA integration. The shared record works across all revised routes when those revisions are deployed; this task intentionally does not change existing production behavior.

### E. Internationalization/accessibility/layout

All eight introduction routes loaded and opened localized preferences at 320×640. Document width and scroll width matched (305 CSS px after scrollbar) with no horizontal overflow. Accept/reject buttons were equal width (131px each); equal height 42px, or 58px for wrapped French text. Korean/English viewer language switching updated consent labels and legal href language parameters without clearing the choice. Intro theme and language navigation remain intact.

Canonical English privacy content is explicitly marked `<article lang="en">`; legal-page navigation follows the selected language. Spanish navigation/English article and switching to Korean were observed. Legal page/panel overflow at 320px was found and fixed; final width equaled scroll width. Escape closes the settings region, returns focus to its opener and updates aria-expanded to false. Named region/heading, native buttons/links/details/select, visible focus and keyboard operation were checked structurally and through interaction; no full assistive-technology certification is claimed.

### F. Routes/deployment

Both base-path artifacts passed the independent link check. No main merge, tag or production release is performed. Existing dual-branch Pages deployment is retained: a dev push rebuilds main from its unchanged ref and dev from dev. Live deployment metadata and legal/intro routes are checked after the dev push; their source revision links are generated from the checkout commit, not the triggering branch's assumed SHA.

### G. Licensing

Official GPLv3 bytes/hash verified in tests; original text remains unmodified and .gitattributes prevents platform EOL conversion. package.json and lock root use GPL-3.0-only. Runtime mp4-muxer MIT and Python predecessor MIT notices preserved; full Vite, esbuild and type-package notices retained. All 123 locked package entries and 20 distributable images/icons inventoried. Source-created/AI-assisted code is not automatically treated as cleared third-party copyright.

Remaining: artwork/steering and upstream provenance; incomplete notice evidence for six installed development tools and 47 absent optional packages; current OSM video attribution gap; operator legal identity/jurisdiction-specific requirements and GA account settings. These are explicitly documented in LICENSE_AUDIT.md and the privacy/data-flow report. No renderer/map changes are made to conceal these issues.

## Diff summary

- Official LICENSE, original-code SPDX metadata and byte-preserving attributes.
- THIRD_PARTY_NOTICES.md, licenses/ originals, LICENSE_AUDIT.md and machine-readable dependency/asset inventories.
- PRIVACY.md, source/data-flow discovery and this verification report.
- One shared legal/consent.js controller and eight-language UI strings; isolated CSS. Worldwide Basic Consent Mode v2; advertising denied; safe local persistence; later changes/withdrawal and cross-tab sync.
- scripts/build-legal.mjs generates six legal HTML pages, downloadable GPL/notice files and corresponding-source links under the current build base; intro prebuild invokes it. Viewer/intro HTML include first-party consent module and localized legal navigation. No new runtime tracking scope on intro/legal pages.
- test/privacy.test.js, unpublished local QA harness and scripts/verify-legal-build.mjs.
- README explains licensing scope, dev legal URLs, build/redistribution and unresolved limitations. No core source, library versions, OSM behavior, themes, existing SEO routes or workflow changes.
