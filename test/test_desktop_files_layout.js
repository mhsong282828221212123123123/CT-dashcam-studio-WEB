import puppeteer from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DIR = 'E:\\tesla\\project\\testfile\\SavedClips\\2026-08-17_12-48-22';
const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.mp4')).map(f => path.join(TEST_DIR, f));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: 'new',
    args: ['--window-size=1600,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  const inputEl = await page.waitForSelector('#fallback-file-input');
  await inputEl.uploadFile(...files);
  await inputEl.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForSelector('.clip-node', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));

  const layoutReport = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar-panel');
    const clipsSec = document.querySelector('.sidebar-section[data-mobile-tab="clips"]');
    const tree = document.getElementById('clips-tree');
    const overlaysSec = document.querySelector('.sidebar-section[data-mobile-tab="overlays"]');
    const exportSec = document.querySelector('.sidebar-section[data-mobile-tab="export"]');
    const adBox = document.querySelector('.ad-box-group');

    const sbR = sidebar.getBoundingClientRect();
    const clR = clipsSec.getBoundingClientRect();
    const trR = tree.getBoundingClientRect();
    const ovR = overlaysSec.getBoundingClientRect();
    const exR = exportSec.getBoundingClientRect();
    const adR = adBox.getBoundingClientRect();

    return {
      windowHeight: window.innerHeight,
      sidebar: {
        top: sbR.top,
        bottom: sbR.bottom,
        height: sbR.height,
        scrollHeight: sidebar.scrollHeight,
        clientHeight: sidebar.clientHeight
      },
      clipsSection: {
        top: clR.top,
        bottom: clR.bottom,
        height: clR.height
      },
      tree: {
        top: trR.top,
        bottom: trR.bottom,
        height: trR.height,
        scrollHeight: tree.scrollHeight,
        clientHeight: tree.clientHeight
      },
      overlaysSection: {
        top: ovR.top,
        bottom: ovR.bottom,
        height: ovR.height,
        isVisibleInWindow: ovR.bottom <= window.innerHeight
      },
      exportSection: {
        top: exR.top,
        bottom: exR.bottom,
        height: exR.height,
        isVisibleInWindow: exR.bottom <= window.innerHeight
      },
      adBox: {
        top: adR.top,
        bottom: adR.bottom,
        height: adR.height,
        text: adBox.innerText.trim()
      }
    };
  });

  console.log('Layout Report:', JSON.stringify(layoutReport, null, 2));

  await page.screenshot({ path: 'E:\\tesla\\project\\CT-dashcam-studio-web\\docs\\pc_many_files_test.png' });
  console.log('Saved screenshot to docs/pc_many_files_test.png');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
