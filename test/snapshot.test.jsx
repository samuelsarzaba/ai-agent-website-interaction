// @vitest-environment jsdom
import './setup-dom.js';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, test } from 'vitest';
import { CAP, resolve, runTool, settle, snapshot } from '../src/runtime.js';
import Shop from '../src/Shop.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = false;
const sample = (name) => readFileSync(`test/samples/${name}.txt`, 'utf8').trimEnd();
const click = (ref) => runTool({ toolCallId: ref, op: 'click', args: { ref } }, { send() {}, askUser: async () => true });

beforeAll(async () => {
  history.replaceState(null, '', '/?seed=1#/');
  document.body.innerHTML = '<div id="root"></div><aside data-agent-ignore><button>Send</button></aside>';
  await act(() => createRoot(document.getElementById('root')).render(<Shop />));
  await settle();
});

// The three samples of spec §7, in the order they were captured: products → click e8 → click e3.
test('products page renders the format D sample exactly', () => {
  expect(snapshot()).toBe(sample('products'));
});

test('clicking a product-name link renders the product page sample', async () => {
  const r = await click('e8');
  expect(r.ok).toBe(true);
  expect(location.hash).toBe('#/product/p01');
  expect(r.snapshot).toBe(sample('product'));
});

test('the cart page renders the sample, with confirm labels', async () => {
  const r = await click('e3');
  expect(r.snapshot).toBe(sample('cart'));
});

test('a ref stays stable while role and name hold; a stale ref fails loudly', async () => {
  const before = snapshot();
  expect(before).toContain('[e1] link "Tiny Shop"');
  expect(resolve('e1').textContent).toBe('Tiny Shop');
  expect(() => resolve('e8')).toThrow('ref e8 not found; use a ref from the latest snapshot');
  expect(() => resolve('e9999')).toThrow('ref e9999 not found');
});

test('a changed name gets a new ref (Cart count)', async () => {
  // Remove Linen Tea Towels (approved) → "Cart (2)" is a new name, so a new ref.
  const r = await click('e61');
  expect(r.confirm).toBe('approved');
  expect(r.snapshot).toContain('[e63] link "Cart (2)"');
  expect(r.snapshot).not.toContain('Linen Tea Towels');
});

test('the snapshot is capped at 16,000 characters with a marker', () => {
  const big = document.createElement('p');
  big.textContent = 'x'.repeat(100);
  document.body.append(...Array.from({ length: 2000 }, () => big.cloneNode(true)));
  const s = snapshot();
  expect(s.length).toBe(CAP + '\n[snapshot truncated]'.length);
  expect(s.endsWith('\n[snapshot truncated]')).toBe(true);
  document.querySelectorAll('body > p').forEach((p) => p.remove());
});
