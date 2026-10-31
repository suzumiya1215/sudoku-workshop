/* 数独工坊 · 核心引擎：约束模型 / 候选传播 / 求解 / 变种 */
(function (root) {
  'use strict';
  var SD = root.SD || (root.SD = {});

  var ROWS = [], COLS = [], BOXES = [], UNITS = [];
  for (var r = 0; r < 9; r++) { var a = []; for (var c = 0; c < 9; c++) a.push(r * 9 + c); ROWS.push(a); UNITS.push(a); }
  for (var c2 = 0; c2 < 9; c2++) { var b = []; for (var r2 = 0; r2 < 9; r2++) b.push(r2 * 9 + c2); COLS.push(b); UNITS.push(b); }
  for (var bx = 0; bx < 9; bx++) {
    var g = [], br = ((bx / 3) | 0) * 3, bc = (bx % 3) * 3;
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) g.push((br + i) * 9 + bc + j);
    BOXES.push(g); UNITS.push(g);
  }

  var BIT = [0]; for (var v = 1; v <= 9; v++) BIT[v] = 1 << (v - 1);
  var FULL = 0x1FF;
  var PC = new Uint8Array(512);
  for (var k = 1; k < 512; k++) PC[k] = PC[k >> 1] + (k & 1);
  function lowBit(m) { return m & -m; }
  function bitVal(b) { var v = 1; while (b > 1) { b >>= 1; v++; } return v; }
  function minVal(m) { for (var v = 1; v <= 9; v++) if (m & BIT[v]) return v; return 0; }
  function maxVal(m) { for (var v = 9; v >= 1; v--) if (m & BIT[v]) return v; return 0; }
  function popVals(m) { var out = []; for (var v = 1; v <= 9; v++) if (m & BIT[v]) out.push(v); return out; }

  var DL = 0;
  function setDeadline(ms) { DL = ms > 0 ? Date.now() + ms : 0; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  function rIdx(i) { return (i / 9) | 0; }
  function cIdx(i) { return i % 9; }
  function pos(i) { return '第' + (rIdx(i) + 1) + '行第' + (cIdx(i) + 1) + '列'; }
  function shortPos(i) { return 'R' + (rIdx(i) + 1) + 'C' + (cIdx(i) + 1); }

  /* ---------------- 上下文（变种） ---------------- */
  function newCtx(kind) {
    return {
      kind: kind || 'classic',
      regions: BOXES.slice(),
      pairs: [],
      diag: false,
      cages: [],      // {cells:[], sum:number}
      thermos: [],    // [cells...]
      arrows: [],     // {circle:i, cells:[]}
      renbans: [],
      whispers: [],
      sandwichRows: [null, null, null, null, null, null, null, null, null],
      sandwichCols: [null, null, null, null, null, null, null, null, null],
      lks: []         // {cells:[], sum, side:'top'|'left'|'right'|'bottom', idx}
    };
  }

  function buildPeers(ctx) {
    if (ctx._peers) return ctx._peers;
    var p = [], i;
    for (i = 0; i < 81; i++) p.push([]);
    function link(a, b) { if (p[a].indexOf(b) < 0) { p[a].push(b); p[b].push(a); } }
    for (var u = 0; u < 9; u++) {
      var sets = [ROWS[u], COLS[u], ctx.regions[u]];
      for (var s = 0; s < 3; s++) {
        var unit = sets[s];
        for (var x = 0; x < 9; x++) for (var y = x + 1; y < 9; y++) link(unit[x], unit[y]);
      }
    }
    if (ctx.diag) {
      for (var d = 0; d < 9; d++) for (var e = d + 1; e < 9; e++) { link(d * 9 + d, e * 9 + e); link(d * 9 + 8 - d, e * 9 + 8 - e); }
    }
    for (var q = 0; q < ctx.pairs.length; q++) link(ctx.pairs[q][0], ctx.pairs[q][1]);
    ctx._peers = p;
    return p;
  }

  function regionOf(ctx, i) {
    for (var k = 0; k < 9; k++) if (ctx.regions[k].indexOf(i) >= 0) return k;
    return 0;
  }

  /* ---------------- 候选数 ---------------- */
  function baseCand(ctx, peers, grid) {
    var cand = new Uint16Array(81);
    for (var i = 0; i < 81; i++) {
      if (grid[i]) continue;
      var used = 0, ps = peers[i];
      for (var k = 0; k < ps.length; k++) { var v = grid[ps[k]]; if (v) used |= BIT[v]; }
      var m = FULL & ~used;
      if (!m) return null;
      cand[i] = m;
    }
    return cand;
  }

  /* ---------------- 变种约束剪枝 ---------------- */
  function pruneAll(ctx, grid, cand, mark) {
    if (!pruneCages(ctx, grid, cand, mark)) return false;
    if (!pruneThermos(ctx, grid, cand, mark)) return false;
    if (!pruneArrows(ctx, grid, cand, mark)) return false;
    if (!pruneLines(ctx, grid, cand, mark)) return false;
    if (!pruneSandwich(ctx, grid, cand, mark)) return false;
    if (!pruneLittleKiller(ctx, grid, cand, mark)) return false;
    return true;
  }

  function setMask(cand, i, nm, mark) {
    if (nm === cand[i]) return true;
    if (!nm) return false;
    cand[i] = nm;
    if (mark) mark();
    return true;
  }

  function cageFeasible(vals, sum) {
    /* vals: 每格可选值数组；返回每格"能出现在某个可行组合里"的位掩码。
       无可行组合 -> null；搜索被截断（结果不可信）-> 'skip'，调用方放弃这次剪枝。
       注意：截断绝不能当成"不可行"，否则会把可解盘判成矛盾。 */
    var n = vals.length, used = {}, path = [], allow = [], ok = false, truncated = false, nodes = 0;
    var CAP = 30000;
    for (var i = 0; i < n; i++) allow.push(0);
    function dfs(k, s) {
      if (truncated) return;
      if (++nodes > CAP) { truncated = true; return; }
      if (k === n) {
        if (s === sum) {
          ok = true;
          for (var i2 = 0; i2 < n; i2++) allow[i2] |= BIT[path[i2]];
        }
        return;
      }
      var rem = n - k - 1, maxRest = 0, m = 9;
      for (var w = 0; w < rem; w++) maxRest += m--;
      var list = vals[k];
      for (var t = 0; t < list.length; t++) {
        var v = list[t];
        if (used[v]) continue;
        if (s + v + rem > sum) continue;
        if (s + v + maxRest < sum) continue;
        used[v] = 1; path[k] = v;
        dfs(k + 1, s + v);
        used[v] = 0;
        if (truncated) return;
      }
    }
    dfs(0, 0);
    if (ok) return allow;
    return truncated ? 'skip' : null;
  }

  function pruneCages(ctx, grid, cand, mark) {
    for (var ci = 0; ci < ctx.cages.length; ci++) {
      var cage = ctx.cages[ci], fs = 0, empties = [], vals = [];
      for (var k = 0; k < cage.cells.length; k++) {
        var i = cage.cells[k];
        if (grid[i]) fs += grid[i];
        else { empties.push(i); vals.push(popVals(cand[i])); }
      }
      if (!empties.length) { if (fs !== cage.sum) return false; continue; }
      var need = cage.sum - fs;
      if (need < 1) return false;
      var allow = cageFeasible(vals, need);
      if (allow === 'skip') continue;
      if (!allow) return false;
      for (var e = 0; e < empties.length; e++) {
        var nm = cand[empties[e]] & allow[e];
        if (!setMask(cand, empties[e], nm, mark)) return false;
      }
    }
    return true;
  }

  function chainBounds(cells, cand, grid) {
    var n = cells.length, lo = [], hi = [], i;
    for (i = 0; i < n; i++) {
      if (grid[cells[i]]) { lo.push(grid[cells[i]]); hi.push(grid[cells[i]]); }
      else { lo.push(minVal(cand[cells[i]])); hi.push(maxVal(cand[cells[i]])); }
    }
    for (var pass = 0; pass < 6; pass++) {
      for (i = 1; i < n; i++) { var a = lo[i - 1] + 1; if (a > lo[i]) lo[i] = a; }
      for (i = n - 2; i >= 0; i--) { var b = hi[i + 1] - 1; if (b < hi[i]) hi[i] = b; }
    }
    return { lo: lo, hi: hi };
  }

  function pruneThermos(ctx, grid, cand, mark) {
    for (var t = 0; t < ctx.thermos.length; t++) {
      var cells = ctx.thermos[t], bounds = chainBounds(cells, cand, grid);
      for (var i = 0; i < cells.length; i++) {
        if (bounds.lo[i] > bounds.hi[i]) return false;
        if (grid[cells[i]]) continue;
        var nm = 0;
        for (var v = bounds.lo[i]; v <= bounds.hi[i]; v++) if (cand[cells[i]] & BIT[v]) nm |= BIT[v];
        if (!setMask(cand, cells[i], nm, mark)) return false;
      }
    }
    return true;
  }

  function pruneArrows(ctx, grid, cand, mark) {
    for (var a = 0; a < ctx.arrows.length; a++) {
      var ar = ctx.arrows[a], cells = ar.cells, n = cells.length, sumLo = 0, sumHi = 0, fixed = 0, allFixed = true;
      var lo = [], hi = [], i;
      for (i = 0; i < n; i++) {
        var c = cells[i];
        if (grid[c]) { lo.push(grid[c]); hi.push(grid[c]); fixed += grid[c]; }
        else { lo.push(minVal(cand[c])); hi.push(maxVal(cand[c])); allFixed = false; }
        sumLo += lo[i]; sumHi += hi[i];
      }
      var circ = ar.circle;
      if (grid[circ]) {
        var sv = grid[circ];
        if (sv < sumLo || sv > sumHi) return false;
        if (allFixed && sv !== fixed) return false;
        for (i = 0; i < n; i++) {
          if (grid[cells[i]]) continue;
          var loOther = sumLo - lo[i], hiOther = sumHi - hi[i];
          var nm = 0;
          for (var v = 1; v <= 9; v++) {
            if (!(cand[cells[i]] & BIT[v])) continue;
            var rest = sv - v;
            if (rest >= loOther && rest <= hiOther) nm |= BIT[v];
          }
          if (!setMask(cand, cells[i], nm, mark)) return false;
        }
      } else {
        var cm = 0;
        for (var cv = 1; cv <= 9; cv++) if ((cand[circ] & BIT[cv]) && cv >= sumLo && cv <= sumHi) cm |= BIT[cv];
        if (!setMask(cand, circ, cm, mark)) return false;
        for (i = 0; i < n; i++) {
          if (grid[cells[i]]) continue;
          var loO = sumLo - lo[i], hiO = sumHi - hi[i];
          var nm2 = 0;
          for (var v2 = 1; v2 <= 9; v2++) {
            if (!(cand[cells[i]] & BIT[v2])) continue;
            if (hiO >= 1 && v2 + loO <= 9 && v2 + hiO >= minVal(cand[circ])) nm2 |= BIT[v2];
          }
          if (!setMask(cand, cells[i], nm2, mark)) return false;
        }
      }
    }
    return true;
  }

  function renbanWindows(cells, cand, grid, n) {
    var okStarts = [], s, i;
    for (s = 1; s + n - 1 <= 9; s++) {
      var good = true;
      for (i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (grid[c]) { if (grid[c] < s || grid[c] > s + n - 1) { good = false; break; } }
        else {
          var win = 0;
          for (var v = s; v < s + n; v++) win |= BIT[v];
          if (!(cand[c] & win)) { good = false; break; }
        }
      }
      if (good) okStarts.push(s);
    }
    return okStarts;
  }

  function pruneLines(ctx, grid, cand, mark) {
    var i, t;
    for (t = 0; t < ctx.renbans.length; t++) {
      var cells = ctx.renbans[t], n = cells.length, starts = renbanWindows(cells, cand, grid, n);
      if (!starts.length) return false;
      var allow = 0;
      for (var s = 0; s < starts.length; s++) for (var v = starts[s]; v < starts[s] + n; v++) allow |= BIT[v];
      for (i = 0; i < cells.length; i++) {
        if (grid[cells[i]]) continue;
        if (!setMask(cand, cells[i], cand[cells[i]] & allow, mark)) return false;
      }
    }
    for (t = 0; t < ctx.whispers.length; t++) {
      var w = ctx.whispers[t];
      for (i = 0; i < w.length; i++) {
        var nb = [];
        if (i > 0) nb.push(w[i - 1]);
        if (i < w.length - 1) nb.push(w[i + 1]);
        for (var q = 0; q < nb.length; q++) {
          if (!grid[w[i]]) {
            var nm = 0, vals = popVals(cand[w[i]]);
            for (var k = 0; k < vals.length; k++) {
              var vv = vals[k], ok = true;
              if (grid[nb[q]]) { if (Math.abs(grid[nb[q]] - vv) < 5) ok = false; }
              else {
                var has = false, nv = popVals(cand[nb[q]]);
                for (var z = 0; z < nv.length; z++) if (Math.abs(nv[z] - vv) >= 5) { has = true; break; }
                if (!has) ok = false;
              }
              if (ok) nm |= BIT[vv];
            }
            if (!setMask(cand, w[i], nm, mark)) return false;
          }
        }
      }
    }
    return true;
  }

  function lineFeasibleSum(cells, cand, grid, target, skip) {
    var lo = 0, hi = 0;
    for (var i = 0; i < cells.length; i++) {
      if (i === skip) continue;
      var c = cells[i];
      if (grid[c]) { lo += grid[c]; hi += grid[c]; }
      else { lo += minVal(cand[c]); hi += maxVal(cand[c]); }
    }
    return { lo: lo, hi: hi };
  }

  function pruneSandwich(ctx, grid, cand, mark) {
    var lines = [], i;
    for (i = 0; i < 9; i++) if (ctx.sandwichRows[i] != null) lines.push({ cells: ROWS[i], sum: ctx.sandwichRows[i] });
    for (i = 0; i < 9; i++) if (ctx.sandwichCols[i] != null) lines.push({ cells: COLS[i], sum: ctx.sandwichCols[i] });
    for (var L = 0; L < lines.length; L++) {
      var cells = lines[L].cells, want = lines[L].sum;
      var pos1 = [], pos9 = [], fixed1 = -1, fixed9 = -1;
      for (i = 0; i < 9; i++) {
        if (grid[cells[i]] === 1) fixed1 = i;
        if (grid[cells[i]] === 9) fixed9 = i;
        if (!grid[cells[i]]) {
          if (cand[cells[i]] & BIT[1]) pos1.push(i);
          if (cand[cells[i]] & BIT[9]) pos9.push(i);
        }
      }
      if (fixed1 >= 0 && fixed9 >= 0) continue;
      if (fixed1 >= 0) pos1 = [fixed1];
      if (fixed9 >= 0) pos9 = [fixed9];
      var ok1 = {}, ok9 = {};
      for (var a = 0; a < pos1.length; a++) {
        for (var b = 0; b < pos9.length; b++) {
          var p = pos1[a], q = pos9[b];
          if (p === q) continue;
          var lo = 0, hi = 0;
          for (i = Math.min(p, q) + 1; i < Math.max(p, q); i++) {
            var c = cells[i];
            if (grid[c]) { lo += grid[c]; hi += grid[c]; }
            else { lo += minVal(cand[c]); hi += maxVal(cand[c]); }
          }
          if (want >= lo && want <= hi) { ok1[p] = 1; ok9[q] = 1; }
        }
      }
      for (i = 0; i < 9; i++) {
        var cb = cand[cells[i]];
        if (!cb) continue;
        if (cb & BIT[1] && !ok1[i]) { if (!setMask(cand, cells[i], cb & ~BIT[1], mark)) return false; }
        cb = cand[cells[i]];
        if (cb & BIT[9] && !ok9[i]) { if (!setMask(cand, cells[i], cb & ~BIT[9], mark)) return false; }
      }
    }
    return true;
  }

  function pruneLittleKiller(ctx, grid, cand, mark) {
    for (var k = 0; k < ctx.lks.length; k++) {
      var lk = ctx.lks[k], cells = lk.cells;
      var b = lineFeasibleSum(cells, cand, grid, lk.sum, -1);
      if (b.lo > lk.sum || b.hi < lk.sum) return false;
      for (var i = 0; i < cells.length; i++) {
        if (grid[cells[i]]) continue;
        var o = lineFeasibleSum(cells, cand, grid, lk.sum, i);
        var nm = 0;
        for (var v = 1; v <= 9; v++) {
          if (!(cand[cells[i]] & BIT[v])) continue;
          var s = v + o.lo;
          if (s <= lk.sum && v + o.hi >= lk.sum) nm |= BIT[v];
        }
        if (!setMask(cand, cells[i], nm, mark)) return false;
      }
    }
    return true;
  }

  /* ---------------- 传播与求解 ---------------- */
  function place(grid, cand, peers, i, v) {
    grid[i] = v; cand[i] = 0;
    var ps = peers[i];
    for (var k = 0; k < ps.length; k++) {
      var p = ps[k];
      if (grid[p]) continue;
      cand[p] &= ~BIT[v];
      if (!cand[p]) return false;
    }
    return true;
  }

  function pruneFix(ctx, grid, cand) {
    var changed = true, guard = 0;
    while (changed && guard++ < 24) {
      changed = false;
      if (!pruneAll(ctx, grid, cand, function () { changed = true; })) return false;
    }
    return true;
  }

  function propagate(ctx, peers, grid, cand) {
    var guard = 0, changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < 81; i++) {
        if (grid[i]) continue;
        var m = cand[i];
        if (!m) return false;
        if (!(m & (m - 1))) {
          if (!place(grid, cand, peers, i, bitVal(m))) return false;
          changed = true;
        }
      }
      if (!pruneAll(ctx, grid, cand, function () { changed = true; })) return false;
      if (++guard > 30) break;
    }
    return true;
  }

  function candidates(ctx, peers, grid) {
    var cand = baseCand(ctx, peers, grid);
    if (!cand) return null;
    if (!pruneFix(ctx, grid, cand)) return null;
    return cand;
  }

  function countSolutions(ctx, peers, puzzle, limit, nodeCap) {
    var count = 0, nodes = 0, aborted = false, cap = nodeCap || 260000;
    function rec(grid) {
      if (aborted) return;
      if (nodes++ > cap) { aborted = true; return; }
      if (DL && (nodes & 127) === 0 && Date.now() > DL) { aborted = true; return; }
      var cand = baseCand(ctx, peers, grid);
      if (!cand) return;
      if (!propagate(ctx, peers, grid, cand)) return;
      var best = -1, bestN = 10, i, n;
      for (i = 0; i < 81; i++) {
        if (grid[i]) continue;
        n = PC[cand[i]];
        if (!n) return;
        if (n < bestN) { bestN = n; best = i; if (n === 1) break; }
      }
      if (best < 0) { count++; return; }
      var m = cand[best];
      while (m) {
        var b = lowBit(m); m ^= b;
        var g2 = Uint8Array.from(grid);
        g2[best] = bitVal(b);
        rec(g2);
        if (count >= limit) return;
      }
    }
    rec(Uint8Array.from(puzzle));
    return aborted ? -1 : count;
  }

  function solveAny(ctx, peers, puzzle, rng, nodeCap) {
    var out = null, nodes = 0, cap = nodeCap || 120000;
    var order = rng || Math.random;
    function rec(grid) {
      if (out) return;
      if (nodes++ > cap) return;
      if (DL && (nodes & 127) === 0 && Date.now() > DL) return;
      var cand = baseCand(ctx, peers, grid);
      if (!cand) return;
      if (!propagate(ctx, peers, grid, cand)) return;
      var best = -1, bestN = 10, i, n;
      for (i = 0; i < 81; i++) {
        if (grid[i]) continue;
        n = PC[cand[i]];
        if (!n) return;
        if (n < bestN) { bestN = n; best = i; if (n === 1) break; }
      }
      if (best < 0) { out = grid; return; }
      var vals = shuffle(popVals(cand[best]), order);
      for (var k = 0; k < vals.length; k++) {
        var g2 = Uint8Array.from(grid);
        g2[best] = vals[k];
        rec(g2);
        if (out) return;
      }
    }
    rec(Uint8Array.from(puzzle));
    return out;
  }

  function generateFull(ctx, rng, tries) {
    var peers = buildPeers(ctx);
    var n = tries || 30;
    for (var t = 0; t < n; t++) {
      var g = solveAny(ctx, peers, new Uint8Array(81), rng);
      if (g) return g;
      if (DL) return null;            /* 已有截止时间说明是被主动打断的，别再空转 */
    }
    return null;
  }

  function countClues(p) { var n = 0; for (var i = 0; i < 81; i++) if (p[i]) n++; return n; }

  function digHoles(ctx, peers, solution, targetClues, rng, symmetric) {
    var p = Uint8Array.from(solution);
    var order = shuffle([...Array(81).keys()], rng);
    for (var k = 0; k < order.length; k++) {
      if (countClues(p) <= targetClues) break;
      var i = order[k];
      if (!p[i]) continue;
      var v = p[i];
      p[i] = 0;
      if (symmetric) {
        var mir = 80 - i;
        var vm = p[mir];
        p[mir] = 0;
        if (countSolutions(ctx, peers, p, 2) !== 1) { p[i] = v; p[mir] = vm; }
      } else {
        if (countSolutions(ctx, peers, p, 2) !== 1) p[i] = v;
      }
    }
    return p;
  }

  /* ---------------- 变种布局 ---------------- */
  function neighbours(i) {
    var r = rIdx(i), c = cIdx(i), out = [];
    if (r > 0) out.push(i - 9);
    if (r < 8) out.push(i + 9);
    if (c > 0) out.push(i - 1);
    if (c < 8) out.push(i + 1);
    return out;
  }

  function connected(reg, k) {
    var first = -1, i;
    for (i = 0; i < 81; i++) if (reg[i] === k) { first = i; break; }
    if (first < 0) return false;
    var seen = {}, stack = [first], cnt = 0;
    while (stack.length) {
      var c = stack.pop();
      if (seen[c]) continue;
      seen[c] = 1; cnt++;
      var nb = neighbours(c);
      for (var z = 0; z < nb.length; z++) if (reg[nb[z]] === k && !seen[nb[z]]) stack.push(nb[z]);
    }
    return cnt === 9;
  }

  function hamiltonPath(rng, budget) {
    var path = [], used = new Uint8Array(81), nodes = 0, found = null;
    function deg(c) {
      var nb = neighbours(c), n = 0;
      for (var i = 0; i < nb.length; i++) if (!used[nb[i]]) n++;
      return n;
    }
    function dfs(c) {
      if (found) return true;
      if (nodes++ > budget) return false;
      path.push(c); used[c] = 1;
      if (path.length === 81) { found = path.slice(); return true; }
      var nb = neighbours(c).filter(function (n) { return !used[n]; });
      var jitter = rng() * 1.6;
      nb.sort(function (a, b) { return (deg(a) - deg(b)) + (jitter - 0.8) * ((a % 3) - (b % 3)); });
      for (var i = 0; i < nb.length; i++) {
        if (dfs(nb[i])) return true;
        if (nodes > budget) break;
      }
      path.pop(); used[c] = 0;
      return false;
    }
    var starts = [0, 8, 72, 80, 40];
    for (var t = 0; t < starts.length; t++) {
      nodes = 0; path = []; used = new Uint8Array(81);
      if (dfs(starts[t])) return found;
    }
    return null;
  }

  function shapeScore(regions) {
    var total = 0;
    for (var r = 0; r < 9; r++) {
      var cells = regions[r], minr = 9, maxr = -1, minc = 9, maxc = -1;
      for (var i = 0; i < cells.length; i++) {
        var rr = rIdx(cells[i]), cc = cIdx(cells[i]);
        if (rr < minr) minr = rr; if (rr > maxr) maxr = rr;
        if (cc < minc) minc = cc; if (cc > maxc) maxc = cc;
      }
      var h = maxr - minr + 1, w = maxc - minc + 1;
      if (h < 2 || w < 2) return 1e6;
      total += h * w;
      var rowSet = {}, colSet = {};
      for (var k = 0; k < cells.length; k++) { rowSet[rIdx(cells[k])] = 1; colSet[cIdx(cells[k])] = 1; }
      if (Object.keys(rowSet).length === 1 || Object.keys(colSet).length === 1) return 1e6;
    }
    return total;
  }

  function makeJigsaw(rng) {
    var best = null, bestScore = 1e9;
    for (var t = 0; t < 18; t++) {
      var path = hamiltonPath(rng, 20000);
      if (!path) continue;
      var regions = [[], [], [], [], [], [], [], [], []];
      for (var i = 0; i < 81; i++) regions[(i / 9) | 0].push(path[i]);
      var sc = shapeScore(regions);
      if (sc < bestScore) { bestScore = sc; best = regions; }
    }
    return bestScore < 1e6 ? best : null;
  }

  /* 万一随机布局全都不合格，用这个固定的合法锯齿布局兜底，
     绝不静默退回 3×3 宫（那会变成经典题却标着锯齿）。 */
  var FIXED_JIGSAW = [
    '000000333',
    '111000343',
    '122333344',
    '125444444',
    '125555666',
    '125555666',
    '127766688',
    '127778888',
    '227777888'
  ].join('');

  function fixedJigsaw() {
    var regions = [[], [], [], [], [], [], [], [], []];
    for (var i = 0; i < 81; i++) regions[+FIXED_JIGSAW.charAt(i)].push(i);
    return regions;
  }

  SD.core = {
    ROWS: ROWS, COLS: COLS, BOXES: BOXES, UNITS: UNITS, BIT: BIT, FULL: FULL, PC: PC,
    lowBit: lowBit, bitVal: bitVal, minVal: minVal, maxVal: maxVal, popVals: popVals,
    mulberry32: mulberry32, shuffle: shuffle, rIdx: rIdx, cIdx: cIdx, pos: pos, shortPos: shortPos,
    newCtx: newCtx, buildPeers: buildPeers, regionOf: regionOf, neighbours: neighbours,
    baseCand: baseCand, candidates: candidates, propagate: propagate, pruneFix: pruneFix, place: place, countSolutions: countSolutions,
    solveAny: solveAny, generateFull: generateFull, countClues: countClues, digHoles: digHoles,
    makeJigsaw: makeJigsaw, fixedJigsaw: fixedJigsaw, pruneAll: pruneAll, setDeadline: setDeadline
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
