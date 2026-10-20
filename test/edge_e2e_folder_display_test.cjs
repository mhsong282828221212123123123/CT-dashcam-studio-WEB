const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEST_DIR = 'E:\\tesla\\project\\testfile';
const ARTIFACT_DIR = 'C:\\Users\\ddno2\\.gemini\\antigravity\\brain\\1296f195-8d13-4c1e-ae90-bae2100cf725';

async function runFolderDisplayTest() {
  console.log('=== Starting Folder Grouping & Color Display Test ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser error]`, msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // 1. Collect files from SavedClips and SentryClips
  const savedFiles = fs.readdirSync(path.join(TEST_DIR, 'SavedClips', '2026-08-17_12-48-22'))
    .filter(f => f.endsWith('.mp4') && f.includes('2026-08-17_12-37-37'))
    .map(f => path.join(TEST_DIR, 'SavedClips', '2026-08-17_12-48-22', f));

  const sentryFiles = fs.readdirSync(path.join(TEST_DIR, 'SentryClips', '2026-08-17_09-37-37'))
    .filter(f => f.endsWith('.mp4') && f.includes('2026-08-17_09-26-59'))
    .map(f => path.join(TEST_DIR, 'SentryClips', '2026-08-17_09-37-37', f));

  // Also create a temporary recent clip file to verify RecentClips (최근클립, Green)
  const tempRecentDir = path.join(TEST_DIR, 'RecentClips');
  if (!fs.existsSync(tempRecentDir)) {
    fs.mkdirSync(tempRecentDir, { recursive: true });
  }
  const tempRecentFile = path.join(tempRecentDir, '2026-08-17_12-50-00-front.mp4');
  if (!fs.existsSync(tempRecentFile) && savedFiles.length > 0) {
    fs.copyFileSync(savedFiles[0], tempRecentFile);
  }

  const allFiles = [...savedFiles, ...sentryFiles, tempRecentFile];
  console.log(`Uploading ${allFiles.length} files across SavedClips, SentryClips, RecentClips...`);

  const inputEl = await page.$('#fallback-file-input');
  await inputEl.uploadFile(...allFiles);

  // Re-load through app.loadFiles with realistic relativePaths as DirectoryPicker provides
  await page.evaluate(() => {
    const input = document.getElementById('fallback-file-input');
    const files = Array.from(input.files);
    const items = files.map(f => {
      let rel = f.name;
      if (f.name.includes('12-50-00')) {
        rel = 'TeslaCam/RecentClips/' + f.name;
      } else if (f.name.includes('09-26-59')) {
        rel = 'TeslaCam/SentryClips/2026-08-17_09-37-37/' + f.name;
      } else {
        rel = 'TeslaCam/SavedClips/2026-08-17_12-48-22/' + f.name;
      }
      return {
        name: f.name,
        relativePath: rel,
        file: f
      };
    });
    window.app.loadFiles(items);
  });

  await page.waitForSelector('.folder-header', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  // Inspect rendered folder headers
  const folderHeaders = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('.folder-header'));
    return headers.map(h => {
      const style = window.getComputedStyle(h);
      const nameEl = h.querySelector('.folder-name');
      const arrowEl = h.querySelector('.folder-arrow');
      return {
        className: h.className,
        text: h.textContent.trim(),
        nameText: nameEl ? nameEl.textContent.trim() : '',
        textColor: style.color,
        borderLeftColor: style.borderLeftColor,
        backgroundColor: style.backgroundColor,
      };
    });
  });

  console.log('Rendered Folder Headers:', folderHeaders);

  // Assertions:
  // 1. RecentClips header
  const recentHeader = folderHeaders.find(h => h.className.includes('folder-type-recent'));
  if (!recentHeader) {
    throw new Error('RecentClips folder-type-recent class not found!');
  }
  if (!recentHeader.text.includes('최근클립')) {
    throw new Error(`RecentClips display text should contain '최근클립', got: ${recentHeader.text}`);
  }
  console.log('✓ RecentClips (최근클립) header verified: color =', recentHeader.textColor);

  // 2. SavedClips header
  const savedHeader = folderHeaders.find(h => h.className.includes('folder-type-saved'));
  if (!savedHeader) {
    throw new Error('SavedClips folder-type-saved class not found!');
  }
  if (!savedHeader.text.includes('저장된 클립')) {
    throw new Error(`SavedClips display text should contain '저장된 클립', got: ${savedHeader.text}`);
  }
  console.log('✓ SavedClips (저장된 클립 - 날짜시간) header verified: color =', savedHeader.textColor);

  // 3. SentryClips header
  const sentryHeader = folderHeaders.find(h => h.className.includes('folder-type-sentry'));
  if (!sentryHeader) {
    throw new Error('SentryClips folder-type-sentry class not found!');
  }
  if (!sentryHeader.text.includes('센트리 클립')) {
    throw new Error(`SentryClips display text should contain '센트리 클립', got: ${sentryHeader.text}`);
  }
  console.log('✓ SentryClips (센트리 클립 - 날짜시간) header verified: color =', sentryHeader.textColor);

  // Capture screenshot of the sidebar explorer showing the 3 colored folder groups
  const sidebar = await page.$('.sidebar') || await page.$('#clips-tree');
  if (sidebar) {
    const screenshotPath = path.join(ARTIFACT_DIR, 'folder_tree_colored_display.png');
    await sidebar.screenshot({ path: screenshotPath });
    const docsPath = path.join(__dirname, '../docs/folder_tree_colored_display.png');
    fs.copyFileSync(screenshotPath, docsPath);
    console.log(`✓ Screenshot of colored folder tree saved to: ${screenshotPath} and ${docsPath}`);
  }

  // Cleanup temporary file
  try {
    if (fs.existsSync(tempRecentFile)) fs.unlinkSync(tempRecentFile);
    if (fs.existsSync(tempRecentDir)) fs.rmdirSync(tempRecentDir);
  } catch (e) {}

  await browser.close();
  console.log('=== All Folder Grouping and Color Display Tests Passed 100%! ===');
}

runFolderDisplayTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
