// In-page agent runtime: snapshot (format D), refs, actions, settle and the browser tool runner.
// Reference implementation: the spec's Appendix A (the prototype's snapshot.js with renderD inlined).
import { getRole, computeAccessibleName, isInaccessible } from 'dom-accessibility-api';

const INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio',
  'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio']);
const STRUCTURE = new Set(['heading', 'img', 'list', 'listitem', 'navigation', 'main', 'banner', 'contentinfo', 'region',
  'form', 'search', 'article', 'dialog', 'alert', 'status', 'table', 'row', 'cell', 'columnheader']);
const LANDMARK = new Set(['banner', 'navigation', 'main', 'contentinfo', 'search', 'region', 'form', 'complementary']);
const HAS_ROLE = 'a,button,input,select,textarea,img,h1,h2,h3,h4,h5,h6,ul,ol,li,article,section,nav,header,footer,main,form,table,label,[role]';
export const CAP = 16000;

export const LEGEND = 'Snapshot format: an outline of page regions. Interactive elements are written `[eN] role "name"`. Each list item (e.g. a product or cart line) is collapsed onto one `*` line with its parts separated by |. (confirm: "...") marks elements that need the user\'s approval and shows what the user will be asked to approve.';

let lastRef = 0;
const refs = new Map();     // ref -> WeakRef<Element>
const meta = new WeakMap(); // Element -> {role, name, ref}

function refFor(el, role, name) {
  let m = meta.get(el);
  if (!m || m.role !== role || m.name !== name) { m = { role, name, ref: 'e' + ++lastRef }; meta.set(el, m); }
  refs.set(m.ref, new WeakRef(el));
  return m.ref;
}
const visible = (el) => el.checkVisibility({ visibilityProperty: true });
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const q = (s) => JSON.stringify(s);

function buildTree(root) {
  refs.clear();
  const walk = (el, into) => {
    if (el.hasAttribute('data-agent-ignore') || isInaccessible(el) || !visible(el)) return;
    const labelText = el.tagName === 'LABEL' && el.control; // its text is already the control's name
    if (labelText && !el.contains(el.control)) return;
    const role = getRole(el);
    if (role && (INTERACTIVE.has(role) || STRUCTURE.has(role))) {
      const name = clip(computeAccessibleName(el).trim(), 100);
      const n = { role, name };
      if (role === 'heading') n.level = Number(el.tagName.match(/\d/)?.[0] ?? el.getAttribute('aria-level'));
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') n.disabled = true;
      if (el.dataset.agentConfirm) n.confirm = el.dataset.agentConfirm;
      if (['textbox', 'searchbox', 'spinbutton'].includes(role)) n.value = el.value ?? '';
      if (el.tagName === 'SELECT') { n.value = el.selectedOptions[0]?.text ?? ''; n.options = [...el.options].map((o) => o.text); }
      if (INTERACTIVE.has(role)) n.ref = refFor(el, role, name);
      into.push(n);
      if (INTERACTIVE.has(role) || role === 'img') return;
      if (!el.children.length) { const t = el.textContent.trim(); if (t && t !== name) n.text = clip(t, 120); else if (!name) into.pop(); return; }
      n.children = [];
      into = n.children;
    } else if (!el.children.length || !el.querySelector(HAS_ROLE)) { // pure text run, e.g. <p>Total: <b>$5</b></p>
      const t = el.textContent.trim().replace(/\s+/g, ' ');
      if (t) into.push({ role: 'text', name: clip(t, 120) });
      return;
    }
    for (const c of el.childNodes) {
      if (c.nodeType === 1) walk(c, into);
      else if (c.nodeType === 3 && !labelText && c.textContent.trim()) into.push({ role: 'text', name: clip(c.textContent.trim(), 120) });
    }
  };
  const nodes = [];
  for (const c of root.children) walk(c, nodes);
  return nodes;
}

function renderD(nodes) {
  const out = [];
  const inline = (n) => {
    if (n.role === 'text') return n.name;
    if (n.role === 'img') return '';
    if (n.ref) {
      let s = `[${n.ref}] ${n.role} ${q(n.name)}`;
      if (n.value !== undefined) s += `=${q(n.value)}`;
      if (n.confirm) s += ` (confirm: ${q(n.confirm)})`;
      return s;
    }
    const parts = [n.role === 'heading' ? n.name : n.text, ...(n.children || []).map(inline)];
    return parts.filter(Boolean).join(' | ');
  };
  const walk = (n, d) => {
    const pad = '  '.repeat(d);
    if (n.role === 'listitem') return out.push(`${pad}* ${inline(n)}`);
    if (n.role === 'text') return out.push(`${pad}${n.name}`);
    if (n.role === 'heading') return out.push(`${pad}${'#'.repeat(n.level || 2)} ${n.name}`);
    if (n.role === 'img') return;
    if (n.ref) {
      let line = `${pad}[${n.ref}] ${n.role} ${q(n.name)}`;
      if (n.value !== undefined) line += ` = ${q(n.value)}`;
      if (n.options) line += ` options: ${n.options.join(' | ')}`;
      if (n.disabled) line += ' (disabled)';
      if (n.confirm) line += ` (confirm: ${q(n.confirm)})`;
      return out.push(line);
    }
    if (LANDMARK.has(n.role) || n.role === 'list' || n.role === 'status' || n.role === 'alert') {
      out.push(`${pad}${n.role}${n.name ? ` ${q(n.name)}` : ''}${n.text ? `: ${n.text}` : ':'}`);
      return n.children?.forEach((c) => walk(c, d + 1));
    }
    if (n.text) out.push(`${pad}${n.text}`);
    n.children?.forEach((c) => walk(c, d));
  };
  nodes.forEach((n) => walk(n, 0));
  return out.join('\n');
}

export function snapshot() {
  let out = renderD(buildTree(document.body));
  if (out.length > CAP) out = out.slice(0, CAP) + '\n[snapshot truncated]';
  return out;
}

export function resolve(ref) {
  const el = refs.get(ref)?.deref();
  if (!el || !el.isConnected) throw new Error(`ref ${ref} not found; use a ref from the latest snapshot`);
  return el;
}

// React tracks the last value it saw on the node; el.value = x updates that tracker and React sees no change.
function setNativeValue(el, value) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
}

export function doClick(el) {
  if (el.disabled) throw new Error('element is disabled');
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
  el.click();
}

export function doType(el, text, submit) {
  if (!('value' in el)) throw new Error('element is not a text field');
  el.focus();
  setNativeValue(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (submit) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    el.form?.requestSubmit();
  }
}

export function doSelect(el, option) {
  if (el.tagName !== 'SELECT') throw new Error('element is not a dropdown');
  const opt = [...el.options].find((x) => x.text.trim() === option || x.value === option);
  if (!opt) throw new Error(`option "${option}" not in [${[...el.options].map((x) => x.text).join(', ')}]`);
  setNativeValue(el, opt.value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

let pendingFetches = 0;
const origFetch = window.fetch;
window.fetch = (...a) => { pendingFetches++; return origFetch(...a).finally(() => pendingFetches--); };
const ignored = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('[data-agent-ignore]');

export function settle({ quiet = 200, max = 3000 } = {}) {
  const isBusy = () => [...document.querySelectorAll('[aria-busy="true"]')].some((e) => !ignored(e));
  return new Promise((res) => {
    const t0 = performance.now();
    let last = t0;
    const mo = new MutationObserver((recs) => { if (recs.some((r) => !ignored(r.target))) last = performance.now(); });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      if ((now - last >= quiet && pendingFetches === 0 && !isBusy()) || now - t0 >= max) {
        mo.disconnect();
        res({ settledMs: Math.round(now - t0), timedOut: now - t0 >= max });
      } else setTimeout(tick, 25); // not rAF: rAF pauses in background tabs
    };
    setTimeout(tick, 25);
  });
}

// Live action visibility: a fixed 3 px outline over the target for 900 ms.
export function highlight(el) {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.setAttribute('data-agent-ignore', '');
  box.className = 'agent-highlight';
  Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(box);
  setTimeout(() => box.remove(), 900);
}

// Executes one `tool_call` from the server and sends its `tool_result`. Returns the result (undefined if cancelled).
// askUser(toolCallId, label) resolves true (approve), false (decline) or null (cancelled by the server).
export async function runTool({ toolCallId, op, args }, { send, askUser }) {
  const reply = (r) => { const msg = { type: 'tool_result', toolCallId, ...r, snapshot: snapshot() }; send(msg); return msg; };
  let el, confirm;
  try {
    el = resolve(args.ref);
    const holder = op === 'click' && el.closest('[data-agent-confirm]');
    if (holder) {
      const label = holder.dataset.agentConfirm;
      highlight(el);
      send({ type: 'confirm_waiting', toolCallId });
      const ok = await askUser(toolCallId, label);
      if (ok === null) return;                     // server already moved on
      confirm = ok ? 'approved' : 'declined';
      if (!ok) return reply({ ok: false, declined: true, confirm, error: `The user declined "${label}". Nothing was clicked.` });
      send({ type: 'confirm_approved', toolCallId });
      el = resolve(args.ref);                      // may be gone after the wait
    }
    highlight(el);
    if (op === 'click') doClick(el);
    else if (op === 'type') doType(el, args.text, args.submit);
    else if (op === 'select') doSelect(el, args.option);
    else throw new Error(`unknown tool ${op}`);
  } catch (e) {
    return reply({ ok: false, error: e.message, confirm });
  }
  return reply({ ok: true, confirm, ...(await settle()) });
}
