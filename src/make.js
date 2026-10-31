/* 数独工坊 · 变种构造与出题 */
(function (root) {
  'use strict';
  var SD = root.SD, C = SD.core;
  var BIT = C.BIT, ROWS = C.ROWS, COLS = C.COLS;

  var VARIANTS = [
    {
      id: 'classic', name: '经典数独', tag: '标准', clueMode: false,
      rule: '在 9×9 盘面填入 1–9，使每一行、每一列、每一个 3×3 宫里的九个数字都不重复。',
      how: '① 扫宫：某个宫已经填了 8 个数，剩下的那格就是缺的那个数。\n② 扫行列：某个数字在一行（列）里只剩一个位置能放，就放那里。\n③ 卡住时给每个空格写上"还合法的数字"（候选数），候选只剩一个就是答案。\n④ 候选数成结构时，再用数对、区块摒除、鱼形等技巧。',
      tips: '永远从信息最多的地方下手：已填得最多的行、列、宫。',
      diff: '难度完全由 SE 分值决定，与提示数无关；17 个提示也可能是极简题。',
      desc: '最基础的玩法，所有技巧训练的起点。'
    },
    {
      id: 'diagonal', name: '对角线数独', tag: '变种', clueMode: false,
      rule: '经典规则之外，两条主对角线（左上→右下、右上→左下）上的九个数字也必须是 1–9 不重复。',
      how: '① 两条对角线各有 9 格，且与全部 9 个宫都相交，是全盘信息最密集的两条线。\n② 中心格 R5C5 同时属于两条对角线、一行、一列、一宫，是全盘约束最强的格子，通常最先能定。\n③ 对角线上的数字会同时约束行、列、宫，常能直接推出"某数只能落在对角线的某格"。',
      tips: '第一眼先看 R5C5，再看两条对角线的首尾四角（R1C1、R1C9、R9C1、R9C9）。',
      diff: '门槛最低的变种，几乎不增加记忆负担，只多两条线的排除。',
      desc: '门槛最低的变种，几乎不增加记忆负担。'
    },
    {
      id: 'antiknight', name: '反骑士数独', tag: '变种', clueMode: false,
      rule: '经典规则之外，任何"马步"相隔的两格（横 1 竖 2、或横 2 竖 1，共 8 个方向）都不能填相同的数字。',
      how: '① 先按经典方法推进。\n② 当某个数字在盘上出现两次以上时，用马步去"点"：落在它马步位置上的格子都可以排除这个数字。\n③ 一个格子最多有 8 个马步邻居，越靠边角越少（角上只有 2 个），所以边角的约束最松、中部最紧。',
      tips: '中部三行三列的马步约束最强，突破口常在那里；边角格反而更自由。',
      diff: '约束不成行成列，需要"点数"，比对角线稍难。',
      desc: '约束检查型变种，适合练空间核对。'
    },
    {
      id: 'antiking', name: '反王数独', tag: '变种', clueMode: false,
      rule: '经典规则之外，任何相邻的格子（上下左右 + 四个斜角，共 8 个方向）都不能填相同的数字。',
      how: '① 反王约束等价于"任意 2×2 小块里，同一个数字最多出现一次"——因为 2×2 里任意两格都相邻。\n② 于是可以把盘面看成 64 个互相重叠的 2×2 窗口，逐个窗口扫，比逐格数邻居快得多。\n③ 任意 3 格的"L 形"里同样不能出现两个相同数字。',
      tips: '把"反王"翻译成"2×2 不许重号"，扫窗口比数八邻域直观得多。',
      diff: '约束比反骑士更密，提示数很少也能唯一。',
      desc: '比反骑士更密，盘面更受束缚。'
    },
    {
      id: 'jigsaw', name: '锯齿数独', tag: '变种', clueMode: false,
      rule: '盘面被划分成九个不规则形状的"宫"，每块正好 9 格且彼此连通；每一行、每一列、每一块里 1–9 都不能重复。',
      how: '① 规则与经典完全一样，只是"宫"不再是 3×3，而是任意形状的九连块。\n② 先盯形状最紧凑的那一块（比如 2×3 再加三格），它的排除最有效。\n③ 边界交错处——某块伸出一条"尾巴"、或两块的边互相咬合——往往是关键，那条尾巴能放的数字极少。',
      tips: '把不规则宫当成"会拐弯的行"来扫；不要用 3×3 的习惯去看盘面。',
      diff: '难度取决于形状的规整程度：块越细长、越难扫。',
      desc: '打破"扫宫"习惯，靠空间感。'
    },
    {
      id: 'killer', name: '杀手数独', tag: '变种', clueMode: true,
      rule: '盘面被虚线分成若干"笼"。每个笼里的数字不能重复，且加起来必须等于笼左上角标的小数字。通常只给很少的提示数。',
      how: '① 先扫两格笼的极值：和=3 只能是 {1,2}，和=17 只能是 {8,9}，和=4 是 {1,3}，和=16 是 {7,9}。\n② 再看三格笼：和=6 只能是 {1,2,3}，和=24 只能是 {7,8,9}，和=7 只能是 {1,2,4}。把"和 ÷ 格数"换算成候选组合，是杀手最核心的一步。\n③ 用"45 法则"：一行（列、宫）九格总和必为 45。若某行里的笼几乎覆盖整行、只留一格在行外，那么 45 减去这些笼的和，就是那一格（或那一串"溢出格"）的和。\n④ 笼内数字不重复，等于多了一个"迷你宫"，可以反过来做摒除。',
      tips: '45 法则（内和 / 外和）是杀手的主力武器；两格笼的极值一定要先扫一遍。',
      diff: '算术推理独立于行列宫，难度主要由笼的大小与提示数决定：笼越大越少，越需要组合枚举。',
      desc: '变种里最流行的一种，多出一整层算术推理。'
    },
    {
      id: 'thermo', name: '温度计数独', tag: '变种', clueMode: true,
      rule: '盘面上的"温度计"由一串格子组成，圆球端是起点、尖端是终点；从圆球到尖端，数字必须严格递增（不能相等）。',
      how: '① 一条 3 格温度计，最小是 1-2-3、最大是 7-8-9，首格最多到 7、末格最少是 3。\n② 通式：n 格温度计的第 k 格（从 1 数）最小是 k、最大是 9-(n-k)。例如 4 格温度计的第三格只能在 3–8 之间。\n③ 温度计穿过某个宫时，宫的排除会同时压缩这条线的取值范围，两边一起收，收敛很快。',
      tips: '先看最长的温度计（4 格以上），它的首末端取值范围被压得最窄。',
      diff: '纯序关系、不含算术，但"递增"会把候选数砍得非常狠。',
      desc: '纯序关系、不含算术，最优雅的附加约束。'
    },
    {
      id: 'arrow', name: '箭头数独', tag: '变种', clueMode: true,
      rule: '每个箭头由一个圆圈和一串箭身格子组成。圆圈里的数字必须等于箭身上所有数字之和。',
      how: '① 箭身越长，圆圈越大：3 格箭身最小和是 1+2+3=6，所以圆圈至少是 6。\n② 反过来，圆圈是 2 或 3 时，箭身最多两格，而且只能是小数字。\n③ 箭身里的数字互不相同（同一行 / 列 / 宫的排除），所以"和"的下界与上界都能算得很准，两端一夹就能删候选。',
      tips: '先算每条箭头的"和的范围"（最小和 / 最大和），再看圆圈格的候选能不能落进这个区间。',
      diff: '单条箭头很弱，成组出现时力量陡增；难度主要看箭头数量与箭身长度。',
      desc: '单条偏弱，成组布置后力量很强。'
    },
    {
      id: 'sandwich', name: '三明治数独', tag: '变种', clueMode: true,
      rule: '盘面外侧标着的数字，表示该行（列）中，夹在 1 和 9 之间所有数字的和。',
      how: '① 记法：盘外数字 = 该行 1 与 9 之间（不含 1、9 本身）所有格子的和。\n② 两条极值要背下来：0 表示 1 和 9 紧挨着；35 表示 1 和 9 在行的两端（中间 7 格全算）。\n③ 全行总和是 45，所以"1、9 之外的格子"之和 = 45 − 盘外数字 − 1 − 9 = 35 − 盘外数字，这个数就是该行剩余的"外部和"。\n④ 盘外数字越大，1 和 9 分得越开；越小，两者越近。',
      tips: '先记 0（相邻）和 35（两端）两个极端，它们能立刻定死一批格子。',
      diff: '关键在"1 和 9 在哪"，其次是区间求和；计算量不大但很吃细心。',
      desc: '0 表示 1 和 9 相邻，35 表示两者在两端。'
    },
    {
      id: 'littlekiller', name: '小杀手数独', tag: '变种', clueMode: true,
      rule: '盘面外侧的箭头指向一条 45° 斜线，箭头上标的数字表示这条斜线上所有格子的数字之和。',
      how: '① 斜线从盘外射入、贯穿到盘边，长度 1–9 格不等。\n② 先看只有 1–2 格的短斜线：1 格的就是直接给出的数，2 格的用极值（和=3 → {1,2}）就能定。\n③ 长斜线用"最小和 / 最大和"夹逼：n 格斜线和最小是 1+2+…+n，最大是 9+8+…+(10−n)。\n④ 贯穿全盘的 9 格斜线，和必然是 45。',
      tips: '短斜线优先；见到 45 就知道那是整条对角线，可以反过来推对角线的排布。',
      diff: '约束是"整条线"级别，切断分支很有效，但也容易让题目变脆。',
      desc: '全局约束，切断分支很有效。'
    },
    {
      id: 'renban', name: '连续数独', tag: '变种', clueMode: true,
      rule: '紫色线上的格子必须填入一组连续的数字，顺序不限。例如 4 格线只能是 {1,2,3,4}、{2,3,4,5} … {6,7,8,9} 之一。',
      how: '① n 格线等价于"n 个连续整数构成的集合"，只有 10−n 种可能。\n② 长度决定范围：4 格线只有 6 种窗口，2 格线则是"任意两个相差 1 的数"。\n③ 线的两端常被行、列、宫的排除压得很窄，从两端往里推最快。',
      tips: '先算这条线可能落在哪个"窗口"（有几种连续区间），窗口越少越好推。',
      diff: '约束温和但很"粘"，常与其他变种叠加使用。',
      desc: '近代变种主流，逻辑新颖。'
    },
    {
      id: 'whisper', name: '耳语数独', tag: '变种', clueMode: true,
      rule: '绿色虚线（耳语线）上相邻的两格，数字之差必须至少为 5。',
      how: '① 差 ≥ 5 的配对只有这些：1 只能配 6/7/8/9；2 只能配 7/8/9；3 只能配 8/9；4 只能配 9。\n② 反过来 6/7/8/9 只能配 1/2/3/4，完全对称。\n③ 关键结论：5 不可能出现在任何耳语线上——它和 1 差 4、和 9 也差 4，都不够 5。所以线上任何格子的候选数都可以直接删掉 5。',
      tips: '记住"5 不上线"，能立刻删掉一批候选；线的两端通常是小数字与大数字的跳变。',
      diff: '局部性强、推理简单，非常适合与其他变种叠加。',
      desc: '相邻差约束，容易与别的变种叠加。'
    },
    {
      id: 'hybrid', name: '混合变种', tag: '混合', clueMode: true,
      rule: '同时使用杀手笼与温度计两套约束：虚线笼内数字不重复且和等于标注值；温度计上的数字从圆球到尖端严格递增。',
      how: '① 两套约束会互相加强：温度计上的格子如果落在笼里，笼的"和"与"递增"可以一起夹逼。\n② 先分别推进——只有温度计没有笼的区域、只有笼没有温度计的区域，各推到极限。\n③ 两条推理链在交汇处合流，往往能一步定死。',
      tips: '把它们当成两条独立的推理链，各自推到极限后再在交汇处合流。',
      diff: '难度叠加，通常比单一变种明显更难。',
      desc: '两类约束互相加强，1+1>2。'
    }
  ];

  /* 难度不按"四档"分，而是按 SE 分值细分成 10 级，每级刚好卡在一个技巧台阶上。
     lo/hi 就是这一级允许的最高技巧权重；floor 是该级挖洞时保留的最少提示数。 */
  var BANDS = [
    { id: 1, name: '极简', lo: 0, hi: 1.2, floor: 38, tech: '全宫唯一、宫隐性唯一', note: '一眼能填，用来熟悉规则' },
    { id: 2, name: '入门', lo: 1.3, hi: 1.9, floor: 21, tech: '行列隐性唯一', note: '扫行扫列就能推进' },
    { id: 3, name: '初级', lo: 2.0, hi: 2.5, floor: 21, tech: '唯余解', note: '开始需要写候选数' },
    { id: 4, name: '中低', lo: 2.6, hi: 2.9, floor: 21, tech: '区块摒除（指向 / 声明）', note: '要看出"数字被锁在一条线"上' },
    { id: 5, name: '中等', lo: 3.0, hi: 3.3, floor: 21, tech: '显性数对、X-Wing', note: '社区常说的标准难度' },
    { id: 6, name: '中高', lo: 3.4, hi: 3.7, floor: 21, tech: '隐性数对、显性三数集', note: '要认得候选结构' },
    { id: 7, name: '高难', lo: 3.8, hi: 4.1, floor: 21, tech: '剑鱼、隐性三数集', note: '鱼形结构开始出现' },
    { id: 8, name: '艰深', lo: 4.2, hi: 4.5, floor: 21, tech: 'XY-Wing', note: '需要链式推理' },
    { id: 9, name: '专家', lo: 4.6, hi: 6.0, floor: 21, tech: '显性四数集、变种推理', note: '跨多个高阶技巧' },
    { id: 10, name: '大师', lo: 6.1, hi: 99, floor: 21, tech: '假设法 / 反证', note: '必须靠假设再排除' }
  ];

  function bandOf(se) {
    for (var i = 0; i < BANDS.length; i++) if (se <= BANDS[i].hi + 1e-9) return BANDS[i].id;
    return BANDS[BANDS.length - 1].id;
  }
  function bandInfo(se) {
    var b = bandOf(se);
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].id === b) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }
  function bandLabel(se) {
    var b = bandInfo(se);
    return 'L' + b.id + ' ' + b.name;
  }
  function variantById(id) {
    for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].id === id) return VARIANTS[i];
    return VARIANTS[0];
  }

  function knightPairs(ctx) {
    var mv = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
    for (var i = 0; i < 81; i++) {
      for (var k = 0; k < 8; k++) {
        var r = C.rIdx(i) + mv[k][0], c = C.cIdx(i) + mv[k][1];
        if (r < 0 || r > 8 || c < 0 || c > 8) continue;
        var j = r * 9 + c;
        if (j > i) ctx.pairs.push([i, j]);
      }
    }
  }
  function kingPairs(ctx) {
    for (var i = 0; i < 81; i++) {
      var r = C.rIdx(i), c = C.cIdx(i);
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 8 || cc < 0 || cc > 8) continue;
        var j = rr * 9 + cc;
        if (j > i) ctx.pairs.push([i, j]);
      }
    }
  }

  function makeCtx(kind, rng) {
    var ctx = C.newCtx(kind);
    if (kind === 'diagonal') ctx.diag = true;
    if (kind === 'antiknight') knightPairs(ctx);
    if (kind === 'antiking') kingPairs(ctx);
    if (kind === 'jigsaw') {
      var regions = C.makeJigsaw(rng);
      if (!regions && rng() < 0.5) regions = C.makeJigsaw(rng);
      if (!regions) regions = C.fixedJigsaw();
      ctx.regions = regions;
    }
    return ctx;
  }

  /* ---------- 线索构造 ---------- */
  function addCages(ctx, sol, rng) {
    var free = {};
    for (var i = 0; i < 81; i++) free[i] = 1;
    var left = 81, guard = 0;
    while (left > 0 && guard++ < 200) {
      var seeds = Object.keys(free).map(Number);
      if (!seeds.length) break;
      var pick = seeds[(rng() * seeds.length) | 0];
      var size = 2 + ((rng() * 4) | 0);   /* 2-5 格笼：笼越大，和越弱，题目越有推理空间 */
      if (left - size < 2) size = Math.min(2, left);
      var cells = [pick];
      delete free[pick]; left--;
      while (cells.length < size) {
        var nb = [];
        var inCage = {};
        for (var t2 = 0; t2 < cells.length; t2++) inCage[sol[cells[t2]]] = 1;
        for (var c = 0; c < cells.length; c++) {
          var ns = C.neighbours(cells[c]);
          for (var z = 0; z < ns.length; z++) {
            /* 杀手规则：笼内数字不能重复。同一行/列/宫的两格天然不同，
               真正会撞的是"不同行也不同列"的斜对角格，必须在建笼时就排除。 */
            if (!free[ns[z]] || nb.indexOf(ns[z]) >= 0 || inCage[sol[ns[z]]]) continue;
            nb.push(ns[z]);
          }
        }
        if (!nb.length) break;
        var cell = nb[(rng() * nb.length) | 0];
        cells.push(cell); delete free[cell]; left--;
      }
      var sum = 0;
      for (var t = 0; t < cells.length; t++) sum += sol[cells[t]];
      ctx.cages.push({ cells: cells, sum: sum });
    }
    /* 收尾：单格笼（和数 = 该格答案）其实就是"给定提示"，留着不好看也没有推理价值。
       直接丢掉即可——它原本提供的唯一性由挖洞阶段的 countSolutions 校验兜底。 */
    ctx.cages = ctx.cages.filter(function (c) { return c.cells.length > 1; });
  }

  function walkValid(sol, start, len, pred, rng, limit) {
    var tries = limit || 120, best = null;
    for (var t = 0; t < tries; t++) {
      var path = [start], cur = start, ok = true;
      for (var k = 1; k < len; k++) {
        var ns = C.neighbours(cur).filter(function (n) { return path.indexOf(n) < 0; });
        if (!ns.length) { ok = false; break; }
        var good = ns.filter(function (n) { return pred(path, n); });
        if (!good.length) { ok = false; break; }
        cur = good[(rng() * good.length) | 0];
        path.push(cur);
      }
      if (ok && path.length === len) { best = path; break; }
    }
    return best;
  }

  function addThermos(ctx, sol, rng, count) {
    var used = {}, made = 0, guard = 0;
    while (made < count && guard++ < 200) {
      var start = (rng() * 81) | 0;
      if (used[start]) continue;
      var len = 2 + ((rng() * 4) | 0);
      var path = walkValid(sol, start, len, function (p, n) {
        return sol[n] > sol[p[p.length - 1]] && !used[n];
      }, rng);
      if (!path) continue;
      var clash = path.some(function (i) { return used[i]; });
      if (clash) continue;
      path.forEach(function (i) { used[i] = 1; });
      ctx.thermos.push(path); made++;
    }
  }

  function addArrows(ctx, sol, rng, count) {
    var used = {}, made = 0, guard = 0;
    while (made < count && guard++ < 260) {
      var circle = (rng() * 81) | 0;
      if (used[circle]) continue;
      var target = sol[circle], path = null;
      var len = 2 + ((rng() * 2) | 0);
      for (var t = 0; t < 80 && !path; t++) {
        var start = C.neighbours(circle)[(rng() * 4) | 0];
        if (start === undefined || used[start]) continue;
        var sub = [start], sum = sol[start];
        var ok = false;
        (function dfs(cur, sum, depth) {
          if (ok) return;
          if (depth >= 2 && sum === target) { path = sub.slice(); ok = true; return; }
          if (depth >= len || sum >= target) return;
          var ns = C.neighbours(cur).filter(function (n) { return n !== circle && sub.indexOf(n) < 0 && !used[n]; });
          C.shuffle(ns, rng);
          for (var k = 0; k < ns.length; k++) {
            sub.push(ns[k]);
            dfs(ns[k], sum + sol[ns[k]], depth + 1);
            sub.pop();
            if (ok) return;
          }
        })(start, sum, 1);
      }
      if (!path) continue;
      var all = [circle].concat(path);
      var bad = all.some(function (i) { return used[i]; });
      if (bad) continue;
      all.forEach(function (i) { used[i] = 1; });
      ctx.arrows.push({ circle: circle, cells: path });
      made++;
    }
  }

  function addRenban(ctx, sol, rng, count) {
    var used = {}, made = 0, guard = 0;
    while (made < count && guard++ < 220) {
      var start = (rng() * 81) | 0;
      if (used[start]) continue;
      var len = 3 + ((rng() * 3) | 0);
      var path = walkValid(sol, start, len, function (p, n) {
        if (used[n]) return false;
        var vals = p.map(function (i) { return sol[i]; }).concat([sol[n]]);
        var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
        return max - min <= len - 1 && new Set(vals).size === vals.length;
      }, rng, 160);
      if (!path) continue;
      if (path.some(function (i) { return used[i]; })) continue;
      path.forEach(function (i) { used[i] = 1; });
      ctx.renbans.push(path); made++;
    }
  }

  function addWhispers(ctx, sol, rng, count) {
    var used = {}, made = 0, guard = 0;
    while (made < count && guard++ < 220) {
      var start = (rng() * 81) | 0;
      if (used[start]) continue;
      var len = 3 + ((rng() * 3) | 0);
      var path = walkValid(sol, start, len, function (p, n) {
        return !used[n] && Math.abs(sol[n] - sol[p[p.length - 1]]) >= 5;
      }, rng, 160);
      if (!path) continue;
      if (path.some(function (i) { return used[i]; })) continue;
      path.forEach(function (i) { used[i] = 1; });
      ctx.whispers.push(path); made++;
    }
  }

  function addSandwich(ctx, sol, rng) {
    function sumBetween(cells) {
      var p1 = -1, p9 = -1;
      for (var k = 0; k < 9; k++) { if (sol[cells[k]] === 1) p1 = k; if (sol[cells[k]] === 9) p9 = k; }
      var lo = Math.min(p1, p9), hi = Math.max(p1, p9), s = 0;
      for (var i = lo + 1; i < hi; i++) s += sol[cells[i]];
      return s;
    }
    var rows = C.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, 3 + ((rng() * 3) | 0));
    var cols = C.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, 3 + ((rng() * 3) | 0));
    rows.forEach(function (r) { ctx.sandwichRows[r] = sumBetween(ROWS[r]); });
    cols.forEach(function (c) { ctx.sandwichCols[c] = sumBetween(COLS[c]); });
  }

  function diagCells(side, k) {
    // side: TL(顶行出发向右下) TR(顶行出发向左下) BL(左列出发向右下) BR(右列出发向左下)
    var cells = [], r, c;
    if (side === 'TL') { r = 0; c = k; while (r < 9 && c < 9) { cells.push(r * 9 + c); r++; c++; } }
    if (side === 'TR') { r = 0; c = k; while (r < 9 && c >= 0) { cells.push(r * 9 + c); r++; c--; } }
    if (side === 'BL') { c = 0; r = k; while (r < 9 && c < 9) { cells.push(r * 9 + c); r++; c++; } }
    if (side === 'BR') { c = 8; r = k; while (r < 9 && c >= 0) { cells.push(r * 9 + c); r++; c--; } }
    return cells;
  }

  function addLittleKiller(ctx, sol, rng) {
    var sides = ['TL', 'TR', 'BL', 'BR'], n = 0, guard = 0;
    var want = 2 + ((rng() * 3) | 0);
    while (n < want && guard++ < 60) {
      var side = sides[(rng() * 4) | 0];
      var k = (rng() * 9) | 0;
      var cells = diagCells(side, k);
      if (cells.length < 3) continue;
      var dup = ctx.lks.some(function (l) { return l.cells[0] === cells[0]; });
      if (dup) continue;
      var sum = 0; cells.forEach(function (i) { sum += sol[i]; });
      ctx.lks.push({ cells: cells, sum: sum, side: side, k: k });
      n++;
    }
  }

  function addClues(kind, ctx, sol, rng) {
    if (kind === 'killer') addCages(ctx, sol, rng);
    if (kind === 'thermo') addThermos(ctx, sol, rng, 7 + ((rng() * 4) | 0));
    if (kind === 'arrow') addArrows(ctx, sol, rng, 4 + ((rng() * 2) | 0));
    if (kind === 'sandwich') addSandwich(ctx, sol, rng);
    if (kind === 'littlekiller') addLittleKiller(ctx, sol, rng);
    if (kind === 'renban') addRenban(ctx, sol, rng, 6 + ((rng() * 3) | 0));
    if (kind === 'whisper') addWhispers(ctx, sol, rng, 5 + ((rng() * 3) | 0));
    if (kind === 'hybrid') { addCages(ctx, sol, rng); addThermos(ctx, sol, rng, 4); }
  }

  function fillUntilUnique(ctx, peers, sol, rng) {
    var p = new Uint8Array(81);
    if (C.countSolutions(ctx, peers, p, 2) === 1) return p;
    var order = C.shuffle([...Array(81).keys()], rng);
    for (var k = 0; k < order.length; k++) {
      p[order[k]] = sol[order[k]];
      if (C.countSolutions(ctx, peers, p, 2) === 1) {
        for (var t = order.length - 1; t >= 0; t--) {
          var i = order[t];
          if (!p[i]) continue;
          var v = p[i];
          p[i] = 0;
          if (C.countSolutions(ctx, peers, p, 2) !== 1) p[i] = v;
        }
        return p;
      }
    }
    return p;
  }


  function repairBand(ctx, peers, p, sol, band, rng) {
    if (band >= 9) return p;                       /* 高档位不够就补，补了只会更简单 */
    var r = SD.rate(ctx, p), rb = bandOf(r.se);
    for (var it = 0; it < 30 && rb !== band; it++) {
      var empties = [], i;
      for (i = 0; i < 81; i++) if (!p[i]) empties.push(i);
      if (rb < band) break;                        /* 已经比目标简单，不能再补 */
      if (!empties.length) break;
      var ei = empties[(rng() * empties.length) | 0];
      p[ei] = sol[ei];
      r = SD.rate(ctx, p);
      rb = bandOf(r.se);
    }
    return p;
  }

  function digToBand(ctx, peers, sol, band, rng, opt) {
    opt = opt || {};
    var spec = BANDS[band - 1] || BANDS[BANDS.length - 1];
    var p = Uint8Array.from(sol);
    var order = C.shuffle([...Array(81).keys()], rng);
    var cap = opt.cap != null ? opt.cap : spec.hi;
    var maxFails = opt.fails || 400;
    var fails = 0;
    var floor = opt.floor || spec.floor;
    var dl = opt.deadline || 0;
    /* 最高一档（大师）不逐次校验：这类题就是要挖到底，让它一路用到假设法 */
    var checkCap = opt.deep || band < 10;
    for (var k = 0; k < order.length; k++) {
      if (dl && Date.now() > dl) break;
      if (C.countClues(p) <= floor) break;
      var i = order[k], v = p[i];
      p[i] = 0;
      if (C.countSolutions(ctx, peers, p, 2, 30000) !== 1) { p[i] = v; continue; }
      if (!checkCap) continue;
      var r = SD.rate(ctx, p);
      if (r.invalid || !r.solved || r.se > cap + 0.001) {
        p[i] = v;
        if (++fails > maxFails) break;
        continue;
      }
      /* 已经落进目标档位就停手：再挖只会更慢，也更容易越过上限 */
      if (!opt.deep && band > 3 && bandOf(r.se) === band) break;
    }
    return p;
  }

  var CLUE_TARGET = { 1: 40, 2: 33, 3: 28, 4: 24 };

  function attempt(kind, band, rng, budget) {
    var left = budget || 2400;
    C.setDeadline(Date.now() + Math.min(1000, left * 0.45));
    var ctx = makeCtx(kind, rng);
    var sol = C.generateFull(ctx, rng, 8);
    C.setDeadline(0);
    if (!sol) return null;                          /* 布局本身无解或算不出来，换一个 */
    var dl = Date.now() + Math.max(400, left * 0.6);
    C.setDeadline(dl);                              /* 挖洞阶段的硬上限 */
    addClues(kind, ctx, sol, rng);
    var peers = C.buildPeers(ctx);
    var t0 = Date.now();
    var p = digToBand(ctx, peers, sol, band, rng, { deadline: dl });
    C.setDeadline(0);
    if (C.countSolutions(ctx, peers, p, 2, 60000) !== 1) return null;
    p = repairBand(ctx, peers, p, sol, band, rng);
    var rating = SD.rate(ctx, p);
    if (!rating.solved || rating.invalid) return null;   /* 讲不清解题路径的题不要 */
    return {
      kind: kind, puzzle: Array.from(p), solution: Array.from(sol), clues: C.countClues(p),
      se: rating.se, solved: rating.solved, steps: rating.steps, techniques: rating.techniques,
      topName: rating.topName, topType: rating.topType, cageBase: rating.cageBase,
      band: bandOf(rating.se), ms: Date.now() - t0, ctx: ctx
    };
  }

  function makePuzzle(kind, band, seed, depth) {
    var rng = seed === undefined ? Math.random : C.mulberry32(seed);
    var best = null, bestScore = 1e9;
    var spec = BANDS[band - 1] || BANDS[BANDS.length - 1];
    var mid = spec.hi >= 99 ? 6.8 : (spec.lo + spec.hi) / 2;
    var t0 = Date.now(), BUDGET = kind === 'jigsaw' ? 3600 : 3000;
    for (var t = 0; t < 12; t++) {
      var left = BUDGET - (Date.now() - t0);
      if (t > 0 && left < 500) break;
      var r = attempt(kind, band, rng, Math.min(1700, Math.max(500, left)));
      if (!r) continue;
      var score = Math.abs(r.band - band) * 100 + Math.abs(r.se - mid);
      if (score < bestScore) { bestScore = score; best = r; }
      if (r.band === band) break;
    }
    if (!best && band > 1 && (depth || 0) < 3) {
      /* 这个玩法在这个档位实在出不来（比如杀手题本身偏易），退一档保证有题可用 */
      return makePuzzle(kind, band - 1, seed, (depth || 0) + 1);
    }
    return best;
  }

  /* 专项训练：只出「一定用到某个技巧」的题。
     做法是按该技巧所在难度带卡上限挖洞，挖完要求解题步骤里真的出现该技巧；
     出现的概率随技巧稀有度下降，所以给足尝试次数（快技巧几次就中，剑鱼要几十次）。 */
  function makeForTech(techId, kind, seed, tries) {
    var spec = SD.tech[techId];
    if (!spec) return null;
    kind = kind || 'classic';
    var band = bandOf(spec.se);
    var rng = seed === undefined ? Math.random : C.mulberry32(seed);
    var floor = spec.se >= 3.0 ? 22 : spec.se >= 2.3 ? 24 : 32;
    var n = tries || 20, t0 = Date.now();
    var opt = { floor: floor, cap: Math.min(5.2, spec.se + 0.6), fails: 400, deep: true };
    for (var t = 0; t < n; t++) {
      if (t > 0 && Date.now() - t0 > 3000) break;
      var ctx = makeCtx(kind, rng);
      var sol = C.generateFull(ctx, rng);
      if (!sol) continue;
      addClues(kind, ctx, sol, rng);
      var peers = C.buildPeers(ctx);
      var p = digToBand(ctx, peers, sol, band, rng, opt);
      if (C.countSolutions(ctx, peers, p, 2, 60000) !== 1) continue;
      var r = SD.rate(ctx, p);
      if (!r.solved) continue;
      var inPath = false;
      for (var k = 0; k < r.steps.length; k++) if (r.steps[k].type === techId) { inPath = true; break; }
      /* 只用"扫描"兜底时，要求题目本身已经接近该技巧的难度，否则会在入门题里看到
         一个根本用不上的鱼形，反而误导。 */
      if (!inPath && r.se < spec.se - 1.0) continue;
      var teach = inPath ? null : SD.scanTech(ctx, p, techId);
      if (!inPath && !teach) continue;
      return {
        kind: kind, puzzle: Array.from(p), solution: Array.from(sol), clues: C.countClues(p),
        se: r.se, solved: true, steps: r.steps, techniques: r.techniques,
        band: bandOf(r.se), ms: Date.now() - t0, ctx: ctx,
        techHit: inPath, teach: teach
      };
    }
    return null;
  }

  function makeBatch(spec) {
    // spec: {items:[{kind, band, count}], seed}
    var out = [], rng = spec.seed === undefined ? Math.random : C.mulberry32(spec.seed);
    spec.items.forEach(function (it) {
      for (var k = 0; k < it.count; k++) {
        var r = makePuzzle(it.kind, it.band, (rng() * 1e9) | 0);
        if (r) { r.uid = out.length + 1; out.push(r); }
      }
    });
    return out;
  }

  SD.VARIANTS = VARIANTS;
  SD.BANDS = BANDS;
  SD.bandOf = bandOf;
  SD.bandInfo = bandInfo;
  SD.bandLabel = bandLabel;
  SD.variantById = variantById;
  SD.makeCtx = makeCtx;
  SD.addClues = addClues;
  SD.makePuzzle = makePuzzle;
  SD.makeForTech = makeForTech;
  SD.makeBatch = makeBatch;
})(typeof globalThis !== 'undefined' ? globalThis : this);
