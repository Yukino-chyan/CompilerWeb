import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function hexValue(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function luminance(hex) {
  const { r, g, b } = hexValue(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('uses a dedicated refined font for auxiliary small text', () => {
  assert.match(css, /--aux-font:\s*'Microsoft YaHei UI'/);
  assert.match(css, /\.section-title[\s\S]*font-family:\s*var\(--aux-font\)/);
  assert.match(css, /\.legend \.label small[\s\S]*font-family:\s*var\(--aux-font\)/);
});

test('darkens the faint ink color used by gray helper text', () => {
  const match = css.match(/--ink-faint:\s*(#[0-9A-Fa-f]{6})/);
  assert.ok(match, 'expected --ink-faint variable');
  assert.ok(luminance(match[1]) < luminance('#6A6A6A'), `expected ${match[1]} to be darker than #6A6A6A`);
});

test('lets Lab6 diagnostics fill the available side panel space', () => {
  assert.match(css, /\.lab6-side-panel \.lab5-diagnostics\s*\{[\s\S]*flex:\s*1/);
  assert.match(css, /\.lab6-side-panel \.lab5-diagnostics\s*\{[\s\S]*min-height:\s*0/);
});
