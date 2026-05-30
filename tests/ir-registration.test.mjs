import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('index loads Lab6 IR module after Lab5 semantic module', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const semanticPos = html.indexOf('semantic.js');
  const irPos = html.indexOf('ir.js');

  assert.notEqual(semanticPos, -1);
  assert.notEqual(irPos, -1);
  assert.equal(semanticPos < irPos, true);
});

test('registers Lab6 when App is a browser global lexical binding', () => {
  const code = readFileSync(new URL('../ir.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {}, SemanticLabCore: {} });

  vm.runInContext(`
    const App = {
      register(def) {
        globalThis.registeredLab = def;
      }
    };
  `, context);
  vm.runInContext(code, context);

  assert.equal(context.registeredLab.id, 'lab6');
  assert.equal(context.registeredLab.label, '实验六 · 中间代码');
});
