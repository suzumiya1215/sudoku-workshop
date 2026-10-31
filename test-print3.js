const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'C:/Users/suzumiya/Desktop/数独工坊';
const FILE = 'file:///' + path.resolve(BASE + '/数独工坊.html').replace(/\\/g, '/');
const OUT = BASE + '/shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
  await p.goto(FILE, { waitUntil: 'load' });
  await p.waitForSelector('#p-board .board');
  await p.click('.tabs button[data-tab="batch"]');

  // 每种玩法各 1 题，L5 档，1 题/页
  const kinds = ['classic', 'killer', 'jigsaw', 'thermo', 'arrow', 'sandwich', 'littlekiller', 'renban', 'whisper', 'diagonal'];
  await p.evaluate((kinds) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input')); } };
    ['b-d1', 'b-d2', 'b-d3', 'b-d4', 'b-d5', 'b-d6', 'b-d7', 'b-d8', 'b-d9', 'b-d10'].forEach(id => set(id, 0));
    set('b-d5', kinds.length);
    document.querySelectorAll('#b-vars input').forEach(cb => {
      const on = kinds.includes(cb.value);
      cb.checked = on; cb.parentNode.classList.toggle('on', on);
    });
    document.getElementById('b-per').value = '1';
  }, kinds);
  await p.click('#b-go');
  await p.waitForFunction(() => /完成/.test(document.querySelector('#b-status').textContent), { timeout: 240000 });
  console.log('生成状态:', await p.$eval('#b-status', e => e.textContent.trim()));
  await p.click('#b-view');
  await sleep(800);

  const info = await p.evaluate(() => {
    const sheets = [...document.querySelectorAll('#sheets .sheet')];
    return sheets.map((sh, i) => {
      const boards = [...sh.querySelectorAll('.board')];
      const over = boards.some(x => {
        const r = x.getBoundingClientRect(), sr = sh.getBoundingClientRect();
        return r.right > sr.right - 5 || r.bottom > sr.bottom - 5;
      });
      const first = boards[0];
      let dash = 0, solid = 0;
      if (first) {
        first.querySelectorAll('svg path, svg line, svg polyline').forEach(n => {
          const d = n.getAttribute('stroke-dasharray');
          if (d && d !== 'none') dash++;
        });
        // 统计每块盘细线 path 的 d，用于核对统一性
        first.querySelectorAll('svg path').forEach(n => { if (n.getAttribute('stroke-width') <= 1.2) solid++; });
      }
      return {
        i,
        title: (sh.querySelector('.s-title, .pz-title, h3, h4') || {}).textContent?.trim().replace(/\s+/g, ' ').slice(0, 60),
        boards: boards.length, over, dash,
        w: first ? Math.round(first.getBoundingClientRect().width) : 0,
        foot: !!sh.querySelector('.s-foot')
      };
    });
  });
  console.log('页信息:', JSON.stringify(info, null, 0));

  // 各页题目/答案区标题文本
  const titles = await p.evaluate(() => {
    return [...document.querySelectorAll('#sheets .sheet')].map(sh =>
      [...sh.querySelectorAll('.pz h4, .pz .pzhead, .pz-head, .pzname, .pz .name')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).join(' | ')
    );
  });
  console.log('题目标题:', JSON.stringify(titles));

  // 截图：含杀手的题目页 + 答案页
  const sheets = await p.$$('#sheets .sheet');
  for (let i = 1; i < Math.min(sheets.length, 5); i++) {
    await sheets[i].screenshot({ path: path.join(OUT, 'p3-' + i + '.png') });
  }
  await sheets[sheets.length - 1].screenshot({ path: path.join(OUT, 'p3-ans.png') });
  if (sheets.length > 2) await sheets[sheets.length - 2].screenshot({ path: path.join(OUT, 'p3-ans2.png') });

  console.log('错误:', errs.length ? errs.slice(0, 10) : '无');
  await b.close();
})();
