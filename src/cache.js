const PREFIX = 'rdc:';
const TTL_ROUTE = 30 * 24 * 60 * 60 * 1000; // 30 days — road distances rarely change
const TTL_GEO   =  7 * 24 * 60 * 60 * 1000; // 7 days  — addresses change slightly more

const memory = new Map(); // L1: in-process, zero latency

function key(raw) {
  return PREFIX + raw.toLowerCase();
}

export function get(raw) {
  const k = key(raw);

  if (memory.has(k)) return memory.get(k);

  try {
    const item = localStorage.getItem(k);
    if (!item) return null;
    const { v, exp } = JSON.parse(item);
    if (Date.now() > exp) { localStorage.removeItem(k); return null; }
    memory.set(k, v);
    return v;
  } catch {
    return null;
  }
}

export function set(raw, value, ttl = TTL_ROUTE) {
  const k = key(raw);
  memory.set(k, value);
  try {
    localStorage.setItem(k, JSON.stringify({ v: value, exp: Date.now() + ttl }));
  } catch {
    // localStorage full or blocked — L1 still works for the session
  }
}

export { TTL_ROUTE, TTL_GEO };
