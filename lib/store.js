// Penyimpanan jadwal memakai Upstash Redis (REST). Pasang UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const enabled = () => !!(URL && TOK);

async function cmd(...args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error('Penyimpanan: ' + j.error);
  return j.result;
}

module.exports = {
  enabled,
  set: (k, v) => cmd('SET', k, v),
  get: k => cmd('GET', k),
  del: k => cmd('DEL', k),
  zadd: (k, score, m) => cmd('ZADD', k, score, m),
  zrem: (k, m) => cmd('ZREM', k, m),
  zdue: (k, now) => cmd('ZRANGEBYSCORE', k, '-inf', now),
};
