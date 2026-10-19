export type SupportedLang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW';

export const TRANSLATIONS: Record<SupportedLang, Record<string, string>> = {
  ko: {
    btn_open_folder: '📁 TeslaCam 폴더 지정',
    btn_open_files: '📹 영상 파일(들) 직접 선택 (모바일 권장)',
    col_name: '클립 탐색기',
    col_type: '유형 / 채널',
    empty_state: '폴더를 지정하거나 영상 파일을 선택하면 클립 목록이 여기에 표시됩니다.',
    group_overlays: '오버레이 요소',
    group_export: '내보내기 설정',
    group_adjust: '화면 밝기 및 대비 보정',
    chk_timestamp: '실제 시간 (Timestamp)',
    chk_steering: '스티어링 핸들 각도',
    chk_speed: '실제 속도 (km/h)',
    chk_pedal: '가속 / 브레이크 페달',
    chk_fsd: 'FSD / 자율주행 모드',
    chk_pillar_pip: '필러 카메라 (PIP)',
    chk_turn_signal: '방향지시등 (점멸 깜빡이)',
    chk_map: 'GPS 미니맵 (OSM)',
    label_resolution: '출력 해상도:',
    label_layout: '화면 레이아웃:',
    label_speed: '저장 배속:',
    label_fps: '출력 FPS:',
    label_lang: '언어 (language) :',
    btn_export: '선택 구간 내보내기 (MP4)',
    est_size_prefix: '예상 크기: 약 ',
    unspecified_range: '선택 구간: 미지정',
    tab_clips: '클립 탐색',
    tab_overlays: '오버레이',
    tab_export: '내보내기',
    btn_prev: '|◀ 이전',
    btn_play: '▶ 재생',
    btn_pause: '⏸ 일시정지',
    btn_next: '다음 ▶|',
    chk_auto_next: '연속 재생',
    lbl_speed: '⚡ 배속',
    lbl_bright: '☀ 밝기',
    lbl_contrast: '◐ 대비',
    btn_hotkeys: '⌨ 단축키',
    btn_in: '[ 시작점',
    btn_out: '] 끝점',
    btn_reset: '↺ 초기화',
    cam_select_title: '카메라 선택',
    cam_front: '전방 (Front)',
    cam_back: '후방 (Rear)',
    cam_left_repeater: '좌측 펜더 (Left)',
    cam_right_repeater: '우측 펜더 (Right)',
    cam_left_pillar: '좌측 B필러',
    cam_right_pillar: '우측 B필러',
  },
  en: {
    btn_open_folder: '📁 Open TeslaCam Folder',
    btn_open_files: '📹 Select Video File(s) (Mobile)',
    col_name: 'Clip Explorer',
    col_type: 'Type / Channels',
    empty_state: 'Select a TeslaCam folder to load clips here.',
    group_overlays: 'Overlay Elements',
    group_export: 'Export Settings',
    group_adjust: 'Brightness & Contrast',
    chk_timestamp: 'Timestamp',
    chk_steering: 'Steering Angle',
    chk_speed: 'Actual Speed (km/h)',
    chk_pedal: 'Accel / Brake Pedals',
    chk_fsd: 'FSD / Autopilot Mode',
    chk_pillar_pip: 'Pillar Camera (PIP)',
    chk_turn_signal: 'Turn Signals',
    chk_map: 'GPS Minimap (OSM)',
    label_resolution: 'Resolution:',
    label_layout: 'Layout:',
    label_speed: 'Speed:',
    label_fps: 'Output FPS:',
    label_lang: 'Language :',
    btn_export: 'Export Selected Range (MP4)',
    est_size_prefix: 'Est. Size: ~',
    unspecified_range: 'Range: Not set',
    tab_clips: 'Clips',
    tab_overlays: 'Overlays',
    tab_export: 'Export',
    btn_prev: '|◀ Prev',
    btn_play: '▶ Play',
    btn_pause: '⏸ Pause',
    btn_next: 'Next ▶|',
    chk_auto_next: 'Continuous Play',
    lbl_speed: '⚡ Speed',
    lbl_bright: '☀ Bright',
    lbl_contrast: '◐ Contrast',
    btn_hotkeys: '⌨ Shortcuts',
    btn_in: '[ In Point',
    btn_out: '] Out Point',
    btn_reset: '↺ Reset',
    cam_select_title: 'Select Camera',
    cam_front: 'Front',
    cam_back: 'Rear',
    cam_left_repeater: 'Left Repeater',
    cam_right_repeater: 'Right Repeater',
    cam_left_pillar: 'Left B-Pillar',
    cam_right_pillar: 'Right B-Pillar',
  },
  ja: {
    btn_open_folder: '📁 TeslaCamフォルダー指定',
    btn_open_files: '📹 動画ファイルを直接選択 (モバイル推奨)',
    col_name: 'クリップエクスプローラー',
    col_type: 'タイプ / チャンネル',
    empty_state: 'フォルダーを指定するとクリップ一覧がここに表示されます。',
    group_overlays: 'オーバーレイ要素',
    group_export: 'エクスポート設定',
    group_adjust: '明るさ・コントラスト補正',
    chk_timestamp: '実時間 (Timestamp)',
    chk_steering: 'ハンドル操舵角',
    chk_speed: '走行速度 (km/h)',
    chk_pedal: 'アクセル / ブレーキ',
    chk_fsd: 'FSD / 自動運転モード',
    chk_pillar_pip: 'ピラーカメラ (PIP)',
    chk_turn_signal: '方向指示器 (ウインカー)',
    chk_map: 'GPSミニマップ (OSM)',
    label_resolution: '出力解像度:',
    label_layout: '画面レイアウト:',
    label_speed: '保存倍速:',
    label_fps: '出力FPS:',
    label_lang: '言語 (Language) :',
    btn_export: '選択範囲を出力 (MP4)',
    est_size_prefix: '予想サイズ: 約 ',
    unspecified_range: '選択区間: 未指定',
    tab_clips: 'クリップ',
    tab_overlays: 'オーバーレイ',
    tab_export: 'エクスポート',
    btn_prev: '|◀ 前へ',
    btn_play: '▶ 再生',
    btn_pause: '⏸ 一時停止',
    btn_next: '次へ ▶|',
    chk_auto_next: '連続再生',
    lbl_speed: '⚡ 倍速',
    lbl_bright: '☀ 明るさ',
    lbl_contrast: '◐ コントラスト',
    btn_hotkeys: '⌨ ショートカット',
    btn_in: '[ 開始点',
    btn_out: '] 終了点',
    btn_reset: '↺ リセット',
    cam_select_title: 'カメラ選択',
    cam_front: '前方 (Front)',
    cam_back: '後方 (Rear)',
    cam_left_repeater: '左フェンダー (Left)',
    cam_right_repeater: '右フェンダー (Right)',
    cam_left_pillar: '左Bピラー',
    cam_right_pillar: '右Bピラー',
  },
  'zh-CN': {
    btn_open_folder: '📁 指定TeslaCam文件夹',
    btn_open_files: '📹 直接选择视频文件 (手机推荐)',
    col_name: '片段浏览器',
    col_type: '类型 / 通道',
    empty_state: '指定文件夹或选择视频文件后，片段列表将在此显示。',
    group_overlays: '叠加元素',
    group_export: '导出设置',
    group_adjust: '画面亮度与对比度',
    chk_timestamp: '实际时间 (Timestamp)',
    chk_steering: '方向盘转向角度',
    chk_speed: '实际车速 (km/h)',
    chk_pedal: '加速 / 制动踏板',
    chk_fsd: 'FSD / 自动辅助驾驶',
    chk_pillar_pip: 'B柱摄像头 (PIP)',
    chk_turn_signal: '转向灯 (闪烁)',
    chk_map: 'GPS小地图 (OSM)',
    label_resolution: '输出分辨率:',
    label_layout: '画面布局:',
    label_speed: '保存倍速:',
    label_fps: '输出FPS:',
    label_lang: '语言 (Language) :',
    btn_export: '导出选中片段 (MP4)',
    est_size_prefix: '预计大小: 约 ',
    unspecified_range: '选定区间: 未指定',
    tab_clips: '片段',
    tab_overlays: '叠加元素',
    tab_export: '导出',
    btn_prev: '|◀ 上一个',
    btn_play: '▶ 播放',
    btn_pause: '⏸ 暂停',
    btn_next: '下一个 ▶|',
    chk_auto_next: '连续播放',
    lbl_speed: '⚡ 倍速',
    lbl_bright: '☀ 亮度',
    lbl_contrast: '◐ 对比度',
    btn_hotkeys: '⌨ 快捷键',
    btn_in: '[ 起点',
    btn_out: '] 终点',
    btn_reset: '↺ 重置',
    cam_select_title: '选择摄像头',
    cam_front: '前视 (Front)',
    cam_back: '后视 (Rear)',
    cam_left_repeater: '左侧翼子板 (Left)',
    cam_right_repeater: '右侧翼子板 (Right)',
    cam_left_pillar: '左B柱',
    cam_right_pillar: '右B柱',
  },
  'zh-TW': {
    btn_open_folder: '📁 指定TeslaCam資料夾',
    btn_open_files: '📹 直接選取影片檔案 (手機推薦)',
    col_name: '片段瀏覽器',
    col_type: '類型 / 頻道',
    empty_state: '指定資料夾或選取影片檔案後，片段清單將在此顯示。',
    group_overlays: '疊加元素',
    group_export: '匯出設定',
    group_adjust: '畫面亮度與對比度',
    chk_timestamp: '實際時間 (Timestamp)',
    chk_steering: '方向盤轉向角度',
    chk_speed: '實際車速 (km/h)',
    chk_pedal: '加速 / 煞車踏板',
    chk_fsd: 'FSD / 自動輔助駕駛',
    chk_pillar_pip: 'B柱攝影機 (PIP)',
    chk_turn_signal: '方向燈 (閃爍)',
    chk_map: 'GPS小地圖 (OSM)',
    label_resolution: '輸出解析度:',
    label_layout: '畫面佈局:',
    label_speed: '儲存倍速:',
    label_fps: '輸出FPS:',
    label_lang: '語言 (Language) :',
    btn_export: '匯出選取片段 (MP4)',
    est_size_prefix: '預計大小: 約 ',
    unspecified_range: '選定區間: 未指定',
    tab_clips: '片段',
    tab_overlays: '疊加元素',
    tab_export: '匯出',
    btn_prev: '|◀ 上一個',
    btn_play: '▶ 播放',
    btn_pause: '⏸ 暫停',
    btn_next: '下一個 ▶|',
    chk_auto_next: '連續播放',
    lbl_speed: '⚡ 倍速',
    lbl_bright: '☀ 亮度',
    lbl_contrast: '◐ 對比度',
    btn_hotkeys: '⌨ 快捷鍵',
    btn_in: '[ 起點',
    btn_out: '] 終點',
    btn_reset: '↺ 重設',
    cam_select_title: '選擇攝影機',
    cam_front: '前視 (Front)',
    cam_back: '後視 (Rear)',
    cam_left_repeater: '左側葉子板 (Left)',
    cam_right_repeater: '右側葉子板 (Right)',
    cam_left_pillar: '左B柱',
    cam_right_pillar: '右B柱',
  },
};

export class I18nManager {
  private currentLang: SupportedLang = 'ko';

  constructor() {
    const saved = localStorage.getItem('ct_language') as SupportedLang;
    if (saved && TRANSLATIONS[saved]) {
      this.currentLang = saved;
    }
  }

  public getLang(): SupportedLang {
    return this.currentLang;
  }

  public setLang(lang: SupportedLang): void {
    if (TRANSLATIONS[lang]) {
      this.currentLang = lang;
      localStorage.setItem('ct_language', lang);
      this.applyDOM();
    }
  }

  public t(key: string): string {
    return TRANSLATIONS[this.currentLang]?.[key] || TRANSLATIONS['ko']?.[key] || key;
  }

  public applyDOM(): void {
    const lang = this.currentLang;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS['ko'];

    // 1. Folder & File buttons
    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) btnOpenFolder.textContent = dict.btn_open_folder;
    const btnOpenFiles = document.getElementById('btn-open-files');
    if (btnOpenFiles) btnOpenFiles.textContent = dict.btn_open_files;

    // 2. Explorer header
    const colName = document.querySelector('.explorer-header .col-name');
    if (colName) colName.textContent = dict.col_name;
    const colType = document.querySelector('.explorer-header .col-type');
    if (colType) colType.textContent = dict.col_type;

    const emptyState = document.querySelector('.empty-state');
    if (emptyState) emptyState.textContent = dict.empty_state;

    // 3. Group titles
    const overlayTitle = document.querySelector('.group-box:not(.mobile-adjust-box):not(.export-group) .group-title');
    if (overlayTitle) overlayTitle.textContent = dict.group_overlays;
    const adjustTitle = document.querySelector('.mobile-adjust-box .group-title');
    if (adjustTitle) adjustTitle.textContent = dict.group_adjust;
    const exportTitle = document.querySelector('.export-group .group-title');
    if (exportTitle) exportTitle.textContent = dict.group_export;

    // 4. Checkbox labels with icons preserved
    const chkDefs: Array<{ id: string; icon: string; text: string }> = [
      { id: 'chk-timestamp', icon: '⏱️', text: dict.chk_timestamp },
      { id: 'chk-steering', icon: '🔄', text: dict.chk_steering },
      { id: 'chk-speed', icon: '⚡', text: dict.chk_speed },
      { id: 'chk-pedal', icon: '🦶', text: dict.chk_pedal },
      { id: 'chk-fsd', icon: '🤖', text: dict.chk_fsd },
      { id: 'chk-pillar-pip', icon: '🪟', text: dict.chk_pillar_pip },
      { id: 'chk-turn-signal', icon: '💡', text: dict.chk_turn_signal },
      { id: 'chk-map', icon: '🗺️', text: dict.chk_map },
    ];

    chkDefs.forEach(({ id, icon, text }) => {
      const input = document.getElementById(id);
      if (input) {
        const label = input.closest('.chk-item')?.querySelector('.chk-label');
        if (label) {
          const cleanText = text.replace(/^[^\w가-힣一-龥ぁ-んァ-ヶa-zA-Z]+/u, '').trim();
          label.innerHTML = `<span class="chk-icon">${icon}</span> ${cleanText}`;
        }
      }
    });

    // 5. Export form labels
    const formLabels = document.querySelectorAll('.form-label');
    formLabels.forEach((label) => {
      const txt = label.textContent || '';
      if (txt.includes('해상도') || txt.includes('Resolution') || txt.includes('解像度') || txt.includes('分辨率') || txt.includes('解析度')) {
        label.textContent = dict.label_resolution;
      } else if (txt.includes('레이아웃') || txt.includes('Layout') || txt.includes('布局') || txt.includes('佈局')) {
        label.textContent = dict.label_layout;
      } else if (txt.includes('배속') || txt.includes('Speed') || txt.includes('速度')) {
        label.textContent = dict.label_speed;
      } else if (txt.includes('FPS')) {
        label.textContent = dict.label_fps;
      }
    });

    // 6. Language label and select dropdown value
    const langLabel = document.querySelector('.lang-label');
    if (langLabel) langLabel.textContent = dict.label_lang;

    const langSelect = document.getElementById('select-language') as HTMLSelectElement;
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    // 7. Estimated size prefix
    const lblEstSize = document.getElementById('lbl-est-size');
    if (lblEstSize && lblEstSize.textContent) {
      const match = lblEstSize.textContent.match(/([0-9.]+\s*MB)/);
      const sizeVal = match ? match[1] : '0 MB';
      lblEstSize.textContent = `${dict.est_size_prefix}${sizeVal}`;
    }

    // 8. Export button
    const btnExport = document.getElementById('btn-export');
    if (btnExport && !btnExport.classList.contains('cancelling')) {
      btnExport.textContent = dict.btn_export;
    }

    // 9. Mobile tabs
    const mobileClips = document.querySelectorAll('.mobile-tab-btn[data-tab="clips"]');
    mobileClips.forEach((btn) => {
      btn.innerHTML = `<span class="mobile-tab-icon">🎬</span> ${dict.tab_clips || '클립 탐색'}`;
    });
    const mobileOverlays = document.querySelectorAll('.mobile-tab-btn[data-tab="overlays"]');
    mobileOverlays.forEach((btn) => {
      btn.innerHTML = `<span class="mobile-tab-icon">⚙️</span> ${dict.tab_overlays || '오버레이'}`;
    });
    const mobileExport = document.querySelectorAll('.mobile-tab-btn[data-tab="export"]');
    mobileExport.forEach((btn) => {
      btn.innerHTML = `<span class="mobile-tab-icon">💾</span> ${dict.tab_export || '내보내기'}`;
    });

    // 10. Bottom transport buttons
    const btnPrev = document.getElementById('btn-prev-clip');
    if (btnPrev) btnPrev.textContent = dict.btn_prev;
    const btnNext = document.getElementById('btn-next-clip');
    if (btnNext) btnNext.textContent = dict.btn_next;

    const btnSetIn = document.getElementById('btn-set-in');
    if (btnSetIn) btnSetIn.textContent = dict.btn_in;
    const btnSetOut = document.getElementById('btn-set-out');
    if (btnSetOut) btnSetOut.textContent = dict.btn_out;
    const btnResetRange = document.getElementById('btn-reset-range');
    if (btnResetRange) btnResetRange.textContent = dict.btn_reset;

    const lblSpeedTag = document.getElementById('lbl-speed-tag');
    if (lblSpeedTag) lblSpeedTag.textContent = dict.lbl_speed;
    const lblBrightnessTag = document.getElementById('lbl-brightness-tag');
    if (lblBrightnessTag) lblBrightnessTag.textContent = dict.lbl_bright;
    const lblContrastTag = document.getElementById('lbl-contrast-tag');
    if (lblContrastTag) lblContrastTag.textContent = dict.lbl_contrast;
    const btnHotkeyGuide = document.getElementById('btn-hotkey-guide');
    if (btnHotkeyGuide) btnHotkeyGuide.textContent = dict.btn_hotkeys;

    // 11. Camera popup title
    const popupTitle = document.querySelector('.popup-title');
    if (popupTitle) popupTitle.textContent = dict.cam_select_title;
  }
}

export const i18n = new I18nManager();
