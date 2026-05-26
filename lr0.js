/* ════════════════════════════════════════════════════════════
   实验三 — LR(0) 项目集规范族可视化
   提供 mountLab3(root)，由 app.js 在激活时调用。
   样例文件：grammar.txt（与 DEFAULT_GRAMMAR 内容一致）。
   已修复：itemSetKey 改数值排序（p>=10 不再错位）、parseGrammar 加输入
   校验、posCache 改按项目集签名 sig 跨文法失效、accept 节点半径在边端点
   中体现。布局：分层(BFS) + 重心法 + 相邻交换(transpose)降交叉，
   边标签做去重叠分离，避免两条边的符号压在一起。
   ════════════════════════════════════════════════════════════ */
function mountLab3(root) {
  root.innerHTML = `
    <div class="lab-grid">
      <aside class="pane pane-left">
        <div class="pane-section">
          <div class="figure-caption">LR(0)</div>
          <div class="figure-note">从文法规则构造增广文法、闭包、Goto 与 LR(0) 项目集规范族。</div>
        </div>
        <div class="pane-section">
          <div class="section-title">图例</div>
          <div class="legend">
            <div class="row"><div class="swatch start"></div><div class="label">初始项目集<small>I0</small></div></div>
            <div class="row"><div class="swatch"></div><div class="label">项目集<small>Goto 状态</small></div></div>
            <div class="row"><div class="swatch accept"></div><div class="label">接受项目集<small>S' -> S .</small></div></div>
            <div class="row"><div class="swatch active"></div><div class="label">冲突项目集<small>移进/归约或归约/归约</small></div></div>
          </div>
        </div>
        <div class="pane-section">
          <div class="section-title">全局总览</div>
          <div id="lab3-summary" class="lr0-summary"></div>
        </div>
        <div class="pane-section editor-section">
          <div class="section-title">文法定义<span class="hint">编辑后自动生成</span></div>
          <div class="editor-wrap">
            <textarea class="editor" id="lab3-editor" spellcheck="false"></textarea>
            <div id="lab3-editor-status" class="editor-status ok">就绪</div>
          </div>
          <div class="syntax-help">
            每行一个产生式，可以用 <code>|</code> 表示多个候选式，例如 <code>E -> E + T | T</code>。终结符和非终结符之间请用空格分隔。
          </div>
        </div>
      </aside>

      <main class="pane pane-right">
        <div class="canvas-stage">
          <div class="canvas-corner">
            <div class="fig-num">图 · 02</div>
            <div class="fig-title">LR(0) 项目集规范族 <em>C</em></div>
          </div>
          <div class="canvas-tools">
            <button id="lab3-zoom-out" title="缩小">−</button>
            <button id="lab3-zoom-reset" title="复位缩放">100%</button>
            <button id="lab3-zoom-in" title="放大">+</button>
            <button id="lab3-layout" title="重新整理布局">整理布局</button>
            <button id="lab3-export" title="导出当前图为 SVG">导出 SVG</button>
          </div>
          <svg class="canvas" id="lab3-canvas">
            <defs>
              <marker id="lab3-arrow" viewBox="0 -5 10 10" refX="9" refY="0"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4 L8,0 L0,4 L2,0 Z" fill="#2A2A2A"/>
              </marker>
              <marker id="lab3-arrow-rust" viewBox="0 -5 10 10" refX="9" refY="0"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4 L8,0 L0,4 L2,0 Z" fill="#B85042"/>
              </marker>
            </defs>
          </svg>
        </div>
        <div class="lr0-detail-bar">
          <div class="detail-header">
            <span class="detail-id" id="lab3-status">选择项目集</span>
            <span class="detail-meta" id="lab3-meta"></span>
            <span class="detail-conflict" id="lab3-conflict"></span>
          </div>
          <div class="detail-grid">
            <div class="detail-col">
              <div class="col-title">项目</div>
              <div class="col-body" id="lab3-detail-items"></div>
            </div>
            <div class="detail-col">
              <div class="col-title">Goto 出边</div>
              <div class="col-body" id="lab3-detail-out"></div>
            </div>
            <div class="detail-col">
              <div class="col-title">入边</div>
              <div class="col-body" id="lab3-detail-in"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  const DEFAULT_GRAMMAR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

  function trim(s) { return s.trim(); }
  function splitSymbols(s) { return trim(s).split(/\s+/).filter(Boolean); }
  function itemKey(it) { return it.p + '@' + it.dot; }
  // 按 (p, dot) 数值排序，避免字符串字典序在 p>=10 时把 "10@0" 排到 "2@0" 之前
  function itemSetKey(items) {
    return items.slice()
      .sort((a, b) => a.p - b.p || a.dot - b.dot)
      .map(itemKey)
      .join('|');
  }

  function parseGrammar(src) {
    const rawLines = src.split(/\r?\n/);
    const lines = [];
    rawLines.forEach((raw, i) => {
      const text = raw.replace(/#.*$/, '').trim();
      if (text) lines.push({ ln: i + 1, text });
    });
    if (lines.length === 0) throw new Error('文法为空：请至少写一条产生式');

    const lefts = [], rights = [];
    const nonterminals = new Set();
    const productions = [];
    lines.forEach(({ ln, text }) => {
      const pos = text.indexOf('->');
      if (pos < 0) throw new Error(`第 ${ln} 行缺少 "->"：${text}`);
      const left = trim(text.slice(0, pos));
      const right = trim(text.slice(pos + 2));
      if (!left) throw new Error(`第 ${ln} 行左部为空`);
      if (/\s/.test(left)) throw new Error(`第 ${ln} 行左部 "${left}" 含空格，左部必须是单一非终结符`);
      if (!right) throw new Error(`第 ${ln} 行右部为空（如需 ε 产生式请先与作者确认表示方式）`);
      lefts.push(left); rights.push(right); nonterminals.add(left);
    });
    const start = lefts[0];
    const augmented = nonterminals.has(start + "'") ? start + "''" : start + "'";
    productions.push({ left: augmented, right: [start] });
    nonterminals.add(augmented);
    lefts.forEach((left, i) => {
      rights[i].split('|').forEach((part, j) => {
        const syms = splitSymbols(part);
        if (syms.length === 0) {
          throw new Error(`产生式 "${left} -> ${rights[i]}" 中第 ${j + 1} 个候选式为空`);
        }
        productions.push({ left, right: syms });
      });
    });
    const terminals = new Set();
    productions.forEach(p => p.right.forEach(sym => { if (!nonterminals.has(sym)) terminals.add(sym); }));
    return { start, augmented, productions, nonterminals, terminals };
  }

  function containsItem(items, item) {
    return items.some(x => x.p === item.p && x.dot === item.dot);
  }

  function closure(grammar, seed) {
    const res = seed.slice();
    for (let i = 0; i < res.length; i++) {
      const it = res[i];
      const prod = grammar.productions[it.p];
      if (it.dot >= prod.right.length) continue;
      const sym = prod.right[it.dot];
      if (!grammar.nonterminals.has(sym)) continue;
      grammar.productions.forEach((p, idx) => {
        if (p.left === sym) {
          const next = { p: idx, dot: 0 };
          if (!containsItem(res, next)) res.push(next);
        }
      });
    }
    return res;
  }

  function goTo(grammar, items, symbol) {
    const moved = [];
    items.forEach(it => {
      const prod = grammar.productions[it.p];
      if (it.dot < prod.right.length && prod.right[it.dot] === symbol) {
        moved.push({ p: it.p, dot: it.dot + 1 });
      }
    });
    return moved.length ? closure(grammar, moved) : [];
  }

  function hasAccept(grammar, items) {
    return items.some(it => it.p === 0 && it.dot === grammar.productions[0].right.length);
  }

  function conflictText(grammar, items) {
    let reduce = 0, shift = false;
    items.forEach(it => {
      const prod = grammar.productions[it.p];
      if (it.dot >= prod.right.length) {
        if (it.p !== 0) reduce++;
      } else if (grammar.terminals.has(prod.right[it.dot])) {
        shift = true;
      }
    });
    const out = [];
    if (reduce > 0 && shift) out.push('移进-归约冲突');
    if (reduce > 1) out.push('归约-归约冲突');
    return out.join(', ');
  }

  function buildLR0(grammar) {
    // 按字典序串联 nonterminals + terminals，使 Goto 迭代顺序稳定，
    // 与参考实现（C++ std::set）一致，便于对照状态编号
    const symbols = [
      ...[...grammar.nonterminals].sort(),
      ...[...grammar.terminals].sort()
    ];
    const I0Items = closure(grammar, [{ p: 0, dot: 0 }]);
    const I0Sig = itemSetKey(I0Items);
    const itemSets = [{ id: 'I0', sig: I0Sig, items: I0Items }];
    const seen = new Map([[I0Sig, 0]]);
    const transitions = [];
    for (let i = 0; i < itemSets.length; i++) {
      symbols.forEach(sym => {
        const next = goTo(grammar, itemSets[i].items, sym);
        if (!next.length) return;
        const key = itemSetKey(next);
        let toIndex = seen.get(key);
        if (toIndex == null) {
          toIndex = itemSets.length;
          seen.set(key, toIndex);
          itemSets.push({ id: 'I' + toIndex, sig: key, items: next });
        }
        transitions.push({ from: itemSets[i].id, to: 'I' + toIndex, on: sym });
      });
    }
    const states = itemSets.map(s => ({
      id: s.id,
      sig: s.sig,   // 项目集内容签名，用作跨文法稳定的 posCache key
      items: s.items,
      accept: hasAccept(grammar, s.items),
      conflict: conflictText(grammar, s.items)
    }));
    return { grammar, start: 'I0', states, transitions };
  }

  function formatItem(grammar, it) {
    const p = grammar.productions[it.p];
    const out = [];
    for (let i = 0; i <= p.right.length; i++) {
      if (i === it.dot) out.push('.');
      if (i < p.right.length) out.push(p.right[i]);
    }
    return `${p.left} -> ${out.join(' ')}`;
  }

  const svg = d3.select('#lab3-canvas');
  const NODE_R = 27, NODE_R_OUTER = 33;
  let sim = null, nodes = [], links = [], nodeSel, edgeSel, startG, current = null, selectedId = null;
  let zoomLayer = null;
  const posCache = new Map();

  // 缩放 / 平移：滚轮缩放、空白处拖动平移；双击保留给业务，不让 d3.zoom 抢走
  const zoom = d3.zoom().scaleExtent([0.3, 3])
    // 节点本身有自己的 drag，别让 zoom 的平移在节点上"抢"事件
    .filter((e) => !(e.type === 'mousedown' && e.target.closest && e.target.closest('g.node')))
    .on('zoom', (e) => {
    if (zoomLayer) zoomLayer.attr('transform', e.transform);
    document.getElementById('lab3-zoom-reset').textContent = `${Math.round(e.transform.k * 100)}%`;
  });
  svg.call(zoom).on('dblclick.zoom', null);

  function size() {
    const r = svg.node().getBoundingClientRect();
    return { w: r.width || 800, h: r.height || 600 };
  }

  function buildLinks(data) {
    const buckets = new Map();
    data.transitions.forEach(t => {
      const key = t.from + '->' + t.to;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t.on);
    });
    const out = [];
    buckets.forEach((syms, key) => {
      const [from, to] = key.split('->');
      out.push({ source: from, target: to, label: [...new Set(syms)].join(', '), selfLoop: from === to, key });
    });
    return out;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // 把单条项目格式化为 HTML：高亮 reduce 项并标注归约的产生式编号
  function formatItemHTML(grammar, it) {
    const p = grammar.productions[it.p];
    const tokens = [];
    for (let i = 0; i <= p.right.length; i++) {
      if (i === it.dot) tokens.push('<span class="dot">·</span>');
      if (i < p.right.length) tokens.push(escapeHTML(p.right[i]));
    }
    const isReduce = it.dot === p.right.length;
    const tag = isReduce
      ? ` <span class="tag reduce">r${it.p}</span>`
      : (grammar.terminals.has(p.right[it.dot]) ? ' <span class="tag shift">shift</span>' : '');
    return `<div class="item-line${isReduce ? ' reduce-line' : ''}">`
      + `<span class="lhs">${escapeHTML(p.left)}</span>`
      + ` → ${tokens.join(' ')}${tag}</div>`;
  }

  function showDetail(id) {
    selectedId = id;
    if (!current) return;
    const st = current.states.find(s => s.id === id);
    if (!st) return;

    document.getElementById('lab3-status').textContent = id;
    document.getElementById('lab3-meta').textContent =
      `${st.items.length} 个项目${st.accept ? ' · 接受' : ''}`;
    const conflictEl = document.getElementById('lab3-conflict');
    if (st.conflict) {
      conflictEl.textContent = st.conflict;
      conflictEl.classList.add('on');
    } else {
      conflictEl.textContent = '';
      conflictEl.classList.remove('on');
    }

    document.getElementById('lab3-detail-items').innerHTML =
      st.items.map(it => formatItemHTML(current.grammar, it)).join('');

    const outs = current.transitions
      .filter(t => t.from === id)
      .sort((a, b) => a.on.localeCompare(b.on));
    document.getElementById('lab3-detail-out').innerHTML = outs.length
      ? outs.map(t => `<div class="edge-row"><code>${escapeHTML(t.on)}</code> → <a data-goto="${t.to}">${t.to}</a></div>`).join('')
      : '<div class="empty">（无出边）</div>';

    const ins = current.transitions
      .filter(t => t.to === id)
      .sort((a, b) => a.from.localeCompare(b.from));
    document.getElementById('lab3-detail-in').innerHTML = ins.length
      ? ins.map(t => `<div class="edge-row"><a data-goto="${t.from}">${t.from}</a> <code>${escapeHTML(t.on)}</code></div>`).join('')
      : '<div class="empty">（无入边）</div>';

    if (nodeSel) nodeSel.classed('selected', d => d.id === id);
  }

  // 全局总览：增广产生式、非终结符、终结符、冲突清单
  function renderSummary(data) {
    const g = data.grammar;
    const aug = g.productions[0];
    const prodLines = g.productions.map((p, i) =>
      `<div class="prod"><span class="pi">${i}</span> ${escapeHTML(p.left)} → ${p.right.map(escapeHTML).join(' ')}</div>`
    ).join('');
    const NT = [...g.nonterminals].sort().map(escapeHTML).join(', ');
    const T  = [...g.terminals].sort().map(escapeHTML).join(', ');
    const conflicts = data.states.filter(s => s.conflict);
    const conflictBlock = conflicts.length
      ? `<div class="sum-row sum-conflict"><span class="k">冲突</span>`
        + conflicts.map(s => `<a data-goto="${s.id}">${s.id}</a><small>${escapeHTML(s.conflict)}</small>`).join('')
        + `</div>`
      : `<div class="sum-row ok"><span class="k">冲突</span><span class="v">无 · LR(0) 文法</span></div>`;

    document.getElementById('lab3-summary').innerHTML =
      `<div class="sum-row"><span class="k">增广</span><code>${escapeHTML(aug.left)} → ${aug.right.map(escapeHTML).join(' ')}</code></div>`
      + `<div class="sum-row"><span class="k">非终结符</span><span class="v">${NT}</span></div>`
      + `<div class="sum-row"><span class="k">终结符</span><span class="v">${T || '（空）'}</span></div>`
      + `<details class="sum-row"><summary><span class="k">产生式</span><span class="v">${g.productions.length} 条</span></summary>${prodLines}</details>`
      + conflictBlock;
  }

  // 分层布局：以 I0 为根做 BFS 得到 layer，再用重心法做层内排序减少边交叉。
  // 力导向对 LR(0) 这类有明显层级结构的状态图天然不友好——所有箭头都从前一层指向后一层时，
  // 力导把它们硬挤成一团；分层布局把因果方向铺成左→右，可读性高得多。
  function computeLayered(data, w, h) {
    const idx = new Map(data.states.map((s, i) => [s.id, i]));
    const N = data.states.length;
    const outAdj = Array.from({ length: N }, () => []);
    const inAdj  = Array.from({ length: N }, () => []);
    data.transitions.forEach(t => {
      const u = idx.get(t.from), v = idx.get(t.to);
      if (u == null || v == null || u === v) return;
      outAdj[u].push(v); inAdj[v].push(u);
    });
    // 分层用 BFS 最短路径：实测在 LR(0) 状态图上交叉最少（最长路径会把图
    // 摊得太宽反而交叉更多）。代价是同层会出现层内边（见 tick 里对层内边的
    // 弧形处理），但全局形态更紧凑。
    const layer = new Array(N).fill(-1);
    const root = idx.get('I0') ?? 0;
    layer[root] = 0;
    const queue = [root];
    while (queue.length) {
      const u = queue.shift();
      outAdj[u].forEach(v => {
        if (layer[v] === -1) { layer[v] = layer[u] + 1; queue.push(v); }
      });
    }
    // 不可达节点（理论上不会出现）塞到第 0 层兜底
    for (let i = 0; i < N; i++) if (layer[i] === -1) layer[i] = 0;
    const maxL = Math.max(...layer);
    const byLayer = Array.from({ length: maxL + 1 }, () => []);
    for (let i = 0; i < N; i++) byLayer[layer[i]].push(i);

    // 重心法：用相邻层的位置均值做层内排序，正反扫几轮即可显著减少交叉
    const pos = new Array(N);
    byLayer.forEach(arr => arr.forEach((n, i) => pos[n] = i));
    for (let iter = 0; iter < 8; iter++) {
      const forward = iter % 2 === 0;
      const range = forward
        ? [...Array(maxL).keys()].map(i => i + 1)
        : [...Array(maxL).keys()].map(i => maxL - 1 - i);
      range.forEach(l => {
        const ref = forward ? inAdj : outAdj;
        byLayer[l].sort((a, b) => bc(a, ref, pos) - bc(b, ref, pos));
        byLayer[l].forEach((n, i) => pos[n] = i);
      });
    }
    function bc(node, ref, pos) {
      const ns = ref[node];
      if (!ns.length) return pos[node];
      let s = 0; ns.forEach(v => s += pos[v]);
      return s / ns.length;
    }

    // 相邻交换 (transpose)：在重心排序之上，反复试着交换同层相邻节点，
    // 只要能减少与上下相邻层之间的边交叉就保留，把残余交叉进一步磨平。
    // 重心法擅长大方向排序但留得下局部交叉，transpose 正好补这一刀。
    const edgesL = [];
    data.transitions.forEach(t => {
      const u = idx.get(t.from), v = idx.get(t.to);
      if (u == null || v == null || u === v) return;
      edgesL.push({ u, v, lu: layer[u], lv: layer[v] });
    });
    function channelCrossings(la) {
      const lb = la + 1;
      const es = [];
      edgesL.forEach(e => {
        if (e.lu === la && e.lv === lb) es.push([pos[e.u], pos[e.v]]);
        else if (e.lu === lb && e.lv === la) es.push([pos[e.v], pos[e.u]]);
      });
      let c = 0;
      for (let i = 0; i < es.length; i++)
        for (let j = i + 1; j < es.length; j++)
          if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
      return c;
    }
    const localCrossings = (l) => (l > 0 ? channelCrossings(l - 1) : 0) + channelCrossings(l);
    const syncPos = (l) => byLayer[l].forEach((n, i) => pos[n] = i);
    let improved = true, guard = 0;
    while (improved && guard++ < 12) {
      improved = false;
      for (let l = 0; l <= maxL; l++) {
        const arr = byLayer[l];
        for (let i = 0; i + 1 < arr.length; i++) {
          const before = localCrossings(l);
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          syncPos(l);
          if (localCrossings(l) < before) {
            improved = true;
          } else {
            [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
            syncPos(l);
          }
        }
      }
    }

    // 坐标：横向分层 (X by layer)，纵向居中铺开
    const padX = 80, padY = 70;
    const innerW = Math.max(240, w - 2 * padX);
    const innerH = Math.max(240, h - 2 * padY);
    const dx = maxL > 0 ? innerW / maxL : 0;
    const layerY = (l, i, n) => {
      if (n === 1) return padY + innerH / 2;
      // 各层在纵向上交错半个步长，避免相邻层节点 y 完全对齐时边互相遮挡
      const step = innerH / Math.max(1, n - 1);
      const jitter = (l % 2 === 0) ? 0 : step * 0.35;
      const baseY = padY + i * step + jitter;
      return Math.min(padY + innerH, Math.max(padY, baseY));
    };
    const out = new Array(N);
    byLayer.forEach((arr, l) => {
      arr.forEach((nodeIdx, i) => {
        out[nodeIdx] = { x: padX + l * dx, y: layerY(l, i, arr.length) };
      });
    });
    return out;
  }

  function render(data) {
    current = data;
    svg.selectAll('g.zoom-layer').remove();
    links = buildLinks(data);
    const { w, h } = size();
    const layoutPos = computeLayered(data, w, h);
    nodes = data.states.map((s, i) => {
      // 缓存优先（按项目集签名 sig，文法换了同名 I3 自然失配 → 重新分层）
      const cached = posCache.get(s.sig);
      const p = cached || layoutPos[i];
      return { ...s, x: p.x, y: p.y, fx: p.x, fy: p.y };
    });

    if (sim) { sim.stop(); sim = null; }

    // 没有 d3.forceLink 帮忙把 source/target 从 id 字符串替换成节点对象，自己来一次
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    links.forEach(l => {
      if (typeof l.source === 'string') l.source = nodeById.get(l.source);
      if (typeof l.target === 'string') l.target = nodeById.get(l.target);
    });

    zoomLayer = svg.append('g').attr('class', 'zoom-layer')
      .attr('transform', d3.zoomTransform(svg.node()));
    startG = zoomLayer.append('g').attr('class', 'start-group');
    const edgeG = zoomLayer.append('g').attr('class', 'edges');
    const nodeG = zoomLayer.append('g').attr('class', 'nodes');
    edgeSel = edgeG.selectAll('g.edge-grp').data(links).enter().append('g').attr('class', 'edge-grp');
    edgeSel.append('path').attr('class', 'edge-hit');
    edgeSel.append('path').attr('class', 'edge').attr('marker-end', 'url(#lab3-arrow)');
    const labelG = edgeSel.append('g').attr('class', 'edge-label-grp');
    labelG.append('ellipse').attr('class', 'edge-label-bg');
    labelG.append('text').attr('class', 'edge-label').text(d => d.label);

    nodeSel = nodeG.selectAll('g.node').data(nodes, d => d.id).enter().append('g')
      .attr('class', d => 'node' + (d.accept ? ' accept' : '') + (d.conflict ? ' conflict' : ''))
      .on('click', (e, d) => showDetail(d.id))
      .call(d3.drag()
        // container 设为 zoom-layer：缩放/平移后 e.x/e.y 才是 layer 局部坐标，
        // 否则缩放后拖拽距离与鼠标位移会对不上
        .container(() => zoomLayer.node())
        .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
        .on('drag',  (e, d) => { d.fx = d.x = e.x; d.fy = d.y = e.y; tick(); })
        .on('end',   () => {}));
    nodeSel.filter(d => d.accept).append('circle').attr('class', 'outer').attr('r', NODE_R_OUTER);
    nodeSel.append('circle').attr('r', NODE_R);
    nodeSel.append('text').attr('class', 'id').text(d => d.id);

    tick();
    // 旧选中的 I 在新拓扑里若已不存在，回退到 I0
    const fallback = (selectedId && data.states.some(s => s.id === selectedId)) ? selectedId : 'I0';
    showDetail(fallback);
  }

  // 边标签去重叠：每个标签以自己的"锚点"（边中点）为弹簧目标，对互相重叠的
  // 标签沿穿透最浅的轴推开，反复几轮收敛。这样标签既不会离自己的边太远，
  // 又不会两两压字。位置每帧都从锚点重算，故是确定性的、不会逐帧漂移累积。
  function separateLabels(items) {
    const PAD = 3;
    for (let iter = 0; iter < 60; iter++) {
      items.forEach(a => {
        a.lx += (a.ax - a.lx) * 0.10;
        a.ly += (a.ay - a.ly) * 0.10;
      });
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          const dx = b.lx - a.lx, dy = b.ly - a.ly;
          const ox = (a.hw + b.hw + PAD) - Math.abs(dx);
          const oy = (a.hh + b.hh + PAD) - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            moved = true;
            if (ox < oy) {
              const s = ((dx >= 0 ? 1 : -1) * ox) / 2;
              a.lx -= s; b.lx += s;
            } else {
              const s = ((dy >= 0 ? 1 : -1) * oy) / 2;
              a.ly -= s; b.ly += s;
            }
          }
        }
      }
      if (!moved) break;
    }
  }

  function tick() {
    const labels = [];
    edgeSel.each(function(d) {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
      // accept / 普通节点半径不同，箭头端点需要据此偏移，否则会戳进双圆里
      const rs = d.source.accept ? NODE_R_OUTER : NODE_R;
      const rt = d.target.accept ? NODE_R_OUTER : NODE_R;
      let pathD, labelX, labelY;
      if (d.selfLoop) {
        pathD = `M ${tx - 10} ${ty - rt} C ${tx - 42} ${ty - rt - 50}, ${tx + 42} ${ty - rt - 50}, ${tx + 10} ${ty - rt}`;
        labelX = tx; labelY = ty - rt - 38;
      } else if (Math.abs(tx - sx) < 8) {
        // 层内边（同层节点 x 相同）：原本会画成一条竖线，多条就叠在一起。
        // 改画成统一凸向左侧的弧，凸出量随纵向跨度增大，让多条层内边像
        // 同心弧一样嵌套开来，不再彼此重合。
        const dy = ty - sy;
        const bow = 26 + 0.22 * Math.abs(dy);
        const cx = (sx + tx) / 2 - bow;
        const cy = (sy + ty) / 2;
        pathD = `M ${sx - rs} ${sy} Q ${cx} ${cy} ${tx - rt} ${ty}`;
        labelX = (sx + tx) / 2 - bow / 2; labelY = cy;
      } else {
        const dx = tx - sx, dy = ty - sy, dist = Math.hypot(dx, dy) || 1;
        const ux = dx/dist, uy = dy/dist;
        const mx = (sx + tx)/2 - uy * 18, my = (sy + ty)/2 + ux * 18;
        pathD = `M ${sx + ux*rs} ${sy + uy*rs} Q ${mx} ${my} ${tx - ux*(rt+7)} ${ty - uy*(rt+7)}`;
        labelX = mx; labelY = my;
      }
      const grp = d3.select(this);
      grp.select('path.edge').attr('d', pathD);
      grp.select('path.edge-hit').attr('d', pathD);
      const lbl = grp.select('text.edge-label').text(d.label);
      const bbox = lbl.node().getBBox();
      // 锚点 ax/ay 固定在边中点，lx/ly 是去重叠后实际落点
      labels.push({ grp, ax: labelX, ay: labelY, lx: labelX, ly: labelY,
                    hw: bbox.width / 2 + 6, hh: bbox.height / 2 + 2 });
    });
    separateLabels(labels);
    labels.forEach(L => {
      L.grp.select('text.edge-label').attr('x', L.lx).attr('y', L.ly);
      L.grp.select('ellipse.edge-label-bg')
        .attr('cx', L.lx).attr('cy', L.ly).attr('rx', L.hw).attr('ry', L.hh);
    });
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    nodes.forEach(n => posCache.set(n.sig, { x:n.x, y:n.y, fx:n.fx, fy:n.fy }));
    const s = nodes.find(n => n.id === 'I0');
    if (s) {
      startG.selectAll('*').remove();
      startG.append('path').attr('class', 'start-arrow').attr('marker-end', 'url(#lab3-arrow-rust)').attr('d', `M ${s.x-88} ${s.y-10} Q ${s.x-58} ${s.y+2}, ${s.x-NODE_R-4} ${s.y}`);
      startG.append('text').attr('class', 'start-label').attr('x', s.x-92).attr('y', s.y-14).text('I0');
    }
  }

  // 拓扑指纹：所有项目集签名 + 所有转移（按 from/on/to 排序），
  // 完全相同则跳过 render 重启力导，仅刷新 detail，避免节点乱跳
  function topoFingerprint(data) {
    const ss = data.states.map(s => s.sig).join('||');
    const ts = data.transitions
      .map(t => `${t.from}-${t.on}->${t.to}`)
      .sort()
      .join(';');
    return ss + '@@' + ts;
  }
  let lastTopo = null;

  function update() {
    const editor = document.getElementById('lab3-editor');
    const status = document.getElementById('lab3-editor-status');
    try {
      const grammar = parseGrammar(editor.value);
      const data = buildLR0(grammar);
      status.className = 'editor-status ok';
      status.textContent = `已生成 ${data.states.length} 个项目集，${data.transitions.length} 条 Goto 转移`;
      const topo = topoFingerprint(data);
      if (topo === lastTopo && current) {
        // 拓扑未变：复用已渲染的图，只更新数据引用与详情
        current = data;
        showDetail(selectedId || 'I0');
      } else {
        lastTopo = topo;
        render(data);
      }
      renderSummary(data);
    } catch (err) {
      status.className = 'editor-status err';
      status.textContent = err.message;
    }
  }

  document.getElementById('lab3-editor').value = DEFAULT_GRAMMAR;
  let debounce = null;
  document.getElementById('lab3-editor').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(update, 200); });

  // 详情与全局总览里的 [data-goto="Ix"] 链接：点击跳转到对应项目集
  document.getElementById('lab3-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    showDetail(a.getAttribute('data-goto'));
  });
  document.getElementById('lab3-layout').onclick = () => { posCache.clear(); if (current) render(current); };
  document.getElementById('lab3-zoom-in').onclick    = () => svg.transition().duration(180).call(zoom.scaleBy, 1.25);
  document.getElementById('lab3-zoom-out').onclick   = () => svg.transition().duration(180).call(zoom.scaleBy, 1/1.25);
  document.getElementById('lab3-zoom-reset').onclick = () => svg.transition().duration(220).call(zoom.transform, d3.zoomIdentity);
  document.getElementById('lab3-export').onclick = () => {
    const svgEl = document.getElementById('lab3-canvas');
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type:'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lr0-item-sets.svg';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  };
  window.addEventListener('resize', () => {
    if (!current) return;
    // 分层布局是 deterministic 的，直接重算 + 重绘即可（保留用户手动拖过的位置则下次再说）
    posCache.clear();
    render(current);
  });
  update();
}

/* 自注册到 App 框架 */
App.register({
  id: 'lab3',
  label: '实验三 · LR(0) 规范集',
  figNo: '02',
  mount: mountLab3
});
