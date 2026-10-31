const fs = require('fs');
const vm = require('vm');
['core.js', 'human.js', 'make.js'].forEach(f => {
  vm.runInThisContext(fs.readFileSync(__dirname + '/src/' + f, 'utf8'), { filename: f });
});
const SD = globalThis.SD;

function t(kind, band) {
  const t0 = Date.now();
  const r = SD.makePuzzle(kind, band, 12345 + band);
  if (!r) { console.log(kind, band, 'FAIL'); return; }
  const tech = Object.keys(r.techniques).sort((a, b) => r.techniques[b] - r.techniques[a]).slice(0, 3).join(' ');
  console.log(
    kind.padEnd(11), ('band' + band).padEnd(6),
    'clues', String(r.clues).padStart(2),
    'SE', r.se.toFixed(1).padStart(4),
    'solved', r.solved ? 'Y' : 'N',
    'steps', String(r.steps.length).padStart(3),
    'ms', String(Date.now() - t0).padStart(5),
    '|', tech
  );
}

console.log('--- 经典四档 ---');
for (let b = 1; b <= 4; b++) t('classic', b);
console.log('--- 各变种（目标 band 2） ---');
SD.VARIANTS.forEach(v => { if (v.id !== 'classic') t(v.id, 2); });
