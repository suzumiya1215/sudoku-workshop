/* 界面实测：打开构建产物，跑四个页签、批量出题、排版预览与 PDF 导出 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = 'file:///' + path.resolve(__dirname, '数独工坊.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--force-device-scale-factor=1']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1420, height: 980 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForSelector('#p-board .board', { timeout: 30000 });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'p1-play.png') });

  const info1 = await page.evaluate(() => ({
    chips: document.querySelector('#p-info').textContent,
    tech: document.querySelector('#p-tech').textContent,
    steps: document.querySelectorAll('#p-steps .st').length,
    cells: document.querySelectorAll('#p-board .cell').length,
    given: document.querySelectorAll('#p-board .cell.given').length
  }));
  console.log('练习页:', JSON.stringify(info1));

  // 逐步演示 → 看解释文本（同时验证切换题目后不会串题）
  await page.click('#p-all');
  await sleep(1500);
  const ex = await page.evaluate(() => document.querySelector('#p-explain').textContent.slice(0, 120));
  console.log('解释示例:', ex);
  await page.screenshot({ path: path.join(OUT, 'p2-play-explain.png') });

  // 变种：锯齿 + 杀手，检查覆盖层
  for (const [kind, name] of [['jigsaw', 'p3-jigsaw'], ['killer', 'p4-killer'], ['sandwich', 'p5-sandwich'], ['arrow', 'p6-arrow']]) {
    await page.select('#p-kind', kind);
    await page.click('#p-new');
    await sleep(50);
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('#p-board .board') &&
      document.querySelector('#p-tech') && document.querySelector('#p-tech').textContent !== '—', { timeout: 60000 });
    await sleep(1500);   // 等一会儿，确认没有定时器在偷偷填格子
    const meta = await page.evaluate(() => ({
      chips: document.querySelector('#p-info').textContent,
      filled: document.querySelectorAll('#p-board .cell.given').length,
      blue: document.querySelectorAll('#p-board .cell.user').length,
      svg: document.querySelectorAll('#p-board svg *').length,
      cellRects: [0, 1, 9, 10, 80].map(i => { const r = document.querySelectorAll('#p-board .cell')[i].getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })
    }));
    console.log(kind, (Date.now() - t0) + 'ms', JSON.stringify(meta));
    const board = await page.$('#p-board .board');
    await board.screenshot({ path: path.join(OUT, name + '-board.png') });
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }

  // 专项训练
  await page.click('.tabs button[data-tab="train"]');
  await page.select('#t-tech', 'xWing');
  await page.click('#t-gen');
  await sleep(400);
  await page.waitForFunction(() => document.querySelector('#t-board .board'), { timeout: 60000 });
  await sleep(500);
  const tr = await page.evaluate(() => ({
    info: document.querySelector('#t-info').textContent,
    status: document.querySelector('#t-status').textContent,
    steps: document.querySelectorAll('#t-steps .st').length,
    hits: document.querySelectorAll('#t-steps .st.hit').length,
    flash: document.querySelectorAll('#t-board .cell.flash').length,
    explain: document.querySelector('#t-explain').textContent.slice(0, 90)
  }));
  console.log('专项训练:', JSON.stringify(tr));
  await page.screenshot({ path: path.join(OUT, 'p7-train.png') });
  const tboard = await page.$('#t-board .board');
  await tboard.screenshot({ path: path.join(OUT, 'p7-train-board.png') });

  // 批量出题
  await page.click('.tabs button[data-tab="batch"]');
  await page.evaluate(() => {
    document.querySelector('#b-band1').value = 2;
    document.querySelector('#b-band2').value = 2;
    document.querySelector('#b-band3').value = 1;
    document.querySelector('#b-band4').value = 1;
    document.querySelectorAll('#b-vars input').forEach(cb => {
      const on = ['classic', 'killer', 'jigsaw', 'sandwich'].includes(cb.value);
      cb.checked = on; cb.parentNode.classList.toggle('on', on);
    });
    document.querySelector('#b-per').value = '2';
  });
  const tb = Date.now();
  await page.click('#b-go');
  await page.waitForFunction(() => /完成/.test(document.querySelector('#b-status').textContent), { timeout: 180000 });
  console.log('批量 6 道耗时', Date.now() - tb, 'ms，状态:', await page.$eval('#b-status', e => e.textContent));
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'p8-batch.png') });

  // 排版预览
  await page.click('#b-view');
  await sleep(700);
  const sheets = await page.evaluate(() => {
    const ss = Array.from(document.querySelectorAll('#sheets .sheet'));
    return ss.map(s => {
      const r = s.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), foot: (s.querySelector('.s-foot') || {}).textContent || '' };
    });
  });
  console.log('页数', sheets.length, JSON.stringify(sheets.slice(0, 4)));
  // 检查溢出：任何 sheet 的子内容底边超过页高
  const over = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#sheets .sheet')).map((s, i) => {
      const b = s.getBoundingClientRect();
      let maxB = 0;
      s.querySelectorAll('.pz,.ans,.pzgrid,.draft,.cover-box').forEach(c => {
        const r = c.getBoundingClientRect();
        maxB = Math.max(maxB, r.bottom - b.top);
      });
      return { i: i + 1, contentBottom: Math.round(maxB), pageH: Math.round(b.height) };
    }).filter(x => x.contentBottom > x.pageH - 30);
  });
  console.log('溢出页:', JSON.stringify(over));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'p9-sheet1.png') });
  await page.evaluate(() => window.scrollTo(0, 1123));
  await page.screenshot({ path: path.join(OUT, 'p10-sheet2.png') });
  const sheetsEl = await page.$$('#sheets .sheet');
  await sheetsEl[1].screenshot({ path: path.join(OUT, 'p11-sheet2-full.png') });
  await sheetsEl[2].screenshot({ path: path.join(OUT, 'p12-sheet3-full.png') });
  await sheetsEl[sheetsEl.length - 1].screenshot({ path: path.join(OUT, 'p13-answers-full.png') });

  // PDF
  await page.pdf({ path: path.join(OUT, '练习册.pdf'), format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const pdfSize = fs.statSync(path.join(OUT, '练习册.pdf')).size;
  console.log('PDF 字节', pdfSize);

  console.log('错误数', errs.length);
  errs.slice(0, 12).forEach(e => console.log('  ', e));
  await browser.close();
})();
