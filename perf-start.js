const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = 'file:///' + path.resolve(__dirname + '/数独工坊.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 1000 });

  // 长任务观测：>50ms 的任务记时长
  await p.evaluateOnNewDocument(() => {
    window.__long = [];
    try {
      new PerformanceObserver(list => {
        list.getEntries().forEach(e => window.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }));
      }).observe({ entryTypes: ['longtask'] });
    } catch (err) { }
    window.__marks = [];
    const mt = () => { window.__marks.push({ t: Math.round(performance.now()), stage: document.readyState }); };
    document.addEventListener('readystatechange', mt);
  });

  const t0 = Date.now();
  await p.goto(FILE, { waitUntil: 'load' });
  const tLoad = Date.now() - t0;

  // 等棋盘出现（首题可用）
  const tA = Date.now();
  await p.waitForSelector('#p-board .board', { timeout: 60000 });
  const tBoard = Date.now() - tA;

  const info = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEv: Math.round(nav.loadEventEnd || 0),
      firstPaint: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
      long: (window.__long || []).slice(0, 20),
      longTotal: (window.__long || []).reduce((s, x) => s + x.d, 0),
      marks: window.__marks
    };
  });
  console.log('goto load 用时', tLoad, 'ms');
  console.log('棋盘出现再等', tBoard, 'ms');
  console.log('DCL', info.dcl, '| load', info.loadEv, '| FCP', info.firstPaint);
  console.log('长任务合计', info.longTotal, 'ms ->', JSON.stringify(info.long));
  console.log('readyState 时间点', JSON.stringify(info.marks));

  // 分阶段拆解：initPlay / initManual 各自耗时
  const cost = await p.evaluate(async () => {
    const out = {};
    const t = (k, fn) => { const s = performance.now(); fn(); out[k] = Math.round(performance.now() - s); };
    t('新建经典题(含生成)', () => { document.querySelector('#p-kind').value = 'classic'; document.querySelector('#p-new').click(); });
    return out;
  }).catch(e => ({ err: String(e) }));
  console.log('单次点击生成耗时(异步,仅点击耗时)', JSON.stringify(cost));

  await b.close();
})();
