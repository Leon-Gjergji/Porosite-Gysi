// /api/leaderboard?period=week|month&offset=0
//   offset 0 = this week/month, -1 = the one before, ...
// Ranks people by how many qebapa they ate (pilaf + qebapa and only-qebapa).
import { send, getStore, requireMethod, requireUser, todayTirane } from './_db.js';
import { qebapCount, itemLabel } from '../menu.js';

const toDate = (d) => d.toISOString().slice(0, 10);
const utc = (s) => new Date(s + 'T12:00:00Z');

export function periodRange(period, offset, today) {
  const t = utc(today);
  if (period === 'month') {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1, 12));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12));
    return { from: toDate(first), to: toDate(last) };
  }
  // week = Monday … Sunday
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: toDate(monday), to: toDate(sunday) };
}

export function rank(days) {
  const people = new Map();
  for (const day of days) {
    for (const o of day.orders) {
      const p =
        people.get(o.key) ||
        { key: o.key, name: o.name, qebapa: 0, orders: 0, spent: 0, dishes: new Map(), last: '' };
      p.qebapa += qebapCount(o.items);
      p.orders += 1;
      p.spent += o.total || 0;
      if (day.date >= p.last) { p.last = day.date; p.name = o.name; }
      for (const it of o.items || []) {
        const label = it.t === 'pilaf' ? 'Pilaf' : it.t === 'qebap' ? 'Qebapa' : itemLabel(it.t);
        p.dishes.set(label, (p.dishes.get(label) || 0) + (it.n || 1));
      }
      people.set(o.key, p);
    }
  }
  return [...people.values()]
    .map(({ dishes, last, ...p }) => ({
      ...p,
      favorite: [...dishes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }))
    .sort((a, b) => b.qebapa - a.qebapa || b.orders - a.orders || a.name.localeCompare(b.name, 'sq'));
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET'])) return;
  const store = getStore(res);
  if (!store) return;

  try {
    if (!(await requireUser(req, res, store))) return;
    const period = req.query.period === 'month' ? 'month' : 'week';
    const offset = Math.max(-120, Math.min(0, Number.parseInt(req.query.offset, 10) || 0));
    const { from, to } = periodRange(period, offset, todayTirane());
    const days = await store.range(from, to);
    const rows = rank(days);
    return send(res, 200, {
      period,
      offset,
      from,
      to,
      days: days.filter((d) => d.orders.length).length,
      totalQebapa: rows.reduce((s, r) => s + r.qebapa, 0),
      rows,
    });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
