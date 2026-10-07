// One process: Vite (middleware mode) + products API + the agent WebSocket, on 127.0.0.1 only.
import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import { WebSocketServer } from 'ws';
import { queryProducts } from './src/catalog.js';
import { createAgentConnection, createDeepInfraModel } from './server/agent.mjs';

const PORT = Number(process.env.PORT) || 5317;
const THINKING = process.env.AGENT_THINKING === 'low' ? 'low' : 'off';
if (!process.env.DEEPINFRA_API_KEY) console.warn('DEEPINFRA_API_KEY is not set: the shop works, the agent will fail.');

const http = createServer();
const vite = await createVite({ server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
const { modelRuntime, model } = await createDeepInfraModel();

http.on('request', (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/products') return vite.middlewares(req, res);
  setTimeout(() => { // artificial delay: exercises loading states and settle
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(queryProducts(Object.fromEntries(url.searchParams))));
  }, 150);
});

const sameOrigin = (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } };
const wss = new WebSocketServer({ noServer: true });
http.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/agent') return;
  if (!sameOrigin(req)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', async (ws) => {
  const log = (s) => console.log(`[agent] ${s}`);
  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const queue = [];
  let conn;
  const dispatch = (msg) => conn.handle(msg).catch((e) => log(`error: ${e.message}`));
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return log('ignored a non-JSON message'); }
    conn ? dispatch(msg) : queue.push(msg);
  });
  ws.on('close', () => conn?.close());
  conn = await createAgentConnection({ send, modelRuntime, model, thinkingLevel: THINKING, log });
  if (ws.readyState !== ws.OPEN) return conn.close();
  queue.splice(0).forEach(dispatch);
});

http.listen(PORT, '127.0.0.1', () => console.log(`Tiny Shop: http://127.0.0.1:${PORT}/`));
