# CT Dash Studio WEB 포팅 진행 보고서 (PROGRESS.md)

- **작업 디렉토리**: `E:\tesla\project\CT-dashcam-studio-web`
- **원본 디렉토리**: `E:\tesla\project\CT-dashcam-studio` (참조 전용, 수정 없음)
- **테스트 환경**: Microsoft Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`)
- **테스트 데이터**: `E:\tesla\project\testfile\SavedClips\2026-08-17_12-48-22` (실제 테슬라 6채널 MP4 클립)
- **참고 이미지 및 검증 결과**:
  - 원본 PC UI: [`docs/reference_pc_ui.png`](file:///E:/tesla/project/CT-dashcam-studio-web/docs/reference_pc_ui.png)
  - 웹 구현 결과: [`docs/current_web_ui.png`](file:///E:/tesla/project/CT-dashcam-studio-web/docs/current_web_ui.png)
  - 티어 툴팁 팝오버: [`docs/tier_tooltip_hover.png`](file:///E:/tesla/project/CT-dashcam-studio-web/docs/tier_tooltip_hover.png)

---

## 1. UI 일치화 및 웹 최적화 (UI_PARITY.md 기준)

### ✅ 레이아웃 구조 (Qt6 테마 일치 및 경량화)
1. **상단 헤더 제거**: 원본 PC 버전과 동일하게 영상과 조작부에 온전히 집중되는 전체 뷰.
2. **좌측 사이드바**:
   - `📁 TeslaCam 폴더 지정` 대형 블루 버튼 (`#0078D7`).
   - `클립 탐색기` 2열 테이블 (`클립 탐색기` | `유형 / 채널`):
     - `[주차]` 초록색(`#3fb950`), `[주행]` 흰색(`#e6edf3`) 자동 판별 및 채널 수 배지.
     - 활성 행 딥 블루 하이라이트.
   - `오버레이 요소` 2열 8개 체크박스 (타임스탬프, 스티어링, 속도, 페달, FSD, 필러 PIP, 깜빡이, OSM 지도).
   - `광고 배너 영역` (무거운 개인정보/번호판 모자이크를 걷어내고 구글 애드센스 및 스폰서 배너 공간 확보: `SPONSORED / AD` 플레이스홀더 박스).
   - `내보내기 설정` 그룹:
     - 출력 해상도 드롭다운 (QHD, FHD, HD, Compact).
     - 화면 레이아웃 3버튼 세그먼트 (`🔲 1:3`, `⊞ 2x2`, `⏹ 단일`).
     - 단일 카메라 선택 팝업 메뉴 (전방, 후방, 좌/우 펜더, 좌/우 B필러).
     - 저장 배속 및 출력 FPS 선택기.
     - 실시간 비트레이트 기반 `예상 크기: 약 N MB` (시안/골드 굵은 폰트).
     - `선택 구간 내보내기 (MP4)` 대형 버튼 및 인라인 진행률 바.
3. **영상 뷰 & 실시간 HUD 오버레이 (`src/core/renderer.ts`)**:
   - **QR 코드 완전 제거**: HUD 우측 하단의 QR 코드 및 불필요한 여백을 제거하여 텔레메트리 열 균등 배치.
   - **슬롯 배지**: 노란색 사각 배경(`rgb(250, 204, 21)`)에 검은색 굵은 텍스트(`FRONT MAIN`, `REAR`, `LEFT REPEATER` 등).
   - **B필러 PIP 위치 및 활성화 제어**:
     - **위치 수정**: 1:3 레이아웃에서 우측 필러(R-PILLAR)를 **전면 메인 화면(FRONT MAIN) 슬롯 우측 하단**에 정확히 배치.
     - **활성화 조건 제어**: 단일 카메라 모드이거나 필러 카메라가 없는 4채널 클립에서는 PIP 체크박스가 비활성화(disabled) 및 체크 해제(unchecked)되며, 필러 카메라를 포함한 분할 화면(1:3, 2x2) 모드에서만 활성화.
   - **HUD 컬럼 순서 및 디테일**:
     - `TIME`: 청록 닷, 상단 골드 날짜 `YYYY-MM-DD`, 수평 분리선, 하단 큰 흰색 시각 `HH:MM:SS`.
     - `STEERING`: 노란 닷, 96px 정밀 스티어링 휠 회전 렌더링.
     - `BLINKER`: 초록 닷, 좌/우 깜빡이 화살표 폴리곤.
     - `SPEED`: 노란 닷, 가로 프로그레스 바(최대 150km/h), 큰 노란 속도 숫자 + `km/h`.
     - `PEDALS`: 초록 닷, 세로 둥근 가속 게이지 바 + `ACC N%` + `BRK OFF/ON` 램프.
     - `FSD`: 4단계 수직 텍스트 (`MANUAL`, `TACC`, `AUTOPILOT`, `FSD`) + 원본 일치 시안/블루 하이라이트 박스(`테두리: #00d2ff, 배경: #0e384e, 닷: #00dcff, 텍스트: #50eeff`).
     - **미니맵**: 410px 폭, OpenStreetMap 타일 및 **중앙 빨간색 테슬라 탑뷰 차량 마커**.
4. **하단 타임라인 컨트롤 덱 (`#timelineDeck`) (경량화 완료)**:
   - **1단**: NLE 타임라인 스크러버 및 시안색 선택 구간 하이라이트.
   - **2단**: 타임코드 모니터 배지(`0:00:00 / 0:00:59`), `구간: t1 ~ t2 (N초)` 골드 배지, `[ 시작점`, `] 끝점`, `↺ 초기화` (무거운 센트리 모션 감지 스캔 클러스터 완전 제거).
   - **3단**: `|◀ 이전`, `▶ 재생 (Space)` (재생 시 에메랄드 그린 `⏸ 일시정지 (Space)`로 전환), `다음 ▶|`, `⚡ 배속` 슬라이더 및 수치 배지, `연속 재생` 체크박스, `☀ 밝기` 슬라이더, `◐ 대비` 슬라이더, `⌨ 단축키` 버튼.
5. **최하단 푸터**:
   - 좌측: 기기 성능 등급 배지 (`High Tier`), **마우스 오버 시 실시간 하드웨어 측정 사유와 High / Medium / Low 티어별 사양 기준을 안내하는 인터랙티브 글래스 툴팁 카드 표시**.
   - 우측: `CT Dash Studio WEB` (버전 표기 제거 및 신규 브랜드명 적용).

---

## 2. 사용자 인터랙션 구현

- **화면 더블클릭 (슬롯별 단독 뷰 전환)**:
  - 1:3 및 2x2 분할 화면에서 클릭한 카메라(전방, 후방, 좌측 펜더, 우측 펜더, 좌/우 B필러 PIP)를 정확하게 감지하여 해당 카메라 단독 전체화면(`단일 카메라`) 모드로 전환.
  - 단일 화면에서 임의 영역을 더블클릭하면 직전 분할 화면(`1:3` 또는 `2x2`)으로 원터치 복원.
  - 캔버스 왜곡 방지를 위해 `object-fit: contain` 레터박스 오프셋을 수학적으로 보정하는 `getCanvasCoordinates()` 구현.
- **HUD 바 드래그 (정밀 히트 테스트 및 이웃 교환)**:
  - 하단 HUD 바 내의 6개 텔레메트리 열(시간, 핸들, 깜빡이, 속도, 페달, FSD)의 위치를 정밀하게 히트 테스트(`hitTestTelemetryCol`).
  - 마우스 드래그 시 인접 열 중심선 임계값을 기준으로 좌우 스왑(`updateTelemetryDrag`) 및 `localStorage` 자동 영구 저장.
  - 마우스 호버 시 `grab`, 드래그 시 `grabbing` 커서 피드백 제공. HUD 바 더블클릭 시 기본 순서 즉시 초기화.
- **슬라이더 더블클릭 초기화**: 배속(1.0x), 밝기(0), 대비(100%) 기본값으로 원터치 복원.
- **연속 재생**: 클립 종료 시 다음 클립 자동 이어 재생.

---

## 3. Microsoft Edge 실기 검증 결과

- **실행 명령**: `node test/edge_e2e_full_test.js`
- **검증 환경**: Microsoft Edge (`msedge.exe`)
- **결과 로그**:
  ```text
  === Starting Complete Edge E2E Test (Qt6 UI Parity) ===
  ✓ Clips loaded in explorer tree
  ✓ Initial 6-cam clip PIP state: { disabled: false, checked: true }
  Testing Single Camera Mode PIP gating...
  ✓ Single-cam mode PIP state: { disabled: true, checked: false }
  Switching back to 1:3 multi-cam mode...
  ✓ Multi-cam restored PIP state: { disabled: false, checked: true }
  Selecting second clip (4-cam, no pillars)...
  ✓ 4-cam (no pillars) clip PIP state: { disabled: true, checked: false }
  Testing Double Click on Camera Slots (1:3 Layout)...
  ✓ Double-clicked REAR slot -> { layout: '단일 카메라', single_cam: 'back' }
  ✓ Double-clicked to restore -> 기본 (1:3 세로배치)
  ✓ Double-clicked LEFT REPEATER slot -> { layout: '단일 카메라', single_cam: 'left_repeater' }
  ✓ Double-clicked RIGHT REPEATER slot -> { layout: '단일 카메라', single_cam: 'right_repeater' }
  Testing Telemetry Column Drag & Hit Testing...
  ✓ Telemetry Hit Test & Drag Result: {
    hitTime: 'timestamp',
    hitSteer: 'steering',
    hitBlinker: 'turn_signal',
    hitSpeed: 'speed',
    hitPedal: 'pedal',
    hitFsd: 'fsd',
    swapped: true,
    beforeOrder: [ 'timestamp', 'steering', 'turn_signal', 'speed', 'pedal', 'fsd' ],
    afterOrder: [ 'timestamp', 'turn_signal', 'steering', 'speed', 'pedal', 'fsd' ],
    resetOrder: [ 'timestamp', 'steering', 'turn_signal', 'speed', 'pedal', 'fsd' ]
  }
  Testing Playback...
  ✓ Play Button State while playing: ⏸ 일시정지 (Space)
  Verifying Ad Placeholder, Footer Brand, and Tier Tooltip...
  ✓ Footer Brand text: CT Dash Studio WEB
  ✓ Ad placeholder present in sidebar: true
  ✓ Tier calculation reason: CPU 20코어, 메모리 32GB, WebGPU 가속 지원로 4채널 동시 고화질 재생 및 하드웨어 인코딩에 최적화되었습니다.
  Setting 2-second range for Export test...
  ✓ Range set: 구간: 5.0s ~ 7.0s (2.0초)
  ✓ Estimated size calculated: 예상 크기: 약 8.3 MB
  ✓ Current UI screenshot saved to: E:\tesla\project\CT-dashcam-studio-web\docs\current_web_ui.png
  Starting WebCodecs MP4 Export test...
  ✓ Export Result: 비디오 렌더링이 성공적으로 완료되었습니다!
  === All Features Verified Successfully on Microsoft Edge! ===
  ```
