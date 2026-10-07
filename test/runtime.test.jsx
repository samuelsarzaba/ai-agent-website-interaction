// @vitest-environment jsdom
import './setup-dom.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, test } from 'vitest';
import { runTool, settle, snapshot } from '../src/runtime.js';
import Shop from '../src/Shop.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = false;
const ref = (pattern) => snapshot().match(new RegExp(`\\[(e\\d+)\\] ${pattern}`))[1];
const tool = async (op, args, answer = true) => {
  const sent = [];
  const r = await runTool({ toolCallId: 't', op, args }, { send: (m) => sent.push(m), askUser: async () => answer });
  return { r, sent: sent.map((m) => m.type) };
};

beforeAll(async () => {
  history.replaceState(null, '', '/?seed=1#/');
  document.body.innerHTML = '<div id="root"></div>';
  await act(() => createRoot(document.getElementById('root')).render(<Shop />));
  await settle();
});

test('type goes through React; settle waits for the debounced search (aria-busy) and its fetch', async () => {
  const { r } = await tool('type', { ref: ref('searchbox "Search"'), text: 'mug' });
  expect(r.ok).toBe(true);
  expect(r.timedOut).toBe(false);
  expect(r.settledMs).toBeGreaterThanOrEqual(250);
  expect(r.snapshot).toContain('searchbox "Search" = "mug"');
  expect(r.snapshot).toContain('status: 1 products');
  expect(r.snapshot).toContain('* Ceramic Mug |');
});

test('type with submit applies the search at once', async () => {
  const { r } = await tool('type', { ref: ref('searchbox "Search"'), text: '', submit: true });
  expect(r.ok).toBe(true);
  expect(r.snapshot).toContain('status: 24 products');
});

test('select sets the option by visible text and re-sorts', async () => {
  const { r } = await tool('select', { ref: ref('combobox "Sort by"'), option: 'Price: low to high' });
  expect(r.ok).toBe(true);
  expect(r.snapshot).toContain('combobox "Sort by" = "Price: low to high"');
  expect(r.snapshot.match(/\* (.+?) \|/)[1]).toBe('Sticky Notes');
});

test('select fails with the valid options on a miss', async () => {
  const { r, sent } = await tool('select', { ref: ref('combobox "Sort by"'), option: 'Cheapest' });
  expect(r).toMatchObject({ ok: false, error: 'option "Cheapest" not in [Featured, Price: low to high, Price: high to low, Name: A to Z]' });
  expect(r.snapshot).toContain('# Products');
  expect(sent).toEqual(['tool_result']);
});

test('wrong element types, stale refs and disabled elements fail loudly', async () => {
  expect((await tool('type', { ref: ref('link "Tiny Shop"'), text: 'x' })).r.error).toBe('element is not a text field');
  expect((await tool('select', { ref: ref('link "Tiny Shop"'), option: 'x' })).r.error).toBe('element is not a dropdown');
  expect((await tool('click', { ref: 'e9999' })).r.error).toBe('ref e9999 not found; use a ref from the latest snapshot');
  const b = document.createElement('button');
  b.textContent = 'Nope';
  b.disabled = true;
  document.querySelector('main').append(b);
  expect(snapshot()).toMatch(/\[e\d+\] button "Nope" \(disabled\)/);
  expect((await tool('click', { ref: ref('button "Nope"') })).r.error).toBe('element is disabled');
  b.remove();
});

test('settle reports timedOut at the cap while a region stays aria-busy, and ignores the chat', async () => {
  const busy = document.createElement('div');
  busy.setAttribute('aria-busy', 'true');
  document.body.append(busy);
  const r = await settle({ max: 300 });
  expect(r.timedOut).toBe(true);
  expect(r.settledMs).toBeGreaterThanOrEqual(300);
  busy.setAttribute('data-agent-ignore', ''); // busy, but inside the chat/debug panels: ignored
  const chatTicker = setInterval(() => { busy.textContent += '.'; }, 20);
  const r2 = await settle({ max: 2000 }); // a non-ignored ticker would hold it to the cap
  clearInterval(chatTicker);
  busy.remove();
  expect(r2.timedOut).toBe(false);
});

test('confirm hold: decline clicks nothing', async () => {
  await tool('click', { ref: ref('link "Cart \\(3\\)"') });
  const { r, sent } = await tool('click', { ref: ref('button "Remove Ceramic Mug"') }, false);
  expect(sent).toEqual(['confirm_waiting', 'tool_result']);
  expect(r).toMatchObject({ ok: false, declined: true, confirm: 'declined', error: 'The user declined "Remove Ceramic Mug from cart". Nothing was clicked.' });
  expect(r.snapshot).toContain('Ceramic Mug | $12.00 each');
});

test('confirm hold: a cancelled card sends no result and clicks nothing', async () => {
  const { r, sent } = await tool('click', { ref: ref('button "Checkout"') }, null);
  expect(r).toBeUndefined();
  expect(sent).toEqual(['confirm_waiting']);
  expect(snapshot()).toContain('button "Checkout" (confirm: "Place order for $38.00")');
});

test('confirm hold: approve sends confirm_approved, then clicks and settles', async () => {
  const { r, sent } = await tool('click', { ref: ref('button "Remove Ceramic Mug"') });
  expect(sent).toEqual(['confirm_waiting', 'confirm_approved', 'tool_result']);
  expect(r).toMatchObject({ ok: true, confirm: 'approved', timedOut: false });
  expect(r.snapshot).not.toContain('Ceramic Mug');
  expect(r.snapshot).toContain('button "Checkout" (confirm: "Place order for $14.00")');
});

test('confirm hold: the ref is re-resolved after approval', async () => {
  const checkout = ref('button "Checkout"');
  const r = await runTool({ toolCallId: 't', op: 'click', args: { ref: checkout } }, {
    send() {},
    askUser: async () => { document.querySelector('[data-agent-confirm^="Place order"]').remove(); return true; },
  });
  expect(r).toMatchObject({ ok: false, confirm: 'approved', error: `ref ${checkout} not found; use a ref from the latest snapshot` });
});
