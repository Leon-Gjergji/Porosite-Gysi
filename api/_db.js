// Database + accounts helpers. Files starting with "_" are NOT public API routes on Vercel.
import { Redis } from '@upstash/redis';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const PREFIX = 'porosite';
const dayKey = (date) => `${PREFIX}:day:${date}`;
const DAYS_KEY = `${PREFIX}:days`;
const USERS_KEY = `${PREFIX}:users`;
const sessionKey = (hash) => `${PREFIX}:session:${hash}`;
const failKey = (user) => `${PREFIX}:fail:${user}`;
const dateScore = (date) => Number(date.replaceAll('-', '')); // 2026-11-17 -> 20261117

export const SESSION_DAYS = 60;
const SESSION_TTL = SESSION_DAYS * 24 * 3600;
const FAIL_TTL = 15 * 60; // 15 minutes
export const MAX_FAILS = 8;

export function send(res, status, data) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(data);
}

export function readBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return req.body || {};
}

// ---------- Names ----------
// Order names (also guests the admin adds): 1–30 characters.
export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= 30 ? n : null;
}
export const nameKey = (name) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('sq');

// Usernames: 2–20 characters, letters (also ë, ç), numbers, space . _ -
export function cleanUsername(name) {
  const n = cleanName(name);
  if (!n || n.length < 2 || n.length > 20) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n) ? n : null;
}

export function validPassword(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 100;
}

// ---------- Hashing ----------
const sha = (s) => createHash('sha256').update(String(s)).digest();
const shaHex = (s) => createHash('sha256').update(String(s)).digest('hex');

export function safeEqual(a, b) {
  return timingSafeEqual(sha(a), sha(b));
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export async function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = await scrypt(String(password), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return want.length === got.length && timingSafeEqual(got, want);
}

// ---------- Admins ----------
// ADMIN_USERNAMES in Vercel = comma-separated usernames that are always admin (e.g. "Leon,Atida").
// Admins can also make other users admin from the app.
const envAdmins = () =>
  (process.env.ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(nameKey);

export const isEnvAdmin = (key) => envAdmins().includes(key);
export const isAdmin = (user) => !!user && (user.role === 'admin' || isEnvAdmin(user.key));

export const publicUser = (user) => ({
  key: user.key,
  username: user.username,
  admin: isAdmin(user),
  fixedAdmin: isEnvAdmin(user.key), // admin from Vercel settings, can't be removed in the app
  createdAt: user.createdAt,
});

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const byTime = (a, b) => a.createdAt - b.createdAt;
const withKeys = (h) =>
  Object.entries(h || {})
    .map(([key, v]) => ({ ...parse(v), key }))
    .sort(byTime);

// ---------- Redis (Upstash) storage ----------
function redisStore(redis) {
  return {
    // orders
    async getDay(date) {
      return withKeys(await redis.hgetall(dayKey(date)));
    },
    async getOne(date, key) {
      const v = await redis.hget(dayKey(date), key);
      return v ? parse(v) : null;
    },
    async save(date, key, order) {
      await redis.hset(dayKey(date), { [key]: JSON.stringify(order) });
      await redis.zadd(DAYS_KEY, { score: dateScore(date), member: date });
    },
    async remove(date, key) {
      await redis.hdel(dayKey(date), key);
      if ((await redis.hlen(dayKey(date))) === 0) await redis.zrem(DAYS_KEY, date);
    },
    async daysWithOrders(dates) {
      if (!dates.length) return [];
      const p = redis.pipeline();
      dates.forEach((d) => p.hgetall(dayKey(d)));
      const days = await p.exec();
      return dates.map((date, i) => ({ date, orders: withKeys(days[i]) }));
    },
    async history(limit) {
      const dates = (await redis.zrange(DAYS_KEY, 0, limit - 1, { rev: true })).map(String);
      return this.daysWithOrders(dates);
    },
    async range(from, to) {
      const dates = (await redis.zrange(DAYS_KEY, dateScore(from), dateScore(to), { byScore: true })).map(String);
      return this.daysWithOrders(dates);
    },

    // users
    async getUser(key) {
      const v = await redis.hget(USERS_KEY, key);
      return v ? { ...parse(v), key } : null;
    },
    async createUser(key, user) {
      // hsetnx = only if this username doesn't exist yet
      return (await redis.hsetnx(USERS_KEY, key, JSON.stringify(user))) === 1;
    },
    async saveUser(key, user) {
      const { key: _k, ...rest } = user;
      await redis.hset(USERS_KEY, { [key]: JSON.stringify(rest) });
    },
    async deleteUser(key) {
      await redis.hdel(USERS_KEY, key);
    },
    async listUsers() {
      return withKeys(await redis.hgetall(USERS_KEY));
    },

    // sessions
    async createSession(hash, data) {
      await redis.set(sessionKey(hash), JSON.stringify(data), { ex: SESSION_TTL });
    },
    async getSession(hash) {
      const v = await redis.get(sessionKey(hash));
      return v ? parse(v) : null;
    },
    async deleteSession(hash) {
      await redis.del(sessionKey(hash));
    },

    // failed logins
    async fails(key) {
      return Number((await redis.get(failKey(key))) || 0);
    },
    async addFail(key) {
      const n = await redis.incr(failKey(key));
      if (n === 1) await redis.expire(failKey(key), FAIL_TTL);
      return n;
    },
    async clearFails(key) {
      await redis.del(failKey(key));
    },
  };
}

// ---------- In-memory storage (only for testing on your own PC) ----------
const mem =
  globalThis.__porositeMem ||
  (globalThis.__porositeMem = { days: new Map(), users: new Map(), sessions: new Map(), fails: new Map() });
const dayList = (date) => [...(mem.days.get(date)?.entries() || [])].map(([key, o]) => ({ ...o, key })).sort(byTime);

const memoryStore = {
  async getDay(date) {
    return dayList(date);
  },
  async getOne(date, key) {
    return mem.days.get(date)?.get(key) || null;
  },
  async save(date, key, order) {
    if (!mem.days.has(date)) mem.days.set(date, new Map());
    mem.days.get(date).set(key, order);
  },
  async remove(date, key) {
    mem.days.get(date)?.delete(key);
    if (mem.days.get(date)?.size === 0) mem.days.delete(date);
  },
  async history(limit) {
    return [...mem.days.keys()].sort().reverse().slice(0, limit).map((date) => ({ date, orders: dayList(date) }));
  },
  async range(from, to) {
    return [...mem.days.keys()]
      .filter((d) => d >= from && d <= to)
      .sort()
      .map((date) => ({ date, orders: dayList(date) }));
  },
  async getUser(key) {
    const u = mem.users.get(key);
    return u ? { ...u, key } : null;
  },
  async createUser(key, user) {
    if (mem.users.has(key)) return false;
    mem.users.set(key, user);
    return true;
  },
  async saveUser(key, user) {
    const { key: _k, ...rest } = user;
    mem.users.set(key, rest);
  },
  async deleteUser(key) {
    mem.users.delete(key);
  },
  async listUsers() {
    return [...mem.users.entries()].map(([key, u]) => ({ ...u, key })).sort(byTime);
  },
  async createSession(hash, data) {
    mem.sessions.set(hash, data);
  },
  async getSession(hash) {
    return mem.sessions.get(hash) || null;
  },
  async deleteSession(hash) {
    mem.sessions.delete(hash);
  },
  async fails(key) {
    return mem.fails.get(key) || 0;
  },
  async addFail(key) {
    const n = (mem.fails.get(key) || 0) + 1;
    mem.fails.set(key, n);
    return n;
  },
  async clearFails(key) {
    mem.fails.delete(key);
  },
};

let store = null;
export function getStore(res) {
  if (store) return store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = redisStore(new Redis({ url, token }));
    return store;
  }
  const onVercel = ['production', 'preview'].includes(process.env.VERCEL_ENV);
  if (onVercel) {
    send(res, 500, { error: 'Databaza nuk është lidhur. Lidh Upstash Redis te Vercel → Storage.' });
    return null;
  }
  console.warn('[porosite] Nuk ka databazë, po përdor memorien (vetëm për test lokal).');
  store = memoryStore;
  return store;
}

// ---------- Sessions ----------
// The browser keeps a random token; the database only keeps its hash.
// "v" = password version: changing/resetting a password logs out all old sessions.
export async function newSession(store, user) {
  const token = randomBytes(32).toString('base64url');
  await store.createSession(shaHex(token), { u: user.key, v: user.pwv || 0 });
  return token;
}

const tokenOf = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

export async function endSession(req, store) {
  const token = tokenOf(req);
  if (token) await store.deleteSession(shaHex(token));
}

// Returns the logged-in user, or sends 401 and returns null.
export async function requireUser(req, res, store) {
  const token = tokenOf(req);
  const session = token ? await store.getSession(shaHex(token)) : null;
  const user = session ? await store.getUser(String(session.u)) : null;
  if (!user || (user.pwv || 0) !== (session.v || 0)) {
    send(res, 401, { error: 'Hyr përsëri në llogari.' });
    return null;
  }
  return user;
}

export function requireMethod(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  send(res, 405, { error: 'Metodë e palejuar' });
  return false;
}

// Today in Albania, YYYY-MM-DD
export const todayTirane = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane' }).format(new Date());
