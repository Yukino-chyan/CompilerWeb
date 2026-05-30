import test from 'node:test';
import assert from 'node:assert/strict';
import SemanticLabCore from '../semantic.js';
import IRLabCore from '../ir.js';

test('generates quadruples for assignments, arithmetic, return, and top-level call', () => {
  const source = `int main() {
    int a;
    int b;
    int c;
    a = 3;
    b = 2;
    c = a * b + 5;
    return c;
  };
  main()`;

  const semantic = SemanticLabCore.analyzeSource(source);
  assert.equal(semantic.diagnostics.length, 0);

  const ir = IRLabCore.generateIR(semantic.ast);

  assert.deepEqual(ir.quads.map(q => [q.op, q.arg1, q.arg2, q.result]), [
    ['=', '3', '', 'a'],
    ['=', '2', '', 'b'],
    ['*', 'a', 'b', 'T1'],
    ['+', 'T1', '5', 'T2'],
    ['=', 'T2', '', 'c'],
    ['return', 'c', '', ''],
    ['call', 'main', '0', 'T3']
  ]);
  assert.deepEqual(ir.temps, ['T1', 'T2', 'T3']);
});

test('generates patched jumps for if-else and while statements', () => {
  const source = `int main() {
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

  const semantic = SemanticLabCore.analyzeSource(source);
  assert.equal(semantic.diagnostics.length, 0);

  const ir = IRLabCore.generateIR(semantic.ast);
  const rows = ir.quads.map(q => [q.op, q.arg1, q.arg2, q.result]);

  assert.equal(rows.some(r => r[0] === 'j>=' && r[1] === 'a' && r[2] === 'b'), true);
  assert.equal(rows.some(r => r[0] === 'j!=' && r[1] === 'a' && r[2] === '1'), true);
  assert.equal(rows.some(r => r[0] === 'j' && r[3] === '3'), true);
  assert.equal(rows.at(-2)[0], 'return');
  assert.equal(rows.at(-1)[0], 'call');
});
