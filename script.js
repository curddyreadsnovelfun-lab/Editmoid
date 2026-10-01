"use strict";

/* ============================================================
   Aurora Cut — a lightweight browser video editor
   Sections: utils · theme · IndexedDB · state · media ·
   elements · project · history · timeline · playback ·
   render pipeline · overlays · keyframes · chroma · masks ·
   audio · effects · transform · panel UI · export · storage
   ============================================================ */

/* ---------- tiny utils ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor(t % 1 * 10); return m + ':' + String(s).padStart(2, '0') + '.' + d; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const hex2rgb = h => { h = h.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; };
const rgb2hex = (r, g, b) => '#' + [Math.round(clamp(r, 0, 255)), Math.round(clamp(g, 0, 255)), Math.round(clamp(b, 0, 255))].map(v => v.toString(16).padStart(2, '0')).join('');
const round2 = v => Math.round(v * 100) / 100;
const mb = b => (b / 1048576).toFixed(1) + ' MB';
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#c9a227';

/* ---------- theme ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ac-theme', t); } catch (e) { /* fine */ }
  $('#themeBtn').textContent = t === 'dark' ? '☀' : '☾';
}

/* ---------- IndexedDB ---------- */
const TTL = 3 * 24 * 3600 * 1000; // temp videos expire after 3 days
let db;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('aurora-cut', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['media', 'projects', 'temp'])
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
const idbReq = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const idbPut = (s, v) => idbReq(db.transaction(s, 'readwrite').objectStore(s).put(v));
const idbGet = (s, k) => idbReq(db.transaction(s, 'readonly').objectStore(s).get(k));
const idbDel = (s, k) => idbReq(db.transaction(s, 'readwrite').objectStore(s).delete(k));
const idbAll = s => idbReq(db.transaction(s, 'readonly').objectStore(s).getAll());
const idbClear = s => idbReq(db.transaction(s, 'readwrite').objectStore(s).clear());

/* auto-cleanup of expired temp renders, runs at startup */
async function cleanupTemp() {
  try {
    const items = await idbAll('temp');
    const now = Date.now();
    for (const it of items) if (it.expires < now) await idbDel('temp', it.id);
  } catch (e) { /* db not ready — nothing to clean */ }
}

/* ---------- state ---------- */
const S = {
  project: null,
  media: new Map(),          // id -> {id,name,kind,url,size,duration,w,h,thumb}
  selMedia: null,
  playing: false, playhead: 0, zoom: 60,
  sel: null,                 // {kind:'clip'|'overlay'|'audio', id}
  selKf: null,               // {prop, idx}
  dirty: true, eyedrop: false, masterVol: 1,
  exportRun: null,
};
const newProject = () => ({ id: uid(), name: 'Untitled Project', clips: [], overlays: [], audio: [], res: { w: 1280, h: 720 }, resSet: false });
const PW = () => S.project.res.w;
const PH = () => S.project.res.h;
function projectDuration() {
  let d = 10;
  const scan = c => { d = Math.max(d, (c.start || 0) + (c.duration || 0)); };
  S.project.clips.forEach(scan); S.project.overlays.forEach(scan); S.project.audio.forEach(scan);
  return d;
}
function markDirty() { S.dirty = true; }

/* ---------- media management ---------- */
function probeMedia(item) {
  return new Promise(res => {
    if (item.kind === 'image') {
      const im = new Image();
      im.onload = () => { item.w = im.naturalWidth; item.h = im.naturalHeight; res(); };
      im.onerror = res; im.src = item.url;
      return;
    }
    const el = document.createElement(item.kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata'; el.src = item.url;
    el.onloadedmetadata = () => {
      item.duration = el.duration || 0;
      if (item.kind === 'video') {
        item.w = el.videoWidth; item.h = el.videoHeight;
        el.currentTime = Math.min(0.5, (el.duration || 1) / 2);
        el.onseeked = () => {
          try {
            const c = document.createElement('canvas'); c.width = 96; c.height = 54;
            c.getContext('2d').drawImage(el, 0, 0, 96, 54);
            item.thumb = c.toDataURL('image/jpeg', 0.6);
          } catch (err) { /* thumbnail is a nice-to-have */ }
          res();
        };
      } else res();
    };
    el.onerror = res;
  });
}

async function addFiles(files) {
  for (const f of files) {
    const kind = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null;
    if (!kind) { toast('Skipped ' + f.name + ' — unsupported type'); continue; }
    const id = uid(), url = URL.createObjectURL(f);
    const item = { id, name: f.name, kind, url, size: f.size, duration: 0, w: 0, h: 0, thumb: null };
    S.media.set(id, item);
    try { await idbPut('media', { ...item, blob: f }); }
    catch (e) { toast('Storage full — clear temp videos (Storage tab)'); }
    await probeMedia(item);
    renderLibrary();
    if (kind !== 'audio' && !S.project.resSet && item.w) {
      S.project.res = { w: Math.min(1920, item.w - (item.w % 2)), h: Math.min(1080, item.h - (item.h % 2)) };
      S.project.resSet = true;
      syncViewSize();
    }
  }
  updateStageHint();
}

function renderLibrary() {
  const lib = $('#library');
  if (!S.media.size) {
    lib.innerHTML = '<div class="empty">Drop video, audio or images here<br><span>MP4 · WebM · PNG · MP3…</span></div>';
    return;
  }
  lib.innerHTML = '';
  for (const m of S.media.values()) {
    const d = document.createElement('div');
    d.className = 'mitem' + (S.selMedia === m.id ? ' sel' : '');
    d.dataset.id = m.id; d.title = m.name;
    d.innerHTML =
      (m.thumb ? '<img class="mthumb" src="' + m.thumb + '">' : '<div class="micon">' + (m.kind === 'audio' ? '♪' : '▦') + '</div>') +
      '<div style="flex:1;min-width:0"><div class="mname">' + esc(m.name) + '</div>' +
      '<div class="mkind">' + m.kind + (m.duration ? ' · ' + fmt(m.duration) : '') + '</div></div>' +
      '<button class="btn madd" data-add="' + m.id + '" title="Add at playhead">＋</button>';
    lib.appendChild(d);
  }
}

function selectMedia(id) {
  S.selMedia = id;
  const m = S.media.get(id); if (!m) return;
  $('#mediaPreview').classList.remove('hidden');
  const v = $('#mpVideo'), a = $('#mpAudio'), im = $('#mpImg');
  v.pause(); a.pause();
  v.hidden = m.kind !== 'video'; a.hidden = m.kind !== 'audio'; im.hidden = m.kind !== 'image';
  if (m.kind === 'video') v.src = m.url;
  else if (m.kind === 'audio') a.src = m.url;
  else im.src = m.url;
  $('#mpName').textContent = m.name + ' — ' + m.kind + (m.duration ? ' · ' + fmt(m.duration) : '') + (m.w ? ' · ' + m.w + '×' + m.h : '');
  $('#mpOverlay').hidden = m.kind === 'audio';
  renderLibrary();
}

/* ---------- element pools (reused, never duplicated) ---------- */
const els = new Map();   // clip id -> <video>/<audio>
function clipEl(c) {
  const m = c.mediaId ? S.media.get(c.mediaId) : null;
  if (!m) return null;
  if (!els.has(c.id)) {
    const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
    el.src = m.url; el.preload = 'auto'; el.playsInline = true;
    els.set(c.id, el);
  }
  return els.get(c.id);
}
const imgs = new Map();  // media id -> Image
function mediaImg(m) {
  if (!imgs.has(m.id)) { const i = new Image(); i.src = m.url; imgs.set(m.id, i); }
  return imgs.get(m.id);
}
function dropEl(id) {
  const el = els.get(id);
  if (el) { el.pause(); try { el.removeAttribute('src'); el.load(); } catch (e) { /* whatever */ } els.delete(id); }
}
function purgeEls() { for (const id of [...els.keys()]) dropEl(id); }

/* ---------- project management ---------- */
function baseFx() { return { brightness: 1, contrast: 1, saturation: 1, exposure: 0, blur: 0, gray: 0 }; }
function baseChroma() { return { on: false, color: '#00b140', tol: 0.35, strength: 1, soft: 0.12 }; }
function baseMask() { return { on: false, shape: 'rect', x: 0, y: 0, w: PW() / 2, h: PH() / 2, rot: 0, feather: 0, opacity: 1, invert: false }; }
function norm(c) {
  c.kf = c.kf || {}; c.fx = { ...baseFx(), ...(c.fx || {}) };
  c.chroma = { ...baseChroma(), ...(c.chroma || {}) }; c.mask = { ...baseMask(), ...(c.mask || {}) };
  const D = { scale: 1, opacity: 1, vol: 1 };
  for (const k of ['x', 'y', 'w', 'h', 'scale', 'rot', 'opacity', 'vol', 'trim', 'start', 'duration', 'fadeIn', 'fadeOut'])
    if (typeof c[k] !== 'number') c[k] = D[k] ?? 0;
  if (!c.w) c.w = 200; if (!c.h) c.h = 120;
  c.muted = !!c.muted; c.removeAudio = !!c.removeAudio;
  if (c.kind === 'text') {
    c.text = c.text ?? 'Text'; c.font = c.font || 'Arial'; c.size = c.size || 64;
    c.color = c.color || '#ffffff'; c.strokeW = c.strokeW || 0; c.strokeColor = c.strokeColor || '#000000';
    c.shadowBlur = c.shadowBlur || 0; c.shadowColor = c.shadowColor || '#000000';
  }
  if (c.kind === 'shape') c.shapeColor = c.shapeColor || accent();
  return c;
}
function fitSize(m) {
  const ar = (m.w && m.h) ? m.w / m.h : 16 / 9;
  let w = PW(), h = w / ar; if (h > PH()) { h = PH(); w = h * ar; }
  return { w: Math.round(w), h: Math.round(h) };
}
function makeClip(mediaId, track, start) {
  const m = S.media.get(mediaId), f = fitSize(m);
  return norm({ id: uid(), mediaId, track, start, duration: m.duration || 5, x: 0, y: 0, w: f.w, h: f.h });
}
function makeAudioClip(mediaId, start) {
  const m = S.media.get(mediaId);
  return norm({ id: uid(), mediaId, track: 'a1', start, duration: m.duration || 5 });
}
function makeOverlay(kind, opts = {}) {
  const o = norm({
    id: uid(), kind, start: S.playhead, duration: 5, x: 0, y: 0, w: 320, h: 200, opacity: 1,
    mediaId: null, text: 'Your text', font: 'Arial', size: 64, bold: false, italic: false, color: '#ffffff',
    strokeW: 0, strokeColor: '#000000', shadowBlur: 0, shadowColor: '#000000',
    shape: 'rect', shapeColor: accent(),
  });
  Object.assign(o, opts);
  if (o.mediaId) {
    const m = S.media.get(o.mediaId);
    if (m) {
      const f = fitSize(m); o.w = f.w; o.h = f.h;
      if (m.kind === 'video') o.duration = m.duration || 5;
      if (m.kind === 'image') o.duration = 5;
    }
  }
  return o;
}
function addMediaAt(id) {
  const m = S.media.get(id); if (!m) return;
  const c = m.kind === 'audio' ? makeAudioClip(id, S.playhead) : makeClip(id, 'v1', S.playhead);
  (m.kind === 'audio' ? S.project.audio : S.project.clips).push(c);
  pushHistory(); afterChange();
  select({ kind: m.kind === 'audio' ? 'audio' : 'clip', id: c.id });
  toast(m.name + ' added');
}
function addOverlayFromMedia(id) {
  const m = S.media.get(id); if (!m || m.kind === 'audio') return;
  const o = makeOverlay(m.kind === 'video' ? 'video' : 'image', { mediaId: id });
  S.project.overlays.push(o); pushHistory(); afterChange();
  select({ kind: 'overlay', id: o.id });
}
function addText() { const o = makeOverlay('text'); S.project.overlays.push(o); pushHistory(); afterChange(); select({ kind: 'overlay', id: o.id }); }
function addShape(shape) { const o = makeOverlay('shape', { shape, w: 340, h: 220 }); S.project.overlays.push(o); pushHistory(); afterChange(); select({ kind: 'overlay', id: o.id }); }

function afterChange() {
  markDirty(); scheduleTL(); renderPanel(); updateTransport(); updateStageHint();
}
function updateStageHint() {
  $('#stageHint').style.display = (S.project.clips.length || S.project.overlays.length) ? 'none' : '';
}

const serialize = () => ({ clips: S.project.clips, overlays: S.project.overlays, audio: S.project.audio, res: S.project.res, resSet: S.project.resSet });
async function saveProject(silent) {
  S.project.name = $('#projName').value.trim() || 'Untitled Project';
  try { await idbPut('projects', { id: S.project.id, name: S.project.name, saved: Date.now(), state: serialize() }); }
  catch (e) { toast('Could not save — storage full?'); return false; }
  if (!silent) toast('Project saved');
  return true;
}
const autosave = debounce(() => saveProject(true), 3000);

async function ensureMedia(ids) {
  await Promise.all([...new Set(ids)].map(async id => {
    if (S.media.has(id)) return;
    const rec = await idbGet('media', id);
    if (rec) S.media.set(id, { id: rec.id, name: rec.name, kind: rec.kind, url: URL.createObjectURL(rec.blob), size: rec.size, duration: rec.duration, w: rec.w, h: rec.h, thumb: rec.thumb });
  }));
}
async function loadState(state) {
  S.project.clips = state.clips || []; S.project.overlays = state.overlays || []; S.project.audio = state.audio || [];
  S.project.res = state.res || { w: 1280, h: 720 }; S.project.resSet = !!state.resSet;
  await ensureMedia([...S.project.clips, ...S.project.overlays, ...S.project.audio].map(c => c.mediaId).filter(Boolean));
  [...S.project.clips, ...S.project.overlays, ...S.project.audio].forEach(norm);
}
async function loadProjectById(id) {
  const p = await idbGet('projects', id); if (!p) return;
  purgeEls();
  await loadState(p.state);
  S.project.id = p.id; S.project.name = p.name; $('#projName').value = p.name;
  hist.past.length = 0; hist.future.length = 0; S.sel = null; S.selKf = null; S.playhead = 0;
  syncViewSize(); afterChange(); renderTimeline(); renderLibrary();
  closeModal('#projectsModal'); toast('Loaded “' + p.name + '”');
}
async function loadProjectList() {
  const list = (await idbAll('projects')).sort((a, b) => b.saved - a.saved);
  const box = $('#projList');
  box.innerHTML = list.length ? '' : '<div class="muted">No saved projects yet.</div>';
  for (const p of list) {
    const d = document.createElement('div');
    d.className = 'prow-item';
    d.innerHTML = '<span class="pn">' + esc(p.name) + '</span><span class="pd">' + new Date(p.saved).toLocaleString() + '</span>' +
      '<button class="btn" data-load="' + p.id + '">Load</button><button class="btn danger" data-del="' + p.id + '">✕</button>';
    box.appendChild(d);
  }
}
function newProjectFlow() {
  if (!confirm('Start a new project? The current one stays auto-saved.')) return;
  purgeEls();
  S.project = newProject(); $('#projName').value = S.project.name;
  hist.past.length = 0; hist.future.length = 0; S.sel = null; S.selKf = null; S.playhead = 0;
  afterChange(); renderTimeline(); toast('New project');
}

/* ---------- undo / redo (lightweight state snapshots, no media blobs) ---------- */
const hist = { past: [], future: [] };
const snapshot = () => JSON.stringify(serialize());
function pushHistory() {
  hist.past.push(snapshot());
  if (hist.past.length > 60) hist.past.shift();
  hist.future.length = 0;
  autosave();
}
function restore(json) {
  const s = JSON.parse(json);
  S.project.clips = s.clips || []; S.project.overlays = s.overlays || []; S.project.audio = s.audio || [];
  S.project.res = s.res || { w: 1280, h: 720 }; S.project.resSet = !!s.resSet;
  [...S.project.clips, ...S.project.overlays, ...S.project.audio].forEach(norm);
  if (S.sel && !selObj()) { S.sel = null; S.selKf = null; }
  syncViewSize(); afterChange(); renderTimeline();
}
function undo() { if (!hist.past.length) return; hist.future.push(snapshot()); restore(hist.past.pop()); }
function redo() { if (!hist.future.length) return; hist.past.push(snapshot()); restore(hist.future.pop()); }

/* ---------- timeline ---------- */
const TRACKS = [
  { id: 'v1', type: 'video', label: 'V1' },
  { id: 'v2', type: 'video', label: 'V2' },
  { id: 'ov', type: 'overlay', label: 'OV' },
  { id: 'a1', type: 'audio', label: 'A1' },
  { id: 'a2', type: 'audio', label: 'A2' },
];
const rowH = 44, GUT = 52;
let tlPending = false;
function scheduleTL() {
  if (tlPending) return; tlPending = true;
  requestAnimationFrame(() => { tlPending = false; renderTimeline(); });
}
function clipLabel(c) {
  if (c.kind === 'text') return '“' + (c.text || '').slice(0, 18) + '”';
  if (c.kind === 'shape') return c.shape;
  const m = c.mediaId && S.media.get(c.mediaId);
  return m ? m.name : 'missing media';
}
function listOfSel() {
  return S.sel.kind === 'clip' ? S.project.clips : S.sel.kind === 'overlay' ? S.project.overlays : S.project.audio;
}
function selObj() {
  if (!S.sel) return null;
  const list = S.sel.kind === 'clip' ? S.project.clips : S.sel.kind === 'overlay' ? S.project.overlays : S.project.audio;
  return list.find(c => c.id === S.sel.id) || null;
}
function select(sel) { S.sel = sel; S.selKf = null; renderPanel(); renderKfLane(); renderTimeline(); markDirty(); }

function renderTimeline() {
  const dur = projectDuration();
  const contentW = Math.max(dur * S.zoom, $('#tlScroll').clientWidth - GUT - 10);
  $('#tlInner').style.width = (GUT + contentW) + 'px';
  drawRuler(contentW, dur);
  const tracks = $('#tracks'); tracks.innerHTML = '';
  for (const tr of TRACKS) {
    const row = document.createElement('div');
    row.className = 'trow';
    row.innerHTML = '<div class="tlabel">' + tr.label + '</div>';
    const layer = document.createElement('div');
    layer.className = 'tclips';
    const list = tr.type === 'video' ? S.project.clips.filter(c => c.track === tr.id)
      : tr.type === 'overlay' ? S.project.overlays
      : S.project.audio.filter(c => c.track === tr.id);
    for (const c of list) layer.appendChild(clipDiv(c, tr.type));
    row.appendChild(layer); tracks.appendChild(row);
  }
  renderKfLane();
  updatePlayheadEl();
  $('#seek').max = dur;
}
function clipDiv(c, type) {
  const d = document.createElement('div');
  const kind = c.kind || (type === 'audio' ? 'audio' : ((S.media.get(c.mediaId) || {}).kind || 'video'));
  d.className = 'clip ' + kind + (S.sel && S.sel.id === c.id ? ' sel' : '');
  d.style.left = (c.start * S.zoom) + 'px';
  d.style.width = Math.max(6, c.duration * S.zoom) + 'px';
  d.title = clipLabel(c) + ' — click to select · drag to move · edges to trim';
  d.innerHTML = '<span class="cname">' + esc(clipLabel(c)) + '</span><div class="handle l"></div><div class="handle r"></div>';
  d.addEventListener('pointerdown', e => clipPointerDown(e, c, type === 'audio' ? 'audio' : type === 'overlay' ? 'overlay' : 'clip'));
  return d;
}
function drawRuler(width, dur) {
  const cv = $('#ruler'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = width * dpr; cv.height = 26 * dpr; cv.style.width = width + 'px';
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  x.clearRect(0, 0, width, 26);
  x.strokeStyle = css.getPropertyValue('--line').trim();
  x.fillStyle = css.getPropertyValue('--muted').trim();
  x.font = '10px system-ui';
  x.beginPath();
  const step = S.zoom > 120 ? 1 : S.zoom > 50 ? 2 : S.zoom > 20 ? 5 : 10;
  for (let t = 0; t <= dur; t += step) {
    const px = t * S.zoom;
    x.moveTo(px, 16); x.lineTo(px, 26);
    x.fillText(fmt(t), px + 3, 11);
    if (step > 1) for (let m = 1; m < 5; m++) {
      const q = t + m * step / 5; if (q > dur) break;
      x.moveTo(q * S.zoom, 21); x.lineTo(q * S.zoom, 26);
    }
  }
  x.stroke();
}
function updatePlayheadEl() { $('#playhead').style.left = (GUT + S.playhead * S.zoom) + 'px'; }

/* clip drag / trim on the timeline */
let clipDrag = null;
function clipPointerDown(e, c, kind) {
  if (e.button !== 0) return;
  e.stopPropagation();
  select({ kind, id: c.id });
  const mode = e.target.classList.contains('handle') ? (e.target.classList.contains('l') ? 'trimL' : 'trimR') : 'move';
  clipDrag = {
    mode, c, kind, x0: e.clientX, tracksTop: $('#tracks').getBoundingClientRect().top,
    orig: { start: c.start, duration: c.duration, trim: c.trim || 0, track: c.track }, moved: false,
  };
  window.addEventListener('pointermove', clipDragMove);
  window.addEventListener('pointerup', clipDragUp, { once: true });
}
function clipDragMove(e) {
  const d = clipDrag; if (!d) return;
  const dx = (e.clientX - d.x0) / S.zoom;
  const c = d.c, m = c.mediaId ? S.media.get(c.mediaId) : null;
  if (Math.abs(dx) > 0.0005) d.moved = true;
  if (d.mode === 'move') {
    c.start = clamp(d.orig.start + dx, 0, 1e6);
    const idx = clamp(Math.floor((e.clientY - d.tracksTop) / rowH), 0, TRACKS.length - 1);
    const tr = TRACKS[idx];
    if (d.kind === 'clip' && tr.type === 'video') c.track = tr.id;
    if (d.kind === 'audio' && tr.type === 'audio') c.track = tr.id;
  } else if (d.mode === 'trimL') {
    let td = clamp(dx, -d.orig.start, d.orig.duration - 0.2);
    td = Math.max(td, -d.orig.trim);
    if (m && m.duration) td = Math.min(td, m.duration - d.orig.trim - d.orig.duration);
    c.start = d.orig.start + td; c.duration = d.orig.duration - td; c.trim = d.orig.trim + td;
  } else {
    let nd = clamp(d.orig.duration + dx, 0.2, 7200);
    if (m && m.duration) nd = Math.min(nd, m.duration - d.orig.trim);
    c.duration = nd;
  }
  scheduleTL(); markDirty();
}
function clipDragUp() {
  window.removeEventListener('pointermove', clipDragMove);
  if (clipDrag && clipDrag.moved) pushHistory();
  clipDrag = null;
  afterChange(); renderTimeline();
}

/* ---------- clip ops: split / duplicate / delete ---------- */
function filterKf(kf, t, mode) {
  const o = {};
  for (const k in kf) {
    const arr = (kf[k] || []).filter(f => mode === 'left' ? f.t <= t + 0.001 : f.t >= t - 0.001);
    if (arr.length) o[k] = arr;
  }
  return o;
}
function shiftKf(kf, dt) {
  const o = {};
  for (const k in kf) o[k] = (kf[k] || []).map(f => ({ ...f, t: Math.max(0, f.t + dt) }));
  return o;
}
function splitSelected() {
  const c = selObj(); if (!c) return;
  const t = S.playhead;
  if (t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) { toast('Move the playhead inside the selected clip first'); return; }
  const leftDur = t - c.start;
  const rightKf = shiftKf(filterKf(c.kf || {}, t, 'right'), -t);
  const leftKf = filterKf(c.kf || {}, t, 'left');
  const right = JSON.parse(JSON.stringify(c));
  right.id = uid(); right.start = t; right.duration = c.duration - leftDur; right.kf = rightKf;
  const rm = right.mediaId ? S.media.get(right.mediaId) : null;
  if (rm && rm.kind !== 'image') right.trim = (c.trim || 0) + leftDur;
  c.duration = leftDur; c.kf = leftKf;
  listOfSel().splice(listOfSel().indexOf(c) + 1, 0, right);
  pushHistory(); afterChange(); renderTimeline();
}
function duplicateSelected() {
  const c = selObj(); if (!c) return;
  const copy = JSON.parse(JSON.stringify(c));
  copy.id = uid(); copy.start += c.duration; copy.kf = shiftKf(copy.kf || {}, c.duration);
  listOfSel().push(copy);
  pushHistory(); afterChange(); renderTimeline();
  select({ kind: S.sel.kind, id: copy.id });
}
function deleteSelected() {
  const c = selObj(); if (!c) return;
  const list = listOfSel();
  list.splice(list.indexOf(c), 1);
  dropEl(c.id);
  S.sel = null; S.selKf = null;
  pushHistory(); afterChange(); renderTimeline();
}

/* ---------- playback ---------- */
const view = $('#view'), viewCtx = view.getContext('2d', { alpha: false });
function syncViewSize() { view.width = PW(); view.height = PH(); view.style.aspectRatio = PW() + ' / ' + PH(); markDirty(); }
function setPlaying(v) {
  S.playing = v;
  $('#playBtn').textContent = v ? '❚❚' : '▶';
  markDirty();
  if (!v) for (const [, el] of els) el.pause();
}
function togglePlay() {
  if (S.playhead >= projectDuration() - 0.03) S.playhead = 0;
  setPlaying(!S.playing);
}
function setPlayhead(t) { S.playhead = clamp(t, 0, projectDuration()); markDirty(); }
function updateTransport() {
  $('#timeCur').textContent = fmt(S.playhead);
  $('#timeDur').textContent = fmt(projectDuration());
  $('#seek').value = S.playhead; $('#seek').max = projectDuration();
  updatePlayheadEl();
}

/* keep every media element parked exactly where the playhead says */
function syncMedia(t) {
  const active = new Set();
  const handle = c => {
    const m = c.mediaId ? S.media.get(c.mediaId) : null;
    if (!m || m.kind === 'image') return;
    const el = clipEl(c); if (!el) return;
    const end = c.start + c.duration;
    if (t >= c.start && t < end) {
      active.add(c.id);
      const lt = clamp((c.trim || 0) + (t - c.start), 0, m.duration || end);
      if (!S.playing) {
        if (Math.abs(el.currentTime - lt) > 0.04) { try { el.currentTime = lt; } catch (e) { /* seeking */ } }
        el.pause();
      } else {
        if (Math.abs(el.currentTime - lt) > 0.35) { try { el.currentTime = lt; } catch (e) { /* seeking */ } }
        if (el.paused) el.play().catch(() => { /* autoplay noise */ });
      }
      let g = c.vol ?? 1;                                   // fades + volume keyframes
      if (c.fadeIn > 0) g *= clamp((t - c.start) / c.fadeIn, 0, 1);
      if (c.fadeOut > 0) g *= clamp((end - t) / c.fadeOut, 0, 1);
      const kv = kfVal((c.kf || {}).vol, t);
      if (kv !== undefined) g *= kv;
      el.volume = clamp(g * S.masterVol, 0, 1);
      el.muted = !!c.muted || !!c.removeAudio;
    } else if (!el.paused) el.pause();
  };
  S.project.clips.forEach(handle);
  S.project.overlays.forEach(o => { if (o.mediaId || o.kind === 'video') handle(o); });
  S.project.audio.forEach(handle);
  for (const [id, el] of els) if (!active.has(id) && !el.paused) el.pause();
}

/* the one and only rAF loop — renders only when dirty */
let lastTs = 0;
function tick(ts) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts;
  if (S.playing) {
    S.playhead += dt;
    if (S.playhead >= projectDuration()) { S.playhead = projectDuration(); setPlaying(false); }
    S.dirty = true;
  }
  if (S.dirty) {
    S.dirty = false;
    syncMedia(S.playhead);
    const target = S.exportRun ? S.exportRun.ctx : viewCtx;
    drawScene(target, target.canvas.width, target.canvas.height, S.playhead);
    if (!S.exportRun) drawHandles(viewCtx);
    updateTransport();
  }
  if (S.exportRun) $('#expBar').style.width = (S.playhead / projectDuration() * 100) + '%';
}

/* ---------- render pipeline ---------- */
function drawScene(ctx, W, H, t) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.scale(W / PW(), H / PH());
  for (const tr of TRACKS) if (tr.type === 'video')
    for (const c of S.project.clips)
      if (c.track === tr.id && t >= c.start && t < c.start + c.duration) drawItem(ctx, c, t);
  for (const o of S.project.overlays)
    if (t >= o.start && t < o.start + o.duration) drawItem(ctx, o, t);
  ctx.restore();
}
function fxFilter(f) {
  const p = [];
  if (f.brightness !== 1) p.push('brightness(' + f.brightness + ')');
  if (f.exposure) p.push('brightness(' + (1 + f.exposure) + ')');
  if (f.contrast !== 1) p.push('contrast(' + f.contrast + ')');
  if (f.saturation !== 1) p.push('saturate(' + f.saturation + ')');
  if (f.gray) p.push('grayscale(' + f.gray + ')');
  if (f.blur) p.push('blur(' + f.blur + 'px)');
  return p.length ? p.join(' ') : 'none';
}
/* pooled scratch canvases — created once, resized on demand */
const bakeCv = document.createElement('canvas'), bakeCtx = bakeCv.getContext('2d');
const chromaCv = document.createElement('canvas'), chromaCtx = chromaCv.getContext('2d');
const maskCv = document.createElement('canvas'), maskCtx = maskCv.getContext('2d');

function drawItem(ctx, c, t) {
  const P = props(c, t);
  const m = c.mediaId ? S.media.get(c.mediaId) : null;
  const kind = m ? m.kind : c.kind;
  ctx.save();
  ctx.globalAlpha = clamp(P.opacity, 0, 1);
  ctx.translate(PW() / 2 + P.x, PH() / 2 + P.y);
  ctx.rotate(P.rot * Math.PI / 180);
  ctx.scale(P.scale, P.scale);
  ctx.filter = fxFilter(P.fx);
  if (kind === 'text') { drawText(ctx, c); ctx.restore(); return; }
  if (kind === 'shape') { drawShape(ctx, c, P); ctx.restore(); return; }
  if (!m) { ctx.restore(); return; }
  const src = m.kind === 'image' ? mediaImg(m) : clipEl(c);
  if (!src || (src.tagName === 'IMG' && !(src.complete && src.naturalWidth)) || (src.tagName === 'VIDEO' && src.readyState < 2)) { ctx.restore(); return; }
  const chromaOn = P.chroma.on && kind === 'video' && P.chroma.strength > 0;
  const maskOn = P.mask.on && P.mask.opacity > 0;
  if (!chromaOn && !maskOn) {                       // fast path: straight to screen
    ctx.drawImage(src, -P.w / 2, -P.h / 2, P.w, P.h);
    ctx.restore(); return;
  }
  const sc = Math.min(1, 1500 / Math.max(P.w, 1));  // cap bake resolution
  const iw = Math.max(2, Math.round(P.w * sc)), ih = Math.max(2, Math.round(P.h * sc));
  bakeCv.width = iw; bakeCv.height = ih;
  if (chromaOn) {
    bakeCtx.filter = 'none';
    bakeCtx.drawImage(chromaFrame(src, P, iw, ih), 0, 0, iw, ih);
  } else {
    bakeCtx.filter = fxFilter(P.fx);
    bakeCtx.drawImage(src, 0, 0, iw, ih);
    bakeCtx.filter = 'none';
  }
  if (maskOn) applyMask(P, iw, ih, sc);
  ctx.filter = 'none';
  ctx.drawImage(bakeCv, -P.w / 2, -P.h / 2, P.w, P.h);
  ctx.restore();
}
function drawText(ctx, c) {
  ctx.font = (c.italic ? 'italic ' : '') + (c.bold ? '700 ' : '400 ') + c.size + 'px ' + c.font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (c.shadowBlur > 0) { ctx.shadowColor = c.shadowColor; ctx.shadowBlur = c.shadowBlur; }
  if (c.strokeW > 0) { ctx.lineWidth = c.strokeW * 2; ctx.strokeStyle = c.strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(c.text, 0, 0); }
  ctx.fillStyle = c.color; ctx.fillText(c.text, 0, 0);
}
function traceShape(ctx, shape, x, y, w, h) {
  ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  else if (shape === 'round') {
    const r = Math.min(Math.abs(w), Math.abs(h)) * 0.25;
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  } else if (shape === 'poly') {
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3, px = cx + Math.cos(a) * w / 2, py = cy + Math.sin(a) * h / 2;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  } else ctx.rect(x, y, w, h);
}
function drawShape(ctx, c, P) {
  traceShape(ctx, c.shape, -P.w / 2, -P.h / 2, P.w, P.h);
  ctx.fillStyle = c.shapeColor; ctx.fill();
}

/* chroma key — pixel pass runs only for visible chroma'd video */
function chromaFrame(src, P, iw, ih) {
  chromaCv.width = iw; chromaCv.height = ih;
  chromaCtx.filter = fxFilter(P.fx);
  chromaCtx.drawImage(src, 0, 0, iw, ih);
  chromaCtx.filter = 'none';
  const key = hex2rgb(P.chroma.color);
  const img = chromaCtx.getImageData(0, 0, iw, ih), d = img.data;
  const tol = P.chroma.tol, soft = Math.max(0.02, P.chroma.soft), st = P.chroma.strength;
  const kr = key.r, kg = key.g, kb = key.b;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.68;
    let a = clamp((dist - tol) / soft, 0, 1);
    a = 1 - st * (1 - a);
    d[i + 3] = d[i + 3] * a;
  }
  chromaCtx.putImageData(img, 0, 0);
  return chromaCv;
}

/* masks — shape alpha composited onto the baked frame */
function applyMask(P, iw, ih, sc) {
  const M = P.mask;
  maskCv.width = iw; maskCv.height = ih;
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.clearRect(0, 0, iw, ih);
  maskCtx.save();
  maskCtx.translate(iw / 2 + M.x * sc, ih / 2 + M.y * sc);
  maskCtx.rotate(M.rot * Math.PI / 180);
  if (M.feather > 0) maskCtx.filter = 'blur(' + (M.feather * sc) + 'px)';
  maskCtx.fillStyle = '#fff';
  if (M.invert) {
    maskCtx.globalAlpha = M.opacity;
    maskCtx.fillRect(-iw, -ih, iw * 2, ih * 2);
    maskCtx.globalAlpha = 1;
    maskCtx.globalCompositeOperation = 'destination-out';
    traceShape(maskCtx, M.shape, -M.w * sc / 2, -M.h * sc / 2, M.w * sc, M.h * sc);
    maskCtx.fill();
  } else {
    maskCtx.globalAlpha = M.opacity;
    traceShape(maskCtx, M.shape, -M.w * sc / 2, -M.h * sc / 2, M.w * sc, M.h * sc);
    maskCtx.fill();
  }
  maskCtx.restore();
  bakeCtx.globalCompositeOperation = 'destination-in';
  bakeCtx.drawImage(maskCv, 0, 0);
  bakeCtx.globalCompositeOperation = 'source-over';
}

/* ---------- preview interactions: move / resize / rotate overlays ---------- */
function toCanvas(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) * PW() / r.width, y: (e.clientY - r.top) * PH() / r.height };
}
function itemGeometry(c) {
  const P = props(c, S.playhead);
  const cx = PW() / 2 + P.x, cy = PH() / 2 + P.y, rot = P.rot * Math.PI / 180, s = P.scale;
  const spin = (lx, ly) => ({ x: cx + lx * Math.cos(rot) - ly * Math.sin(rot), y: cy + lx * Math.sin(rot) + ly * Math.cos(rot) });
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => spin(a * P.w / 2 * s, b * P.h / 2 * s));
  return { P, cx, cy, rot, corners, rotH: spin(0, -P.h / 2 * s - 30) };
}
function drawHandles(ctx) {
  if (!S.sel || S.sel.kind !== 'overlay') return;
  const c = selObj(); if (!c) return;
  const g = itemGeometry(c);
  ctx.save();
  ctx.strokeStyle = accent(); ctx.lineWidth = 1.5; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  g.corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath(); ctx.stroke();
  const tm = { x: (g.corners[0].x + g.corners[1].x) / 2, y: (g.corners[0].y + g.corners[1].y) / 2 };
  ctx.beginPath(); ctx.moveTo(tm.x, tm.y); ctx.lineTo(g.rotH.x, g.rotH.y); ctx.stroke();
  g.corners.forEach(p => { ctx.beginPath(); ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.fill(); ctx.stroke(); });
  ctx.beginPath(); ctx.arc(g.rotH.x, g.rotH.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function handleAt(p) {
  const c = selObj();
  if (!c || S.sel.kind !== 'overlay') return null;
  const g = itemGeometry(c);
  if (Math.hypot(p.x - g.rotH.x, p.y - g.rotH.y) <= 10) return 'rot';
  for (let i = 0; i < 4; i++) {
    const q = g.corners[i];
    if (Math.abs(p.x - q.x) <= 8 && Math.abs(p.y - q.y) <= 8) return i;
  }
  return null;
}
function overlayAt(p) {
  for (let i = S.project.overlays.length - 1; i >= 0; i--) {
    const c = S.project.overlays[i];
    if (S.playhead < c.start || S.playhead >= c.start + c.duration) continue;
    const g = itemGeometry(c), dx = p.x - g.cx, dy = p.y - g.cy, r = -g.rot;
    const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / g.P.scale;
    const ly = (dx * Math.sin(r) + dy * Math.cos(r)) / g.P.scale;
    if (Math.abs(lx) <= g.P.w / 2 + 3 && Math.abs(ly) <= g.P.h / 2 + 3) return c;
  }
  return null;
}
let ovDrag = null;
view.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const p = toCanvas(e);
  if (S.eyedrop) { eyedropAt(p); return; }
  const h = handleAt(p);
  if (h !== null) {
    const c = selObj();
    ovDrag = { mode: h, c, sp: p };
  } else {
    const c = overlayAt(p);
    if (c) { select({ kind: 'overlay', id: c.id }); ovDrag = { mode: 'move', c, sp: p, ox: c.x, oy: c.y }; }
    else select(null);
  }
  if (ovDrag) {
    window.addEventListener('pointermove', ovDragMove);
    window.addEventListener('pointerup', ovDragUp, { once: true });
  }
});
function ovDragMove(e) {
  const d = ovDrag; if (!d) return;
  const p = toCanvas(e), c = d.c;
  if (d.mode === 'move') { c.x = d.ox + (p.x - d.sp.x); c.y = d.oy + (p.y - d.sp.y); }
  else if (d.mode === 'rot') {
    const g = itemGeometry(c);
    c.rot = Math.atan2(p.y - g.cy, p.x - g.cx) * 180 / Math.PI + 90;
  } else {
    const g = itemGeometry(c), dx = p.x - g.cx, dy = p.y - g.cy, r = -g.rot;
    const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / g.P.scale;
    const ly = (dx * Math.sin(r) + dy * Math.cos(r)) / g.P.scale;
    c.w = clamp(Math.abs(lx) * 2, 10, PW() * 3);
    c.h = clamp(Math.abs(ly) * 2, 10, PH() * 3);
  }
  markDirty();
}
function ovDragUp() {
  window.removeEventListener('pointermove', ovDragMove);
  ovDrag = null;
  pushHistory(); renderPanel();
}
function eyedropAt(p) {
  drawScene(viewCtx, view.width, view.height, S.playhead);
  const x = clamp(p.x | 0, 0, view.width - 1), y = clamp(p.y | 0, 0, view.height - 1);
  const d = viewCtx.getImageData(x, y, 1, 1).data;
  const c = selObj();
  if (c && c.chroma) c.chroma.color = rgb2hex(d[0], d[1], d[2]);
  S.eyedrop = false; view.classList.remove('eyedrop');
  markDirty(); renderPanel();
  toast('Key color ' + rgb2hex(d[0], d[1], d[2]));
}

/* ---------- keyframes ---------- */
function ease(p, e) {
  if (e === 'in') return p * p;
  if (e === 'out') return 1 - (1 - p) * (1 - p);
  if (e === 'inout') return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  return p;
}
function kfVal(arr, t) {
  if (!arr || !arr.length) return undefined;
  if (t <= arr[0].t) return arr[0].v;
  const last = arr[arr.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = (t - a.t) / ((b.t - a.t) || 1e-6);
      return a.v + (b.v - a.v) * ease(p, b.ease || a.ease);
    }
  }
  return last.v;
}
/* resolve an item's live properties at time t (base values + keyframes) */
function props(c, t) {
  const P = {
    x: c.x, y: c.y, w: c.w, h: c.h, scale: c.scale, rot: c.rot, opacity: c.opacity, vol: c.vol,
    fx: { ...c.fx }, chroma: { ...c.chroma }, mask: { ...c.mask },
  };
  const kf = c.kf;
  if (kf) for (const k in kf) {
    const v = kfVal(kf[k], t);
    if (v === undefined) continue;
    const dot = k.indexOf('.');
    if (dot < 0) P[k] = v;
    else {
      const tg = k.slice(0, dot), p = k.slice(dot + 1);
      if (tg === 'fx') P.fx[p] = v; else if (tg === 'mask') P.mask[p] = v; else if (tg === 'chroma') P.chroma[p] = v;
    }
  }
  return P;
}
const kfKey = (t, p) => t ? t + '.' + p : p;
function targetObj(t) {
  const c = selObj(); if (!c) return null;
  return t === 'fx' ? c.fx : t === 'mask' ? c.mask : t === 'chroma' ? c.chroma : c;
}
function kfGet(key, create) {
  const c = selObj(); if (!c) return null;
  if (create) c.kf = c.kf || {};
  if (!c.kf) return null;
  if (create && !c.kf[key]) c.kf[key] = [];
  return c.kf[key] || null;
}
function kfsArr(prop) { const c = selObj(); return c && c.kf ? c.kf[prop] : null; }
function hasKf(key) { const a = kfGet(key, false); return !!(a && a.length); }
function curVal(key) {
  const c = selObj(); if (!c) return 0;
  const dot = key.indexOf('.');
  if (dot < 0) return c[key];
  const tg = key.slice(0, dot), p = key.slice(dot + 1);
  const o = tg === 'fx' ? c.fx : tg === 'mask' ? c.mask : c.chroma;
  return o ? o[p] : 0;
}
function upsertKf(arr, t, v) {
  const f = arr.find(x => Math.abs(x.t - t) < 0.06);
  if (f) f.v = v;
  else { arr.push({ t, v, ease: 'linear' }); arr.sort((a, b) => a.t - b.t); }
}
function toggleKf(key) {
  if (!selObj()) return;
  const arr = kfGet(key, true);
  const i = arr.findIndex(f => Math.abs(f.t - S.playhead) < 0.06);
  if (i >= 0) arr.splice(i, 1); else upsertKf(arr, S.playhead, curVal(key));
  pushHistory(); renderPanel(); renderKfLane(); markDirty();
}
function renderKfLane() {
  const lane = $('#kfLane');
  const c = selObj();
  let html = '<div class="tlabel" style="position:sticky;left:4px;width:48px;z-index:5;background:var(--panel);height:100%;display:flex;align-items:center;padding-left:7px;font-size:10px;color:var(--muted)">◆ KF</div>';
  if (c && c.kf) {
    for (const k in c.kf) {
      (c.kf[k] || []).forEach((f, i) => {
        html += '<div class="kf-m' + (S.selKf && S.selKf.prop === k && S.selKf.idx === i ? ' sel' : '') + '" style="left:' + (f.t * S.zoom) + 'px" data-kfp="' + k + '" data-kfi="' + i + '" title="' + k + ' @ ' + fmt(f.t) + '"></div>';
      });
    }
  }
  lane.innerHTML = html;
}
$('#kfLane').addEventListener('pointerdown', e => {
  const m = e.target.closest('.kf-m');
  if (!m) return;
  e.stopPropagation();
  const prop = m.dataset.kfp, idx = +m.dataset.kfi;
  S.selKf = { prop, idx };
  setPlayhead(kfsArr(prop)[idx].t);
  renderKfLane(); renderPanel();
  const lane = $('#kfLane');
  const mv = ev => {
    const x = ev.clientX - lane.getBoundingClientRect().left;
    kfsArr(prop)[idx].t = clamp(x / S.zoom, 0, projectDuration());
    renderKfLane(); markDirty();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); pushHistory(); }, { once: true });
});

/* ---------- properties panel ---------- */
function kfBtn(t, p) {
  const key = kfKey(t, p);
  return '<button class="kf-btn' + (hasKf(key) ? ' on' : '') + '" data-kf="' + key + '" title="Add/remove keyframe at playhead">◆</button>';
}
function rowSlider(label, t, p, min, max, step) {
  const o = targetObj(t); if (!o) return '';
  const v = o[p];
  return '<div class="prow"><span class="plabel" title="' + label + '">' + label + '</span>' +
    '<input type="range" data-t="' + t + '" data-p="' + p + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '">' +
    '<input type="number" class="num" data-t="' + t + '" data-p="' + p + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + round2(v) + '">' +
    kfBtn(t, p) + '</div>';
}
function rowCheck(label, t, p) {
  const o = targetObj(t); if (!o) return '';
  return '<div class="prow"><span class="plabel">' + label + '</span><input type="checkbox" data-t="' + t + '" data-p="' + p + '"' + (o[p] ? ' checked' : '') + '></div>';
}
function rowColor(label, t, p) {
  const o = targetObj(t); if (!o) return '';
  let v = o[p]; if (!/^#([0-9a-f]{6})$/i.test(v)) v = '#ffffff';
  return '<div class="prow"><span class="plabel">' + label + '</span><input type="color" data-t="' + t + '" data-p="' + p + '" value="' + v + '">' + kfBtn(t, p) + '</div>';
}
function rowText(label, p) {
  const c = selObj();
  return '<div class="prow"><span class="plabel">' + label + '</span><input type="text" data-p="' + p + '" value="' + esc(c[p]) + '"></div>';
}
function rowSelect(label, t, p, opts) {
  const o = targetObj(t); if (!o) return '';
  return '<div class="prow"><span class="plabel">' + label + '</span><select data-t="' + t + '" data-p="' + p + '">' +
    opts.map(([v, l]) => '<option value="' + v + '"' + (o[p] === v ? ' selected' : '') + '>' + l + '</option>').join('') +
    '</select>' + kfBtn(t, p) + '</div>';
}
function rowNum(label, t, p, min, max, step) {
  const o = targetObj(t); if (!o) return '';
  return '<div class="prow"><span class="plabel">' + label + '</span>' +
    '<input type="number" class="num" style="flex:1" data-t="' + t + '" data-p="' + p + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + round2(o[p]) + '">' +
    kfBtn(t, p) + '</div>';
}
function audioSection(isAudioClip) {
  return '<div class="psection"><h3>Audio</h3>' +
    rowSlider('Volume', '', 'vol', 0, 2, 0.01) +
    rowCheck('Mute', '', 'muted') +
    (isAudioClip ? '' : rowCheck('Remove original', '', 'removeAudio')) +
    rowSlider('Fade in', '', 'fadeIn', 0, 10, 0.1) +
    rowSlider('Fade out', '', 'fadeOut', 0, 10, 0.1) +
    '<div class="muted">Original clip audio stays independent of audio-track files.</div></div>';
}
function renderPanel() {
  const p = $('#panel');
  const c = selObj();
  let kfEditor = '';
  if (S.selKf) {
    const arr = kfsArr(S.selKf.prop);
    if (arr && arr[S.selKf.idx]) {
      const f = arr[S.selKf.idx];
      kfEditor = '<div class="psection kf-editor"><h3>◆ Keyframe — ' + S.selKf.prop + '</h3>' +
        '<div class="prow"><span class="plabel">Time</span><input type="number" class="num" data-kft="t" min="0" step="0.1" value="' + round2(f.t) + '"></div>' +
        '<div class="prow"><span class="plabel">Value</span><input type="number" class="num" data-kft="v" step="0.01" value="' + round2(f.v) + '"></div>' +
        '<div class="prow"><span class="plabel">Ease</span><select data-kft="ease">' +
        ['linear', 'in', 'out', 'inout'].map(e2 => '<option' + (f.ease === e2 ? ' selected' : '') + '>' + e2 + '</option>').join('') +
        '</select><button class="kf-btn on" data-kfdel="1" title="Delete keyframe">✕</button></div></div>';
    } else S.selKf = null;
  }
  if (!c) {
    p.innerHTML = kfEditor +
      '<div class="psection"><h3>Project</h3><div class="muted">Nothing selected — click a clip or overlay to edit it.</div>' +
      '<div class="muted">Space — play/pause · S — split · Del — delete · Ctrl+Z — undo</div></div>' +
      '<div class="psection"><h3>Canvas</h3><div class="prow"><span class="plabel">Size</span><span class="muted">' + PW() + ' × ' + PH() + '</span></div></div>';
    return;
  }
  const kind = c.kind || ((c.mediaId && S.media.get(c.mediaId) || {}).kind);
  const isAudioClip = S.sel.kind === 'audio';
  const visual = !isAudioClip;
  let html = kfEditor +
    '<div class="phead"><span class="chip">' + S.sel.kind + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(clipLabel(c)) + '</span></div>' +
    '<div class="pactions"><button class="btn" data-act="split">✂ Split</button><button class="btn" data-act="dup">⧉ Duplicate</button><button class="btn danger" data-act="del">🗑 Delete</button></div>' +
    '<div class="psection"><h3>Timing</h3>' +
    rowNum('Start', '', 'start', 0, 9999, 0.1) +
    (isAudioClip ? rowNum('Duration', '', 'duration', 0.2, 9999, 0.1) : rowNum('End', '', 'end', 0.1, 9999, 0.1)) +
    '</div>';
  if (visual) {
    html += '<div class="psection"><h3>Transform</h3>' +
      '<div class="qacts"><button class="btn" data-act="centerH">Center H</button><button class="btn" data-act="centerV">Center V</button><button class="btn" data-act="fit">Fit</button><button class="btn" data-act="fill">Fill</button></div>' +
      rowSlider('X', '', 'x', -PW() * 2, PW() * 2, 1) +
      rowSlider('Y', '', 'y', -PH() * 2, PH() * 2, 1) +
      rowSlider('Width', '', 'w', 8, PW() * 2, 1) +
      rowSlider('Height', '', 'h', 8, PH() * 2, 1) +
      rowSlider('Scale', '', 'scale', 0.05, 5, 0.01) +
      rowSlider('Rotate', '', 'rot', -180, 180, 1) +
      rowSlider('Opacity', '', 'opacity', 0, 1, 0.01) +
      '</div>' +
      '<div class="psection"><h3>Effects</h3>' +
      rowSlider('Brightness', 'fx', 'brightness', 0, 2, 0.01) +
      rowSlider('Contrast', 'fx', 'contrast', 0, 2, 0.01) +
      rowSlider('Saturation', 'fx', 'saturation', 0, 2, 0.01) +
      rowSlider('Exposure', 'fx', 'exposure', -1, 1, 0.01) +
      rowSlider('Blur', 'fx', 'blur', 0, 30, 0.5) +
      rowSlider('Grayscale', 'fx', 'gray', 0, 1, 0.01) +
      '</div>';
    if (kind === 'video') {
      html += '<div class="psection"><h3>Chroma Key</h3>' +
        rowCheck('Enabled', 'chroma', 'on') +
        '<div class="prow"><span class="plabel">Key color</span><input type="color" data-t="chroma" data-p="color" value="' + (/^#([0-9a-f]{6})$/i.test(c.chroma.color) ? c.chroma.color : '#00b140') + '">' + kfBtn('chroma', 'color') +
        '<button class="btn" data-act="eyedrop" title="Pick a color from the preview" style="flex:none;font-size:11px;padding:3px 8px">🎨 Pick</button></div>' +
        rowSlider('Tolerance', 'chroma', 'tol', 0, 1, 0.01) +
        rowSlider('Strength', 'chroma', 'strength', 0, 1, 0.01) +
        rowSlider('Softness', 'chroma', 'soft', 0, 1, 0.01) +
        '</div>';
    }
    html += '<div class="psection"><h3>Mask</h3>' +
      rowCheck('Enabled', 'mask', 'on') +
      rowSelect('Shape', 'mask', 'shape', [['rect', 'Rectangle'], ['round', 'Rounded'], ['ellipse', 'Circle'], ['poly', 'Polygon']]) +
      rowSlider('X', 'mask', 'x', -PW(), PW(), 1) +
      rowSlider('Y', 'mask', 'y', -PH(), PH(), 1) +
      rowSlider('Width', 'mask', 'w', 8, PW() * 1.5, 1) +
      rowSlider('Height', 'mask', 'h', 8, PH() * 1.5, 1) +
      rowSlider('Rotate', 'mask', 'rot', -180, 180, 1) +
      rowSlider('Feather', 'mask', 'feather', 0, 80, 1) +
      rowSlider('Opacity', 'mask', 'opacity', 0, 1, 0.01) +
      rowCheck('Invert', 'mask', 'invert') +
      '</div>';
    if (kind === 'text') {
      html += '<div class="psection"><h3>Text</h3>' +
        rowText('Content', 'text') +
        rowSelect('Font', '', 'font', [['Arial', 'Arial'], ['Georgia', 'Georgia'], ['Verdana', 'Verdana'], ['Impact', 'Impact'], ["'Courier New'", 'Courier'], ["'Times New Roman'", 'Times'], ['system-ui', 'System']]) +
        rowSlider('Size', '', 'size', 8, 300, 1) +
        rowCheck('Bold', '', 'bold') +
        rowCheck('Italic', '', 'italic') +
        rowColor('Color', '', 'color') +
        rowSlider('Stroke', '', 'strokeW', 0, 20, 0.5) +
        rowColor('Stroke col', '', 'strokeColor') +
        rowSlider('Shadow', '', 'shadowBlur', 0, 40, 1) +
        rowColor('Shadow col', '', 'shadowColor') +
        '</div>';
    }
    if (kind === 'shape') html += '<div class="psection"><h3>Shape</h3>' + rowColor('Fill', '', 'shapeColor') + '</div>';
  }
  html += audioSection(isAudioClip);
  p.innerHTML = html;
}
function applyFromInput(el, commit) {
  const c = selObj(); if (!c) return;
  const t = el.dataset.t || '', p = el.dataset.p;
  const o = targetObj(t); if (!o) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range' || el.type === 'number') v = parseFloat(el.value) || 0;
  else v = el.value;
  if (p === 'end') o.duration = Math.max(0.2, v - o.start);
  else o[p] = v;
  if (commit) pushHistory();
  const arr = kfGet(kfKey(t, p), false);       // animated prop? ride the playhead
  if (arr) { upsertKf(arr, S.playhead, v); renderKfLane(); }
  $$('#panel [data-p="' + p + '"][data-t="' + t + '"]').forEach(x => { if (x !== el && x.type !== 'checkbox') x.value = el.value; });
  markDirty(); scheduleTL();
}
function doAct(act) {
  const c = selObj();
  switch (act) {
    case 'split': splitSelected(); return;
    case 'dup': duplicateSelected(); return;
    case 'del': deleteSelected(); return;
    case 'eyedrop':
      if (!c) return;
      S.eyedrop = true; view.classList.add('eyedrop');
      toast('Click a color in the preview'); return;
  }
  if (!c) return;
  if (act === 'centerH') c.x = 0;
  else if (act === 'centerV') c.y = 0;
  else if (act === 'fit') c.scale = Math.min(PW() / c.w, PH() / c.h);
  else if (act === 'fill') c.scale = Math.max(PW() / c.w, PH() / c.h);
  pushHistory(); markDirty(); renderPanel();
}

/* ---------- export (MediaRecorder, real-time render, graceful codec fallback) ---------- */
function pickMime() {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
  for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* keep looking */ } }
  return '';
}
async function runExport() {
  if (S.exportRun) return;
  const opts = { res: $('#expRes').value, fps: +$('#expFps').value, q: +$('#expQ').value, audio: $('#expAudio').checked };
  let EW, EH;
  if (opts.res === 'original') { EW = PW(); EH = PH(); }
  else { EH = +opts.res; EW = Math.round(EH * PW() / PH() / 2) * 2; }
  const cv = document.createElement('canvas'); cv.width = EW; cv.height = EH;
  const cx = cv.getContext('2d');
  const vs = cv.captureStream(opts.fps);
  const tracks = [...vs.getVideoTracks()];
  let actx = null; const srcNodes = [];
  if (opts.audio && window.AudioContext) {
    try {
      actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();
      const all = [...S.project.clips, ...S.project.overlays.filter(o => o.mediaId), ...S.project.audio];
      for (const c of all) {
        const m = c.mediaId ? S.media.get(c.mediaId) : null;
        if (!m || m.kind === 'image') continue;
        const el = clipEl(c); if (!el) continue;
        try { const n = actx.createMediaElementSource(el); n.connect(dest); srcNodes.push(n); } catch (e) { /* already sourced */ }
      }
      tracks.push(...dest.stream.getAudioTracks());
    } catch (e) { actx = null; }   // silent video fallback, never break
  }
  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: opts.q * 1e6, audioBitsPerSecond: 128000 } : { videoBitsPerSecond: opts.q * 1e6 });
  } catch (e) { toast('This browser cannot record video.'); if (actx) actx.close().catch(() => {}); return; }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });
  S.exportRun = { ctx: cx, rec, cancel: false };
  $('#expProgressWrap').classList.remove('hidden');
  $('#expBar').style.width = '0%';
  $('#doExport').disabled = true;
  setPlayhead(0); setPlaying(true);
  rec.start(250);
  await new Promise(res => {
    const h = setInterval(() => { if (!S.playing || S.exportRun.cancel) { clearInterval(h); res(); } }, 150);
  });
  const run = S.exportRun; S.exportRun = null;
  setPlaying(false);
  try { rec.stop(); } catch (e) { /* already stopped */ }
  await stopped;
  srcNodes.forEach(n => { try { n.disconnect(); } catch (e) { /* gone */ } });
  if (actx) actx.close().catch(() => {});
  purgeEls();                     // fresh elements → audio routes back to normal output
  $('#doExport').disabled = false;
  if (run.cancel) { $('#expProgressWrap').classList.add('hidden'); toast('Export cancelled'); return; }
  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  const name = (S.project.name || 'export').replace(/[^\w\- ]+/g, '').trim() || 'export';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name + (mime.includes('mp4') ? '.mp4' : '.webm');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  try { await idbPut('temp', { id: uid(), name: a.download, size: blob.size, created: Date.now(), lastUsed: Date.now(), expires: Date.now() + TTL, blob }); }
  catch (e) { toast('Export done — but temp storage is full (download is safe)'); }
  renderStorage();
  $('#expProgressWrap').classList.add('hidden');
  $('#expBar').style.width = '0%';
  toast('Export finished — check your downloads');
}

/* ---------- storage panel ---------- */
async function renderStorage() {
  let usage = 0, quota = 0;
  try { const est = await navigator.storage.estimate(); usage = est.usage || 0; quota = est.quota || 0; } catch (e) { /* unsupported */ }
  let temps = [];
  try { temps = await idbAll('temp'); } catch (e) { /* db not open */ }
  const now = Date.now();
  $('#storageInfo').innerHTML =
    '<div>Used: <b>' + mb(usage) + '</b>' + (quota ? ' of ~' + mb(quota) : '') + '</div>' +
    '<div>Temporary videos: <b>' + temps.length + '</b> · auto-deleted after 3 days</div>' +
    temps.map(t => {
      const left = t.expires - now;
      return '<div class="temp-row"><span>' + esc(t.name) + '</span><span>' + (left > 0 ? Math.ceil(left / 3600000) + 'h left' : 'expired') + '</span></div>';
    }).join('');
}

/* ---------- toast + modals ---------- */
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, 2200);
}
function openModal(s) { $(s).classList.remove('hidden'); }
function closeModal(s) { $(s).classList.add('hidden'); }

/* ---------- wiring ---------- */
const nudgeHist = debounce(() => pushHistory(), 500);
function wire() {
  $('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#newBtn').onclick = newProjectFlow;
  $('#saveBtn').onclick = () => saveProject(false);
  $('#projectsBtn').onclick = () => { loadProjectList(); openModal('#projectsModal'); };
  $('#projClose').onclick = () => closeModal('#projectsModal');
  $('#projList').addEventListener('click', async e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (l) loadProjectById(l.dataset.load);
    else if (d) { if (confirm('Delete this saved project?')) { await idbDel('projects', d.dataset.del); loadProjectList(); } }
  });
  $('#projName').addEventListener('change', () => autosave());

  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;
  $('#addTextBtn').onclick = addText;
  $('#shapeRect').onclick = () => addShape('rect');
  $('#shapeRound').onclick = () => addShape('round');
  $('#shapeCircle').onclick = () => addShape('ellipse');
  $('#shapeTri').onclick = () => addShape('poly');

  $('#importBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const lib = $('#library');
  lib.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { addMediaAt(add.dataset.add); return; }
    const it = e.target.closest('.mitem');
    if (it) selectMedia(it.dataset.id);
  });
  lib.addEventListener('dblclick', e => { const it = e.target.closest('.mitem'); if (it) addMediaAt(it.dataset.id); });
  window.addEventListener('dragover', e => { e.preventDefault(); lib.classList.add('drag'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) lib.classList.remove('drag'); });
  window.addEventListener('drop', e => {
    e.preventDefault(); lib.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  $('#mpAdd').onclick = () => { if (S.selMedia) addMediaAt(S.selMedia); };
  $('#mpOverlay').onclick = () => { if (S.selMedia) addOverlayFromMedia(S.selMedia); };

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.tabpage').forEach(x => x.classList.toggle('active', x.id === 'tab-' + t.dataset.tab));
    if (t.dataset.tab === 'storage') renderStorage();
  }));
  $('#clearTemp').onclick = async () => {
    if (!confirm('Delete all temporary exported videos?')) return;
    await idbClear('temp'); renderStorage(); toast('Temp videos cleared');
  };
  $('#clearAll').onclick = async () => {
    if (!confirm('Delete ALL cached media and temp videos?\nSaved projects will lose their media files.')) return;
    await idbClear('temp'); await idbClear('media'); renderStorage(); toast('Cache cleared');
  };

  $('#playBtn').onclick = togglePlay;
  $('#seek').addEventListener('input', e => setPlayhead(parseFloat(e.target.value)));
  $('#vol').addEventListener('input', e => { S.masterVol = parseFloat(e.target.value); markDirty(); });
  $('#fsBtn').onclick = () => {
    const st = $('#stage');
    if (document.fullscreenElement) document.exitFullscreen();
    else st.requestFullscreen && st.requestFullscreen().catch(() => { /* denied */ });
  };

  $('#tlZoomIn').onclick = () => setZoom(S.zoom * 1.25);
  $('#tlZoomOut').onclick = () => setZoom(S.zoom / 1.25);
  $('#splitBtn').onclick = splitSelected;
  $('#dupBtn').onclick = duplicateSelected;
  $('#delBtn').onclick = deleteSelected;

  $('#ruler').addEventListener('pointerdown', e => {
    const cv = $('#ruler');
    const scrub = ev => setPlayhead((ev.clientX - cv.getBoundingClientRect().left) / S.zoom);
    scrub(e);
    const mv = ev => scrub(ev);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  });
  $('#tracks').addEventListener('pointerdown', e => {
    if (e.target.classList.contains('tclips') || e.target.classList.contains('trow') || e.target.classList.contains('tlabel')) {
      select(null);
      const x = e.clientX - $('#tlInner').getBoundingClientRect().left - GUT;
      setPlayhead(x / S.zoom);
    }
  });

  $('#exportBtn').onclick = () => {
    if (!S.project.clips.length && !S.project.overlays.length) { toast('Add something to the timeline first'); return; }
    openModal('#exportModal');
  };
  $('#doExport').onclick = runExport;
  $('#expCancel').onclick = () => {
    if (S.exportRun) S.exportRun.cancel = true;
    else closeModal('#exportModal');
  };
  $$('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) closeModal('#' + m.id); }));

  $('#leftToggle').onclick = () => $('#left').classList.toggle('collapsed');
  $('#rightToggle').onclick = () => $('#right').classList.toggle('collapsed');

  $('#panel').addEventListener('input', e => {
    if (e.target.dataset.kft) {
      const f = kfsArr(S.selKf.prop)[S.selKf.idx], k = e.target.dataset.kft;
      f[k] = k === 'ease' ? e.target.value : (parseFloat(e.target.value) || 0);
      markDirty(); renderKfLane(); return;
    }
    if (e.target.dataset && e.target.dataset.p !== undefined) applyFromInput(e.target, false);
  });
  $('#panel').addEventListener('change', e => {
    if (e.target.dataset.kft) { pushHistory(); return; }
    if (e.target.dataset && e.target.dataset.p !== undefined) applyFromInput(e.target, true);
  });
  $('#panel').addEventListener('click', e => {
    const k = e.target.closest('[data-kf]');
    if (k) { toggleKf(k.dataset.kf); return; }
    if (e.target.closest('[data-kfdel]')) {
      const arr = kfsArr(S.selKf.prop);
      arr.splice(S.selKf.idx, 1); S.selKf = null;
      pushHistory(); renderPanel(); renderKfLane(); markDirty(); return;
    }
    const a = e.target.closest('[data-act]');
    if (a) doAct(a.dataset.act);
  });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key.toLowerCase() === 's' && !mod) { e.preventDefault(); splitSelected(); return; }
    const c = selObj();
    if (c && S.sel.kind === 'overlay' && e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') c.x -= step;
      else if (e.key === 'ArrowRight') c.x += step;
      else if (e.key === 'ArrowUp') c.y -= step;
      else if (e.key === 'ArrowDown') c.y += step;
      else return;
      e.preventDefault(); markDirty(); renderPanel(); nudgeHist();
    }
  });

  window.addEventListener('beforeunload', () => saveProject(true));
}
function setZoom(z) {
  S.zoom = clamp(z, 8, 320);
  $('#zoomLabel').textContent = Math.round(S.zoom) + ' px/s';
  renderTimeline(); updatePlayheadEl();
}

/* ---------- init ---------- */
async function init() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('ac-theme') || 'light'; } catch (e) { /* fine */ }
  setTheme(savedTheme);
  S.project = newProject();
  try {
    await idbOpen();
    await cleanupTemp();                        // sweep expired temp renders
    const recs = await idbAll('media');         // rebuild library from cache
    for (const r of recs) S.media.set(r.id, { id: r.id, name: r.name, kind: r.kind, url: URL.createObjectURL(r.blob), size: r.size, duration: r.duration, w: r.w, h: r.h, thumb: r.thumb });
    const projs = (await idbAll('projects')).sort((a, b) => b.saved - a.saved);
    if (projs.length) {                         // resume the most recent project
      await loadState(projs[0].state);
      S.project.id = projs[0].id; S.project.name = projs[0].name;
      $('#projName').value = projs[0].name;
    }
  } catch (e) { /* IndexedDB blocked — editor still works in-memory */ }
  syncViewSize();
  wire();
  renderLibrary(); renderTimeline(); renderPanel(); renderStorage();
  updateTransport(); updateStageHint();
  requestAnimationFrame(tick);
  setInterval(renderStorage, 30000);
}
init();
