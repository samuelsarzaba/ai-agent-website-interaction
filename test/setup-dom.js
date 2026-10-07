// jsdom gaps the in-page runtime relies on (Chromium has them natively).
import { queryProducts } from '../src/catalog.js';

Element.prototype.checkVisibility ??= function () {
  for (let el = this; el; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
  }
  return true;
};
Element.prototype.scrollIntoView ??= function () {};

// The products API, in-process, with a short artificial delay like the server's.
export const API_DELAY_MS = 20;
window.fetch = async (url) => {
  const params = Object.fromEntries(new URL(url, location.href).searchParams);
  await new Promise((r) => setTimeout(r, API_DELAY_MS));
  return new Response(JSON.stringify(queryProducts(params)));
};
