// /api/users  (admin only)
//   GET                                              -> all accounts
//   POST { action: 'password', user, password }      -> set a new password for someone
//   POST { action: 'admin', user, value: true|false } -> make / remove admin
//   DELETE ?user=X                                   -> delete an account (their old orders stay)
import {
  send,
  readBody,
  getStore,
  requireMethod,
  requireUser,
  isAdmin,
  isEnvAdmin,
  publicUser,
  nameKey,
  validPassword,
  hashPassword,
} from './_db.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  const store = getStore(res);
  if (!store) return;

  try {
    const me = await requireUser(req, res, store);
    if (!me) return;
    if (!isAdmin(me)) return send(res, 403, { error: 'Vetëm admini mund ta bëjë këtë.' });

    if (req.method === 'GET') {
      const users = (await store.listUsers()).map(publicUser);
      return send(res, 200, { users });
    }

    const raw = req.method === 'DELETE' ? req.query.user : readBody(req).user;
    const key = typeof raw === 'string' ? nameKey(raw) : '';
    const user = key ? await store.getUser(key) : null;
    if (!user) return send(res, 404, { error: 'Ky përdorues nuk ekziston.' });

    if (req.method === 'DELETE') {
      if (key === me.key) return send(res, 400, { error: 'Nuk mund të fshish llogarinë tënde.' });
      if (isEnvAdmin(key)) return send(res, 400, { error: 'Ky admin është vendosur te Vercel (ADMIN_USERNAMES).' });
      await store.deleteUser(key);
      return send(res, 200, { ok: true });
    }

    const body = readBody(req);

    if (body.action === 'password') {
      if (!validPassword(body.password)) return send(res, 400, { error: 'Fjalëkalimi duhet të ketë të paktën 6 shenja.' });
      user.pass = await hashPassword(body.password);
      user.pwv = (user.pwv || 0) + 1; // logs them out everywhere
      await store.saveUser(key, user);
      return send(res, 200, { user: publicUser(user) });
    }

    if (body.action === 'admin') {
      if (key === me.key && !body.value) return send(res, 400, { error: 'Nuk mund ta heqësh veten nga admin.' });
      if (isEnvAdmin(key) && !body.value) {
        return send(res, 400, { error: 'Ky admin është vendosur te Vercel (ADMIN_USERNAMES).' });
      }
      user.role = body.value ? 'admin' : 'user';
      await store.saveUser(key, user);
      return send(res, 200, { user: publicUser(user) });
    }

    return send(res, 400, { error: 'Veprim i panjohur' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
