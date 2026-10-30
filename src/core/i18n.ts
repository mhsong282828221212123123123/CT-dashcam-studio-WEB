import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

export type SupportedLang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW' | 'de' | 'fr' | 'es';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

export function isIOSOrAndroid(): boolean {
  return isIOS() || isAndroid();
}

export const TRANSLATIONS: Record<SupportedLang, Record<string, string>> = {
  de,
  fr,
  es,
  ko: {
    progress_ios_usb_note: "USB 2.0을 사용하는 아이폰(특히 Pro가 아닌 모델)은 외장 저장 장치에서 파일을 준비하는 데 오랜 시간이 걸릴 수 있습니다. 필요한 클립을 먼저 아이폰에 복사한 뒤 편집하는 것을 권장합니다.",
    progress_waiting_files: "파일 목록을 기다리는 중",
    progress_waiting_files_detail: "파일을 선택한 뒤에도 저장 장치에 따라 준비 시간이 걸릴 수 있습니다.",
    status_face_analysis: "모자이크 영역 분석: {0}% [파일 {1}/{2}]",
    error_face_analysis_frame: "얼굴 분석용 영상을 준비하지 못했습니다: {0}, {1}초. 모자이크 없이 저장하지 않고 내보내기를 중단합니다. ({2})",
    tip_qr_keep: "많은 사람들이 이 CT Dashcam Studio를 쓸 수 있도록 QR을 유지해주시면 감사해요.",
    theme_graphite: "그라파이트",
    theme_midnight: "미드나이트",
    theme_forest: "포레스트",
    theme_burgundy: "버건디",
    theme_amber: "앰버",
    theme_paper: "페이퍼",
    chk_qr: "QR 코드 🥺",
    preview_empty_description: "TeslaCam 폴더를 열고 클립을 선택하면 영상을 확인할 수 있습니다.",
    label_theme: "테마",
    preview_empty_title: "미리 볼 클립을 선택하세요",
    progress_files_received: "파일 목록 수신 완료 ({0}개), 분류 중...",
    alert_open_folder_failed: "폴더를 열 수 없습니다: {0}",
    error_export_cancelled: "비디오 내보내기가 취소되었습니다.",
    error_no_frames: "인코딩된 비디오 프레임이 없습니다.",
    error_encoder: "VideoEncoder 오류: {0}",
    error_no_chunks: "인코딩된 비디오 데이터가 없습니다.",
    error_empty_output: "생성된 비디오 파일 데이터가 비어 있습니다.",
    // 1. Navigation & Header
    btn_open_folder: 'TeslaCam 폴더 열기',
    btn_open_folder_mobile: '클립 폴더 열기',
    btn_open_files: '파일 선택 (대용량/RecentClips)',
    unit_min: '분',
    col_name: '클립 탐색기',
    col_type: '유형 / 채널',
    empty_state: '폴더를 지정하거나 영상 파일을 선택하면 클립 목록이 여기에 표시됩니다.',
    btn_pc_mode: 'PC버전',
    btn_mobile_mode: '모바일',
    btn_switch_mobile: '모바일 모드로 전환',
    btn_clip_list: '클립 목록',
    btn_drawer_menu: '메뉴 / 클립',
    btn_close: '닫기',
    drawer_clips: '클립',
    drawer_overlays: '오버레이',
    drawer_export: '추출',
    tab_clips: '클립 탐색',
    tab_overlays: '오버레이',
    tab_export: '내보내기',
    tab_export_label: '설정·추출',
    btn_add_home: '바로가기',
    drag_expand: '위로 올려 확장',
    sheet_collapse: '축소',
    add_home_title: '홈 화면 바로가기 추가',
    pc_mode_title: 'PC 버전으로 보기',
    close_drawer_title: '닫기 (왼쪽으로 쓸어넘겨서 닫기 가능)',

    // 2. Progress Banner & Scanning
    progress_scanning: '폴더 스캔 중...',
    progress_searching_clips: '폴더 탐색 중...',
    progress_searching_videos: '영상 탐색 중...',
    progress_found_videos: '영상 {0}개 발견 (폴더 {1}개)',
    progress_grouping_clips: '클립 분류 중...',
    progress_grouping_status: '{0} / {1}개 파일 ({2}%) · {3}개 클립',

    // 3. Clip Tree & Badges
    folder_recent: '최근클립',
    folder_saved: '저장된 클립',
    folder_sentry: '센트리 클립',
    tag_parking: '주차',
    tag_driving: '주행',
    tag_channels: '채널',
    empty_no_clips: '유효한 TeslaCam 클립을 찾을 수 없습니다.',

    // 4. Group Titles
    group_overlays: "영상 정보",
    group_export: '내보내기 설정',
    group_adjust: '화면 밝기 및 대비 보정',

    // 5. Overlays Checkboxes
    chk_timestamp: "촬영 시각",
    chk_steering: "조향각",
    chk_speed: "속도 (km/h)",
    chk_pedal: '가속 / 브레이크 페달',
    chk_fsd: "FSD / 오토파일럿",
    chk_pillar_pip: '필러 카메라 (PIP)',
    chk_turn_signal: "방향지시등",
    chk_map: 'GPS 미니맵 (OSM)',
    chk_face_blur: '얼굴 모자이크 (실험)',
    toast_face_blur_loading: '얼굴 모자이크 모델을 불러오는 중입니다...',
    alert_face_blur_failed: '얼굴 모자이크 기능을 불러오지 못했습니다.\n개인정보 보호를 위해 모자이크 없이 내보내지 않고 작업을 중단합니다.\n({0})',

    // 6. Export Options
    label_resolution: '출력 해상도:',
    label_layout: '화면 레이아웃:',
    label_speed: '저장 배속:',
    label_fps: '출력 FPS:',
    label_lang: "언어",
    res_qhd: 'QHD (2560x1440) - 최고화질',
    res_fhd: 'FHD (1920x1080) - 권장 표준',
    res_hd: 'HD (1280x720) - 용량 절감',
    res_compact: 'Compact (960x540) - 모바일용',
    layout_13: "전방 중심",
    layout_2x2: "4분할",
    layout_single: "단일 화면",
    layout_name_default: '기본 (1:3 세로배치)',
    layout_name_2x2: '2x2 분할 (전후/좌우)',
    layout_name_single: '단일 카메라',
    speed_05: '0.5x (슬로우)',
    speed_10: '1.0x (표준)',
    speed_15: '1.5x (빠르게)',
    speed_20: '2.0x (2배속)',
    speed_40: '4.0x (4배속)',
    fps_36: '36 FPS (원본 최적)',
    fps_36_speed: '36 FPS (배속 원본 최적)',
    fps_30: '30 FPS (표준)',
    fps_30_rec: '30 FPS (표준 권장)',
    fps_60: '60 FPS (고부드러움)',
    fps_24: '24 FPS (시네마)',
    fps_15: '15 FPS (용량 절감)',
    fps_saving: '15 FPS (절감)',
    fps_orig_default: '{0} FPS (원본 기본)',
    fps_orig_speed: '{0} FPS (배속 원본 최적)',
    fps_orig_optimal: '{0} FPS (원본 최적)',
    est_size_prefix: '예상 크기: 약 ',
    http_warning: 'HTTP 연결 환경에서는 브라우저 보안 제약으로 WebCodecs 내보내기가 제한될 수 있습니다 (HTTPS 연결 권장).',
    btn_export: '선택 구간 내보내기 (MP4)',
    btn_export_cancel: '내보내기 취소',
    status_ready: '대기 중...',
    status_preparing: '인코딩 준비 중... (총 {0}개 파일 구간)',
    status_encoding: '인코딩 진행 중: {0}% [파일 {1}/{2}]',
    status_success: '비디오 렌더링이 성공적으로 완료되었습니다!',
    status_error: '오류 발생: ',
    status_cancelling: '취소 처리 중...',

    // 7. Viewport & Transport
    drop_overlay_text: 'TeslaCam 폴더를 여기에 드롭하세요',
    sei_analyzing: '주행 데이터 분석 중... {0}%',
    sei_analyzing_frames: '주행 데이터 분석 중... {0}% ({1}/{2}f)',
    map_no_gps: 'GPS 신호 없음',
    slider_brightness_label: '화면 밝기',
    slider_contrast_label: '화면 대비',
    cam_select_title: '카메라 선택',
    cam_front: '전방 (Front)',
    cam_back: '후방 (Rear)',
    cam_left_repeater: '좌측 펜더 (Left)',
    cam_right_repeater: '우측 펜더 (Right)',
    cam_left_pillar: '좌측 B필러',
    cam_right_pillar: '우측 B필러',
    range_unspecified: '선택 구간: 미지정',
    range_unspecified_full: '선택 구간: 미지정 (전체 {0}초)',
    range_specified: '구간: {0} ~ {1} (총 {2}초{3})',
    range_multi_files: '({0}개 파일 연속)',
    range_need_out: '시작점: {0} (끝점 선택 필요)',
    range_need_in: '끝점: {0} (시작점 선택 필요)',
    btn_prev: '|◀ 이전',
    btn_play: '▶ 재생',
    btn_pause: '일시정지',
    btn_next: '다음 ▶|',
    play_with_space: '▶ 재생 (Space)',
    pause_with_space: '일시정지 (Space)',
    btn_in: '[ 시작점',
    btn_out: '] 끝점',
    btn_reset: '↺ 초기화',
    chk_auto_next: '연속재생',
    lbl_speed: '배속',
    lbl_bright: '밝기',
    lbl_contrast: '대비',
    btn_hotkeys: '단축키',

    // 8. Tooltips
    tip_set_in: '구간 시작점 설정 (단축키: I)',
    tip_set_out: '구간 종료점 설정 (단축키: O)',
    tip_reset_range: '구간 선택 초기화',
    tip_prev_clip: '이전 클립 ([)',
    tip_play_main: '재생 / 일시정지 (Space)',
    tip_next_clip: '다음 클립 (])',
    tip_restore_speed: '더블클릭 시 1.0x 복원',
    tip_restore_bright: '더블클릭 시 0 복원',
    tip_restore_contrast: '더블클릭 시 100% 복원',
    tip_hotkey_guide: '단축키 안내 (F1)',

    // 9. Tier Tooltip & Modal
    tier_measuring: '측정 중...',
    tier_title: '기기 성능 등급 (Device Tier)',
    tier_section_reason: '현재 기기 측정 및 산정 사유',
    tier_section_types: '티어 종류 및 사양 기준',
    tier_high_desc: '8코어+ / RAM 6GB+ / WebGPU 가속  4채널 동시 고화질 동기 재생 및 초고속 내보내기',
    tier_mid_desc: '4~6코어 / RAM 4GB+  1:3 분할 재생 및 HD 비디오 내보내기 표준 지원',
    tier_low_desc: '2코어 이하 / RAM 2GB 이하  단일 카메라 모드 중심 경량 재생 최적화',
    tier_reason_high: 'CPU {concurrency}코어, 메모리 {memory}GB, {accel}로 4채널 동시 고화질 재생 및 하드웨어 인코딩에 최적화되었습니다.',
    tier_accel_webgpu: 'WebGPU 가속 지원',
    tier_accel_multithread: "8코어 이상 멀티스레드",
    tier_reason_low: 'CPU {concurrency}코어, 메모리 {memory}GB 또는 가속 API 미지원으로 원활한 재생을 위해 단일 카메라 중심 경량 모드가 권장됩니다.',
    tier_reason_mid: 'CPU {concurrency}코어, 메모리 {memory}GB로 표준 1:3 분할 화면 재생 및 HD 비디오 내보내기를 안정적으로 지원합니다.',
    btn_pc_install_text: '앱 설치',
    btn_pc_install_title: '바탕화면에 웹앱 설치 (아이콘 생성)',
    modal_confirm: '확인',

    // 10. Hotkey Modal
    hotkey_modal_title: '단축키 및 마우스 조작 안내',
    hk_space: '영상 재생 / 일시정지',
    hk_seek_1: '1초 전 / 후 탐색',
    hk_seek_5: '5초 전 / 후 고속 탐색',
    hk_home: '현재 클립 0초로 이동',
    hk_clip_step: '이전 / 다음 클립으로 전환',
    hk_in_out: '내보낼 구간 시작점(I) / 끝점(O) 설정',
    hk_fullscreen: '해당 카메라 단독 풀스크린 전환 / 이전 복귀',
    hk_telemetry_drag: '텔레메트리 표시 순서 좌우 드래그 변경',
    hk_telemetry_reset: '텔레메트리 표시 순서 기본 배치로 초기화',
    hk_slider_reset: '배속(1.0x), 밝기(0), 대비(100%) 기본값 복원',
    hk_guide_pop: '단축키 안내 팝업',

    // 11. App Install Guide Modal
    install_guide_title: '홈 화면 바로가기 추가',
    install_preview_sub: '앱처럼 전체화면으로 즉시 실행',
    install_title_desktop: 'PC 데스크톱 (Windows / Edge / Chrome)',
    install_step_desktop_1: '브라우저 상단 주소창 우측 끝의 앱 설치(⊕ 또는  ) 아이콘을 클릭하거나,',
    install_step_desktop_2: "브라우저 메뉴(⋯ 또는 ⋮)  '앱'  'CT Dashcam Studio 설치'를 선택하세요.",
    install_step_desktop_3: "'바탕 화면 바로 가기 만들기'를 체크하면 바탕화면에 앱 아이콘이 바로 생성됩니다!",
    install_title_android: '안드로이드 (Galaxy / Chrome / 삼성 인터넷)',
    install_step_android_1: '아래 [ 즉시 바로가기 추가] 버튼을 누르거나,',
    install_step_android_2: '브라우저 상단/하단 더보기(⋮ 또는 ≡) 메뉴 탭',
    install_step_android_3: "'현재 페이지 추가' 또는 '홈 화면에 추가'를 선택하세요.",
    install_btn_pwa: '즉시 바로가기 추가',
    install_title_ios: '아이폰 / iPad (Safari)',
    install_step_ios_1: '사파리 하단 중앙의 공유 버튼() 탭',
    install_step_ios_2: "메뉴를 아래로 스크롤하여 '홈 화면에 추가 (+)' 탭",
    install_step_ios_3: "우측 상단 '추가'를 누르면 홈 화면에 바로가기 생성!",
    install_btn_copy: '페이지 링크 복사',
    install_copy_success: '링크 복사 완료!',

    // 12. Export Progress Modal
    export_modal_title: '비디오 내보내기 진행 중',
    export_modal_file_tag: '파일 {0}/{1}',
    export_modal_fps_info: '인코딩 진행 중: {0}% ({1} FPS, {2}x)',
    export_modal_fps_prep: '인코딩 준비 중... ({0} FPS, {1}x)',
    export_modal_cancelling: '인코딩을 취소하는 중입니다...',
    export_warn_title: '화면을 켠 채로 유지해 주세요!',
    export_warn_body: '화면을 끄거나 다른 앱으로 전환하면 브라우저 정책으로 인해 영상 인코딩이 일시 중지되거나 취소될 수 있습니다.',
    export_success_alert: '영상 내보내기가 완료되었습니다!\n기기의 [다운로드] 폴더를 확인하세요.',
    export_success_save_desc: "렌더링 완료! 다운로드를 시작했습니다.",

    // 13. Alert Dialogs
    alert_in_after_out: '시작점이 끝점보다 뒤이거나 같습니다.\n시간 순서가 올바르지 않습니다.',
    alert_out_before_in: '끝점이 시작점보다 앞서거나 같습니다.\n시간 순서가 올바르지 않습니다.',
    alert_max_duration: '선택 구간이 {0}분입니다.\n최대 내보내기 가능 길이는 30분(1,800초)입니다.',
    alert_http_security: '브라우저 보안 정책상 HTTP 환경(공유기 IP)에서는 WebCodecs 비디오 인코딩이 지원되지 않습니다.\nHTTPS(dev:https)로 접속하거나 데스크톱 로컬(localhost)에서 내보내기를 진행해 주세요.',
    alert_no_range: '내보낼 영상 구간이 없습니다.',
    alert_pc_install: '브라우저 주소창 우측(⊕) 또는 메뉴(⋯) > 앱 > "CT Dashcam Studio 설치"를 선택하세요.',
    alert_ios_silent_abort: '선택한 폴더의 파일이 너무 많아 iOS에서 불러오기를 취소했습니다. 개별 하위 폴더를 선택하거나 [파일 선택] 기능을 이용해 주세요.',
    alert_ios_max_duration: "iOS에서는 3분을 넘는 영상의 내보내기가 불안정할 수 있습니다. 안정적인 내보내기를 위해 더 짧은 구간을 선택해 주세요.",
    confirm_mobile_long_clip: '클립이 너무 길어 정상 추출이 되지 않을 수 있습니다. 계속 진행하시겠습니까?',
    toast_load_timeout: '파일 불러오기 시간이 2분을 초과하여 취소되었습니다. 외장 장치 연결 상태나 파일 개수를 확인해 주세요.',
    toast_encrypted_clips: '테슬라 차량의 블랙박스 암호화(EncryptedClips) 폴더가 감지되었습니다. 암호화된 클립은 차량 내 화면이나 테슬라 앱에서만 재생할 수 있습니다.',
    pillar_cam_na: '4채널 영상에는 B필러 카메라가 없습니다',
  },

  en: {
    progress_ios_usb_note: "On iPhones using USB 2.0, especially non-Pro models, preparing files from external storage can take a long time. We recommend copying the clips you need to your iPhone before editing.",
    progress_waiting_files: "Waiting for the file list",
    progress_waiting_files_detail: "After selection, your storage device may need time to prepare the files.",
    status_face_analysis: "Analyzing mosaic regions: {0}% [File {1}/{2}]",
    error_face_analysis_frame: "Could not prepare a frame for face analysis: {0}, {1}s. Export stopped rather than saving without the mosaic. ({2})",
    tip_qr_keep: "We’d appreciate you keeping the QR code so more people can discover and use CT Dashcam Studio.",
    theme_graphite: "Graphite",
    theme_midnight: "Midnight",
    theme_forest: "Forest",
    theme_burgundy: "Burgundy",
    theme_amber: "Amber",
    theme_paper: "Paper",
    chk_qr: "QR code 🥺",
    preview_empty_description: "Open a TeslaCam folder, then select a clip to view your footage.",
    label_theme: "Theme",
    preview_empty_title: "Select a clip to preview",
    progress_files_received: "File list received ({0} files), grouping...",
    alert_open_folder_failed: "Cannot open folder: {0}",
    error_export_cancelled: "Video export was cancelled.",
    error_no_frames: "No video frames were encoded.",
    error_encoder: "VideoEncoder error: {0}",
    error_no_chunks: "No encoded video chunks were received.",
    error_empty_output: "The generated video file is empty.",
    // 1. Navigation & Header
    btn_open_folder: 'Open TeslaCam Folder',
    btn_open_folder_mobile: 'Open Clip Folder',
    btn_open_files: 'Select Files (Large/Recent)',
    unit_min: 'm',
    col_name: 'Clip Explorer',
    col_type: 'Type / Channels',
    empty_state: "Select a folder or video files to load clips here.",
    btn_pc_mode: 'PC Mode',
    btn_mobile_mode: 'Mobile',
    btn_switch_mobile: 'Switch to Mobile Mode',
    btn_clip_list: 'Clip List',
    btn_drawer_menu: 'Menu / Clips',
    btn_close: 'Close',
    drawer_clips: 'Clips',
    drawer_overlays: 'Overlays',
    drawer_export: 'Export',
    tab_clips: 'Clips',
    tab_overlays: 'Overlays',
    tab_export: 'Export',
    tab_export_label: 'Export',
    btn_add_home: 'Shortcut',
    drag_expand: 'Swipe up to expand',
    sheet_collapse: 'Collapse',
    add_home_title: 'Add to Home Screen',
    pc_mode_title: 'View PC Version',
    close_drawer_title: 'Close (Swipe left to close)',

    // 2. Progress Banner & Scanning
    progress_scanning: 'Scanning folder...',
    progress_searching_clips: 'Exploring folder...',
    progress_searching_videos: 'Searching videos...',
    progress_found_videos: '{0} videos found ({1} folders)',
    progress_grouping_clips: 'Grouping clips...',
    progress_grouping_status: '{0} / {1} files ({2}%) · {3} clips',

    // 3. Clip Tree & Badges
    folder_recent: 'Recent Clips',
    folder_saved: 'Saved Clips',
    folder_sentry: 'Sentry Clips',
    tag_parking: 'Parking',
    tag_driving: 'Driving',
    tag_channels: 'CH',
    empty_no_clips: 'No valid TeslaCam clips found.',

    // 4. Group Titles
    group_overlays: "Video overlays",
    group_export: 'Export Settings',
    group_adjust: 'Brightness & Contrast',

    // 5. Overlays Checkboxes
    chk_timestamp: 'Timestamp',
    chk_steering: 'Steering Angle',
    chk_speed: 'Actual Speed (km/h)',
    chk_pedal: 'Accel / Brake Pedals',
    chk_fsd: 'FSD / Autopilot Mode',
    chk_pillar_pip: 'Pillar Camera (PIP)',
    chk_turn_signal: 'Turn Signals',
    chk_map: 'GPS Minimap (OSM)',
    chk_face_blur: 'Face Mosaic (Beta)',
    toast_face_blur_loading: 'Loading the face mosaic model...',
    alert_face_blur_failed: 'Failed to load the face mosaic feature.\nTo protect privacy, the export is cancelled instead of saving without the mosaic.\n({0})',

    // 6. Export Options
    label_resolution: 'Resolution:',
    label_layout: 'Layout:',
    label_speed: 'Speed:',
    label_fps: 'Output FPS:',
    label_lang: "Language:",
    res_qhd: 'QHD (2560x1440) - Ultra',
    res_fhd: 'FHD (1920x1080) - Recommended',
    res_hd: 'HD (1280x720) - Compact',
    res_compact: 'Compact (960x540) - Mobile',
    layout_13: "Front focus",
    layout_2x2: "4 cameras",
    layout_single: 'Single',
    layout_name_default: 'Default (1:3 Layout)',
    layout_name_2x2: '2x2 Grid (Front/Rear/Repeater)',
    layout_name_single: 'Single Camera',
    speed_05: '0.5x (Slow)',
    speed_10: '1.0x (Normal)',
    speed_15: '1.5x (Fast)',
    speed_20: '2.0x (2x Speed)',
    speed_40: '4.0x (4x Speed)',
    fps_36: '36 FPS (Native)',
    fps_36_speed: '36 FPS (High Speed Native)',
    fps_30: '30 FPS (Standard)',
    fps_30_rec: '30 FPS (Standard)',
    fps_60: '60 FPS (Smooth)',
    fps_24: '24 FPS (Cinema)',
    fps_15: '15 FPS (Compact)',
    fps_saving: '15 FPS (Compact)',
    fps_orig_default: '{0} FPS (Original Native)',
    fps_orig_speed: '{0} FPS (Speed Native)',
    fps_orig_optimal: '{0} FPS (Original Native)',
    est_size_prefix: 'Est. Size: ~',
    http_warning: 'Due to browser security restrictions on HTTP, WebCodecs export might be limited (HTTPS recommended).',
    btn_export: 'Export Selected Range (MP4)',
    btn_export_cancel: 'Cancel Export',
    status_ready: 'Ready...',
    status_preparing: 'Preparing encode... ({0} segments)',
    status_encoding: 'Encoding: {0}% [File {1}/{2}]',
    status_success: 'Video rendering completed successfully!',
    status_error: 'Error: ',
    status_cancelling: 'Cancelling...',

    // 7. Viewport & Transport
    drop_overlay_text: 'Drop TeslaCam folder here',
    sei_analyzing: 'Analyzing telemetry... {0}%',
    sei_analyzing_frames: 'Analyzing telemetry... {0}% ({1}/{2}f)',
    map_no_gps: 'No GPS Signal',
    slider_brightness_label: 'Brightness',
    slider_contrast_label: 'Contrast',
    cam_select_title: 'Select Camera',
    cam_front: 'Front',
    cam_back: 'Rear',
    cam_left_repeater: 'Left Repeater',
    cam_right_repeater: 'Right Repeater',
    cam_left_pillar: 'Left B-Pillar',
    cam_right_pillar: 'Right B-Pillar',
    range_unspecified: 'Range: Not set',
    range_unspecified_full: 'Range: Unspecified (Total {0}s)',
    range_specified: 'Range: {0} ~ {1} (Total {2}s{3})',
    range_multi_files: '({0} consecutive files)',
    range_need_out: 'In: {0} (Select Out point)',
    range_need_in: 'Out: {0} (Select In point)',
    btn_prev: '|◀ Prev',
    btn_play: '▶ Play',
    btn_pause: 'Pause',
    btn_next: 'Next ▶|',
    play_with_space: '▶ Play (Space)',
    pause_with_space: 'Pause (Space)',
    btn_in: '[ In Point',
    btn_out: '] Out Point',
    btn_reset: '↺ Reset',
    chk_auto_next: 'Continuous Play',
    lbl_speed: 'Speed',
    lbl_bright: 'Bright',
    lbl_contrast: 'Contrast',
    btn_hotkeys: 'Shortcuts',

    // 8. Tooltips
    tip_set_in: 'Set range in point (Key: I)',
    tip_set_out: 'Set range out point (Key: O)',
    tip_reset_range: 'Reset range selection',
    tip_prev_clip: 'Previous clip ([)',
    tip_play_main: 'Play / Pause (Space)',
    tip_next_clip: 'Next clip (])',
    tip_restore_speed: 'Double click to restore 1.0x',
    tip_restore_bright: 'Double click to restore 0',
    tip_restore_contrast: 'Double click to restore 100%',
    tip_hotkey_guide: 'Shortcuts guide (F1)',

    // 9. Tier Tooltip & Modal
    tier_measuring: 'Measuring...',
    tier_title: 'Device Tier',
    tier_section_reason: 'Device Assessment Reason',
    tier_section_types: 'Tier Levels & Criteria',
    tier_high_desc: '8+ Cores / 6GB+ RAM / WebGPU  4-channel sync playback & ultra-fast export',
    tier_mid_desc: '4-6 Cores / 4GB+ RAM  1:3 split playback & standard HD video export',
    tier_low_desc: '≤2 Cores / ≤2GB RAM  Optimized for single camera lightweight playback',
    tier_reason_high: 'Optimized for 4-channel sync playback and hardware encoding with {concurrency}-core CPU, {memory}GB RAM, and {accel}.',
    tier_accel_webgpu: 'WebGPU acceleration support',
    tier_accel_multithread: "multi-threading with 8 or more cores",
    tier_reason_low: 'Lightweight single camera mode is recommended due to {concurrency}-core CPU, {memory}GB RAM, or lack of acceleration APIs.',
    tier_reason_mid: 'Reliably supports standard 1:3 split playback and HD video export with {concurrency}-core CPU and {memory}GB RAM.',
    btn_pc_install_text: 'Install App',
    btn_pc_install_title: 'Install web app on desktop (Create icon)',
    modal_confirm: 'OK',

    // 10. Hotkey Modal
    hotkey_modal_title: 'Keyboard Shortcuts & Mouse Controls',
    hk_space: 'Play / Pause Video',
    hk_seek_1: 'Seek 1s backward / forward',
    hk_seek_5: 'Seek 5s backward / forward',
    hk_home: 'Jump to start of clip (0s)',
    hk_clip_step: 'Switch to previous / next clip',
    hk_in_out: 'Set export range In(I) / Out(O)',
    hk_fullscreen: 'Toggle camera full screen / restore',
    hk_telemetry_drag: 'Drag telemetry column left/right to reorder',
    hk_telemetry_reset: 'Double click bottom bar to reset telemetry',
    hk_slider_reset: 'Double click slider to reset speed/brightness/contrast',
    hk_guide_pop: 'Show shortcuts popup',

    // 11. App Install Guide Modal
    install_guide_title: 'Add to Home Screen',
    install_preview_sub: 'Run in full screen like a native app',
    install_title_desktop: 'Desktop PC (Windows / Edge / Chrome)',
    install_step_desktop_1: 'Click the Install App (⊕ or ) icon in the address bar, or',
    install_step_desktop_2: "Go to browser menu (⋯ or ⋮)  'Apps'  'Install CT Dashcam Studio'.",
    install_step_desktop_3: "Check 'Create Desktop Shortcut' to instantly create an icon on your desktop!",
    install_title_android: 'Android (Galaxy / Chrome / Samsung Internet)',
    install_step_android_1: 'Tap the [ Add Shortcut Instantly] button below, or',
    install_step_android_2: 'Tap the browser menu (⋮ or ≡),',
    install_step_android_3: "Select 'Add to Home screen'.",
    install_btn_pwa: 'Add Shortcut Instantly',
    install_title_ios: 'iPhone / iPad (Safari)',
    install_step_ios_1: 'Tap the Share button () at the bottom of Safari',
    install_step_ios_2: "Scroll down and tap 'Add to Home Screen (+)'",
    install_step_ios_3: "Tap 'Add' in the top right to create the shortcut!",
    install_btn_copy: 'Copy Link',
    install_copy_success: 'Link copied!',

    // 12. Export Progress Modal
    export_modal_title: 'Exporting Video in Progress',
    export_modal_file_tag: 'File {0}/{1}',
    export_modal_fps_info: 'Encoding: {0}% ({1} FPS, {2}x)',
    export_modal_fps_prep: 'Preparing encode... ({0} FPS, {1}x)',
    export_modal_cancelling: 'Cancelling encoding...',
    export_warn_title: 'Please keep the screen turned ON!',
    export_warn_body: 'Turning off the screen or switching to other apps may cause video encoding to pause or be cancelled due to browser policy.',
    export_success_alert: 'Video export completed!\nPlease check your Downloads folder.',
    export_success_save_desc: "Render complete! Download started.",

    // 13. Alert Dialogs
    alert_in_after_out: 'In point is after or equal to Out point.\nInvalid time range.',
    alert_out_before_in: 'Out point is before or equal to In point.\nInvalid time range.',
    alert_max_duration: 'Selected range is {0} min.\nMaximum export duration is 30 minutes (1,800s).',
    alert_http_security: 'Browser security prevents WebCodecs video encoding on insecure HTTP.\nPlease access via HTTPS or localhost.',
    alert_no_range: 'No video range selected for export.',
    alert_pc_install: 'Please select "Install CT Dashcam Studio" in the browser address bar (⊕) or menu (⋯) > Apps.',
    alert_ios_silent_abort: 'The selected folder contains too many files, so iOS cancelled loading. Please select a subfolder or use the [Select Files] option.',
    alert_ios_max_duration: "On iOS, exports longer than 3 minutes may be unstable. Select a shorter range for better reliability.",
    confirm_mobile_long_clip: 'The clip is very long and may not export properly. Do you want to proceed?',
    toast_load_timeout: 'File loading took longer than 2 minutes and was cancelled. Please check your storage device connection or file count.',
    toast_encrypted_clips: 'Tesla dashcam encrypted directory (EncryptedClips) detected. Encrypted clips can only be played inside the vehicle or via the Tesla app.',
    pillar_cam_na: 'B-pillar cameras are not available in 4-channel clips',
  },

  ja: {
    progress_ios_usb_note: "USB 2.0を使用するiPhone（特にPro以外のモデル）では、外部ストレージのファイルの準備に時間がかかる場合があります。必要なクリップを先にiPhoneへコピーしてから編集することをおすすめします。",
    progress_waiting_files: "ファイル一覧を待っています",
    progress_waiting_files_detail: "選択後も、ストレージによってはファイルの準備に時間がかかります。",
    status_face_analysis: "モザイク領域を解析中: {0}% [ファイル {1}/{2}]",
    error_face_analysis_frame: "顔解析用のフレームを準備できませんでした: {0}、{1}秒。モザイクなしでは保存せず、書き出しを中止します。({2})",
    tip_qr_keep: "より多くの方に CT Dashcam Studio を知って使っていただけるよう、QRコードを残していただけるとうれしいです。",
    theme_graphite: "グラファイト",
    theme_midnight: "ミッドナイト",
    theme_forest: "フォレスト",
    theme_burgundy: "バーガンディ",
    theme_amber: "アンバー",
    theme_paper: "ペーパー",
    chk_qr: "QRコード 🥺",
    preview_empty_description: "TeslaCamフォルダーを開き、クリップを選択すると映像を確認できます。",
    label_theme: "テーマ",
    preview_empty_title: "プレビューするクリップを選択",
    progress_files_received: "ファイル一覧を取得しました（{0}件）。分類中...",
    alert_open_folder_failed: "フォルダーを開けません: {0}",
    error_export_cancelled: "動画の書き出しを中止しました。",
    error_no_frames: "エンコードされた動画フレームがありません。",
    error_encoder: "VideoEncoderエラー: {0}",
    error_no_chunks: "エンコードされた動画データがありません。",
    error_empty_output: "生成された動画ファイルが空です。",
    // 1. Navigation & Header
    btn_open_folder: 'TeslaCamフォルダー指定',
    btn_open_folder_mobile: 'クリップフォルダー指定',
    btn_open_files: 'ファイル選択 (大容量/Recent)',
    unit_min: '分',
    col_name: 'クリップエクスプローラー',
    col_type: 'タイプ / チャンネル',
    empty_state: 'フォルダーを指定するとクリップ一覧がここに表示されます。',
    btn_pc_mode: 'PC版',
    btn_mobile_mode: 'モバイル',
    btn_switch_mobile: 'モバイルモードへ切替',
    btn_clip_list: 'クリップ一覧',
    btn_drawer_menu: 'メニュー / クリップ',
    btn_close: '閉じる',
    drawer_clips: 'クリップ',
    drawer_overlays: 'オーバーレイ',
    drawer_export: '出力',
    tab_clips: 'クリップ',
    tab_overlays: 'オーバーレイ',
    tab_export: 'エクスポート',
    tab_export_label: '設定・出力',
    btn_add_home: 'ショートカット',
    drag_expand: '上にスワイプして展開',
    sheet_collapse: '折りたたむ',
    add_home_title: 'ホーム画面に追加',
    pc_mode_title: 'PC版で表示',
    close_drawer_title: '閉じる (左スワイプで閉じる)',

    // 2. Progress Banner & Scanning
    progress_scanning: 'フォルダーをスキャン中...',
    progress_searching_clips: 'フォルダー探索中...',
    progress_searching_videos: '動画を検索中...',
    progress_found_videos: '動画 {0}件 検出 (フォルダ {1}件)',
    progress_grouping_clips: 'クリップ分類中...',
    progress_grouping_status: '{0} / {1} ファイル ({2}%) · {3} クリップ',

    // 3. Clip Tree & Badges
    folder_recent: '最近のクリップ',
    folder_saved: '保存済みクリップ',
    folder_sentry: 'セントリークリップ',
    tag_parking: '駐車',
    tag_driving: '走行',
    tag_channels: 'ch',
    empty_no_clips: '有効なTeslaCamクリップが見つかりませんでした。',

    // 4. Group Titles
    group_overlays: 'オーバーレイ要素',
    group_export: 'エクスポート設定',
    group_adjust: '明るさ・コントラスト補正',

    // 5. Overlays Checkboxes
    chk_timestamp: '実時間 (Timestamp)',
    chk_steering: 'ハンドル操舵角',
    chk_speed: '走行速度 (km/h)',
    chk_pedal: 'アクセル / ブレーキ',
    chk_fsd: "FSD / オートパイロットモード",
    chk_pillar_pip: 'ピラーカメラ (PIP)',
    chk_turn_signal: '方向指示器 (ウインカー)',
    chk_map: 'GPSミニマップ (OSM)',
    chk_face_blur: '顔モザイク (ベータ)',
    toast_face_blur_loading: '顔モザイクのモデルを読み込んでいます...',
    alert_face_blur_failed: '顔モザイク機能を読み込めませんでした。\nプライバシー保護のため、モザイクなしでは書き出さず処理を中止します。\n({0})',

    // 6. Export Options
    label_resolution: '出力解像度:',
    label_layout: '画面レイアウト:',
    label_speed: '保存倍速:',
    label_fps: '出力FPS:',
    label_lang: '言語 (Language) :',
    res_qhd: 'QHD (2560x1440) - 最高画質',
    res_fhd: 'FHD (1920x1080) - 推奨標準',
    res_hd: 'HD (1280x720) - 容量節約',
    res_compact: 'Compact (960x540) - モバイル向け',
    layout_13: "前方メイン",
    layout_2x2: "4分割",
    layout_single: '単一',
    layout_name_default: '標準 (1:3 レイアウト)',
    layout_name_2x2: '2x2 分割 (前後/左右)',
    layout_name_single: '単一カメラ',
    speed_05: '0.5x (スロー)',
    speed_10: '1.0x (標準)',
    speed_15: '1.5x (高速)',
    speed_20: '2.0x (2倍速)',
    speed_40: '4.0x (4倍速)',
    fps_36: '36 FPS (オリジナル最適)',
    fps_36_speed: '36 FPS (倍速オリジナル最適)',
    fps_30: '30 FPS (標準)',
    fps_30_rec: '30 FPS (標準推奨)',
    fps_60: "60 FPS (滑らか)",
    fps_24: '24 FPS (シネマ)',
    fps_15: '15 FPS (容量節約)',
    fps_saving: '15 FPS (節約)',
    fps_orig_default: '{0} FPS (オリジナル標準)',
    fps_orig_speed: '{0} FPS (倍速オリジナル最適)',
    fps_orig_optimal: '{0} FPS (オリジナル最適)',
    est_size_prefix: '予想サイズ: 約 ',
    http_warning: 'HTTP環境ではブラウザのセキュリティ制限によりWebCodecsエクスポートが制限される場合があります（HTTPS推奨）。',
    btn_export: '選択区間をエクスポート (MP4)',
    btn_export_cancel: 'エクスポート中止',
    status_ready: '待機中...',
    status_preparing: 'エンコード準備中... (合計 {0}区間)',
    status_encoding: 'エンコード中: {0}% [ファイル {1}/{2}]',
    status_success: 'ビデオレンダリングが正常に完了しました！',
    status_error: 'エラーが発生しました: ',
    status_cancelling: 'キャンセル処理中...',

    // 7. Viewport & Transport
    drop_overlay_text: 'TeslaCamフォルダーをここにドロップ',
    sei_analyzing: '走行データ解析中... {0}%',
    sei_analyzing_frames: '走行データ解析中... {0}% ({1}/{2}f)',
    map_no_gps: 'GPS信号なし',
    slider_brightness_label: '画面の明るさ',
    slider_contrast_label: '画面コントラスト',
    cam_select_title: 'カメラ選択',
    cam_front: '前方 (Front)',
    cam_back: '後方 (Rear)',
    cam_left_repeater: '左フェンダー (Left)',
    cam_right_repeater: '右フェンダー (Right)',
    cam_left_pillar: '左Bピラー',
    cam_right_pillar: '右Bピラー',
    range_unspecified: '選択区間: 未指定',
    range_unspecified_full: '選択区間: 未指定 (全体 {0}秒)',
    range_specified: '区間: {0} ~ {1} (合計 {2}秒{3})',
    range_multi_files: '({0}個ファイル連続)',
    range_need_out: '開始点: {0} (終了点を選択してください)',
    range_need_in: '終了点: {0} (開始点を選択してください)',
    btn_prev: '|◀ 前へ',
    btn_play: '▶ 再生',
    btn_pause: '一時停止',
    btn_next: '次へ ▶|',
    play_with_space: '▶ 再生 (Space)',
    pause_with_space: '一時停止 (Space)',
    btn_in: '[ 開始点',
    btn_out: '] 終了点',
    btn_reset: '↺ リセット',
    chk_auto_next: '連続再生',
    lbl_speed: '倍速',
    lbl_bright: '明るさ',
    lbl_contrast: 'コントラスト',
    btn_hotkeys: '操作案内',

    // 8. Tooltips
    tip_set_in: '区間開始点を設定 (ショートカット: I)',
    tip_set_out: '区間終了点を設定 (ショートカット: O)',
    tip_reset_range: '区間選択をリセット',
    tip_prev_clip: '前のクリップ ([)',
    tip_play_main: '再生 / 一時停止 (Space)',
    tip_next_clip: '次のクリップ (])',
    tip_restore_speed: 'ダブルクリックで1.0xに戻す',
    tip_restore_bright: 'ダブルクリックで0に戻す',
    tip_restore_contrast: 'ダブルクリックで100%に戻す',
    tip_hotkey_guide: 'ショートカット案内 (F1)',

    // 9. Tier Tooltip & Modal
    tier_measuring: '測定中...',
    tier_title: 'デバイス性能階層 (Device Tier)',
    tier_section_reason: 'デバイス測定と判定理由',
    tier_section_types: '階層の種類と仕様基準',
    tier_high_desc: '8コア以上 / RAM 6GB以上 / WebGPU  4ch同期再生・超高速エクスポート',
    tier_mid_desc: '4〜6コア / RAM 4GB以上  1:3分割再生およびHDエクスポート標準対応',
    tier_low_desc: '2コア以下 / RAM 2GB以下  単一カメラモード中心の軽量再生に最適化',
    tier_reason_high: 'CPU {concurrency}コア、メモリ {memory}GB、{accel}により、4ch同時高画質同期再生およびハードウェアエンコードに最適化されています。',
    tier_accel_webgpu: 'WebGPUアクセラレーション対応',
    tier_accel_multithread: "8コア以上のマルチスレッド",
    tier_reason_low: 'CPU {concurrency}コア、メモリ {memory}GBまたは高速化API非対応のため、単一カメラ中心の軽量再生モードが推奨されます。',
    tier_reason_mid: 'CPU {concurrency}コア、メモリ {memory}GBで標準1:3分割再生およびHDビデオエクスポートを安定してサポートします。',
    btn_pc_install_text: 'アプリをインストール',
    btn_pc_install_title: 'デスクトップにアプリをインストール (アイコン作成)',
    modal_confirm: '確認',

    // 10. Hotkey Modal
    hotkey_modal_title: 'ショートカットおよびマウス操作案内',
    hk_space: '動画再生 / 一時停止',
    hk_seek_1: '1秒前 / 後へシーク',
    hk_seek_5: '5秒前 / 後へ高速シーク',
    hk_home: 'クリップの先頭(0秒)へ移動',
    hk_clip_step: '前 / 次のクリップへ切替',
    hk_in_out: 'エクスポート区間の開始点(I) / 終了点(O)設定',
    hk_fullscreen: '該当カメラの全画面表示 / 復帰',
    hk_telemetry_drag: 'テレメトリ表示順を左右ドラッグで入替',
    hk_telemetry_reset: '下部バーをダブルクリックで既定配置に初期化',
    hk_slider_reset: 'スライダーをダブルクリックで既定値に復元',
    hk_guide_pop: 'ショートカット案内ポップアップ',

    // 11. App Install Guide Modal
    install_guide_title: 'ホーム画面に追加',
    install_preview_sub: 'ネイティブアプリのように全画面で起動',
    install_title_desktop: 'デスクトップPC (Windows / Edge / Chrome)',
    install_step_desktop_1: 'アドレスバー右端のアプリインストール(⊕ または  )アイコンをクリックするか、',
    install_step_desktop_2: "ブラウザメニュー(⋯ または ⋮)  「アプリ」  「CT Dashcam Studioをインストール」を選択します。",
    install_step_desktop_3: "「デスクトップ ショートカットを作成」にチェックを入れるとデスクトップにアイコンが作成されます！",
    install_title_android: 'Android (Galaxy / Chrome / サムスンブラウザ)',
    install_step_android_1: '下の [ ショートカットを即時追加] ボタンを押すか、',
    install_step_android_2: 'ブラウザのメニュー(⋮ または ≡)をタップし、',
    install_step_android_3: "「ホーム画面に追加」を選択してください。",
    install_btn_pwa: 'ショートカットを即時追加',
    install_title_ios: 'iPhone / iPad (Safari)',
    install_step_ios_1: 'Safari下部中央の共有ボタン () をタップ',
    install_step_ios_2: "メニューを下にスクロールして「ホーム画面に追加 (+)」をタップ",
    install_step_ios_3: "右上の「追加」を押すとホーム画面に作成されます！",
    install_btn_copy: 'リンクをコピー',
    install_copy_success: 'リンクをコピーしました！',

    // 12. Export Progress Modal
    export_modal_title: 'ビデオエクスポート処理中',
    export_modal_file_tag: 'ファイル {0}/{1}',
    export_modal_fps_info: 'エンコード中: {0}% ({1} FPS, {2}x)',
    export_modal_fps_prep: 'エンコード準備中... ({0} FPS, {1}x)',
    export_modal_cancelling: 'エンコードを中止しています...',
    export_warn_title: '画面を点灯したまま保持してください！',
    export_warn_body: '画面をオフにしたり他のアプリに切り替えると、ブラウザの仕様により動画エンコードが一時停止または中断される場合があります。',
    export_success_alert: 'ビデオのエクスポートが完了しました！\n端末の「ダウンロード」フォルダを確認してください。',
    export_success_save_desc: "レンダリング完了！ダウンロードを開始しました。",

    // 13. Alert Dialogs
    alert_in_after_out: '開始点が終了点より後または同じです。\n時間順序が正しくありません。',
    alert_out_before_in: '終了点が開始点より前または同じです。\n時間順序が正しくありません。',
    alert_max_duration: '選択区間が {0}分です。\n最大エクスポート可能時間は30分(1,800秒)です。',
    alert_http_security: 'ブラウザのセキュリティ方針により、非セキュアなHTTP環境ではWebCodecsエンコードが制限されます。\nHTTPSまたはlocalhostでアクセスしてください。',
    alert_no_range: 'エクスポートする区間が選択されていません。',
    alert_pc_install: 'アドレスバー右側の(⊕)またはメニュー(⋯) > アプリ > 「CT Dashcam Studioをインストール」を選択してください。',
    alert_ios_silent_abort: '選択したフォルダーのファイルが多すぎるため、iOSで読み込みがキャンセルされました。個別フォルダーを選択するか、[ファイル選択]機能をご利用ください。',
    alert_ios_max_duration: "iOSでは3分を超える動画の書き出しが不安定になる場合があります。安定性を高めるには、短い区間を選択してください。",
    confirm_mobile_long_clip: 'クリップが長すぎるため、正常に出力できない可能性があります。続行しますか？',
    toast_load_timeout: 'ファイルの読み込みが2分を超えたためキャンセルされました。外部デバイスの接続状態やファイル数をご確認ください。',
    toast_encrypted_clips: 'テスラ車載暗号化フォルダ（EncryptedClips）が検出されました。暗号化されたクリップは車内画面またはTeslaアプリでのみ再生できます。',
    pillar_cam_na: '4チャンネル映像にはBピラーカメラがありません',
  },

  'zh-CN': {
    progress_ios_usb_note: "使用 USB 2.0 的 iPhone（尤其是非 Pro 机型）从外部存储设备准备文件时可能需要较长时间。建议先将所需片段复制到 iPhone，再进行编辑。",
    progress_waiting_files: "正在等待文件列表",
    progress_waiting_files_detail: "选择后，存储设备可能仍需一些时间准备文件。",
    status_face_analysis: "正在分析马赛克区域：{0}% [文件 {1}/{2}]",
    error_face_analysis_frame: "无法准备人脸分析帧：{0}，{1}秒。已停止导出，不会保存未打码的视频。({2})",
    tip_qr_keep: "希望您能保留二维码，让更多人发现并使用 CT Dashcam Studio。谢谢您的支持！",
    theme_graphite: "石墨",
    theme_midnight: "午夜蓝",
    theme_forest: "森林绿",
    theme_burgundy: "勃艮第红",
    theme_amber: "琥珀",
    theme_paper: "纸白",
    chk_qr: "二维码 🥺",
    preview_empty_description: "打开 TeslaCam 文件夹并选择片段，即可查看视频。",
    label_theme: "主题",
    preview_empty_title: "选择片段以预览",
    progress_files_received: "已接收文件列表（{0}个），正在分类...",
    alert_open_folder_failed: "无法打开文件夹：{0}",
    error_export_cancelled: "视频导出已取消。",
    error_no_frames: "没有已编码的视频帧。",
    error_encoder: "VideoEncoder 错误：{0}",
    error_no_chunks: "未收到已编码的视频数据。",
    error_empty_output: "生成的视频文件为空。",
    // 1. Navigation & Header
    btn_open_folder: '指定 TeslaCam 文件夹',
    btn_open_folder_mobile: '指定片段文件夹',
    btn_open_files: '选择文件 (大容量/Recent)',
    unit_min: '分',
    col_name: '片段浏览器',
    col_type: '类型 / 通道',
    empty_state: '指定文件夹或选择视频文件后，片段列表将显示在此处。',
    btn_pc_mode: 'PC版',
    btn_mobile_mode: '移动端',
    btn_switch_mobile: '切换到移动端模式',
    btn_clip_list: '片段列表',
    btn_drawer_menu: '菜单 / 片段',
    btn_close: '关闭',
    drawer_clips: '片段',
    drawer_overlays: '覆盖层',
    drawer_export: '导出',
    tab_clips: '片段浏览',
    tab_overlays: '覆盖层',
    tab_export: '导出',
    tab_export_label: '设置·导出',
    btn_add_home: '快捷方式',
    drag_expand: '向上滑动展开',
    sheet_collapse: '折叠',
    add_home_title: '添加到主屏幕',
    pc_mode_title: '切换为PC版',
    close_drawer_title: '关闭 (向左滑动关闭)',

    // 2. Progress Banner & Scanning
    progress_scanning: '正在扫描文件夹...',
    progress_searching_clips: '正在探索文件夹...',
    progress_searching_videos: '正在搜索视频...',
    progress_found_videos: '发现 {0} 个视频 (文件夹 {1} 个)',
    progress_grouping_clips: '正在分类片段...',
    progress_grouping_status: '{0} / {1} 个文件 ({2}%) · {3} 个片段',

    // 3. Clip Tree & Badges
    folder_recent: '最近片段',
    folder_saved: '已保存片段',
    folder_sentry: '哨兵片段',
    tag_parking: '驻车',
    tag_driving: '行车',
    tag_channels: '路',
    empty_no_clips: '未找到有效的 TeslaCam 片段。',

    // 4. Group Titles
    group_overlays: '仪表覆盖层元素',
    group_export: '导出设置',
    group_adjust: '画面亮度与对比度校正',

    // 5. Overlays Checkboxes
    chk_timestamp: '实际时间戳 (Timestamp)',
    chk_steering: '方向盘转向角度',
    chk_speed: '实际时速 (km/h)',
    chk_pedal: '加速 / 制动踏板',
    chk_fsd: 'FSD / 自动辅助驾驶模式',
    chk_pillar_pip: 'B柱摄像头画中画 (PIP)',
    chk_turn_signal: '转向指示灯 (闪烁)',
    chk_map: 'GPS 实时小地图 (OSM)',
    chk_face_blur: '人脸马赛克 (测试)',
    toast_face_blur_loading: '正在加载人脸马赛克模型...',
    alert_face_blur_failed: '无法加载人脸马赛克功能。\n为保护隐私，将中止导出，而不是在没有马赛克的情况下保存。\n({0})',

    // 6. Export Options
    label_resolution: '输出分辨率:',
    label_layout: '画面布局:',
    label_speed: '保存倍速:',
    label_fps: '输出帧率:',
    label_lang: '语言 (Language) :',
    res_qhd: 'QHD (2560x1440) - 超高清',
    res_fhd: 'FHD (1920x1080) - 推荐标准',
    res_hd: 'HD (1280x720) - 节省空间',
    res_compact: 'Compact (960x540) - 移动端',
    layout_13: "前视为主",
    layout_2x2: "四分屏",
    layout_single: '单机位',
    layout_name_default: '默认 (1:3 纵向布局)',
    layout_name_2x2: '2x2 四分屏 (前后/左右)',
    layout_name_single: '单摄像头',
    speed_05: '0.5x (慢速)',
    speed_10: '1.0x (标准)',
    speed_15: '1.5x (快速)',
    speed_20: '2.0x (2倍速)',
    speed_40: '4.0x (4倍速)',
    fps_36: '36 FPS (原始最佳)',
    fps_36_speed: '36 FPS (倍速原始最佳)',
    fps_30: '30 FPS (标准)',
    fps_30_rec: '30 FPS (标准推荐)',
    fps_60: '60 FPS (高帧率)',
    fps_24: '24 FPS (电影风格)',
    fps_15: '15 FPS (节省空间)',
    fps_saving: '15 FPS (节省空间)',
    fps_orig_default: '{0} FPS (原始默认)',
    fps_orig_speed: '{0} FPS (倍速原始最佳)',
    fps_orig_optimal: '{0} FPS (原始最佳)',
    est_size_prefix: '预估体积: 约 ',
    http_warning: '在 HTTP 环境下由于浏览器安全策略限制，WebCodecs 导出可能会受限（建议使用 HTTPS）。',
    btn_export: '导出所选区间 (MP4)',
    btn_export_cancel: '取消导出',
    status_ready: '就绪...',
    status_preparing: '正在准备编码... (共 {0} 个片段区间)',
    status_encoding: '正在编码: {0}% [文件 {1}/{2}]',
    status_success: '视频渲染已成功完成！',
    status_error: '发生错误: ',
    status_cancelling: '正在取消...',

    // 7. Viewport & Transport
    drop_overlay_text: '将 TeslaCam 文件夹拖放至此处',
    sei_analyzing: '正在分析行车数据... {0}%',
    sei_analyzing_frames: '正在分析行车数据... {0}% ({1}/{2}f)',
    map_no_gps: '无 GPS 信号',
    slider_brightness_label: '画面亮度',
    slider_contrast_label: '画面对比度',
    cam_select_title: '选择摄像头',
    cam_front: '前视 (Front)',
    cam_back: '后视 (Rear)',
    cam_left_repeater: '左侧翼子板 (Left)',
    cam_right_repeater: '右侧翼子板 (Right)',
    cam_left_pillar: '左B柱',
    cam_right_pillar: '右B柱',
    range_unspecified: '选中区间: 未指定',
    range_unspecified_full: '选中区间: 未指定 (全长 {0}秒)',
    range_specified: '区间: {0} ~ {1} (共 {2}秒{3})',
    range_multi_files: '(连续 {0} 个文件)',
    range_need_out: '起点: {0} (需选择终点)',
    range_need_in: '终点: {0} (需选择起点)',
    btn_prev: '|◀ 上一个',
    btn_play: '▶ 播放',
    btn_pause: '暂停',
    btn_next: '下一个 ▶|',
    play_with_space: '▶ 播放 (Space)',
    pause_with_space: '暂停 (Space)',
    btn_in: '[ 起点',
    btn_out: '] 终点',
    btn_reset: '↺ 重置',
    chk_auto_next: '连续播放',
    lbl_speed: '倍速',
    lbl_bright: '亮度',
    lbl_contrast: '对比度',
    btn_hotkeys: '快捷键',

    // 8. Tooltips
    tip_set_in: '设置区间起点 (快捷键: I)',
    tip_set_out: '设置区间终点 (快捷键: O)',
    tip_reset_range: '重置选中区间',
    tip_prev_clip: '上一个片段 ([)',
    tip_play_main: '播放 / 暂停 (Space)',
    tip_next_clip: '下一个片段 (])',
    tip_restore_speed: '双击恢复 1.0x',
    tip_restore_bright: '双击恢复 0',
    tip_restore_contrast: '双击恢复 100%',
    tip_hotkey_guide: '快捷键说明 (F1)',

    // 9. Tier Tooltip & Modal
    tier_measuring: '正在测定...',
    tier_title: '设备性能评级 (Device Tier)',
    tier_section_reason: '当前设备评估与计算依据',
    tier_section_types: '评级类别及硬件标准',
    tier_high_desc: '8核+ / 6GB+ 内存 / WebGPU加速  4通道同步高清播放与高速导出',
    tier_mid_desc: '4~6核 / 4GB+ 内存  1:3 分屏播放及标准 HD 视频导出',
    tier_low_desc: '2核及以下 / 2GB及以下 内存  针对单机位轻量播放优化',
    tier_reason_high: '基于 CPU {concurrency} 核、{memory}GB 内存及 {accel}，针对 4 通道同步高清播放和硬件编码进行了优化。',
    tier_accel_webgpu: 'WebGPU 加速支持',
    tier_accel_multithread: "8核及以上多线程",
    tier_reason_low: '鉴于 CPU {concurrency} 核、{memory}GB 内存或缺少加速 API，建议使用单机位轻量模式以保证流畅播放。',
    tier_reason_mid: '基于 CPU {concurrency} 核、{memory}GB 内存，稳定支持标准 1:3 分屏播放及 HD 视频导出。',
    btn_pc_install_text: '安装应用',
    btn_pc_install_title: '在桌面安装应用 (创建桌面图标)',
    modal_confirm: '确定',

    // 10. Hotkey Modal
    hotkey_modal_title: '快捷键与鼠标操作指南',
    hk_space: '播放 / 暂停视频',
    hk_seek_1: '快退 / 快进 1秒',
    hk_seek_5: '快退 / 快进 5秒',
    hk_home: '跳转至片段开头 (0秒)',
    hk_clip_step: '切换至上一个 / 下一个片段',
    hk_in_out: '设置导出区间起点(I) / 终点(O)',
    hk_fullscreen: '双击摄像头切换全屏 / 还原',
    hk_telemetry_drag: '左右拖拽重新排列行车数据项',
    hk_telemetry_reset: '双击底栏恢复默认数据显示顺序',
    hk_slider_reset: '双击滑块恢复倍速/亮度/对比度默认值',
    hk_guide_pop: '弹出快捷键说明窗口',

    // 11. App Install Guide Modal
    install_guide_title: '添加到主屏幕',
    install_preview_sub: '如原生应用般全屏即时启动',
    install_title_desktop: '桌面端 PC (Windows / Edge / Chrome)',
    install_step_desktop_1: '点击地址栏右侧的“安装应用”(⊕ 或  )图标，或',
    install_step_desktop_2: "前往浏览器菜单(⋯ 或 ⋮)  “应用”  选择“安装 CT Dashcam Studio”。",
    install_step_desktop_3: "勾选“创建桌面快捷方式”即可在桌面直接生成图标！",
    install_title_android: '安卓设备 (Galaxy / Chrome / 三星浏览器)',
    install_step_android_1: '点击下方的 [ 立即添加快捷方式] 按钮，或',
    install_step_android_2: '点击浏览器菜单(⋮ 或 ≡)，',
    install_step_android_3: "选择“添加到主屏幕”。",
    install_btn_pwa: '立即添加快捷方式',
    install_title_ios: 'iPhone / iPad (Safari)',
    install_step_ios_1: '点击 Safari 底部中央的分享按钮 ()',
    install_step_ios_2: "向下滚动菜单并点击“添加到主屏幕 (+)”",
    install_step_ios_3: "点击右上角的“添加”即可在主屏幕创建图标！",
    install_btn_copy: '复制页面链接',
    install_copy_success: '链接复制成功！',

    // 12. Export Progress Modal
    export_modal_title: '正在导出视频',
    export_modal_file_tag: '文件 {0}/{1}',
    export_modal_fps_info: '正在编码: {0}% ({1} FPS, {2}x)',
    export_modal_fps_prep: '正在准备编码... ({0} FPS, {1}x)',
    export_modal_cancelling: '正在取消编码...',
    export_warn_title: '请保持屏幕常亮！',
    export_warn_body: '熄屏或切换至其他应用可能会因浏览器省电策略导致视频编码暂停或中断。',
    export_success_alert: '视频导出已完成！\n请查看设备的“下载”文件夹。',
    export_success_save_desc: "渲染完成！已开始下载。",

    // 13. Alert Dialogs
    alert_in_after_out: '起点不能晚于或等于终点。\n时间顺序无效。',
    alert_out_before_in: '终点不能早于或等于起点。\n时间顺序无效。',
    alert_max_duration: '所选区间为 {0} 分钟。\n单次最大导出长度为30分钟(1,800秒)。',
    alert_http_security: '根据浏览器安全策略，HTTP 环境不支持 WebCodecs 视频编码。\n请使用 HTTPS 访问或在本地(localhost)进行导出。',
    alert_no_range: '未选择任何待导出的视频区间。',
    alert_pc_install: '请在浏览器地址栏右侧(⊕)或菜单(⋯) > 应用 > 选择“安装 CT Dashcam Studio”。',
    alert_ios_silent_abort: '所选文件夹中的文件过多，iOS 已取消加载。请选择子文件夹或使用【选择文件】功能。',
    alert_ios_max_duration: "在 iOS 上，超过3分钟的视频可能无法稳定导出。建议选择较短的区间。",
    confirm_mobile_long_clip: '片段过长，可能无法正常导出。是否继续？',
    toast_load_timeout: '文件加载超过2分钟已自动取消。请检查外部存储设备连接或文件数量。',
    toast_encrypted_clips: '检测到特斯拉行车记录仪加密文件夹 (EncryptedClips)。加密视频只能在车机屏幕或 Tesla App 中播放。',
    pillar_cam_na: '4通道视频中没有B柱摄像头',
  },

  'zh-TW': {
    progress_ios_usb_note: "使用 USB 2.0 的 iPhone（尤其是非 Pro 機型）從外接儲存裝置準備檔案時可能需要較長時間。建議先將所需片段複製到 iPhone，再進行編輯。",
    progress_waiting_files: "正在等待檔案清單",
    progress_waiting_files_detail: "選取後，儲存裝置可能仍需一些時間準備檔案。",
    status_face_analysis: "正在分析馬賽克區域：{0}% [檔案 {1}/{2}]",
    error_face_analysis_frame: "無法準備人臉分析影格：{0}，{1}秒。已停止匯出，不會儲存未遮蔽的影片。({2})",
    tip_qr_keep: "希望您能保留 QR 碼，讓更多人認識並使用 CT Dashcam Studio。謝謝您的支持！",
    theme_graphite: "石墨",
    theme_midnight: "午夜藍",
    theme_forest: "森林綠",
    theme_burgundy: "勃根地紅",
    theme_amber: "琥珀",
    theme_paper: "紙白",
    chk_qr: "QR 碼 🥺",
    preview_empty_description: "開啟 TeslaCam 資料夾並選取片段，即可查看影片。",
    label_theme: "佈景主題",
    preview_empty_title: "選取片段以預覽",
    progress_files_received: "已接收檔案清單（{0}個），正在分類...",
    alert_open_folder_failed: "無法開啟資料夾：{0}",
    error_export_cancelled: "影片匯出已取消。",
    error_no_frames: "沒有已編碼的影片影格。",
    error_encoder: "VideoEncoder 錯誤：{0}",
    error_no_chunks: "未收到已編碼的影片資料。",
    error_empty_output: "產生的影片檔案是空的。",
    // 1. Navigation & Header
    btn_open_folder: '指定 TeslaCam 資料夾',
    btn_open_folder_mobile: '指定片段資料夾',
    btn_open_files: '選取檔案 (大容量/Recent)',
    unit_min: '分',
    col_name: '片段瀏覽器',
    col_type: '類型 / 通道',
    empty_state: '指定資料夾或選擇影片檔案後，片段清單將顯示於此處。',
    btn_pc_mode: 'PC版',
    btn_mobile_mode: '行動版',
    btn_switch_mobile: '切換到行動版模式',
    btn_clip_list: '片段清單',
    btn_drawer_menu: '選單 / 片段',
    btn_close: '關閉',
    drawer_clips: '片段',
    drawer_overlays: '覆蓋層',
    drawer_export: '匯出',
    tab_clips: '片段瀏覽',
    tab_overlays: '覆蓋層',
    tab_export: '匯出',
    tab_export_label: '設定·匯出',
    btn_add_home: '捷徑',
    drag_expand: '向上滑動展開',
    sheet_collapse: '折疊',
    add_home_title: '加入主畫面',
    pc_mode_title: '切換為PC版',
    close_drawer_title: '關閉 (向左滑動關閉)',

    // 2. Progress Banner & Scanning
    progress_scanning: '正在掃描資料夾...',
    progress_searching_clips: '正在探索資料夾...',
    progress_searching_videos: '正在搜尋影片...',
    progress_found_videos: '發現 {0} 個影片 (資料夾 {1} 個)',
    progress_grouping_clips: '正在分類片段...',
    progress_grouping_status: '{0} / {1} 個檔案 ({2}%) · {3} 個片段',

    // 3. Clip Tree & Badges
    folder_recent: '最近片段',
    folder_saved: '已儲存片段',
    folder_sentry: '哨兵片段',
    tag_parking: '駐車',
    tag_driving: '行車',
    tag_channels: '路',
    empty_no_clips: '未找到有效的 TeslaCam 片段。',

    // 4. Group Titles
    group_overlays: '儀表覆蓋層元素',
    group_export: '匯出設定',
    group_adjust: '畫面亮度與對比度校正',

    // 5. Overlays Checkboxes
    chk_timestamp: '實際時間戳 (Timestamp)',
    chk_steering: '方向盤轉向角度',
    chk_speed: '實際時速 (km/h)',
    chk_pedal: '加速 / 煞車踏板',
    chk_fsd: 'FSD / 自動輔助駕駛模式',
    chk_pillar_pip: 'B柱攝影機子母畫面 (PIP)',
    chk_turn_signal: '方向燈 (閃爍)',
    chk_map: 'GPS 即時小地圖 (OSM)',
    chk_face_blur: '人臉馬賽克 (測試)',
    toast_face_blur_loading: '正在載入人臉馬賽克模型...',
    alert_face_blur_failed: '無法載入人臉馬賽克功能。\n為保護隱私，將中止匯出，而不是在沒有馬賽克的情況下儲存。\n({0})',

    // 6. Export Options
    label_resolution: '輸出解析度:',
    label_layout: '畫面佈局:',
    label_speed: '保存倍速:',
    label_fps: '輸出幀率:',
    label_lang: '語言 (Language) :',
    res_qhd: 'QHD (2560x1440) - 超高畫質',
    res_fhd: 'FHD (1920x1080) - 推薦標準',
    res_hd: 'HD (1280x720) - 節省空間',
    res_compact: 'Compact (960x540) - 行動裝置',
    layout_13: "前方為主",
    layout_2x2: "四分割",
    layout_single: '單機位',
    layout_name_default: '預設 (1:3 縱向佈局)',
    layout_name_2x2: '2x2 四分割畫面 (前後/左右)',
    layout_name_single: '單攝影機',
    speed_05: '0.5x (慢速)',
    speed_10: '1.0x (標準)',
    speed_15: '1.5x (快速)',
    speed_20: '2.0x (2倍速)',
    speed_40: '4.0x (4倍速)',
    fps_36: '36 FPS (原始最佳)',
    fps_36_speed: '36 FPS (倍速原始最佳)',
    fps_30: '30 FPS (標準)',
    fps_30_rec: '30 FPS (標準推薦)',
    fps_60: '60 FPS (高流暢)',
    fps_24: '24 FPS (電影風格)',
    fps_15: '15 FPS (節省空間)',
    fps_saving: '15 FPS (節省空間)',
    fps_orig_default: '{0} FPS (原始預設)',
    fps_orig_speed: '{0} FPS (倍速原始最佳)',
    fps_orig_optimal: '{0} FPS (原始最佳)',
    est_size_prefix: '預估容量: 約 ',
    http_warning: '在 HTTP 環境下由於瀏覽器安全策略限制，WebCodecs 匯出可能會受限（建議使用 HTTPS）。',
    btn_export: '匯出所選區間 (MP4)',
    btn_export_cancel: '取消匯出',
    status_ready: '就緒...',
    status_preparing: '正在準備編碼... (共 {0} 個片段區間)',
    status_encoding: '正在編碼: {0}% [檔案 {1}/{2}]',
    status_success: '影片渲染已成功完成！',
    status_error: '發生錯誤: ',
    status_cancelling: '正在取消...',

    // 7. Viewport & Transport
    drop_overlay_text: '將 TeslaCam 資料夾拖放至此處',
    sei_analyzing: '正在分析行車數據... {0}%',
    sei_analyzing_frames: '正在分析行車數據... {0}% ({1}/{2}f)',
    map_no_gps: '無 GPS 信號',
    slider_brightness_label: '畫面亮度',
    slider_contrast_label: '畫面對比度',
    cam_select_title: '選擇攝影機',
    cam_front: '前視 (Front)',
    cam_back: '後視 (Rear)',
    cam_left_repeater: '左側葉子板 (Left)',
    cam_right_repeater: '右側葉子板 (Right)',
    cam_left_pillar: '左B柱',
    cam_right_pillar: '右B柱',
    range_unspecified: '選取區間: 未指定',
    range_unspecified_full: '選取區間: 未指定 (全長 {0}秒)',
    range_specified: '區間: {0} ~ {1} (共 {2}秒{3})',
    range_multi_files: '(連續 {0} 個檔案)',
    range_need_out: '起點: {0} (需選擇終點)',
    range_need_in: '終點: {0} (需選擇起點)',
    btn_prev: '|◀ 上一個',
    btn_play: '▶ 播放',
    btn_pause: '暫停',
    btn_next: '下一個 ▶|',
    play_with_space: '▶ 播放 (Space)',
    pause_with_space: '暫停 (Space)',
    btn_in: '[ 起點',
    btn_out: '] 終點',
    btn_reset: '↺ 重設',
    chk_auto_next: '連續播放',
    lbl_speed: '倍速',
    lbl_bright: '亮度',
    lbl_contrast: '對比度',
    btn_hotkeys: '快捷鍵',

    // 8. Tooltips
    tip_set_in: '設定區間起點 (快捷鍵: I)',
    tip_set_out: '設定區間終點 (快捷鍵: O)',
    tip_reset_range: '重設選取區間',
    tip_prev_clip: '上一個片段 ([)',
    tip_play_main: '播放 / 暫停 (Space)',
    tip_next_clip: '下一個片段 (])',
    tip_restore_speed: '按兩下恢復 1.0x',
    tip_restore_bright: '按兩下恢復 0',
    tip_restore_contrast: '按兩下恢復 100%',
    tip_hotkey_guide: '快捷鍵說明 (F1)',

    // 9. Tier Tooltip & Modal
    tier_measuring: '正在測定...',
    tier_title: '裝置性能評級 (Device Tier)',
    tier_section_reason: '當前裝置評估與計算依據',
    tier_section_types: '評級類別及硬體標準',
    tier_high_desc: '8核+ / 6GB+ 記憶體 / WebGPU加速  4通道同步高畫質播放與高速匯出',
    tier_mid_desc: '4~6核 / 4GB+ 記憶體  1:3 分割畫面播放及標準 HD 影片匯出',
    tier_low_desc: '2核及以下 / 2GB及以下 記憶體  針對單機位輕量播放優化',
    tier_reason_high: '基於 CPU {concurrency} 核心、{memory}GB 記憶體及 {accel}，針對 4 通道同步高畫質播放與硬體編碼進行了最佳化。',
    tier_accel_webgpu: 'WebGPU 加速支援',
    tier_accel_multithread: "8核心以上多執行緒",
    tier_reason_low: '鑑於 CPU {concurrency} 核心、{memory}GB 記憶體或缺少硬體加速 API，建議使用單機位輕量模式以確保流暢播放。',
    tier_reason_mid: '基於 CPU {concurrency} 核心、{memory}GB 記憶體，穩定支援標準 1:3 分割播放及 HD 影片匯出。',
    btn_pc_install_text: '安裝應用',
    btn_pc_install_title: '在桌面安裝應用 (建立桌面圖示)',
    modal_confirm: '確定',

    // 10. Hotkey Modal
    hotkey_modal_title: '快捷鍵與滑鼠操作指南',
    hk_space: '播放 / 暫停影片',
    hk_seek_1: '快退 / 快進 1秒',
    hk_seek_5: '快退 / 快進 5秒',
    hk_home: '跳轉至片段開頭 (0秒)',
    hk_clip_step: '切換至上一個 / 下一個片段',
    hk_in_out: '設定匯出區間起點(I) / 終點(O)',
    hk_fullscreen: '按兩下攝影機切換全螢幕 / 還原',
    hk_telemetry_drag: '左右拖曳重新排列行車數據項',
    hk_telemetry_reset: '按兩下底欄恢復預設數據顯示順序',
    hk_slider_reset: '按兩下滑桿恢復倍速/亮度/對比度預設值',
    hk_guide_pop: '彈出快捷鍵說明視窗',

    // 11. App Install Guide Modal
    install_guide_title: '加入主畫面',
    install_preview_sub: '如原生應用般全螢幕即時啟動',
    install_title_desktop: '桌面端 PC (Windows / Edge / Chrome)',
    install_step_desktop_1: '點擊網址列右側的「安裝應用」(⊕ 或  )圖示，或',
    install_step_desktop_2: "前往瀏覽器選單(⋯ 或 ⋮)  「應用程式」  選擇「安裝 CT Dashcam Studio」。",
    install_step_desktop_3: "勾選「建立桌面捷徑」即可在桌面直接生成圖示！",
    install_title_android: '安卓裝置 (Galaxy / Chrome / 三星瀏覽器)',
    install_step_android_1: '點擊下方的 [ 立即新增捷徑] 按鈕，或',
    install_step_android_2: '點擊瀏覽器選單(⋮ 或 ≡)，',
    install_step_android_3: "選擇「加入主畫面」。",
    install_btn_pwa: '立即新增捷徑',
    install_title_ios: 'iPhone / iPad (Safari)',
    install_step_ios_1: '點擊 Safari 底部中央的分享按鈕 ()',
    install_step_ios_2: "向下捲動選單並點擊「加入主畫面 (+)」",
    install_step_ios_3: "點擊右上角的「新增」即可在主畫面建立圖示！",
    install_btn_copy: '複製頁面連結',
    install_copy_success: '連結複製成功！',

    // 12. Export Progress Modal
    export_modal_title: '正在匯出影片',
    export_modal_file_tag: '檔案 {0}/{1}',
    export_modal_fps_info: '正在編碼: {0}% ({1} FPS, {2}x)',
    export_modal_fps_prep: '正在準備編碼... ({0} FPS, {1}x)',
    export_modal_cancelling: '正在取消編碼...',
    export_warn_title: '請保持螢幕常亮！',
    export_warn_body: '熄屏或切換至其他應用可能會因瀏覽器省電策略導致影片編碼暫停或中斷。',
    export_success_alert: '影片匯出已完成！\n請查看裝置的「下載」資料夾。',
    export_success_save_desc: "算繪完成！已開始下載。",

    // 13. Alert Dialogs
    alert_in_after_out: '起點不能晚於或等於終點。\n時間順序無效。',
    alert_out_before_in: '終點不能早於或等於起點。\n時間順序無效。',
    alert_max_duration: '所選區間為 {0} 分鐘。\n單次最大匯出長度為30分鐘(1,800秒)。',
    alert_http_security: '根據瀏覽器安全策略，HTTP 環境不支援 WebCodecs 影片編碼。\n請使用 HTTPS 連線或在本地(localhost)進行匯出。',
    alert_no_range: '未選取任何待匯出的影片區間。',
    alert_pc_install: '請在瀏覽器網址列右側(⊕)或選單(⋯) > 應用程式 > 選擇「安裝 CT Dashcam Studio」。',
    alert_ios_silent_abort: '所選資料夾中的檔案過多，iOS 已取消載入。請選擇子資料夾或使用【選取檔案】功能。',
    alert_ios_max_duration: "在 iOS 上，超過3分鐘的影片可能無法穩定匯出。建議選取較短的區間。",
    confirm_mobile_long_clip: '片段過長，可能無法正常匯出。是否繼續？',
    toast_load_timeout: '檔案載入超過2分鐘已自動取消。請檢查外部儲存裝置連線或檔案數量。',
    toast_encrypted_clips: '偵測到特斯拉行車記錄器加密資料夾 (EncryptedClips)。加密影片僅能在車機螢幕或 Tesla App 中播放。',
    pillar_cam_na: '4通道影片中沒有B柱攝影機',
  },
};

export const LOCALIZED_SEO: Record<SupportedLang, { title: string; desc: string; ogTitle: string; ogDesc: string }> = {
  de: {
    title: 'CT Dashcam Studio',
    desc: 'Kostenloses Webtool zum synchronen Abspielen und Bearbeiten von TeslaCam-Videos mit Fahrzeugdaten-Einblendungen.',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: 'Tesla-Dashcam-Videos im Browser ansehen und bearbeiten',
  },
  fr: {
    title: 'CT Dashcam Studio',
    desc: 'Outil web gratuit pour lire, synchroniser et modifier des vidéos TeslaCam avec incrustations de télémétrie.',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: 'Lecteur et éditeur de vidéos TeslaCam dans le navigateur',
  },
  es: {
    title: 'CT Dashcam Studio',
    desc: 'Herramienta web gratuita para reproducir, sincronizar y editar vídeos TeslaCam con superposiciones de telemetría.',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: 'Visor y editor de vídeos TeslaCam en el navegador',
  },
  ko: {
    title: 'CT Dashcam Studio',
    desc: '테슬라 블랙박스(TeslaCam) 영상을 재생하거나 편집할 수 있는 무료웹 도구입니다.',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: '웹기반 테슬라 블랙박스 뷰어/편집기',
  },
  en: {
    title: 'CT Dashcam Studio',
    desc: 'Free web tool to view, sync, and edit Tesla Dashcam (TeslaCam) videos with telemetry overlays.',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: 'Web-based Tesla Dashcam Viewer & Editor',
  },
  ja: {
    title: 'CT Dashcam Studio',
    desc: 'テスラのドライブレコーダー(TeslaCam)映像を同期再生・編集できる無料Webツールです。',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: 'Webベースのテスラ ドライブレコーダー ビューアー／エディター',
  },
  'zh-CN': {
    title: 'CT Dashcam Studio',
    desc: '免费网页版特斯拉行车记录仪(TeslaCam)多镜头同步播放与视频导出编辑工具。',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: '基于网页的特斯拉行车记录仪播放与编辑工具',
  },
  'zh-TW': {
    title: 'CT Dashcam Studio',
    desc: '免費網頁版特斯拉行車記錄器(TeslaCam)多鏡頭同步播放與影片匯出編輯工具。',
    ogTitle: 'CT Dashcam Studio',
    ogDesc: '基於網頁的特斯拉行車記錄器播放與編輯工具',
  },
};

export class I18nManager {
  private currentLang: SupportedLang = 'en';
  private listeners: Array<(lang: SupportedLang) => void> = [];

  constructor() {
    this.currentLang = this.detectInitialLang();
  }

  private detectInitialLang(): SupportedLang {
    // 1. URL Query Parameter (?lang=en, ?lang=ja, ?lang=zh-CN, etc.)
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang');
      if (urlLang) {
        const normalized = this.normalizeLang(urlLang);
        if (normalized) return normalized;
      }
    }

    // 2. Saved preference in localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('ct_language');
        const normalized = saved ? this.normalizeLang(saved) : null;
        if (normalized) return normalized;
      }
    } catch { /* Storage may be unavailable in private or restricted contexts. */ }

    // 3. Match supported languages in browser preference order on a first visit.
    if (typeof navigator !== 'undefined') {
      const preferred = [...(navigator.languages || []), navigator.language];
      for (const candidate of preferred) {
        const normalized = candidate ? this.normalizeLang(candidate) : null;
        if (normalized) return normalized;
      }
    }
    return 'en';
  }

  public normalizeLang(input: string): SupportedLang | null {
    const [base, ...subtags] = input.trim().toLowerCase().replace(/_/g, '-').split('-');
    if (base === 'zh') {
      if (subtags.includes('hant')) return 'zh-TW';
      if (subtags.includes('hans')) return 'zh-CN';
      return subtags.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
    }
    if (['ko', 'en', 'ja', 'de', 'fr', 'es'].includes(base)) return base as SupportedLang;
    return null;
  }

  public getLang(): SupportedLang {
    return this.currentLang;
  }

  public onChange(fn: (lang: SupportedLang) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public setLang(lang: SupportedLang): void {
    if (TRANSLATIONS[lang]) {
      this.currentLang = lang;
      try {
        localStorage.setItem('ct_language', lang);
      } catch { /* Switching still works when persistence is blocked. */ }
      this.applyDOM();
      this.listeners.forEach((fn) => fn(lang));
    }
  }

  public t(key: string, params?: (string | number)[] | Record<string, string | number>): string {
    let str = TRANSLATIONS[this.currentLang]?.[key] || TRANSLATIONS.en[key] || key;
    if (params) {
      if (Array.isArray(params)) {
        params.forEach((val, idx) => {
          str = str.replace(new RegExp(`\\{${idx}\\}`, 'g'), String(val));
        });
      } else {
        Object.entries(params).forEach(([k, val]) => {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
        });
      }
    }
    return str;
  }

  public applyDOM(): void {
    const lang = this.currentLang;
    // Use the same per-key English fallback for direct DOM translations as for t().
    const dict = { ...TRANSLATIONS.en };
    for (const [key, value] of Object.entries(TRANSLATIONS[lang] || {})) {
      if (value) dict[key] = value;
    }

    // Update document HTML lang attribute and SEO meta tags
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      const seo = LOCALIZED_SEO[lang] || LOCALIZED_SEO.en;
      document.title = seo.title;
      const descEl = document.querySelector('meta[name="description"]');
      if (descEl) descEl.setAttribute('content', seo.desc);
      const ogTitleEl = document.querySelector('meta[property="og:title"]');
      if (ogTitleEl) ogTitleEl.setAttribute('content', seo.ogTitle);
      const ogDescEl = document.querySelector('meta[property="og:description"]');
      if (ogDescEl) ogDescEl.setAttribute('content', seo.ogDesc);
    }

    // 1. Folder button & Explorer header
    const btnOpenFolder = document.getElementById('btn-open-folder-text') || document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
      const isMobileTarget = isIOSOrAndroid() || (typeof document !== 'undefined' && document.body?.classList.contains('view-mobile'));
      btnOpenFolder.textContent = isMobileTarget ? (dict.btn_open_folder_mobile || dict.btn_open_folder) : dict.btn_open_folder;
    }
    const btnOpenFiles = document.getElementById('btn-open-files-text') || document.getElementById('btn-open-files');
    if (btnOpenFiles) {
      btnOpenFiles.textContent = dict.btn_open_files;
    }

    const colName = document.querySelector('.explorer-header .col-name');
    if (colName) colName.textContent = dict.col_name;
    const colType = document.querySelector('.explorer-header .col-type');
    if (colType) colType.textContent = dict.col_type;

    const emptyState = document.querySelector('.empty-state');
    if (emptyState) emptyState.textContent = dict.empty_state;

    // 2. Navigation & Drawer buttons
    const btnToggleView = document.getElementById('btn-toggle-view-mode');
    if (btnToggleView) {
      btnToggleView.title = dict.pc_mode_title;
    }
    const btnFloatingView = document.getElementById('btn-floating-view-mode');
    if (btnFloatingView) {
      btnFloatingView.textContent = dict.btn_switch_mobile;
    }
    const btnLandscapeDrawer = document.getElementById('btn-landscape-drawer');
    if (btnLandscapeDrawer) {
      btnLandscapeDrawer.textContent = dict.btn_drawer_menu || dict.btn_clip_list;
    }
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    if (btnCloseDrawer) {
      btnCloseDrawer.textContent = dict.btn_close;
      btnCloseDrawer.title = dict.close_drawer_title;
    }

    const drawerTabClips = document.querySelector('.drawer-tab-btn[data-tab="clips"]');
    if (drawerTabClips) drawerTabClips.textContent = dict.drawer_clips;
    const drawerTabOverlays = document.querySelector('.drawer-tab-btn[data-tab="overlays"]');
    if (drawerTabOverlays) drawerTabOverlays.textContent = dict.drawer_overlays;
    const drawerTabExport = document.querySelector('.drawer-tab-btn[data-tab="export"]');
    if (drawerTabExport) drawerTabExport.textContent = dict.drawer_export;

    const dragHandle = document.querySelector('.explorer-drag-handle') as HTMLElement;
    if (dragHandle) dragHandle.title = dict.drag_expand;
    const sheetClose = document.getElementById('btn-close-explorer-sheet');
    if (sheetClose) sheetClose.title = dict.sheet_collapse;

    // 3. Group titles
    const overlayTitle = document.querySelector('.group-box:not(.mobile-adjust-box):not(.export-group) .group-title');
    if (overlayTitle) overlayTitle.textContent = dict.group_overlays;
    const adjustTitle = document.querySelector('.mobile-adjust-box .group-title');
    if (adjustTitle) adjustTitle.textContent = dict.group_adjust;
    const exportTitle = document.querySelector('.export-group .group-title');
    if (exportTitle) exportTitle.textContent = dict.group_export;

    // 4. Plain checkbox labels; retain the original input and its listeners.
    const chkDefs: Array<{ id: string; text: string }> = [
      { id: 'chk-timestamp', text: dict.chk_timestamp },
      { id: 'chk-steering', text: dict.chk_steering },
      { id: 'chk-speed', text: dict.chk_speed },
      { id: 'chk-pedal', text: dict.chk_pedal },
      { id: 'chk-fsd', text: dict.chk_fsd },
      { id: 'chk-pillar-pip', text: dict.chk_pillar_pip },
      { id: 'chk-turn-signal', text: dict.chk_turn_signal },
      { id: 'chk-map', text: dict.chk_map },
      { id: 'chk-qr', text: dict.chk_qr },
      { id: 'chk-face-blur', text: dict.chk_face_blur },
    ];

    chkDefs.forEach(({ id, text }) => {
      const input = document.getElementById(id);
      if (input) {
        const label = input.closest('.chk-item')?.querySelector('.chk-label');
        if (label) {
          const cleanText = text.replace(/^[^\p{L}\p{N}]+/u, '').trim();
          label.textContent = cleanText;
          if (id === 'chk-qr') {
            input.closest('.chk-item')?.setAttribute('title', dict.tip_qr_keep);
            input.setAttribute('aria-description', dict.tip_qr_keep);
            label.textContent = cleanText.replace(/\s*🥺$/u, '');
            const emotion = document.createElement('span');
            emotion.className = 'qr-emotion';
            emotion.textContent = '🥺';
            emotion.setAttribute('aria-hidden', 'true');
            label.appendChild(emotion);
          }
        }
      }
    });

    // 5. Adjust sub-labels
    const lblBrightSub = document.getElementById('lbl-brightness-sub-tag');
    if (lblBrightSub) lblBrightSub.textContent = dict.slider_brightness_label;
    const lblContrastSub = document.getElementById('lbl-contrast-sub-tag');
    if (lblContrastSub) lblContrastSub.textContent = dict.slider_contrast_label;

    // 6. Export form labels
    const formLabels = document.querySelectorAll<HTMLElement>('[data-i18n]');
    formLabels.forEach((label) => {
      const key = label.dataset.i18n;
      if (key) label.textContent = dict[key] || key;
    });

    // 7. Resolution select options
    const resSelect = document.getElementById('export-resolution') as HTMLSelectElement;
    if (resSelect) {
      const currentVal = resSelect.value;
      resSelect.innerHTML = `
        <option value="QHD (2560x1440) - 최고화질">${dict.res_qhd}</option>
        <option value="FHD (1920x1080) - 권장 표준">${dict.res_fhd}</option>
        <option value="HD (1280x720) - 용량 절감">${dict.res_hd}</option>
        <option value="Compact (960x540) - 모바일용">${dict.res_compact}</option>
      `;
      resSelect.value = currentVal;
    }

    // 8. Layout buttons
    const btnLayout13 = document.querySelector('.btn-layout[data-layout="기본 (1:3 세로배치)"]');
    if (btnLayout13) {
      btnLayout13.textContent = dict.layout_13;
      btnLayout13.setAttribute('title', dict.layout_name_default);
    }
    const btnLayout22 = document.querySelector('.btn-layout[data-layout="2x2 분할 (전후/좌우)"]');
    if (btnLayout22) {
      btnLayout22.textContent = dict.layout_2x2;
      btnLayout22.setAttribute('title', dict.layout_name_2x2);
    }
    const btnLayoutSingle = document.getElementById('btn-layout-single');
    if (btnLayoutSingle) btnLayoutSingle.textContent = dict.layout_single;

    // 9. Speed select options
    const speedSelect = document.getElementById('export-speed-select') as HTMLSelectElement;
    if (speedSelect) {
      const currentVal = speedSelect.value;
      speedSelect.innerHTML = `
        <option value="0.5">${dict.speed_05}</option>
        <option value="1.0">${dict.speed_10}</option>
        <option value="1.5">${dict.speed_15}</option>
        <option value="2.0">${dict.speed_20}</option>
        <option value="4.0">${dict.speed_40}</option>
      `;
      speedSelect.value = (currentVal && currentVal !== '1') ? currentVal : '1.0';
    }

    // 10. FPS select options
    const fpsSelect = document.getElementById('export-fps-select') as HTMLSelectElement;
    if (fpsSelect) {
      const currentVal = fpsSelect.value;
      fpsSelect.innerHTML = `
        <option value="36">${dict.fps_36}</option>
        <option value="30">${dict.fps_30}</option>
        <option value="24">${dict.fps_24}</option>
        <option value="15">${dict.fps_15}</option>
      `;
      fpsSelect.value = currentVal;
    }

    // 11. Language label and select dropdown value
    const langLabel = document.querySelector('.lang-label');
    if (langLabel) langLabel.textContent = dict.label_lang;

    const langSelect = document.getElementById('select-language') as HTMLSelectElement;
    if (langSelect) langSelect.setAttribute('aria-label', dict.label_lang.replace(/\s*[:：]\s*$/, ''));
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    // 12. Estimated size prefix
    const lblEstSize = document.getElementById('lbl-est-size');
    if (lblEstSize && lblEstSize.textContent) {
      const match = lblEstSize.textContent.match(/([0-9.]+\s*MB)/);
      const sizeVal = match ? match[1] : '0 MB';
      lblEstSize.textContent = `${dict.est_size_prefix}${sizeVal}`;
    }

    // 13. Warnings & Export button
    const webcodecsWarning = document.getElementById('webcodecs-warning');
    if (webcodecsWarning) webcodecsWarning.textContent = dict.http_warning;

    const btnExport = document.getElementById('btn-export');
    if (btnExport && !btnExport.classList.contains('cancelling')) {
      btnExport.textContent = dict.btn_export;
    }

    // 14. Mobile tabs
    const mobileClips = document.querySelectorAll('.mobile-tab-btn[data-tab="clips"]');
    mobileClips.forEach((btn) => {
      btn.innerHTML = `<span class="tab-label">${dict.tab_clips}</span>`;
    });
    const mobileOverlays = document.querySelectorAll('.mobile-tab-btn[data-tab="overlays"]');
    mobileOverlays.forEach((btn) => {
      btn.innerHTML = `<span class="tab-label">${dict.tab_overlays}</span>`;
    });
    const mobileExport = document.querySelectorAll('.mobile-tab-btn[data-tab="export"]');
    mobileExport.forEach((btn) => {
      btn.innerHTML = `<span class="tab-label">${dict.tab_export_label}</span>`;
    });

    // 15. Drop overlay
    const dropOverlayText = document.querySelector('#drop-overlay span');
    if (dropOverlayText) dropOverlayText.textContent = dict.drop_overlay_text;

    // 16. Bottom transport buttons & tooltips
    const btnPrev = document.getElementById('btn-prev-clip');
    if (btnPrev) {
      btnPrev.textContent = dict.btn_prev;
      btnPrev.title = dict.tip_prev_clip;
    }
    const btnNext = document.getElementById('btn-next-clip');
    if (btnNext) {
      btnNext.textContent = dict.btn_next;
      btnNext.title = dict.tip_next_clip;
    }
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      btnPlay.title = dict.tip_play_main;
    }

    const btnSetIn = document.getElementById('btn-set-in');
    if (btnSetIn) {
      btnSetIn.textContent = dict.btn_in;
      btnSetIn.title = dict.tip_set_in;
    }
    const btnSetOut = document.getElementById('btn-set-out');
    if (btnSetOut) {
      btnSetOut.textContent = dict.btn_out;
      btnSetOut.title = dict.tip_set_out;
    }
    const btnResetRange = document.getElementById('btn-reset-range');
    if (btnResetRange) {
      btnResetRange.textContent = dict.btn_reset;
      btnResetRange.title = dict.tip_reset_range;
    }

    const chkAutoNextText = document.getElementById('chk-auto-next-text');
    if (chkAutoNextText) {
      chkAutoNextText.textContent = dict.chk_auto_next;
    } else {
      const chkAutoNextLabel = document.querySelector('#chk-auto-next')?.parentElement;
      if (chkAutoNextLabel) {
        const isChecked = (document.getElementById('chk-auto-next') as HTMLInputElement)?.checked;
        chkAutoNextLabel.innerHTML = `<input type="checkbox" id="chk-auto-next" ${isChecked ? 'checked' : ''} /> <span id="chk-auto-next-text">${dict.chk_auto_next}</span>`;
      }
    }

    const lblSpeedTag = document.getElementById('lbl-speed-tag');
    if (lblSpeedTag) {
      lblSpeedTag.textContent = dict.lbl_speed;
      lblSpeedTag.title = dict.tip_restore_speed;
    }
    const lblBrightnessTag = document.getElementById('lbl-brightness-tag');
    if (lblBrightnessTag) {
      lblBrightnessTag.textContent = dict.lbl_bright;
      lblBrightnessTag.title = dict.tip_restore_bright;
    }
    const lblContrastTag = document.getElementById('lbl-contrast-tag');
    if (lblContrastTag) {
      lblContrastTag.textContent = dict.lbl_contrast;
      lblContrastTag.title = dict.tip_restore_contrast;
    }
    const btnHotkeyGuide = document.getElementById('btn-hotkey-guide');
    if (btnHotkeyGuide) {
      btnHotkeyGuide.textContent = dict.btn_hotkeys;
      btnHotkeyGuide.title = dict.tip_hotkey_guide;
    }

    // 17. Camera popup title & buttons
    const popupTitle = document.querySelector('.popup-title');
    if (popupTitle) popupTitle.textContent = dict.cam_select_title;
    const camButtons: Array<{ cam: string; text: string }> = [
      { cam: 'front', text: dict.cam_front },
      { cam: 'back', text: dict.cam_back },
      { cam: 'left_repeater', text: dict.cam_left_repeater },
      { cam: 'right_repeater', text: dict.cam_right_repeater },
      { cam: 'left_pillar', text: dict.cam_left_pillar },
      { cam: 'right_pillar', text: dict.cam_right_pillar },
    ];
    camButtons.forEach(({ cam, text }) => {
      const btn = document.querySelector(`.btn-cam-option[data-cam="${cam}"]`);
      if (btn && text) btn.textContent = text;
    });

    // 18. Add to home button
    const btnAddHome = document.getElementById('btn-add-to-home');
    if (btnAddHome && dict.btn_add_home) {
      btnAddHome.textContent = dict.btn_add_home;
      btnAddHome.title = dict.add_home_title;
    }

    // 19. PC Install button
    const btnPcInstall = document.getElementById('btn-pc-install');
    if (btnPcInstall) {
      btnPcInstall.textContent = dict.btn_pc_install_text;
      btnPcInstall.title = dict.btn_pc_install_title;
    }

    // 20. Tier tooltips & Modals
    const tooltipTitle = document.querySelector('.tooltip-title');
    if (tooltipTitle) tooltipTitle.textContent = dict.tier_title;
    const modalTierHeader = document.querySelector('#tier-modal .modal-header h3');
    if (modalTierHeader) modalTierHeader.textContent = dict.tier_title;


    const tierDescHigh = document.querySelectorAll('.tier-types-list li:nth-child(1) div');
    tierDescHigh.forEach((el) => {
      el.innerHTML = `<strong>High Tier:</strong> ${dict.tier_high_desc}`;
    });
    const tierDescMid = document.querySelectorAll('.tier-types-list li:nth-child(2) div');
    tierDescMid.forEach((el) => {
      el.innerHTML = `<strong>Medium Tier:</strong> ${dict.tier_mid_desc}`;
    });
    const tierDescLow = document.querySelectorAll('.tier-types-list li:nth-child(3) div');
    tierDescLow.forEach((el) => {
      el.innerHTML = `<strong>Low Tier:</strong> ${dict.tier_low_desc}`;
    });

    const btnConfirmTier = document.getElementById('btn-confirm-tier');
    if (btnConfirmTier) btnConfirmTier.textContent = dict.modal_confirm;

    // 21. Hotkey Modal
    const hotkeyHeader = document.querySelector('#hotkey-modal .modal-header h3');
    if (hotkeyHeader) hotkeyHeader.textContent = dict.hotkey_modal_title;

    const hkRows = document.querySelectorAll('#hotkey-modal .hotkey-table tr');
    if (hkRows.length >= 11) {
      hkRows[0].querySelector('td:last-child')!.textContent = dict.hk_space;
      hkRows[1].querySelector('td:last-child')!.textContent = dict.hk_seek_1;
      hkRows[2].querySelector('td:last-child')!.textContent = dict.hk_seek_5;
      hkRows[3].querySelector('td:last-child')!.textContent = dict.hk_home;
      hkRows[4].querySelector('td:last-child')!.textContent = dict.hk_clip_step;
      hkRows[5].querySelector('td:last-child')!.textContent = dict.hk_in_out;
      hkRows[6].querySelector('td:last-child')!.textContent = dict.hk_fullscreen;
      hkRows[7].querySelector('td:last-child')!.textContent = dict.hk_telemetry_drag;
      hkRows[8].querySelector('td:last-child')!.textContent = dict.hk_telemetry_reset;
      hkRows[9].querySelector('td:last-child')!.textContent = dict.hk_slider_reset;
      hkRows[10].querySelector('td:last-child')!.textContent = dict.hk_guide_pop;
    }
    const btnConfirmHotkey = document.getElementById('btn-confirm-hotkey');
    if (btnConfirmHotkey) btnConfirmHotkey.textContent = dict.modal_confirm;

    // 22. Install Guide Modal
    const installGuideHeader = document.querySelector('#modal-install-guide .modal-header h3');
    if (installGuideHeader) installGuideHeader.textContent = dict.install_guide_title;
    const installPreviewSub = document.querySelector('.install-app-sub');
    if (installPreviewSub) installPreviewSub.textContent = dict.install_preview_sub;

    const platformTitleDesktop = document.querySelector('#guide-desktop .platform-title');
    if (platformTitleDesktop) platformTitleDesktop.textContent = dict.install_title_desktop;
    const desktopSteps = document.querySelectorAll('#guide-desktop .guide-steps li');
    if (desktopSteps.length >= 3) {
      desktopSteps[0].textContent = dict.install_step_desktop_1;
      desktopSteps[1].textContent = dict.install_step_desktop_2;
      desktopSteps[2].textContent = dict.install_step_desktop_3;
    }

    const platformTitleAndroid = document.querySelector('#guide-android .platform-title');
    if (platformTitleAndroid) platformTitleAndroid.textContent = dict.install_title_android;
    const androidSteps = document.querySelectorAll('#guide-android .guide-steps li');
    if (androidSteps.length >= 3) {
      androidSteps[0].textContent = dict.install_step_android_1;
      androidSteps[1].textContent = dict.install_step_android_2;
      androidSteps[2].textContent = dict.install_step_android_3;
    }
    const btnTriggerPwa = document.getElementById('btn-trigger-pwa-install');
    if (btnTriggerPwa) btnTriggerPwa.textContent = dict.install_btn_pwa;

    const platformTitleIos = document.querySelector('#guide-ios .platform-title');
    if (platformTitleIos) platformTitleIos.textContent = dict.install_title_ios;
    const iosSteps = document.querySelectorAll('#guide-ios .guide-steps li');
    if (iosSteps.length >= 3) {
      iosSteps[0].textContent = dict.install_step_ios_1;
      iosSteps[1].textContent = dict.install_step_ios_2;
      iosSteps[2].textContent = dict.install_step_ios_3;
    }

    const btnCopyUrl = document.getElementById('btn-copy-page-url');
    if (btnCopyUrl) btnCopyUrl.textContent = dict.install_btn_copy;
    const btnConfirmInstall = document.getElementById('btn-confirm-install');
    if (btnConfirmInstall) btnConfirmInstall.textContent = dict.modal_confirm;

    // 23. Export Progress Modal
    const exportModalTitle = document.querySelector('.export-modal-title');
    if (exportModalTitle) exportModalTitle.textContent = dict.export_modal_title;
    const btnCancelExportModal = document.getElementById('btn-cancel-export-modal');
    if (btnCancelExportModal) btnCancelExportModal.textContent = dict.btn_export_cancel;

    const exportWarnTitle = document.querySelector('.warning-callout-content strong');
    if (exportWarnTitle) exportWarnTitle.textContent = dict.export_warn_title;
    const exportWarnBody = document.querySelector('.warning-callout-content p');
    if (exportWarnBody) exportWarnBody.textContent = dict.export_warn_body;
  }
}

export const i18n = new I18nManager();
