/* =====================================================================
   استوديو مدرار — يسجّل الشاشة وصوت المعلم داخل المتصفح، بلا كاميرا أبداً.
   كل ثانية تُحفظ قطعة من التسجيل في IndexedDB، فلا يضيع الدرس إن أُغلقت
   الصفحة أو انقطعت الكهرباء؛ وإن تعذّر ذلك يبقى التسجيل في الذاكرة.
   ===================================================================== */
(function () {
  'use strict';

  // MP4 يعمل في كل المشغلات؛ WebM بديل مضمون في Chrome و Firefox
  const TYPES = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const VIDEO_BPS = 1800000;
  const AUDIO_BPS = 128000;

  const supported = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  // صوت الحاسوب مع الشاشة متاح في المتصفحات المبنية على Chromium فقط (Chrome و Edge)
  const canSystemAudio = !!(navigator.userAgentData && (navigator.userAgentData.brands || []).some((b) => /Chromium/.test(b.brand)));
  const pickType = () => TYPES.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  const extOf = (type) => (/mp4/.test(type) ? 'mp4' : 'webm');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const micConstraints = (id) => Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, id ? { deviceId: { exact: id } } : {});
  const tagged = (e, where) => { const x = e instanceof Error ? e : new Error(String(e)); try { x.where = where; } catch (y) { /* ignore */ } return x; };

  // ------------------------------------------------------------------
  //  التخزين: recs (بيانات كل تسجيل) و chunks (قطع الفيديو بالترتيب)
  // ------------------------------------------------------------------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('IndexedDB غير متاح'));
        const r = indexedDB.open('midrar-studio', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('recs', { keyPath: 'id' });
          r.result.createObjectStore('chunks', { keyPath: ['rec', 'seq'] });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort')); });
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const range = (id) => IDBKeyRange.bound([id, 0], [id, Infinity]);

  async function list() {
    const d = await db();
    const all = await reqP(d.transaction('recs').objectStore('recs').getAll());
    return all.sort((a, b) => b.started - a.started);
  }
  async function getMeta(id) { const d = await db(); return reqP(d.transaction('recs').objectStore('recs').get(id)); }
  async function chunksOf(id) {
    const d = await db();
    return (await reqP(d.transaction('chunks').objectStore('chunks').getAll(range(id)))).map((c) => c.blob);
  }
  async function removeStored(id) {
    const d = await db();
    const tx = d.transaction(['recs', 'chunks'], 'readwrite');
    tx.objectStore('recs').delete(id);
    tx.objectStore('chunks').delete(range(id));
    await txDone(tx);
  }

  // ------------------------------------------------------------------
  //  التسجيل الجاري (تسجيل واحد في كل مرة)
  // ------------------------------------------------------------------
  const rec = {
    state: 'idle', // idle | recording | paused | saving | done
    id: null, type: '', label: '', info: null, started: 0, acc: 0, since: 0, bytes: 0, seq: 0,
    mem: [], dbUsed: false, useDb: false, chain: Promise.resolve(), finishing: false,
    tracks: [], ctx: null, analyser: null, peakAn: null, metered: false, recorder: null,
    sysAudio: false, sysLost: false, result: null, error: null,
  };
  const subs = new Set();
  function setState(s) {
    rec.state = s;
    subs.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
  }
  const elapsed = () => rec.acc + (rec.state === 'recording' ? Date.now() - rec.since : 0);
  const metaOf = (id, extra) => Object.assign({ id, type: rec.type, label: rec.label, info: rec.info, started: rec.started, ms: elapsed(), bytes: rec.bytes, done: false }, extra || {});

  function levelOf(an) {
    if (!an) return 0;
    if (!an._buf) an._buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(an._buf);
    let sum = 0;
    for (let i = 0; i < an._buf.length; i++) { const v = (an._buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / an._buf.length) * 4);
  }
  // أعلى قيمة في آخر ثلثي ثانية تقريباً: لاكتشاف الصمت الطويل دون أن تفوتنا الكلمات
  function peakOf(an) {
    if (!an || !an.getFloatTimeDomainData) return 0;
    if (!an._f) an._f = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(an._f);
    let m = 0;
    for (let i = 0; i < an._f.length; i++) { const v = Math.abs(an._f[i]); if (v > m) m = v; }
    return m;
  }

  async function mics() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId); }
    catch (e) { return []; }
  }
  async function openMic(id) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: micConstraints(id), video: false }); }
    catch (e) {
      // المايكروفون المختار سابقاً لم يعد موصولاً: نجرّب الافتراضي
      if (id && e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) return navigator.mediaDevices.getUserMedia({ audio: micConstraints(''), video: false });
      throw e;
    }
  }
  // تجربة المايكروفون قبل التسجيل: مؤشر مستوى الصوت فقط
  async function testMic(id) {
    let stream;
    try { stream = await openMic(id); } catch (e) { throw tagged(e, 'mic'); }
    const ctx = AudioCtx ? new AudioCtx() : null;
    let an = null;
    if (ctx) {
      an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* المؤشر اختياري */ } }
    }
    return {
      level: () => levelOf(an),
      stop() { stream.getTracks().forEach((t) => t.stop()); if (ctx) ctx.close().catch(() => {}); },
    };
  }

  // يجب استدعاؤها مباشرة من ضغطة زر: أول انتظار فيها هو نافذة اختيار الشاشة
  async function start(opts) {
    if (rec.state !== 'idle' && rec.state !== 'done') throw new Error('يوجد تسجيل جارٍ بالفعل.');
    opts = opts || {};
    // سياق الصوت يُنشأ داخل الضغطة نفسها حتى لا يبدأ صامتاً
    const ctx = AudioCtx ? new AudioCtx() : null;
    const wantSys = !!opts.systemAudio && canSystemAudio;
    let display;
    let mic;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 24, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: wantSys,
        selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include',
        systemAudio: wantSys ? 'include' : 'exclude',
      });
    } catch (e) { if (ctx) ctx.close().catch(() => {}); throw tagged(e, 'display'); }
    try { mic = await openMic(opts.micId); }
    catch (e) {
      display.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      throw tagged(e, 'mic');
    }
    const video = display.getVideoTracks()[0];
    try { if ('contentHint' in video) video.contentHint = 'detail'; } catch (e) { /* ignore */ }
    const sys = display.getAudioTracks();
    if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* نتحقق أدناه */ } }
    const ctxOk = !!ctx && ctx.state === 'running';
    let audio;
    let analyser = null;
    let peakAn = null;
    if (ctxOk) {
      const micSrc = ctx.createMediaStreamSource(mic);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      micSrc.connect(analyser);
      peakAn = ctx.createAnalyser(); peakAn.fftSize = 32768;
      micSrc.connect(peakAn);
      if (sys.length) {
        // دمج صوت المعلم مع صوت الحاسوب في مسار واحد
        const dest = ctx.createMediaStreamDestination();
        micSrc.connect(dest);
        const g = ctx.createGain(); g.gain.value = 0.8;
        ctx.createMediaStreamSource(new MediaStream(sys)).connect(g).connect(dest);
        audio = dest.stream.getAudioTracks()[0];
      }
    }
    // بلا صوت حاسوب (أو تعذّر الدمج) نسجّل المايكروفون مباشرة دون وسيط
    if (!audio) audio = mic.getAudioTracks()[0];
    const stream = new MediaStream([video, audio]);
    let type = pickType();
    let recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS }); }
    catch (e) {
      try { recorder = new MediaRecorder(stream); type = ''; }
      catch (x) {
        display.getTracks().concat(mic.getTracks()).forEach((t) => t.stop());
        if (ctx) ctx.close().catch(() => {});
        throw tagged(x, 'recorder');
      }
    }
    clearResult();
    const id = 'r' + Date.now().toString(36);
    Object.assign(rec, {
      id, type: recorder.mimeType || type || 'video/webm', label: String(opts.label || ''), info: opts.info || null, started: Date.now(), acc: 0, since: Date.now(),
      bytes: 0, seq: 0, mem: [], dbUsed: false, useDb: false, chain: Promise.resolve(), finishing: false,
      tracks: display.getTracks().concat(mic.getTracks()), ctx, analyser, peakAn, metered: !!analyser, recorder,
      sysAudio: !!sys.length && audio !== mic.getAudioTracks()[0], sysLost: !!sys.length && audio === mic.getAudioTracks()[0], error: null,
    });
    try {
      const d = await db();
      const tx = d.transaction('recs', 'readwrite');
      tx.objectStore('recs').put(metaOf(id));
      await txDone(tx);
      rec.dbUsed = rec.useDb = true;
    } catch (e) { rec.dbUsed = rec.useDb = false; }
    if (rec.useDb && navigator.storage && navigator.storage.persist && canSystemAudio) navigator.storage.persist().catch(() => {});

    recorder.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const seq = ++rec.seq;
      const blob = e.data;
      rec.bytes += blob.size;
      // الكتابة بالترتيب؛ إن فشل التخزين نكمل في الذاكرة دون أن نفقد قطعة
      rec.chain = rec.chain.then(async () => {
        if (rec.useDb) {
          try {
            const d = await db();
            const tx = d.transaction(['chunks', 'recs'], 'readwrite');
            tx.objectStore('chunks').put({ rec: id, seq, blob });
            tx.objectStore('recs').put(metaOf(id));
            await txDone(tx);
            return;
          } catch (err) { rec.useDb = false; }
        }
        rec.mem.push(blob);
      });
    };
    recorder.onstop = () => finish();
    recorder.onerror = (e) => { rec.error = tagged((e && e.error) || new Error('توقف المسجّل'), 'recorder'); stop(); };
    // «إيقاف المشاركة» من شريط المتصفح ينهي التسجيل
    video.addEventListener('ended', () => stop());
    recorder.start(1000);
    setState('recording');
  }

  function pause() {
    if (rec.state !== 'recording') return;
    try { rec.recorder.pause(); } catch (e) { return; }
    rec.acc += Date.now() - rec.since;
    setState('paused');
  }
  function resume() {
    if (rec.state !== 'paused') return;
    try { rec.recorder.resume(); } catch (e) { return; }
    rec.since = Date.now();
    setState('recording');
  }
  function stop() {
    if (rec.state !== 'recording' && rec.state !== 'paused') return;
    if (rec.state === 'recording') rec.acc += Date.now() - rec.since;
    setState('saving');
    try { if (rec.recorder.state !== 'inactive') rec.recorder.stop(); else finish(); } catch (e) { finish(); }
  }

  async function finish() {
    if (rec.finishing) return;
    rec.finishing = true;
    rec.tracks.forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
    rec.tracks = [];
    if (rec.ctx) rec.ctx.close().catch(() => {});
    rec.ctx = null; rec.analyser = null; rec.peakAn = null;
    try { await rec.chain; } catch (e) { /* القطع الفاشلة في الذاكرة */ }
    const stored = rec.dbUsed ? await chunksOf(rec.id).catch(() => []) : [];
    const blob = new Blob(stored.concat(rec.mem), { type: rec.type });
    if (!blob.size) {
      if (rec.dbUsed) removeStored(rec.id).catch(() => {});
      rec.error = rec.error || tagged(new Error('لم يُسجَّل شيء.'), 'empty');
      setState('idle');
      return;
    }
    const saved = rec.dbUsed && rec.useDb;
    if (rec.dbUsed) {
      try {
        const d = await db();
        const tx = d.transaction('recs', 'readwrite');
        tx.objectStore('recs').put(metaOf(rec.id, { ms: rec.acc, bytes: blob.size, done: saved, partial: !saved }));
        await txDone(tx);
      } catch (e) { /* النسخة في الذاكرة تكفي للحفظ الآن */ }
    }
    rec.mem = [];
    rec.result = { id: rec.id, blob, url: URL.createObjectURL(blob), type: rec.type, ext: extOf(rec.type), ms: rec.acc, bytes: blob.size, started: rec.started, label: rec.label, info: rec.info, saved, partial: false };
    setState('done');
  }

  function clearResult() {
    if (rec.result && rec.result.url) URL.revokeObjectURL(rec.result.url);
    rec.result = null;
  }
  // يغلق الفيديو المعروض (لا يحذفه من المتصفح)
  function discard() {
    if (rec.state === 'recording' || rec.state === 'paused' || rec.state === 'saving') return;
    clearResult();
    rec.error = null;
    setState('idle');
  }
  // يفتح تسجيلاً محفوظاً في المتصفح (منها تسجيل توقف فجأة)
  async function open(id) {
    if (rec.state === 'recording' || rec.state === 'paused' || rec.state === 'saving') throw new Error('أنهِ التسجيل الجاري أولاً.');
    const meta = await getMeta(id);
    const parts = await chunksOf(id);
    if (!meta || !parts.length) throw new Error('هذا التسجيل فارغ.');
    clearResult();
    const blob = new Blob(parts, { type: meta.type });
    rec.error = null;
    rec.result = { id, blob, url: URL.createObjectURL(blob), type: meta.type, ext: extOf(meta.type), ms: meta.ms, bytes: blob.size, started: meta.started, label: meta.label || '', info: meta.info || null, saved: true, partial: !meta.done };
    setState('done');
  }
  async function remove(id) {
    if ((rec.state === 'recording' || rec.state === 'paused' || rec.state === 'saving') && rec.id === id) throw new Error('أنهِ التسجيل الجاري أولاً.');
    await removeStored(id);
    if (rec.result && rec.result.id === id) discard();
  }
  async function freeSpace() {
    try { const e = await navigator.storage.estimate(); return e.quota - e.usage; } catch (x) { return null; }
  }

  window.Studio = {
    supported, canSystemAudio, mics, testMic, start, pause, resume, stop, discard, open, remove, list, freeSpace,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    elapsed,
    level: () => levelOf(rec.analyser),
    peak: () => peakOf(rec.peakAn),
    get state() { return rec.state; },
    get bytes() { return rec.bytes; },
    get result() { return rec.result; },
    get error() { return rec.error; },
    get persistent() { return rec.useDb; },
    get metered() { return rec.metered; },
    get sysLost() { return rec.sysLost; },
    get info() { return rec.info; },
  };
})();
