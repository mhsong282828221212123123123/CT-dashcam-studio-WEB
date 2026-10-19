const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const REAL_MP4_PATH = 'E:/tesla/project/testfile/SavedClips/2026-08-17_12-48-22/2026-08-17_12-37-37-front.mp4';

async function runLoadProgressTest() {
  console.log('=== Starting Edge Multi-File Load & SEI Progress E2E Test ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,800',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('[vite]') && !txt.includes('404')) {
        console.log(`[Browser ${msg.type()}]`, txt);
      }
    });

    await page.goto('http://localhost:5173/CT-dashcam-studio-WEB/?perf=1', { waitUntil: 'networkidle0' });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Multi-file (5 folders, 300 files) load progress UI verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing Multi-Folder (300 files) Progress UI ---');

    const progressResult = await page.evaluate(async () => {
      const app = window.app;
      if (!app) throw new Error('App not found on window');

      // Generate 300 mock video items across 5 folders (60 files per folder, 10 clips x 6 cams)
      const mockItems = [];
      const camKeys = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'];
      const folders = [
        'SavedClips/2026-08-17_10-00-00',
        'SavedClips/2026-08-17_11-00-00',
        'SavedClips/2026-08-17_12-00-00',
        'SavedClips/2026-08-17_13-00-00',
        'SavedClips/2026-08-17_14-00-00',
      ];

      for (const folder of folders) {
        for (let c = 0; c < 10; c++) {
          const minute = String(c).padStart(2, '0');
          const time = `2026-08-17_12-${minute}-00`;
          for (const cam of camKeys) {
            const fileName = `${time}-${cam}.mp4`;
            mockItems.push({
              name: fileName,
              relativePath: `${folder}/${fileName}`,
              // Lazy entry with mock handle
              handle: {
                name: fileName,
                kind: 'file',
                getFile: async () => new File([new Uint8Array(100)], fileName, { type: 'video/mp4' }),
              },
            });
          }
        }
      }

      const progressStates = [];
      const banner = document.getElementById('load-progress-banner');
      const titleEl = document.getElementById('load-progress-title');
      const countEl = document.getElementById('load-progress-count');
      const fillEl = document.getElementById('load-progress-fill');

      // Track banner state before load
      const initialDisplay = banner ? banner.style.display : null;

      // Wrap showLoadProgress to record progress snapshots
      const origShowLoadProgress = app.showLoadProgress.bind(app);
      app.showLoadProgress = (title, countText, pct, indeterminate) => {
        origShowLoadProgress(title, countText, pct, indeterminate);
        progressStates.push({
          title: titleEl?.textContent,
          countText: countEl?.textContent,
          fillWidth: fillEl?.style.width,
          isDisplayed: banner?.style.display !== 'none',
          pct,
        });
      };

      const startTime = performance.now();
      await app.loadFiles(mockItems);
      const endTime = performance.now();

      const finalDisplay = banner ? banner.style.display : null;
      const folderGroupsCount = app.folderGroups.length;
      const totalClipsCount = app.clipMap.size;

      return {
        initialDisplay,
        finalDisplay,
        progressStatesCount: progressStates.length,
        progressStates,
        durationMs: endTime - startTime,
        folderGroupsCount,
        totalClipsCount,
      };
    });

    console.log(`Loaded 300 files across 5 folders in ${progressResult.durationMs.toFixed(1)}ms`);
    console.log(`Folder groups: ${progressResult.folderGroupsCount}, Total clips: ${progressResult.totalClipsCount}`);
    console.log(`Progress states captured: ${progressResult.progressStatesCount}`);

    if (progressResult.progressStatesCount > 0) {
      const firstState = progressResult.progressStates[0];
      const lastState = progressResult.progressStates[progressResult.progressStates.length - 1];
      console.log(`First progress: "${firstState.countText}" (${firstState.fillWidth})`);
      console.log(`Last progress: "${lastState.countText}" (${lastState.fillWidth})`);
    }

    if (progressResult.folderGroupsCount !== 5) {
      throw new Error(`Expected 5 folder groups, got ${progressResult.folderGroupsCount}`);
    }
    if (progressResult.totalClipsCount !== 50) {
      throw new Error(`Expected 50 clips, got ${progressResult.totalClipsCount}`);
    }
    if (progressResult.finalDisplay !== 'none') {
      throw new Error(`Expected progress banner to be hidden after completion, got ${progressResult.finalDisplay}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: SEI Progress & Non-Blocking Video Playback
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing SEI Progress Badge & Non-Blocking Video Playback ---');

    // Read real MP4 file into buffer and create File in browser
    const realMp4Bytes = fs.readFileSync(REAL_MP4_PATH);
    const mp4Base64 = realMp4Bytes.toString('base64');

    const seiTestResult = await page.evaluate(async (b64Data) => {
      const app = window.app;

      // Decode base64 to File
      const binaryStr = atob(b64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const realFile = new File([bytes], '2026-08-17_12-37-37-front.mp4', { type: 'video/mp4' });

      // Create a clip item with this real front file
      const testClip = {
        id: 'TestFolder/2026-08-17_12-37-37',
        safeId: 'TestFolder_2026-08-17_12-37-37',
        folder: 'TestFolder',
        timestampStr: '2026-08-17 12:37:37',
        timestampRaw: '2026-08-17_12-37-37',
        cams: { front: realFile },
        durationSec: 60.0,
        totalFrames: 2160,
      };

      app.clipMap.set(testClip.id, testClip);

      const seiBadge = document.getElementById('sei-progress-badge');
      const seiTextEl = document.getElementById('sei-progress-text');
      const seiStates = [];

      const origShowSei = app.showSeiProgress.bind(app);
      app.showSeiProgress = (pct, parsedFrames, totalFrames) => {
        origShowSei(pct, parsedFrames, totalFrames);
        seiStates.push({
          pct,
          text: seiTextEl?.textContent,
          display: seiBadge?.style.display,
        });
      };

      // Select clip
      const selectStart = performance.now();
      await app.selectClip(testClip);
      const selectEnd = performance.now();

      // Check if video is loaded and ready
      const masterVideo = app.videoPool.front;
      const isVideoReady = Boolean(masterVideo && masterVideo.src);
      const duration = app.durationSec;

      // Wait a short moment for SEI background worker to complete
      let retries = 50;
      while (retries-- > 0 && !app.clipDecoders.has(testClip.id)) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const decoder = app.clipDecoders.get(testClip.id);
      const hasSei = Boolean(decoder && decoder.hasSeiData);
      const maxSpeed = decoder ? decoder.maxSpeedKmh : 0;
      const sample0 = decoder ? decoder.getFrameTelemetry(0) : null;
      const sample1000 = decoder ? decoder.getFrameTelemetry(1000) : null;
      const badgeAfterComplete = seiBadge?.style.display;

      return {
        selectTimeMs: selectEnd - selectStart,
        isVideoReady,
        duration,
        seiStatesCount: seiStates.length,
        seiStates,
        hasSei,
        maxSpeed,
        sample0,
        sample1000,
        badgeAfterComplete,
      };
    }, mp4Base64);

    console.log(`Clip select time: ${seiTestResult.selectTimeMs.toFixed(1)}ms`);
    console.log(`Video ready: ${seiTestResult.isVideoReady}, duration: ${seiTestResult.duration}s`);
    console.log(`SEI progress updates: ${seiTestResult.seiStatesCount}`);
    console.log(`SEI parsed: ${seiTestResult.hasSei}, maxSpeed: ${seiTestResult.maxSpeed} km/h`);
    console.log(`Frame 0 speed: ${seiTestResult.sample0?.speed_kmh} km/h, Frame 1000 speed: ${seiTestResult.sample1000?.speed_kmh} km/h`);

    if (!seiTestResult.isVideoReady) {
      throw new Error('Video was not ready after selectClip');
    }
    if (!seiTestResult.hasSei) {
      throw new Error('SEI telemetry was not extracted');
    }
    if (seiTestResult.maxSpeed <= 0) {
      throw new Error(`Invalid maxSpeed: ${seiTestResult.maxSpeed}`);
    }
    if (seiTestResult.badgeAfterComplete !== 'none') {
      throw new Error(`Expected sei badge to be hidden after completion, got ${seiTestResult.badgeAfterComplete}`);
    }

    console.log('\n=== All Load Progress & Non-Blocking SEI Tests PASSED Successfully! ===');
  } finally {
    await browser.close();
  }
}

runLoadProgressTest().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
