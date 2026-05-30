import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('registers Lab5 when App is a browser global lexical binding', () => {
  const code = readFileSync(new URL('../semantic.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {} });

  vm.runInContext(`
    const App = {
      register(def) {
        globalThis.registeredLab = def;
      }
    };
  `, context);
  vm.runInContext(code, context);

  assert.equal(context.registeredLab.id, 'lab5');
  assert.equal(context.registeredLab.label, '实验五 · 语义分析');
});

test('Lab5 mount renders a course grammar panel instead of a custom grammar editor', () => {
  const code = readFileSync(new URL('../semantic.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {} });

  vm.runInContext(`
    const App = {
      register(def) {
        globalThis.registeredLab = def;
      }
    };
  `, context);
  vm.runInContext(code, context);

  const stub = {
    innerHTML: '',
    className: '',
    textContent: '',
    value: '',
    dataset: {},
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} }
  };
  const root = {
    innerHTML: '',
    querySelector() { return stub; },
    querySelectorAll() { return []; }
  };
  context.registeredLab.mount(root);

  assert.match(root.innerHTML, /课程文法/);
  assert.match(root.innerHTML, /Prog -&gt; DeclList StmtList|Prog -> DeclList StmtList/);
  assert.doesNotMatch(root.innerHTML, /自定义文法/);
});
