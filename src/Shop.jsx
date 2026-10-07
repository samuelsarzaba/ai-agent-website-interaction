// Tiny Shop: a hash-routed shop. Standing UI rules: accessible controls, aria-busy while loading,
// list keys are entity ids, risky elements carry data-agent-confirm, product cards show "In cart: N".
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, SORTS, byId } from './catalog.js';

const money = (n) => `$${n.toFixed(2)}`;
const COLORS = { Kitchen: ['#fbeee0', '#9a5b13'], Home: ['#e6eefb', '#2c4f8f'], Garden: ['#e5f3df', '#2f6b25'], Office: ['#efe8f8', '#5b3f8c'] };
const image = (p) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="144"><rect width="240" height="144" fill="${COLORS[p.category][0]}"/>` +
      `<text x="120" y="88" font-family="sans-serif" font-size="44" font-weight="600" text-anchor="middle" fill="${COLORS[p.category][1]}">${p.name[0]}</text></svg>`,
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
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b bg-background/90 py-3 backdrop-blur">
        <a className="flex items-center gap-2 text-base font-bold tracking-tight" href="#/">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" aria-hidden="true" />
          </span>
          Tiny Shop
        </a>
        <nav aria-label="Main" className="flex gap-1">
          <a href="#/" aria-current={page === 'products' ? 'page' : undefined} className={navLink}>Products</a>
          <a href="#/cart" aria-current={page === 'cart' ? 'page' : undefined} aria-label={`Cart (${count})`} className={navLink}>
            Cart <Badge className="rounded-full px-1.5">{count}</Badge>
          </a>
        </nav>
        <p role="status" className="ml-auto flex items-center gap-2 text-sm">
          {toast && <Check className="size-4 text-green-700" aria-hidden="true" />}
          {toast}
        </p>
      </header>
      <main className="flex max-w-5xl flex-col gap-6 py-8">
        {page === 'products' && <ProductsPage cart={cart} add={add} />}
        {page === 'product' && <ProductPage product={byId[productId]} cart={cart} add={add} />}
        {page === 'cart' && (
          <CartPage cart={cart} total={total} order={order} setQty={setQty} remove={remove} checkout={checkout} />
        )}
      </main>
      <footer className="border-t py-4 text-sm text-muted-foreground">
        <p>© Tiny Shop (prototype)</p>
      </footer>
    </>
  );
}

const navLink = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground';
const h1 = 'text-3xl font-bold tracking-tight';

function ProductsPage({ cart, add }) {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('Featured');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const busy = loading || q !== applied;
  const debounce = useRef();

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/products?${new URLSearchParams({ q: applied, category, sort })}`)
      .then((r) => r.json())
      .then((items) => { if (live) { setList(items); setLoading(false); } });
    return () => { live = false; };
  }, [applied, category, sort]);

  const onSearch = (value) => {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setApplied(value), 250);
  };
  const submit = (e) => {
    e.preventDefault();
    clearTimeout(debounce.current);
    setApplied(q);
  };

  return (
    <>
      <h1 className={h1}>Products</h1>
      <form role="search" aria-label="Products" className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/40 p-4" onSubmit={submit}>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Search</Label>
          <div className="relative">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input id="q" type="search" className="bg-background pl-9" placeholder="Search products…" value={q} onChange={(e) => onSearch(e.target.value)} />
          </div>
        </div>
        <Button>Search</Button>
        <Dropdown label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
        <Dropdown label="Sort by" value={sort} onChange={setSort} options={SORTS} />
      </form>
      <p role="status" className="text-sm text-muted-foreground">{busy ? 'Loading…' : `${list.length} products`}</p>
      <ul aria-label="Products" aria-busy={busy} className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 transition-opacity aria-busy:opacity-50">
        {list.map((p) => (
          <li key={p.id}>
            <article aria-labelledby={`title-${p.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
              <img src={image(p)} alt={p.name} className="h-36 w-full object-cover" />
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <h2 id={`title-${p.id}`} className="font-semibold tracking-tight"><a href={`#/product/${p.id}`} className="hover:underline">{p.name}</a></h2>
                <p className="text-sm text-muted-foreground">{p.category} · {p.blurb}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <p className="text-base font-semibold">{money(p.price)}</p>
                  {cart[p.id] > 0 && <Badge>In cart: {cart[p.id]}</Badge>}
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => add(p.id)}><Plus aria-hidden="true" />Add to cart</Button>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

function Dropdown({ label, value, onChange, options }) {
  const id = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <div className="flex w-44 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProductPage({ product: p, cart, add }) {
  return (
    <>
      <a href="#/" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />Back to products
      </a>
      {p ? (
        <article className="flex flex-wrap gap-8">
          <img src={image(p)} alt={p.name} className="w-full max-w-sm rounded-xl border" />
          <div className="flex flex-col items-start gap-3">
            <h1 className={h1}>{p.name}</h1>
            <p className="text-muted-foreground">{p.category} · {p.blurb}</p>
            <p className="text-2xl font-semibold">{money(p.price)}</p>
            {cart[p.id] > 0 && <Badge>In cart: {cart[p.id]}</Badge>}
            <Button onClick={() => add(p.id)}><Plus aria-hidden="true" />Add to cart</Button>
          </div>
        </article>
      ) : (
        <h1 className={h1}>Product not found</h1>
      )}
    </>
  );
}

function CartPage({ cart, total, order, setQty, remove, checkout }) {
  const lines = Object.entries(cart);
  return (
    <>
      <h1 className={h1}>Cart</h1>
      {order && <p role="alert" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-900"><Check className="size-4" aria-hidden="true" />Order #{order} placed. Thank you!</p>}
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Your cart is empty.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <ul aria-label="Cart items" className="flex-[999_1_560px] divide-y rounded-xl border">
            {lines.map(([id, n]) => {
              const p = byId[id];
              return (
                <li key={id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="min-w-32 flex-1 font-semibold">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{money(p.price)} each</span>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">Quantity <Input type="number" min="1" max="10" className="h-8 w-16" aria-label={`Quantity, ${p.name}`} value={n}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v) setQty(id, v); }} /></label>
                  <span className="w-20 text-right font-semibold tabular-nums">{money(p.price * n)}</span>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${p.name}`} data-agent-confirm={`Remove ${p.name} from cart`} onClick={() => remove(id)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Card className="ml-auto w-full max-w-sm gap-4 p-5">
            <p className="flex justify-between text-base">Total: <strong>{money(total)}</strong></p>
            <Button className="w-full" data-agent-confirm={`Place order for ${money(total)}`} onClick={checkout}>Checkout</Button>
          </Card>
        </div>
      )}
    </>
  );
}
