/* 校验 src/demo.js 里的 13 张示意图数据：解是否满足该玩法的全部约束、给定是否与解一致 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

['core.js', 'human.js', 'make.js', 'demo.js'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), { filename: f }));
const SD = globalThis.SD, C = SD.core;
const D = SD.DEMO;

let bad = 0;
const fail = (k, msg) => { bad++; console.log('  ✗', k, msg); };

for (const v of SD.VARIANTS) {
  const d = D[v.id];
  if (!d) { fail(v.id, '数据缺失'); continue; }
  const sol = d.s.split('').map(Number);
  const puz = d.p.split('').map(Number);
  const errs = [];

  // 1..9 各 9 个
  for (let n = 1; n <= 9; n++) if (sol.filter(x => x === n).length !== 9) errs.push('数字 ' + n + ' 个数不为 9');

  // 行 / 列 / 区域
  const unitOk = cells => new Set(cells.map(i => sol[i])).size === 9;
  for (let r = 0; r < 9; r++) if (!unitOk(Array.from({ length: 9 }, (_, c) => r * 9 + c))) errs.push('第 ' + (r + 1) + ' 行重复');
  for (let c = 0; c < 9; c++) if (!unitOk(Array.from({ length: 9 }, (_, r) => r * 9 + c))) errs.push('第 ' + (c + 1) + ' 列重复');
  d.r.forEach((g, k) => { if (!unitOk(g)) errs.push('区域 ' + (k + 1) + ' 重复'); });

  // 对角线
  if (v.id === 'diagonal') {
    if (!unitOk(Array.from({ length: 9 }, (_, i) => i * 9 + i))) errs.push('主对角线重复');
    if (!unitOk(Array.from({ length: 9 }, (_, i) => i * 9 + (8 - i)))) errs.push('副对角线重复');
  }
  // 反骑士 / 反王
  const knight = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const king = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const checkSteps = (steps, label) => {
    for (let i = 0; i < 81; i++) {
      const r = (i / 9) | 0, c = i % 9;
      for (const [dr, dc] of steps) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 8 || cc < 0 || cc > 8) continue;
        if (sol[i] === sol[rr * 9 + cc]) errs.push(label + ' R' + (r + 1) + 'C' + (c + 1));
      }
    }
  };
  if (v.id === 'antiknight') checkSteps(knight, '骑士冲突');
  if (v.id === 'antiking') checkSteps(king, '王冲突');

  // 笼
  d.cg.forEach(cg => {
    const s = cg.c.reduce((a, i) => a + sol[i], 0);
    if (s !== cg.s) errs.push('笼和 ' + cg.s + ' 实际 ' + s);
    const vs = cg.c.map(i => sol[i]);
    if (new Set(vs).size !== vs.length) errs.push('笼内重复值');
    if (cg.c.length < 2) errs.push('单格笼');
  });
  // 温度计 / 连续 / 耳语 / 箭头
  d.th.forEach((t, k) => {
    for (let i = 1; i < t.length; i++) if (sol[t[i]] <= sol[t[i - 1]]) errs.push('温度计' + k + '非递增');
  });
  /* 连续数的规则是"一组连续整数、顺序不限"，不是路径相邻差 1 */
  d.rb.forEach((t, k) => {
    const vs = t.map(i => sol[i]);
    const mn = Math.min(...vs), mx = Math.max(...vs);
    if (mx - mn !== vs.length - 1 || new Set(vs).size !== vs.length) errs.push('连续线' + k + '不是连续整数集合');
  });
  d.wh.forEach((t, k) => {
    for (let i = 1; i < t.length; i++) if (Math.abs(sol[t[i]] - sol[t[i - 1]]) < 5) errs.push('耳语线' + k + '差<5');
  });
  d.ar.forEach((a, k) => {
    const s = a.l.reduce((x, i) => x + sol[i], 0);
    if (s !== sol[a.c]) errs.push('箭头' + k + ' 和 ' + s + ' ≠ 圈 ' + sol[a.c]);
  });
  // 三明治
  const SW = (cells) => {
    const vals = cells.map(i => sol[i]);
    const a = vals.indexOf(1), b = vals.indexOf(9);
    if (a < 0 || b < 0) return null;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return vals.slice(lo + 1, hi).reduce((x, y) => x + y, 0);
  };
  d.sr.forEach((s, r) => {
    if (s == null) return;
    const got = SW(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    if (got !== s) errs.push('三明治行 R' + (r + 1) + ' 标 ' + s + ' 实际 ' + got);
  });
  d.sc.forEach((s, c) => {
    if (s == null) return;
    const got = SW(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    if (got !== s) errs.push('三明治列 C' + (c + 1) + ' 标 ' + s + ' 实际 ' + got);
  });
  // 小杀手
  d.lk.forEach((l, k) => {
    const s = l.c.reduce((x, i) => x + sol[i], 0);
    if (s !== l.s) errs.push('小杀手' + k + ' 和 ' + l.s + ' 实际 ' + s);
  });

  // 给定与解一致
  for (let i = 0; i < 81; i++) if (puz[i] && puz[i] !== sol[i]) errs.push('给定 R' + (((i / 9) | 0) + 1) + 'C' + (i % 9 + 1) + ' 与解不符');

  const given = puz.filter(x => x).length;
  if (errs.length) { fail(v.id, errs.slice(0, 4).join('；') + (errs.length > 4 ? ' …共' + errs.length + '条' : '')); }
  else console.log('  ✓', v.id.padEnd(12), '给定', String(given).padStart(2),
    '笼', d.cg.length, '温度计', d.th.length, '箭头', d.ar.length, '连续', d.rb.length, '耳语', d.wh.length, '小杀手', d.lk.length);
}
console.log(bad ? '不合格 ' + bad + ' 张' : '13 张示意图全部合规');
