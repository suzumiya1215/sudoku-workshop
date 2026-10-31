/* 数独工坊 · 界面与排版 */
(function () {
  'use strict';
  var SD = window.SD, C = SD.core;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  var VN = {};
  SD.VARIANTS.forEach(function (v) { VN[v.id] = v; });

  /* ================= 棋盘渲染 ================= */
  function regionIndexOf(ctx) {
    if (ctx._ri) return ctx._ri;
    var ri = new Int8Array(81);
    for (var k = 0; k < 9; k++) for (var i = 0; i < 9; i++) ri[ctx.regions[k][i]] = k;
    ctx._ri = ri; return ri;
  }

  function svgEl(name, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function boardNode(item, opts) {
    opts = opts || {};
    var ctx = item.ctx, i;
    var cs = opts.cs == null ? 52 : opts.cs;               /* 数字=px，字符串=带单位（mm / 响应式表达式） */
    var csPx = typeof cs === 'number' ? cs : parseFloat(cs) * (/mm\s*$/.test(cs) ? 3.7795 : 1);
    /* 打印样式不再靠"cs 是字符串"来猜：响应式也用字符串，必须显式声明 */
    var isPrint = opts.print != null ? !!opts.print : (typeof cs === 'string');
    var wrap = el('div', 'boardwrap');
    if (!opts.flat) {
      if (isFinite(csPx)) wrap.style.padding = Math.round(csPx * 0.55) + 'px';
      else wrap.classList.add('resp');                    /* 响应式尺寸：内边距交给 CSS */
    }
    var grid = el('div', 'bgrid');
    /* --cs 必须放在外层，坐标轴、棋盘都要继承它，否则 calc(var(--cs)*…) 全部失效 */
    var csCss = typeof cs === 'number' ? cs + 'px' : cs;
    wrap.style.setProperty('--cs', csCss);
    grid.style.setProperty('--cs', csCss);

    /* 行号 / 列号：让 R8C3 这种写法一眼能找到 */
    var corner = el('div', 'ax corner');
    var cols = el('div', 'ax cols');
    var rows = el('div', 'ax rows');
    for (i = 0; i < 9; i++) {
      cols.appendChild(el('i', null, 'C' + (i + 1)));
      rows.appendChild(el('i', null, 'R' + (i + 1)));
    }

    var board = el('div', 'board');
    var ri = regionIndexOf(ctx);

    /* 覆盖层先插入，这样格子里的数字会盖在线上面（温度计、连续线穿过格子中心时不遮数字） */
    var svg = svgEl('svg', { viewBox: '0 0 9 9', preserveAspectRatio: 'none' });
    svg.setAttribute('class', 'overlay');
    svg.style.position = 'absolute';
    svg.style.left = '0'; svg.style.top = '0';
    svg.style.width = '100%'; svg.style.height = '100%';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    board.appendChild(svg);

    var thin = isPrint ? 0.9 : 1;
    var thick = isPrint ? 1.8 : 2;
    var dThin = '';
    for (i = 1; i < 9; i++) dThin += 'M' + i + ' 0V9M0 ' + i + 'H9';
    svg.appendChild(svgEl('path', {
      d: dThin, fill: 'none', stroke: '#c6ccd5', 'stroke-width': thin,
      'vector-effect': 'non-scaling-stroke', 'shape-rendering': 'crispEdges'
    }));

    var peersOfSel = null;
    if (opts.sel != null && opts.sel >= 0) peersOfSel = C.buildPeers(ctx)[opts.sel];
    var selVal = (opts.sel != null && opts.sel >= 0 && opts.values) ? opts.values[opts.sel] : 0;

    for (i = 0; i < 81; i++) {
      var cell = el('div', 'cell');
      var val = opts.values ? opts.values[i] : item.puzzle[i];
      var isGiven = opts.given ? opts.given[i] : !!item.puzzle[i];
      if (val) {
        cell.textContent = val;
        cell.classList.add(isGiven ? 'given' : 'user');
      } else if (opts.notes && opts.notes[i] && opts.notes[i].size) {
        var cd = el('div', 'cand');
        for (var v = 1; v <= 9; v++) { var s = el('span'); s.textContent = opts.notes[i].has(v) ? v : ''; cd.appendChild(s); }
        cell.appendChild(cd);
      } else if (opts.cand && opts.cand[i]) {
        var cd2 = el('div', 'cand');
        for (var v2 = 1; v2 <= 9; v2++) { var s2 = el('span'); s2.textContent = (opts.cand[i] & C.BIT[v2]) ? v2 : ''; cd2.appendChild(s2); }
        cell.appendChild(cd2);
      }
      if (opts.bad && opts.bad[i]) cell.classList.add('bad');
      if (opts.sel === i) cell.classList.add('sel');
      else if (peersOfSel && peersOfSel.indexOf(i) >= 0) cell.classList.add('peer');
      if (!opts.sel && selVal && val === selVal) cell.classList.add('same');
      if (opts.sel != null && opts.sel >= 0 && val && val === selVal && opts.sel !== i) cell.classList.add('same');
      cell.dataset.i = i;
      board.appendChild(cell);
    }

    /* 区域边界（3×3 宫线 / 锯齿数独的不规则边界）统一在这里画，
       不再依赖单元格边框——边框会被打印样式覆盖成细线，导致粗细不一。 */
    (function drawRegions() {
      var d = '', x, y, run;
      for (x = 1; x < 9; x++) {
        run = -1;
        for (y = 0; y <= 9; y++) {
          var on = y < 9 && ri[y * 9 + x] !== ri[y * 9 + x - 1];
          if (on && run < 0) run = y;
          if (!on && run >= 0) { d += 'M' + x + ' ' + run + 'V' + y; run = -1; }
        }
      }
      for (y = 1; y < 9; y++) {
        run = -1;
        for (x = 0; x <= 9; x++) {
          var on2 = x < 9 && ri[y * 9 + x] !== ri[(y - 1) * 9 + x];
          if (on2 && run < 0) run = x;
          if (!on2 && run >= 0) { d += 'M' + run + ' ' + y + 'H' + x; run = -1; }
        }
      }
      if (!d) return;
      svg.appendChild(svgEl('path', {
        d: d, fill: 'none', stroke: '#20242b', 'stroke-width': thick,
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'square'
      }));
    })();

    function line(pts, color, width, dash) {
      /* pts 既可能是格子序号数组（温度计 / 连续线 / 耳语线），也可能是 {r,c} 数组 */
      var p = svgEl('polyline', {
        points: pts.map(function (q) {
          var r = (typeof q === 'number') ? ((q / 9) | 0) : q.r;
          var c = (typeof q === 'number') ? (q % 9) : q.c;
          return (c + 0.5) + ',' + (r + 0.5);
        }).join(' '),
        fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round',
        'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke'
      });
      if (dash) p.setAttribute('stroke-dasharray', dash);
      svg.appendChild(p);
      return p;
    }
    function dot(r, c, rad, fill, stroke) {
      svg.appendChild(svgEl('circle', { cx: c + 0.5, cy: r + 0.5, r: rad, fill: fill, stroke: stroke || 'none', 'stroke-width': 0.03 }));
    }
    function text(x, y, str, size, anchor, fill) {
      var t = svgEl('text', {
        x: x, y: y, 'font-size': size || 0.34, 'text-anchor': anchor || 'middle', fill: fill || '#333',
        'dominant-baseline': 'central', 'font-family': 'Arial, sans-serif', 'font-weight': '600',
        stroke: '#fff', 'stroke-width': (size || 0.34) * 0.34, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
      });
      t.textContent = str; svg.appendChild(t);
    }

    if (ctx.cages.length && !opts.clean) {
      ctx.cages.forEach(function (cg) {
        var set = {};
        cg.cells.forEach(function (x) { set[x] = 1; });
        /* 笼线向内缩一点画，不要和网格线重合——重合时虚线会把实线"打断"，
           看起来就像网格线缺了一截。 */
        var IN = 0.06;
        function edge(x1, y1, x2, y2) {
          svg.appendChild(svgEl('line', {
            x1: x1, y1: y1, x2: x2, y2: y2, stroke: '#8a93a3', 'stroke-width': 0.9,
            'stroke-dasharray': '2 1.6', 'vector-effect': 'non-scaling-stroke'
          }));
        }
        cg.cells.forEach(function (x) {
          var r0 = (x / 9) | 0, c0 = x % 9;
          if (!(x - 9 >= 0 && set[x - 9])) edge(c0 + IN, r0 + IN, c0 + 1 - IN, r0 + IN);          /* 上 */
          if (!(x + 9 < 81 && set[x + 9])) edge(c0 + IN, r0 + 1 - IN, c0 + 1 - IN, r0 + 1 - IN);   /* 下 */
          if (!(c0 > 0 && set[x - 1])) edge(c0 + IN, r0 + IN, c0 + IN, r0 + 1 - IN);               /* 左 */
          if (!(c0 < 8 && set[x + 1])) edge(c0 + 1 - IN, r0 + IN, c0 + 1 - IN, r0 + 1 - IN);       /* 右 */
        });
        var top = cg.cells[0];
        for (var k = 1; k < cg.cells.length; k++) {
          if (cg.cells[k] < top) top = cg.cells[k];
        }
        var tr = ((top / 9) | 0), tc = top % 9;
        text(tc + 0.08, tr + 0.16, cg.sum, 0.22, 'start', '#111');
      });
    }
    /* 参考答案只要"格子 + 数字"：变种线（温度计、连续、耳语、箭头、小杀手）一律不画，
       否则答案盘上一堆彩色线和虚线，很容易被当成"框线乱七八糟"。 */
    if (!opts.clean) {
      ctx.thermos.forEach(function (t) { line(t, '#6b7280', 2); dot((t[0] / 9) | 0, t[0] % 9, 0.16, '#fff', '#6b7280'); });
      ctx.renbans.forEach(function (t) { line(t, '#8b5cf6', 3); });
      ctx.whispers.forEach(function (t) { line(t, '#0f9d58', 2, '2 2'); });
    }
    if (!opts.clean) ctx.arrows.forEach(function (a) {
      var pts = [{ r: (a.circle / 9) | 0, c: a.circle % 9 }].concat(a.cells.map(function (x) { return { r: (x / 9) | 0, c: x % 9 }; }));
      var poly = pts.map(function (p) { return p.r + ',' + p.c; });
      svg.appendChild(svgEl('polyline', {
        points: poly.map(function (s) { var q = s.split(','); return (parseFloat(q[1]) + 0.5) + ',' + (parseFloat(q[0]) + 0.5); }).join(' '),
        fill: 'none', stroke: '#374151', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke'
      }));
      dot((a.circle / 9) | 0, a.circle % 9, 0.2, '#fff', '#374151');
      var last = pts[pts.length - 1], prev = pts[pts.length - 2] || pts[0];
      var ang = Math.atan2(last.r - prev.r, last.c - prev.c);
      var cx = last.c + 0.5, cy = last.r + 0.5;
      var tipx = cx + Math.cos(ang) * 0.2, tipy = cy + Math.sin(ang) * 0.2;
      var bx = cx - Math.cos(ang) * 0.14, by = cy - Math.sin(ang) * 0.14;
      var px = -Math.sin(ang) * 0.15, py = Math.cos(ang) * 0.15;
      svg.appendChild(svgEl('path', {
        d: 'M' + tipx + ',' + tipy + ' L' + (bx + px) + ',' + (by + py) + ' L' + (bx - px) + ',' + (by - py) + ' Z',
        fill: '#374151'
      }));
    });

    for (var rr = 0; rr < 9; rr++) if (ctx.sandwichRows[rr] != null) {
      text(-0.3, rr + 0.5, ctx.sandwichRows[rr], 0.36, 'middle');
      text(9.3, rr + 0.5, ctx.sandwichRows[rr], 0.36, 'middle');
    }
    for (var cc = 0; cc < 9; cc++) if (ctx.sandwichCols[cc] != null) {
      text(cc + 0.5, -0.32, ctx.sandwichCols[cc], 0.36, 'middle');
      text(cc + 0.5, 9.32, ctx.sandwichCols[cc], 0.36, 'middle');
    }
    ctx.lks.forEach(function (lk) {
      var first = lk.cells[0], fr = (first / 9) | 0, fc = first % 9;
      var last = lk.cells[lk.cells.length - 1], lr = (last / 9) | 0, lc = last % 9;
      var dr = Math.sign(fr - lr), dc = Math.sign(fc - lc);
      var ex = fc + dc * 0.5 - dc * 0.45, ey = fr + dr * 0.5 - dr * 0.45;
      if (opts.clean) return;
      svg.appendChild(svgEl('line', {
        x1: ex, y1: ey, x2: lc + 0.5, y2: lr + 0.5, stroke: '#374151', 'stroke-width': 1.4,
        'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '2 2'
      }));
      text(ex + dc * 0.22, ey + dr * 0.22, lk.sum, 0.34, 'middle');
    });

    grid.appendChild(corner); grid.appendChild(cols); grid.appendChild(rows); grid.appendChild(board);
    wrap.appendChild(grid);
    return { wrap: wrap, board: board };
  }

    /* ================= 练习 ================= */
  var P = {
    item: null, values: [], notes: [], given: [], sel: -1,
    note: false, candOn: false, timer: null, sec: 0, stepAt: -1,
    busy: false, paused: false, undo: [], playIv: null
  };

  function blankNotes() { var a = []; for (var i = 0; i < 81; i++) a.push(new Set()); return a; }
  function cloneNotes(ns) { return ns.map(function (s) { return new Set(s); }); }

  function pushUndo() {
    P.undo.push({ values: P.values.slice(), notes: cloneNotes(P.notes) });
    if (P.undo.length > 200) P.undo.shift();
  }
  function doUndo() {
    var s = P.undo.pop();
    if (!s) { toast('没有可撤销的操作'); return; }
    P.values = s.values; P.notes = s.notes;
    renderPlay();
  }

  function stopPlay() {
    if (P.playIv) clearInterval(P.playIv);
    P.playIv = null; P.busy = false;
    var b = $('#p-all');
    b.textContent = '逐步演示';
    b.classList.remove('accent');
  }

  function newPuzzle(kind, band) {
    kind = kind || $('#p-kind').value; band = +$('#p-band').value;
    stopPlay();
    if (P.timer) { clearInterval(P.timer); P.timer = null; }
    $('#p-status').textContent = '生成中…';
    setTimeout(function () {
      var it = SD.makePuzzle(kind, band);
      if (!it) it = SD.makePuzzle(kind, band);
      if (!it) { $('#p-status').textContent = '这次没生成出来，再点一次'; return; }
      loadPuzzle(it, band);
    }, 30);
  }

  function loadPuzzle(it, wantBand) {
    stopPlay();
    if (P.timer) { clearInterval(P.timer); P.timer = null; }
    P.item = it;
    P.values = Array.from(it.puzzle);
    P.given = it.puzzle.map(function (x) { return !!x; });
    P.notes = blankNotes();
    P.sel = -1; P.stepAt = -1; P.undo = [];
    P.sec = 0; P.paused = false;
    $('#p-pause').textContent = '暂停';
    P.timer = setInterval(function () {
      if (P.paused) return;
      P.sec++;
      $('#p-time').textContent = p2((P.sec / 60) | 0) + ':' + p2(P.sec % 60);
    }, 1000);
    $('#p-time').textContent = '00:00';
    $('#p-status').textContent = '';
    renderPlay();
    renderSteps();
    var want = wantBand || it.band;
    $('#p-explain').innerHTML = '<div class="h">开始吧</div>' +
      '点一个空格，用键盘 1–9 或下方数字盘填数。<br>' +
      '卡住时点「提示」：先告诉你下一步该用什么技巧，再看答案。';
    if (want && it.band !== want) {
      $('#p-status').textContent = '目标 L' + want + '，实际出到 ' + SD.bandLabel(it.se) + '（该档位较稀有，已取最接近的一道）';
    }
  }

  function conflicts() {
    var bad = {};
    var peers = C.buildPeers(P.item.ctx);
    for (var i = 0; i < 81; i++) {
      if (!P.values[i]) continue;
      var ps = peers[i];
      for (var k = 0; k < ps.length; k++) if (P.values[ps[k]] === P.values[i]) { bad[i] = 1; bad[ps[k]] = 1; }
    }
    return bad;
  }

  function renderPlay() {
    if (!P.item) return;
    var host = $('#p-board');
    host.innerHTML = '';
    var cand = null;
    if (P.candOn) {
      cand = currentCand();
    }
    var n = boardNode(P.item, {
      cs: 'var(--cs-play)', print: false, values: P.values, given: P.given, notes: P.notes,
      sel: P.sel, bad: conflicts(), cand: cand
    });
    host.appendChild(n.wrap);
    n.board.tabIndex = 0;
    $$('.cell', n.board).forEach(function (cell) {
      cell.addEventListener('click', function () {
        P.sel = +cell.dataset.i;
        renderPlay();
        var b = $('#p-board .board');
        if (b) b.focus({ preventScroll: true });
      });
    });
    var it = P.item;
    $('#p-info').innerHTML =
      '<span class="chip">' + VN[it.kind].name + '</span>' +
      '<span class="chip se">SE ' + it.se.toFixed(1) + ' · ' + SD.bandLabel(it.se) + '</span>' +
      '<span class="chip">提示数 <b>' + it.clues + '</b></span>' +
      '<span class="chip ok">唯一解已验证</span>';
    var keys = Object.keys(it.techniques).sort(function (a, b) { return it.techniques[b] - it.techniques[a]; });
    $('#p-tech').innerHTML = keys.length
      ? keys.slice(0, 6).map(function (k) {
        return '<span class="tchip">' + k + '<b>' + it.techniques[k] + '</b></span>';
      }).join('')
      : '—';
    renderBasis(it);
    renderPad();
    checkDone();
  }

  /* 把"SE 是怎么来的"摊开给用户看：评级 = 步骤里最难那一步的技巧权重 */
  function renderBasis(it) {
    var top = it.topName || (it.steps.length ? it.steps.reduce(function (a, b) { return a.se > b.se ? a : b; }).name : '—');
    var topSe = it.steps.length ? Math.max.apply(null, it.steps.map(function (s) { return s.se; })) : 0;
    var b = SD.bandInfo(it.se);
    var cage = (it.cageBase != null)
      ? '<br><span class="muted">本题带笼：按 45 法则 / 笼内组合枚举，路径本身只有 SE ' + it.cageBase.toFixed(1) +
        '，但这类推理要动脑，所以按 2.4 的底分记为 SE 2.4。</span>'
      : '';
    $('#p-basis').innerHTML =
      '评级依据：共 <b>' + it.steps.length + '</b> 步，其中最难的一步是 <b>' + top + '</b>（SE ' + topSe.toFixed(1) + '），' +
      '所以本题定为 <b>SE ' + it.se.toFixed(1) + ' · L' + b.id + ' ' + b.name + '</b>。' +
      '<span class="muted">（SE 取"路径上最难一步"的技巧权重，不是提示数。）</span>' + cage;
  }

  function remainCount(v) {
    var n = 9;
    for (var i = 0; i < 81; i++) if (P.values[i] === v && P.item.solution[i] === v) n--;
    return n;
  }

  function renderPad() {
    if (!P.item) return;
    $$('#p-pad .padbtn').forEach(function (b) {
      if (!b.dataset.v) return;                 /* 删除键没有数字，别把它算成"剩 9" */
      var v = +b.dataset.v;
      var left = remainCount(v);
      var em = b.querySelector('em');
      if (em) em.textContent = left > 0 ? '剩 ' + left : '已满';
      b.classList.toggle('done', left <= 0);
    });
  }

  function checkDone() {
    if (!P.item) return;
    for (var i = 0; i < 81; i++) if (P.values[i] !== P.item.solution[i]) return;
    if (P.timer) { clearInterval(P.timer); P.timer = null; }
    $('#p-status').textContent = '完成，用时 ' + p2((P.sec / 60) | 0) + ':' + p2(P.sec % 60);
  }

  function inputDigit(v, asNote) {
    if (!P.item || P.sel < 0 || P.given[P.sel]) return;
    pushUndo();
    if (asNote || P.note) {
      if (!P.values[P.sel]) {
        if (P.notes[P.sel].has(v)) P.notes[P.sel].delete(v); else P.notes[P.sel].add(v);
      }
    } else {
      P.values[P.sel] = P.values[P.sel] === v ? 0 : v;
      P.notes[P.sel] = new Set();
      if (P.values[P.sel]) {
        C.buildPeers(P.item.ctx)[P.sel].forEach(function (p) { P.notes[p].delete(v); });
      }
    }
    renderPlay();
  }

  function clearCell() {
    if (!P.item || P.sel < 0 || P.given[P.sel]) return;
    if (!P.values[P.sel] && !P.notes[P.sel].size) return;
    pushUndo();
    P.values[P.sel] = 0; P.notes[P.sel] = new Set();
    renderPlay();
  }

  function currentCand() {
    if (!P.item) return null;
    var peers = C.buildPeers(P.item.ctx);
    var g = Uint8Array.from(P.values);
    var cand = C.baseCand(P.item.ctx, peers, g);
    if (!cand) return null;
    if (!C.pruneFix(P.item.ctx, g, cand)) return null;
    return cand;
  }

  function hintStep() {
    if (!P.item) return null;
    var peers = C.buildPeers(P.item.ctx);
    var g = Uint8Array.from(P.values);
    var cand = C.baseCand(P.item.ctx, peers, g);
    if (!cand || !C.pruneFix(P.item.ctx, g, cand)) { toast('盘面上有冲突，先清掉红字'); return null; }
    return SD.findStep(P.item.ctx, g, cand);
  }

  var hintShown = null;
  function applyHint() {
    var st = hintStep();
    if (!st) { toast('当前状态没有可用的下一步'); return; }
    if (hintShown !== st) {
      /* 第一次点提示：只讲这一步用什么技巧，不替你填 */
      hintShown = st;
      showExplain(st);
      toast('提示：这一步用「' + st.name + '」。再点一次即执行');
      return;
    }
    hintShown = null;
    pushUndo();
    if (st.kind === 'place') {
      P.values[st.i] = st.v; P.notes[st.i] = new Set();
    } else {
      st.elims.forEach(function (e) { if (P.notes[e[0]]) P.notes[e[0]].delete(e[1]); });
    }
    showExplain(st);
    renderPlay();
  }

  function showExplain(st) {
    var box = $('#p-explain');
    box.innerHTML = '<div class="h">' + st.name + '（SE ' + st.se.toFixed(1) + '）</div>' + st.text;
    flash(st.cells, $('#p-board'));
  }
  function flash(cells, root) {
    var scope = root || document;
    $$('.cell', scope).forEach(function (c) { c.classList.remove('flash'); });
    cells.forEach(function (i) {
      var n = scope.querySelector('.cell[data-i="' + i + '"]');
      if (n) n.classList.add('flash');
    });
  }

  function renderSteps() {
    var host = $('#p-steps');
    host.innerHTML = '';
    P.item.steps.forEach(function (st, k) {
      var d = el('div', 'st');
      d.innerHTML = '<span class="n">' + (k + 1) + '.</span>' + st.name + '<span class="t">SE ' + st.se.toFixed(1) + '</span>';
      d.addEventListener('click', function () {
        stopPlay();
        gotoStep(k);
      });
      host.appendChild(d);
    });
  }

  function gotoStep(k) {
    var host = $('#p-steps');
    P.stepAt = k;
    $$('.st', host).forEach(function (x, i) {
      x.classList.toggle('on', i === k);
      x.classList.toggle('done', i < k);
    });
    replayTo(k);
    var st = P.item.steps[k];
    if (st) {
      showExplain(st);
      var node = host.children[k];
      if (node) node.scrollIntoView({ block: 'nearest' });
    }
  }

  function replayTo(k) {
    P.values = Array.from(P.item.puzzle);
    P.notes = blankNotes();
    for (var t = 0; t <= k; t++) {
      var st = P.item.steps[t];
      if (st.kind === 'place') { P.values[st.i] = st.v; P.notes[st.i] = new Set(); }
      else st.elims.forEach(function (e) { if (P.notes[e[0]]) P.notes[e[0]].delete(e[1]); });
    }
    renderPlay();
  }

  function stepBy(delta) {
    if (!P.item) return;
    var k = P.stepAt + delta;
    if (k < 0) k = 0;
    if (k >= P.item.steps.length) k = P.item.steps.length - 1;
    gotoStep(k);
  }

  /* 逐步演示：随时可以停下来，按钮本身就是开关 */
  function playAll() {
    if (P.playIv) { stopPlay(); return; }
    var item = P.item;
    if (!item) return;
    P.busy = true;
    var k = P.stepAt >= 0 ? P.stepAt + 1 : 0;
    var btn = $('#p-all');
    btn.textContent = '停止演示';
    btn.classList.add('accent');
    P.playIv = setInterval(function () {
      if (P.item !== item || k >= item.steps.length) {
        stopPlay();
        if (P.item === item) {
          P.values = Array.from(item.solution);
          renderPlay();
          gotoStep(item.steps.length - 1);
        }
        return;
      }
      gotoStep(k);
      k++;
    }, 700);
  }

  /* 打印当前这一道题：单题 A4，含题目页与答案页 */
  function printThis() {
    if (!P.item) { toast('还没有题目'); return; }
    var it = P.item;
    it.uid = 1;
    B.items = [it];
    buildSheets([it], { perPage: 1, title: VN[it.kind].name + ' · 单题练习', answers: true });
    document.body.classList.add('viewing');
    window.scrollTo(0, 0);
    setTimeout(function () { window.print(); }, 160);
  }

  function copyPuzzle() {
    if (!P.item) return;
    var it = P.item;
    var lines = [];
    for (var r = 0; r < 9; r++) {
      var row = '';
      for (var c = 0; c < 9; c++) {
        var v = it.puzzle[r * 9 + c];
        row += v ? v : '.';
        if (c === 2 || c === 5) row += '|';
      }
      lines.push(row);
      if (r === 2 || r === 5) lines.push('---+---+---');
    }
    var txt = VN[it.kind].name + '　SE ' + it.se.toFixed(1) + '　提示数 ' + it.clues + '\n' + lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('题目已复制到剪贴板'); }, function () { fallbackCopy(txt); });
    } else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('题目已复制'); } catch (e) { toast('复制失败'); }
    ta.remove();
  }

/* ================= 专项训练 ================= */
  var T = { item: null, tech: null };

  function trainTechList() {
    var sel = $('#t-tech');
    var list = Object.keys(SD.tech).filter(function (k) { return k !== 'variant'; });
    list.sort(function (a, b) { return SD.tech[a].se - SD.tech[b].se; });
    sel.innerHTML = '';
    list.forEach(function (k) {
      var o = el('option'); o.value = k;
      o.textContent = 'SE ' + SD.tech[k].se.toFixed(1) + ' · ' + SD.tech[k].name;
      sel.appendChild(o);
    });
    sel.value = 'xWing';
  }

  function trainGen() {
    var k = $('#t-tech').value;
    T.tech = k;
    var spec = SD.tech[k];
    $('#t-status').textContent = '按「' + spec.name + '」出题…';
    $('#t-explain').innerHTML = '正在找一道能练「' + spec.name + '」的题…';
    setTimeout(function () {
      var it = SD.makeForTech(k, 'classic', undefined, 30);
      if (!it) { $('#t-status').textContent = '这次没出成，再点一次。'; return; }
      T.item = it;
      T.mode = it.teach ? 'demo' : 'path';
      renderTrain();
      var n = it.teach ? 1 : it.steps.filter(function (s) { return s.type === k; }).length;
      $('#t-status').textContent = it.teach
        ? '这道题能观察到「' + spec.name + '」：棋盘已经走到那一步，高亮的就是这个结构。'
        : '这道题在解题时真的要用到「' + spec.name + '」，出现 ' + n + ' 次。';
    }, 30);
  }

  function drawTrainBoard(values, flashCells) {
    var it = T.item, host = $('#t-board');
    host.innerHTML = '';
    var given = it.puzzle.map(function (x) { return !!x; });
    var n = boardNode(it, { cs: 'var(--cs-train)', print: false, values: values, given: given, notes: blankNotes() });
    host.appendChild(n.wrap);
    if (flashCells && flashCells.length) {
      var cells = n.board.querySelectorAll('.cell');
      flashCells.forEach(function (i) { if (cells[i]) cells[i].classList.add('flash'); });
    }
    return n;
  }

  function renderTrain() {
    var it = T.item;
    var startVals = it.teach ? it.teach.grid : Array.from(it.puzzle);
    var n = drawTrainBoard(startVals, it.teach ? it.teach.step.cells : []);
    $$('.cell', n.board).forEach(function (cell) {
      cell.addEventListener('click', function () {
        var i = +cell.dataset.i;
        var st = it.steps.filter(function (s) { return s.cells.indexOf(i) >= 0; });
        if (st.length) showTrainStep(st[0]);
      });
    });
    $('#t-info').innerHTML =
      '<span class="chip">' + VN[it.kind].name + '</span>' +
      '<span class="chip se">SE ' + it.se.toFixed(1) + ' · ' + SD.bandLabel(it.se) + '</span>' +
      '<span class="chip">提示数 <b>' + it.clues + '</b></span>' +
      '<span class="chip ok">唯一解已验证</span>';

    var host2 = $('#t-steps'); host2.innerHTML = '';
    if (it.teach) {
      var demo = el('div', 'st hit on');
      demo.innerHTML = '<span class="n">演示</span>' + SD.tech[T.tech].name + '<span class="t">目标技巧</span>';
      demo.addEventListener('click', function () {
        $$('.st', host2).forEach(function (x) { x.classList.remove('on'); });
        demo.classList.add('on');
        drawTrainBoard(it.teach.grid, it.teach.step.cells);
        showTrainStep(it.teach.step);
      });
      host2.appendChild(demo);
      showTrainStep(it.teach.step);
      $('#t-explain').insertAdjacentHTML('beforeend',
        '<div class="small muted" style="margin-top:8px">说明：这道题不一定要用它才能解完，这里是把“该技巧成立的那一刻”定格下来，方便看清结构。</div>');
    }
    it.steps.forEach(function (st, k) {
      var hit = T.tech && st.type === T.tech;
      var d = el('div', 'st' + (hit ? ' hit' : ''));
      d.innerHTML = '<span class="n">第 ' + (k + 1) + ' 步</span>' + st.name +
        (hit ? '<span class="t">目标技巧</span>' : '');
      d.addEventListener('click', function () { showTrainStep(st); });
      host2.appendChild(d);
    });
  }
  function showTrainStep(st) {
    $('#t-explain').innerHTML = '<div class="h">' + st.name + '（SE ' + st.se.toFixed(1) + '）</div>' + st.text;
    flash(st.cells, $('#t-board'));
  }

  /* ================= 批量出题 ================= */
  var B = { items: [], busy: false };
  var BAND_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  function batchVariantList() {
    var host = $('#b-vars');
    host.innerHTML = '';
    SD.VARIANTS.forEach(function (v, k) {
      var lab = el('label'); if (k === 0) lab.classList.add('on');
      var cb = el('input'); cb.type = 'checkbox'; cb.value = v.id; cb.checked = k === 0;
      cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
      lab.appendChild(cb);
      var span = el('span');
      span.innerHTML = '<b>' + v.name + '</b><br><span class="muted" style="font-size:11px">' + v.tag + '</span>';
      lab.appendChild(span);
      host.appendChild(lab);
    });
  }

  function totalCount() {
    return BAND_ORDER.reduce(function (s, b) {
      var node = $('#b-d' + b);
      return s + (node ? (+node.value || 0) : 0);
    }, 0);
  }

  function genBatch() {
    if (B.busy) return;
    $('#b-total').textContent = totalCount();
    var vars = $$('#b-vars input:checked').map(function (c) { return c.value; });
    if (!vars.length) { toast('至少选一种玩法'); return; }
    var plan = [];
    /* 杀手 / 混合受"笼和推理 2.4 底分"限制，实际最高只到 L3。
       但不能因此把它们从名单里删掉——用户勾了就该拿到。
       所以：照常轮转分配玩法，只把该玩法的目标档位夹到它够得着的范围，
       结果里如实写明"L7→L3"以及原因。 */
    var KIND_MAX = { killer: 3, hybrid: 3 };
    BAND_ORDER.forEach(function (b) {
      var node = $('#b-d' + b);
      var n = node ? (+node.value || 0) : 0;
      if (!n) return;
      for (var k = 0; k < n; k++) {
        var kind = vars[k % vars.length];
        var cap = KIND_MAX[kind];
        var use = (cap && b > cap) ? cap : b;
        plan.push({ band: b, kind: kind, use: use });
      }
    });
    if (!plan.length) { toast('数量都是 0'); return; }
    B.busy = true; B.items = [];
    $('#b-go').disabled = true;
    $('#b-preview').innerHTML = '';
    var done = 0, miss = 0;
    (function step() {
      if (done >= plan.length) {
        B.busy = false; $('#b-go').disabled = false;
        var dist = {};
        B.items.forEach(function (x) { dist[x.band] = (dist[x.band] || 0) + 1; });
        var txt = BAND_ORDER.filter(function (id) { return dist[id]; })
          .map(function (id) { return 'L' + id + ' ' + SD.BANDS[id - 1].name + ' ' + dist[id]; })
          .join(' · ');
        var offMap = {};
        plan.forEach(function (pl, i) {
          if (!B.items[i]) return;
          if (B.items[i].band !== pl.band) {
            var k = 'L' + pl.band + '→L' + B.items[i].band;
            offMap[k] = (offMap[k] || 0) + 1;
          }
        });
        var offKeys = Object.keys(offMap);
        var offTxt = offKeys.map(function (k) { return k + ' ×' + offMap[k]; }).join('、');
        var clampMap = {};
        plan.forEach(function (pl) {
          if (pl.use !== pl.band) {
            var nm = SD.VARIANTS.filter(function (v) { return v.id === pl.kind; })[0];
            var k2 = (nm ? nm.name : pl.kind) + '最高 L' + pl.use;
            clampMap[k2] = (clampMap[k2] || 0) + 1;
          }
        });
        var clampKeys = Object.keys(clampMap);
        var clampTxt = clampKeys.map(function (k) { return k; }).join('、');
        $('#b-status').textContent = '完成 ' + B.items.length + ' 道（共 ' + plan.length + '）　实际档位：' + (txt || '—') +
          (offKeys.length ? '　｜　' + offKeys.reduce(function (s, k) { return s + offMap[k]; }, 0) +
            ' 道与要求不同（' + offTxt + '）' : '　｜　全部按要求档位出题') +
          (clampKeys.length ? '　｜　' + clampTxt + '：这类题受笼和底分限制，已按能到的最高档出题' : '');
        renderPreview();
        return;
      }
      var it = SD.makePuzzle(plan[done].kind, plan[done].use);
      if (!it) it = SD.makePuzzle(plan[done].kind, plan[done].use);
      if (it) { it.uid = B.items.length + 1; B.items.push(it); } else miss++;
      done++;
      $('#b-status').textContent = '生成中 ' + done + ' / ' + plan.length +
        (miss ? '（' + miss + ' 道未成功）' : '');
      $('#b-bar').style.width = Math.round(done / plan.length * 100) + '%';
      setTimeout(step, 0);
    })();
  }

  function renderPreview() {
    var host = $('#b-preview');
    host.innerHTML = '';
    B.items.slice(0, 24).forEach(function (it) {
      var d = el('div', 'pv');
      var b = el('div', 'b');
      for (var i = 0; i < 81; i++) {
        var c = el('div', 'c' + (it.puzzle[i] ? ' g' : ''));
        c.textContent = it.puzzle[i] || '';
        b.appendChild(c);
      }
      d.appendChild(b);
      d.appendChild(el('div', null, '#' + it.uid + ' ' + VN[it.kind].name + ' · SE ' + it.se.toFixed(1)));
      host.appendChild(d);
    });
    if (B.items.length > 24) {
      var m = el('div', 'pv'); m.textContent = '还有 ' + (B.items.length - 24) + ' 道，导出时全部包含';
      host.appendChild(m);
    }
  }

  /* ================= 打印排版 ================= */
  function sheetHead(title, meta) {
    var h = el('div', 's-head');
    h.appendChild(el('div', 't', title));
    h.appendChild(el('div', 'm', meta));
    return h;
  }
  function sheetFoot(idx, total, title) {
    var f = el('div', 's-foot');
    f.appendChild(el('span', null, title));
    f.appendChild(el('span', null, '第 ' + idx + ' 页 / 共 ' + total + ' 页'));
    return f;
  }

  /* 打印用的格子边长（毫米）：A4 版心 180mm 宽，留出盘外提示与出血的余量 */
  var CS_MM = { 1: '17mm', 2: '9.6mm', 4: '8.8mm' };

  function puzzleBlock(it, perPage) {
    var box = el('div', 'pz');
    var cap = el('div', 'cap');
    var no = el('div', 'no', '第 ' + it.uid + ' 题');
    var tags = el('div', 'tags', VN[it.kind].name + '　SE ' + it.se.toFixed(1) +
      '（' + SD.bandLabel(it.se) + '）　提示数 ' + it.clues);
    cap.appendChild(no); cap.appendChild(tags);
    box.appendChild(cap);
    var n = boardNode(it, { cs: CS_MM[perPage] || '8.4mm', flat: true, print: true });

    if (perPage === 2) {
      /* 两题一页：左盘右栏，右栏放“这道题要用什么”和演算区，把版面用满 */
      var rowEl = el('div', 'pzrow');
      var main = el('div', 'pzmain');
      main.appendChild(n.wrap);
      main.appendChild(el('div', 'note'));
      var side = el('div', 'pzside');
      side.appendChild(el('div', 'sh', '解题会用到的技巧'));
      var keys = Object.keys(it.techniques).sort(function (a, b) { return it.techniques[b] - it.techniques[a]; });
      var list = el('div', 'techlist');
      keys.slice(0, 5).forEach(function (k) { list.appendChild(el('div', 'ti', k + '　×' + it.techniques[k])); });
      side.appendChild(list);
      side.appendChild(el('div', 'sh', '演算区'));
      for (var d = 0; d < 4; d++) side.appendChild(el('div', 'ln'));
      rowEl.appendChild(main); rowEl.appendChild(side);
      box.appendChild(rowEl);
      return box;
    }

    box.appendChild(n.wrap);
    box.appendChild(el('div', 'note'));
    return box;
  }

  function draftBox(lines) {
    var d = el('div', 'draft');
    d.appendChild(el('div', 'dh', '草稿 / 候选数记录'));
    for (var i = 0; i < lines; i++) d.appendChild(el('div', 'ln'));
    return d;
  }

  function buildSheets(items, opts) {
    opts = opts || {};
    var host = $('#sheets');
    host.innerHTML = '';
    var perPage = opts.perPage || 2;
    var title = opts.title || '数独练习';
    var sheets = [];

    var cover = el('div', 'sheet');
    cover.appendChild(el('div', 'cover-t', title));
    cover.appendChild(el('div', 'cover-s', '共 ' + items.length + ' 题　｜　按 SE 分值分级　｜　每题唯一解已验证'));
    var box = el('div', 'cover-box');
    var lines = [];
    lines.push('<b>本册说明</b>');
    lines.push('一、难度采用社区通用的 SE 分值（Sudoku Explainer Rating），分值等于解题路径上最难一步的技巧权重。');
    lines.push('二、每题的题型、SE 分值与提示数标在题目上方；答案与解题步骤提要附在文末。');
    lines.push('三、建议按顺序作答；卡住时先回到“候选数”，不要直接猜。');
    var cnt = {};
    items.forEach(function (it) {
      var b = SD.bandLabel(it.se);
      cnt[b] = (cnt[b] || 0) + 1;
    });
    /* 按档位顺序排，别用对象键的插入顺序（否则会出现 L10 排在 L9 前面） */
    var order = SD.BANDS.map(function (b) { return 'L' + b.id + ' ' + b.name; })
      .filter(function (k) { return cnt[k]; });
    lines.push('四、难度构成：' + order.map(function (k) { return k + ' ' + cnt[k] + ' 题'; }).join('，') + '。');
    lines.push('五、生成日期：' + new Date().toLocaleDateString('zh-CN') + '。');
    box.innerHTML = lines.join('<br>');
    cover.appendChild(box);
    sheets.push(cover);

    var pages = Math.ceil(items.length / perPage);
    for (var p = 0; p < pages; p++) {
      var sh = el('div', 'sheet');
      sh.appendChild(sheetHead(title, '第 ' + (p + 1) + ' 部分'));
      var slot = perPage === 4 ? el('div', 'pzgrid') : sh;
      for (var k = 0; k < perPage; k++) {
        var it = items[p * perPage + k];
        if (it) slot.appendChild(puzzleBlock(it, perPage));
      }
      if (perPage === 4) { sh.appendChild(slot); sh.appendChild(draftBox(3)); }
      else if (perPage === 1) sh.appendChild(draftBox(5));
      sheets.push(sh);
    }

    if (opts.answers !== false) {
      var ansPer = 4, apages = Math.ceil(items.length / ansPer);
      for (var a = 0; a < apages; a++) {
        var sh2 = el('div', 'sheet');
        sh2.appendChild(sheetHead(title + ' · 参考答案', '第 ' + (a + 1) + ' 组'));
        var g = el('div', 'ansgrid');
        for (var j = 0; j < ansPer; j++) {
          var it2 = items[a * ansPer + j];
          if (!it2) continue;
          var one = el('div', 'ans');
          one.appendChild(el('div', 'cap', '第 ' + it2.uid + ' 题　' + VN[it2.kind].name + '　SE ' + it2.se.toFixed(1)));
          var nn = boardNode({ puzzle: it2.solution, ctx: it2.ctx, kind: it2.kind },
            { cs: '9mm', flat: true, clean: true, print: true, values: it2.solution, given: it2.solution.map(function () { return true; }) });
          one.appendChild(nn.wrap);
          var tech = Object.keys(it2.techniques).map(function (kk) { return it2.techniques[kk] + '×' + kk; }).join('、');
          one.appendChild(el('div', 'ansline', '共 ' + it2.steps.length + ' 步：' + tech));
          g.appendChild(one);
        }
        sh2.appendChild(g);
        sheets.push(sh2);
      }
    }

    sheets.forEach(function (sh, i) { sh.appendChild(sheetFoot(i + 1, sheets.length, title)); host.appendChild(sh); });
    return sheets.length;
  }

  /* 排版预览：直接把打印用的 .sheet 按 1:1 显示出来，所见即所得 */
  function viewSheets() {
    if (!B.items.length) { toast('先生成题目'); return; }
    buildSheets(B.items, { perPage: +$('#b-per').value, title: $('#b-title').value, answers: $('#b-ans').checked });
    document.body.classList.add('viewing');
    window.scrollTo(0, 0);
  }
  function closeView() { document.body.classList.remove('viewing'); }


  function exportHtml() {
    if (!B.items.length) { toast('先生成题目'); return; }
    buildSheets(B.items, { perPage: +$('#b-per').value, title: $('#b-title').value, answers: $('#b-ans').checked });
    var css = document.getElementById('appcss').textContent;
    var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + $('#b-title').value + '</title><style>' + css +
      '\n.sheets{display:block !important}</style></head><body><div class="sheets">' + $('#sheets').innerHTML + '</div></body></html>';
    download($('#b-title').value + '.html', html, 'text/html');
  }
  function exportJson() {
    if (!B.items.length) { toast('先生成题目'); return; }
    var data = B.items.map(function (it) {
      return {
        uid: it.uid, kind: it.kind, se: +it.se.toFixed(1), band: SD.bandLabel(it.se),
        clues: it.clues, puzzle: it.puzzle.join(''), solution: it.solution.join(''),
        techniques: it.techniques,
        steps: it.steps.map(function (s) { return { name: s.name, se: s.se, text: s.text }; })
      };
    });
    download('sudoku-' + Date.now() + '.json', JSON.stringify(data, null, 2), 'application/json');
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function doPrint() {
    if (!B.items.length) { toast('先生成题目'); return; }
    var n = buildSheets(B.items, { perPage: +$('#b-per').value, title: $('#b-title').value, answers: $('#b-ans').checked });
    $('#print-hint').textContent = '已排版 ' + n + ' 页，正在打开打印对话框；目标选“另存为 PDF”，纸张 A4、边距“无”。';
    document.body.classList.add('viewing');
    window.scrollTo(0, 0);
    setTimeout(function () { window.print(); }, 160);
  }

  /* ================= 初始化 ================= */
  var manualReady = false;

  function initTabs() {
    $$('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.tabs button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $$('.panel').forEach(function (p) { p.classList.remove('on'); });
        $('#panel-' + b.dataset.tab).classList.add('on');
        /* 手册页有 13 张示意图，启动时不必付这个成本，第一次切过去再建 */
        if (b.dataset.tab === 'manual' && !manualReady) { manualReady = true; initManual(); }
      });
    });
  }

  function initPlay() {
    var sel = $('#p-kind');
    SD.VARIANTS.forEach(function (v) { var o = el('option'); o.value = v.id; o.textContent = v.name; sel.appendChild(o); });
    var bs = $('#p-band');
    SD.BANDS.forEach(function (b) {
      var o = el('option'); o.value = b.id;
      o.textContent = 'L' + b.id + ' ' + b.name + '　SE ' + (b.hi >= 99 ? '≥' + b.lo : b.lo + '–' + b.hi);
      bs.appendChild(o);
    });
    bs.value = '5';

    $('#p-new').addEventListener('click', function () { newPuzzle(); });
    $('#p-note').addEventListener('click', function () {
      P.note = !P.note; this.classList.toggle('primary', P.note);
      this.textContent = P.note ? '笔记：开' : '笔记';
    });
    $('#p-cand').addEventListener('click', function () {
      P.candOn = !P.candOn; this.classList.toggle('primary', P.candOn);
      this.textContent = P.candOn ? '候选数：开' : '候选数';
      renderPlay();
    });
    $('#p-hint').addEventListener('click', applyHint);
    $('#p-check').addEventListener('click', function () {
      var bad = 0;
      for (var i = 0; i < 81; i++) if (P.values[i] && P.values[i] !== P.item.solution[i]) bad++;
      toast(bad ? '有 ' + bad + ' 处不对' : '目前都对');
    });
    $('#p-undo').addEventListener('click', doUndo);
    $('#p-pause').addEventListener('click', function () {
      P.paused = !P.paused;
      this.textContent = P.paused ? '继续' : '暂停';
      this.classList.toggle('primary', P.paused);
      $('#p-status').textContent = P.paused ? '已暂停' : '';
    });
    $('#p-reset').addEventListener('click', function () {
      pushUndo();
      P.values = Array.from(P.item.puzzle); P.notes = blankNotes();
      P.sec = 0; P.stepAt = -1; renderPlay();
    });
    $('#p-all').addEventListener('click', playAll);
    $('#p-prev').addEventListener('click', function () { stopPlay(); stepBy(1); });
    $('#p-print').addEventListener('click', printThis);
    $('#p-copy').addEventListener('click', copyPuzzle);

    var pad = $('#p-pad');
    pad.innerHTML = '';
    for (var v = 1; v <= 9; v++) {
      (function (val) {
        var b = el('button', 'btn padbtn');
        b.dataset.v = val;
        b.innerHTML = '<b>' + val + '</b><em>剩 9</em>';
        b.addEventListener('click', function () { inputDigit(val, false); });
        pad.appendChild(b);
      })(v);
    }
    var del = el('button', 'btn padbtn del');
    del.innerHTML = '<b>⌫</b><em>清除</em>';
    del.addEventListener('click', clearCell);
    pad.appendChild(del);

    document.addEventListener('keydown', onKey, true);
    newPuzzle('classic', 5);
  }

  function onKey(e) {
    if (!P.item || !$('#panel-play').classList.contains('on')) return;
    if (document.body.classList.contains('viewing')) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
    var k = e.key;
    /* 注意：按住 Shift 时 e.key 会变成 # @ $ 这些符号（Shift+3 得到 '#'），
       所以数字键优先用 e.code 判断，否则"Shift+数字 记候选"永远不生效。 */
    var code = e.code || '';
    var digit = 0;
    if (/^Digit[1-9]$/.test(code)) digit = +code.slice(5);
    else if (/^Numpad[1-9]$/.test(code)) digit = +code.slice(6);
    else if (k >= '1' && k <= '9') digit = +k;
    if (digit) {
      inputDigit(digit, e.shiftKey);
      e.preventDefault(); return;
    }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { clearCell(); e.preventDefault(); return; }
    if (k === 'ArrowLeft') { moveSel(-1); e.preventDefault(); return; }
    if (k === 'ArrowRight') { moveSel(1); e.preventDefault(); return; }
    if (k === 'ArrowUp') { moveSel(-9); e.preventDefault(); return; }
    if (k === 'ArrowDown') { moveSel(9); e.preventDefault(); return; }
    if (k.toLowerCase() === 'n') { $('#p-note').click(); e.preventDefault(); return; }
    if (k.toLowerCase() === 'u' || (e.ctrlKey && k.toLowerCase() === 'z')) { doUndo(); e.preventDefault(); return; }
    if (k === ' ') { $('#p-pause').click(); e.preventDefault(); }
  }

  function moveSel(d) {
    if (P.sel < 0) { P.sel = d > 0 ? 0 : 80; renderPlay(); return; }
    var next = P.sel + d;
    if (next < 0 || next > 80) return;
    P.sel = next;
    renderPlay();
    var b = $('#p-board .board');
    if (b) b.focus({ preventScroll: true });
  }

  function initTrain() {
    trainTechList();
    $('#t-gen').addEventListener('click', trainGen);
    $('#t-tech').addEventListener('change', function () {
      var k = this.value;
      $('#t-desc').innerHTML = '<b>' + SD.tech[k].name + '</b>（SE ' + SD.tech[k].se.toFixed(1) + '）：' + SD.tech[k].desc;
    });
    $('#t-tech').dispatchEvent(new Event('change'));
  }

  function initBatch() {
    batchVariantList();
    var host = $('#b-mix');
    host.innerHTML = '';
    var DEF = [4, 6, 8, 8, 7, 6, 5, 3, 2, 1];
    var sync = function () { $('#b-total').textContent = totalCount(); };
    SD.BANDS.forEach(function (b, i) {
      var tr = el('tr');
      var d1 = el('td');
      d1.innerHTML = '<b>L' + b.id + ' ' + b.name + '</b><br><span class="small muted">SE ' +
        (b.hi >= 99 ? '≥' + b.lo : b.lo + '–' + b.hi) + '</span>';
      var d2 = el('td', 'small', b.tech);
      var d3 = el('td');
      var inp = el('input');
      inp.type = 'number'; inp.id = 'b-d' + b.id; inp.min = 0; inp.max = 200; inp.value = DEF[i] || 0;
      inp.addEventListener('input', sync);
      inp.addEventListener('change', sync);
      d3.appendChild(inp);
      tr.appendChild(d1); tr.appendChild(d2); tr.appendChild(d3);
      host.appendChild(tr);
    });
    $('#b-total').textContent = totalCount();
    $('#b-go').addEventListener('click', genBatch);
    $('#b-print').addEventListener('click', doPrint);
    $('#b-view').addEventListener('click', viewSheets);
    $('#b-html').addEventListener('click', exportHtml);
    $('#b-json').addEventListener('click', exportJson);
    $('#pv-back').addEventListener('click', closeView);
    $('#pv-print').addEventListener('click', function () { window.print(); });
  }

  /* 玩法示意图：用一张固定的盘面 + 该玩法的真实约束标记，比文字直观得多 */
  var DEMO_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
    .split('').map(Number);
  var DEMO_MASK = (function () {
    var p = DEMO_SOL.slice();
    var idx = C.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
      26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
      55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80], C.mulberry32(4242));
    for (var i = 0; i < 36; i++) p[idx[i]] = 0;
    return p;
  })();
  var demoCache = {};

  /* 示意图数据由 tools/make-demo.js 离线算好（src/demo.js）。
     以前是在启动时用真实求解器现算 13 张，其中锯齿数独一张就要 19 秒，
     整个页面被卡住；现在启动只读数据，0ms。 */
  function demoCtx(d, id) {
    var ctx = C.newCtx(id);
    ctx.kind = id;
    ctx.diag = (id === 'diagonal');
    ctx.regions = d.r;
    ctx.cages = d.cg.map(function (c) { return { cells: c.c, sum: c.s }; });
    ctx.thermos = d.th;
    ctx.arrows = d.ar.map(function (a) { return { circle: a.c, cells: a.l }; });
    ctx.renbans = d.rb;
    ctx.whispers = d.wh;
    ctx.sandwichRows = d.sr;
    ctx.sandwichCols = d.sc;
    ctx.lks = d.lk.map(function (l) { return { cells: l.c, sum: l.s, side: l.d, idx: l.i }; });
    return ctx;
  }

  function demoItem(id) {
    if (demoCache[id]) return demoCache[id];
    var d = SD.DEMO && SD.DEMO[id];
    var ctx, puzzle, solution;
    if (d) {
      ctx = demoCtx(d, id);
      puzzle = d.p.split('').map(Number);
      solution = d.s.split('').map(Number);
    } else {
      /* 兜底：数据缺失时退回最简的经典盘，绝不在启动路径上跑求解器 */
      ctx = C.newCtx('classic');
      puzzle = DEMO_MASK.slice();
      solution = DEMO_SOL.slice();
    }
    var it = { kind: id, ctx: ctx, puzzle: puzzle, solution: solution };
    demoCache[id] = it;
    return it;
  }

  function initManual() {
    var tb = $('#m-band');
    SD.BANDS.forEach(function (b) {
      var tr = el('tr');
      tr.appendChild(el('td', 'se', 'L' + b.id));
      tr.appendChild(el('td', null, (b.hi >= 99 ? '≥ ' + b.lo : b.lo + ' – ' + b.hi)));
      tr.appendChild(el('td', null, b.tech));
      tr.appendChild(el('td', 'small', b.name + '：' + b.note));
      tb.appendChild(tr);
    });

    var tbody = $('#m-tech');
    var keys = Object.keys(SD.tech).filter(function (k) { return k !== 'variant'; });
    keys.sort(function (a, b) { return SD.tech[a].se - SD.tech[b].se; });
    keys.forEach(function (k) {
      var tr = el('tr');
      tr.appendChild(el('td', 'se', SD.tech[k].se.toFixed(1)));
      tr.appendChild(el('td', null, SD.tech[k].name));
      tr.appendChild(el('td', null, SD.tech[k].desc));
      tbody.appendChild(tr);
    });

    var host = $('#m-var');
    host.innerHTML = '';
    SD.VARIANTS.forEach(function (v) {
      var card = el('div', 'varcard');
      var demo = el('div', 'vdemo');
      try {
        var it = demoItem(v.id);
        var n = boardNode(it, { cs: 21, values: it.puzzle, given: it.puzzle.map(function (x) { return !!x; }) });
        demo.appendChild(n.wrap);
      } catch (e) {
        demo.appendChild(el('div', 'small muted', '示意图生成失败'));
      }
      var body = el('div', 'vbody');
      body.innerHTML =
        '<div class="vhead"><b>' + v.name + '</b><span class="tag ' + (v.tag === '变种' ? 'vt' : v.tag === '混合' ? 'vm' : 'vc') + '">' + v.tag + '</span></div>' +
        '<div class="vrule"><b>规则</b>' + v.rule + '</div>' +
        '<div class="vhow"><b>怎么玩</b>' + v.how.split('\n').map(function (s) { return '<div>' + s + '</div>'; }).join('') + '</div>' +
        '<div class="vtips"><b>突破口</b>' + v.tips + '</div>' +
        '<div class="vdiff"><b>难度</b>' + v.diff + '</div>';
      card.appendChild(demo);
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    initTabs();
    initPlay();
    initTrain();
    initBatch();          /* 手册页（13 张示意图）延迟到第一次切过去时再建 */
  });
})();
