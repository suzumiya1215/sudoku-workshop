/* 生成一份 50 题样张 PDF（十档难度 + 多玩法），验证整条导出链 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = 'file:///' + path.resolve(__dirname, '数独工坊.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DIST = [0, 3, 5, 6, 6, 6, 6, 5, 5, 4, 4];   /* index 1..10 共 50 题 */

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForSelector('#p-board .board');

  await page.click('.tabs button[data-tab="batch"]');
  await page.evaluate((DIST) => {
    document.querySelector('#b-title').value = '数独练习册（50 题样张）';
    for (let i = 1; i <= 10; i++) {
      const e = document.getElementById('b-d' + i);
      e.value = DIST[i];
      e.dispatchEvent(new Event('input'));
    }
    const want = ['classic', 'thermo', 'arrow', 'sandwich', 'jigsaw', 'killer'];
    document.querySelectorAll('#b-vars input').forEach(cb => {
      const on = want.includes(cb.value);
      cb.checked = on; cb.parentNode.classList.toggle('on', on);
    });
    document.querySelector('#b-per').value = '2';
  }, DIST);
  console.log('计划题数', await page.$eval('#b-total', e => e.textContent));

  const t0 = Date.now();
  await page.click('#b-go');
  await page.waitForFunction(() => /完成/.test(document.querySelector('#b-status').textContent), { timeout: 600000 });
  console.log('生成耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's |', await page.$eval('#b-status', e => e.textContent));

  await page.evaluate(() => document.querySelector('#b-view').click());
  await sleep(1500);
  const stat = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('#sheets .sheet')];
    let over = 0;
    sheets.forEach(sh => {
      [...sh.querySelectorAll('.board')].forEach(x => {
        const r = x.getBoundingClientRect(), sr = sh.getBoundingClientRect();
        if (r.right > sr.right - 4 || r.bottom > sr.bottom - 4) over++;
      });
    });
    return { pages: sheets.length, over, foot: sheets.filter(s => s.querySelector('.s-foot')).length };
  });
  console.log('排版页数', stat.pages, '越界', stat.over, '页脚', stat.foot);

  const sheets = await page.$$('#sheets .sheet');
  for (const idx of [0, 1, 2]) {
    if (sheets[idx]) await sheets[idx].screenshot({ path: path.resolve(__dirname, 'shots/s50-' + idx + '.png') });
  }
  if (sheets[stat.pages - 1]) {
    await sheets[stat.pages - 1].screenshot({ path: path.resolve(__dirname, 'shots/s50-ans.png') });
  }

  await page.pdf({
    path: path.resolve(__dirname, '样张-50题.pdf'),
    format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  const st = fs.statSync(path.resolve(__dirname, '样张-50题.pdf'));
  console.log('PDF', (st.size / 1024).toFixed(0) + 'KB');
  await browser.close();
})();
