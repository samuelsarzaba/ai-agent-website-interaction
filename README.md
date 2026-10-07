# Tiny Shop agent (proof of concept)

A small local shop website with a chat agent that operates the page for you, through the same UI you see.
The agent runs on the Pi SDK with DeepSeek-V4.1-Flash on DeepInfra. It reads the page as an accessibility
snapshot and acts through three browser-executed tools: `click`, `type` and `select`. Checkout and removing
cart items need your approval in chat. **Stop** cancels the current run.

Local demo only: the server binds `127.0.0.1` and has no auth, rate limits or spend caps.

## Run it

Needs Node 22.9 or newer.

1. Install: `npm install`
2. Put your DeepInfra key in a `.env` file in the project root (it is gitignored, and the key stays in the server process):

   ```
   DEEPINFRA_API_KEY=your-key-here
   ```

3. Start: `npm start`, then open http://127.0.0.1:5317/

Without a key the shop still works and the server logs a warning; only the agent fails.

Optional settings (in `.env` or the environment):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5317` | Port on 127.0.0.1 |
| `AGENT_THINKING` | `off` | Model thinking level: `off` or `low` |

Add `?seed=1` to the URL to start with 2 × Ceramic Mug and 1 × Linen Tea Towels in the cart.

## Tests

`npm test` runs offline: no network and no API key. It covers the snapshot builder and format D (including
the spec's full samples), refs, settle, the confirm hold, tool results/errors/timeouts, Stop and the
15-call limit. Server tests drive a real Pi session with Pi's faux model.

## Layout

| Path | What |
|---|---|
| `server.mjs` | One process: Vite (middleware mode), `GET /api/products`, WebSocket `/agent` |
| `server/agent.mjs` | DeepInfra provider, per-tab Pi session, the three tools, system prompt |
| `src/runtime.js` | In-page runtime: snapshot (format D), refs, actions, settle, tool runner |
| `src/Shop.jsx` | The shop: products, product and cart pages |
| `src/AgentPanel.jsx` | Chat and debug panels |
| `src/catalog.js` | The fixed 24-product catalogue |

Standing UI rules for new shop features: use accessible controls with names, set `aria-busy="true"` on a
region while it loads, key lists by entity id, and put `data-agent-confirm="<label>"` on risky elements.
