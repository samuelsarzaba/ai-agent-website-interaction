// Chat and debug panels. Both carry data-agent-ignore, so they never appear in snapshots.
import { useEffect, useRef, useState } from 'react';
import { Bot, Eye, Send, ShieldAlert, Square, SquareTerminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from 'cn';
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
      for (const id of [...confirms.current.keys()]) decide(id, null);
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

  const msgClass = {
    user: 'self-end max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground',
    agent: 'self-start max-w-[85%] rounded-xl rounded-bl-sm border bg-background px-3 py-2',
    tool: 'font-mono text-xs text-muted-foreground',
    error: 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800',
    muted: 'text-sm italic text-muted-foreground',
    confirm: 'flex flex-col gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5',
  };

  return (
    <>
      <aside aria-label="Shop assistant" className="flex min-h-[640px] flex-col border-l bg-muted/40" data-agent-ignore="">
        <div className="flex items-center gap-2.5 border-b bg-background px-4 py-3.5">
          <span className="flex size-8 items-center justify-center rounded-full border bg-muted"><Bot className="size-4" aria-hidden="true" /></span>
          <div>
            <h2 className="text-sm font-semibold">Shop assistant</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', closed ? 'bg-red-600' : busy ? 'bg-amber-500' : 'bg-green-600')} />
              {closed ? 'Disconnected' : busy ? 'Working…' : 'Connected'}
            </p>
          </div>
        </div>
        <ol className="flex flex-1 flex-col gap-2.5 overflow-auto p-4">
          {items.map((x) => (
            <li key={x.id} className={cn('whitespace-pre-wrap', msgClass[x.kind], x.error && 'text-red-700')}>
              {x.kind === 'confirm' ? (
                <>
                  <div className="flex gap-2.5">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <div>
                      <div className="text-xs font-semibold text-amber-900">Approval needed</div>
                      The assistant wants to: <strong>{x.label}</strong>
                    </div>
                  </div>
                  {x.state === 'pending' ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => decide(x.toolCallId, false)}>Decline</Button>
                      <Button size="sm" onClick={() => decide(x.toolCallId, true)}>Approve</Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="self-end">{x.state}</Badge>
                  )}
                </>
              ) : (
                x.text.trim()
              )}
            </li>
          ))}
          <li ref={listEnd} aria-hidden="true" />
        </ol>
        <form className="flex flex-col gap-2 border-t bg-background p-4 pt-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Textarea aria-label="Message" rows={3} className="resize-none" value={draft} disabled={closed} placeholder="Ask the assistant…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for newline</span>
            {busy
              ? <Button type="button" size="sm" variant="outline" onClick={stop}><Square className="fill-current" aria-hidden="true" />Stop</Button>
              : <Button size="sm" disabled={closed}>Send<Send aria-hidden="true" /></Button>}
          </div>
        </form>
      </aside>
      <section aria-label="Debug" className="flex flex-col border-l text-sm" data-agent-ignore="">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold"><SquareTerminal className="size-4" aria-hidden="true" />Debug</h2>
          <Button size="sm" variant="outline" onClick={() => show(snapshot(), 'preview of the current page (not sent)')}>
            <Eye aria-hidden="true" />Preview current page
          </Button>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-xs text-muted-foreground">{LEGEND}</p>
          <h3 className="font-semibold">Session usage</h3>
          <dl className="grid grid-cols-4 gap-2">
            {[['Requests', usage.requests], ['Input', usage.input], ['Cached', usage.cached], ['Output', usage.output]].map(([k, v]) => (
              <div key={k} className="rounded-lg border p-2.5">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-base font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Tokens in/cached/out · cost ${usage.cost.toFixed(5)}</p>
          <h3 className="font-semibold">Snapshot the agent last received</h3>
          {shown ? (
            <>
              <p className="text-xs text-muted-foreground">
                Source: {shown.source} · {shown.text.length} chars · ≈{Math.round(shown.text.length / 3.44)} tokens ·{' '}
                {shown.text.split('\n').length} lines
              </p>
              <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-200">{shown.text}</pre>
            </>
          ) : (
            <p className="text-muted-foreground">None yet.</p>
          )}
          <h3 className="font-semibold">Tool calls</h3>
          <ol className="divide-y rounded-lg border empty:hidden">
            {calls.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-2 px-3 py-2 font-mono text-xs">
                <span>
                  {c.op} {JSON.stringify(c.args)}
                  {c.r.settledMs !== undefined && ` · settle ${c.r.settledMs} ms${c.r.timedOut ? ' (TIMED OUT)' : ''}`}
                  {c.r.confirm && ` · confirm ${c.r.confirm}`}
                </span>
                <Badge variant={c.r.ok ? 'secondary' : 'destructive'} className="shrink-0">{c.r.ok ? 'ok' : `error: ${c.r.error}`}</Badge>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
