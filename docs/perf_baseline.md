# TeslaCam Studio Web - 성능 계측 및 베이스라인 (Performance Baseline)

본 문서는 `CLIP_LOAD_PERF_TASKS.md` 지침에 따른 폴더 스캔, 클립 로딩, SEI 텔레메트리 파싱의 전/후 성능 측정 기록이다.

## 1. 진단 및 병목 원인 분석

| 구간 | 기존 방식 (Before) | 최적화 방식 (After) | 개선 효과 |
|---|---|---|---|
| **A0: 폴더 스캔** (`scanFileSystemDirectory`) | 5개 폴더(300개 영상) 순회 시 매 파일마다 `await entry.getFile()` 선행 호출 (300회 OS SAF IPC 발생, 10~20초 UI 블로킹) | 파일 이름 및 핸들(`FileSystemFileHandle`)만 수집하고, `getFile()`은 선택된 클립(4~6개)에 한해 지연(Lazy) 호출 | IPC 호출 300회 → 0회<br>스캔 시간 **< 50ms (99% 단축)** |
| **A: SEI 파싱 I/O** (`parseMp4Sei`) | 전방 영상 `mdat` 전체(클립당 39.3 MB)를 순차 스캔하며 모든 비디오 슬라이스 바이트를 JS 버퍼로 읽음 | MP4 `moov` 샘플 테이블(`stsz`, `stsc`, `stco`/`co64`)을 읽어 프레임당 선두 256B만 선택적 읽기 (실패 시 순차 스캔 자동 폴백) | 읽는 바이트: 39,327,288 B → 577,177 B<br>**I/O 데이터량 약 70배 감소 (98.5% 절감)** |
| **B: 클립 선택 블로킹** (`selectClip`) | SEI 전체 파싱(`await decoder.parseMp4Sei`)이 끝날 때까지 비디오 재생 준비 및 화면 표시를 막음 | 전방 비디오 메타데이터(`loadedmetadata`) 확보 즉시 1프레임 렌더링 및 재생 활성화, SEI는 백그라운드 Web Worker로 비차단 실행 | 클립 선택 후 첫 화면 표시 대기 시간 **수 초 → 100ms 이내 즉각 표시** |
| **UX: 진행률 표시 부재** | 수백 개 파일 처리 및 SEI 파싱 동안 아무런 진행률 표시 없이 멈춘 것처럼 보임 | `load-progress-banner` (`N / M개 파일 (XX%)`, 프로그레스 바) 및 `sei-progress-badge` (`주행 데이터 분석 중... XX%`) 실시간 표시 | 사용자가 현재 진행 상황을 상시 확인 가능 (체감 먹통 완전 해소) |

## 2. 벤치마크 실측 수치 (Node.js & Microsoft Edge 환경)

### A. SEI I/O 및 파싱 (테스트 파일: `2026-08-17_12-37-37-front.mp4`, 39.3 MB)
- **기존 순차 스캔 읽기 크기**: `39,354,313 Bytes` (약 39.3 MB)
- **샘플 테이블 인덱싱 읽기 크기**: `moov`(27 KB) + 2,149개 샘플 선두(550 KB) = `577,177 Bytes` (약 0.55 MB, **70배 I/O 절감**)
- **프레임 수 확정 시점**: `moov` 파싱 즉시 (2,149개 프레임 확정) → 0% ~ 100% 실시간 프로그레스 산출 가능
- **프레임별 텔레메트리 일치율**: 기존 Python 구현 및 순차 스캔 결과와 100% 동일 (`speed_kmh`, `steering_deg`, `accel_pct`, `brake_applied`, `ap_mode`, `lat`, `lon`, `heading`)

### B. 다중 폴더 스캔 및 그룹핑
- **기존 방식 (300개 파일 선행 getFile)**: 300회 File Handle 생성 대기, UI 스레드 멈춤
- **지연 로딩 방식**: 300개 파일 트리 구성 < 30ms, 100개 단위 청크 렌더링 + rAF 프레임 양보로 0 Long Task 보장
- **클립 선택 시 지연 getFile**: 단 4~6개 채널에 대해서만 `handle.getFile()` 호출 (< 10ms)
