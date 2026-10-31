/* 数独工坊 · 人类技巧阶梯与评级（SE 分值口径） */
(function (root) {
  'use strict';
  var SD = root.SD;
  var C = SD.core;
  var BIT = C.BIT, PC = C.PC, FULL = C.FULL, pos = C.pos, shortPos = C.shortPos;
  var ROWS = C.ROWS, COLS = C.COLS;
  function unitsOf(ctx) {
    if (!ctx._units) ctx._units = ROWS.concat(COLS, ctx.regions);
    return ctx._units;
  }

  var TECH = {
    fullHouse: { name: '全宫唯一', se: 1.0, desc: '一个单元里只剩最后一个空格，它必然填剩下的那个数字。' },
    hiddenSingleBox: { name: '隐性唯一（宫）', se: 1.2, desc: '某个数字在一个宫里只有一个格子可以放。' },
    hiddenSingleLine: { name: '隐性唯一（行列）', se: 1.5, desc: '某个数字在一行或一列里只有一个格子可以放。' },
    nakedSingle: { name: '唯余解', se: 2.3, desc: '一个格子的候选数只剩一个，直接填入。' },
    pointing: { name: '区块摒除（指向）', se: 2.6, desc: '某数字在一个宫内只出现在同一行/列，则这条线在宫外的格子都不能填它。' },
    claiming: { name: '区块摒除（声明）', se: 2.8, desc: '某数字在一行/列内只出现在同一个宫，则该宫其余格子都不能填它。' },
    nakedPair: { name: '显性数对', se: 3.0, desc: '同一单元内两格候选完全相同且只有两个数，这两个数被这两格占用。' },
    xWing: { name: 'X-Wing', se: 3.2, desc: '某数字在两行中都只出现在相同的两列，形成一个矩形，矩形的四个角之外该数字在这两列上被排除。' },
    hiddenPair: { name: '隐性数对', se: 3.4, desc: '两个数字在同一单元中都只出现在同样的两个格子，这两格被这两个数字占用。' },
    nakedTriple: { name: '显性三数集', se: 3.6, desc: '同一单元内三格的候选并集只有三个数，这三个数被这三格占用。' },
    swordfish: { name: '剑鱼', se: 3.8, desc: 'X-Wing 的三行版本：某数字在三行中的位置都落在同样的三列内。' },
    jellyfish: { name: '水母', se: 4.0, desc: 'X-Wing 的四行版本：某数字在四行中的位置都落在同样的四列内。' },
    hiddenTriple: { name: '隐性三数集', se: 4.0, desc: '三个数字在同一单元中都只出现在同样的三个格子，这三格被它们占用。' },
    xyWing: { name: 'XY-Wing', se: 4.2, desc: '枢轴格 {x,y} 的两个伙伴分别为 {x,z} 与 {y,z}，同时看到两个伙伴的格子不能填 z。' },
    xyzWing: { name: 'XYZ-Wing', se: 4.4, desc: '枢轴格有三个候选 {x,y,z}，两个伙伴为 {x,z} 与 {y,z}，同时看到这三格的格子不能填 z。' },
    uniqueRect: { name: '唯一矩形', se: 4.6, desc: '四格摆成矩形且都含 {x,y}，其中三格只剩 {x,y}；剩下那格若还多一个 z，z 必被删掉——否则题目会出现两个解。' },
    nakedQuad: { name: '显性四数集', se: 5.0, desc: '同一单元内四格的候选并集只有四个数，这四个数被这四格占用。' },
    contradiction: { name: '反证排除（假设法）', se: 7.0, desc: '假设某格取某个值，若连锁推出矛盾，则该值不成立，取另一个值。' },
    variant: { name: '变种约束排除', se: 4.6, desc: '依据变种附加规则（笼和、温度计、箭头等）排除候选。' }
  };

  function unitName(ctx, u) {
    if (u < 9) return '第' + (u + 1) + '行';
    if (u < 18) return '第' + (u - 8) + '列';
    var rn = ctx.regions[u - 18] ? (u - 17) : (u - 17);
    return (ctx.kind === 'jigsaw' ? '第' + rn + '区' : '第' + rn + '宫');
  }
  function cellList(cells) {
    return cells.map(function (i) { return shortPos(i); }).join('、');
  }
  function maskText(m) {
    var out = [];
    for (var v = 1; v <= 9; v++) if (m & BIT[v]) out.push(v);
    return '{' + out.join('、') + '}';
  }

  function stepPlace(ctx, type, i, v, text, extra) {
    var st = {
      type: type, name: TECH[type].name, se: TECH[type].se, kind: 'place',
      i: i, v: v, cells: [i], digits: [v], text: text
    };
    if (extra) for (var k in extra) st[k] = extra[k];
    return st;
  }
  function stepElim(ctx, type, elims, text, cells, digits) {
    if (!elims.length) return null;
    return {
      type: type, name: TECH[type].name, se: TECH[type].se, kind: 'elim',
      elims: elims, cells: cells || elims.map(function (e) { return e[0]; }),
      digits: digits || [], text: text
    };
  }

  function findFullHouse(ctx, grid, cand) {
    for (var u = 0; u < 27; u++) {
      var unit = unitsOf(ctx)[u], empty = -1, cnt = 0;
      for (var k = 0; k < 9; k++) { if (!grid[unit[k]]) { empty = unit[k]; cnt++; } }
      if (cnt !== 1) continue;
      var m = cand[empty];
      if (PC[m] !== 1) continue;
      var v = C.minVal(m);
      return stepPlace(ctx, 'fullHouse', empty, v,
        unitName(ctx, u) + '只剩 ' + shortPos(empty) + ' 一个空格，因此这里必定填 ' + v + '。');
    }
    return null;
  }

  function findHiddenSingle(ctx, grid, cand, only) {
    var best = null;
    for (var u = 0; u < 27; u++) {
      if (only === 'box' && u < 18) continue;
      if (only === 'line' && u >= 18) continue;
      var unit = unitsOf(ctx)[u];
      for (var v = 1; v <= 9; v++) {
        var hit = -1, n = 0;
        for (var k = 0; k < 9; k++) {
          var i = unit[k];
          if (!grid[i] && (cand[i] & BIT[v])) { hit = i; n++; if (n > 1) break; }
        }
        if (n !== 1) continue;
        var type = u >= 18 ? 'hiddenSingleBox' : 'hiddenSingleLine';
        var st = stepPlace(ctx, type, hit, v,
          '在' + unitName(ctx, u) + '里，数字 ' + v + ' 只能放进 ' + shortPos(hit) +
          '：同一' + (u < 9 ? '行' : u < 18 ? '列' : (ctx.kind === 'jigsaw' ? '区' : '宫')) +
          '的其它空格都被已有的 ' + v + ' 排除了。');
        if (!best || st.se < best.se) best = st;
      }
    }
    return best;
  }

  function findNakedSingle(ctx, grid, cand) {
    for (var i = 0; i < 81; i++) {
      if (grid[i]) continue;
      if (PC[cand[i]] === 1) {
        var v = C.minVal(cand[i]);
        return stepPlace(ctx, 'nakedSingle', i, v,
          shortPos(i) + ' 的候选数只剩 ' + v + '（同行、同列、同宫已排除其余八个数字），直接填入。');
      }
    }
    return null;
  }

  function findPointing(ctx, grid, cand) {
    for (var b = 0; b < 9; b++) {
      var unit = ctx.regions[b];
      for (var v = 1; v <= 9; v++) {
        var rows = {}, cols = {}, cells = [];
        for (var k = 0; k < 9; k++) {
          var i = unit[k];
          if (!grid[i] && (cand[i] & BIT[v])) { rows[C.rIdx(i)] = 1; cols[C.cIdx(i)] = 1; cells.push(i); }
        }
        if (!cells.length) continue;
        var rk = Object.keys(rows), ck = Object.keys(cols);
        var elims = [], lineCells = [];
        if (rk.length === 1) {
          var r = +rk[0];
          for (var c = 0; c < 9; c++) {
            var j = r * 9 + c;
            if (unit.indexOf(j) >= 0) { lineCells.push(j); continue; }
            if (!grid[j] && (cand[j] & BIT[v])) elims.push([j, v]);
          }
          if (elims.length) return stepElim(ctx, 'pointing', elims,
            '数字 ' + v + ' 在' + unitName(ctx, 18 + b) + '里只能出现在第 ' + (r + 1) + ' 行（' + cellList(cells) + '），' +
            '所以第 ' + (r + 1) + ' 行在宫外的这些格子不能是 ' + v + '。', cells.concat(lineCells), [v]);
        }
        if (ck.length === 1) {
          var cc = +ck[0];
          for (var rr = 0; rr < 9; rr++) {
            var j2 = rr * 9 + cc;
            if (unit.indexOf(j2) >= 0) { lineCells.push(j2); continue; }
            if (!grid[j2] && (cand[j2] & BIT[v])) elims.push([j2, v]);
          }
          if (elims.length) return stepElim(ctx, 'pointing', elims,
            '数字 ' + v + ' 在' + unitName(ctx, 18 + b) + '里只能出现在第 ' + (cc + 1) + ' 列（' + cellList(cells) + '），' +
            '所以第 ' + (cc + 1) + ' 列在宫外的这些格子不能是 ' + v + '。', cells.concat(lineCells), [v]);
        }
      }
    }
    return null;
  }

  function findClaiming(ctx, grid, cand) {
    for (var u = 0; u < 18; u++) {
      var unit = unitsOf(ctx)[u];
      for (var v = 1; v <= 9; v++) {
        var regions = {}, cells = [];
        for (var k = 0; k < 9; k++) {
          var i = unit[k];
          if (!grid[i] && (cand[i] & BIT[v])) { regions[C.regionOf(ctx, i)] = 1; cells.push(i); }
        }
        if (!cells.length) continue;
        var keys = Object.keys(regions);
        if (keys.length !== 1) continue;
        var b = +keys[0], region = ctx.regions[b], elims = [], keep = [];
        for (var q = 0; q < 9; q++) {
          var j = region[q];
          if (unit.indexOf(j) >= 0) { keep.push(j); continue; }
          if (!grid[j] && (cand[j] & BIT[v])) elims.push([j, v]);
        }
        if (elims.length) {
          return stepElim(ctx, 'claiming', elims,
            '数字 ' + v + ' 在' + unitName(ctx, u) + '里只能落在' + unitName(ctx, 18 + b) + '（' + cellList(cells) + '），' +
            '所以这个宫里的其它空格不能是 ' + v + '。', cells.concat(keep), [v]);
        }
      }
    }
    return null;
  }

  function combos(n, k, start, out, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (var i = start; i < n; i++) { cur.push(i); combos(n, k, i + 1, out, cur); cur.pop(); }
  }

  function findNakedSet(ctx, grid, cand, size, type) {
    for (var u = 0; u < 27; u++) {
      var unit = unitsOf(ctx)[u], idx = [];
      for (var k = 0; k < 9; k++) { var i = unit[k]; if (!grid[i] && PC[cand[i]] >= 2 && PC[cand[i]] <= size) idx.push(i); }
      if (idx.length < size) continue;
      var cs = []; combos(idx.length, size, 0, cs, []);
      for (var t = 0; t < cs.length; t++) {
        var cells = cs[t].map(function (x) { return idx[x]; });
        var union = 0;
        for (var z = 0; z < cells.length; z++) union |= cand[cells[z]];
        if (PC[union] !== size) continue;
        var elims = [];
        for (var q = 0; q < 9; q++) {
          var j = unit[q];
          if (cells.indexOf(j) >= 0 || grid[j]) continue;
          var hit = cand[j] & union;
          if (!hit) continue;
          for (var v = 1; v <= 9; v++) if (hit & BIT[v]) elims.push([j, v]);
        }
        if (!elims.length) continue;
        return stepElim(ctx, type, elims,
          cellList(cells) + ' 的候选并集只有 ' + maskText(union) + ' 这 ' + size + ' 个数，' +
          '它们被这 ' + size + ' 格占满，因此' + unitName(ctx, u) + '内其它格可以删去这些候选。',
          cells, C.popVals(union));
      }
    }
    return null;
  }

  function findHiddenSet(ctx, grid, cand, size, type) {
    for (var u = 0; u < 27; u++) {
      var unit = unitsOf(ctx)[u], digCells = {};
      for (var v = 1; v <= 9; v++) {
        var arr = [];
        for (var k = 0; k < 9; k++) { var i = unit[k]; if (!grid[i] && (cand[i] & BIT[v])) arr.push(i); }
        digCells[v] = arr;
      }
      var ds = [];
      for (var v2 = 1; v2 <= 9; v2++) if (digCells[v2].length >= 2 && digCells[v2].length <= size) ds.push(v2);
      if (ds.length < size) continue;
      var cs = []; combos(ds.length, size, 0, cs, []);
      for (var t = 0; t < cs.length; t++) {
        var digits = cs[t].map(function (x) { return ds[x]; });
        var set = {};
        for (var z = 0; z < digits.length; z++) digCells[digits[z]].forEach(function (i) { set[i] = 1; });
        var cells = Object.keys(set).map(Number);
        if (cells.length !== size) continue;
        var dmask = 0; digits.forEach(function (d) { dmask |= BIT[d]; });
        var elims = [];
        for (var q = 0; q < cells.length; q++) {
          var extra = cand[cells[q]] & ~dmask;
          for (var vv = 1; vv <= 9; vv++) if (extra & BIT[vv]) elims.push([cells[q], vv]);
        }
        if (!elims.length) continue;
        return stepElim(ctx, type, elims,
          '数字 ' + digits.join('、') + ' 在' + unitName(ctx, u) + '中都只能出现在 ' + cellList(cells) + ' 这 ' + size + ' 格，' +
          '所以这几格只能是 ' + maskText(dmask) + '，其它候选都可以删掉。', cells, digits);
      }
    }
    return null;
  }

  function findFish(ctx, grid, cand, size, type) {
    for (var v = 1; v <= 9; v++) {
      for (var mode = 0; mode < 2; mode++) {
        var lines = mode === 0 ? ROWS : COLS;
        var cands = [];
        for (var i = 0; i < 9; i++) {
          var arr = [];
          for (var k = 0; k < 9; k++) {
            var c = lines[i][k];
            if (!grid[c] && (cand[c] & BIT[v])) arr.push(mode === 0 ? C.cIdx(c) : C.rIdx(c));
          }
          if (arr.length >= 2 && arr.length <= size) cands.push({ i: i, pos: arr });
        }
        if (cands.length < size) continue;
        var cs = []; combos(cands.length, size, 0, cs, []);
        for (var t = 0; t < cs.length; t++) {
          var picked = cs[t].map(function (x) { return cands[x]; });
          var set = {};
          picked.forEach(function (p) { p.pos.forEach(function (x) { set[x] = 1; }); });
          var cols = Object.keys(set).map(Number);
          if (cols.length !== size) continue;
          var elims = [];
          for (var q = 0; q < cols.length; q++) {
            for (var r = 0; r < 9; r++) {
              var cell = mode === 0 ? r * 9 + cols[q] : cols[q] * 9 + r;
              if (picked.some(function (p) { return p.i === r; })) continue;
              if (!grid[cell] && (cand[cell] & BIT[v])) elims.push([cell, v]);
            }
          }
          if (!elims.length) continue;
          var lineNames = picked.map(function (p) { return (mode === 0 ? '第' + (p.i + 1) + '行' : '第' + (p.i + 1) + '列'); }).join('、');
          var targetNames = '第' + cols.map(function (x) { return x + 1; }).join('、') + (mode === 0 ? '列' : '行');
          /* 鱼形的四个角：两条线 × 两个目标位置的交叉点，供高亮用 */
          var corners = [];
          picked.forEach(function (p) {
            cols.forEach(function (x) { corners.push(mode === 0 ? p.i * 9 + x : x * 9 + p.i); });
          });
          return stepElim(ctx, type, elims,
            '数字 ' + v + ' 在' + lineNames + '里都只出现在' + targetNames + '，形成 ' + size + '×' + size +
            ' 的鱼形结构，因此' + (mode === 0 ? '这 ' + size + ' 列' : '这 ' + size + ' 行') +
            '在其它位置的 ' + v + ' 可以删掉。', corners, [v]);
        }
      }
    }
    return null;
  }

  function findXYWing(ctx, grid, cand) {
    var bival = [];
    for (var i = 0; i < 81; i++) if (!grid[i] && PC[cand[i]] === 2) bival.push(i);
    for (var p = 0; p < bival.length; p++) {
      var pivot = bival[p], pm = cand[pivot];
      var xy = C.popVals(pm);
      for (var a = 0; a < bival.length; a++) {
        if (a === p) continue;
        var A = bival[a];
        if (!arePeers(ctx, pivot, A)) continue;
        var am = cand[A] & ~pm;
        if (PC[am] !== 1) continue;
        var zA = C.minVal(am), xCommon = cand[A] & pm;
        if (PC[xCommon] !== 1) continue;
        for (var b = a + 1; b < bival.length; b++) {
          var B = bival[b];
          if (!arePeers(ctx, pivot, B)) continue;
          var bm = cand[B] & ~pm;
          if (PC[bm] !== 1) continue;
          var zB = C.minVal(bm);
          if (zA !== zB) continue;
          if (!(cand[B] & pm)) continue;
          if ((cand[A] & pm) === (cand[B] & pm)) continue;
          var z = zA, elims = [], peersA = C.buildPeers(ctx)[A], peersB = C.buildPeers(ctx)[B];
          for (var t = 0; t < peersA.length; t++) {
            var cell = peersA[t];
            if (cell === pivot || cell === B || grid[cell]) continue;
            if (peersB.indexOf(cell) < 0) continue;
            if (cand[cell] & BIT[z]) elims.push([cell, z]);
          }
          if (!elims.length) continue;
          return stepElim(ctx, 'xyWing', elims,
            '枢轴 ' + shortPos(pivot) + ' 的候选是 ' + maskText(pm) + '，两个伙伴分别是 ' + shortPos(A) + '（' + maskText(cand[A]) + '）与 ' +
            shortPos(B) + '（' + maskText(cand[B]) + '）。无论枢轴取哪个值，' + z + ' 都会落在其中一个伙伴上，' +
            '因此同时看到两个伙伴的格子不能是 ' + z + '。', [pivot, A, B], [z]);
        }
      }
    }
    return null;
  }

  /* XYZ-Wing：枢轴三候选 {x,y,z}，两翼 {x,z} / {y,z}，同时看到三格的格子不能是 z */
  function findXYZWing(ctx, grid, cand) {
    var tri = [], bi = [], i;
    for (i = 0; i < 81; i++) {
      if (grid[i]) continue;
      var n = PC[cand[i]];
      if (n === 3) tri.push(i);
      else if (n === 2) bi.push(i);
    }
    var peersAll = C.buildPeers(ctx);
    for (var p = 0; p < tri.length; p++) {
      var pivot = tri[p], pm = cand[pivot];
      var wings = [];
      for (i = 0; i < bi.length; i++) {
        var b = bi[i];
        if ((cand[b] & ~pm) !== 0) continue;          /* 两翼必须是枢轴候选的子集 */
        if (!arePeers(ctx, pivot, b)) continue;
        wings.push(b);
      }
      for (var a = 0; a < wings.length; a++) {
        for (var c2 = a + 1; c2 < wings.length; c2++) {
          var A = wings[a], B = wings[c2];
          if ((cand[A] | cand[B]) !== pm) continue;    /* 两翼合起来正好覆盖三个候选 */
          var common = cand[A] & cand[B];
          if (PC[common] !== 1) continue;              /* 共有的那个才是要删的 z */
          var z = C.minVal(common);
          var elims = [];
          for (var t = 0; t < peersAll[A].length; t++) {
            var cell = peersAll[A][t];
            if (cell === pivot || cell === B || grid[cell]) continue;
            if (peersAll[B].indexOf(cell) < 0 || peersAll[pivot].indexOf(cell) < 0) continue;
            if (cand[cell] & BIT[z]) elims.push([cell, z]);
          }
          if (!elims.length) continue;
          return stepElim(ctx, 'xyzWing', elims,
            '枢轴 ' + shortPos(pivot) + ' 的候选是 ' + maskText(pm) + '，两翼 ' + shortPos(A) + '（' + maskText(cand[A]) +
            '）与 ' + shortPos(B) + '（' + maskText(cand[B]) + '）都看到枢轴。无论枢轴取 ' + z + ' 还是别的，' + z +
            ' 一定落在枢轴或某一翼上，因此同时看到这三格的格子不能是 ' + z + '。',
            [pivot, A, B], [z]);
        }
      }
    }
    return null;
  }

  /* 唯一矩形（Type 1）：四格成矩形，三格只剩 {x,y}，第四格多一个 z。
     若第四格取了 x 或 y，四格就构成可互换的双解，与唯一解矛盾 → 第四格只能是 z。 */
  function findUniqueRect(ctx, grid, cand) {
    for (var r1 = 0; r1 < 8; r1++) {
      for (var r2 = r1 + 1; r2 < 9; r2++) {
        if (((r1 / 3) | 0) !== ((r2 / 3) | 0)) continue;   /* 两行同带，四格才只落在两个宫 */
        for (var c1 = 0; c1 < 8; c1++) {
          for (var c2 = c1 + 1; c2 < 9; c2++) {
            if (((c1 / 3) | 0) === ((c2 / 3) | 0)) continue;
            var q = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            var k, bad = false;
            for (k = 0; k < 4; k++) if (grid[q[k]]) { bad = true; break; }
            if (bad) continue;
            var tightMasks = [], extraCell = -1, extra = 0;
            for (k = 0; k < 4; k++) {
              var m = cand[q[k]];
              if (PC[m] === 2) tightMasks.push(m);
              else if (PC[m] === 3 && extraCell < 0) { extraCell = q[k]; extra = m; }
              else { bad = true; break; }
            }
            if (bad || tightMasks.length !== 3 || extraCell < 0) continue;
            if (tightMasks[1] !== tightMasks[0] || tightMasks[2] !== tightMasks[0]) continue;
            var pair = tightMasks[0];
            if ((extra & pair) !== pair) continue;          /* 第四格必须也含这两个数 */
            var z = C.minVal(extra & ~pair);
            if (!z) continue;
            var el = [];
            for (var v = 1; v <= 9; v++) if (pair & BIT[v]) el.push([extraCell, v]);
            return stepElim(ctx, 'uniqueRect', el,
              shortPos(q[0]) + '、' + shortPos(q[1]) + '、' + shortPos(q[2]) + '、' + shortPos(q[3]) +
              ' 四格摆成矩形，其中三格只剩 ' + maskText(pair) + '。若 ' + shortPos(extraCell) +
              ' 也取这两个数之一，这个矩形就会形成"两组解可以整体互换"的死局，与唯一解矛盾；' +
              '所以 ' + shortPos(extraCell) + ' 只能是 ' + z + '，另两个候选要删掉。',
              q, [z]);
          }
        }
      }
    }
    return null;
  }

  var peerCache = {};  function arePeers(ctx, a, b) {
    var key = ctx.kind + ':' + (ctx._id || (ctx._id = Math.random()));
    if (!ctx._peerSet) {
      var ps = C.buildPeers(ctx), set = {};
      for (var i = 0; i < 81; i++) { set[i] = {}; for (var k = 0; k < ps[i].length; k++) set[i][ps[i][k]] = 1; }
      ctx._peerSet = set;
    }
    return !!ctx._peerSet[a][b];
  }

  function findContradiction(ctx, grid, cand, peers) {
    var pool = [];
    for (var i = 0; i < 81; i++) if (!grid[i] && PC[cand[i]] === 2) pool.push(i);
    var limit = Math.min(pool.length, 26);
    for (var t = 0; t < limit; t++) {
      var idx = pool[t], vals = C.popVals(cand[idx]);
      if (vals.length !== 2) continue;
      var res = [], bad = [];
      for (var k = 0; k < 2; k++) {
        var g2 = Uint8Array.from(grid);
        g2[idx] = vals[k];
        var c2 = C.baseCand(ctx, peers, g2);
        var ok = !!c2 && C.propagate(ctx, peers, g2, c2);
        res.push(ok); bad.push(ok ? null : firstDead(g2, peers, ctx));
      }
      if (res[0] === res[1]) continue;
      var good = res[0] ? vals[0] : vals[1], badV = res[0] ? vals[1] : vals[0];
      var dead = res[0] ? bad[1] : bad[0];
      var why = dead >= 0 ? shortPos(dead) + ' 将没有任何可填数字' : '后续连锁排除出现矛盾';
      return stepPlace(ctx, 'contradiction', idx, good,
        '假设 ' + shortPos(idx) + ' 填 ' + badV + '，会连锁推出 ' + why + '，所以这种假设不成立；' +
        shortPos(idx) + ' 只能是 ' + good + '。');
    }
    return null;
  }

  function firstDead(grid, peers, ctx) {
    var cand = C.baseCand(ctx, peers, grid);
    if (!cand) {
      for (var i = 0; i < 81; i++) {
        if (grid[i]) continue;
        var used = 0, ps = peers[i];
        for (var k = 0; k < ps.length; k++) { var v = grid[ps[k]]; if (v) used |= BIT[v]; }
        if ((FULL & ~used) === 0) return i;
      }
      return -1;
    }
    for (var q = 0; q < 81; q++) if (!grid[q] && !cand[q]) return q;
    return -1;
  }

  function findStep(ctx, grid, cand) {
    var st;
    if ((st = findFullHouse(ctx, grid, cand))) return st;
    if ((st = findHiddenSingle(ctx, grid, cand))) return st;
    if ((st = findNakedSingle(ctx, grid, cand))) return st;
    if ((st = findPointing(ctx, grid, cand))) return st;
    if ((st = findClaiming(ctx, grid, cand))) return st;
    if ((st = findNakedSet(ctx, grid, cand, 2, 'nakedPair'))) return st;
    if ((st = findFish(ctx, grid, cand, 2, 'xWing'))) return st;
    if ((st = findHiddenSet(ctx, grid, cand, 2, 'hiddenPair'))) return st;
    if ((st = findNakedSet(ctx, grid, cand, 3, 'nakedTriple'))) return st;
    if ((st = findFish(ctx, grid, cand, 3, 'swordfish'))) return st;
    if ((st = findFish(ctx, grid, cand, 4, 'jellyfish'))) return st;
    if ((st = findHiddenSet(ctx, grid, cand, 3, 'hiddenTriple'))) return st;
    if ((st = findXYWing(ctx, grid, cand))) return st;
    if ((st = findXYZWing(ctx, grid, cand))) return st;
    if ((st = findUniqueRect(ctx, grid, cand))) return st;
    if ((st = findNakedSet(ctx, grid, cand, 4, 'nakedQuad'))) return st;
    if ((st = findContradiction(ctx, grid, cand, C.buildPeers(ctx)))) return st;
    return null;
  }

  function applyStep(ctx, grid, cand, peers, st) {
    if (st.kind === 'place') {
      if (grid[st.i]) return false;
      grid[st.i] = st.v;
      cand[st.i] = 0;
      var ps = peers[st.i];
      for (var k = 0; k < ps.length; k++) {
        var p = ps[k];
        if (!grid[p]) cand[p] &= ~BIT[st.v];
      }
      return true;
    }
    var any = false;
    for (var e = 0; e < st.elims.length; e++) {
      var i = st.elims[e][0], v = st.elims[e][1];
      if (cand[i] & BIT[v]) { cand[i] &= ~BIT[v]; any = true; }
    }
    return any;
  }

  /* 按"技巧类型"直接找：不做优先级判断，只看当前局面里这种技巧成不成立。
     用于专项训练——教学上只要这个技巧在盘面上可用即可，不必它是唯一选择。 */
  function findType(ctx, grid, cand, type) {
    switch (type) {
      case 'fullHouse': return findFullHouse(ctx, grid, cand);
      case 'hiddenSingleBox': return findHiddenSingle(ctx, grid, cand, 'box');
      case 'hiddenSingleLine': return findHiddenSingle(ctx, grid, cand, 'line');
      case 'nakedSingle': return findNakedSingle(ctx, grid, cand);
      case 'pointing': return findPointing(ctx, grid, cand);
      case 'claiming': return findClaiming(ctx, grid, cand);
      case 'nakedPair': return findNakedSet(ctx, grid, cand, 2, 'nakedPair');
      case 'xWing': return findFish(ctx, grid, cand, 2, 'xWing');
      case 'hiddenPair': return findHiddenSet(ctx, grid, cand, 2, 'hiddenPair');
      case 'nakedTriple': return findNakedSet(ctx, grid, cand, 3, 'nakedTriple');
      case 'swordfish': return findFish(ctx, grid, cand, 3, 'swordfish');
      case 'jellyfish': return findFish(ctx, grid, cand, 4, 'jellyfish');
      case 'hiddenTriple': return findHiddenSet(ctx, grid, cand, 3, 'hiddenTriple');
      case 'xyWing': return findXYWing(ctx, grid, cand);
      case 'xyzWing': return findXYZWing(ctx, grid, cand);
      case 'uniqueRect': return findUniqueRect(ctx, grid, cand);
      case 'nakedQuad': return findNakedSet(ctx, grid, cand, 4, 'nakedQuad');
    }
    return null;
  }

  /* 沿正常解题路径逐状态扫描，返回第一次能观察到该技巧的局面快照 */
  function scanTech(ctx, puzzle, type) {
    var peers = C.buildPeers(ctx);
    var grid = Uint8Array.from(puzzle);
    var cand = C.baseCand(ctx, peers, grid);
    if (!cand || !C.pruneFix(ctx, grid, cand)) return null;
    for (var g = 0; g < 320; g++) {
      var hit = findType(ctx, grid, cand, type);
      if (hit) return { step: hit, grid: Array.from(grid) };
      var st = findStep(ctx, grid, cand);
      if (!st || !applyStep(ctx, grid, cand, peers, st)) break;
      if (!C.pruneFix(ctx, grid, cand)) break;
    }
    return null;
  }

  /* 笼和推理的难度底分：两格极值、45 法则、组合枚举都不在白名单技巧里，
     但它们确实要动脑，所以带笼的题至少按"中低"算。 */
  var CAGE_SE = 2.4;

  function rate(ctx, puzzle, opts) {
    var peers = C.buildPeers(ctx);
    var grid = Uint8Array.from(puzzle);
    var cand = C.baseCand(ctx, peers, grid);
    var empty0 = 0;
    for (var q0 = 0; q0 < 81; q0++) if (!grid[q0]) empty0++;
    if (!cand || !C.pruneFix(ctx, grid, cand)) {
      return { solved: false, steps: [], se: 99, techniques: {}, invalid: true, left: empty0, topType: null, topName: null };
    }
    var steps = [], techniques = {}, se = 0, guard = 0, stuck = false;
    var topType = null, topName = null;
    while (guard++ < 300) {
      var empty = 0;
      for (var q = 0; q < 81; q++) if (!grid[q]) empty++;
      if (!empty) break;
      var st = findStep(ctx, grid, cand);
      if (!st) { stuck = true; break; }
      if (!applyStep(ctx, grid, cand, peers, st)) { stuck = true; break; }
      if (!C.pruneFix(ctx, grid, cand)) { stuck = true; break; }
      steps.push(st);
      techniques[st.name] = (techniques[st.name] || 0) + 1;
      if (st.se > se) { se = st.se; topType = st.type; topName = st.name; }
    }
    var done = true, left = 0;
    for (var z = 0; z < 81; z++) if (!grid[z]) { done = false; left++; }
    if (!done) stuck = true;
    /* 杀手 / 混合：笼内组合枚举（45 法则、两格极值）由 pruneFix 在每次落子后"顺带"完成，
       不计入任何一步技巧，所以纯杀手题会一路被算成 SE 1.2（极简）——与实际体感明显不符。
       这里给笼和推理一个底分：只有真的带笼、且路径本身没超过它时才抬到 2.4（中低）。 */
    var cageBase = null;
    if (done && ctx.cages && ctx.cages.length && se < CAGE_SE) {
      cageBase = se; se = CAGE_SE;      /* 只抬分数，不改"最难一步"——那一步还是路径上真实的技巧 */
    }
    /* 说明：SE = 解题路径上最难一步的技巧权重，所以它和 steps 里的最高分必然一致。
       未解完时不再虚增分数，只标 stuck，由调用方丢弃这类题。 */
    return {
      solved: done, steps: steps, se: done ? se : Math.max(se, 4.8), techniques: techniques,
      cageBase: cageBase,
      left: left, stuck: stuck, topType: done ? topType : null, topName: done ? topName : null
    };
  }

  function variantText(ctx, diff) {
    var rules = [];
    if (ctx.cages.length) rules.push('笼内数字不重复且和等于标注值');
    if (ctx.thermos.length) rules.push('温度计上数字严格递增');
    if (ctx.arrows.length) rules.push('圆圈等于箭身数字之和');
    if (ctx.renbans.length) rules.push('线内为连续数字集合');
    if (ctx.whispers.length) rules.push('相邻格数字相差至少 5');
    if (ctx.sandwichRows.some(function (x) { return x != null; }) || ctx.sandwichCols.some(function (x) { return x != null; })) rules.push('三明治提示给 1 与 9 之间的数字之和');
    if (ctx.lks.length) rules.push('小杀手斜线数字之和');
    return '依据变种规则（' + rules.join('；') + '）进一步缩小这些格子的候选数：' +
      diff.slice(0, 8).map(function (e) { return shortPos(e[0]) + ' 去掉 ' + e[1]; }).join('，') +
      (diff.length > 8 ? ' 等 ' + diff.length + ' 处' : '') + '。';
  }

  SD.tech = TECH;
  SD.rate = rate;
  SD.findStep = findStep;
  SD.findType = findType;
  SD.scanTech = scanTech;
  SD.applyStep = applyStep;
})(typeof globalThis !== 'undefined' ? globalThis : this);
