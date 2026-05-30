import test from 'node:test';
import assert from 'node:assert/strict';
import SemanticLabCore from '../semantic.js';

test('builds AST and symbol table for a valid function program', () => {
  const source = `int main() {
    int d;
    d = 5;
    return d;
  };
  main()`;

  const result = SemanticLabCore.analyzeSource(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.ast.type, 'Program');
  assert.equal(result.symbols.some((s) => s.name === 'main' && s.scope === '全局'), true);
  assert.equal(result.symbols.some((s) => s.name === 'd' && s.scope === 'main'), true);
});

test('reports duplicate declarations and type mismatch', () => {
  const source = `int foo() {
    int x;
    int x;
    float y;
    x = y;
    return y;
  };
  foo()`;

  const result = SemanticLabCore.analyzeSource(source);

  assert.equal(result.diagnostics.some((d) => d.message.includes('重复声明：x')), true);
  assert.equal(result.diagnostics.some((d) => d.message.includes('不能把 float 赋给 x(int)')), true);
  assert.equal(result.diagnostics.some((d) => d.message.includes('函数声明返回 int，实际返回 float')), true);
});

test('exposes the fixed Lab5 course grammar used by semantic analysis', () => {
  assert.match(SemanticLabCore.COURSE_GRAMMAR, /Prog -> DeclList StmtList/);
  assert.match(SemanticLabCore.COURSE_GRAMMAR, /Decl -> Type ID/);
  assert.match(SemanticLabCore.COURSE_GRAMMAR, /Stmt -> ID ASG Expr/);
  assert.match(SemanticLabCore.COURSE_GRAMMAR, /Expr -> Expr ADD Term/);
});
