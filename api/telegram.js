const crypto = require('crypto');
const { tokenStatus, call, richBlock, sendRich, checkPermission } = require('../lib/telegram');
const { authorized } = require('../lib/auth');
const store = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ ok: false, code: 'locked', error: 'Access key diperlukan.' });
  const body = req.body || {};
  try {
    switch (body.action) {
      case 'health':
        return res.json({ ok: true, result: { token: tokenStatus(), access_key: !!process.env.ACCESS_KEY, schedule: store.enabled(), upload: !!process.env.BLOB_READ_WRITE_TOKEN } });
      case 'me':
        return res.json({ ok: true, result: await call('getMe') });
      case 'verify': {
        if (!body.chat_id) throw new Error('Username atau chat ID wajib diisi.');
        const chat = await call('getChat', { chat_id: body.chat_id });
        const me = await call('getMe');
        let member;
        try { member = await call('getChatMember', { chat_id: chat.id, user_id: me.id }); }
        catch { member = { status: 'tidak dapat diperiksa' }; }
        return res.json({ ok: true, result: { id: chat.id, title: chat.title || chat.username || String(chat.id), username: chat.username, type: chat.type, bot_status: member.status, can_post_messages: member.can_post_messages ?? null } });
      }
      case 'send': {
        const sent = await sendRich(body.chat_id, body.blocks, body);
        return res.json({ ok: true, result: sent });
      }
      case 'schedule': {
        if (!store.enabled()) throw new Error('Jadwal membutuhkan penyimpanan. Pasang UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.');
        const at = Date.parse(body.at);
        if (!Number.isFinite(at) || at < Date.now() + 60000) throw new Error('Waktu jadwal minimal 1 menit dari sekarang.');
        if (!body.chat_id || !Array.isArray(body.blocks) || !body.blocks.length) throw new Error('Tujuan dan blok wajib diisi.');
        body.blocks.forEach(richBlock); // validasi format sekarang, bukan saat jadwal berjalan
        const id = crypto.randomUUID();
        await store.set('sched:' + id, JSON.stringify({ chat_id: body.chat_id, blocks: body.blocks, silent: !!body.silent, protect: !!body.protect, at }));
        await store.zadd('schedules', at, id);
        return res.json({ ok: true, result: { id, at } });
      }
      case 'cancel': {
        if (!body.id) throw new Error('ID jadwal wajib.');
        await store.zrem('schedules', body.id);
        await store.del('sched:' + body.id);
        return res.json({ ok: true, result: { cancelled: body.id } });
      }
      default:
        return res.status(400).json({ ok: false, description: 'Action tidak dikenal.' });
    }
  } catch (e) {
    return res.status(400).json({ ok: false, description: e.message });
  }
};
