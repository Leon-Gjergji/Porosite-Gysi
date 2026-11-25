// /api/auth
//   GET                                                -> who am I
//   POST { action: 'register', username, password, groupCode }
//   POST { action: 'login', username, password }
//   POST { action: 'logout' }
//   POST { action: 'password', oldPassword, newPassword }
import {
  send,
  readBody,
  getStore,
  requireMethod,
  requireUser,
  newSession,
  endSession,
  cleanUsername,
  nameKey,
  validPassword,
  hashPassword,
  checkPassword,
  safeEqual,
  publicUser,
  MAX_FAILS,
} from './_db.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const store = getStore(res);
  if (!store) return;

  try {
    if (req.method === 'GET') {
      const user = await requireUser(req, res, store);
      if (!user) return;
      return send(res, 200, { user: publicUser(user) });
    }

    const body = readBody(req);

    if (body.action === 'register') {
      const groupCode = process.env.GROUP_PASSWORD;
      if (!groupCode) return send(res, 500, { error: 'GROUP_PASSWORD nuk është vendosur te Vercel (Environment Variables).' });
      if (!safeEqual(body.groupCode || '', groupCode)) return send(res, 403, { error: 'Kodi i grupit është i gabuar.' });

      const username = cleanUsername(body.username);
      if (!username) {
        return send(res, 400, { error: 'Emri: 2–20 shkronja, numra, hapësirë, pikë, _ ose -.' });
      }
      if (!validPassword(body.password)) return send(res, 400, { error: 'Fjalëkalimi duhet të ketë të paktën 6 shenja.' });

      const key = nameKey(username);
      const user = {
        username,
        pass: await hashPassword(body.password),
        role: 'user',
        pwv: 0,
        createdAt: Date.now(),
      };
      if (!(await store.createUser(key, user))) {
        return send(res, 409, { error: 'Ky emër është i zënë. Zgjidh një tjetër.' });
      }
      const token = await newSession(store, { ...user, key });
      return send(res, 201, { token, user: publicUser({ ...user, key }) });
    }

    if (body.action === 'login') {
      const username = typeof body.username === 'string' ? body.username : '';
      const key = nameKey(username);
      if (!key || typeof body.password !== 'string') return send(res, 400, { error: 'Shkruaj emrin dhe fjalëkalimin.' });

      if ((await store.fails(key)) >= MAX_FAILS) {
        return send(res, 429, { error: 'Shumë përpjekje të gabuara. Provo përsëri pas 15 minutash.' });
      }
      const user = await store.getUser(key);
      if (!user || !(await checkPassword(body.password, user.pass))) {
        await store.addFail(key);
        return send(res, 401, { error: 'Emri ose fjalëkalimi është i gabuar.' });
      }
      await store.clearFails(key);
      const token = await newSession(store, user);
      return send(res, 200, { token, user: publicUser(user) });
    }

    if (body.action === 'logout') {
      await endSession(req, store);
      return send(res, 200, { ok: true });
    }

    if (body.action === 'password') {
      const user = await requireUser(req, res, store);
      if (!user) return;
      if (!(await checkPassword(body.oldPassword || '', user.pass))) {
        return send(res, 400, { error: 'Fjalëkalimi i tanishëm është i gabuar.' });
      }
      if (!validPassword(body.newPassword)) return send(res, 400, { error: 'Fjalëkalimi i ri duhet të ketë të paktën 6 shenja.' });
      user.pass = await hashPassword(body.newPassword);
      user.pwv = (user.pwv || 0) + 1; // logs out other phones
      await store.saveUser(user.key, user);
      const token = await newSession(store, user);
      return send(res, 200, { token });
    }

    return send(res, 400, { error: 'Veprim i panjohur' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Gabim në server' });
  }
}
