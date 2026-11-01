# Third-party notices

CT Dashcam Studio Web original project code is offered under GPL-3.0-only only where the owner holds the necessary rights. This does not replace the licenses below or clear uncertain artwork. See LICENSE_AUDIT.md.

## Distributed runtime code: mp4-muxer 5.2.2

Source: https://github.com/Vanilagy/mp4-muxer
Installed version locked in package-lock.json: 5.2.2. MIT, copyright 2023 Vanilagy. Its original notice follows in full. Do not relicense this component as original project code.

MIT License

Copyright (c) 2023 Vanilagy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Python predecessor and ports

Source: https://github.com/mhsong282828221212123123123/CT-dashcam-studio
Headers identify ports of core/constants.py, decoder.py, map_loader.py, renderer.py, exporter.py, scanner.py and ui/main_window.py. The sibling repository LICENSE carries the following MIT notice. Preserving it does not certify that every upstream asset or copied algorithm has been cleared.

MIT License

Copyright (c) 2026 Companion Turret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Build-generated code and development tools

Vite 5.4.21 is a development/build tool, not an application runtime dependency. Its modulepreload polyfill is emitted into the distributed viewer bundle. Vite's supplied license and all of its included third-party notices are preserved in licenses/vite-NOTICES.txt and in the deployed third-party legal page. esbuild 0.21.5 transforms/minifies the bundle; its MIT notice is preserved in licenses/esbuild-MIT.txt. Rollup 4.64.10 is a build tool, not separately shipped as a browser library. The full locked dependency inventory and actual versions are in LICENSE_DEPENDENCIES.json and LICENSE_AUDIT.md; do not infer runtime distribution from npm's dev flag alone.

mp4-muxer also declares @types/dom-webcodecs 0.1.19 and @types/wicg-file-system-access 2020.9.8, MIT copyright Microsoft Corporation. These type declarations are erased and are not JavaScript runtime components. Their notices are retained in licenses/dom-webcodecs-MIT.txt and licenses/wicg-file-system-access-MIT.txt for source/dependency redistribution.

## OpenStreetMap

Map data: © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0. Tiles are remotely requested, not bundled map databases. Software licensing does not grant rights in map data or remove tile-provider terms. See https://www.openstreetmap.org/copyright and https://operations.osmfoundation.org/policies/tiles/ . Existing on-video attribution needs owner review; no renderer change is made in this task.

## External services

Google Analytics gtag.js is fetched from Google only after analytics consent on the viewer; it is not bundled or offered under GPL by this project. Google Analytics, Google Forms, GitHub Pages and OSM have separate service/privacy terms. Refer to PRIVACY.md. Standard browser APIs/codecs and system fonts are supplied by the browser/OS, not licensed by this repository.

## Artwork, branding, copied source and test fixtures

Icon PNG/ICO/SVG generations, public/models/steering_hud.png and visual brand references require the provenance review in LICENSE_AUDIT.md. No Valve/Portal or Tesla rights are purportedly granted by this notice. The introductory road SVG was created in repository source, but that fact alone is not proof of legal clearance. Test timing MP4s were generated with FFmpeg test patterns; they are test-only and not published by the Pages build. No font binary is bundled. Source history and AI assistance are not substitutes for third-party copyright review.
