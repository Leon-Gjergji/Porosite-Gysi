// ============================================================
// MENU + shared logic (used by both the website and the API)
// Te Gysi · Traditional Food. To change a price or a name, edit it here only.
// ============================================================

// ----- Pilaf builder (pilaf + qebapa on top) -----
// The order here is also the order in the restaurant text.
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

// ----- The menu, category by category (same order as the printed menu) -----
// id: never change an id once orders use it (old orders are stored with it).
// note: weight or ingredients, shown small under the name.
// 'qebap' inside Zgare is the special "only qebapa" item (counted per piece).
const cat = (id, title, en, items) => ({
  id,
  title,
  en,
  items: items.map(([itemId, label, enLabel, price, note]) => ({ id: itemId, label, en: enLabel, price, note })),
});

export const MENU = [
  cat('kryesore', 'Kryesore', 'Main dishes', [
    ['tasqebap', 'Tasqebap', 'Gulash', 300],
    ['pace-koke', 'Pace koke', 'Veal head soup', 250],
    ['pace-planci', 'Pace plançi', 'Cow tripe soup', 200],
    ['mish-jahni', 'Mish jahni', 'Jahni meat soup', 350],
    ['fasule', 'Fasule', 'Beans', 150],
    ['fasule-mish', 'Fasule me mish', 'Beans with beef meat', 270],
    ['mushkeri-leng', 'Mushkëria me lëng', 'Cow lung soup', 300],
    ['qofte-leng', 'Qofte shtëpie me lëng', 'Homemade meatballs soup', 250],
    ['jufka-pule', 'Jufka me pulë', 'Jufka with chicken', 400],
    ['tave-dheu', 'Tavë dheu', 'Clay pot dish', 500],
  ]),
  cat('zgare', 'Zgara', 'Grill', [
    ['qebap', 'Qebapa', 'Cevapi', 40, 'çmimi për copë, pa pilaf'],
    ['salcice-pule', 'Salçiçe pule', 'Chicken sausage', 70],
    ['qofte-zgare', 'Qofte shtëpie', 'Homemade meatballs', 100],
    ['suxhuk', 'Suxhuk pikant', 'Sujuk', 200],
    ['sallam', 'Sallam', 'Sausage', 180],
    ['mushkeri-zgare', 'Mushkëri', 'Cow lungs', 250, '200 gr'],
    ['fileto', 'Fileto pule', 'Chicken fillet', 250, '200 gr'],
    ['kotolet', 'Kotolet pule', 'Chicken cutlets', 300, '150 gr'],
    ['biftek', 'Biftek', 'Beef steak', 800, '300 gr'],
    ['berxolle', 'Berxollë', 'Beef chop', 800, '250 gr'],
    ['veshka', 'Veshka', 'Beef kidney', 650, '300 gr'],
    ['paidhaqe', 'Paidhaqe', 'Beef rib chops', 700, '300 gr'],
    ['fileto-vici', 'Fileto viçi', 'Beef fillet', 1000],
    ['saganaki', 'Fileto pule saganaki', 'Saganaki chicken fillet', 500],
    ['mix-tradicional', 'Mix tradicional', 'Traditional mixed meat', 1100, '3 persona: qofte, piskavica, salçiçe, qebap, mushkëri'],
  ]),
  cat('supa', 'Supa', 'Soups', [
    ['supe-pule', 'Supë pule', 'Chicken soup', 220],
    ['supe-perimesh', 'Supë perimesh', 'Vegetable soup', 200],
    ['supe-karrote', 'Supë krem karrote xhinxher', 'Carrot ginger soup', 250],
    ['supe-kerpurdhe', 'Supë krem kërpurdhë', 'Creamy mushroom soup', 250],
  ]),
  cat('zarzavate', 'Zarzavate', 'Vegetable dishes', [
    ['speca', 'Speca të mbushur', 'Stuffed peppers', 300],
    ['patlixhana', 'Patlixhana turli', 'Turli eggplant', 300],
    ['spinak', 'Spinak me vezë', 'Spinach with eggs', 300],
    ['bishtaja', 'Bishtaja', 'Legumes', 300],
    ['bamje', 'Bamje', 'Okra', 350],
    ['bizele', 'Bizele', 'Peas', 250],
  ]),
  cat('sallata', 'Sallata', 'Salads', [
    ['sallate-mikse', 'Sallatë mikse', 'Mix salad', 200],
    ['sallate-greke', 'Sallatë greke', 'Greek salad', 250],
    ['sallate-jeshile', 'Sallatë jeshile', 'Green salad', 150],
    ['sallate-turshi', 'Sallatë turshi', 'Pickles salad', 150],
    ['sallate-rukola', 'Sallatë rukola pomodorini', 'Rucola pomodorini salad', 300],
    ['sallate-cezar', 'Sallatë Cezar', 'Caesar salad', 400],
    ['vere-pjate', 'Verë në pjatë', 'Summer on a plate', 350, 'rukola, pjeshkë, djathë dhie, pomodorini, arra, salcë mjalti'],
    ['kopeshti-vjeshtes', 'Kopështi i vjeshtës', 'Autumn garden', 450, 'mix gjethesh, gjoks pule, dardhë, gorgonzola, pomodorini, arra'],
  ]),
  cat('shoqeruese', 'Shoqëruese', 'Sides', [
    ['patate', 'Patate', 'Fries', 150],
    ['djathe-bardhe', 'Djathë i bardhë', 'White cheese', 100],
    ['kackavall', 'Djathë kaçkavall', 'Kashkaval cheese', 200],
    ['kos', 'Kos', 'Yogurt', 60],
    ['kos-lope', 'Kos shtëpie lope', 'Homemade cow yogurt', 80],
    ['kos-dele', 'Kos shtëpie dele', 'Homemade sheep yogurt', 100],
    ['salce-kosi', 'Salcë kosi', 'Strained yogurt', 150],
    ['perime-zgare', 'Perime zgare', 'Grilled vegetables', 250],
    ['taratoll', 'Taratoll', 'Tarator', 150],
    ['djathe-grire', 'Djathë i grirë', 'Shredded cheese', 50],
  ]),
  cat('pasta', 'Pasta', 'Pasta', [
    ['makarona-gjalpe', 'Makarona me gjalpë', 'Pasta with butter', 150],
    ['makarona-proshute', 'Makarona me salcë proshutë', 'Tomato sauce and prosciutto', 250],
    ['pene', 'Makarona pana proshutë', 'Cream and prosciutto', 250],
    ['makarona-pana-pule', 'Makarona pana pule', 'Chicken and cream sauce', 400],
    ['pene-vici', 'Pene fileto viçi dhe kërpurdhë', 'Beef fillet and mushrooms', 700],
    ['ravioli-tartuf', 'Ravioli tartuf dhe kërpurdha', 'Truffle and fresh mushrooms', 500],
    ['ravioli-domate', 'Ravioli salcë domate dhe krem djathi', 'Tomato sauce and cream cheese', 350],
    ['lazanja', 'Lazanja', 'Lasagna', 400],
    ['pene-rose', 'Pene salcë rose dhe salçiçe', 'Pink sauce with sausage', 400],
    ['pene-brokoli', 'Pene pana pule brokoli', 'Chicken, cream and broccoli', 450],
    ['pene-suxhuk', 'Pene me kungull dhe suxhuk', 'Zucchini and sujuk', 450],
    ['pakeri', 'Pakeri me pulë dhe spinaq', 'Paccheri with chicken and spinach', 500],
    ['carbonara', 'Spageti carbonara', 'Spaghetti carbonara', 450],
    ['bolonjeze', 'Spageti bolonjeze', 'Spaghetti bolognese', 350],
  ]),
  cat('omleta', 'Omleta', 'Eggs', [
    ['omlete', 'Omletë e thjeshtë', 'Plain omelette', 150],
    ['omlete-djath', 'Omletë djathë domate', 'Cheese and tomato omelette', 250],
    ['omlete-sallam', 'Omletë me sallam', 'Salami omelette', 270],
    ['veze-sy', 'Vezë sy x2', 'Fried eggs x2', 100],
    ['petulla', 'Petulla shtëpie', 'Homemade pancakes', 150],
  ]),
  cat('bowls', 'Bowls', 'Bowls', [
    ['bowl-greek', 'Chicken greek bowl', '', 370, 'patate, pita, fileto pule, gogozhare, tzatziki'],
    ['bowl-mediterrean', 'Mediterrean bowl', '', 450, 'pilaf, fileto pule, kastravec, domate, ullinj, djathë'],
    ['bowl-protein', 'Protein power bowl', '', 440, 'quinoa, fileto pule, vezë, brokoli, karrotë, lulelakër'],
    ['bowl-tuna', 'Spicy tuna bowl', '', 420, 'oriz basmati, ton, avokado, brokoli, karrotë, spicy mayo'],
    ['bowl-crunchy', 'Crunchy chicken bowl', '', 400, 'kroket pule, patate, tzatziki'],
    ['bowl-bbq', 'BBQ Texas bowl', '', 700, 'oriz basmati, mish viçi, brokoli, misër, garlic sauce'],
    ['bowl-teriyaki', 'Chicken teriyaki', '', 450, 'oriz basmati, fileto pule, avokado, salcë teriyaki'],
    ['bowl-strawberry', 'Strawberry banane smoothie bowl', '', 500, 'jogurt, banane, luleshtrydhe, tërshërë, chia, mjaltë'],
    ['bowl-blueberry', 'Blueberry smoothie bowl', '', 550, 'jogurt, boronicë, tërshërë, fruta, chia, bajame, mjaltë'],
  ]),
  cat('pije', 'Pije', 'Drinks', [['uje', 'Ujë', 'Water', 50]]),
];

// id -> item (with its category id). 'qebap' is included here too.
export const ITEMS = {};
for (const c of MENU) for (const it of c.items) ITEMS[it.id] = { ...it, cat: c.id };

// Items that go at the very bottom of the restaurant text (after qebapa).
export const BOTTOM_ITEMS = ['uje', 'kos'];

// ----- Item shapes stored in an order -----
// { t: 'pilaf', size: 'dopjo', q: 4 }   -> Dopjo me 4 qebapa
// { t: 'qebap', q: 5 }                  -> only qebapa, 5 pieces
// { t: 'fileto', n: 2 }                 -> 2x Fileto pule (any other menu item)

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

// Checks and cleans an order coming from a user. Returns null if invalid/empty.
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length > 80) return null;
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
    } else if (ITEMS[it.t]) {
      if (!isInt(it.n, 0, MAX_QTY)) return null;
      simple[it.t] = (simple[it.t] || 0) + it.n;
    } else {
      return null;
    }
  }
  if (pilafs.length > 20 || qebap > MAX_QEBAP_ALONE) return null;

  const out = [...pilafs];
  if (qebap > 0) out.push({ t: 'qebap', q: qebap });
  for (const key of Object.keys(ITEMS)) {
    if (key !== 'qebap' && simple[key] > 0) out.push({ t: key, n: Math.min(simple[key], MAX_QTY) });
  }
  return out.length ? out : null;
}

export function itemPrice(it) {
  if (it.t === 'pilaf') return PILAF_SIZES[it.size].price + it.q * QEBAP_PRICE;
  if (it.t === 'qebap') return it.q * QEBAP_PRICE;
  return (ITEMS[it.t]?.price || 0) * it.n;
}

export function orderTotal(items) {
  return items.reduce((sum, it) => sum + itemPrice(it), 0);
}

// How many qebapa are in one order (pilaf + qebapa, and only-qebapa). Used by the leaderboard.
export function qebapCount(items) {
  return (items || []).reduce((s, it) => s + (it.t === 'pilaf' || it.t === 'qebap' ? it.q || 0 : 0), 0);
}

export function pilafLabel(size, q) {
  const label = PILAF_SIZES[size]?.label || size;
  return q > 0 ? `${label} me ${q}` : label;
}

// Label of a menu item; falls back to the id if the item was removed from the menu later.
export const itemLabel = (id) => ITEMS[id]?.label || id;

// Short description of one person's order, e.g. "Dopjo me 4, 2x Ujë"
export function describeOrder(items) {
  return items
    .map((it) => {
      if (it.t === 'pilaf') return pilafLabel(it.size, it.q);
      if (it.t === 'qebap') return `${it.q} qebapa`;
      return it.n > 1 ? `${it.n}x ${itemLabel(it.t)}` : itemLabel(it.t);
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

  // 2) Food in menu order (not drinks / kos). Unknown old ids go last.
  const known = Object.keys(ITEMS).filter((k) => k !== 'qebap' && !BOTTOM_ITEMS.includes(k));
  const unknown = Object.keys(simpleCount).filter((k) => !ITEMS[k]);
  for (const key of [...known, ...unknown]) {
    if (simpleCount[key]) lines.push(`${itemLabel(key)} ${simpleCount[key]}x`);
  }

  // 3) Only qebapa
  [...qebapCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([q, count]) => lines.push(`${q} qebapa ${count}x`));

  // 4) Ujë + kos at the bottom
  for (const key of BOTTOM_ITEMS) {
    if (simpleCount[key]) lines.push(`${itemLabel(key)} ${simpleCount[key]}x`);
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
