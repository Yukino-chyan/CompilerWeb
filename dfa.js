/* ════════════════════════════════════════════════════════════
   实验一 — DFA 可视化 + 输入串模拟
   提供 mountLab2(root)，由 app.js 在激活时调用。
   样例文件：dfa.txt（与 DEFAULT_SRC 内容一致，供日后从文件加载）。
   ════════════════════════════════════════════════════════════ */
function mountLab2(root) {
  /* ── 1. DOM 骨架 ───────────────────────────────────────── */
  root.innerHTML = `
    <div class="lab-grid">
      <aside class="pane pane-left">
        <div class="pane-section">
          <div class="figure-caption">DFA</div>
          <div class="figure-note">
            默认载入 PPT 第 4 页的 <code>dfa_in1.dfa</code>。
          </div>
        </div>
        <div class="pane-section">
          <div class="section-title">图例</div>
          <div class="legend">
            <div class="row"><div class="swatch start"></div>
              <div class="label">起始状态<small>由外部箭头指入</small></div></div>
            <div class="row"><div class="swatch"></div>
              <div class="label">普通状态<small>单圆</small></div></div>
            <div class="row"><div class="swatch accept"></div>
              <div class="label">接受状态<small>双圆 · 终态</small></div></div>
            <div class="row"><div class="swatch active"></div>
              <div class="label">当前所在<small>模拟运行时高亮</small></div></div>
          </div>
        </div>
        <div class="pane-section editor-section">
          <div class="section-title">DFA 定义<span class="hint">编辑后自动渲染</span></div>
          <div class="editor-wrap">
            <textarea class="editor" id="lab2-editor" spellcheck="false"></textarea>
            <div id="lab2-editor-status" class="editor-status ok">已解析</div>
          </div>
          <div class="syntax-help">
            格式（仿 PPT <code>dfa_in1.dfa</code>）：第 1 行字母表 · 第 2 行状态总数 N · 第 3 行起始状态 · 第 4 行接受状态 · 其后 N 行转移矩阵（按字母表顺序，<code>0</code> 表示无转移）。<code>#</code> 之后为注释。
          </div>
        </div>
      </aside>

      <main class="pane pane-right">
        <div class="canvas-stage">
          <div class="canvas-corner">
            <div class="fig-num">图 · 01</div>
            <div class="fig-title">确定性有限自动机 <em>M</em></div>
          </div>
          <div class="canvas-tools">
            <button id="lab2-layout"   title="复位力导布局">整理布局</button>
            <button id="lab2-export"   title="导出当前画面为 PNG">导出 PNG</button>
          </div>
          <div class="kbd-hint">
            <kbd>Space</kbd> 播放 / 暂停 ·
            <kbd>→</kbd> 单步 ·
            <kbd>R</kbd> 重置
          </div>
          <svg class="canvas" id="lab2-canvas">
            <defs>
              <marker id="lab2-arrow" viewBox="0 -5 10 10" refX="9" refY="0"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4 L8,0 L0,4 L2,0 Z" fill="#2A2A2A"/>
              </marker>
              <marker id="lab2-arrow-rust" viewBox="0 -5 10 10" refX="9" refY="0"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4 L8,0 L0,4 L2,0 Z" fill="#B85042"/>
              </marker>
            </defs>
          </svg>
        </div>
        <div class="sim-bar">
          <div class="sim-group">
            <label>输入串</label>
            <input type="text" id="lab2-input" placeholder="例如 abab" />
          </div>
          <div class="sim-group">
            <button class="ctrl" id="lab2-reset" title="重置 (R)">↺</button>
            <button class="ctrl" id="lab2-step"  title="单步 (→)">▶|</button>
            <button class="ctrl primary" id="lab2-play" title="播放 / 暂停 (空格)">▶</button>
          </div>
          <div class="sim-group">
            <label>速度</label>
            <input type="range" id="lab2-speed" min="100" max="1500" value="600" />
          </div>
          <div class="sim-tape" id="lab2-tape"></div>
          <div class="sim-status" id="lab2-status">就绪</div>
        </div>
      </main>
    </div>
  `;

  /* ── 2. 默认 DFA 源 ───────────────────────────────────── */
  const DEFAULT_SRC = `ab
4
1
4
2 3
4 3
2 4
4 4
`;

  /* ── 3. 解析器 ─────────────────────────────────────────── */
  function parseDFA(src) {
    const errors = [];
    const all = src.split(/\r?\n/).map((raw, i) => ({
      ln: i + 1, text: raw.replace(/#.*$/, '').trim()
    }));
    const rows = all.filter(r => r.text.length > 0);
    if (rows.length < 4) {
      errors.push('至少需要 4 行：字母表 / 状态数 / 起始 / 接受');
      return { errors, dfa: null };
    }
    const alphabet = [...rows[0].text];
    if (alphabet.length === 0) errors.push(`第 ${rows[0].ln} 行：字母表不能为空`);
    const N = parseInt(rows[1].text, 10);
    if (!Number.isInteger(N) || N <= 0) {
      errors.push(`第 ${rows[1].ln} 行：状态总数必须是正整数`);
      return { errors, dfa: null };
    }
    const start = parseInt(rows[2].text, 10);
    if (!Number.isInteger(start) || start < 1 || start > N) {
      errors.push(`第 ${rows[2].ln} 行：起始状态 "${rows[2].text}" 越界（应为 1..${N}）`);
    }
    const accept = new Set();
    rows[3].text.split(/\s+/).map(s => parseInt(s, 10)).forEach(a => {
      if (!Number.isInteger(a) || a < 1 || a > N) {
        errors.push(`第 ${rows[3].ln} 行：接受状态 "${a}" 越界（应为 1..${N}）`);
      } else accept.add(a);
    });
    const transRows = rows.slice(4);
    if (transRows.length < N) {
      errors.push(`需要 ${N} 行转移表，目前只有 ${transRows.length} 行`);
    }
    const trans = [];
    for (let i = 0; i < Math.min(N, transRows.length); i++) {
      const cells = transRows[i].text.split(/\s+/);
      if (cells.length !== alphabet.length) {
        errors.push(`第 ${transRows[i].ln} 行：状态 ${i+1} 的转移列数应为 ${alphabet.length}，实际为 ${cells.length}`);
        continue;
      }
      cells.forEach((c, j) => {
        const to = parseInt(c, 10);
        if (!Number.isInteger(to)) {
          errors.push(`第 ${transRows[i].ln} 行：第 ${j+1} 列 "${c}" 不是数字`);
        } else if (to === 0) {
          /* 无转移 */
        } else if (to < 1 || to > N) {
          errors.push(`第 ${transRows[i].ln} 行：目标状态 ${to} 越界`);
        } else {
          trans.push({ from: i + 1, on: alphabet[j], to });
        }
      });
    }
    const states = [];
    for (let i = 1; i <= N; i++) states.push({ id: String(i), accept: accept.has(i) });
    return {
      errors,
      dfa: {
        alphabet,
        start: String(start),
        states,
        transitions: trans.map(t => ({ from: String(t.from), on: t.on, to: String(t.to) }))
      }
    };
  }

  /* ── 4. 渲染状态 + 模拟状态 ───────────────────────────── */
  const svg = d3.select('#lab2-canvas');
  const NODE_R = 26, NODE_R_OUTER = 32;
  let sim = null;
  let currentDFA = null;
  let nodes = [], links = [];
  let nodeSel, edgeSel, startG;
  const posCache = new Map();   // id → {x,y,fx,fy}

  // 简单按状态 id 建查表：from -> symbol -> {to, edgeKey}
  let transIndex = null;

  function size() {
    const el = svg.node();
    if (!el) return { w: 800, h: 600 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function buildLinks(dfa) {
    const buckets = new Map();
    dfa.transitions.forEach(t => {
      const key = t.from + '->' + t.to;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t.on);
    });
    const out = [];
    buckets.forEach((syms, key) => {
      const [from, to] = key.split('->');
      out.push({
        source: from, target: to,
        label: [...new Set(syms)].join(', '),
        symbols: [...new Set(syms)],
        selfLoop: from === to,
        key
      });
    });
    return out;
  }

  function buildTransIndex(dfa) {
    // map: from → { on → {to, edgeKey} }
    const idx = new Map();
    dfa.transitions.forEach(t => {
      if (!idx.has(t.from)) idx.set(t.from, new Map());
      idx.get(t.from).set(t.on, { to: t.to, edgeKey: t.from + '->' + t.to });
    });
    return idx;
  }

  function render(dfa) {
    currentDFA = dfa;
    transIndex = buildTransIndex(dfa);
    svg.selectAll('g.start-group, g.edges, g.nodes').remove();

    links = buildLinks(dfa);

    nodes = dfa.states.map((s, i) => {
      const cached = posCache.get(s.id);
      const { w, h } = size();
      return {
        ...s,
        x: cached ? cached.x : w * (0.25 + 0.15 * i),
        y: cached ? cached.y : h * (0.5 + (i % 2 === 0 ? -0.05 : 0.08)),
        fx: cached ? cached.fx : null,
        fy: cached ? cached.fy : null
      };
    });

    const { w, h } = size();
    if (sim) sim.stop();
    sim = d3.forceSimulation(nodes)
      .alphaDecay(0.08)
      .velocityDecay(0.55)
      .force('link', d3.forceLink(links).id(d => d.id).distance(160).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-700))
      .force('center', d3.forceCenter(w/2, h/2))
      .force('collide', d3.forceCollide(NODE_R_OUTER + 14))
      .force('x', d3.forceX(w/2).strength(0.04))
      .force('y', d3.forceY(h/2).strength(0.06));

    // 稳定后钉住，后续拖一个不影响其他
    sim.on('end', () => {
      nodes.forEach(n => { n.fx = n.x; n.fy = n.y; });
    });

    startG = svg.append('g').attr('class', 'start-group');
    const edgeG = svg.append('g').attr('class', 'edges');
    const nodeG = svg.append('g').attr('class', 'nodes');

    edgeSel = edgeG.selectAll('g.edge-grp')
      .data(links).enter().append('g').attr('class', 'edge-grp')
      .attr('data-key', d => d.key);
    edgeSel.append('path').attr('class', 'edge-hit');
    edgeSel.append('path').attr('class', 'edge').attr('marker-end', 'url(#lab2-arrow)');
    const labelG = edgeSel.append('g').attr('class', 'edge-label-grp');
    labelG.append('ellipse').attr('class', 'edge-label-bg');
    labelG.append('text').attr('class', 'edge-label').text(d => d.label);

    nodeSel = nodeG.selectAll('g.node')
      .data(nodes, d => d.id).enter().append('g')
      .attr('class', d => 'node' + (d.accept ? ' accept' : ''))
      .attr('data-id', d => d.id)
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.1).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); }));
    nodeSel.filter(d => d.accept).append('circle').attr('class', 'outer').attr('r', NODE_R_OUTER);
    nodeSel.append('circle').attr('r', NODE_R);
    nodeSel.append('text').attr('class', 'id').text(d => d.id);

    sim.on('tick', tick);
    sim.alpha(0.7).restart();

    resetSimulation();
  }

  function tick() {
    edgeSel.each(function(d) {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;
      let pathD, labelX, labelY;
      if (d.selfLoop) {
        const r = d.target.accept ? NODE_R_OUTER : NODE_R;
        const cx = tx, cy = ty - r - 4;
        pathD = `M ${tx - 10} ${ty - r}
                 C ${cx - 38} ${cy - 46},
                   ${cx + 38} ${cy - 46},
                   ${tx + 10} ${ty - r}`;
        labelX = cx; labelY = cy - 36;
      } else {
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const rs = d.source.accept ? NODE_R_OUTER : NODE_R;
        const rt = d.target.accept ? NODE_R_OUTER : NODE_R;
        const ux = dx/dist, uy = dy/dist;
        const mx = (sx + tx)/2 - uy * 18;
        const my = (sy + ty)/2 + ux * 18;
        const x1 = sx + ux * rs;
        const y1 = sy + uy * rs;
        const x2 = tx - ux * (rt + 6);
        const y2 = ty - uy * (rt + 6);
        pathD = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
        labelX = mx; labelY = my;
      }
      const grp = d3.select(this);
      grp.select('path.edge').attr('d', pathD);
      grp.select('path.edge-hit').attr('d', pathD);
      const lbl = grp.select('text.edge-label');
      lbl.attr('x', labelX).attr('y', labelY);
      const bbox = lbl.node().getBBox();
      grp.select('ellipse.edge-label-bg')
        .attr('cx', labelX).attr('cy', labelY)
        .attr('rx', bbox.width/2 + 6)
        .attr('ry', bbox.height/2 + 2);
    });

    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    nodes.forEach(n => posCache.set(n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy }));

    // start arrow
    const s = nodes.find(n => n.id === currentDFA.start);
    if (s && s.x != null) {
      startG.selectAll('*').remove();
      const r = s.accept ? NODE_R_OUTER : NODE_R;
      const x2 = s.x - r - 4;
      const y2 = s.y;
      const x1 = x2 - 60;
      const y1 = y2 - 10;
      startG.append('path')
        .attr('class', 'start-arrow')
        .attr('marker-end', 'url(#lab2-arrow-rust)')
        .attr('d', `M ${x1} ${y1} Q ${x1+30} ${y1+5}, ${x2} ${y2}`);
      startG.append('text')
        .attr('class', 'start-label')
        .attr('x', x1 - 4)
        .attr('y', y1 - 2)
        .text('起始');
    }
  }

  /* ── 5. 模拟运行 ──────────────────────────────────────── */
  const simState = {
    input: '',
    pos: 0,
    cur: null,
    lastEdgeKey: null,
    status: 'idle',     // idle | running | accept | reject | halted
    playTimer: null
  };

  function statusText() {
    switch (simState.status) {
      case 'idle':    return { text: '就绪', cls: '' };
      case 'running': return { text: `运行中 · 位于 ${simState.cur}`, cls: 'running' };
      case 'accept':  return { text: `接受 · 终态 ${simState.cur}`, cls: 'accept' };
      case 'reject':  return { text: `拒绝 · 停于 ${simState.cur}`, cls: 'reject' };
      case 'halted':  return { text: `无转移 · 卡在 ${simState.cur}`, cls: 'reject' };
    }
  }

  function renderTape() {
    const tapeEl = document.getElementById('lab2-tape');
    const s = simState.input;
    if (!s) {
      tapeEl.innerHTML = `<span class="pos">空串</span>`;
      return;
    }
    const cells = [...s].map((c, i) => {
      let cls = '';
      if (i < simState.pos) cls = 'consumed';
      else if (i === simState.pos && simState.status !== 'accept' && simState.status !== 'reject') cls = 'current';
      return `<div class="cell ${cls}">${c === ' ' ? '␣' : c}</div>`;
    }).join('');
    tapeEl.innerHTML = cells +
      `<span class="pos">位置 ${Math.min(simState.pos, s.length)} / ${s.length}</span>`;
  }

  function renderHighlight() {
    if (!nodeSel) return;
    nodeSel.attr('class', d => {
      let c = 'node' + (d.accept ? ' accept' : '');
      if (simState.status === 'accept' && d.id === simState.cur) c += ' finished-accept';
      else if ((simState.status === 'reject' || simState.status === 'halted') && d.id === simState.cur) c += ' finished-reject';
      else if (d.id === simState.cur && simState.status === 'running') c += ' active';
      else if (d.id === simState.cur && simState.status === 'idle') c += ' active';
      return c;
    });
    edgeSel.classed('active', d => d.key === simState.lastEdgeKey);
    edgeSel.selectAll('path.edge').attr('stroke',
      d => d.key === simState.lastEdgeKey ? 'var(--rust)' : null);
  }

  function refreshSimUI() {
    renderTape();
    renderHighlight();
    const st = statusText();
    const el = document.getElementById('lab2-status');
    el.textContent = st.text;
    el.className = 'sim-status ' + st.cls;
    document.getElementById('lab2-step').disabled =
      simState.status === 'accept' || simState.status === 'reject' || simState.status === 'halted';
    const playBtn = document.getElementById('lab2-play');
    playBtn.textContent = simState.playTimer ? '⏸' : '▶';
  }

  function resetSimulation() {
    stopPlay();
    simState.input = document.getElementById('lab2-input')?.value || '';
    simState.pos = 0;
    simState.cur = currentDFA?.start || null;
    simState.lastEdgeKey = null;
    simState.status = 'idle';
    refreshSimUI();
  }

  function stepOnce() {
    if (!currentDFA) return false;
    if (simState.status === 'accept' || simState.status === 'reject' || simState.status === 'halted') return false;
    if (simState.cur == null) simState.cur = currentDFA.start;
    if (simState.pos >= simState.input.length) {
      const acc = currentDFA.states.find(s => s.id === simState.cur)?.accept;
      simState.status = acc ? 'accept' : 'reject';
      simState.lastEdgeKey = null;
      refreshSimUI();
      return false;
    }
    const ch = simState.input[simState.pos];
    const fromMap = transIndex.get(simState.cur);
    const move = fromMap ? fromMap.get(ch) : null;
    if (!move) {
      simState.status = 'halted';
      simState.lastEdgeKey = null;
      refreshSimUI();
      return false;
    }
    simState.cur = move.to;
    simState.lastEdgeKey = move.edgeKey;
    simState.pos++;
    simState.status = 'running';
    refreshSimUI();
    return true;
  }

  function stopPlay() {
    if (simState.playTimer) {
      clearInterval(simState.playTimer);
      simState.playTimer = null;
    }
  }

  function togglePlay() {
    if (simState.playTimer) {
      stopPlay();
      refreshSimUI();
      return;
    }
    if (simState.status === 'accept' || simState.status === 'reject' || simState.status === 'halted') {
      resetSimulation();
    }
    const speed = +document.getElementById('lab2-speed').value;
    simState.playTimer = setInterval(() => {
      const ok = stepOnce();
      if (!ok) stopPlay();
      refreshSimUI();
    }, speed);
    refreshSimUI();
  }

  /* ── 6. 编辑器联动 ──────────────────────────────────── */
  const editor = document.getElementById('lab2-editor');
  const status = document.getElementById('lab2-editor-status');
  editor.value = DEFAULT_SRC;

  let debounce = null;
  function update() {
    const { dfa, errors } = parseDFA(editor.value);
    if (errors.length === 0 && dfa) {
      status.className = 'editor-status ok';
      status.textContent = `已解析：${dfa.states.length} 个状态，${dfa.transitions.length} 条转移`;
      render(dfa);
    } else {
      status.className = 'editor-status err';
      status.textContent = errors[0] + (errors.length > 1 ? `（另有 ${errors.length-1} 处错误）` : '');
    }
  }
  editor.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(update, 250); });

  /* ── 7. 模拟控件事件 ────────────────────────────────── */
  document.getElementById('lab2-input').addEventListener('input', resetSimulation);
  document.getElementById('lab2-reset').onclick = resetSimulation;
  document.getElementById('lab2-step').onclick = () => { stopPlay(); stepOnce(); refreshSimUI(); };
  document.getElementById('lab2-play').onclick = togglePlay;
  document.getElementById('lab2-speed').addEventListener('input', () => {
    if (simState.playTimer) { stopPlay(); togglePlay(); }
  });

  /* ── 复位布局：清掉所有 fx/fy 重新跑一次力导 ── */
  document.getElementById('lab2-layout').onclick = () => {
    posCache.clear();
    if (currentDFA) render(currentDFA);
  };

  /* ── 导出 PNG ── */
  const SVG_CSS = `
    .node circle { fill:#FBF8F1; stroke:#2A2A2A; stroke-width:1.8 }
    .node.accept circle.outer { fill:none }
    .node.active circle { fill:#E8C3BE; stroke:#B85042 }
    .node.finished-accept circle { fill:#C9DBC9; stroke:#6B8E76 }
    .node.finished-accept.accept circle.outer { stroke:#6B8E76 }
    .node.finished-reject circle { fill:#FBE4DF; stroke:#B85042 }
    .node text.id { font-family:'JetBrains Mono',monospace; font-size:13px;
                    font-weight:600; fill:#2A2A2A; text-anchor:middle;
                    dominant-baseline:central }
    .edge { fill:none; stroke:#2A2A2A; stroke-width:1.4 }
    .edge.active { stroke:#B85042; stroke-width:2.4 }
    .edge-hit { fill:none; stroke:transparent; stroke-width:14 }
    .edge-label-bg { fill:#FBF8F1; stroke:none }
    .edge-label { font-family:'JetBrains Mono',monospace; font-size:12px;
                  font-weight:600; fill:#2A2A2A; text-anchor:middle;
                  dominant-baseline:central }
    .start-arrow { stroke:#B85042; stroke-width:2; fill:none }
    .start-label { font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;
                   font-size:12px; font-weight:600; fill:#B85042;
                   text-anchor:end; letter-spacing:1px }
  `;
  document.getElementById('lab2-export').onclick = () => {
    const svgEl = document.getElementById('lab2-canvas');
    const rect = svgEl.getBoundingClientRect();
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width',  rect.width);
    clone.setAttribute('height', rect.height);
    // 嵌入样式
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = SVG_CSS;
    clone.insertBefore(styleEl, clone.firstChild);
    // 米白背景
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#FBF8F1');
    clone.insertBefore(bg, styleEl.nextSibling);

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // 2x 高清
      const canvas = document.createElement('canvas');
      canvas.width  = rect.width  * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dfa-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.onerror = () => alert('导出失败：浏览器拒绝渲染 SVG（可能与跨域字体有关）');
    img.src = url;
  };

  /* ── 键盘快捷键（聚焦输入框时不拦截）── */
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    const sec = document.getElementById('lab2-root');
    if (!sec || sec.hidden) return;
    if (e.code === 'Space')         { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight'){ e.preventDefault(); stopPlay(); stepOnce(); refreshSimUI(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); resetSimulation(); }
  });

  // 窗口缩放
  window.addEventListener('resize', () => {
    if (!sim) return;
    const { w, h } = size();
    sim.force('center', d3.forceCenter(w/2, h/2));
    sim.force('x', d3.forceX(w/2).strength(0.04));
    sim.force('y', d3.forceY(h/2).strength(0.06));
    sim.alpha(0.2).restart();
  });

  // 初始
  update();
}

/* 自注册到 App 框架 */
App.register({
  id: 'lab2',
  label: '实验一 · DFA',
  figNo: '01',
  mount: mountLab2
});
