import {
  PILAF_SIZES,
  SIMPLE_ITEMS,
  QEBAP_PRICE,
  MAX_QEBAP_ON_PILAF,
  MAX_QEBAP_ALONE,
  MAX_QTY,
  itemPrice,
  orderTotal,
  describeOrder,
  buildRestaurantText,
  buildPaymentsText,
  BOTTOM_ITEMS,
} from './menu.js';

// ============================================================
// Helpers
// ============================================================
const $ = (sel) => document.querySelector(sel);

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const keyOf = (name) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('sq');

// Today's date in Albania, as YYYY-MM-DD
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane' }).format(new Date());

function shiftDate(date, days) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DAYS = ['E diel', 'E hënë', 'E martë', 'E mërkurë', 'E enjte', 'E premte', 'E shtunë'];
const MONTHS = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];

function formatDate(date) {
  const d = new Date(date + 'T12:00:00Z');
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function relativeDay(date) {
  const t = today();
  if (date === t) return 'Sot';
  if (date === shiftDate(t, 1)) return 'Nesër';
  if (date === shiftDate(t, -1)) return 'Dje';
  return '';
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error-toast', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older phones
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('U kopjua ✓');
}

// ============================================================
// State
// ============================================================
const emptyDraft = () => {
  const d = { pilafs: [], qebap: 0 };
  for (const key of Object.keys(SIMPLE_ITEMS)) d[key] = 0;
  return d;
};

const state = {
  name: storage.get('porosite_emri') || '',
  password: storage.get('porosite_fjalekalimi') || '',
  date: today(),
  orders: [],
  draftName: '',
  draft: emptyDraft(),
  dirty: false, // true when the form has unsaved changes
  saving: false,
  confirmDelete: false,
  view: 'day',
};

function draftToItems(d) {
  const items = d.pilafs.map((p) => ({ t: 'pilaf', size: p.size, q: p.q }));
  if (d.qebap > 0) items.push({ t: 'qebap', q: d.qebap });
  for (const key of Object.keys(SIMPLE_ITEMS)) if (d[key] > 0) items.push({ t: key, n: d[key] });
  return items;
}

function itemsToDraft(items) {
  const d = emptyDraft();
  for (const it of items) {
    if (it.t === 'pilaf') d.pilafs.push({ size: it.size, q: it.q });
    else if (it.t === 'qebap') d.qebap += it.q;
    else d[it.t] += it.n;
  }
  return d;
}

const findOrder = (name) => state.orders.find((o) => keyOf(o.name) === keyOf(name));

function loadDraftFor(name) {
  const existing = findOrder(name);
  state.draftName = existing ? existing.name : name;
  state.draft = existing ? itemsToDraft(existing.items) : emptyDraft();
  state.dirty = false;
  state.confirmDelete = false;
}

// ============================================================
// API
// ============================================================
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-group-password': state.password,
      ...(options.headers || {}),
    },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) {
    logout('Fjalëkalimi i gabuar ose u ndryshua.');
    throw new Error('401');
  }
  if (!res.ok) throw new Error(data.error || 'Gabim në lidhje');
  return data;
}

async function loadDay({ resetDraft = false } = {}) {
  const date = state.date;
  const data = await api(`/api/orders?date=${date}`);
  if (date !== state.date) return; // user already switched to another day
  state.orders = data.orders;
  if (resetDraft) loadDraftFor(state.name);
  renderDay();
}

// ============================================================
// Render: order form
// ============================================================
function stepper(act, value, min, max, extra = '') {
  return `
    <div class="stepper">
      <button type="button" data-act="${act}" data-d="-1" ${extra} ${value <= min ? 'disabled' : ''} aria-label="Më pak">−</button>
      <span class="val">${value}</span>
      <button type="button" data-act="${act}" data-d="1" ${extra} ${value >= max ? 'disabled' : ''} aria-label="Më shumë">+</button>
    </div>`;
}

function renderForm() {
  const d = state.draft;
  const items = draftToItems(d);
  const total = orderTotal(items);
  const existing = state.draftName.trim() ? findOrder(state.draftName) : null;
  const isOther = state.draftName.trim() && keyOf(state.draftName) !== keyOf(state.name);

  const pilafRows = d.pilafs
    .map((p, i) => {
      const sizes = Object.entries(PILAF_SIZES)
        .map(
          ([key, s]) => `
          <button type="button" class="size-btn ${p.size === key ? 'active' : ''}" data-act="size" data-i="${i}" data-size="${key}">
            ${esc(s.label)}<small>${s.price} lek</small>
          </button>`
        )
        .join('');
      return `
        <div class="pilaf-row">
          <div class="sizes">${sizes}</div>
          <div class="row-bottom">
            <span class="label">Qebapa</span>
            ${stepper('pq', p.q, 0, MAX_QEBAP_ON_PILAF, `data-i="${i}"`)}
            <span class="price">${itemPrice({ t: 'pilaf', ...p })} lek</span>
            <button type="button" class="remove-btn" data-act="remove-pilaf" data-i="${i}" aria-label="Hiq">✕</button>
          </div>
        </div>`;
    })
    .join('');

  const simpleRow = (key, label, priceText, value, max) => `
    <div class="item-row">
      <div class="item-name">${esc(label)}<small>${priceText}</small></div>
      ${stepper('simple', value, 0, max, `data-key="${key}"`)}
    </div>`;
  const simple = (key) => simpleRow(key, SIMPLE_ITEMS[key].label, `${SIMPLE_ITEMS[key].price} lek`, d[key], MAX_QTY);

  const keys = Object.keys(SIMPLE_ITEMS);
  const others = [
    ...keys.filter((k) => !BOTTOM_ITEMS.includes(k)).map(simple),
    simpleRow('qebap', 'Vetëm qebapa (pa pilaf)', `${QEBAP_PRICE} lek copa`, d.qebap, MAX_QEBAP_ALONE),
    ...keys.filter((k) => BOTTOM_ITEMS.includes(k)).map(simple),
  ].join('');

  let hint = '';
  if (isOther && existing) hint = `Po ndryshon porosinë e ${esc(existing.name)}.`;
  else if (isOther) hint = `Po shton porosi për ${esc(state.draftName.trim())}.`;

  $('#orderForm').innerHTML = `
    <label class="field">
      <span>Porosia për</span>
      <input id="draftName" maxlength="30" value="${esc(state.draftName)}" placeholder="Emri" />
    </label>
    ${hint ? `<p class="hint">${hint}</p>` : ''}

    <div class="section-title">Pilaf</div>
    ${pilafRows}
    <button type="button" class="btn-ghost" data-act="add-pilaf">+ Shto pilaf</button>

    <div class="section-title">Të tjera</div>
    ${others}

    <div class="form-footer">
      <div class="form-total"><span>Totali</span><b>${total} lek</b></div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-act="save" ${!items.length || state.saving ? 'disabled' : ''}>
          ${state.saving ? 'Duke ruajtur…' : existing ? (state.dirty ? 'Ruaj ndryshimet' : 'E ruajtur ✓') : 'Ruaj porosinë'}
        </button>
        ${existing ? `<button type="button" class="btn btn-danger ${state.confirmDelete ? 'confirm' : ''}" data-act="delete">${state.confirmDelete ? 'Konfirmo fshirjen' : 'Fshi'}</button>` : ''}
      </div>
    </div>`;
}

// ============================================================
// Render: orders, restaurant text, payments
// ============================================================
function renderDay() {
  const rel = relativeDay(state.date);
  $('#dateText').textContent = (rel ? rel + ' · ' : '') + formatDate(state.date);
  $('#dateInput').value = state.date;
  $('#todayBtn').classList.toggle('hidden', state.date === today());

  // Don't re-draw the form while someone is typing a name in it
  if (document.activeElement?.id !== 'draftName') renderForm();

  const orders = state.orders;
  $('#ordersCount').textContent = orders.length;
  $('#ordersList').innerHTML = orders.length
    ? orders
        .map(
          (o) => `
        <div class="order">
          <div class="order-main">
            <div class="order-name">${esc(o.name)}${keyOf(o.name) === keyOf(state.name) ? '<span class="you">(ti)</span>' : ''}</div>
            <div class="order-items">${esc(describeOrder(o.items))}</div>
          </div>
          <div class="order-side">
            <span class="price">${o.total} lek</span>
            <button class="link small" data-edit="${esc(o.name)}">Ndrysho</button>
          </div>
        </div>`
        )
        .join('')
    : '<p class="empty">Ende s’ka porosi për këtë ditë.</p>';

  const text = buildRestaurantText(orders);
  $('#restaurantText').textContent = text || '—';
  $('#copyRestaurant').disabled = !text;
  const wa = $('#whatsappRestaurant');
  wa.href = text ? `https://wa.me/?text=${encodeURIComponent(text)}` : '#';
  wa.classList.toggle('hidden', !text);

  const total = orders.reduce((s, o) => s + o.total, 0);
  $('#payments').innerHTML = orders.length
    ? orders.map((o) => `<div class="pay-row"><span>${esc(o.name)}</span><b>${o.total} lek</b></div>`).join('') +
      `<div class="pay-total"><span>Totali (${orders.length} veta)</span><span>${total} lek</span></div>`
    : '<p class="empty">—</p>';
  $('#copyPayments').disabled = !orders.length;
}

// ============================================================
// Render: history
// ============================================================
async function renderHistory() {
  const list = $('#historyList');
  list.innerHTML = '<p class="empty">Duke ngarkuar…</p>';
  try {
    const { days } = await api('/api/history');
    if (!days.length) {
      list.innerHTML = '<p class="empty">Ende s’ka histori.</p>';
      return;
    }
    const grand = days.reduce((s, d) => s + d.total, 0);
    list.innerHTML =
      days
        .map((d) => {
          const rel = relativeDay(d.date);
          return `
          <button class="history-row" data-date="${d.date}">
            <div>
              <div class="history-date">${rel ? rel + ' · ' : ''}${formatDate(d.date)}</div>
              <div class="history-names">${d.people} veta · ${esc(d.names.join(', '))}</div>
            </div>
            <span class="history-total">${d.total} lek ›</span>
          </button>`;
        })
        .join('') + `<div class="history-sum"><span>Gjithsej (${days.length} ditë)</span><span>${grand} lek</span></div>`;
  } catch (e) {
    if (e.message !== '401') list.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

// ============================================================
// Views + login
// ============================================================
function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#view-day').classList.toggle('hidden', view !== 'day');
  $('#view-history').classList.toggle('hidden', view !== 'history');
  if (view === 'history') renderHistory();
  window.scrollTo(0, 0);
}

async function goToDate(date) {
  state.date = date;
  state.orders = [];
  loadDraftFor(state.name);
  renderDay();
  try { await loadDay({ resetDraft: true }); } catch (e) { if (e.message !== '401') toast(e.message, true); }
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userName').textContent = state.name;
}

function logout(message = '') {
  storage.del('porosite_fjalekalimi');
  state.password = '';
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginName').value = state.name;
  $('#loginError').textContent = message;
  $('#loginError').classList.toggle('hidden', !message);
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#loginName').value.trim().replace(/\s+/g, ' ');
  const password = $('#loginPassword').value;
  if (!name || !password) return;
  state.name = name;
  state.password = password;
  try {
    await loadDay({ resetDraft: true });
    storage.set('porosite_emri', name);
    storage.set('porosite_fjalekalimi', password);
    $('#loginPassword').value = '';
    showApp();
  } catch (err) {
    if (err.message !== '401') {
      $('#loginError').textContent = err.message;
      $('#loginError').classList.remove('hidden');
    }
  }
});

$('#logoutBtn').addEventListener('click', () => {
  storage.del('porosite_emri');
  state.name = '';
  logout();
});

// ============================================================
// Events
// ============================================================
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

document.querySelectorAll('[data-shift]').forEach((b) =>
  b.addEventListener('click', () => goToDate(shiftDate(state.date, Number(b.dataset.shift))))
);
$('#dateInput').addEventListener('change', (e) => e.target.value && goToDate(e.target.value));
$('#todayBtn').addEventListener('click', () => goToDate(today()));

// Name field in the form
$('#orderForm').addEventListener('input', (e) => {
  if (e.target.id !== 'draftName') return;
  state.draftName = e.target.value;
});
$('#orderForm').addEventListener('change', (e) => {
  if (e.target.id !== 'draftName') return;
  // Nothing changed yet -> show this person's saved order, or an empty form.
  // If items were already picked, keep them (you picked the food first, then typed the name).
  if (!state.dirty) loadDraftFor(state.draftName);
  renderForm();
});

// All buttons in the form
$('#orderForm').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const d = state.draft;
  const i = Number(btn.dataset.i);
  const delta = Number(btn.dataset.d);
  const act = btn.dataset.act;

  if (act === 'save') return saveOrder();
  if (act === 'delete') return deleteOrder();

  if (act === 'add-pilaf') d.pilafs.push({ size: 'teke', q: 0 });
  else if (act === 'remove-pilaf') d.pilafs.splice(i, 1);
  else if (act === 'size') d.pilafs[i].size = btn.dataset.size;
  else if (act === 'pq') d.pilafs[i].q = Math.min(MAX_QEBAP_ON_PILAF, Math.max(0, d.pilafs[i].q + delta));
  else if (act === 'simple') {
    const key = btn.dataset.key;
    const max = key === 'qebap' ? MAX_QEBAP_ALONE : MAX_QTY;
    d[key] = Math.min(max, Math.max(0, d[key] + delta));
  }
  state.dirty = true;
  state.confirmDelete = false;
  renderForm();
});

async function saveOrder() {
  const name = state.draftName.trim();
  if (!name) return toast('Shkruaj emrin', true);
  state.saving = true;
  renderForm();
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ date: state.date, name, items: draftToItems(state.draft) }),
    });
    state.dirty = false;
    await loadDay();
    toast('Porosia u ruajt ✓');
  } catch (e) {
    if (e.message !== '401') toast(e.message, true);
  } finally {
    state.saving = false;
    renderForm();
  }
}

let confirmTimer;
async function deleteOrder() {
  if (!state.confirmDelete) {
    state.confirmDelete = true;
    renderForm();
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => { state.confirmDelete = false; renderForm(); }, 3000);
    return;
  }
  clearTimeout(confirmTimer);
  const name = state.draftName.trim();
  try {
    await api(`/api/orders?date=${state.date}&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadDay();
    loadDraftFor(state.name);
    renderForm();
    toast('Porosia u fshi');
  } catch (e) {
    if (e.message !== '401') toast(e.message, true);
  }
}

// "Ndrysho" on an order in the list
$('#ordersList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-edit]');
  if (!btn) return;
  loadDraftFor(btn.dataset.edit);
  renderForm();
  $('#orderForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#copyRestaurant').addEventListener('click', () => copyText(buildRestaurantText(state.orders)));
$('#copyPayments').addEventListener('click', () =>
  copyText(`Pagesat · ${formatDate(state.date)}\n\n${buildPaymentsText(state.orders)}`)
);

// Click a day in history -> open it
$('#historyList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-date]');
  if (!row) return;
  setView('day');
  goToDate(row.dataset.date);
});

// Refresh orders every 15s so you see your friends' orders live
setInterval(() => {
  if (state.password && state.view === 'day' && document.visibilityState === 'visible') {
    loadDay().catch(() => {});
  }
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.password && state.view === 'day') loadDay().catch(() => {});
});

// ============================================================
// Start
// ============================================================
(async function start() {
  if (state.name && state.password) {
    try {
      await loadDay({ resetDraft: true });
      showApp();
      return;
    } catch (e) {
      if (e.message === '401') return;
      showApp();
      toast(e.message, true);
      return;
    }
  }
  logout();
})();
