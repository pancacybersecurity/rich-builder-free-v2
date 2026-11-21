const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'rb4';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

const DEF = {
  heading: () => ({ text: 'Judul pesan Anda' }),
  paragraph: () => ({ text: 'Tulis paragraf di sini.', bold: false, italic: false }),
  list: () => ({ items: ['Poin pertama', 'Poin kedua', 'Poin ketiga'], numbered: false }),
  quote: () => ({ text: 'Tulis kutipan di sini', caption: 'Sumber' }),
  table: () => ({ rows: [['Kolom 1', 'Kolom 2'], ['Isi 1', 'Isi 2']], bordered: true, striped: false }),
  buttons: () => ({ buttons: [{ text: 'Buka website', url: 'https://example.com', style: 'primary' }] }),
  photo: () => ({ url: '', caption: 'Keterangan foto' }),
  video: () => ({ url: '', caption: 'Keterangan video' }),
  animation: () => ({ url: '', caption: 'Keterangan GIF' }),
  map: () => ({ latitude: '-6.2', longitude: '106.8', title: 'Lokasi kami' }),
  details: () => ({ summary: 'Judul detail', text: 'Isi detail di sini' }),
  divider: () => ({}),
};
const LABEL = { heading: 'Judul', paragraph: 'Teks', list: 'Daftar', quote: 'Kutipan', table: 'Tabel', buttons: 'Tombol', photo: 'Foto', video: 'Video', animation: 'GIF', map: 'Lokasi', details: 'Detail', divider: 'Pemisah' };
const ICON = { heading: 'H', paragraph: '¶', list: '☰', quote: '❝', table: '▦', buttons: '▭', photo: '▧', video: '▶', animation: 'GIF', map: '⌖', details: '⌄', divider: '—' };

let st = { targets: [], drafts: [], history: [], work: { blocks: [], targetId: null, mode: 'send', silent: false, protect: false, at: '' } };
let accessKey = sessionStorage.getItem('rb-key') || '';
let botUser = null, editId = null, dragId = null;
const W = () => st.work.blocks;
const find = id => W().find(b => b.id === id);
const curTarget = () => st.targets.find(t => t.id === st.work.targetId) || null;

function load() {
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  st.work = { ...{ blocks: [], targetId: null, mode: 'send', silent: false, protect: false, at: '' }, ...(st.work || {}) };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { toast('Penyimpanan penuh. Hapus draft lama.', 'err'); } }

function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function api(action, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessKey) headers['x-access-key'] = accessKey;
  const r = await fetch('/api/telegram', { method: 'POST', headers, body: JSON.stringify({ action, ...body }) });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && j.code === 'locked') {
    const k = prompt('Dashboard dilindungi. Masukkan access key:');
    if (!k) throw Error('Access key diperlukan.');
    accessKey = k.trim(); sessionStorage.setItem('rb-key', accessKey);
    return api(action, body);
  }
  if (!r.ok || !j.ok) throw Error(j.description || j.error || `Permintaan gagal (${r.status})`);
  return j.result;
}

async function uploadFile(file) {
  const data = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(new Error('File tidak bisa dibaca'));
    fr.readAsDataURL(file);
  });
  const headers = { 'Content-Type': 'application/json' };
  if (accessKey) headers['x-access-key'] = accessKey;
  const r = await fetch('/api/upload', { method: 'POST', headers, body: JSON.stringify({ name: file.name, type: file.type, data }) });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok || !j.ok) throw Error(j.description || 'Upload gagal');
  return j.result.url;
}

function kindFor(file) {
  if (file.type === 'image/gif') return 'animation';
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type === 'video/mp4') return 'video';
  return null;
}

async function addFiles(files) {
  for (const f of files) {
    const type = kindFor(f);
    if (!type) { toast(`${f.name}: format belum didukung`, 'err'); continue; }
    try {
      toast(`Mengunggah ${f.name}…`);
      const url = await uploadFile(f);
      W().push({ id: uid(), type, ...DEF[type](), url, caption: f.name.replace(/\.[^.]+$/, '') });
      afterChange();
      toast('File ditambahkan');
    } catch (e) { toast(e.message, 'err'); }
  }
}

function summary(b) {
  switch (b.type) {
    case 'heading': case 'paragraph': case 'quote': return b.text || '';
    case 'list': return (b.items || []).join(' · ');
    case 'table': return `${(b.rows || []).length} baris × ${Math.max(...(b.rows || [[]]).map(r => r.length), 0)} kolom`;
    case 'buttons': return `${(b.buttons || []).length} tombol`;
    case 'photo': case 'video': case 'animation': return b.url ? 'File terpasang' : 'Belum ada file — seret file atau Edit';
    case 'map': return `${b.latitude}, ${b.longitude}`;
    case 'details': return b.summary || '';
    default: return '';
  }
}

function renderBlocks() {
  $('#blocks').innerHTML = W().length
    ? W().map(b => `<div class="row" draggable="true" data-id="${b.id}"><span class="grip">⠿</span><span class="ico">${ICON[b.type]}</span><div class="txt" data-edit="${b.id}"><b>${LABEL[b.type]}</b><small>${esc(summary(b))}</small></div><button class="more" data-more="${b.id}" title="Pilihan">⋯</button></div>`).join('')
    : '<div class="empty">Belum ada blok. Klik “+ Tambah blok”.</div>';
}

function blockHtml(b) {
  switch (b.type) {
    case 'heading': return `<h3>${esc(b.text)}</h3>`;
    case 'paragraph': return `<p>${b.bold ? '<b>' : ''}${b.italic ? '<i>' : ''}${esc(b.text)}${b.italic ? '</i>' : ''}${b.bold ? '</b>' : ''}</p>`;
    case 'list': return `<ul>${(b.items || []).map((x, i) => `<li>${b.numbered ? i + 1 + '. ' : '• '}${esc(x)}</li>`).join('')}</ul>`;
    case 'quote': return `<blockquote>${esc(b.text)}${b.caption ? `<small> — ${esc(b.caption)}</small>` : ''}</blockquote>`;
    case 'table': return '<table>' + (b.rows || []).map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</table>';
    case 'buttons': return (b.buttons || []).map(x => `<span class="tgbtn">${esc(x.text)}</span>`).join('');
    case 'photo': return b.url ? `<img src="${esc(b.url)}" alt="">` : `<p class="muted">▧ Foto belum dipilih</p>`;
    case 'video': return b.url ? `<video src="${esc(b.url)}" controls></video>` : `<p class="muted">▶ Video belum dipilih</p>`;
    case 'animation': return b.url ? `<img src="${esc(b.url)}" alt="">` : `<p class="muted">GIF belum dipilih</p>`;
    case 'map': return `<p>📍 ${esc(b.title)} (${esc(b.latitude)}, ${esc(b.longitude)})</p>`;
    case 'details': return `<details><summary>${esc(b.summary)}</summary>${esc(b.text)}</details>`;
    case 'divider': return '<hr>';
  }
  return '';
}

function preview() {
  const body = W().map(b => `<div class="pv">${blockHtml(b)}</div>`).join('');
  $('#pvBody').innerHTML = body || '<div class="pv-empty">Pesan kamu akan tampil di sini</div>';
  $('#pvName').textContent = curTarget()?.title || 'Preview';
}

function afterChange() { renderBlocks(); preview(); save(); }

// ---- Menu popover (fitur tersembunyi di balik ⋯) ----
function popover(anchor, items) {
  const p = $('#pop');
  p.innerHTML = items.map((it, i) => `<button data-pi="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`).join('');
  const r = anchor.getBoundingClientRect();
  p.style.top = (r.bottom + window.scrollY + 4) + 'px';
  p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';
  p.hidden = false;
  p.onclick = e => {
    const b = e.target.closest('[data-pi]');
    if (!b) return;
    p.hidden = true;
    items[+b.dataset.pi].run();
  };
}
document.addEventListener('click', e => {
  if (!e.target.closest('#pop') && !e.target.closest('[data-more]') && !e.target.closest('#btnAddBlock')) $('#pop').hidden = true;
});

function blockMenu(id, anchor) {
  const i = W().findIndex(b => b.id === id);
  popover(anchor, [
    { label: 'Edit', run: () => openEdit(id) },
    { label: 'Duplikat', run: () => { const c = clone(W()[i]); c.id = uid(); W().splice(i + 1, 0, c); afterChange(); } },
    { label: 'Naik', run: () => { if (i > 0) { [W()[i - 1], W()[i]] = [W()[i], W()[i - 1]]; afterChange(); } } },
    { label: 'Turun', run: () => { if (i < W().length - 1) { [W()[i + 1], W()[i]] = [W()[i], W()[i + 1]]; afterChange(); } } },
    { label: 'Hapus', danger: true, run: () => { W().splice(i, 1); afterChange(); } },
  ]);
}

// ---- Edit dialog ----
function field(label, inner) { return `<label class="field">${label}${inner}</label>`; }

function formFor(b) {
  switch (b.type) {
    case 'heading': return field('Judul', `<input data-f="text" value="${esc(b.text)}">`);
    case 'paragraph': return field('Isi teks', `<textarea data-f="text">${esc(b.text)}</textarea>`) +
      `<label class="check"><input type="checkbox" data-f="bold" ${b.bold ? 'checked' : ''}> Tebal</label>` +
      `<label class="check"><input type="checkbox" data-f="italic" ${b.italic ? 'checked' : ''}> Miring</label>`;
    case 'list': return (b.items || []).map((x, i) => `<div class="item"><input data-li="${i}" value="${esc(x)}"><button class="btn ghost small" data-act="delli" data-idx="${i}">Hapus</button></div>`).join('') +
      `<div class="fbtns"><button class="btn ghost small" data-act="addli">+ Poin</button></div>` +
      `<label class="check"><input type="checkbox" data-f="numbered" ${b.numbered ? 'checked' : ''}> Bernomor</label>`;
    case 'quote': return field('Isi kutipan', `<textarea data-f="text">${esc(b.text)}</textarea>`) + field('Sumber', `<input data-f="caption" value="${esc(b.caption)}">`);
    case 'table': {
      const cols = Math.max(...(b.rows || [[]]).map(r => r.length), 1);
      const grid = (b.rows || []).map((r, ri) => Array.from({ length: cols }, (_, ci) => `<input data-cell="${ri},${ci}" value="${esc(r[ci] ?? '')}">`).join('')).join('');
      return `<div class="tgrid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${grid}</div>` +
        `<div class="fbtns"><button class="btn ghost small" data-act="addrow">+ Baris</button><button class="btn ghost small" data-act="delrow">− Baris</button><button class="btn ghost small" data-act="addcol">+ Kolom</button><button class="btn ghost small" data-act="delcol">− Kolom</button></div>` +
        `<label class="check"><input type="checkbox" data-f="bordered" ${b.bordered !== false ? 'checked' : ''}> Garis tabel</label>` +
        `<label class="check"><input type="checkbox" data-f="striped" ${b.striped ? 'checked' : ''}> Baris selang-seling</label>`;
    }
    case 'buttons': return (b.buttons || []).map((x, i) => `<div class="bitem"><div class="r"><input data-bf="${i}:text" placeholder="Label" value="${esc(x.text)}"><input data-bf="${i}:url" placeholder="https://..." value="${esc(x.url)}"><button class="btn ghost small" data-act="delbtn" data-idx="${i}">Hapus</button></div><select data-bf="${i}:style">${['primary', 'success', 'danger', 'link'].map(s => `<option value="${s}" ${x.style === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') +
      `<div class="fbtns"><button class="btn ghost small" data-act="addbtn">+ Tombol</button></div><small class="muted">Maksimal 8 tombol. Wajib URL https://</small>`;
    case 'photo': case 'video': case 'animation':
      return `<div class="muted small">${b.url ? 'File terpasang.' : 'Belum ada file.'}</div>` +
        field('Pilih file dari perangkat (JPG, PNG, WEBP, GIF, MP4 — maks 3 MB)', `<input type="file" data-pick accept="image/*,video/mp4">`) +
        field('Atau tempel URL HTTPS publik', `<input data-f="url" value="${esc(b.url)}">`) +
        field('Keterangan', `<input data-f="caption" value="${esc(b.caption)}">`);
    case 'map': return field('Latitude', `<input data-f="latitude" value="${esc(b.latitude)}">`) + field('Longitude', `<input data-f="longitude" value="${esc(b.longitude)}">`) + field('Nama lokasi', `<input data-f="title" value="${esc(b.title)}">`);
    case 'details': return field('Judul detail', `<input data-f="summary" value="${esc(b.summary)}">`) + field('Isi detail', `<textarea data-f="text">${esc(b.text)}</textarea>`);
    case 'divider': return '<p class="muted">Garis pemisah. Tidak perlu diisi.</p>';
  }
  return '';
}

function openEdit(id) {
  const b = find(id);
  if (!b) return;
  editId = id;
  $('#dlgEditTitle').textContent = LABEL[b.type];
  $('#dlgEditBody').innerHTML = formFor(b);
  $('#dlgEdit').showModal();
}
function refreshEdit() { const b = find(editId); if (b) $('#dlgEditBody').innerHTML = formFor(b); }

$('#dlgEditBody').addEventListener('input', e => {
  const b = find(editId); const t = e.target;
  if (!b) return;
  if (t.dataset.f) b[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
  else if (t.dataset.li !== undefined) b.items[+t.dataset.li] = t.value;
  else if (t.dataset.cell) { const [r, c] = t.dataset.cell.split(',').map(Number); b.rows[r][c] = t.value; }
  else if (t.dataset.bf) { const [i, f] = t.dataset.bf.split(':'); b.buttons[+i][f] = t.value; }
  else return;
  afterChange();
});
$('#dlgEditBody').addEventListener('change', async e => {
  const b = find(editId); const t = e.target;
  if (!b) return;
  if (t.dataset.f) { b[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; afterChange(); if (t.type === 'checkbox') refreshEdit(); }
  if (t.dataset.bf) { const [i, f] = t.dataset.bf.split(':'); b.buttons[+i][f] = t.value; afterChange(); }
  if (t.dataset.pick !== undefined && t.files[0]) {
    try {
      toast('Mengunggah…');
      b.url = await uploadFile(t.files[0]);
      if (b.type === 'photo' && !b.caption) b.caption = '';
      afterChange(); refreshEdit(); toast('File terpasang');
    } catch (err) { toast(err.message, 'err'); }
  }
});
$('#dlgEditBody').addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const b = find(editId);
  const a = t.dataset.act, i = +t.dataset.idx;
  const cols = () => Math.max(...b.rows.map(r => r.length), 1);
  if (a === 'addrow') b.rows.push(Array(cols()).fill(''));
  if (a === 'delrow' && b.rows.length > 1) b.rows.pop();
  if (a === 'addcol') b.rows.forEach(r => r.push(''));
  if (a === 'delcol' && cols() > 1) b.rows.forEach(r => r.pop());
  if (a === 'addli') b.items.push('Poin baru');
  if (a === 'delli') b.items.splice(i, 1);
  if (a === 'addbtn' && b.buttons.length < 8) b.buttons.push({ text: 'Tombol baru', url: 'https://example.com', style: 'primary' });
  if (a === 'delbtn') b.buttons.splice(i, 1);
  refreshEdit(); afterChange();
});

// ---- Drag & drop: urutkan blok dan tambah file ----
const blocksEl = $('#blocks');
blocksEl.addEventListener('dragstart', e => {
  const r = e.target.closest('.row'); if (!r) return;
  dragId = r.dataset.id; r.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
blocksEl.addEventListener('dragend', () => { dragId = null; $$('.row.dragging').forEach(x => x.classList.remove('dragging')); });
blocksEl.addEventListener('dragover', e => { if (dragId) e.preventDefault(); });
blocksEl.addEventListener('drop', e => {
  const r = e.target.closest('.row');
  if (!dragId || !r) return;
  e.preventDefault();
  const from = W().findIndex(b => b.id === dragId), to = W().findIndex(b => b.id === r.dataset.id);
  if (from < 0 || to < 0) return;
  const [m] = W().splice(from, 1); W().splice(to, 0, m);
  dragId = null; afterChange();
});
const drop = $('#drop');
drop.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
drop.addEventListener('drop', e => {
  drop.classList.remove('over');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  addFiles([...e.dataTransfer.files]);
});

blocksEl.addEventListener('click', e => {
  const m = e.target.closest('[data-more]');
  if (m) { blockMenu(m.dataset.more, m); return; }
  const t = e.target.closest('[data-edit]');
  if (t) openEdit(t.dataset.edit);
});

$('#btnAddBlock').onclick = () => {
  popover($('#btnAddBlock'), Object.keys(DEF).map(type => ({
    label: LABEL[type],
    run: () => {
      const b = { id: uid(), type, ...DEF[type]() };
      W().push(b); afterChange();
      if (['photo', 'video', 'animation'].includes(type)) openEdit(b.id);
    },
  })));
};

$('#btnClear').onclick = () => { if (!confirm('Kosongkan semua blok?')) return; st.work.blocks = []; afterChange(); };

// ---- Tujuan permanen ----
function renderTargets() {
  const sel = $('#target');
  sel.innerHTML = st.targets.length
    ? st.targets.map(t => `<option value="${t.id}" ${t.id === st.work.targetId ? 'selected' : ''}>${esc(t.title)} · ${t.type === 'channel' ? 'Channel' : 'Grup'}</option>`).join('')
    : '<option value="">Belum ada tujuan — klik + Tujuan</option>';
  if (!curTarget() && st.targets.length) st.work.targetId = st.targets[0].id;
  sel.value = st.work.targetId || '';
  $('#btnDelTarget').disabled = !curTarget();
  preview(); save();
}
$('#target').onchange = e => { st.work.targetId = e.target.value; renderTargets(); };
$('#btnDelTarget').onclick = () => {
  const t = curTarget(); if (!t || !confirm(`Hapus tujuan ${t.title}?`)) return;
  st.targets = st.targets.filter(x => x.id !== t.id); st.work.targetId = null; renderTargets();
};

let tType = 'group', tVerified = null;
function setTType(v) {
  tType = v;
  $$('[data-ttype]').forEach(b => b.classList.toggle('on', b.dataset.ttype === v));
}
$$('[data-ttype]').forEach(b => b.onclick = () => { setTType(b.dataset.ttype); tVerified = null; $('#tSave').disabled = true; });
$('#btnAddTarget').onclick = () => { $('#tChat').value = ''; $('#tStatus').textContent = ''; $('#tSave').disabled = true; tVerified = null; setTType('group'); $('#dlgTarget').showModal(); };
$('#tVerify').onclick = async () => {
  const chat = $('#tChat').value.trim();
  if (!chat) return;
  try {
    const info = await api('verify', { chat_id: chat });
    const okType = tType === 'channel' ? info.type === 'channel' : ['group', 'supergroup'].includes(info.type);
    if (!okType) throw Error(`Chat ini bertipe ${info.type}, bukan ${tType === 'channel' ? 'channel' : 'grup'}.`);
    const ok = ['administrator', 'creator', 'member'].includes(info.bot_status);
    tVerified = info;
    $('#tStatus').className = 'status-line ' + (ok ? 'ok' : 'err');
    $('#tStatus').textContent = ok ? `✓ ${info.title} terverifikasi. Bot sudah menjadi ${info.bot_status}.` : `Bot belum menjadi anggota (status: ${info.bot_status}). Tambahkan bot dulu.`;
    $('#tSave').disabled = !ok;
  } catch (e) {
    tVerified = null; $('#tSave').disabled = true;
    $('#tStatus').className = 'status-line err';
    $('#tStatus').textContent = '✕ ' + e.message;
  }
};
$('#tAddBot').onclick = () => {
  if (!botUser) return toast('Bot belum terhubung. Periksa konfigurasi.', 'err');
  const rights = tType === 'channel' ? 'post_messages+edit_messages+delete_messages' : 'delete_messages+invite_users';
  window.open(`https://t.me/${botUser}?${tType === 'channel' ? 'startchannel' : 'startgroup'}&admin=${rights}`, '_blank', 'noopener');
};
$('#tSave').onclick = () => {
  if (!tVerified) return;
  const exist = st.targets.find(t => String(t.chat_id) === String(tVerified.id));
  if (exist) { st.work.targetId = exist.id; }
  else {
    const t = { id: uid(), type: tVerified.type === 'channel' ? 'channel' : 'group', chat_id: tVerified.id, title: tVerified.title, username: tVerified.username || '' };
    st.targets.push(t); st.work.targetId = t.id;
  }
  renderTargets();
  $('#dlgTarget').close();
  toast('Tujuan disimpan. Tidak perlu ditambahkan lagi.');
};

// ---- Mode kirim: KIRIM / JADWAL / DRAFT ----
const MODE_LABEL = { send: 'Kirim sekarang', schedule: 'Jadwalkan', draft: 'Simpan draft' };
function setMode(m) {
  st.work.mode = m;
  $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#atWrap').hidden = m !== 'schedule';
  $('#go').textContent = MODE_LABEL[m];
  save();
}
$$('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#at').onchange = e => { st.work.at = e.target.value; save(); };
$('#silent').onchange = e => { st.work.silent = e.target.checked; save(); };
$('#protect').onchange = e => { st.work.protect = e.target.checked; save(); };

function saveDraft() {
  const name = prompt('Nama draft:', `Draft ${new Date().toLocaleString('id-ID')}`);
  if (!name) return;
  st.drafts.unshift({ id: uid(), name, blocks: clone(W()), targetId: st.work.targetId, updated: Date.now() });
  save();
  toast('Draft tersimpan. Buka lewat “Draft & riwayat”.');
  $('#result').textContent = '✓ Draft disimpan';
}

function addHistory(entry) {
  st.history.unshift(entry);
  st.history = st.history.slice(0, 50);
  save();
}

$('#go').onclick = async () => {
  const m = st.work.mode;
  if (m === 'draft') return saveDraft();
  const t = curTarget();
  if (!t) return toast('Pilih atau tambahkan tujuan dulu.', 'err');
  if (!W().length) return toast('Tambahkan minimal satu blok.', 'err');
  const opts = { silent: st.work.silent, protect: st.work.protect };
  const btn = $('#go');
  btn.disabled = true;
  try {
    if (m === 'send') {
      $('#result').textContent = 'Mengirim…';
      const r = await api('send', { chat_id: t.chat_id, blocks: W(), ...opts });
      $('#result').textContent = `✓ Terkirim (ID ${r.message_id})`;
      addHistory({ target: t.title, count: W().length, message_id: r.message_id, at: Date.now(), kind: 'kirim' });
      toast('Pesan terkirim');
    } else {
      if (!st.work.at) throw Error('Pilih waktu kirim terlebih dahulu.');
      const when = new Date(st.work.at);
      const r = await api('schedule', { chat_id: t.chat_id, blocks: W(), at: when.toISOString(), ...opts });
      $('#result').textContent = `✓ Dijadwalkan ${when.toLocaleString('id-ID')}`;
      addHistory({ target: t.title, count: W().length, message_id: r.id, at: Date.now(), kind: 'jadwal', when: when.getTime() });
      toast('Pesan dijadwalkan');
    }
  } catch (e) {
    $('#result').textContent = '✕ ' + e.message;
    toast(e.message, 'err');
  } finally { btn.disabled = false; }
};

// ---- Dialog draft & riwayat ----
function renderLists() {
  $('#draftList').innerHTML = st.drafts.length ? st.drafts.map(d => `<div class="lrow"><div><b>${esc(d.name)}</b><br><small>${d.blocks.length} blok · ${new Date(d.updated).toLocaleString('id-ID')}</small></div><div class="acts"><button class="btn small" data-open-draft="${d.id}">Buka</button><button class="btn ghost small" data-del-draft="${d.id}">Hapus</button></div></div>`).join('') : '<div class="empty">Belum ada draft.</div>';
  const sched = st.history.filter(h => h.kind === 'jadwal');
  $('#schedList').innerHTML = sched.length ? sched.map(h => `<div class="lrow"><div><b>${esc(h.target)}</b><br><small>${h.count} blok · ${new Date(h.when).toLocaleString('id-ID')}</small></div><div class="acts"><button class="btn ghost small" data-cancel="${esc(h.message_id)}">Batalkan</button></div></div>`).join('') : '<div class="empty">Tidak ada jadwal.</div>';
  $('#histList').innerHTML = st.history.length ? st.history.map(h => `<div class="lrow"><div><b>${esc(h.target)}</b><br><small>${h.kind === 'jadwal' ? 'Jadwal' : 'Kirim'} · ${h.count} blok · ${new Date(h.at).toLocaleString('id-ID')}</small></div></div>`).join('') : '<div class="empty">Belum ada riwayat.</div>';
}
$('#btnDrafts').onclick = () => { renderLists(); $('#dlgDrafts').showModal(); };
$('#dlgDrafts').addEventListener('click', async e => {
  const o = e.target.closest('[data-open-draft]'), d = e.target.closest('[data-del-draft]'), c = e.target.closest('[data-cancel]');
  if (o) {
    const dr = st.drafts.find(x => x.id === o.dataset.openDraft);
    if (dr) { st.work.blocks = clone(dr.blocks); st.work.targetId = dr.targetId; $('#dlgDrafts').close(); afterChange(); renderTargets(); }
  }
  if (d) { st.drafts = st.drafts.filter(x => x.id !== d.dataset.delDraft); save(); renderLists(); }
  if (c) {
    try {
      await api('cancel', { id: c.dataset.cancel });
      st.history = st.history.filter(h => h.message_id !== c.dataset.cancel); save(); renderLists(); toast('Jadwal dibatalkan');
    } catch (err) { toast(err.message, 'err'); }
  }
});

// ---- Status server ----
async function checkHealth() {
  const pill = $('#botPill');
  try {
    const h = await api('health');
    if (!h.token.ok) {
      pill.textContent = 'Token belum siap'; pill.className = 'bot err';
      $('#banner').hidden = false;
      $('#banner').textContent = h.token.message;
      return;
    }
    const me = await api('me');
    botUser = me.username;
    pill.textContent = '@' + me.username; pill.className = 'bot ok';
    const notes = [];
    if (!h.schedule) notes.push('Jadwal belum aktif (pasang Upstash Redis).');
    if (!h.upload) notes.push('Upload drag-and-drop belum aktif (pasang Vercel Blob).');
    if (notes.length) { $('#banner').hidden = false; $('#banner').textContent = notes.join(' '); }
  } catch (e) {
    pill.textContent = 'Bot belum terhubung'; pill.className = 'bot err';
    $('#banner').hidden = false; $('#banner').textContent = e.message;
  }
}

// ---- init ----
load();
renderTargets();
renderBlocks();
preview();
setMode(st.work.mode);
$('#silent').checked = !!st.work.silent;
$('#protect').checked = !!st.work.protect;
$('#at').value = st.work.at || '';
checkHealth();
