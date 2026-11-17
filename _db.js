// Database + password helpers. Files starting with "_" are NOT public API routes on Vercel.
import { Redis } from '@upstash/redis';
import { createHash, timingSafeEqual } from 'node:crypto';

const PREFIX = 'porosite';
const dayKey = (date) => `${PREFIX}:day:${date}`;
const DAYS_KEY = `${PREFIX}:days`;
const dateScore = (date) => Number(date.replaceAll('-', '')); // 2026-11-17 -> 20261117

export function send(res, status, data) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(data);
}

// ---------- Password ----------
const sha = (s) => createHash('sha256').update(String(s)).digest();

export function checkAuth(req, res) {
  const expected = process.env.GROUP_PASSWORD;
  if (!expected) {
    send(res, 500, { error: 'GROUP_PASSWORD nuk është vendosur në Vercel (Environment Variables).' });
    return false;
  }
  const given = req.headers['x-group-password'] || '';
  if (!timingSafeEqual(sha(given), sha(expected))) {
    send(res, 401, { error: 'Fjalëkalimi i gabuar' });
    return false;
  }
  return true;
}

// ---------- Name -> key (so "Ardi" and " ardi " are the same person) ----------
export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= 30 ? n : null;
}
export const nameKey = (name) => name.toLocaleLowerCase('sq');

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const byTime = (a, b) => a.createdAt - b.createdAt;

// ---------- Redis (Upstash) storage ----------
function redisStore(redis) {
  return {
    async getDay(date) {
      const h = (await redis.hgetall(dayKey(date))) || {};
      return Object.values(h).map(parse).sort(byTime);
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
    async history(limit) {
      const dates = await redis.zrange(DAYS_KEY, 0, limit - 1, { rev: true });
      if (!dates.length) return [];
      const p = redis.pipeline();
      dates.forEach((d) => p.hgetall(dayKey(d)));
      const days = await p.exec();
      return dates.map((date, i) => ({
        date,
        orders: Object.values(days[i] || {}).map(parse).sort(byTime),
      }));
    },
  };
}

// ---------- In-memory storage (only for testing on your own PC) ----------
const mem = globalThis.__porositeMem || (globalThis.__porositeMem = new Map());
const memoryStore = {
  async getDay(date) {
    return [...(mem.get(date)?.values() || [])].sort(byTime);
  },
  async getOne(date, key) {
    return mem.get(date)?.get(key) || null;
  },
  async save(date, key, order) {
    if (!mem.has(date)) mem.set(date, new Map());
    mem.get(date).set(key, order);
  },
  async remove(date, key) {
    mem.get(date)?.delete(key);
    if (mem.get(date)?.size === 0) mem.delete(date);
  },
  async history(limit) {
    return [...mem.keys()]
      .sort()
      .reverse()
      .slice(0, limit)
      .map((date) => ({ date, orders: [...mem.get(date).values()].sort(byTime) }));
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
  console.warn('[porosite] Nuk ka databazë — po përdor memorien (vetëm për test lokal).');
  store = memoryStore;
  return store;
}
