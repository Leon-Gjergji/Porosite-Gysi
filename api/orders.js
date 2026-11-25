// /api/orders
//   GET    ?date=YYYY-MM-DD                 -> all orders of that day
//   POST   { date, items, name? }           -> create / update an order
//   DELETE ?date=YYYY-MM-DD&name=X          -> delete an order
// Everyone can only save / delete their OWN order.
// Admins can save / delete anyone's order (also for friends without an account: send "name").
import { send, readBody, getStore, requireMethod, requireUser, isAdmin, cleanName, nameKey } from './_db.js';
import { cleanItems, orderTotal, isValidDate } from '../menu.js';

// Whose order is this request about? Returns { key, name } or sends 403.
async function target(store, me, rawName, res) {
  if (rawName == null || rawName === '' || nameKey(String(rawName)) === me.key) {
    return { key: me.key, name: me.username };
  }
  if (!isAdmin(me)) {
    send(res, 403, { error: 'Mund të ndryshosh vetëm porosinë tënde.' });
    return null;
  }
  const name = cleanName(rawName);
  if (!name) {
    send(res, 400, { error: 'Shkruaj emrin (max 30 shkronja)' });
    return null;
  }
  const key = nameKey(name);
  const account = await store.getUser(key);
  return { key, name: account ? account.username : name };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  const store = getStore(res);
  if (!store) return;

  try {
    const me = await requireUser(req, res, store);
    if (!me) return;

    if (req.method === 'GET') {
      const { date } = req.query;
      if (!isValidDate(date)) return send(res, 400, { error: 'Data e gabuar' });
      return send(res, 200, { orders: await store.getDay(date) });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const { date } = body;
      if (!isValidDate(date)) return send(res, 400, { error: 'Data e gabuar' });
      const items = cleanItems(body.items);
      if (!items) return send(res, 400, { error: 'Porosia është bosh ose e gabuar' });

      const who = await target(store, me, body.name, res);
      if (!who) return;

      const old = await store.getOne(date, who.key);
      const now = Date.now();
      const order = {
        name: who.name,
        items,
        total: orderTotal(items), // price saved at order time, so history stays correct
        createdAt: old?.createdAt || now,
        updatedAt: now,
        ...(who.key !== me.key ? { editedBy: me.username } : {}),
      };
      await store.save(date, who.key, order);
      return send(res, 200, { order: { ...order, key: who.key } });
    }

    // DELETE
    const { date } = req.query;
    if (!isValidDate(date)) return send(res, 400, { error: 'Data e gabuar' });
    const who = await target(store, me, req.query.name, res);
    if (!who) return;
    await store.remove(date, who.key);
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
