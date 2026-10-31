const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'C:/Users/suzumiya/Desktop/数独工坊';
const FILE = 'file:///' + path.resolve(BASE + '/数独工坊.html').replace(/\\/g, '/');
const OUT = BASE + '/shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => console.log((c ? '  ✓ ' : '  ✗ ') + m);

(async () => {
  const b = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 2 });
  await p.goto(FILE, { waitUntil: 'load' });
  await p.waitForSelector('#p-board .board');
  await sleep(500);

  // 1) 十档下拉
  const bands = await p.$$eval('#p-band option', os => os.map(o => o.value + ':' + o.textContent.trim()));
  ok(bands.length === 10, '难度下拉 10 档 → ' + bands.join(' / '));

  // 2) 棋盘坐标轴
  const ax = await p.evaluate(() => {
    const cols = [...document.querySelectorAll('#p-board .ax.cols i')].map(e => e.textContent.trim());
    const rows = [...document.querySelectorAll('#p-board .ax.rows i')].map(e => e.textContent.trim());
    return { cols, rows };
  });
  ok(ax.cols.length === 9 && ax.rows.length === 9, '坐标轴 9×9 → 列 ' + ax.cols.join(',') + ' / 行 ' + ax.rows.join(','));

  // 3) 键盘：填数 / 候选 / 删除 / 撤销
  await p.evaluate(() => {
    const i = [...document.querySelectorAll('#p-board .cell')].findIndex(c => c.classList.contains('user'));
    window.__sel = i >= 0 ? i : 40;
    document.querySelectorAll('#p-board .cell')[window.__sel].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(100);
  const givenOrNot = await p.evaluate(() => document.querySelectorAll('#p-board .cell')[window.__sel].classList.contains('given'));
  if (givenOrNot) {
    await p.evaluate(() => {
      const cells = [...document.querySelectorAll('#p-board .cell')];
      const i = cells.findIndex(c => !c.classList.contains('given'));
      window.__sel = i;
      cells[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(80);
  }
  await p.keyboard.press('5');
  await sleep(120);
  let st = await p.evaluate(() => {
    const c = document.querySelectorAll('#p-board .cell')[window.__sel];
    return { txt: c.textContent.trim(), cls: c.className };
  });
  ok(st.txt === '5' && /user/.test(st.cls), '键盘输入数字 5 → 格内 "' + st.txt + '"');
  await p.keyboard.press('Backspace');
  await sleep(100);
  await p.keyboard.down('Shift'); await p.keyboard.press('3'); await p.keyboard.up('Shift');
  await sleep(120);
  const note = await p.evaluate(() => {
    const c = document.querySelectorAll('#p-board .cell')[window.__sel];
    const cd = c.querySelector('.cand');
    const filled = cd ? [...cd.querySelectorAll('span')].filter(x => x.textContent.trim()).map(x => x.textContent.trim()) : [];
    return { n: filled.length, t: filled.join(',') };
  });
  ok(note.n >= 1, 'Shift+3 记候选 → 候选 ' + note.n + ' 个（' + note.t + '）');
  await p.keyboard.press('Backspace');
  await sleep(120);
  st = await p.evaluate(() => document.querySelectorAll('#p-board .cell')[window.__sel].textContent.trim());
  ok(st === '', 'Backspace 清空 → 该格 "' + st + '"');
  await p.keyboard.press('4');
  await sleep(100);
  await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control');
  await sleep(150);
  st = await p.evaluate(() => document.querySelectorAll('#p-board .cell')[window.__sel].textContent.trim());
  ok(st === '', 'Ctrl+Z 撤销 → 该格 "' + st + '"（回到清空态）');

  // 4) 方向键移动
  const before = await p.evaluate(() => [...document.querySelectorAll('#p-board .cell')].findIndex(c => c.classList.contains('sel')));
  await p.keyboard.press('ArrowRight');
  await sleep(120);
  const after = await p.evaluate(() => [...document.querySelectorAll('#p-board .cell')].findIndex(c => c.classList.contains('sel')));
  ok(after === before + 1, '方向键右移 ' + before + ' → ' + after);

  // 5) 候选数模式 / 数字盘剩余计数
  await p.click('#p-cand').catch(() => {});
  await sleep(100);
  const pad = await p.evaluate(() => [...document.querySelectorAll('#p-pad .padbtn')].map(b => b.dataset.v + '=' + (b.querySelector('em') || {}).textContent).join(' '));
  ok(/剩|已满/.test(pad), '数字盘剩余计数 → ' + pad);

  // 6) 逐步演示 可停
  await p.click('#p-all');
  await sleep(900);
  const mid = await p.evaluate(() => ({ t: document.querySelector('#p-all').textContent.trim(), on: document.querySelector('#p-all').classList.contains('accent') }));
  ok(/停止/.test(mid.t) && mid.on, '演示中按钮 → "' + mid.t + '" accent=' + mid.on);
  const snap1 = await p.evaluate(() => document.querySelectorAll('#p-board .cell.sol').length);
  await sleep(1800);
  const snap2 = await p.evaluate(() => document.querySelectorAll('#p-board .cell.sol').length);
  const stopped = await p.evaluate(() => document.querySelector('#p-all').textContent.trim());
  ok(/停止/.test(stopped) && snap1 === snap2, '1.8s 后仍在同一停点（' + snap1 + '→' + snap2 + '），未被强行跑完');
  await p.click('#p-all');
  await sleep(300);
  const back = await p.evaluate(() => ({ t: document.querySelector('#p-all').textContent.trim(), on: document.querySelector('#p-all').classList.contains('accent') }));
  ok(/逐步演示/.test(back.t) && !back.on, '点停止 → 按钮复位 "' + back.t + '"');

  // 7) 暂停 / 上一步 / 打印本题 / 复制题目
  await p.click('#p-pause');
  await sleep(150);
  const pz = await p.evaluate(() => document.querySelector('#p-pause').textContent.trim());
  ok(/继续|暂停/.test(pz), '暂停按钮 → "' + pz + '"');
  await p.click('#p-pause');

  // 8) 难度十档生成一道 L7 + 杀手 L3 评级依据
  await p.select('#p-kind', 'classic');
  await p.select('#p-band', '7');
  await p.click('#p-new');
  await sleep(3200);
  const basis7 = await p.$eval('#p-basis', e => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/L7|SE/.test(basis7), 'L7 评级依据 → ' + basis7.slice(0, 120));
  await p.select('#p-kind', 'killer');
  await p.select('#p-band', '5');
  await p.click('#p-new');
  await sleep(3500);
  const basisK = await p.$eval('#p-basis', e => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/笼|2\.4/.test(basisK) || /L3/.test(basisK), '杀手评级依据 → ' + basisK.slice(0, 160));
  const kb = await p.$('#p-board .boardwrap');
  if (kb) await kb.screenshot({ path: path.join(OUT, 'k-basis.png') });

  // 9) 手册：13 张玩法卡 + 10 档表 + note
  await p.click('.tabs button[data-tab="manual"]');
  await sleep(400);
  const man = await p.evaluate(() => ({
    cards: document.querySelectorAll('#m-var .varcard').length,
    bands: document.querySelectorAll('#m-band tr').length,
    techs: document.querySelectorAll('#m-tech tr').length,
    note: !!document.querySelector('.card .note'),
    firstHow: (document.querySelector('#m-var .varcard .vbody') || {}).textContent?.slice(0, 60)
  }));
  ok(man.cards === 13, '玩法卡片 ' + man.cards + ' 张');
  ok(man.bands === 10, '难度表 ' + man.bands + ' 行');
  ok(man.techs >= 16, '技巧表 ' + man.techs + ' 行');
  ok(man.note, '难度说明附注已渲染');
  const mc = await p.$('#m-var .varcard');
  if (mc) await mc.screenshot({ path: path.join(OUT, 'm-card.png') });
  await p.screenshot({ path: path.join(OUT, 'm-full.png'), fullPage: false });

  // 10) 批量：文案准确
  await p.click('.tabs button[data-tab="batch"]');
  await p.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input')); } };
    ['b-d1', 'b-d2', 'b-d3', 'b-d4', 'b-d5', 'b-d6', 'b-d7', 'b-d8', 'b-d9', 'b-d10'].forEach(id => set(id, 0));
    set('b-d5', 3);
    document.querySelectorAll('#b-vars input').forEach(cb => {
      const on = ['classic', 'killer'].includes(cb.value);
      cb.checked = on; cb.parentNode.classList.toggle('on', on);
    });
  });
  await p.click('#b-go');
  await p.waitForFunction(() => /完成/.test(document.querySelector('#b-status').textContent), { timeout: 200000 });
  const bs = await p.$eval('#b-status', e => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/全部按要求档位出题|→L/.test(bs), '批量文案（不夸大为"相邻档"）→ ' + bs);

  console.log('页面错误:', errs.length ? errs.slice(0, 8) : '无');
  await b.close();
})();
