const fs = require('fs'), vm = require('vm');
['core.js', 'human.js', 'make.js'].forEach(f => vm.runInThisContext(fs.readFileSync(__dirname + '/src/' + f, 'utf8'), { filename: f }));
const SD = globalThis.SD;

const band = +(process.argv[2] || 5);
const reps = +(process.argv[3] || 2);
const rows = [];
for (const v of SD.VARIANTS) {
  const got = [];
  let ms = 0;
  for (let k = 0; k < reps; k++) {
    const t0 = Date.now();
    const r = SD.makePuzzle(v.id, band, 7000 + k * 13 + band);
    ms += Date.now() - t0;
    got.push(r ? 'L' + r.band + '/SE' + r.se.toFixed(1) : 'FAIL');
  }
  const miss = got.filter(g => g !== 'L' + band + '/SE' + (0)).length;
  rows.push({ kind: v.id, got: got.join(' '), avg: Math.round(ms / reps) });
  console.log(v.id.padEnd(13), got.join('  ').padEnd(34), 'avg', Math.round(ms / reps) + 'ms');
}
console.log('目标 L' + band);
