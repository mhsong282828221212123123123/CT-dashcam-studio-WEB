# CT Dashcam Studio 웹 포팅 작업 명세

원본: `e:\tesla\project\CT-dashcam-studio` (Python/PyQt6/OpenCV, v1.2.5)
목표: **서버 없는 클라이언트 전용 웹앱**. 영상은 브라우저 밖으로 나가지 않는다.
작업 위치: `e:\tesla\project\CT-dashcam-studio-web` (신규). 원본 폴더는 **수정 금지**, 참조만 한다.

## 0. 공통 규칙

- 스택: TypeScript + Vite. 무거운 처리는 Web Worker로 분리한다.
- 단계(Phase)별로 진행한다. 각 Phase는 동작 확인 후 다음으로 넘어간다.
- 원본 로직은 먼저 읽고, 동작이 같게 이식한다. 임의로 알고리즘을 바꾸지 않는다.
- 이식한 함수에는 원본 파일명과 함수명을 주석으로 남긴다.
- 결과 검증은 실제 TeslaCam 샘플 클립으로 한다. 샘플이 없으면 사용자에게 요청한다.
- 앱 UI 텍스트는 한국어를 유지한다.

## 1. 원본 모듈 → 웹 대응표

| 원본 | 역할 | 웹 대응 |
|---|---|---|
| `core/decoder.py` | MP4 `mdat` SEI NAL(type 6) → protobuf 파싱 | `src/core/seiDecoder.ts` |
| `core/scanner.py` | 프레임 차분 센트리 모션 감지 | `src/workers/motionWorker.ts` |
| `core/renderer.py` | 멀티캠 레이아웃, HUD, 미니맵 | `src/core/renderer.ts` (Canvas 2D) |
| `core/map_loader.py` | OSM 타일 로딩 | `src/core/mapLoader.ts` (`fetch`) |
| `core/exporter.py` | 렌더링 + FFmpeg 인코딩 | `src/core/exporter.ts` (WebCodecs) |
| `core/privacy_filter.py`, `plate_enhancer.py` | 얼굴/번호판 모자이크, 선명화 | `src/workers/privacyWorker.ts` (onnxruntime-web) |
| `core/constants.py` | 해상도, 민감도 프리셋 | `src/core/constants.ts` |
| `ui/main_window.py` | 메인 UI 전체 | `src/ui/*` |
| `ui/widgets.py` | 하이라이트 슬라이더, 카메라 팝업 | `src/ui/Timeline.ts` 등 |
| `network/server.py`, `dialogs.py`(QR) | 폰 전송 | **제거** (웹은 폰에서 직접 열면 됨) |
| `network/updater.py` | 업데이트 확인 | **제거** (웹은 항상 최신) |

## 2. Phase별 작업

### Phase 1: MVP 뷰어 (내보내기 없음)

1. 프로젝트 초기화 (Vite + TS, ESLint, 폴더 구조).
2. **SEI 파서 이식** (`decoder.py` 기준)
   - `Blob.slice`로 파일 전체를 메모리에 올리지 않고 읽는다.
   - `find_mdat` → NAL 순회(4바이트 길이 접두) → SEI(`nal[0] & 0x1F == 6`) 필터.
   - `extract_proto_payload`: 0x42 건너뛰고 0x69 마커 확인, 에뮬레이션 방지 바이트(00 00 03) 제거.
   - protobuf 필드: 4=속도(float, m/s), 5=가속, 6=조향, 7/8=좌/우 방향지시등, 9=브레이크, 10=오토파일럿(0 수동, 1 FSD, 2 AUTOPILOT, 3 TACC), 11/12/13=위도/경도/방향(double, 범위 검증 포함).
   - 속도는 `round(m/s*3.6)`, 가속은 0~100으로 clamp.
   - SEI가 없는 프레임은 직전 값을 유지한다. 프레임 조회는 가장 가까운 키 이진 탐색.
   - 이식 후 Python 결과와 같은 클립에서 프레임별 값을 비교하는 테스트를 만든다.
3. **파일 선택**
   - Chromium: File System Access API로 `TeslaCam` 폴더 지정.
   - 그 외(Safari/iOS/Firefox): `<input type="file" multiple webkitdirectory>` 폴백.
   - 파일명 패턴으로 클립을 묶는다 (`YYYY-MM-DD_HH-MM-SS-front|back|left_repeater|right_repeater|left_pillar|right_pillar.mp4`).
   - `SavedClips` / `SentryClips` / `RecentClips` 폴더 구조를 트리로 보여준다. 원본 `scan_and_populate_tree` 참고.
4. **멀티캠 동기 재생**: `<video>` 요소와 마스터 클록. 프레임 정확도가 부족하면 WebCodecs로 교체할 수 있게 인터페이스를 분리한다.
5. **HUD 렌더링** (속도, FSD 상태, 방향지시등 깜빡임, 조향 휠 회전, 가속/브레이크 페달), 레이아웃 3종(1:3, 2x2, 단일).
6. **미니맵**: OSM 타일과 이동 궤적. 타일은 캐시하고 요청 수를 제한한다.
7. 단축키 (Space, 방향키, Shift+방향키, Home, `[` `]`, I/O, F1), 밝기/대비/배속.

### Phase 2: 센트리 모션 감지

- `scanner.py` 알고리즘을 그대로 이식한다: 160×90 grayscale, 약 6fps 샘플링, `absdiff` → 임계 → 변화 픽셀 수가 `min_area // 4`를 넘으면 이벤트.
- 이벤트 병합 규칙: 앞 1.5초, 뒤 2초, 4초 이내 간격은 병합.
- 민감도 4단계는 `constants.py` 값을 그대로 사용한다.
- Worker에서 실행하고 진행률을 표시한다. 취소를 지원한다.
- 타임라인에 이벤트 구간 하이라이트와 이전/다음 이벤트 점프.

### Phase 3: 구간 편집 + 내보내기

- I/O 구간 지정, 다중 클립 연속 편집 (원본 `build_target_clip_chain` 참고).
- WebCodecs `VideoEncoder`(H.264) + MP4 muxer(`mp4-muxer` 등)로 인코딩. 폴백으로 ffmpeg.wasm을 검토한다.
- 프레임 렌더링은 재생과 같은 `renderer.ts`를 재사용하고 `isPreview` 옵션만 구분한다.
- 해상도/비트레이트는 `RESOLUTIONS`를 따르되 **기기 등급이 허용하는 범위로 제한**한다.
- 진행률, 취소, 예상 시간 표시. 모바일은 Wake Lock을 건다.
- 결과 저장: File System Access의 `showSaveFilePicker`, 불가하면 Blob 다운로드.

### Phase 4: 개인정보 보호 (High 등급 한정)

- `onnxruntime-web` (WebGPU 우선, WASM 폴백)으로 `models/yolov8n.onnx`, `face_detection_yunet.onnx` 로딩.
- `privacy_filter.py` 이식: `BoxTracker`, 차량 검출 → 번호판 후보 → 기하/숫자/한국 번호판 프로파일 검증, 블러 적용.
- 번호판 선명화(`plate_enhancer.py`)는 WebGL 셰이더나 canvas로 구현한다. 번호판 모자이크와 선명화는 **배타적**이다.
- 정확도는 Python 결과와 비교 검증한다. 차이가 크면 보고하고 임의로 우회하지 않는다.

### Phase 5: PWA / 마무리

- manifest, service worker (앱 셸과 ONNX 모델 캐시), 설치 안내.
- 에러 화면, 미지원 브라우저 안내, 접근성 기본 점검.

## 3. 기기 사양 제약 (Capability Gating)

`src/core/capability.ts`에서 앱 시작 시 한 번 측정해 등급을 확정한다.

측정 항목:
- `navigator.deviceMemory`, `hardwareConcurrency` (Safari/Firefox는 미지원이므로 참고값으로만 사용).
- WebGPU 지원 여부.
- `VideoDecoder.isConfigSupported` / `VideoEncoder.isConfigSupported` (H.264, 해상도, fps).
- 짧은 디코드 벤치마크 (1~2초). **벤치마크 결과를 우선한다.**

| 등급 | 대상 | 허용 범위 |
|---|---|---|
| High | 데스크톱, WebGPU 지원 | 4캠 동시 재생, FHD 내보내기, AI 모자이크, 전체 감지 |
| Mid | 최근 노트북/태블릿 | 2캠 또는 1:3, HD 내보내기, 모자이크는 간격 검출 |
| Low | 구형 폰 | 단일 캠 + HUD, 저해상도 센트리 감지, 내보내기/AI 모자이크 비활성 |

- 등급별 제한은 설정 테이블 하나(`capabilityPolicy`)에서 관리한다. UI는 이 테이블만 참조한다.
- 제한으로 막힌 기능은 숨기지 말고 **비활성 + 이유 표시**한다.
- 사용자가 수동으로 등급을 낮추는 옵션은 두되, 높이는 옵션은 두지 않는다.

## 4. 주의할 위험

- **프레임 정확도**: `<video>` seek는 부정확하다. HUD 싱크가 어긋나면 WebCodecs 디코딩으로 전환한다.
- **하드웨어 디코더 한계**: 폰에서 동시 디코드 4개는 실패할 수 있다. 실패 시 등급을 자동 하향한다.
- **메모리**: 클립은 캠당 수십 MB다. 전체를 메모리에 올리지 않는다. 프레임/ImageBitmap은 `close()`로 해제한다.
- **폴더 선택**: iOS Safari는 폴더 지정이 제한적이다. 다중 파일 선택으로 대체한다.
- **AI 모자이크**: WASM 단독으로는 느리다. 예상 시간을 먼저 보여주고 사용자가 동의한 경우에만 실행한다.

## 5. 완료 기준

- Phase 1: 샘플 클립에서 Python 앱과 같은 속도/조향/GPS 값이 표시된다. 4캠이 동기 재생된다.
- Phase 2: 센트리 클립에서 Python 앱과 비슷한 이벤트 구간이 나온다.
- Phase 3: 구간을 지정해 HUD가 포함된 MP4를 만들고, 일반 플레이어에서 재생된다.
- Phase 4: 번호판/얼굴이 가려지고 오탐/미탐이 Python 대비 크게 나쁘지 않다.
- 각 Phase 종료 시 변경 파일 목록, 확인 방법, 알려진 한계를 `PROGRESS.md`에 기록한다.

## 6. 참고: 원본 읽기 우선순위

1. `core/decoder.py` (전체, 약 330줄)
2. `core/constants.py`, `core/scanner.py`
3. `core/renderer.py`, `ui/main_window.py` (`scan_and_populate_tree`, `build_target_clip_chain`, `read_frames_with_cache`)
4. `core/exporter.py`, `core/privacy_filter.py`, `core/plate_enhancer.py`
