import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const DOCS_DIR = 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs';

async function runOverflowTest() {
  console.log('=== Starting Edge Overflow & Layout Boundary E2E Test ===');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => path.join(TEST_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1600,1000'
    ]
  });

  try {
    const page = await browser.newPage();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Mobile Portrait Viewport Tests (390x844, 360x740, 375x667)
    // ─────────────────────────────────────────────────────────────────────────
    const mobileViewports = [
      { name: 'iPhone 14 (390x844)', width: 390, height: 844, dsf: 3 },
      { name: 'Android Galaxy (360x740)', width: 360, height: 740, dsf: 2 },
      { name: 'iPhone SE (375x667)', width: 375, height: 667, dsf: 2 },
    ];

    for (const vp of mobileViewports) {
      console.log(`\nTesting mobile viewport: ${vp.name}...`);
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dsf,
        isMobile: true,
        hasTouch: true
      });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

      await page.goto('http://localhost:5173/CT-dashcam-studio-WEB/', { waitUntil: 'networkidle0' });

      // Check overflow BEFORE loading files
      const preOverflow = await page.evaluate(() => {
        const clientW = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        const deck = document.querySelector('.timeline-deck');
        const deckRect = deck ? deck.getBoundingClientRect() : null;

        // Check if any child of deck exceeds deck's right boundary
        let deckChildOverflow = false;
        let overflowingElements = [];
        if (deck && deckRect) {
          const children = deck.querySelectorAll('*');
          for (const el of children) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > deckRect.right + 1.5) {
              deckChildOverflow = true;
              overflowingElements.push({
                tag: el.tagName,
                cls: el.className,
                id: el.id,
                right: r.right,
                deckRight: deckRect.right
              });
            }
          }
        }

        // Check #chk-auto-next label display in speed-cluster
        const autoNextLabel = document.querySelector('.speed-cluster .chk-item');
        const autoNextStyle = autoNextLabel ? window.getComputedStyle(autoNextLabel).display : 'none';

        return {
          clientW,
          scrollW,
          hasBodyHScroll: scrollW > clientW + 1,
          deckChildOverflow,
          overflowingElements,
          autoNextDisplay: autoNextStyle,
        };
      });

      console.log(`[${vp.name} Pre-load] scrollW: ${preOverflow.scrollW}, clientW: ${preOverflow.clientW}`);
      console.log(`[${vp.name} Pre-load] auto-next checkbox display: ${preOverflow.autoNextDisplay} (should be none)`);
      console.log(`[${vp.name} Pre-load] deck child overflow: ${preOverflow.deckChildOverflow}`);

      if (preOverflow.hasBodyHScroll) {
        throw new Error(`Horizontal scrollbar detected on ${vp.name} before load!`);
      }
      if (preOverflow.deckChildOverflow) {
        console.error('Overflowing elements in deck:', preOverflow.overflowingElements);
        throw new Error(`Elements overflowing timeline-deck on ${vp.name} before load!`);
      }
      if (preOverflow.autoNextDisplay !== 'none') {
        throw new Error(`Auto next checkbox should be display:none in mobile speed-cluster!`);
      }

      // Now load files
      const inputEl = await page.$('#fallback-file-input');
      await inputEl.uploadFile(...files);
      await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
      await page.waitForSelector('.clip-node', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 600));

      // Collapse sheet so we can inspect the controls in normal view
      await page.click('#btn-close-explorer-sheet');
      await new Promise(r => setTimeout(r, 400));

      // Check overflow AFTER loading files
      const postOverflow = await page.evaluate(() => {
        const clientW = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        const deck = document.querySelector('.timeline-deck');
        const deckRect = deck ? deck.getBoundingClientRect() : null;

        let deckChildOverflow = false;
        let overflowingElements = [];
        if (deck && deckRect) {
          const children = deck.querySelectorAll('*');
          for (const el of children) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > deckRect.right + 1.5) {
              deckChildOverflow = true;
              overflowingElements.push({
                tag: el.tagName,
                cls: el.className,
                id: el.id,
                right: r.right,
                deckRight: deckRect.right
              });
            }
          }
        }

        // Verify [ 시작점, ] 끝점, ↺ 초기화 are fully visible inside deck
        const btnIn = document.getElementById('btn-set-in');
        const btnOut = document.getElementById('btn-set-out');
        const btnReset = document.getElementById('btn-reset-range');
        const inRect = btnIn?.getBoundingClientRect();
        const outRect = btnOut?.getBoundingClientRect();
        const resetRect = btnReset?.getBoundingClientRect();

        const buttonsInside = inRect && outRect && resetRect && deckRect &&
          inRect.left >= deckRect.left - 1 && inRect.right <= deckRect.right + 1 &&
          outRect.left >= deckRect.left - 1 && outRect.right <= deckRect.right + 1 &&
          resetRect.left >= deckRect.left - 1 && resetRect.right <= deckRect.right + 1;

        return {
          clientW,
          scrollW,
          hasBodyHScroll: scrollW > clientW + 1,
          deckChildOverflow,
          overflowingElements,
          buttonsInside,
        };
      });

      console.log(`[${vp.name} Post-load] scrollW: ${postOverflow.scrollW}, clientW: ${postOverflow.clientW}`);
      console.log(`[${vp.name} Post-load] in/out buttons inside deck: ${postOverflow.buttonsInside}`);
      if (postOverflow.hasBodyHScroll) {
        throw new Error(`Horizontal scrollbar detected on ${vp.name} after load!`);
      }
      if (postOverflow.deckChildOverflow) {
        console.error('Overflowing elements in deck:', postOverflow.overflowingElements);
        throw new Error(`Elements overflowing timeline-deck on ${vp.name} after load!`);
      }
      if (!postOverflow.buttonsInside) {
        throw new Error(`Range buttons [시작점, ]끝점, ↺초기화 should be fully inside timeline-deck!`);
      }

      // Save screenshot for each viewport
      const shotName = vp.width === 390 ? 'mobile_overflow_fix_390.png' : (vp.width === 360 ? 'mobile_overflow_fix_360.png' : 'mobile_overflow_fix_375.png');
      const shotPath = path.join(DOCS_DIR, shotName);
      await page.screenshot({ path: shotPath });
      console.log(`✓ Saved screenshot: ${shotPath}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PC Desktop Viewport Tests (1400x900, 1280x720)
    // ─────────────────────────────────────────────────────────────────────────
    const pcViewports = [
      { name: 'PC Standard (1400x900)', width: 1400, height: 900 },
      { name: 'PC Compact (1280x720)', width: 1280, height: 720 },
    ];

    for (const vp of pcViewports) {
      console.log(`\nTesting PC desktop viewport: ${vp.name}...`);
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');

      await page.goto('http://localhost:5173/CT-dashcam-studio-WEB/', { waitUntil: 'networkidle0' });

      // Force PC desktop view mode
      await page.evaluate(() => {
        document.body.classList.remove('view-mobile');
        document.body.classList.add('view-desktop');
      });

      // Load files
      const inputEl = await page.$('#fallback-file-input');
      await inputEl.uploadFile(...files);
      await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
      await page.waitForSelector('.clip-node', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 600));

      const pcCheck = await page.evaluate(() => {
        const sidebar = document.getElementById('sidebar-panel');
        const sidebarRect = sidebar.getBoundingClientRect();

        // 1. Check all elements inside sidebar stay within sidebar bounds
        let overflowingElements = [];
        const allChildren = sidebar.querySelectorAll('*');
        for (const el of allChildren) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > sidebarRect.right + 1.5) {
            overflowingElements.push({
              tag: el.tagName,
              cls: el.className,
              id: el.id,
              right: r.right,
              sidebarRight: sidebarRect.right
            });
          }
        }

        // 2. Check layout buttons (1:3, 2x2, 단일) are all inside sidebar
        const layoutBtns = Array.from(document.querySelectorAll('.layout-btn-group .btn-layout'));
        const btnsInside = layoutBtns.every(b => {
          const r = b.getBoundingClientRect();
          return r.right <= sidebarRect.right + 1.5;
        });

        // 3. Check export FPS select is completely inside sidebar
        const fpsSelect = document.getElementById('export-fps-select');
        const fpsRect = fpsSelect ? fpsSelect.getBoundingClientRect() : null;
        const fpsInside = fpsRect ? fpsRect.right <= sidebarRect.right + 1.5 : false;

        // 4. Check export resolution select is completely inside sidebar
        const resSelect = document.getElementById('export-resolution');
        const resRect = resSelect ? resSelect.getBoundingClientRect() : null;
        const resInside = resRect ? resRect.right <= sidebarRect.right + 1.5 : false;

        return {
          sidebarRight: sidebarRect.right,
          overflowCount: overflowingElements.length,
          overflowingElements,
          btnsInside,
          fpsInside,
          resInside,
        };
      });

      console.log(`[${vp.name}] Sidebar right: ${pcCheck.sidebarRight}`);
      console.log(`[${vp.name}] Layout buttons (1:3, 2x2, 단일) inside sidebar: ${pcCheck.btnsInside}`);
      console.log(`[${vp.name}] Output FPS select inside sidebar: ${pcCheck.fpsInside}`);
      console.log(`[${vp.name}] Output Resolution select inside sidebar: ${pcCheck.resInside}`);
      console.log(`[${vp.name}] Overflow count: ${pcCheck.overflowCount}`);

      if (!pcCheck.btnsInside) {
        throw new Error(`Layout button group (단일 button) is clipped or overflowing sidebar on ${vp.name}!`);
      }
      if (!pcCheck.fpsInside) {
        throw new Error(`Output FPS select is clipped or overflowing sidebar on ${vp.name}!`);
      }
      if (!pcCheck.resInside) {
        throw new Error(`Output Resolution select is clipped or overflowing sidebar on ${vp.name}!`);
      }
      if (pcCheck.overflowCount > 0) {
        console.error('Overflowing elements in sidebar:', pcCheck.overflowingElements);
        throw new Error(`Elements overflowing sidebar on ${vp.name}!`);
      }

      const shotName = vp.width === 1400 ? 'pc_overflow_fix_1400.png' : 'pc_overflow_fix_1280.png';
      const shotPath = path.join(DOCS_DIR, shotName);
      await page.screenshot({ path: shotPath });
      console.log(`✓ Saved screenshot: ${shotPath}`);
    }

    console.log('\n🎉 ALL OVERFLOW & BOUNDARY TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runOverflowTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
