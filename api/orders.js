// /api/orders
//   GET    ?date=YYYY-MM-DD          -> all orders of that day
//   POST   { date, name, items }     -> create / update one person's order
//   DELETE ?date=YYYY-MM-DD&name=X   -> delete one person's order
import { send, checkAuth, getStore, cleanName, nameKey } from './_db.js';
import { cleanItems, orderTotal, isValidDate } from '../menu.js';

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const store = getStore(res);
  if (!store) return;

  try {
    if (req.method === 'GET') {
      const { date } = req.query;
      if (!isValidDate(date)) return send(res, 400, { error: 'Data e gabuar' });
      return send(res, 200, { orders: await store.getDay(date) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { date } = body;
      const name = cleanName(body.name);
      const items = cleanItems(body.items);
      if (!isValidDate(date)) return send(res, 400, { error: 'Data e gabuar' });
      if (!name) return send(res, 400, { error: 'Shkruaj emrin (max 30 shkronja)' });
      if (!items) return send(res, 400, { error: 'Porosia është bosh ose e gabuar' });

      const key = nameKey(name);
      const old = await store.getOne(date, key);
      const now = Date.now();
      const order = {
        name: old?.name || name, // keep the first spelling ("Ardi", not "ardi")
        items,
        total: orderTotal(items), // price saved at order time, so history stays correct
        createdAt: old?.createdAt || now,
        updatedAt: now,
      };
      await store.save(date, key, order);
      return send(res, 200, { order });
    }

    if (req.method === 'DELETE') {
      const { date } = req.query;
      const name = cleanName(req.query.name);
      if (!isValidDate(date) || !name) return send(res, 400, { error: 'Të dhëna të gabuara' });
      await store.remove(date, nameKey(name));
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'Metodë e palejuar' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
