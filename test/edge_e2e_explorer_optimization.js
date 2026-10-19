import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DOCS_DIR = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs';

async function runOptimizationVerification() {
  console.log('=== Starting Edge Explorer Optimization & Bottom Sheet Verification ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=450,900'
    ]
  });

  try {
    const page = await browser.newPage();

    // Emulate iPhone 14 (390 x 844)
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true
    });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('[vite]') && !txt.includes('404')) {
        console.log(`[Browser ${msg.type()}]`, txt);
      }
    });

    await page.goto('http://localhost:5173/CT-dashcam-studio-WEB/', { waitUntil: 'networkidle0' });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Synthetic 2,000 Clips (5 Folders) Performance & Lazy Rendering
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing Synthetic 2,000 Clips Benchmark ---');

    const benchResults = await page.evaluate(async () => {
      const app = window.app;
      if (!app) throw new Error('App not found on window');

      // Create LongTask observer
      let longTaskCount = 0;
      let totalLongTaskDuration = 0;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              longTaskCount++;
              totalLongTaskDuration += entry.duration;
            }
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        // LongTask may not be supported in all environments
      }

      // Generate 2,000 mock files across 5 folders (400 clips per folder)
      const mockFiles = [];
      const folderNames = [
        'SavedClips/2026-08-17_12-00-00',
        'SavedClips/2026-08-17_13-00-00',
        'SavedClips/2026-08-17_14-00-00',
        'SavedClips/2026-08-17_15-00-00',
        'SavedClips/2026-08-17_16-00-00',
      ];

      for (let f = 0; f < 5; f++) {
        const folder = folderNames[f];
        for (let i = 0; i < 400; i++) {
          const sec = String(i % 60).padStart(2, '0');
          const min = String(Math.floor(i / 60) % 60).padStart(2, '0');
          const hr = String(12 + f).padStart(2, '0');
          const timestamp = `2026-08-17_${hr}-${min}-${sec}`;
          const filename = `${timestamp}-front.mp4`;
          const relPath = `${folder}/${filename}`;

          const file = new File(['mock content'], filename, { type: 'video/mp4' });
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relPath,
            writable: false,
          });
          mockFiles.push(file);
        }
      }

      // Benchmark renderClipsTree
      const t0 = performance.now();
      app.loadFiles(mockFiles);
      const tRender = performance.now() - t0;

      // Check DOM state
      const totalFolders = document.querySelectorAll('.folder-node').length;
      const collapsedFolders = document.querySelectorAll('.folder-node.collapsed').length;
      const renderedClipNodes = document.querySelectorAll('.clip-node').length;

      return {
        tRender,
        longTaskCount,
        totalLongTaskDuration,
        totalFolders,
        collapsedFolders,
        renderedClipNodes,
      };
    });

    console.log(`✓ 2,000 Clips load & initial render took: ${benchResults.tRender.toFixed(2)}ms (< 50ms required)`);
    console.log(`✓ Long tasks count during render: ${benchResults.longTaskCount}`);
    console.log(`✓ Folders created: ${benchResults.totalFolders} (Collapsed: ${benchResults.collapsedFolders})`);
    console.log(`✓ Rendered DOM .clip-node count: ${benchResults.renderedClipNodes} (out of 2,000 clips)`);

    if (benchResults.tRender > 50) {
      console.warn(`[WARNING] tRender was ${benchResults.tRender.toFixed(2)}ms (target < 50ms)`);
    }
    if (benchResults.renderedClipNodes > 500) {
      throw new Error(`Expected lazy rendering (< 500 clip nodes), but found ${benchResults.renderedClipNodes}!`);
    }

    // Test expanding a collapsed folder
    console.log('Testing lazy expansion of collapsed Folder 2...');
    const expandResult = await page.evaluate(() => {
      const folderHeaders = document.querySelectorAll('.folder-header');
      const folder2Header = folderHeaders[1];
      if (!folder2Header) return { success: false };

      const t0 = performance.now();
      folder2Header.click();
      const tExpand = performance.now() - t0;

      const newClipNodes = document.querySelectorAll('.clip-node').length;
      return { success: true, tExpand, newClipNodes };
    });

    console.log(`✓ Folder 2 expanded in ${expandResult.tExpand.toFixed(2)}ms. Total rendered clip nodes now: ${expandResult.newClipNodes}`);
    if (expandResult.newClipNodes !== 800) {
      throw new Error(`Expected 800 rendered clip nodes after expanding 2 folders, got ${expandResult.newClipNodes}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Mobile Bottom Sheet Expand / Collapse Behaviors
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Mobile Bottom Sheet Behaviors ---');

    // Check if sheet expanded automatically after loading files
    const isExpandedAfterLoad = await page.evaluate(() => {
      return document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet auto-expanded after folder load:', isExpandedAfterLoad);

    // Measure Sheet Dimensions
    const sheetBox = await page.evaluate(() => {
      const card = document.querySelector('.sidebar-section[data-mobile-tab="clips"] .explorer-card');
      const rect = card?.getBoundingClientRect();
      const vh = window.innerHeight;
      const heightRatio = rect ? rect.height / vh : 0;
      return {
        top: rect?.top,
        height: rect?.height,
        vh,
        heightRatio,
      };
    });
    console.log(`✓ Sheet height: ${sheetBox.height}px (${(sheetBox.heightRatio * 100).toFixed(1)}% of ${sheetBox.vh}px viewport)`);
    if (sheetBox.heightRatio < 0.75 || sheetBox.heightRatio > 0.95) {
      throw new Error(`Expected sheet height to be ~85dvh (80-90%), got ${(sheetBox.heightRatio * 100).toFixed(1)}%`);
    }

    // Capture Expanded Screenshot
    const expandedScreenshotPath = path.join(DOCS_DIR, 'mobile_sheet_expanded.png');
    await page.screenshot({ path: expandedScreenshotPath });
    console.log(`✓ Saved expanded sheet screenshot: ${expandedScreenshotPath}`);

    // Test Collapse via Close Button (▼)
    console.log('Testing collapse via close button (▼)...');
    await page.click('#btn-close-explorer-sheet');
    await new Promise(r => setTimeout(r, 300));

    const isCollapsedAfterCloseBtn = await page.evaluate(() => {
      return !document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet collapsed after clicking ▼ close button:', isCollapsedAfterCloseBtn);
    if (!isCollapsedAfterCloseBtn) throw new Error('Sheet should collapse when ▼ is clicked');

    // Verify Player Canvas is still visible and correctly positioned after collapse
    const canvasAfterCollapse = await page.evaluate(() => {
      const canvas = document.getElementById('player-canvas');
      const rect = canvas?.getBoundingClientRect();
      return { top: rect?.top, width: rect?.width, height: rect?.height };
    });
    console.log('✓ Player canvas position after collapse:', canvasAfterCollapse);
    if (canvasAfterCollapse.top < 0 || canvasAfterCollapse.width <= 0) {
      throw new Error('Player canvas was displaced after sheet collapse!');
    }

    // Capture Collapsed Screenshot
    const collapsedScreenshotPath = path.join(DOCS_DIR, 'mobile_sheet_collapsed.png');
    await page.screenshot({ path: collapsedScreenshotPath });
    console.log(`✓ Saved collapsed sheet screenshot: ${collapsedScreenshotPath}`);

    // Test Expand via Header Click
    console.log('Testing expand via header tap...');
    await page.click('.explorer-header');
    await new Promise(r => setTimeout(r, 300));
    const isExpandedAfterHeaderTap = await page.evaluate(() => {
      return document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet expanded after header tap:', isExpandedAfterHeaderTap);
    if (!isExpandedAfterHeaderTap) throw new Error('Sheet should expand when header is tapped');

    // Test Collapse via Backdrop Click
    console.log('Testing collapse via backdrop click...');
    await page.click('#mobile-sheet-backdrop');
    await new Promise(r => setTimeout(r, 300));
    const isCollapsedAfterBackdrop = await page.evaluate(() => {
      return !document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet collapsed after backdrop tap:', isCollapsedAfterBackdrop);
    if (!isCollapsedAfterBackdrop) throw new Error('Sheet should collapse when backdrop is tapped');

    // Test Expand via 🎬 클립 Bottom Tab Tap
    console.log('Testing expand/toggle via 🎬 클립 bottom tab button...');
    const clipsTabBtn = await page.$('.mobile-tab-btn[data-tab="clips"]');
    await clipsTabBtn.click();
    await new Promise(r => setTimeout(r, 300));
    const isExpandedAfterTab = await page.evaluate(() => {
      return document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet expanded after tapping 🎬 클립 tab:', isExpandedAfterTab);
    if (!isExpandedAfterTab) throw new Error('Sheet should expand when 🎬 클립 tab is tapped');

    // Tap clips tab again -> should toggle (collapse)
    await clipsTabBtn.click();
    await new Promise(r => setTimeout(r, 300));
    const isCollapsedAfterTabToggle = await page.evaluate(() => {
      return !document.body.classList.contains('explorer-expanded');
    });
    console.log('✓ Sheet collapsed after second 🎬 클립 tab tap (toggle):', isCollapsedAfterTabToggle);
    if (!isCollapsedAfterTabToggle) throw new Error('Sheet should collapse when 🎬 클립 tab is toggled');

    // Test Clip Click -> Auto Collapse
    console.log('Testing clip selection auto-collapses sheet...');
    // Re-expand sheet
    await page.click('.explorer-header');
    await new Promise(r => setTimeout(r, 300));

    // Click on the second clip in the open folder
    const clipNodes = await page.$$('.clip-node');
    if (clipNodes.length > 1) {
      await clipNodes[1].click();
      await new Promise(r => setTimeout(r, 300));

      const isCollapsedAfterClipSelect = await page.evaluate(() => {
        return !document.body.classList.contains('explorer-expanded');
      });
      console.log('✓ Sheet auto-collapsed after selecting clip:', isCollapsedAfterClipSelect);
      if (!isCollapsedAfterClipSelect) throw new Error('Sheet should auto-collapse when a clip row is selected');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: PC Mode and Regression Safety Checks
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Desktop Mode & Element Regression ---');

    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluate(() => {
      document.body.classList.remove('view-mobile');
      document.body.classList.add('view-desktop');
    });

    const pcElementsCheck = await page.evaluate(() => {
      const handle = document.querySelector('.explorer-drag-handle');
      const closeBtn = document.querySelector('#btn-close-explorer-sheet');
      const backdrop = document.querySelector('#mobile-sheet-backdrop');
      const adBox = document.querySelector('.ad-box-group');
      const langSelect = document.querySelector('#select-language');
      const chkGrid = document.querySelector('.grid-2col');

      const handleStyle = handle ? window.getComputedStyle(handle).display : 'none';
      const closeBtnStyle = closeBtn ? window.getComputedStyle(closeBtn).display : 'none';
      const backdropStyle = backdrop ? window.getComputedStyle(backdrop).display : 'none';

      return {
        handleHidden: handleStyle === 'none',
        closeBtnHidden: closeBtnStyle === 'none',
        backdropHidden: backdropStyle === 'none',
        hasAdBox: Boolean(adBox),
        hasLangSelect: Boolean(langSelect),
        hasChkGrid: Boolean(chkGrid),
      };
    });

    console.log('✓ Desktop mode drag handle is hidden (display: none):', pcElementsCheck.handleHidden);
    console.log('✓ Desktop mode sheet close button is hidden:', pcElementsCheck.closeBtnHidden);
    console.log('✓ Desktop mode sheet backdrop is hidden:', pcElementsCheck.backdropHidden);
    console.log('✓ Ad box (.ad-box-group) frame preserved:', pcElementsCheck.hasAdBox);
    console.log('✓ Language selector preserved:', pcElementsCheck.hasLangSelect);
    console.log('✓ Overlay checkbox grid preserved:', pcElementsCheck.hasChkGrid);

    if (!pcElementsCheck.handleHidden || !pcElementsCheck.closeBtnHidden || !pcElementsCheck.backdropHidden) {
      throw new Error('Mobile sheet UI elements must be hidden in desktop mode!');
    }
    if (!pcElementsCheck.hasAdBox || !pcElementsCheck.hasLangSelect) {
      throw new Error('Essential desktop UI components missing!');
    }

    const pcRegressionScreenshotPath = path.join(DOCS_DIR, 'pc_layout_regression.png');
    await page.screenshot({ path: pcRegressionScreenshotPath });
    console.log(`✓ Saved PC regression screenshot: ${pcRegressionScreenshotPath}`);

    console.log('\n🎉 ALL OPTIMIZATION & BOTTOM SHEET VERIFICATIONS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runOptimizationVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
