// ============================================================
// MENU + shared logic (used by both the website and the API)
// To change a price or a name, edit it here only.
// ============================================================

// Pilaf sizes. The order here is also the order in the restaurant text.
export const PILAF_SIZES = {
  dopjoteke: { label: 'Dopio+teke', price: 240 },
  dopjo: { label: 'Dopjo', price: 160 },
  gjys: { label: 'Teke e gjys', price: 120 },
  teke: { label: 'Teke', price: 80 },
};

export const QEBAP_PRICE = 40;
export const MAX_QEBAP_ON_PILAF = 20;
export const MAX_QEBAP_ALONE = 50;
export const MAX_QTY = 20;

// Simple items with a quantity. The order here is the order in the text.
export const SIMPLE_ITEMS = {
  fileto: { label: 'Fileto pule', price: 250 },
  pene: { label: 'Pene pan proshut', price: 250 },
  patate: { label: 'Patate', price: 250 },
  uje: { label: 'Uje', price: 50 },
  kos: { label: 'Kos', price: 40 },
};

// Items that go at the very bottom of the restaurant text (after qebapa).
export const BOTTOM_ITEMS = ['uje', 'kos'];

// ----- Item shapes -----
// { t: 'pilaf', size: 'dopjo', q: 4 }   -> Dopjo me 4 qebapa
// { t: 'qebap', q: 5 }                  -> only qebapa, 5 pieces
// { t: 'fileto', n: 2 }                 -> 2x Fileto pule (same for pene, uje, kos)

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

// Checks and cleans an order coming from a user. Returns null if invalid/empty.
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length > 40) return null;
  const pilafs = [];
  let qebap = 0;
  const simple = {};

  for (const it of items) {
    if (!it || typeof it !== 'object') return null;
    if (it.t === 'pilaf') {
      if (!PILAF_SIZES[it.size] || !isInt(it.q, 0, MAX_QEBAP_ON_PILAF)) return null;
      pilafs.push({ t: 'pilaf', size: it.size, q: it.q });
    } else if (it.t === 'qebap') {
      if (!isInt(it.q, 0, MAX_QEBAP_ALONE)) return null;
      qebap += it.q;
    } else if (SIMPLE_ITEMS[it.t]) {
      if (!isInt(it.n, 0, MAX_QTY)) return null;
      simple[it.t] = (simple[it.t] || 0) + it.n;
    } else {
      return null;
    }
  }
  if (pilafs.length > 20 || qebap > MAX_QEBAP_ALONE) return null;

  const out = [...pilafs];
  if (qebap > 0) out.push({ t: 'qebap', q: qebap });
  for (const key of Object.keys(SIMPLE_ITEMS)) {
    if (simple[key] > 0) out.push({ t: key, n: Math.min(simple[key], MAX_QTY) });
  }
  return out.length ? out : null;
}

export function itemPrice(it) {
  if (it.t === 'pilaf') return PILAF_SIZES[it.size].price + it.q * QEBAP_PRICE;
  if (it.t === 'qebap') return it.q * QEBAP_PRICE;
  return SIMPLE_ITEMS[it.t].price * it.n;
}

export function orderTotal(items) {
  return items.reduce((sum, it) => sum + itemPrice(it), 0);
}

export function pilafLabel(size, q) {
  const label = PILAF_SIZES[size].label;
  return q > 0 ? `${label} me ${q}` : label;
}

// Short description of one person's order, e.g. "Dopjo me 4, 2x Uje"
export function describeOrder(items) {
  return items
    .map((it) => {
      if (it.t === 'pilaf') return pilafLabel(it.size, it.q);
      if (it.t === 'qebap') return `${it.q} qebapa`;
      const label = SIMPLE_ITEMS[it.t].label;
      return it.n > 1 ? `${it.n}x ${label}` : label;
    })
    .join(', ');
}

// Builds the text for the restaurant from all orders of the day.
// orders: [{ name, items }]
export function buildRestaurantText(orders) {
  const pilafCount = new Map(); // "size|q" -> count
  const qebapCount = new Map(); // q -> count (people who ordered only qebapa)
  const simpleCount = {};

  for (const o of orders) {
    for (const it of o.items) {
      if (it.t === 'pilaf') {
        const k = `${it.size}|${it.q}`;
        pilafCount.set(k, (pilafCount.get(k) || 0) + 1);
      } else if (it.t === 'qebap') {
        qebapCount.set(it.q, (qebapCount.get(it.q) || 0) + 1);
      } else {
        simpleCount[it.t] = (simpleCount[it.t] || 0) + it.n;
      }
    }
  }

  const lines = [];
  const sizeOrder = Object.keys(PILAF_SIZES);

  // 1) Pilaf: biggest size first, then most qebapa first
  [...pilafCount.entries()]
    .map(([k, count]) => {
      const [size, q] = k.split('|');
      return { size, q: Number(q), count };
    })
    .sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size) || b.q - a.q)
    .forEach((p) => lines.push(`${pilafLabel(p.size, p.q)} ${p.count}x`));

  // 2) Food items (not drinks / kos)
  for (const key of Object.keys(SIMPLE_ITEMS)) {
    if (BOTTOM_ITEMS.includes(key)) continue;
    if (simpleCount[key]) lines.push(`${SIMPLE_ITEMS[key].label} ${simpleCount[key]}x`);
  }

  // 3) Only qebapa
  [...qebapCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([q, count]) => lines.push(`${q} qebapa ${count}x`));

  // 4) Uje + kos at the bottom
  for (const key of BOTTOM_ITEMS) {
    if (simpleCount[key]) lines.push(`${SIMPLE_ITEMS[key].label} ${simpleCount[key]}x`);
  }

  return lines.join('\n');
}

// Text with how much each person pays + the total.
export function buildPaymentsText(orders) {
  const lines = orders.map((o) => `${o.name}: ${o.total} lek`);
  const total = orders.reduce((s, o) => s + o.total, 0);
  lines.push('', `Totali: ${total} lek`);
  return lines.join('\n');
}
