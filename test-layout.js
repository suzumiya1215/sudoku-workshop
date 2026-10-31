/* 只测 A4 排版：1 题/页 与 4 题/页 的实际版面 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = 'file:///' + path.resolve(__dirname, '数独工坊.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForSelector('#p-board .board');

  await page.click('.tabs button[data-tab="batch"]');
  await page.evaluate(() => {
    document.querySelector('#b-band1').value = 1;
    document.querySelector('#b-band2').value = 1;
    document.querySelector('#b-band3').value = 1;
    document.querySelector('#b-band4').value = 1;
    const want = ['classic', 'killer', 'jigsaw', 'sandwich'];
    document.querySelectorAll('#b-vars input').forEach(cb => {
      const on = want.includes(cb.value);
      cb.checked = on; cb.parentNode.classList.toggle('on', on);
    });
  });
  await page.click('#b-go');
  await page.waitForFunction(() => /完成/.test(document.querySelector('#b-status').textContent), { timeout: 180000 });
  console.log(await page.$eval('#b-status', e => e.textContent));

  for (const per of ['1', '4', '2']) {
    await page.evaluate((p) => { document.querySelector('#b-per').value = p; }, per);
    await page.evaluate(() => document.querySelector('#b-view').click());
    await sleep(700);
    const info = await page.evaluate(() => {
      const ss = Array.from(document.querySelectorAll('#sheets .sheet'));
      return ss.map(s => {
        const r = s.getBoundingClientRect();
        let maxB = 0, maxR = 0;
        s.querySelectorAll('.pz,.pzrow,.pzgrid,.ans,.draft,.cover-box').forEach(c => {
          const b = c.getBoundingClientRect();
          maxB = Math.max(maxB, b.bottom - r.top);
          maxR = Math.max(maxR, b.right - r.left);
        });
        return [Math.round(r.width), Math.round(r.height), Math.round(maxB), Math.round(maxR)];
      });
    });
    console.log('perPage', per, '页数', info.length, '第一题页 [w,h,内容底,内容右]', JSON.stringify(info[1]));
    const els = await page.$$('#sheets .sheet');
    if (els[1]) await els[1].screenshot({ path: path.join(OUT, 'layout-' + per + 'pp.png') });
    await page.pdf({ path: path.join(OUT, 'layout-' + per + 'pp.pdf'), format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await page.evaluate(() => document.body.classList.remove('viewing'));
  }
  console.log('错误', errs.length, errs.slice(0, 5).join(' | '));
  await browser.close();
})();
