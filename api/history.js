// /api/history  -> last 90 days that have orders, newest first
import { send, getStore, requireMethod, requireUser } from './_db.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET'])) return;
  const store = getStore(res);
  if (!store) return;

  try {
    if (!(await requireUser(req, res, store))) return;
    const days = await store.history(90);
    const result = days
      .filter((d) => d.orders.length)
      .map((d) => ({
        date: d.date,
        people: d.orders.length,
        names: d.orders.map((o) => o.name),
        total: d.orders.reduce((s, o) => s + o.total, 0),
      }));
    return send(res, 200, { days: result });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
