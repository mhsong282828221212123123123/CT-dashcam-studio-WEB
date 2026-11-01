# Privacy and network/data-flow audit

Inspected 2026-11-01. Baseline: dev c746802. See COMPLIANCE_DISCOVERY.md for pre-change architecture and COMPLIANCE_VERIFICATION.md for actual test results. Scope is the Web repository, not the Python application.

## Data and destinations

| Data | Local use/persistence | External transmission found |
| --- | --- | --- |
| Selected MP4 bytes / video frames | Browser File/Blob handles, video decode, canvas, workers, memory buffers. No application database/cache persistence. | No upload code or server processing endpoint found. |
| Filenames/timestamps | Clip grouping, list labels, download filename in memory. | No application analytics parameters or upload requests use them. External feedback uploads are a separate user action. |
| GPS / telemetry | SEI parser, per-clip timing, overlays/export in memory. | Not sent to GA by application code. Tile x/y/zoom derived from current GPS area are requested from OSM; a sequence may reveal location/movement, even though it is not the raw complete trace. |
| Exported MP4 | Encoded locally, downloaded using URL.createObjectURL and anchor.download. | No exported-video upload endpoint found. |
| Browser/client/session identifiers | GA cookies can exist after acceptance. No own user-profile database or account system. | Google GA receives standard identifiers and network metadata only after acceptance. GitHub/OSM receive ordinary request metadata for their separate services. |
| Usage events | No application-defined custom GA event call found. Existing viewer config produces page_view; Google-managed measurements depend on remote account configuration. | GA only after opt-in. Query/hash stripped from explicitly supplied page_location/referrer. No new application tracking events added. |
| UI settings | localStorage ct_theme, ct_theme_dev, ct_language, ct_view_mode, ct_auto_next, ct_telemetry_order. Legacy ct_layout removed. | No transmission code for these values except language/page title implicit in permitted page usage. |
| Consent preference | Origin-local ct_analytics_consent: version + granted/denied only, no identifier or timestamp; persistent until changed/removed. Storage failure falls back to page memory. | Not sent anywhere before a grant. With GA active, Consent Mode communicates the permitted state to Google. |

## Network surfaces

- GitHub Pages serves first-party HTML, JS/CSS, icons, steering image, SVG, legal texts, manifest, service worker and deployment metadata. Production and dev use different base paths on the same origin. Browser requests necessarily reach the host; no provider retention duration is invented.
- Before a grant, the privacy module queues denied defaults **locally**, with no Google tag request or analytics/consent ping. Rejection keeps the tag unloaded. This follows Basic Consent Mode, not Advanced Mode.
- After a grant, the viewer requests `https://www.googletagmanager.com/gtag/js?id=G-E05V74Q9Q7`; the Google-controlled tag may load associated configuration and send GA collection requests (normally google-analytics.com regional endpoints). These endpoints and behavior are controlled by Google and the remote account, not a repository allowlist. No ID is changed or invented. No tracking is added to introduction/legal pages.
- GA defaults: analytics_storage, ad_storage, ad_user_data and ad_personalization denied. Accept grants analytics_storage alone; all advertising signals stay denied. allow_google_signals and allow_ad_personalization_signals are false. No new region lookup or consent service.
- Retained one viewer config/page_view per document. Repeated grants, cross-tab storage updates, reopening preferences or language changes do not re-configure or replay a page_view. Already sent events are not replayed after withdrawal/reacceptance. No queue of pre-consent user actions is accumulated.
- On withdrawal, set `ga-disable-G-E05V74Q9Q7` before the denied consent update, gate application gtag calls, remove accessible GA cookies, and persist denial. The already loaded third-party script cannot be un-executed; requests already sent/in flight cannot be recalled. Fresh denied navigation never loads the script. Other tabs listen for storage changes; pageshow/visibility changes re-check preference. A page's in-memory choice is retained when storage is unavailable.
- `https://tile.openstreetmap.org/{z}/{x}/{y}.png`: existing browser Image requests, zoom 16 by default, current 3×3 area; memory cache plus browser HTTP cache. User-Agent/referrer controlled by browser. Request paths reveal area, source IP/network metadata is visible to provider. No full trace JSON upload, map consent gate, new provider, cache change or renderer change is introduced.
- `https://forms.gle/Lh1doyRZNAZ6cqRk9`: external link only, not an iframe or background submission. Clicking leaves the editor for Google Forms. User-selected form uploads/sign-in are outside local editor processing. GitHub source/releases/issues are likewise explicit external navigation.
- No remote font/script library CDN besides consent-gated Google tag found. System font names do not trigger application font downloads. No XMLHttpRequest, application WebSocket, application sendBeacon or video upload fetch found in the baseline. New privacy code uses a script element only after consent.

## Browser storage and caches

- No application sessionStorage or IndexedDB usage found. No application-auth/session cookies. Consent uses localStorage, not a new cookie. Analytics cookies belong to GA and can include _ga / _ga_* / _gid / _gat variants depending on Google settings. The cleanup attempts only these names at host/parent domains and ancestor paths; HttpOnly or otherwise inaccessible cookies cannot be cleared by page JavaScript.
- `public/sw.js` is unchanged: install skipWaiting; activate clients.claim; network fetch with cache-match fallback on failure. CACHE_NAME is declared but not used for writes. No application cache.put/cache.add or selected-video persistence exists. The network-first worker can intercept external requests within its clients, but it does not add a new video upload or tile cache policy.
- Existing HTTP cache entries, browser cache eviction and provider log/analytics retention are outside a fixed application lifetime. No invented seven-day/user-data deletion promise.
- Shared origin means dev and production can share localStorage/GA cookies. Sharing consent prevents contradictory prompts/choices; analytics paths and a deployment_environment parameter distinguish environments without changing measurement ID. Intro pages are independently generated; no assumption that /dev is a source folder.

## OSM policy findings (documentation only)

The HTTPS endpoint and default browser caching/referrer behavior match the tile-policy technical guidance. There is no explicit offline/bulk download feature. Current-area loading while rendering export can make requests along the segment; actual request volume and retries require operational monitoring. The existing on-video `Map: OpenStreetMap` credit omits contributors/license reference and depends on TIME layout. This is a documented attribution gap, not silently fixed here. See LICENSE_AUDIT.md for exact code evidence. Legal-page credit does not repair the video attribution.

## Evidence limits / operator follow-up

Source review cannot establish every browser/device/provider behavior. GA account enhanced-measurement, retention, cross-domain/Google Signals linking, unwanted event parameters and reporting receipt are not exposed by this repository. Verify the remote property before production release, especially automatic form/file-download measurement. No property settings are changed without access/authorization. The current editor has no application form submission and creates exports as blob URLs, but that does not certify all remote GA configuration.

The operator's non-public identity/address, asset provenance, jurisdiction-specific legal bases, provider contracts, transfer safeguards and request-handling duties require owner review. User footage remains outside the operator's infrastructure except when a user deliberately sends it through an external service. This report is factual technical evidence and a list of limits, not a statement of complete legal compliance.

## Primary references reviewed

- [Google Basic Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Consent Mode v2 implementation](https://developers.google.com/tag-platform/security/guides/consent)
- [Google privacy controls](https://developers.google.com/tag-platform/security/guides/privacy)
- [Enhanced measurement settings](https://support.google.com/analytics/answer/9216061)
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [OSM copyright and attribution](https://www.openstreetmap.org/copyright)
