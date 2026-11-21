const { sendRich } = require('../lib/telegram');
const store = require('../lib/store');

// Dipanggil tiap menit oleh layanan cron eksternal (lihat README). Mengirim semua jadwal yang sudah waktunya.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  if (!store.enabled()) return res.json({ ok: true, sent: 0, note: 'Penyimpanan jadwal belum dipasang.' });
  const due = (await store.zdue('schedules', Date.now())) || [];
  const results = [];
  for (const id of due) {
    try {
      const job = JSON.parse((await store.get('sched:' + id)) || 'null');
      if (!job) { results.push({ id, ok: false, error: 'Data jadwal hilang' }); }
      else {
        const sent = await sendRich(job.chat_id, job.blocks, job);
        results.push({ id, ok: true, message_id: sent.message_id });
      }
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
    await store.zrem('schedules', id);
    await store.del('sched:' + id);
  }
  return res.json({ ok: true, results });
};
