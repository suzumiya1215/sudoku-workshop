/* 预生成手册页 13 张玩法示意图的数据，写成 src/demo.js。
   原来这些图是在浏览器启动时用真实求解器现算的，13 张要 18.8 秒，
   整个页面被卡住——改成离线算一次、运行时只读数据。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

['core.js', 'human.js', 'make.js'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), { filename: f }));
const SD = globalThis.SD, C = SD.core;

/* 与 app.js 里原来的 DEMO_SOL / DEMO_MASK 保持一致 */
const DEMO_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  .split('').map(Number);
const DEMO_MASK = (function () {
  const p = DEMO_SOL.slice();
  const idx = C.shuffle(Array.from({ length: 81 }, (_, i) => i), C.mulberry32(4242));
  for (let i = 0; i < 36; i++) p[idx[i]] = 0;
  return p;
})();

function build(id, seed) {
  /* 用真实的出题器出一张合规盘：解必须满足该玩法的全部约束，
     示意图才不会被懂规则的玩家一眼看出错。 */
  let it = null;
  for (let k = 0; k < 6 && !it; k++) it = SD.makePuzzle(id, 4, seed + k * 17);
  if (!it) throw new Error(id + ' 出题失败');
  const ctx = it.ctx, sol = it.solution, puzzle = it.puzzle;
  return {
    k: id,
    p: puzzle.join(''),
    s: sol.join(''),
    r: ctx.regions.map(g => g.slice()),
    cg: ctx.cages.map(c => ({ c: c.cells, s: c.sum })),
    th: ctx.thermos.map(t => t.slice()),
    ar: ctx.arrows.map(a => ({ c: a.circle, l: a.cells.slice() })),
    rb: ctx.renbans.map(t => t.slice()),
    wh: ctx.whispers.map(t => t.slice()),
    sr: ctx.sandwichRows,
    sc: ctx.sandwichCols,
    lk: ctx.lks.map(l => ({ c: l.cells, s: l.sum, d: l.side, i: l.idx }))
  };
}

const out = {};
for (const v of SD.VARIANTS) {
  const t0 = Date.now();
  out[v.id] = build(v.id, 8800 + SD.VARIANTS.indexOf(v) * 101);
  console.log(v.id.padEnd(12), (Date.now() - t0) + 'ms',
    'cages', out[v.id].cg.length, 'thermo', out[v.id].th.length,
    'arrow', out[v.id].ar.length, 'renban', out[v.id].rb.length,
    'whisper', out[v.id].wh.length, 'lk', out[v.id].lk.length);
}

const js = '/* 自动生成：node tools/make-demo.js（不要手改） */\n' +
  'SD.DEMO = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '../src/demo.js'), js, 'utf8');
console.log('写出 src/demo.js', (Buffer.byteLength(js, 'utf8') / 1024).toFixed(1) + 'KB');
