# CT Dashcam Studio Web — Privacy Policy

Last updated: 2026-11-01. Canonical policy language: English.

Deployment scope: this policy describes the revised source and development deployment. The production site remains on its previously approved revision until the owner authorizes promotion. Older deployments, including the unchanged production viewer, may still have the previous unconditional analytics integration and cannot be made consent-aware solely by changing dev. Do not assume that the revised behavior is already active on every deployed route.

## Operator and contact

CT Dashcam Studio Web is an independent project maintained under the GitHub account `mhsong282828221212123123123` (Companion Turret). It is not affiliated with Tesla, Inc. The repository does not identify a company, postal address or private contact email; none is invented here.

Contact the maintainer through [GitHub Issues](https://github.com/mhsong282828221212123123123/CT-dashcam-studio-WEB/issues) or the linked [feedback form](https://forms.gle/Lh1doyRZNAZ6cqRk9). GitHub Issues are public: do not post private footage, identifiers or precise locations there. The feedback form is an external Google service, requires Google sign-in for its upload feature, and any information or files you submit there leave the local editor.

## Video, filenames, frames, telemetry and exports

The inspected application reads files you choose using browser file APIs. MP4 parsing, video decoding/playback, SEI telemetry parsing, motion analysis, compositing and MP4 encoding/muxing run on your device. Filenames and file timestamps are used to group/order clips and name downloads. Frames, GPS coordinates and other telemetry are used for previews, overlays and exports. Exported files are downloaded through a local Blob URL. We found no application endpoint that uploads selected videos, frames, filenames, complete GPS traces, vehicle identifiers or exported files.

These files and processing buffers are held in browser memory/local file handles for the session. The application does not write footage or telemetry into localStorage, IndexedDB or an application server. Files you download remain wherever you save them, under your control. Browser and operating-system internals, extensions and device backups are outside this policy's technical guarantees. Maps are an important exception to wholly local processing of location-related information, explained below.

## Optional Google Analytics

The viewer uses Google Analytics 4, measurement ID `G-E05V74Q9Q7`, to understand site usage. There are no application-defined custom tracking events in the inspected source. After acceptance, the existing Google tag config records the viewer page view and can perform Google's standard measurements, including those enabled in the property's external configuration. Introduction and legal pages do not load GA; they provide access to the same preference. Development and production use the existing single ID, with distinct URL paths and a deployment_environment configuration value. Whether that value is available as a reporting dimension depends on the operator's GA account configuration.

Analytics can involve browser/client and session identifiers, cookies, page location/title, a sanitized referrer, browser/device information, usage events and ordinary network metadata. Google receives connection information such as your IP address. No claim is made that this is anonymous or that the operator controls all processing by Google. Application code strips query strings and fragments from the page location and referrer it supplies to GA. It does not send video filenames, GPS coordinates, frames, vehicle identifiers or footage-derived information as custom events. Remote GA enhanced-measurement, data retention, Google Signals/account linking and other account settings require separate operator verification; they cannot be inferred from this repository.

## Consent and withdrawal

All visitors receive the same opt-in approach, without IP-based region lookup. Before an affirmative choice, no Google Analytics tag is requested, no analytics events are sent, and this integration does not create analytics cookies. Rejection does not disable editing, playback, export or maps. Google Consent Mode v2 is implemented in Basic Mode: analytics_storage starts denied and only becomes granted after acceptance. ad_storage, ad_user_data and ad_personalization remain denied. Google Signals and ad personalization are also disabled in the code configuration. No advertising feature is implemented here.

Use “Privacy & Licenses” in the viewer or introduction/footer, then accept or reject analytics. You may change a previous choice at any time. On rejection/withdrawal, the integration sets Google's per-measurement-ID disable flag before updating consent, blocks application gtag calls and attempts to delete accessible GA analytics cookies. Cross-tab changes and restored pages re-check the preference. Already transmitted information cannot be recalled, and requests already in flight cannot be undone. This is not deletion of data already held by Google; contact the operator for such requests, and consult Google's controls and policies.

## Browser storage and retention

The shared, origin-local consent preference is `ct_analytics_consent`, a minimal JSON record containing a schema version and granted/denied choice, with no user ID or timestamp. It is shared by production, dev, viewer and introduction routes on the same GitHub Pages origin. It has no application expiry; it remains until you change it, clear browser/site data, or the browser removes it. Storage failures do not prevent editing; a choice then applies in memory only and a later page may ask again. A different origin, browser or profile has separate preferences.

Existing localStorage settings include `ct_theme`, `ct_theme_dev`, `ct_language`, `ct_view_mode`, `ct_auto_next`, and `ct_telemetry_order`. Legacy `ct_layout` is removed by existing code. These preferences have no application expiry. They store UI settings, not video content or telemetry. No application sessionStorage or IndexedDB use was found. With analytics accepted, Google can create `_ga` and measurement-specific `_ga_*` cookies and other standard GA cookies; their expiry is controlled by Google tag/account settings and browser policy, not a retention promise made here.

The viewer registers a service worker for its deployment path. The inspected worker fetches from the network first and looks for an existing cache match on network failure; it does not populate an offline cache or persist selected videos. The browser's normal HTTP cache may retain site assets and map tiles according to response headers and browser policy. Site-data controls can remove cookies, preferences, caches and service-worker registrations. Removal may cause a new consent prompt.

## OpenStreetMap requests

The existing minimap requests raster tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` as needed for the current rendered area in preview or export. These requests disclose the requested map tile area and normal network metadata (including IP address, browser headers and usually the site's origin referrer) to the tile provider. A series of tile requests can reveal information about viewed locations or movement; it is not a direct upload of the raw GPS trace or complete telemetry file.

The application keeps an in-memory tile cache and uses browser HTTP caching. Map requests are independent of analytics consent. Rejecting analytics does not stop map requests or introduce a map consent gate. Existing overlay settings determine whether the map is rendered. OSM services are governed by their own policies; the operator does not control their logs or retention. Map data is credited to OpenStreetMap contributors and is licensed under ODbL. An audit found limitations in the existing on-video attribution; see LICENSE_AUDIT.md. This task documents those limitations without changing the renderer or map behavior.

## Hosting and external services

GitHub Pages serves the application, scripts, icons, introductions and legal documents. GitHub and its infrastructure receive normal web request information; hosting is not the application's video processing server. Network requests to Google Analytics are conditional on acceptance. Map requests and user-initiated GitHub, Google Forms or other external links have separate purposes and do not depend on analytics acceptance. No external font CDN or consent-management service is used by this change.

The operator has not verified provider/account-specific retention, international transfer arrangements, legal identity requirements in every jurisdiction, or all third-party provenance. This policy describes inspected source behavior, not a guarantee of complete legal compliance. Third parties maintain their own privacy practices and may update them. Any legal basis, rights-handling procedure or operator details required for a particular jurisdiction must be verified before a public release there.

## Third-party references

- [Google Privacy Policy](https://policies.google.com/privacy)
- [How Google uses information from sites or apps](https://policies.google.com/technologies/partner-sites)
- [Google Analytics data practices](https://support.google.com/analytics/answer/6004245)
- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [OpenStreetMap Foundation Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy)
- [OpenStreetMap copyright and licensing](https://www.openstreetmap.org/copyright)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

Policy changes will update the date above. A material change to analytics purposes should also trigger a new consent schema version and renewed choice.
