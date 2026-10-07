// Chat and debug panels. Both carry data-agent-ignore, so they never appear in snapshots.
import { useEffect, useRef, useState } from 'react';
import { LEGEND, runTool, snapshot } from './runtime.js';

let nextId = 0;
const toolLine = (op, args, r) =>
  `${op} ${JSON.stringify(args)} → ${r.ok ? 'ok' : r.declined ? 'declined' : `error: ${r.error}`}` +
  (r.settledMs !== undefined ? ` (${r.settledMs} ms${r.timedOut ? ', TIMED OUT' : ''})` : '');

export default function AgentPanel() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(null); // { text, source }
  const [usage, setUsage] = useState({ requests: 0, input: 0, cached: 0, output: 0, cost: 0 });
  const [calls, setCalls] = useState([]);
  const ws = useRef();
  const stopped = useRef(false);
  const confirms = useRef(new Map()); // toolCallId -> resolve(true | false | null)
  const listEnd = useRef();

  const push = (item) => setItems((xs) => [...xs, { id: ++nextId, ...item }]);
  const patch = (pred, change) => setItems((xs) => xs.map((x) => (pred(x) ? { ...x, ...change } : x)));
  const send = (msg) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(msg));
  const show = (text, source) => setShown({ text, source });

  const askUser = (toolCallId, label) =>
    new Promise((resolve) => {
      confirms.current.set(toolCallId, resolve);
      push({ kind: 'confirm', toolCallId, label, state: 'pending' });
    });
  const decide = (toolCallId, answer) => {
    const resolve = confirms.current.get(toolCallId);
    if (!resolve) return; // already decided or cancelled
    confirms.current.delete(toolCallId);
    patch((x) => x.toolCallId === toolCallId && x.kind === 'confirm',
      { state: answer === null ? 'cancelled' : answer ? 'approved' : 'declined' });
    resolve(answer);
  };

  useEffect(() => {
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/agent`);
    ws.current = sock;
    let open = false; // is the last agent bubble still streaming?
    sock.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'delta') {
        if (open) setItems((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, text: x.text + msg.text } : x)));
        else { open = true; push({ kind: 'agent', text: msg.text }); }
      } else if (msg.type === 'message_end') {
        open = false;
        if (msg.error && !stopped.current) push({ kind: 'error', text: msg.error });
      } else if (msg.type === 'usage') {
        setUsage((u) => ({ ...u, input: u.input + msg.usage.input, cached: u.cached + msg.usage.cached,
          output: u.output + msg.usage.output, cost: u.cost + msg.usage.cost }));
      } else if (msg.type === 'tool_call') {
        open = false;
        const r = await runTool(msg, { send, askUser });
        if (!r) return;
        push({ kind: 'tool', text: toolLine(msg.op, msg.args, r), error: !r.ok });
        show(r.snapshot, `result of ${msg.op}(${JSON.stringify(msg.args)})`);
        setCalls((cs) => [...cs, { op: msg.op, args: msg.args, r }]);
      } else if (msg.type === 'cancel') {
        decide(msg.toolCallId, null);
      } else if (msg.type === 'done') {
        open = false;
        if (stopped.current) push({ kind: 'muted', text: 'Stopped.' });
        else if (msg.error) push({ kind: 'error', text: msg.error });
        stopped.current = false;
        setBusy(false);
      }
    };
    sock.onclose = () => {
      setClosed(true);
      setBusy(false);
      push({ kind: 'error', text: 'Disconnected. Reload the page to start a new chat.' });
    };
    return () => sock.close();
  }, []);

  useEffect(() => { listEnd.current?.scrollIntoView({ block: 'end' }); }, [items]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || closed) return;
    const snap = snapshot();
    show(snap, 'attached to your message');
    send({ type: 'user', text, snapshot: snap });
    push({ kind: 'user', text });
    setUsage((u) => ({ ...u, requests: u.requests + 1 }));
    setDraft('');
    setBusy(true);
  };
  const stop = () => { stopped.current = true; send({ type: 'stop' }); };

  return (
    <>
      <aside aria-label="Shop assistant" className="chat" data-agent-ignore="">
        <h2>Shop assistant</h2>
        <ol className="messages">
          {items.map((x) => (
            <li key={x.id} className={`msg ${x.kind}${x.error ? ' failed' : ''}`}>
              {x.kind === 'confirm' ? (
                <>
                  <div>The assistant wants to: <strong>{x.label}</strong></div>
                  {x.state === 'pending' ? (
                    <div className="actions">
                      <button onClick={() => decide(x.toolCallId, true)}>Approve</button>
                      <button onClick={() => decide(x.toolCallId, false)}>Decline</button>
                    </div>
                  ) : (
                    <div className="state">{x.state}</div>
                  )}
                </>
              ) : (
                x.text.trim()
              )}
            </li>
          ))}
          <li ref={listEnd} aria-hidden="true" />
        </ol>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <textarea aria-label="Message" rows={3} value={draft} disabled={closed} placeholder="Ask the assistant…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          {busy ? <button type="button" onClick={stop}>Stop</button> : <button disabled={closed}>Send</button>}
        </form>
      </aside>
      <section aria-label="Debug" className="debug" data-agent-ignore="">
        <h2>Debug</h2>
        <p className="legend">{LEGEND}</p>
        <button onClick={() => show(snapshot(), 'preview of the current page (not sent)')}>Preview current page</button>
        <h3>Session usage</h3>
        <p>
          {usage.requests} requests · {usage.input} input / {usage.cached} cached / {usage.output} output tokens · $
          {usage.cost.toFixed(5)}
        </p>
        <h3>Snapshot the agent last received</h3>
        {shown ? (
          <>
            <p>
              Source: {shown.source} · {shown.text.length} chars · ≈{Math.round(shown.text.length / 3.44)} tokens ·{' '}
              {shown.text.split('\n').length} lines
            </p>
            <pre>{shown.text}</pre>
          </>
        ) : (
          <p>None yet.</p>
        )}
        <h3>Tool calls</h3>
        <ol className="calls">
          {calls.map((c, i) => (
            <li key={i}>
              <code>{c.op} {JSON.stringify(c.args)}</code> → {c.r.ok ? 'ok' : `error: ${c.r.error}`}
              {c.r.settledMs !== undefined && ` · settle ${c.r.settledMs} ms${c.r.timedOut ? ' (TIMED OUT)' : ''}`}
              {c.r.confirm && ` · confirm ${c.r.confirm}`}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
