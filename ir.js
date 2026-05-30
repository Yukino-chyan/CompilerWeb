(function(global) {
  'use strict';

  function createGenerator() {
    const code = [];
    const temps = [];
    let tempCount = 0;

    function newTemp() {
      const t = 'T' + (++tempCount);
      temps.push(t);
      return t;
    }

    function nextQuad() {
      return code.length + 1;
    }

    function emit(op, arg1 = '', arg2 = '', result = '', sourceNodeId = null) {
      code.push({
        no: code.length + 1,
        op,
        arg1,
        arg2,
        result,
        sourceNodeId
      });
      return code.length;
    }

    function backpatch(quadNo, target) {
      if (quadNo >= 1 && quadNo <= code.length) {
        code[quadNo - 1].result = String(target);
        code[quadNo - 1].patched = true;
      }
    }

    function genExpr(node) {
      if (!node) return '';
      switch (node.type) {
        case 'Num':
        case 'Flo':
        case 'Id':
          return node.name;
        case 'BinOp': {
          const left = genExpr(node.children[0]);
          const right = genExpr(node.children[1]);
          const temp = newTemp();
          emit(node.name, left, right, temp, node.id);
          return temp;
        }
        case 'ArrayAccess': {
          if (!node.children.length) return node.name;
          const index = genExpr(node.children[0]);
          const temp = newTemp();
          emit('=[]', node.name, index, temp, node.id);
          return temp;
        }
        case 'Call':
        case 'ExprStmt': {
          let argc = 0;
          node.children.forEach(arg => {
            emit('param', genExpr(arg), '', '', arg.id);
            argc++;
          });
          const temp = newTemp();
          emit('call', node.name, String(argc), temp, node.id);
          return temp;
        }
        default:
          return '';
      }
    }

    function genCondFalseJump(node) {
      if (node && node.type === 'BinOp') {
        const neg = new Map([
          ['<', 'j>='], ['<=', 'j>'], ['>', 'j<='], ['>=', 'j<'],
          ['==', 'j!='], ['!=', 'j==']
        ]);
        if (neg.has(node.name)) {
          const left = genExpr(node.children[0]);
          const right = genExpr(node.children[1]);
          return emit(neg.get(node.name), left, right, '', node.id);
        }
      }
      return emit('jz', genExpr(node), '', '', node ? node.id : null);
    }

    function gen(node) {
      if (!node) return;
      switch (node.type) {
        case 'Program':
        case 'FunDecl':
        case 'CompStmt':
        case 'BlockBody':
          node.children.forEach(gen);
          break;
        case 'Assign': {
          const target = node.children[0];
          const rhs = genExpr(node.children[1]);
          if (!target) return;
          if (target.type === 'Id') {
            emit('=', rhs, '', target.name, node.id);
          } else if (target.type === 'ArrayAccess') {
            const index = genExpr(target.children[0]);
            emit('[]=', rhs, index, target.name, node.id);
          }
          break;
        }
        case 'IfStmt': {
          const hasElse = node.children.length >= 3;
          const falseJump = genCondFalseJump(node.children[0]);
          gen(node.children[1]);
          if (hasElse) {
            const skipElse = emit('j', '', '', '', node.id);
            backpatch(falseJump, nextQuad());
            gen(node.children[2]);
            backpatch(skipElse, nextQuad());
          } else {
            backpatch(falseJump, nextQuad());
          }
          break;
        }
        case 'WhileStmt': {
          const entry = nextQuad();
          const falseJump = genCondFalseJump(node.children[0]);
          gen(node.children[1]);
          emit('j', '', '', String(entry), node.id);
          backpatch(falseJump, nextQuad());
          break;
        }
        case 'ReturnStmt':
          emit('return', node.children[0] ? genExpr(node.children[0]) : '', '', '', node.id);
          break;
        case 'PrintStmt':
          emit('print', genExpr(node.children[0]), '', '', node.id);
          break;
        case 'InputStmt':
          emit('input', '', '', node.children[0] ? node.children[0].name : '', node.id);
          break;
        case 'Call':
        case 'ExprStmt':
          genExpr(node);
          break;
        default:
          break;
      }
    }

    return {
      code,
      temps,
      gen,
      nextQuad,
      emit,
      backpatch,
      genExpr
    };
  }

  function generateIR(ast) {
    const generator = createGenerator();
    generator.gen(ast);
    return {
      quads: generator.code,
      temps: generator.temps,
      stats: {
        quads: generator.code.length,
        temps: generator.temps.length,
        jumps: generator.code.filter(q => q.op.startsWith('j')).length,
        patched: generator.code.filter(q => q.patched).length
      }
    };
  }

  function explainQuad(quad) {
    if (!quad) return '';
    if (quad.op === '=') return `${quad.result} = ${quad.arg1}`;
    if (['+', '-', '*', '/', '<', '<=', '==', '>', '>=', '!='].includes(quad.op)) {
      return `${quad.result} = ${quad.arg1} ${quad.op} ${quad.arg2}`;
    }
    if (quad.op === '=[]') return `${quad.result} = ${quad.arg1}[${quad.arg2}]`;
    if (quad.op === '[]=') return `${quad.result}[${quad.arg2}] = ${quad.arg1}`;
    if (quad.op === 'param') return `传入参数 ${quad.arg1}`;
    if (quad.op === 'call') return `${quad.result} = call ${quad.arg1}, ${quad.arg2}`;
    if (quad.op === 'j') return `无条件跳转到第 ${quad.result} 条`;
    if (quad.op.startsWith('j') && quad.op !== 'jz') {
      return `若 ${quad.arg1} ${quad.op.slice(1)} ${quad.arg2}，跳转到第 ${quad.result} 条`;
    }
    if (quad.op === 'jz') return `若 ${quad.arg1} 为假，跳转到第 ${quad.result} 条`;
    if (quad.op === 'return') return quad.arg1 ? `返回 ${quad.arg1}` : '返回';
    if (quad.op === 'print') return `输出 ${quad.arg1}`;
    if (quad.op === 'input') return `输入到 ${quad.result}`;
    return `(${quad.op}, ${quad.arg1}, ${quad.arg2}, ${quad.result})`;
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  const DEFAULT_SOURCE = `int main() {
  int a;
  int b;
  int c;
  a = 3;
  b = 2;
  c = a * b + 5;
  return c;
};
main()`;

  const CONTROL_SOURCE = `int main() {
  int a;
  int b;
  a = 0;
  b = 3;
  while (a < b) {
    if (a == 1) {
      b = b - 1;
    } else {
      a = a + 1;
    };
  };
  return a;
};
main()`;

  function mountLab6(root) {
    const semanticCore = global.SemanticLabCore;
    if (!semanticCore) {
      root.innerHTML = '<div class="placeholder"><div class="ph-title">Lab5 前端未加载</div><div class="ph-sub">请确认 semantic.js 在 ir.js 之前加载。</div></div>';
      return;
    }

    root.innerHTML = `
      <div class="lab-grid lab6-grid">
        <aside class="pane pane-left">
          <div class="pane-section">
            <div class="section-title">样例</div>
            <div class="lab5-samples">
              <button class="lab6-sample active" data-sample="arith">表达式与赋值</button>
              <button class="lab6-sample" data-sample="control">控制流</button>
            </div>
          </div>
          <div class="pane-section">
            <div class="section-title">生成摘要</div>
            <div id="lab6-summary" class="lab6-summary"></div>
          </div>
          <div class="pane-section editor-section">
            <div class="section-title">源程序<span class="hint">无错误时生成四元式</span></div>
            <div class="editor-wrap">
              <textarea class="editor" id="lab6-editor" spellcheck="false"></textarea>
              <div id="lab6-editor-status" class="editor-status ok">就绪</div>
            </div>
            <div class="syntax-help">
              Lab6 复用 Lab5 的 AST 与语义检查；存在错误时暂不生成中间代码。
            </div>
          </div>
        </aside>

        <main class="pane pane-right lab6-main">
          <div class="slr1-header lab6-header">
            <span class="slr1-fig-title">中间代码生成</span>
            <span class="lab5-header-note">Quadruples · Temp · Backpatch</span>
          </div>
          <div class="lab6-workbench">
            <section class="lab6-quad-panel">
              <div class="lab5-panel-title">四元式</div>
              <div id="lab6-quads" class="lab6-quads"></div>
            </section>
            <section class="lab6-side-panel">
              <div class="lab5-panel-title">临时变量</div>
              <div id="lab6-temps" class="lab6-temps"></div>
              <div class="lab5-panel-title with-gap">语义检查</div>
              <div id="lab6-diagnostics" class="lab5-diagnostics"></div>
            </section>
          </div>
          <div class="lr0-detail-bar lab6-detail-bar">
            <div class="detail-header">
              <span class="detail-id" id="lab6-detail-title">选择四元式</span>
              <span class="detail-meta" id="lab6-detail-meta"></span>
            </div>
            <div id="lab6-detail-body" class="lab5-detail-body">点击四元式表中的任一行，查看它对应的中间代码含义。</div>
          </div>
        </main>
      </div>
    `;

    const editor = root.querySelector('#lab6-editor');
    const status = root.querySelector('#lab6-editor-status');
    let selectedNo = null;
    let currentIR = null;

    function renderSummary(semantic, ir) {
      const blocked = semantic.diagnostics.length > 0;
      root.querySelector('#lab6-summary').innerHTML = `
        <div class="lab5-stat ${blocked ? 'err' : 'ok'}"><span>诊断</span><strong>${semantic.diagnostics.length}</strong></div>
        <div class="lab5-stat"><span>四元式</span><strong>${ir ? ir.stats.quads : 0}</strong></div>
        <div class="lab5-stat"><span>临时变量</span><strong>${ir ? ir.stats.temps : 0}</strong></div>
        <div class="lab5-stat"><span>跳转</span><strong>${ir ? ir.stats.jumps : 0}</strong></div>
      `;
    }

    function renderQuads(ir, semantic) {
      const el = root.querySelector('#lab6-quads');
      if (semantic.diagnostics.length) {
        el.innerHTML = '<div class="lab6-blocked">存在词法/语法/语义错误，暂不生成中间代码。</div>';
        return;
      }
      if (!ir.quads.length) {
        el.innerHTML = '<div class="lab6-blocked">暂无四元式。</div>';
        return;
      }
      el.innerHTML = `<table class="lab6-quad-table">
        <thead><tr><th>#</th><th>op</th><th>arg1</th><th>arg2</th><th>result</th></tr></thead>
        <tbody>
          ${ir.quads.map(q => `<tr data-quad-no="${q.no}" class="${q.no === selectedNo ? 'selected' : ''}">
            <td>${q.no}</td><td>${escapeHTML(q.op)}</td><td>${escapeHTML(q.arg1)}</td><td>${escapeHTML(q.arg2)}</td><td>${escapeHTML(q.result)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    }

    function renderTemps(ir) {
      const el = root.querySelector('#lab6-temps');
      el.innerHTML = ir && ir.temps.length
        ? ir.temps.map(t => `<span class="lab6-temp">${escapeHTML(t)}</span>`).join('')
        : '<div class="lab5-empty">（无临时变量）</div>';
    }

    function renderDiagnostics(semantic) {
      const el = root.querySelector('#lab6-diagnostics');
      if (!semantic.diagnostics.length) {
        el.innerHTML = '<div class="lab5-ok">✓ 可生成中间代码</div>';
        return;
      }
      el.innerHTML = semantic.diagnostics.map(d =>
        `<div class="lab5-diag"><strong>${escapeHTML(d.kind)}</strong><span>${escapeHTML(d.message)}</span>${d.line ? `<small>第 ${d.line} 行</small>` : ''}</div>`
      ).join('');
    }

    function renderDetail(quad) {
      root.querySelector('#lab6-detail-title').textContent = quad ? `#${quad.no} ${quad.op}` : '选择四元式';
      root.querySelector('#lab6-detail-meta').textContent = quad && quad.patched ? '已回填跳转目标' : '';
      root.querySelector('#lab6-detail-body').innerHTML = quad
        ? `<div class="lab6-explain">${escapeHTML(explainQuad(quad))}</div>`
        : '点击四元式表中的任一行，查看它对应的中间代码含义。';
    }

    function regenerate() {
      const semantic = semanticCore.analyzeSource(editor.value);
      currentIR = semantic.diagnostics.length ? null : generateIR(semantic.ast);
      if (currentIR && (!selectedNo || !currentIR.quads.some(q => q.no === selectedNo))) {
        selectedNo = currentIR.quads[0] ? currentIR.quads[0].no : null;
      }
      renderSummary(semantic, currentIR);
      renderQuads(currentIR, semantic);
      renderTemps(currentIR);
      renderDiagnostics(semantic);
      renderDetail(currentIR ? currentIR.quads.find(q => q.no === selectedNo) : null);
      status.className = semantic.diagnostics.length ? 'editor-status err' : 'editor-status ok';
      status.textContent = semantic.diagnostics.length
        ? `${semantic.diagnostics.length} 条诊断 · 暂不生成`
        : `已生成 ${currentIR.stats.quads} 条四元式`;
    }

    root.querySelector('#lab6-quads').addEventListener('click', event => {
      const row = event.target.closest('[data-quad-no]');
      if (!row || !currentIR) return;
      selectedNo = Number(row.dataset.quadNo);
      root.querySelectorAll('[data-quad-no]').forEach(r => r.classList.toggle('selected', r === row));
      renderDetail(currentIR.quads.find(q => q.no === selectedNo));
    });

    root.querySelectorAll('.lab6-sample').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.lab6-sample').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editor.value = btn.dataset.sample === 'control' ? CONTROL_SOURCE : DEFAULT_SOURCE;
        selectedNo = null;
        regenerate();
      });
    });

    editor.value = DEFAULT_SOURCE;
    editor.addEventListener('input', () => { selectedNo = null; regenerate(); });
    regenerate();
  }

  const api = { generateIR, explainQuad, DEFAULT_SOURCE, CONTROL_SOURCE };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.IRLabCore = api;

  const appApi = (typeof App !== 'undefined' && App && typeof App.register === 'function')
    ? App
    : (global.App && typeof global.App.register === 'function' ? global.App : null);

  if (appApi) {
    appApi.register({
      id: 'lab6',
      label: '实验六 · 中间代码',
      figNo: '05',
      mount: mountLab6
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
