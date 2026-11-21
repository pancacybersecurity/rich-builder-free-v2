const API = 'https://api.telegram.org';
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

function readToken() {
  const raw = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  return String(raw).replace(/[\r\n\t]/g, '').trim().replace(/^["']+|["']+$/g, '').trim();
}

function tokenStatus() {
  const t = readToken();
  if (!t) return { ok: false, message: 'BOT_TOKEN tidak terbaca di server. Pasang di Vercel → Settings → Environment Variables (nama persis BOT_TOKEN), lalu Redeploy.' };
  if (!TOKEN_RE.test(t)) return { ok: false, message: 'BOT_TOKEN terbaca tetapi formatnya tidak valid. Salin ulang token dari BotFather.' };
  return { ok: true, message: 'Token terbaca dan formatnya valid.' };
}

async function call(method, payload = {}) {
  const st = tokenStatus();
  if (!st.ok) throw new Error(st.message);
  let r;
  try {
    r = await fetch(`${API}/bot${readToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) { throw new Error('Gagal menghubungi Telegram: ' + e.message); }
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok || !data.ok) {
    if (r.status === 401) throw new Error('Token ditolak Telegram (401). Pastikan token masih aktif.');
    throw new Error(data.description || `Telegram API error (${r.status})`);
  }
  return data.result;
}

const T = s => (s && String(s).trim() ? String(s) : ' ');
function inline(text, bold, italic) {
  const t = T(text);
  if (bold && italic) return [{ type: 'bold', text: [{ type: 'italic', text: t }] }];
  if (bold) return [{ type: 'bold', text: t }];
  if (italic) return [{ type: 'italic', text: t }];
  return t;
}

function richBlock(b) {
  switch (b.type) {
    case 'heading': return { type: 'heading', size: 2, text: T(b.text) };
    case 'paragraph': return { type: 'paragraph', text: inline(b.text, b.bold, b.italic) };
    case 'list': {
      const items = (b.items || []).map(x => String(x).trim()).filter(Boolean);
      if (!items.length) throw new Error('Daftar harus memiliki minimal satu poin.');
      return { type: 'paragraph', text: items.map((x, i) => `${b.numbered ? `${i + 1}.` : '•'} ${x}`).join('\n') };
    }
    case 'quote': return { type: 'blockquote', blocks: [{ type: 'paragraph', text: T(b.text) }], credit: b.caption || undefined };
    case 'divider': return { type: 'divider' };
    case 'table': {
      const rows = (b.rows || []).filter(r => Array.isArray(r) && r.some(c => String(c || '').trim()));
      if (!rows.length) throw new Error('Tabel harus memiliki isi.');
      return { type: 'table', cells: rows.map(r => r.map(c => ({ text: String(c || ' ') }))), is_bordered: b.bordered !== false, is_striped: !!b.striped };
    }
    case 'buttons': {
      const buttons = (b.buttons || []).filter(x => String(x.text || '').trim());
      if (!buttons.length) throw new Error('Tambahkan minimal satu tombol.');
      if (buttons.length > 8) throw new Error('Maksimal 8 tombol per blok.');
      return {
        type: 'buttons', align: 'left',
        buttons: buttons.map(x => {
          if (!/^https:\/\/\S+$/i.test(x.url || '')) throw new Error(`Tombol "${x.text}" wajib memakai URL HTTPS.`);
          return { text: x.text, style: ['primary', 'success', 'danger', 'link'].includes(x.style) ? x.style : 'primary', url: x.url };
        }),
      };
    }
    case 'details': return { type: 'details', summary: b.summary || 'Detail', blocks: [{ type: 'paragraph', text: T(b.text) }] };
    case 'photo':
    case 'video':
    case 'animation': {
      const u = String(b.url || '');
      if (!/^https:\/\/\S+/i.test(u)) throw new Error(`Blok ${b.type} belum punya file. Seret file ke editor atau isi URL HTTPS.`);
      const caption = b.caption ? { text: b.caption } : undefined;
      if (b.type === 'photo') return { type: 'photo', photo: { type: 'photo', media: u }, caption };
      if (b.type === 'video') return { type: 'video', video: { type: 'video', media: u }, caption };
      return { type: 'animation', animation: { type: 'animation', media: u }, caption };
    }
    case 'map': {
      const latitude = Number(b.latitude), longitude = Number(b.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Koordinat lokasi tidak valid.');
      return { type: 'map', location: { latitude, longitude }, caption: b.title ? { text: b.title } : undefined };
    }
    default: throw new Error('Jenis blok belum didukung: ' + b.type);
  }
}

// Cek bot sudah jadi anggota & punya hak kirim di tujuan.
async function checkPermission(chat_id) {
  const me = await call('getMe');
  const member = await call('getChatMember', { chat_id, user_id: me.id });
  if (!['administrator', 'creator', 'member'].includes(member.status)) throw new Error('Bot belum menjadi anggota tujuan. Tambahkan bot dulu.');
  const chat = await call('getChat', { chat_id });
  if (chat.type === 'channel' && member.status !== 'creator' && !member.can_post_messages) throw new Error('Bot admin, tetapi belum punya izin Post Messages di channel.');
  if (chat.type === 'supergroup' && member.status === 'restricted' && !member.can_send_messages) throw new Error('Bot tidak punya izin kirim pesan di grup.');
  return chat;
}

async function sendRich(chat_id, blocks, opts = {}) {
  if (!chat_id || !Array.isArray(blocks) || !blocks.length) throw new Error('Tujuan dan minimal satu blok wajib diisi.');
  if (blocks.length > 50) throw new Error('Maksimal 50 blok per pesan.');
  const rich = { blocks: blocks.map(richBlock) }; // validasi dulu sebelum kirim
  await checkPermission(chat_id);
  const sent = await call('sendRichMessage', {
    chat_id, rich_message: rich,
    disable_notification: !!opts.silent,
    protect_content: !!opts.protect,
  });
  return { message_id: sent.message_id, chat: sent.chat };
}

module.exports = { readToken, tokenStatus, call, richBlock, checkPermission, sendRich };
