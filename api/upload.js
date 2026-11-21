const { authorized } = require('../lib/auth');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
const MAX = 3 * 1024 * 1024;

// Menerima file (base64) dari drag-and-drop, lalu menyimpannya ke Vercel Blob dan mengembalikan URL publik.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ ok: false, code: 'locked', error: 'Access key diperlukan.' });
  try {
    const { name, type, data } = req.body || {};
    if (!data || !type) throw new Error('File tidak terbaca.');
    if (!ALLOWED.includes(type)) throw new Error('Format belum didukung. Gunakan JPG, PNG, WEBP, GIF, atau MP4.');
    const buf = Buffer.from(String(data), 'base64');
    if (buf.length > MAX) throw new Error('Ukuran file maksimal 3 MB.');
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Upload belum aktif. Buat Blob store di Vercel → Storage, lalu Redeploy.');
    const { put } = await import('@vercel/blob');
    const safe = String(name || 'file').replace(/[^\w.-]+/g, '_');
    const blob = await put(`rich/${Date.now()}-${safe}`, buf, { access: 'public', contentType: type });
    return res.json({ ok: true, result: { url: blob.url, type } });
  } catch (e) {
    return res.status(400).json({ ok: false, description: e.message });
  }
};
