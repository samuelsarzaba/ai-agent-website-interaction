// Tiny Shop: a hash-routed shop. Standing UI rules: accessible controls, aria-busy while loading,
// list keys are entity ids, risky elements carry data-agent-confirm, product cards show "In cart: N".
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, SORTS, byId } from './catalog.js';

const money = (n) => `$${n.toFixed(2)}`;
const COLORS = { Kitchen: '#e8c9a0', Home: '#c9d6e8', Garden: '#c4e0b8', Office: '#ddd0ea' };
const image = (p) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="${COLORS[p.category]}"/>` +
      `<text x="80" y="76" font-family="sans-serif" font-size="48" text-anchor="middle" fill="#333">${p.name[0]}</text></svg>`,
  );

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function Shop() {
  const hash = useHash();
  const [cart, setCart] = useState(() => (new URLSearchParams(location.search).get('seed') === '1' ? { p01: 2, p06: 1 } : {}));
  const [toast, setToast] = useState('');
  const [order, setOrder] = useState(null);
  const toastTimer = useRef();

  const add = (id) => {
    const n = (cart[id] || 0) + 1;
    setCart({ ...cart, [id]: n });
    setOrder(null);
    setToast(`Added ${byId[id].name} to cart (${n} in cart)`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };
  const setQty = (id, n) => setCart({ ...cart, [id]: Math.min(10, Math.max(1, n)) });
  const remove = (id) => { const { [id]: _, ...rest } = cart; setCart(rest); };
  const total = Object.entries(cart).reduce((s, [id, n]) => s + byId[id].price * n, 0);
  const checkout = () => { setOrder(1000 + Math.floor(Math.random() * 9000)); setCart({}); };

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const route = hash.replace(/^#/, '') || '/';
  const productId = route.match(/^\/product\/(.+)$/)?.[1];
  const page = route === '/cart' ? 'cart' : productId ? 'product' : 'products';

  return (
    <>
      <header className="header">
        <a className="brand" href="#/">Tiny Shop</a>
        <nav aria-label="Main">
          <a href="#/" aria-current={page === 'products' ? 'page' : undefined}>Products</a>
          <a href="#/cart" aria-current={page === 'cart' ? 'page' : undefined}>Cart ({count})</a>
        </nav>
        <p role="status" className="toast">{toast}</p>
      </header>
      <main>
        {page === 'products' && <ProductsPage cart={cart} add={add} />}
        {page === 'product' && <ProductPage product={byId[productId]} cart={cart} add={add} />}
        {page === 'cart' && (
          <CartPage cart={cart} total={total} order={order} setQty={setQty} remove={remove} checkout={checkout} />
        )}
      </main>
      <footer>
        <p>© Tiny Shop (prototype)</p>
      </footer>
    </>
  );
}

function ProductsPage({ cart, add }) {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('Featured');
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const debounce = useRef();

  useEffect(() => {
    let live = true;
    setBusy(true);
    fetch(`/api/products?${new URLSearchParams({ q: applied, category, sort })}`)
      .then((r) => r.json())
      .then((items) => { if (live) { setList(items); setBusy(false); } });
    return () => { live = false; };
  }, [applied, category, sort]);

  const onSearch = (value) => {
    setQ(value);
    setBusy(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setApplied(value), 250);
  };
  const submit = (e) => {
    e.preventDefault();
    clearTimeout(debounce.current);
    if (q === applied) setBusy(false);
    setApplied(q);
  };

  return (
    <>
      <h1>Products</h1>
      <form role="search" aria-label="Products" className="filters" onSubmit={submit}>
        <label>Search <input type="search" value={q} onChange={(e) => onSearch(e.target.value)} /></label>
        <button>Search</button>
        <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select></label>
        <label>Sort by <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s}>{s}</option>)}
        </select></label>
      </form>
      <p role="status">{busy ? 'Loading…' : `${list.length} products`}</p>
      <ul aria-label="Products" aria-busy={busy} className="grid">
        {list.map((p) => (
          <li key={p.id}>
            <article aria-labelledby={`title-${p.id}`} className="card">
              <img src={image(p)} alt={p.name} />
              <h2 id={`title-${p.id}`}><a href={`#/product/${p.id}`}>{p.name}</a></h2>
              <p>{p.category} · {p.blurb}</p>
              <p className="price">{money(p.price)}</p>
              {cart[p.id] > 0 && <p>In cart: {cart[p.id]}</p>}
              <button onClick={() => add(p.id)}>Add to cart</button>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

function ProductPage({ product: p, cart, add }) {
  return (
    <>
      <a href="#/">Back to products</a>
      {p ? (
        <article className="detail">
          <img src={image(p)} alt={p.name} />
          <h1>{p.name}</h1>
          <p>{p.category} · {p.blurb}</p>
          <p className="price">{money(p.price)}</p>
          {cart[p.id] > 0 && <p>In cart: {cart[p.id]}</p>}
          <button onClick={() => add(p.id)}>Add to cart</button>
        </article>
      ) : (
        <h1>Product not found</h1>
      )}
    </>
  );
}

function CartPage({ cart, total, order, setQty, remove, checkout }) {
  const lines = Object.entries(cart);
  return (
    <>
      <h1>Cart</h1>
      {order && <p role="alert">Order #{order} placed. Thank you!</p>}
      {lines.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <ul aria-label="Cart items" className="cart">
            {lines.map(([id, n]) => {
              const p = byId[id];
              return (
                <li key={id}>
                  <span>{p.name}</span>
                  <span>{money(p.price)} each</span>
                  <label>Quantity <input type="number" min="1" max="10" aria-label={`Quantity, ${p.name}`} value={n}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v) setQty(id, v); }} /></label>
                  <span>{money(p.price * n)}</span>
                  <button aria-label={`Remove ${p.name}`} data-agent-confirm={`Remove ${p.name} from cart`} onClick={() => remove(id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <p>Total: <strong>{money(total)}</strong></p>
          <button data-agent-confirm={`Place order for ${money(total)}`} onClick={checkout}>Checkout</button>
        </>
      )}
    </>
  );
}
