import {
  PILAF_SIZES,
  MENU,
  ITEMS,
  QEBAP_PRICE,
  MAX_QEBAP_ON_PILAF,
  MAX_QEBAP_ALONE,
  MAX_QTY,
  itemPrice,
  orderTotal,
  describeOrder,
  buildRestaurantText,
  buildPaymentsText,
} from './menu.js';

// ============================================================
// Helpers
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Same rule as the server: "Ardi" and " ardi " are the same person
const keyOf = (name) => String(name).trim().replace(/\s+/g, ' ').toLocaleLowerCase('sq');
const lek = (n) => `${Number(n)} L`;

// Today's date in Albania, as YYYY-MM-DD
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane' }).format(new Date());

function shiftDate(date, days) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DAYS = ['E diel', 'E hënë', 'E martë', 'E mërkurë', 'E enjte', 'E premte', 'E shtunë'];
const MONTHS = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];

function formatDate(date, withYear = true) {
  const d = new Date(date + 'T12:00:00Z');
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`;
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
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
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
  toast('U kopjua');
}

// ============================================================
// State
// ============================================================
const emptyDraft = () => ({ pilafs: [], qebap: 0, n: {} });

const state = {
  token: storage.get('porosite_token') || '',
  me: null, // { key, username, admin }
  date: today(),
  orders: [],
  forName: '', // whose order the form shows (always you, unless you are admin)
  draft: emptyDraft(),
  dirty: false, // true when the form has unsaved changes
  saving: false,
  confirmDelete: false,
  view: 'day',
  search: '',
  period: 'week',
  poff: 0,
  users: [],
  authMode: 'login',
  open: new Set(), // menu sections that are open
};

const isAdmin = () => !!state.me?.admin;
const forKey = () => keyOf(state.forName || state.me?.username || '');
const isMe = (key) => key === state.me?.key;
const canEdit = (order) => isAdmin() || isMe(order.key);

function draftToItems(d) {
  const items = d.pilafs.map((p) => ({ t: 'pilaf', size: p.size, q: p.q }));
  if (d.qebap > 0) items.push({ t: 'qebap', q: d.qebap });
  for (const id of Object.keys(ITEMS)) if (id !== 'qebap' && d.n[id] > 0) items.push({ t: id, n: d.n[id] });
  return items;
}

function itemsToDraft(items) {
  const d = emptyDraft();
  for (const it of items) {
    if (it.t === 'pilaf') d.pilafs.push({ size: it.size, q: it.q });
    else if (it.t === 'qebap') d.qebap += it.q;
    else if (ITEMS[it.t]) d.n[it.t] = (d.n[it.t] || 0) + it.n; // dishes removed from the menu are dropped
  }
  return d;
}

const findOrder = (key) => state.orders.find((o) => o.key === key);

function loadDraftFor(name) {
  state.forName = name;
  const existing = findOrder(keyOf(name));
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
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && state.me) {
    showLogin('Seanca mbaroi. Hyr përsëri.');
    throw new Error('401');
  }
  if (!res.ok) throw new Error(data.error || 'Nuk u lidh me serverin. Provo përsëri.');
  return data;
}

async function loadDay({ resetDraft = false } = {}) {
  const date = state.date;
  const data = await api(`/api/orders?date=${date}`);
  if (date !== state.date) return; // user already switched to another day
  state.orders = data.orders;
  if (resetDraft || !state.dirty) loadDraftFor(state.forName || state.me.username);
  if (resetDraft) openPicked();
  renderDay();
}

// ============================================================
// Render: order form (who, pilaf, menu, cart bar)
// ============================================================
function stepper(act, value, min, max, extra = '') {
  return `
    <div class="stepper">
      <button type="button" data-act="${act}" data-d="-1" ${extra} ${value <= min ? 'disabled' : ''} aria-label="Më pak">−</button>
      <span class="val">${value}</span>
      <button type="button" data-act="${act}" data-d="1" ${extra} ${value >= max ? 'disabled' : ''} aria-label="Më shumë">+</button>
    </div>`;
}

function renderForWho() {
  const existing = findOrder(forKey());
  const other = forKey() !== state.me.key;

  let status;
  if (existing && state.dirty) status = 'Ke ndryshime të paruajtura.';
  else if (existing) status = `Ruajtur, ${lek(existing.total)}${existing.editedBy ? `. Ndryshuar nga ${esc(existing.editedBy)}` : ''}.`;
  else status = other ? 'Ende pa porosi për këtë ditë.' : 'Ende s’ke porositur për këtë ditë.';

  let html = '';
  if (isAdmin()) {
    const names = new Map();
    state.users.forEach((u) => names.set(u.key, u.username));
    state.orders.forEach((o) => names.set(o.key, o.name));
    html += `
      <label class="field for-field">
        <span>Porosia për</span>
        <input id="forName" list="forNames" maxlength="30" value="${esc(state.forName)}" autocomplete="off" />
        <datalist id="forNames">${[...names.values()].map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      </label>`;
    if (other) html += `<button type="button" class="link small" data-act="mine">Kthehu te porosia ime</button>`;
  }
  html += `
    <div class="status-row">
      <p class="status ${existing && !state.dirty ? 'ok' : ''}">${status}</p>
      ${existing ? `<button type="button" class="btn btn-danger btn-sm ${state.confirmDelete ? 'confirm' : ''}" data-act="delete">${state.confirmDelete ? 'Po, fshije' : 'Fshi porosinë'}</button>` : ''}
    </div>`;

  // don't redraw while the admin types a name
  if (document.activeElement?.id !== 'forName') $('#forWho').innerHTML = html;
  $('#orderOwner').textContent = isAdmin() ? '' : `për ${state.me.username}`;
}

function renderPilaf() {
  const d = state.draft;
  const rows = d.pilafs
    .map((p, i) => {
      const sizes = Object.entries(PILAF_SIZES)
        .map(
          ([key, s]) => `
          <button type="button" class="size-btn ${p.size === key ? 'active' : ''}" data-act="size" data-i="${i}" data-size="${key}" aria-pressed="${p.size === key}">
            <span>${esc(s.label)}</span><small>${lek(s.price)}</small>
          </button>`
        )
        .join('');
      return `
        <div class="pilaf-row">
          <div class="sizes">${sizes}</div>
          <div class="row-bottom">
            <span class="label">Qebapa sipër</span>
            ${stepper('pq', p.q, 0, MAX_QEBAP_ON_PILAF, `data-i="${i}"`)}
            <span class="price">${lek(itemPrice({ t: 'pilaf', ...p }))}</span>
            <button type="button" class="remove-btn" data-act="remove-pilaf" data-i="${i}" aria-label="Hiq këtë pilaf">✕</button>
          </div>
        </div>`;
    })
    .join('');

  $('#pilafBuilder').innerHTML = `
    <div class="pilaf-head">
      <h3>Pilaf me qebapa</h3>
      <small>${lek(QEBAP_PRICE)} qebapi</small>
    </div>
    ${rows}
    <button type="button" class="btn-dashed" data-act="add-pilaf">+ Shto pilaf</button>`;
}

const fold = (s) => s.toLocaleLowerCase('sq').normalize('NFD').replace(/[̀-ͯ]/g, '');

function dishRow(it) {
  const isQebap = it.id === 'qebap';
  const n = isQebap ? state.draft.qebap : state.draft.n[it.id] || 0;
  const max = isQebap ? MAX_QEBAP_ALONE : MAX_QTY;
  const sub = [it.en, it.note].filter(Boolean).join(', ');
  const control =
    n > 0
      ? stepper('dish', n, 0, max, `data-id="${it.id}"`)
      : `<button type="button" class="add-btn" data-act="dish" data-d="1" data-id="${it.id}" aria-label="Shto ${esc(it.label)}">+</button>`;
  return `
    <div class="dish ${n > 0 ? 'picked' : ''}" id="dish-${it.id}">
      <div class="dish-text">
        <div class="dish-line">
          <span class="dish-name">${esc(it.label)}</span>
          <span class="leader" aria-hidden="true"></span>
          <span class="dish-price">${lek(it.price)}</span>
        </div>
        ${sub ? `<div class="dish-sub">${esc(sub)}</div>` : ''}
      </div>
      ${control}
    </div>`;
}

// How many different dishes of a category are in the current order
const pickedIn = (c) => c.items.filter((it) => (it.id === 'qebap' ? state.draft.qebap : state.draft.n[it.id])).length;

// Open the sections that already have something picked (when an order is loaded)
function openPicked() {
  for (const c of MENU) if (pickedIn(c)) state.open.add(c.id);
}

function catHead(c, open) {
  const picked = pickedIn(c);
  return `
    <button type="button" class="cat-toggle" data-cat="${c.id}" aria-expanded="${open}" aria-controls="cat-body-${c.id}">
      <span class="cat-title slab">${esc(c.title)}</span>
      <span class="cat-count">${picked ? `<b>${picked} në porosi</b>` : `${c.items.length} pjata`}</span>
      <span class="chev" aria-hidden="true"></span>
    </button>`;
}

function renderMenu() {
  const q = fold(state.search.trim());
  const match = (it) => !q || fold(`${it.label} ${it.en} ${it.note || ''}`).includes(q);
  const cats = MENU.map((c) => ({ ...c, shown: c.items.filter(match) })).filter((c) => c.shown.length);

  $('#menuList').innerHTML = cats.length
    ? cats
        .map((c) => {
          const open = !!q || state.open.has(c.id); // while searching, every matching section is open
          return `
        <section class="cat ${open ? 'open' : ''}" id="cat-${c.id}">
          ${catHead(c, open)}
          <div class="cat-body" id="cat-body-${c.id}" ${open ? '' : 'hidden'}>
            ${c.shown.map(dishRow).join('')}
          </div>
        </section>`;
        })
        .join('')
    : `<p class="empty">Asgjë me “${esc(state.search)}”. Provo një fjalë tjetër.</p>`;
}

function renderCart() {
  const items = draftToItems(state.draft);
  const total = orderTotal(items);
  const existing = findOrder(forKey());
  const show = state.view === 'day' && (items.length > 0 || !!existing);
  $('#cartBar').classList.toggle('hidden', !show);
  if (!show) return;

  const other = forKey() !== state.me.key;
  $('#cartWho').textContent = other ? `Për ${state.forName.trim()}` : 'Porosia jote';
  $('#cartSummary').textContent = items.length ? describeOrder(items) : 'Bosh';
  $('#cartTotal').textContent = lek(total);
  const btn = $('#saveBtn');
  btn.disabled = !items.length || state.saving || (existing && !state.dirty);
  btn.textContent = state.saving ? 'Duke ruajtur…' : existing ? (state.dirty ? 'Ruaj ndryshimet' : 'E ruajtur') : 'Ruaj porosinë';
}

function renderForm() {
  renderForWho();
  renderPilaf();
  renderMenu();
  renderCart();
}

// after a +/- on one dish: only redraw that row, its section header and the bar
function refreshDish(id) {
  const row = document.getElementById(`dish-${id}`);
  if (row) row.outerHTML = dishRow(ITEMS[id]);
  const c = MENU.find((x) => x.id === ITEMS[id].cat);
  const head = document.querySelector(`#cat-${c.id} .cat-toggle`);
  if (head) head.outerHTML = catHead(c, head.getAttribute('aria-expanded') === 'true');
  renderForWho();
  renderCart();
}

// ============================================================
// Render: day (orders, restaurant text, payments)
// ============================================================
function renderDay() {
  const rel = relativeDay(state.date);
  $('#dateRel').textContent = rel;
  $('#dateRel').classList.toggle('hidden', !rel);
  $('#dateText').textContent = formatDate(state.date);
  $('#dateInput').value = state.date;
  $('#todayBtn').classList.toggle('hidden', state.date === today());

  renderForm();

  const orders = state.orders;
  $('#ordersCount').textContent = orders.length;
  $('#ordersList').innerHTML = orders.length
    ? orders
        .map(
          (o) => `
        <div class="order ${forKey() === o.key ? 'current' : ''}">
          <div class="order-main">
            <div class="order-name">${esc(o.name)}${isMe(o.key) ? '<span class="you">ti</span>' : ''}</div>
            <div class="order-items">${esc(describeOrder(o.items))}</div>
          </div>
          <div class="order-side">
            <span class="price">${lek(o.total)}</span>
            ${canEdit(o) ? `<button class="link small" data-edit="${esc(o.name)}">Ndrysho</button>` : ''}
          </div>
        </div>`
        )
        .join('')
    : '<p class="empty">Ende s’ka porosi për këtë ditë. Bëhu i pari.</p>';

  const text = buildRestaurantText(orders);
  $('#restaurantText').textContent = text || 'Teksti del këtu kur dikush porosit.';
  $('#restaurantText').classList.toggle('is-empty', !text);
  $('#copyRestaurant').disabled = !text;
  const wa = $('#whatsappRestaurant');
  wa.href = text ? `https://wa.me/?text=${encodeURIComponent(text)}` : '#';
  wa.classList.toggle('hidden', !text);

  const total = orders.reduce((s, o) => s + o.total, 0);
  $('#payments').innerHTML = orders.length
    ? orders.map((o) => `<div class="pay-row"><span>${esc(o.name)}</span><span class="leader"></span><b>${lek(o.total)}</b></div>`).join('') +
      `<div class="pay-total"><span>Totali, ${orders.length} veta</span><span>${lek(total)}</span></div>`
    : '<p class="empty">Asnjë pagesë ende.</p>';
  $('#copyPayments').disabled = !orders.length;
}

// ============================================================
// Render: leaderboard
// ============================================================
function periodTitle(d) {
  if (d.period === 'month') {
    const m = new Date(d.from + 'T12:00:00Z');
    const name = MONTHS[m.getUTCMonth()];
    return `${name[0].toUpperCase()}${name.slice(1)} ${m.getUTCFullYear()}`;
  }
  const a = new Date(d.from + 'T12:00:00Z');
  const b = new Date(d.to + 'T12:00:00Z');
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return `${a.getUTCDate()}${sameMonth ? '' : ' ' + MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

async function renderBoard() {
  $$('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === state.period));
  $('[data-poff="1"]').disabled = state.poff >= 0;
  const box = $('#board');
  box.innerHTML = '<p class="empty">Duke numëruar qebapat…</p>';
  try {
    const d = await api(`/api/leaderboard?period=${state.period}&offset=${state.poff}`);
    if (d.period !== state.period || d.offset !== state.poff) return;
    $('#periodText').textContent = periodTitle(d);
    if (!d.rows.length) {
      box.innerHTML = `<p class="empty">Askush s’ka porositur ${state.period === 'week' ? 'këtë javë' : 'këtë muaj'}. Fronti është bosh.</p>`;
      return;
    }
    const max = Math.max(1, ...d.rows.map((r) => r.qebapa));
    const per = max <= 16 ? 1 : Math.ceil(max / 16); // one drawn piece = "per" qebapa (max 16 pieces fit on a phone)
    let place = 0;
    let prev = null;
    box.innerHTML =
      `<p class="board-sum">${d.totalQebapa} qebapa në ${d.days} ditë${per > 1 ? `. Një copë në hell = ${per} qebapa.` : '.'}</p>` +
      d.rows
        .map((r, i) => {
          if (r.qebapa !== prev) place = i + 1;
          prev = r.qebapa;
          const pieces = Math.ceil(r.qebapa / per);
          const king = place === 1 && r.qebapa > 0;
          return `
          <div class="rank-row ${king ? 'king' : ''} ${isMe(r.key) ? 'me-row' : ''}">
            <div class="rank-place">${king ? '<svg class="crown" aria-label="I pari"><use href="#crown"/></svg>' : place}</div>
            <div class="rank-body">
              <div class="rank-name">${esc(r.name)}${isMe(r.key) ? '<span class="you">ti</span>' : ''}</div>
              <div class="skewer" aria-hidden="true">
                <span class="stick"></span>
                ${Array.from({ length: pieces }, () => '<span class="piece"></span>').join('')}
              </div>
              <div class="rank-meta">${r.orders} porosi, ${lek(r.spent)}${r.favorite ? `, më shpesh ${esc(r.favorite)}` : ''}</div>
            </div>
            <div class="rank-score"><b>${r.qebapa}</b><small>qebapa</small></div>
          </div>`;
        })
        .join('');
  } catch (e) {
    if (e.message !== '401') box.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
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
      list.innerHTML = '<p class="empty">Ende s’ka histori. Ditët shfaqen këtu pasi të porositni.</p>';
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
              <div class="history-date">${rel ? `<b>${rel}</b>, ` : ''}${formatDate(d.date)}</div>
              <div class="history-names">${d.people} veta: ${esc(d.names.join(', '))}</div>
            </div>
            <span class="history-total">${lek(d.total)}</span>
          </button>`;
        })
        .join('') + `<div class="pay-total"><span>Gjithsej, ${days.length} ditë</span><span>${lek(grand)}</span></div>`;
  } catch (e) {
    if (e.message !== '401') list.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

// ============================================================
// Render: account + admin users
// ============================================================
async function loadUsers() {
  if (!isAdmin()) return;
  try {
    state.users = (await api('/api/users')).users;
  } catch {}
}

function renderUsers() {
  $('#usersList').innerHTML = state.users
    .map(
      (u) => `
      <div class="user-row" data-user="${esc(u.username)}">
        <div class="user-main">
          <div class="order-name">${esc(u.username)}${u.admin ? '<span class="pill">admin</span>' : ''}${isMe(u.key) ? '<span class="you">ti</span>' : ''}</div>
          <div class="user-actions">
            ${
              isMe(u.key) || u.fixedAdmin
                ? ''
                : `<button class="link small" data-uact="admin">${u.admin ? 'Hiq admin' : 'Bëje admin'}</button>`
            }
            <button class="link small" data-uact="pw">Fjalëkalim i ri</button>
            ${isMe(u.key) || u.fixedAdmin ? '' : `<button class="link small danger" data-uact="del">Fshi</button>`}
          </div>
          <form class="pw-inline hidden">
            <input type="text" minlength="6" placeholder="Fjalëkalimi i ri" autocomplete="off" aria-label="Fjalëkalimi i ri për ${esc(u.username)}" />
            <button class="btn btn-ink btn-sm" type="submit">Vendos</button>
          </form>
        </div>
      </div>`
    )
    .join('');
}

async function renderAccount() {
  $('#accName').textContent = state.me.username;
  $('#adminBlock').classList.toggle('hidden', !isAdmin());
  if (isAdmin()) {
    $('#usersList').innerHTML = '<p class="empty">Duke ngarkuar…</p>';
    await loadUsers();
    renderUsers();
  }
}

// ============================================================
// Views, login, logout
// ============================================================
function setView(view) {
  state.view = view;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  for (const v of ['day', 'board', 'history', 'account']) $(`#view-${v}`).classList.toggle('hidden', v !== view);
  if (view === 'board') renderBoard();
  if (view === 'history') renderHistory();
  if (view === 'account') renderAccount();
  renderCart();
  window.scrollTo(0, 0);
}

async function goToDate(date) {
  state.date = date;
  state.orders = [];
  loadDraftFor(state.forName || state.me.username);
  renderDay();
  try { await loadDay({ resetDraft: true }); } catch (e) { if (e.message !== '401') toast(e.message, true); }
}

async function enterApp(user) {
  state.me = user;
  state.forName = user.username;
  $('#meName').textContent = user.username;
  $('#meBadge').classList.toggle('hidden', !user.admin);
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  setView('day');
  await Promise.all([loadDay({ resetDraft: true }), loadUsers()]);
  renderForWho();
}

function showLogin(message = '') {
  state.token = '';
  state.me = null;
  storage.del('porosite_token');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  setAuthMode(state.authMode);
  $('#authError').textContent = message;
  $('#authError').classList.toggle('hidden', !message);
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$('[data-auth]').forEach((b) => b.classList.toggle('active', b.dataset.auth === mode));
  $$('.register-only').forEach((el) => el.classList.toggle('hidden', mode !== 'register'));
  $('#authPass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = mode === 'register' ? 'Krijo llogarinë' : 'Hyr';
  $('#authError').classList.add('hidden');
}

$$('[data-auth]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#authUser').value.trim().replace(/\s+/g, ' ');
  const password = $('#authPass').value;
  const register = state.authMode === 'register';
  const err = (m) => { $('#authError').textContent = m; $('#authError').classList.remove('hidden'); };
  if (!username || !password) return err('Shkruaj emrin dhe fjalëkalimin.');
  if (register && password.length < 6) return err('Fjalëkalimi duhet të ketë të paktën 6 shenja.');
  if (register && !$('#authCode').value) return err('Shkruaj kodin e grupit.');

  const btn = $('#authSubmit');
  btn.disabled = true;
  try {
    const body = register
      ? { action: 'register', username, password, groupCode: $('#authCode').value }
      : { action: 'login', username, password };
    const data = await api('/api/auth', { method: 'POST', body: JSON.stringify(body) });
    state.token = data.token;
    storage.set('porosite_token', data.token);
    $('#authPass').value = '';
    $('#authCode').value = '';
    await enterApp(data.user);
    if (register) toast(`Mirë se erdhe, ${data.user.username}`);
  } catch (ex) {
    err(ex.message);
  } finally {
    btn.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); } catch {}
  showLogin();
});

$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'password', oldPassword: $('#pwOld').value, newPassword: $('#pwNew').value }),
    });
    state.token = data.token;
    storage.set('porosite_token', data.token);
    $('#pwOld').value = '';
    $('#pwNew').value = '';
    toast('Fjalëkalimi u ndryshua. Telefonat e tjerë u nxorën nga llogaria.');
  } catch (ex) {
    if (ex.message !== '401') toast(ex.message, true);
  }
});

// ============================================================
// Events
// ============================================================
$$('[data-view]').forEach((t) =>
  t.addEventListener('click', (e) => {
    e.preventDefault();
    setView(t.dataset.view);
  })
);

$$('[data-shift]').forEach((b) => b.addEventListener('click', () => goToDate(shiftDate(state.date, Number(b.dataset.shift)))));
$('#dateInput').addEventListener('change', (e) => e.target.value && goToDate(e.target.value));
$('#todayBtn').addEventListener('click', () => goToDate(today()));

// Admin: "Porosia për" field
$('#forWho').addEventListener('change', (e) => {
  if (e.target.id !== 'forName') return;
  const name = e.target.value.trim().replace(/\s+/g, ' ');
  e.target.blur();
  if (!name) { loadDraftFor(state.me.username); renderForm(); return; }
  // Nothing picked yet -> show this person's saved order. If dishes were already picked, keep them.
  if (!state.dirty) { loadDraftFor(name); openPicked(); }
  else state.forName = name;
  renderForm();
  renderDay();
});

async function onFormClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const d = state.draft;
  const i = Number(btn.dataset.i);
  const delta = Number(btn.dataset.d);
  const act = btn.dataset.act;

  if (act === 'delete') return deleteOrder();
  if (act === 'mine') { loadDraftFor(state.me.username); renderDay(); return; }

  if (act === 'dish') {
    const id = btn.dataset.id;
    if (id === 'qebap') d.qebap = Math.min(MAX_QEBAP_ALONE, Math.max(0, d.qebap + delta));
    else d.n[id] = Math.min(MAX_QTY, Math.max(0, (d.n[id] || 0) + delta));
    state.dirty = true;
    state.confirmDelete = false;
    refreshDish(id);
    document.querySelector(`#dish-${id} [data-act="dish"][data-d="${delta}"]`)?.focus({ preventScroll: true });
    return;
  }

  if (act === 'add-pilaf') d.pilafs.push({ size: 'dopjo', q: 0 });
  else if (act === 'remove-pilaf') d.pilafs.splice(i, 1);
  else if (act === 'size') d.pilafs[i].size = btn.dataset.size;
  else if (act === 'pq') d.pilafs[i].q = Math.min(MAX_QEBAP_ON_PILAF, Math.max(0, d.pilafs[i].q + delta));
  else return;
  state.dirty = true;
  state.confirmDelete = false;
  renderForWho();
  renderPilaf();
  renderCart();
}
$('#forWho').addEventListener('click', onFormClick);
$('#pilafBuilder').addEventListener('click', onFormClick);
$('#menuList').addEventListener('click', onFormClick);

$('#menuSearch').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderMenu();
});

// Open / close a menu section
$('#menuList').addEventListener('click', (e) => {
  const head = e.target.closest('.cat-toggle');
  if (!head) return;
  const id = head.dataset.cat;
  const section = document.getElementById(`cat-${id}`);
  const open = head.getAttribute('aria-expanded') !== 'true';
  if (open) state.open.add(id);
  else state.open.delete(id);
  head.setAttribute('aria-expanded', open);
  section.classList.toggle('open', open);
  section.querySelector('.cat-body').hidden = !open;
});

$('#saveBtn').addEventListener('click', saveOrder);

async function saveOrder() {
  const name = (state.forName || state.me.username).trim();
  state.saving = true;
  renderCart();
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ date: state.date, name, items: draftToItems(state.draft) }),
    });
    state.dirty = false;
    await loadDay();
    toast(forKey() === state.me.key ? 'Porosia u ruajt' : `Porosia e ${name} u ruajt`);
  } catch (e) {
    if (e.message !== '401') toast(e.message, true);
  } finally {
    state.saving = false;
    renderCart();
  }
}

let confirmTimer;
async function deleteOrder() {
  if (!state.confirmDelete) {
    state.confirmDelete = true;
    renderForWho();
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => { state.confirmDelete = false; renderForWho(); }, 3500);
    return;
  }
  clearTimeout(confirmTimer);
  const name = (state.forName || state.me.username).trim();
  try {
    await api(`/api/orders?date=${state.date}&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    state.dirty = false;
    await loadDay({ resetDraft: true });
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
  openPicked();
  renderDay();
  $('#view-day .block').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#copyRestaurant').addEventListener('click', () => copyText(buildRestaurantText(state.orders)));
$('#copyPayments').addEventListener('click', () =>
  copyText(`Pagesat, ${formatDate(state.date)}\n\n${buildPaymentsText(state.orders)}`)
);

// Leaderboard controls
$$('[data-period]').forEach((b) =>
  b.addEventListener('click', () => {
    state.period = b.dataset.period;
    state.poff = 0;
    renderBoard();
  })
);
$$('[data-poff]').forEach((b) =>
  b.addEventListener('click', () => {
    state.poff = Math.min(0, state.poff + Number(b.dataset.poff));
    renderBoard();
  })
);

// Click a day in history -> open it
$('#historyList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-date]');
  if (!row) return;
  setView('day');
  goToDate(row.dataset.date);
});

// Admin: user actions
const confirmDel = new Set();
$('#usersList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-uact]');
  if (!btn) return;
  const row = btn.closest('[data-user]');
  const user = row.dataset.user;
  const u = state.users.find((x) => x.username === user);
  try {
    if (btn.dataset.uact === 'pw') {
      row.querySelector('.pw-inline').classList.toggle('hidden');
      row.querySelector('.pw-inline input').focus();
      return;
    }
    if (btn.dataset.uact === 'admin') {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'admin', user, value: !u.admin }) });
      toast(u.admin ? `${user} nuk është më admin` : `${user} tani është admin`);
    }
    if (btn.dataset.uact === 'del') {
      if (!confirmDel.has(user)) {
        confirmDel.add(user);
        btn.textContent = 'Po, fshije llogarinë';
        setTimeout(() => { confirmDel.delete(user); if (btn.isConnected) btn.textContent = 'Fshi'; }, 3500);
        return;
      }
      confirmDel.delete(user);
      await api(`/api/users?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
      toast(`Llogaria e ${user} u fshi. Porositë e vjetra mbeten.`);
    }
    await loadUsers();
    renderUsers();
  } catch (ex) {
    if (ex.message !== '401') toast(ex.message, true);
  }
});

$('#usersList').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.closest('.pw-inline');
  const user = form.closest('[data-user]').dataset.user;
  const password = form.querySelector('input').value;
  try {
    await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'password', user, password }) });
    form.reset();
    form.classList.add('hidden');
    toast(`Fjalëkalimi i ${user} u ndryshua. Jepja atij.`);
  } catch (ex) {
    if (ex.message !== '401') toast(ex.message, true);
  }
});

// Refresh orders every 15s so you see your friends' orders live
const refresh = () => {
  if (state.me && state.view === 'day' && document.visibilityState === 'visible' && !state.saving) loadDay().catch(() => {});
};
setInterval(refresh, 15000);
document.addEventListener('visibilitychange', refresh);

// ============================================================
// Start
// ============================================================
(async function start() {
  // the old app saved the group password on the phone; it's not needed anymore
  storage.del('porosite_fjalekalimi');
  if (!state.token) {
    const old = storage.get('porosite_emri');
    if (old) $('#authUser').value = old;
    return showLogin();
  }
  try {
    const { user } = await api('/api/auth');
    await enterApp(user);
  } catch (e) {
    if (e.message !== '401') showLogin(e.message);
    else showLogin('Hyr përsëri në llogari.');
  }
})();
