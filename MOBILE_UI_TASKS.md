# 모바일 UI 재설계 지시서 (Gemini Flash 용)

작업 경로: `E:\tesla\project\CT-dashcam-studio-web` (원본 `CT-dashcam-studio`는 수정 금지)
테스트: **Edge만 사용**, 영상은 `E:\tesla\project\testfile\SavedClips\2026-08-17_12-48-22`
관련 파일: `index.html`, `src/style.css`, `src/main.ts` (`initViewMode`, `applyViewMode`, `setupEventListeners`, `setupCanvasInteractions`), `test/edge_e2e_mobile_test.js`

## 0. 원칙
- **기능은 하나도 빠지면 안 됨.** 배치/구조/스타일은 자유롭게 갈아엎어도 됨 (현재 CSS의 `@media` + `body:not(.view-desktop)` 중첩 구조는 버리고 새로 짜도 OK).
- 기존 element id는 `main.ts`가 참조하므로 유지하거나, 바꾸면 `main.ts`도 같이 수정할 것.
- PC UI(1100px 이상 / `view-desktop`)는 절대 깨지면 안 됨. 기존 `test/edge_e2e_full_test.js`, `edge_e2e_multiclip_test.js` 통과 필수.

## 1. 반드시 유지할 기능 체크리스트 (모바일에서도 접근 가능해야 함)
1. 폴더/파일 불러오기 (`btn-open-folder`, `fallback-file-input`)
2. 클립 목록 (선택, 주행/주차 태그, 구간 `.in-range` 골드 하이라이트)
3. 재생/일시정지, 이전/다음 클립, 타임라인 스크럽, 배속 슬라이더, 연속재생
4. 구간 지정: `[ 시작점`, `] 끝점`, `↺ 초기화`, 구간 텍스트 배지 (다중 클립 구간)
5. 레이아웃 전환 1:3 / 2x2 / 단일(+카메라 선택 팝업), 화면 더블탭 단독 전환
6. 오버레이 체크박스 8종 (필러 PIP는 4캠이면 비활성)
7. 밝기/대비 슬라이더 (현재 세로모드에서 숨겨져 있음 → 복구)
8. 내보내기: 해상도/배속/FPS/예상용량/진행률/취소
9. 광고 영역 자리 (`.ad-box-group`) 유지
10. 기기 티어 배지 + 설명 툴팁 (모바일은 hover가 없으니 **탭하면 바텀시트**로)
11. `PC버전` ↔ `모바일` 전환 버튼, 단축키 안내(모바일에선 숨겨도 됨)

## 2. 현재 스크린샷에서 확인된 문제 (고쳐야 할 것)
- 세로: 플레이어가 작고(`max-height:36vh`), 하단 컨트롤이 **글자가 세로로 꺾임** ("이전", "다음", "배속"). 버튼 `white-space:nowrap`, 아이콘 위주로 축약 필요.
- 세로: 플레이어/컨트롤/탭 콘텐츠가 한 화면에서 답답함 → 컨트롤은 플레이어 바로 아래 고정, 나머지는 **바텀시트 또는 탭 패널**로.
- 가로: 상단바가 영상을 가리고, 하단 컨트롤 줄바꿈으로 깨짐("연속 재생", "밝기", "대비" 세로 꺾임), 클립 드로어가 영상과 겹쳐 지저분함.
- 캔버스 HUD(텔레메트리 바)는 1920 기준으로 그려져 폰에서 글씨가 너무 작음 → 모바일에서는 HUD를 캔버스 밖 HTML 오버레이로 단순화하거나, 최소 폰트 스케일 옵션 추가 (렌더러 `scale` 보정 검토).
- 버튼 터치 영역 44px 미만 다수.

## 3. 모바일 전용 구현 요구사항
### 3-1. 입력 (중요: 현재 터치 미지원)
- 타임라인 스크럽은 `mousedown/mousemove` 기반 → **Pointer Events로 교체** (`pointerdown/move/up` + `setPointerCapture`, `touch-action:none`). 터치 드래그로 스크럽 되어야 함.
- 캔버스 더블클릭 → 터치 **더블탭** 지원 (300ms 이내 2회 탭 감지, 위치는 기존 `getCanvasCoordinates` 재사용).
- 텔레메트리 컬럼 드래그 순서변경도 pointer 이벤트로 (모바일에서 기능이 어렵다면 길게 눌러 드래그).
- 슬라이더 더블클릭 리셋 → 라벨 더블탭 또는 길게 누르기.
- 구간 지정은 키보드 I/O가 없으므로 버튼을 크게.

### 3-2. 레이아웃
- `100dvh` + `env(safe-area-inset-*)` 사용, `index.html` viewport에 `viewport-fit=cover` 추가. 주소창 변화에도 깨지지 않게.
- **세로**: 상단 슬림 헤더(로고 + PC버전 버튼) / 플레이어 16:9 최대 폭 / 타임라인 + 1줄 컨트롤(이전, 재생, 다음, 배속칩, 구간 [ ] ↺ 아이콘) / 하단 탭(클립, 보기, 내보내기) 패널.
- **가로**: 영상 풀스크린, 컨트롤은 **탭하면 나타나고 3초 뒤 자동 숨김**하는 오버레이, 클립/설정은 우측 슬라이드 시트. 상단바는 컨트롤과 함께 표시/숨김.
- 파일명 `.clip-node`는 한 줄 말줄임, 텍스트 꺾임 금지.
- 밝기/대비/배속은 "보기 설정" 시트로 이동.

### 3-3. 모바일 환경 제약 대응
- **iOS Safari는 폴더 선택(`webkitdirectory`, `showDirectoryPicker`) 불가** → 모바일에선 `multiple` 파일 선택으로 mp4 여러 개 선택 (`accept="video/mp4"`), 문구도 "영상 파일 선택"으로 변경. 선택한 파일명의 `YYYY-MM-DD_HH-MM-SS-카메라.mp4` 패턴으로 클립 그룹핑되는지 확인.
- **LAN IP(http://192.168.x.x)는 secure context가 아니라 `VideoEncoder`(WebCodecs)가 없음.** 내보내기 전에 `window.isSecureContext`, `typeof VideoEncoder` 체크 → 불가 시 내보내기 버튼 비활성 + 이유 안내 문구 표시. 모바일 테스트용으로 `@vitejs/plugin-basic-ssl`로 `https://IP:5173` 개발 서버 옵션 추가 (`npm run dev:https` 스크립트).
- 모바일 내보내기는 메모리 한계 → 티어가 Low/Medium이면 기본 해상도를 HD/Compact로 낮추고 경고 표시.
- 모바일에서는 2x2/1:3에서 영상 4~6개 동시 재생이 무거우므로 티어 낮으면 기본 레이아웃을 단일로.

## 4. 검증 (Edge, 모바일 에뮬레이션)
`test/edge_e2e_mobile_test.js` 확장 후 아래 뷰포트 전부 스크린샷 + 체크:
- 390x844, 360x740(소형), 844x390(가로), 768x1024(태블릿 세로)
- 항목: 텍스트 꺾임/잘림 없음, 모든 버튼 44px 이상, 위 1번 체크리스트 11개가 전부 도달 가능, 터치 드래그 스크럽 동작(`page.touchscreen`/CDP `Input.dispatchTouchEvent`), 더블탭 단독 전환, PC↔모바일 전환, 구간 지정 후 다중 클립 내보내기 완료
- 스크린샷은 `docs/`에 저장하고 결과를 사용자에게 이미지로 보고. 기존 E2E 3종 회귀 통과 확인 후 커밋/푸시.
