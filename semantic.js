(function(global) {
  'use strict';

  const KEYWORDS = new Map([
    ['int', 'INT'], ['float', 'FLOAT'], ['void', 'VOID'],
    ['if', 'IF'], ['else', 'ELSE'], ['while', 'WHILE'],
    ['return', 'RETURN'], ['input', 'INPUT'], ['print', 'PRINT']
  ]);

  const TYPE_TOKENS = new Set(['INT', 'FLOAT', 'VOID']);
  const BINARY_PRECEDENCE = new Map([
    ['EQ', 1], ['NE', 1], ['LT', 1], ['LE', 1], ['GT', 1], ['GE', 1],
    ['ADD', 2], ['SUB', 2],
    ['MUL', 3], ['DIV', 3]
  ]);
  const TOKEN_TEXT = {
    ADD: '+', SUB: '-', MUL: '*', DIV: '/', ASG: '=',
    LT: '<', LE: '<=', EQ: '==', GT: '>', GE: '>=', NE: '!=',
    LPA: '(', RPA: ')', LBK: '[', RBK: ']', LBR: '{', RBR: '}',
    CMA: ',', SCO: ';'
  };

  function scan(source) {
    const tokens = [];
    const diagnostics = [];
    let i = 0, line = 1, col = 1;

    function push(type, lexeme, startLine, startCol) {
      tokens.push({ type, lexeme, line: startLine, col: startCol });
    }
    function advance() {
      const ch = source[i++];
      if (ch === '\n') { line++; col = 1; }
      else col++;
      return ch;
    }
    function peek(n = 0) { return source[i + n] || ''; }

    while (i < source.length) {
      let ch = peek();
      if (/\s/.test(ch)) { advance(); continue; }

      const startLine = line, startCol = col;
      if (/[A-Za-z]/.test(ch)) {
        let text = '';
        while (/[A-Za-z0-9]/.test(peek())) text += advance();
        push(KEYWORDS.get(text) || 'ID', text, startLine, startCol);
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1)))) {
        let text = '', hasDot = false;
        while (/[0-9]/.test(peek()) || (!hasDot && peek() === '.')) {
          if (peek() === '.') hasDot = true;
          text += advance();
        }
        push(hasDot ? 'FLO' : 'NUM', text, startLine, startCol);
        continue;
      }

      const two = ch + peek(1);
      const twoMap = { '<=': 'LE', '>=': 'GE', '==': 'EQ', '!=': 'NE' };
      if (twoMap[two]) {
        advance(); advance();
        push(twoMap[two], two, startLine, startCol);
        continue;
      }

      const oneMap = {
        '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '=': 'ASG',
        '<': 'LT', '>': 'GT', '(': 'LPA', ')': 'RPA', '[': 'LBK', ']': 'RBK',
        '{': 'LBR', '}': 'RBR', ',': 'CMA', ';': 'SCO'
      };
      if (oneMap[ch]) {
        advance();
        push(oneMap[ch], ch, startLine, startCol);
        continue;
      }

      diagnostics.push({
        kind: '词法错误',
        message: `无法识别的字符 "${ch}"`,
        line: startLine,
        col: startCol
      });
      advance();
    }
    tokens.push({ type: '$', lexeme: '', line, col });
    return { tokens, diagnostics };
  }

  function createNodeFactory() {
    let nextId = 1;
    return function node(type, props = {}, children = []) {
      return {
        id: nextId++,
        type,
        name: props.name || '',
        value: props.value || '',
        valueType: props.valueType || '',
        line: props.line || 0,
        children: children.filter(Boolean)
      };
    };
  }

  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
      this.diagnostics = [];
      this.node = createNodeFactory();
    }

    current() { return this.tokens[this.pos] || this.tokens[this.tokens.length - 1]; }
    match(type) { return this.current().type === type; }
    take(type) {
      const tok = this.current();
      if (type && tok.type !== type) {
        this.error(`期望 ${this.readable(type)}，实际为 ${this.readable(tok.type)}`, tok);
        return { type, lexeme: '', line: tok.line, col: tok.col };
      }
      this.pos++;
      return tok;
    }
    maybe(type) {
      if (!this.match(type)) return null;
      return this.take(type);
    }
    error(message, tok = this.current()) {
      this.diagnostics.push({ kind: '语法错误', message, line: tok.line, col: tok.col });
    }
    readable(type) {
      if (TOKEN_TEXT[type]) return `"${TOKEN_TEXT[type]}"`;
      if (type === '$') return '文件结束';
      return type;
    }

    parseProgram() {
      const children = [];
      while (!this.match('$')) {
        if (TYPE_TOKENS.has(this.current().type)) children.push(this.parseDeclaration());
        else children.push(this.parseStatement(true));
        this.maybe('SCO');
      }
      return this.node('Program', {}, children);
    }

    parseType() {
      const tok = this.current();
      if (!TYPE_TOKENS.has(tok.type)) {
        this.error('期望类型 int / float / void', tok);
        return 'int';
      }
      this.take(tok.type);
      return tok.lexeme;
    }

    parseDeclaration() {
      const valueType = this.parseType();
      const id = this.take('ID');
      if (this.maybe('LPA')) {
        const params = this.parseParamList();
        this.take('RPA');
        const body = this.parseBlock(false);
        return this.node('FunDecl', { name: id.lexeme, valueType, line: id.line }, [...params, ...body.children]);
      }
      let declaredType = valueType;
      if (this.maybe('LBK')) {
        this.take('NUM');
        this.take('RBK');
        declaredType += '[]';
      }
      let init = null;
      if (this.maybe('ASG')) init = this.parseExpression();
      this.maybe('SCO');
      return this.node('VarDecl', { name: id.lexeme, valueType: declaredType, line: id.line }, init ? [init] : []);
    }

    parseParamList() {
      const params = [];
      if (this.match('RPA')) return params;
      while (!this.match('RPA') && !this.match('$')) {
        const valueType = this.parseType();
        const id = this.take('ID');
        let paramType = valueType;
        if (this.maybe('LBK')) { this.take('RBK'); paramType += '[]'; }
        params.push(this.node('Param', { name: id.lexeme, valueType: paramType, line: id.line }));
        if (!this.maybe('CMA') && !this.maybe('SCO')) break;
      }
      return params;
    }

    parseBlock(consumeScope = true) {
      const start = this.take('LBR');
      const children = [];
      while (!this.match('RBR') && !this.match('$')) {
        if (TYPE_TOKENS.has(this.current().type)) children.push(this.parseDeclaration());
        else children.push(this.parseStatement(false));
        this.maybe('SCO');
      }
      this.take('RBR');
      return this.node(consumeScope ? 'CompStmt' : 'BlockBody', { line: start.line }, children);
    }

    parseStatement(topLevel) {
      const tok = this.current();
      if (tok.type === 'RETURN') {
        this.take('RETURN');
        return this.node('ReturnStmt', { line: tok.line }, [this.parseExpression()]);
      }
      if (tok.type === 'PRINT') {
        this.take('PRINT');
        return this.node('PrintStmt', { line: tok.line }, [this.parseExpression()]);
      }
      if (tok.type === 'INPUT') {
        this.take('INPUT');
        const id = this.take('ID');
        return this.node('InputStmt', { line: tok.line }, [this.node('Id', { name: id.lexeme, line: id.line })]);
      }
      if (tok.type === 'IF') {
        this.take('IF');
        this.take('LPA');
        const condition = this.parseExpression();
        this.take('RPA');
        const thenBranch = this.parseStatement(false);
        let elseBranch = null;
        if (this.maybe('ELSE')) elseBranch = this.parseStatement(false);
        return this.node('IfStmt', { line: tok.line }, elseBranch ? [condition, thenBranch, elseBranch] : [condition, thenBranch]);
      }
      if (tok.type === 'WHILE') {
        this.take('WHILE');
        this.take('LPA');
        const condition = this.parseExpression();
        this.take('RPA');
        const body = this.parseStatement(false);
        return this.node('WhileStmt', { line: tok.line }, [condition, body]);
      }
      if (tok.type === 'LBR') return this.parseBlock(true);
      if (tok.type === 'ID') {
        const id = this.take('ID');
        if (this.maybe('ASG')) {
          return this.node('Assign', { line: id.line }, [
            this.node('Id', { name: id.lexeme, line: id.line }),
            this.parseExpression()
          ]);
        }
        if (this.maybe('LPA')) {
          const args = this.parseArgList();
          this.take('RPA');
          return this.node(topLevel ? 'Call' : 'ExprStmt', { name: id.lexeme, line: id.line }, args);
        }
        return this.node('Id', { name: id.lexeme, line: id.line });
      }
      this.error(`无法解析语句：${this.readable(tok.type)}`, tok);
      this.pos++;
      return this.node('Empty', { line: tok.line });
    }

    parseArgList() {
      const args = [];
      if (this.match('RPA')) return args;
      while (!this.match('RPA') && !this.match('$')) {
        args.push(this.parseExpression());
        if (!this.maybe('CMA')) break;
      }
      return args;
    }

    parseExpression(minPrec = 0) {
      let left = this.parsePrimary();
      while (BINARY_PRECEDENCE.has(this.current().type) && BINARY_PRECEDENCE.get(this.current().type) >= minPrec) {
        const op = this.take(this.current().type);
        const prec = BINARY_PRECEDENCE.get(op.type);
        const right = this.parseExpression(prec + 1);
        left = this.node('BinOp', { name: op.lexeme, line: op.line }, [left, right]);
      }
      return left;
    }

    parsePrimary() {
      const tok = this.current();
      if (tok.type === 'NUM') {
        this.take('NUM');
        return this.node('Num', { name: tok.lexeme, valueType: 'int', line: tok.line });
      }
      if (tok.type === 'FLO') {
        this.take('FLO');
        return this.node('Flo', { name: tok.lexeme, valueType: 'float', line: tok.line });
      }
      if (tok.type === 'ID') {
        this.take('ID');
        if (this.maybe('LPA')) {
          const args = this.parseArgList();
          this.take('RPA');
          return this.node('Call', { name: tok.lexeme, line: tok.line }, args);
        }
        if (this.maybe('LBK')) {
          const index = this.parseExpression();
          this.take('RBK');
          return this.node('ArrayAccess', { name: tok.lexeme, line: tok.line }, [index]);
        }
        return this.node('Id', { name: tok.lexeme, line: tok.line });
      }
      if (this.maybe('LPA')) {
        const expr = this.parseExpression();
        this.take('RPA');
        return expr;
      }
      this.error(`表达式中出现意外符号 ${this.readable(tok.type)}`, tok);
      this.pos++;
      return this.node('Empty', { line: tok.line });
    }
  }

  function analyzeAst(ast) {
    const symbols = [];
    const diagnostics = [];
    const scopes = [];
    let scopeLabel = '全局';
    let currentReturnType = '';

    function enterScope() { scopes.push(new Map()); }
    function exitScope() { scopes.pop(); }
    function declare(name, type, node) {
      if (!scopes.length) enterScope();
      const scope = scopes[scopes.length - 1];
      if (scope.has(name)) {
        diagnostics.push({ kind: '语义错误', message: `重复声明：${name}（当前作用域已有同名符号）`, line: node.line });
        return false;
      }
      const entry = { name, type, scopeLevel: scopes.length - 1, scope: scopeLabel };
      scope.set(name, entry);
      symbols.push(entry);
      return true;
    }
    function lookup(name) {
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (scopes[i].has(name)) return scopes[i].get(name);
      }
      return null;
    }
    function elemType(type) { return type.endsWith('[]') ? type.slice(0, -2) : type; }
    function promote(a, b) { return a === 'float' || b === 'float' ? 'float' : (a || b || ''); }
    function compatible(target, value) {
      if (!target || !value) return true;
      return target === value || (target === 'float' && value === 'int');
    }

    function walk(node) {
      if (!node) return '';
      switch (node.type) {
        case 'Program':
          enterScope();
          node.children.filter(c => c.type === 'FunDecl').forEach(fn => declare(fn.name, fn.valueType, fn));
          node.children.forEach(c => walk(c));
          exitScope();
          return '';
        case 'FunDecl': {
          const savedLabel = scopeLabel;
          const savedReturn = currentReturnType;
          scopeLabel = node.name;
          currentReturnType = node.valueType;
          enterScope();
          node.children.forEach(c => {
            if (c.type === 'Param') declare(c.name, c.valueType, c);
            else walk(c);
          });
          exitScope();
          scopeLabel = savedLabel;
          currentReturnType = savedReturn;
          return node.valueType;
        }
        case 'VarDecl': {
          declare(node.name, node.valueType, node);
          if (node.children[0]) {
            const initType = walk(node.children[0]);
            if (!compatible(node.valueType, initType)) {
              diagnostics.push({ kind: '语义错误', message: `类型不匹配：用 ${initType} 初始化 ${node.name}(${node.valueType})`, line: node.line });
            }
          }
          return node.valueType;
        }
        case 'Assign': {
          const leftType = walk(node.children[0]);
          const rightType = walk(node.children[1]);
          if (!compatible(leftType, rightType)) {
            const target = node.children[0] ? node.children[0].name : '';
            diagnostics.push({ kind: '语义错误', message: `类型不匹配：不能把 ${rightType} 赋给 ${target}(${leftType})`, line: node.line });
          }
          node.valueType = leftType;
          return leftType;
        }
        case 'ReturnStmt': {
          const actual = node.children[0] ? walk(node.children[0]) : 'void';
          if (currentReturnType === 'void' && actual !== 'void' && actual) {
            diagnostics.push({ kind: '语义错误', message: '返回值类型不符：void 函数不应返回值', line: node.line });
          } else if (currentReturnType !== 'void' && !compatible(currentReturnType, actual)) {
            diagnostics.push({ kind: '语义错误', message: `返回值类型不符：函数声明返回 ${currentReturnType}，实际返回 ${actual}`, line: node.line });
          }
          node.valueType = actual;
          return actual;
        }
        case 'BinOp': {
          const a = walk(node.children[0]);
          const b = walk(node.children[1]);
          node.valueType = ['<', '<=', '==', '>', '>=', '!='].includes(node.name) ? 'int' : promote(a, b);
          return node.valueType;
        }
        case 'Id': {
          const found = lookup(node.name);
          if (!found) {
            diagnostics.push({ kind: '语义错误', message: `未声明的标识符：${node.name}`, line: node.line });
            return '';
          }
          node.valueType = found.type;
          return found.type;
        }
        case 'Call': {
          const found = lookup(node.name);
          if (!found) diagnostics.push({ kind: '语义错误', message: `未声明的标识符：${node.name}`, line: node.line });
          node.children.forEach(walk);
          node.valueType = found ? found.type : '';
          return node.valueType;
        }
        case 'ExprStmt':
          node.children.forEach(walk);
          return '';
        case 'ArrayAccess': {
          const found = lookup(node.name);
          if (!found) {
            diagnostics.push({ kind: '语义错误', message: `未声明的标识符：${node.name}`, line: node.line });
            return '';
          }
          node.children.forEach(walk);
          node.valueType = elemType(found.type);
          return node.valueType;
        }
        case 'CompStmt':
          enterScope();
          node.children.forEach(walk);
          exitScope();
          return '';
        case 'PrintStmt':
        case 'InputStmt':
        case 'BlockBody':
          node.children.forEach(walk);
          return '';
        case 'Num':
        case 'Flo':
          return node.valueType;
        default:
          node.children.forEach(walk);
          return node.valueType || '';
      }
    }

    walk(ast);
    return { symbols, diagnostics };
  }

  function flattenAst(node, out = []) {
    if (!node) return out;
    out.push(node);
    node.children.forEach(child => flattenAst(child, out));
    return out;
  }

  function analyzeSource(source) {
    const scanResult = scan(source);
    const parser = new Parser(scanResult.tokens);
    const ast = parser.parseProgram();
    const semantic = analyzeAst(ast);
    const diagnostics = [...scanResult.diagnostics, ...parser.diagnostics, ...semantic.diagnostics];
    const astNodes = flattenAst(ast);
    return {
      tokens: scanResult.tokens.filter(t => t.type !== '$'),
      ast,
      astNodes,
      symbols: semantic.symbols,
      diagnostics,
      stats: {
        tokens: scanResult.tokens.length - 1,
        astNodes: astNodes.length,
        symbols: semantic.symbols.length,
        diagnostics: diagnostics.length
      }
    };
  }

  const DEFAULT_SOURCE = `int main() {
  int d;
  d = 5;
  return d;
};
main()`;

  const ERROR_SOURCE = `int foo() {
  int x;
  int x;
  float y;
  x = y;
  return y;
};
foo()`;

  const COURSE_GRAMMAR = `Prog -> DeclList StmtList
DeclList -> DeclList Decl SCO | ε
Decl -> Type ID
      | Type ID ASG Expr
      | Type ID LBK NUM RBK
      | Type ID LPA ParamList RPA LBR DeclList StmtList RBR
Type -> INT | FLOAT | VOID
ParamList -> ParamList Param SCO | ε
Param -> Type ID | Type ID LBK RBK | Type ID LPA Type RPA
StmtList -> StmtList SCO Stmt | Stmt | StmtList SCO
Stmt -> ID ASG Expr
      | ID LBK Expr RBK ASG Expr
      | IF LPA Bool RPA Stmt
      | IF LPA Bool RPA Stmt ELSE Stmt
      | WHILE LPA Bool RPA Stmt
      | RETURN Expr
      | LBR StmtList RBR
      | ID LPA ArgList RPA
      | PRINT Expr
      | INPUT ID
Bool -> Expr RelOp Expr | Expr | ID ASG Expr
RelOp -> LT | LE | EQ | GT | GE | NE
Expr -> Expr ADD Term | Expr SUB Term | Term
Term -> Term MUL Fact | Term DIV Fact | Fact
Fact -> NUM | FLO | ID | ID LBK Expr RBK | LPA Expr RPA | ID LPA ArgList RPA
ArgList -> ArgList Arg CMA | ε
Arg -> Expr | ID LBK RBK`;

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function displayNode(node) {
    const name = node.name ? ` (${node.name})` : '';
    const type = node.valueType ? ` : ${node.valueType}` : '';
    return `${node.type}${name}${type}`;
  }

  function mountLab5(root) {
    root.innerHTML = `
      <div class="lab-grid lab5-grid">
        <aside class="pane pane-left">
          <div class="pane-section">
            <div class="section-title">图例</div>
            <div class="legend lab5-legend">
              <div class="row"><div class="swatch ast"></div><div class="label">AST 节点<small>点击查看属性</small></div></div>
              <div class="row"><div class="swatch symbol"></div><div class="label">符号表<small>按作用域分组</small></div></div>
              <div class="row"><div class="swatch active"></div><div class="label">语义错误<small>重复声明 / 类型不符</small></div></div>
            </div>
          </div>
          <div class="pane-section">
            <div class="section-title">样例</div>
            <div class="lab5-samples">
              <button class="lab5-sample active" data-sample="valid">正确样例</button>
              <button class="lab5-sample" data-sample="error">错误样例</button>
            </div>
          </div>
          <div class="pane-section">
            <div class="section-title">语义摘要</div>
            <div id="lab5-summary" class="lab5-summary"></div>
          </div>
          <div class="pane-section">
            <div class="section-title">课程文法<span class="hint">Lab5 固定语义动作</span></div>
            <details class="lab5-grammar" open>
              <summary>查看语义分析使用的文法</summary>
              <pre>${escapeHTML(COURSE_GRAMMAR)}</pre>
            </details>
          </div>
          <div class="pane-section editor-section">
            <div class="section-title">源程序<span class="hint">编辑后自动分析</span></div>
            <div class="editor-wrap">
              <textarea class="editor" id="lab5-editor" spellcheck="false"></textarea>
              <div id="lab5-editor-status" class="editor-status ok">就绪</div>
            </div>
            <div class="syntax-help">
              Lab5 语义分析基于课程固定文法与语义动作；这里编辑的是待分析源程序。
            </div>
          </div>
        </aside>

        <main class="pane pane-right lab5-main">
          <div class="slr1-header lab5-header">
            <span class="slr1-fig-title">语义分析工作台</span>
            <span class="lab5-header-note">AST · 符号表 · 语义检查</span>
          </div>
          <div class="lab5-workbench">
            <section class="lab5-panel lab5-ast-panel">
              <div class="lab5-panel-title">抽象语法树</div>
              <div id="lab5-ast" class="lab5-ast"></div>
            </section>
            <section class="lab5-panel lab5-side-panel">
              <div class="lab5-panel-title">Token 流</div>
              <div id="lab5-token-stream" class="lab5-token-stream"></div>
              <div class="lab5-panel-title with-gap">符号表</div>
              <div id="lab5-symbols" class="lab5-symbols"></div>
              <div class="lab5-panel-title with-gap">语义检查</div>
              <div id="lab5-diagnostics" class="lab5-diagnostics"></div>
            </section>
          </div>
          <div class="lr0-detail-bar lab5-detail-bar">
            <div class="detail-header">
              <span class="detail-id" id="lab5-detail-title">选择 AST 节点</span>
              <span class="detail-meta" id="lab5-detail-meta"></span>
            </div>
            <div id="lab5-detail-body" class="lab5-detail-body">点击右侧 AST 中的节点，查看节点类型、名称和推导出的语义类型。</div>
          </div>
        </main>
      </div>
    `;

    const editor = root.querySelector('#lab5-editor');
    const status = root.querySelector('#lab5-editor-status');
    let currentResult = null;
    let selectedId = null;

    function renderSummary(result) {
      const ok = result.diagnostics.length === 0;
      root.querySelector('#lab5-summary').innerHTML = `
        <div class="lab5-stat ${ok ? 'ok' : 'err'}"><span>Token</span><strong>${result.stats.tokens}</strong></div>
        <div class="lab5-stat"><span>AST</span><strong>${result.stats.astNodes}</strong></div>
        <div class="lab5-stat"><span>符号</span><strong>${result.stats.symbols}</strong></div>
        <div class="lab5-stat ${ok ? 'ok' : 'err'}"><span>诊断</span><strong>${result.stats.diagnostics}</strong></div>
      `;
    }

    function renderAstNode(node) {
      const selected = node.id === selectedId ? ' selected' : '';
      const children = node.children.length
        ? `<div class="lab5-ast-children">${node.children.map(renderAstNode).join('')}</div>`
        : '';
      return `<div class="lab5-ast-node-wrap">
        <button class="lab5-ast-node${selected}" data-node-id="${node.id}">
          <span class="node-type">${escapeHTML(node.type)}</span>
          ${node.name ? `<span class="node-name">${escapeHTML(node.name)}</span>` : ''}
          ${node.valueType ? `<span class="node-vtype">${escapeHTML(node.valueType)}</span>` : ''}
        </button>
        ${children}
      </div>`;
    }

    function renderTokens(result) {
      root.querySelector('#lab5-token-stream').innerHTML = result.tokens
        .map(t => `<span class="lab5-token"><b>${escapeHTML(t.type)}</b>${escapeHTML(t.lexeme)}</span>`)
        .join('');
    }

    function renderSymbols(result) {
      if (!result.symbols.length) {
        root.querySelector('#lab5-symbols').innerHTML = '<div class="lab5-empty">（空）</div>';
        return;
      }
      const groups = new Map();
      result.symbols.forEach(s => {
        if (!groups.has(s.scope)) groups.set(s.scope, []);
        groups.get(s.scope).push(s);
      });
      root.querySelector('#lab5-symbols').innerHTML = [...groups.entries()].map(([scope, rows]) => `
        <div class="lab5-scope">
          <div class="scope-name">作用域 [${escapeHTML(scope)}]</div>
          ${rows.map(s => `<div class="symbol-row"><code>${escapeHTML(s.name)}</code><span>${escapeHTML(s.type)}</span><small>层级 ${s.scopeLevel}</small></div>`).join('')}
        </div>
      `).join('');
    }

    function renderDiagnostics(result) {
      const el = root.querySelector('#lab5-diagnostics');
      if (!result.diagnostics.length) {
        el.innerHTML = '<div class="lab5-ok">✓ 无错误</div>';
        return;
      }
      el.innerHTML = result.diagnostics.map(d =>
        `<div class="lab5-diag"><strong>${escapeHTML(d.kind)}</strong><span>${escapeHTML(d.message)}</span>${d.line ? `<small>第 ${d.line} 行</small>` : ''}</div>`
      ).join('');
    }

    function renderDetail(node) {
      root.querySelector('#lab5-detail-title').textContent = node ? `#${node.id} ${node.type}` : '选择 AST 节点';
      root.querySelector('#lab5-detail-meta').textContent = node && node.line ? `第 ${node.line} 行` : '';
      root.querySelector('#lab5-detail-body').innerHTML = node
        ? `<div class="lab5-detail-grid">
             <div><span>类型</span><strong>${escapeHTML(node.type)}</strong></div>
             <div><span>名称/值</span><strong>${escapeHTML(node.name || node.value || '—')}</strong></div>
             <div><span>语义类型</span><strong>${escapeHTML(node.valueType || '—')}</strong></div>
             <div><span>子节点</span><strong>${node.children.length}</strong></div>
           </div>`
        : '点击右侧 AST 中的节点，查看节点类型、名称和推导出的语义类型。';
    }

    function regenerate() {
      currentResult = analyzeSource(editor.value);
      if (!selectedId || !currentResult.astNodes.some(n => n.id === selectedId)) {
        selectedId = currentResult.ast.id;
      }
      renderSummary(currentResult);
      root.querySelector('#lab5-ast').innerHTML = renderAstNode(currentResult.ast);
      renderTokens(currentResult);
      renderSymbols(currentResult);
      renderDiagnostics(currentResult);
      renderDetail(currentResult.astNodes.find(n => n.id === selectedId));
      status.className = currentResult.diagnostics.length ? 'editor-status err' : 'editor-status ok';
      status.textContent = currentResult.diagnostics.length
        ? `${currentResult.diagnostics.length} 条诊断`
        : `就绪 · ${currentResult.stats.astNodes} 个 AST 节点`;
    }

    root.querySelector('#lab5-ast').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-node-id]');
      if (!btn || !currentResult) return;
      selectedId = Number(btn.dataset.nodeId);
      root.querySelectorAll('.lab5-ast-node').forEach(n => n.classList.toggle('selected', n === btn));
      renderDetail(currentResult.astNodes.find(n => n.id === selectedId));
    });

    root.querySelectorAll('.lab5-sample').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.lab5-sample').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editor.value = btn.dataset.sample === 'error' ? ERROR_SOURCE : DEFAULT_SOURCE;
        selectedId = null;
        regenerate();
      });
    });

    editor.value = DEFAULT_SOURCE;
    editor.addEventListener('input', () => { selectedId = null; regenerate(); });
    regenerate();
  }

  const api = { scan, analyzeSource, DEFAULT_SOURCE, ERROR_SOURCE, COURSE_GRAMMAR };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SemanticLabCore = api;

  const appApi = (typeof App !== 'undefined' && App && typeof App.register === 'function')
    ? App
    : (global.App && typeof global.App.register === 'function' ? global.App : null);

  if (appApi) {
    appApi.register({
      id: 'lab5',
      label: '实验五 · 语义分析',
      figNo: '04',
      mount: mountLab5
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
