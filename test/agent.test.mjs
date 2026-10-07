// Server side of the tools, run against Pi's faux provider: no network, no API key.
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { expect, test } from 'vitest';
import { createAgentConnection, createToolBridge, DECLINED_MSG, LIMIT_MSG, STOPPED, TIMEOUT_MSG } from '../server/agent.mjs';

const SNAP = 'main:\n  # Products';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred) => { for (let i = 0; i < 200 && !pred(); i++) await sleep(5); expect(pred()).toBe(true); };
const text = (result) => result.content[0].text;

// A bridge whose fake browser answers each tool_call with reply(msg) (or stays silent when reply returns undefined).
function bridgeWith(reply, opts) {
  const sent = [];
  const bridge = createToolBridge((m) => {
    sent.push(m);
    const r = m.type === 'tool_call' && reply(m);
    if (r) queueMicrotask(() => bridge.handle({ type: 'tool_result', toolCallId: m.toolCallId, snapshot: SNAP, ...r }));
  }, opts);
  const [click, type, select] = bridge.tools;
  return { bridge, sent, click, type, select };
}

test('ok results: one-line head, blank line, fresh snapshot', async () => {
  const { click, type, select } = bridgeWith(() => ({ ok: true, settledMs: 40, timedOut: false }));
  let r = await click.execute('c1', { ref: 'e9' });
  expect(r.isError).toBe(false);
  expect(text(r)).toBe(`Clicked e9.\n\n${SNAP}`);
  expect(text(await type.execute('c2', { ref: 'e4', text: 'mug' }))).toBe(`Typed "mug" into e4.\n\n${SNAP}`);
  expect(text(await type.execute('c3', { ref: 'e4', text: 'mug', submit: true }))).toBe(`Typed "mug" into e4 and submitted.\n\n${SNAP}`);
  r = await select.execute('c4', { ref: 'e7', option: 'Price: low to high' });
  expect(text(r)).toBe(`Selected "Price: low to high" in e7.\n\n${SNAP}`);
});

test('a settle cap is not a failure: ok head plus the note', async () => {
  const { click } = bridgeWith(() => ({ ok: true, settledMs: 3001, timedOut: true }));
  const r = await click.execute('c1', { ref: 'e9' });
  expect(r.isError).toBe(false);
  expect(text(r)).toBe(`Clicked e9. (page still changing after 3 s; snapshot may be mid-update)\n\n${SNAP}`);
});

test('browser-side failures and declines are isError results with the snapshot', async () => {
  const { click } = bridgeWith((m) => (m.args.ref === 'e1'
    ? { ok: false, error: 'ref e1 not found; use a ref from the latest snapshot' }
    : { ok: false, declined: true, confirm: 'declined', error: 'The user declined "Place order for $14.00". Nothing was clicked.' }));
  let r = await click.execute('c1', { ref: 'e1' });
  expect(r.isError).toBe(true);
  expect(text(r)).toBe(`Error: ref e1 not found; use a ref from the latest snapshot\n\n${SNAP}`);
  r = await click.execute('c2', { ref: 'e62' });
  expect(text(r)).toBe(`Error: The user declined "Place order for $14.00". Nothing was clicked.\n\n${SNAP}`);
});

test('decline guard: later calls in the same request are not executed; the next request resets it', async () => {
  const { bridge, sent, click } = bridgeWith((m) => (m.args.ref === 'e62' ? { ok: false, declined: true, error: 'declined' } : { ok: true }));
  await click.execute('c1', { ref: 'e62' });
  await expect(click.execute('c2', { ref: 'e3' })).rejects.toThrow(DECLINED_MSG);
  expect(sent.filter((m) => m.type === 'tool_call')).toHaveLength(1);
  bridge.newRequest();
  expect((await click.execute('c3', { ref: 'e3' })).isError).toBe(false);
});

test('15-call limit per request', async () => {
  const { bridge, sent, click } = bridgeWith(() => ({ ok: true }));
  for (let i = 1; i <= 15; i++) await click.execute(`c${i}`, { ref: 'e1' });
  await expect(click.execute('c16', { ref: 'e1' })).rejects.toThrow(LIMIT_MSG);
  expect(sent.filter((m) => m.type === 'tool_call')).toHaveLength(15);
  bridge.newRequest();
  await click.execute('c17', { ref: 'e1' });
});

test('timeout: cancel is sent, the timeout error thrown, a late result logged and ignored', async () => {
  const logs = [];
  const { bridge, sent, click } = bridgeWith(() => undefined, { actionTimeoutMs: 50, log: (s) => logs.push(s) });
  await expect(click.execute('c1', { ref: 'e9' })).rejects.toThrow(TIMEOUT_MSG);
  expect(sent.map((m) => m.type)).toEqual(['tool_call', 'cancel']);
  bridge.handle({ type: 'tool_result', toolCallId: 'c1', ok: true, snapshot: SNAP });
  expect(logs).toEqual(['late tool_result for c1 ignored (ok=true)']);
});

test('the timer pauses while a confirm waits, and restarts fresh on approval', async () => {
  const { bridge, sent, click } = bridgeWith(() => undefined, { actionTimeoutMs: 60 });
  const p = click.execute('c1', { ref: 'e62' });
  bridge.handle({ type: 'confirm_waiting', toolCallId: 'c1' });
  await sleep(150); // a human taking longer than the action timeout
  bridge.handle({ type: 'confirm_approved', toolCallId: 'c1' });
  await sleep(40);  // within the fresh timer
  bridge.handle({ type: 'tool_result', toolCallId: 'c1', ok: true, confirm: 'approved', snapshot: SNAP });
  expect((await p).isError).toBe(false);
  expect(sent.map((m) => m.type)).toEqual(['tool_call']);

  const q = click.execute('c2', { ref: 'e62' });
  bridge.handle({ type: 'confirm_waiting', toolCallId: 'c2' });
  bridge.handle({ type: 'confirm_approved', toolCallId: 'c2' });
  await expect(q).rejects.toThrow(TIMEOUT_MSG); // approved but the click never finishes
});

test('abort: the pending call rejects with "Stopped by user" and the browser gets cancel', async () => {
  const { sent, click } = bridgeWith(() => undefined);
  const ac = new AbortController();
  const p = click.execute('c1', { ref: 'e62' }, ac.signal);
  ac.abort();
  await expect(p).rejects.toThrow(STOPPED);
  expect(sent.map((m) => m.type)).toEqual(['tool_call', 'cancel']);
  await expect(click.execute('c2', { ref: 'e1' }, ac.signal)).rejects.toThrow(STOPPED);
});

// Full Pi session with the faux model.
async function connect(opts) {
  const modelRuntime = await ModelRuntime.create({ modelsPath: null, credentials: new InMemoryCredentialStore(), refreshOnCreate: false });
  const faux = fauxProvider(opts);
  modelRuntime.registerNativeProvider(faux.provider);
  const sent = [];
  const conn = await createAgentConnection({ send: (m) => sent.push(m), modelRuntime, model: faux.getModel() });
  return { faux, sent, conn, calls: () => sent.filter((m) => m.type === 'tool_call') };
}
const toolMsg = (...calls) => fauxAssistantMessage(calls.map(([name, args]) => fauxToolCall(name, args)), { stopReason: 'toolUse' });
const results = (conn) => conn.session.messages.filter((m) => m.role === 'toolResult').map((m) => m.content[0].text);

test('session: streams text, runs a tool in the browser, appends the snapshot to the prompt, sends done', async () => {
  const { faux, sent, conn, calls } = await connect();
  let context;
  faux.setResponses([toolMsg(['select', { ref: 'e7', option: 'Price: low to high' }]),
    (ctx) => { context = ctx; return fauxAssistantMessage('Sorted by price, low to high.'); }]);
  const run = conn.handle({ type: 'user', text: 'Sort by price.', snapshot: SNAP });
  await until(() => calls().length === 1);
  expect(calls()[0]).toMatchObject({ op: 'select', args: { ref: 'e7', option: 'Price: low to high' } });
  await conn.handle({ type: 'tool_result', toolCallId: calls()[0].toolCallId, ok: true, settledMs: 30, snapshot: SNAP });
  await run;
  expect(conn.session.messages.find((m) => m.role === 'user').content[0].text).toBe(`Sort by price.\n\n${SNAP}`);
  expect(JSON.stringify(context)).toContain('Selected \\"Price: low to high\\" in e7.');
  expect(sent.filter((m) => m.type === 'delta').map((m) => m.text).join('')).toBe('Sorted by price, low to high.');
  expect(sent.filter((m) => m.type === 'usage')).toHaveLength(2);
  expect(sent.at(-1)).toEqual({ type: 'done' });
});

test('session: the 16th call in a batch is not executed', async () => {
  const { faux, conn, calls } = await connect();
  faux.setResponses([toolMsg(...Array.from({ length: 16 }, (_, i) => ['click', { ref: `e${i + 1}` }])), fauxAssistantMessage('Stopped at the limit.')]);
  const run = conn.handle({ type: 'user', text: 'go', snapshot: SNAP });
  for (let i = 1; i <= 15; i++) {
    await until(() => calls().length === i);
    await conn.handle({ type: 'tool_result', toolCallId: calls()[i - 1].toolCallId, ok: true, snapshot: SNAP });
  }
  await run;
  expect(calls()).toHaveLength(15);
  expect(results(conn).at(-1)).toBe(LIMIT_MSG);
});

test('session: after a decline, the rest of the batch is not executed', async () => {
  const { faux, conn, calls } = await connect();
  faux.setResponses([toolMsg(['click', { ref: 'e59' }], ['click', { ref: 'e62' }]), fauxAssistantMessage('You declined; nothing changed.')]);
  const run = conn.handle({ type: 'user', text: 'Remove the mug and check out.', snapshot: SNAP });
  await until(() => calls().length === 1);
  const id = calls()[0].toolCallId;
  await conn.handle({ type: 'confirm_waiting', toolCallId: id });
  await conn.handle({ type: 'tool_result', toolCallId: id, ok: false, declined: true, confirm: 'declined', error: 'The user declined "Remove Ceramic Mug from cart". Nothing was clicked.', snapshot: SNAP });
  await run;
  expect(calls()).toHaveLength(1);
  expect(results(conn)).toEqual([`Error: The user declined "Remove Ceramic Mug from cart". Nothing was clicked.\n\n${SNAP}`, DECLINED_MSG]);
});

test('session: Stop during a pending confirm cancels it, ends the run, and the next request sees it', async () => {
  const { faux, sent, conn, calls } = await connect();
  let context;
  faux.setResponses([toolMsg(['click', { ref: 'e62' }], ['click', { ref: 'e3' }]),
    (ctx) => { context = ctx; return fauxAssistantMessage('Hello again.'); }]);
  const run = conn.handle({ type: 'user', text: 'Check out.', snapshot: SNAP });
  await until(() => calls().length === 1);
  const id = calls()[0].toolCallId;
  await conn.handle({ type: 'confirm_waiting', toolCallId: id });
  await conn.handle({ type: 'stop' });
  await run;
  expect(sent).toContainEqual({ type: 'cancel', toolCallId: id });
  expect(sent.at(-1)).toEqual({ type: 'done' });
  expect(calls()).toHaveLength(1); // the queued call never ran
  expect(faux.state.callCount).toBe(1); // the model was not called again
  expect(results(conn)[0]).toBe(STOPPED);

  await conn.handle({ type: 'user', text: 'hi', snapshot: SNAP });
  expect(JSON.stringify(context)).toContain(STOPPED);
  expect(sent.at(-1)).toEqual({ type: 'done' });
});

test('session: Stop while the model is streaming', async () => {
  const { faux, sent, conn } = await connect({ tokensPerSecond: 20 });
  faux.setResponses([fauxAssistantMessage('This is a long and slow answer that will be cut off by the user pressing Stop.')]);
  const run = conn.handle({ type: 'user', text: 'hi', snapshot: SNAP });
  await until(() => sent.some((m) => m.type === 'delta'));
  await conn.handle({ type: 'stop' });
  await run;
  expect(sent.at(-1).type).toBe('done');
  expect(sent.filter((m) => m.type === 'delta').map((m) => m.text).join('').length).toBeLessThan(40);
});

test('close: pending tool waiters reject and the session is aborted', async () => {
  const { faux, sent, conn, calls } = await connect();
  faux.setResponses([toolMsg(['click', { ref: 'e1' }])]);
  const run = conn.handle({ type: 'user', text: 'go', snapshot: SNAP });
  await until(() => calls().length === 1);
  await conn.close();
  await run;
  expect(results(conn)[0]).toBe('Connection closed');
  expect(sent.some((m) => m.type === 'done')).toBe(true);
});
