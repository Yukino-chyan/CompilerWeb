/* ════════════════════════════════════════════════════════════
   实验四 — SLR(1) 分析表可视化
   自动计算 FIRST/FOLLOW 集，构造并展示 ACTION + GOTO 表。
   ════════════════════════════════════════════════════════════ */
function mountLab4(root) {
  root.innerHTML = `
    <div class="lab-grid">
      <aside class="pane pane-left">
        <div class="pane-section">
          <div class="section-title">FIRST 集</div>
          <div id="lab4-first" class="set-table"></div>
        </div>
        <div class="pane-section">
          <div class="section-title">FOLLOW 集</div>
          <div id="lab4-follow" class="set-table"></div>
        </div>
        <div class="pane-section editor-section">
          <div class="section-title">文法定义<span class="hint">编辑后自动生成</span></div>
          <div class="editor-wrap">
            <textarea class="editor" id="lab4-editor" spellcheck="false"></textarea>
            <div id="lab4-editor-status" class="editor-status ok">就绪</div>
          </div>
          <div class="syntax-help">
            每行一个产生式，可用 <code>|</code> 表示多个候选式，例如 <code>E -> E + T | T</code>。
          </div>
        </div>
      </aside>

      <main class="pane pane-right slr1-main">
        <div class="slr1-header">
          <span class="slr1-fig-title">SLR(1) 分析表</span>
        </div>
        <div id="lab4-table-wrap" class="slr1-table-wrap">
          <div class="slr1-placeholder">请在左侧输入文法</div>
        </div>
        <div id="lab4-conflict-bar" class="slr1-conflict-bar" hidden></div>
      </main>
    </div>
  `;

  const DEFAULT_GRAMMAR = `E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id`;

  // ── 工具 ──────────────────────────────────────────────────
  function trim(s) { return s.trim(); }
  function splitSymbols(s) { return trim(s).split(/\s+/).filter(Boolean); }

  // ── 文法解析 ──────────────────────────────────────────────
  function parseGrammar(src) {
    const lines = src.split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
    if (!lines.length) throw new Error('文法为空');
    const nonterminals = new Set();
    const rawProds = [];
    lines.forEach((text, i) => {
      const pos = text.indexOf('->');
      if (pos < 0) throw new Error(`第 ${i + 1} 行缺少 "->"`);
      const left = trim(text.slice(0, pos));
      const right = trim(text.slice(pos + 2));
      if (!left || /\s/.test(left)) throw new Error(`第 ${i + 1} 行左部非法`);
      nonterminals.add(left);
      rawProds.push({ left, right });
    });
    const start = rawProds[0].left;
    const aug = nonterminals.has(start + "'") ? start + "''" : start + "'";
    nonterminals.add(aug);
    const productions = [{ left: aug, right: [start] }];
    rawProds.forEach(({ left, right }) => {
      right.split('|').forEach(part => {
        const syms = splitSymbols(part);
        if (!syms.length) throw new Error(`产生式 "${left}" 含空候选式`);
        productions.push({ left, right: syms });
      });
    });
    const terminals = new Set();
    productions.forEach(p => p.right.forEach(s => { if (!nonterminals.has(s)) terminals.add(s); }));
    return { start, aug, productions, nonterminals, terminals };
  }

  // ── LR(0) 构造 ────────────────────────────────────────────
  function itemSetKey(items) {
    return items.slice().sort((a, b) => a.p - b.p || a.dot - b.dot).map(it => it.p + '@' + it.dot).join('|');
  }

  function closure(g, items) {
    const res = items.slice();
    for (let i = 0; i < res.length; i++) {
      const sym = g.productions[res[i].p].right[res[i].dot];
      if (!sym || !g.nonterminals.has(sym)) continue;
      g.productions.forEach((prod, j) => {
        if (prod.left === sym && !res.some(x => x.p === j && x.dot === 0))
          res.push({ p: j, dot: 0 });
      });
    }
    return res;
  }

  function gotoItems(g, items, sym) {
    const moved = items.filter(it => g.productions[it.p].right[it.dot] === sym)
                       .map(it => ({ p: it.p, dot: it.dot + 1 }));
    return moved.length ? closure(g, moved) : [];
  }

  function buildCanonical(g) {
    const states = [{ id: 0, items: closure(g, [{ p: 0, dot: 0 }]) }];
    const keyMap = new Map([[itemSetKey(states[0].items), 0]]);
    const transitions = [];
    for (let i = 0; i < states.length; i++) {
      const allSyms = new Set(states[i].items.map(it => g.productions[it.p].right[it.dot]).filter(Boolean));
      allSyms.forEach(sym => {
        const next = gotoItems(g, states[i].items, sym);
        if (!next.length) return;
        const k = itemSetKey(next);
        let to;
        if (keyMap.has(k)) {
          to = keyMap.get(k);
        } else {
          to = states.length;
          keyMap.set(k, to);
          states.push({ id: to, items: next });
        }
        transitions.push({ from: i, sym, to });
      });
    }
    return { states, transitions };
  }

  // ── FIRST / FOLLOW ────────────────────────────────────────
  function computeFirst(g) {
    const first = {};
    g.terminals.forEach(t => { first[t] = new Set([t]); });
    g.nonterminals.forEach(nt => { first[nt] = new Set(); });
    let changed = true;
    while (changed) {
      changed = false;
      g.productions.forEach(({ left, right }) => {
        if (!right.length) return;
        const f = first[right[0]];
        if (!f) return;
        f.forEach(s => { if (!first[left].has(s)) { first[left].add(s); changed = true; } });
      });
    }
    return first;
  }

  function computeFollow(g, first) {
    const follow = {};
    g.nonterminals.forEach(nt => { follow[nt] = new Set(); });
    follow[g.start].add('$');
    let changed = true;
    while (changed) {
      changed = false;
      g.productions.forEach(({ left, right }) => {
        right.forEach((sym, j) => {
          if (!g.nonterminals.has(sym)) return;
          if (j + 1 < right.length) {
            const f = first[right[j + 1]];
            if (f) f.forEach(s => { if (!follow[sym].has(s)) { follow[sym].add(s); changed = true; } });
          } else {
            follow[left].forEach(s => { if (!follow[sym].has(s)) { follow[sym].add(s); changed = true; } });
          }
        });
      });
    }
    return follow;
  }

  // ── SLR(1) 填表 ──────────────────────────────────────────
  function buildSLR1(g, states, transitions, follow) {
    const n = states.length;
    const action = Array.from({ length: n }, () => ({}));
    const gotoTbl = Array.from({ length: n }, () => ({}));
    const conflicts = [];

    function setAction(i, sym, val) {
      const prev = action[i][sym];
      if (prev) {
        if (prev.type === val.type && prev.value === val.value) return;
        const kind = (prev.type === 'shift' || val.type === 'shift') ? '移进-归约' : '归约-归约';
        conflicts.push(`I${i} 在符号 "${sym}" 上存在${kind}冲突`);
      } else {
        action[i][sym] = val;
      }
    }

    states.forEach((state, i) => {
      state.items.forEach(({ p, dot }) => {
        const prod = g.productions[p];
        if (dot < prod.right.length) {
          const sym = prod.right[dot];
          if (!g.terminals.has(sym)) return;
          const t = transitions.find(tr => tr.from === i && tr.sym === sym);
          if (t) setAction(i, sym, { type: 'shift', value: t.to });
        } else if (p === 0) {
          setAction(i, '$', { type: 'acc' });
        } else {
          const fa = follow[prod.left];
          if (fa) fa.forEach(s => setAction(i, s, { type: 'reduce', value: p }));
        }
      });
    });

    transitions.forEach(({ from, sym, to }) => {
      if (g.nonterminals.has(sym) && sym !== g.aug) gotoTbl[from][sym] = to;
    });

    return { action, gotoTbl, conflicts };
  }

  // ── 渲染 FIRST / FOLLOW ───────────────────────────────────
  function renderFirstFollow(g, first, follow) {
    const nts = [...g.nonterminals].filter(nt => nt !== g.aug).sort();
    function rows(getSet) {
      return nts.map(nt => {
        const syms = [...getSet(nt)].sort();
        const vals = syms.length
          ? syms.map(s => `<span class="slr1-token">${s}</span>`).join('')
          : '<span class="slr1-empty">∅</span>';
        return `<tr><td class="set-sym">${nt}</td><td class="set-val">${vals}</td></tr>`;
      }).join('');
    }
    root.querySelector('#lab4-first').innerHTML  = `<table class="set-tbl">${rows(nt => first[nt]  || new Set())}</table>`;
    root.querySelector('#lab4-follow').innerHTML = `<table class="set-tbl">${rows(nt => follow[nt] || new Set())}</table>`;
  }

  // ── 渲染 SLR(1) 分析表 ───────────────────────────────────
  function actionStr(a) {
    if (!a) return '';
    if (a.type === 'shift')  return 's' + a.value;
    if (a.type === 'reduce') return 'r' + a.value;
    return 'acc';
  }

  function renderTable(g, states, action, gotoTbl, conflicts) {
    const terminals = [...g.terminals].sort();
    terminals.push('$');
    const nts = [...g.nonterminals].filter(nt => nt !== g.aug).sort();

    let html = '<div class="slr1-scroll"><table class="slr1-tbl">';
    // 双行表头
    html += `<thead>
      <tr class="slr1-head-group">
        <th rowspan="2" class="slr1-state-hdr">状态</th>
        <th colspan="${terminals.length}" class="slr1-group-hdr action-group">ACTION</th>
        <th colspan="${nts.length}" class="slr1-group-hdr goto-group">GOTO</th>
      </tr>
      <tr class="slr1-head-sym">`;
    terminals.forEach(t => {
      html += `<th class="slr1-sym-hdr${t === '$' ? ' slr1-dollar' : ''}">${t}</th>`;
    });
    nts.forEach(nt => { html += `<th class="slr1-sym-hdr goto-sym">${nt}</th>`; });
    html += '</tr></thead><tbody>';

    states.forEach((_, i) => {
      html += `<tr><td class="slr1-state-cell">${i}</td>`;
      terminals.forEach(t => {
        const a = action[i][t];
        const val = actionStr(a);
        let cls = 'slr1-cell';
        if (a) {
          if (a.type === 'shift')  cls += ' cell-shift';
          else if (a.type === 'reduce') cls += ' cell-reduce';
          else cls += ' cell-acc';
        }
        html += `<td class="${cls}">${val}</td>`;
      });
      nts.forEach(nt => {
        const v = gotoTbl[i][nt];
        html += `<td class="slr1-cell cell-goto">${v !== undefined ? v : ''}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    root.querySelector('#lab4-table-wrap').innerHTML = html;

    const bar = root.querySelector('#lab4-conflict-bar');
    bar.hidden = false;
    if (conflicts.length) {
      bar.className = 'slr1-conflict-bar has-conflict';
      bar.innerHTML = `<span class="conflict-title">⚠ 发现 ${conflicts.length} 个冲突，该文法不是 SLR(1) 文法</span>`
        + conflicts.map(c => `<div class="conflict-item">${c}</div>`).join('');
    } else {
      bar.className = 'slr1-conflict-bar no-conflict';
      bar.innerHTML = `<span class="conflict-ok">✓ 无冲突，该文法是 SLR(1) 文法</span>`;
    }
  }

  // ── 主流程 ────────────────────────────────────────────────
  function regenerate(src) {
    const status = root.querySelector('#lab4-editor-status');
    try {
      const g = parseGrammar(src);
      const { states, transitions } = buildCanonical(g);
      const first  = computeFirst(g);
      const follow = computeFollow(g, first);
      const { action, gotoTbl, conflicts } = buildSLR1(g, states, transitions, follow);
      renderFirstFollow(g, first, follow);
      renderTable(g, states, action, gotoTbl, conflicts);
      status.className = 'editor-status ok';
      status.textContent = `就绪 · ${states.length} 个状态`;
    } catch (e) {
      status.className = 'editor-status err';
      status.textContent = e.message;
    }
  }

  const editor = root.querySelector('#lab4-editor');
  editor.value = DEFAULT_GRAMMAR;
  editor.addEventListener('input', () => regenerate(editor.value));
  regenerate(DEFAULT_GRAMMAR);
}

App.register({
  id: 'lab4',
  label: '实验四 · SLR(1) 分析表',
  figNo: '03',
  mount: mountLab4
});
