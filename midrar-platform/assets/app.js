/* =====================================================================
   منصة مِدْرار العلم — واجهة المستخدم
   صفحة واحدة بروابط (#/...) بدون أي إطار عمل، لتبقى خفيفة على الهواتف.
   ===================================================================== */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const API = window.API;
  const ST = window.Studio;
  const view = document.getElementById('view');

  // ------------------------------------------------------------------
  //  أدوات عامة
  // ------------------------------------------------------------------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const store = {
    get(k) { try { return localStorage.getItem('midrar-' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('midrar-' + k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('midrar-' + k); } catch (e) { /* ignore */ } },
    json(k, fallback) { try { const v = JSON.parse(localStorage.getItem('midrar-' + k) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; } },
  };
  const MIN = 60000;
  const DAY = 864e5;

  const GRADES = {};
  C.STAGES.forEach((st) => st.grades.forEach((g) => { GRADES[g.id] = Object.assign({ stage: st }, g); }));
  // المهارات «صف» خاص اسمه skills، وموادّه هي المهارات
  const SKILLS = C.SKILLS || [];
  const SKILL = {};
  SKILLS.forEach((k) => { SKILL[k.id] = k; });
  const isSkills = (g) => g === 'skills';
  const gradeName = (id) => (GRADES[id] ? GRADES[id].name : isSkills(id) ? 'المهارات' : id);
  const subjectName = (id) => C.SUBJECTS[id] || (SKILL[id] && SKILL[id].name) || id;
  const subjectsOf = (gradeId) => (isSkills(gradeId) ? SKILLS.map((k) => k.id)
    : GRADES[gradeId] ? C.SUBJECT_SETS[GRADES[gradeId].subjects] || [] : Object.keys(C.SUBJECTS));
  // اسم المادة لدرس معيّن: في «مهارات أخرى» يكتب المتطوع اسم المهارة بنفسه
  const subjOf = (s) => (s && isSkills(s.grade) && s.subject === 'sk_other' && s.skill_name ? s.skill_name : subjectName(s && s.subject));
  // رابط مكان الدرس: صفحة المادة في الصف، أو صفحة المهارة
  const subjHref = (grade, subject) => (isSkills(grade) ? `#/k/${subject}` : `#/g/${grade}/${subject}`);
  const gradeHref = (grade) => (isSkills(grade) ? '#/k' : `#/g/${grade}`);

  const L = C.LOCALE || 'ar';
  const fmt = (o) => { try { return new Intl.DateTimeFormat(L, o); } catch (e) { return new Intl.DateTimeFormat('ar', o); } };
  const fTime = fmt({ hour: 'numeric', minute: '2-digit' });
  const fDayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
  const fDateShort = fmt({ day: 'numeric', month: 'short' });
  const fWd = fmt({ weekday: 'short' });
  const fDn = fmt({ day: 'numeric' });
  const fFull = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(L, { numeric: 'auto' }); } catch (e) { rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' }); }
  const fNum = (n) => { try { return new Intl.NumberFormat(L).format(n); } catch (e) { return String(n); } };

  const time = (d) => fTime.format(new Date(d));
  function timeParts(d) {
    const parts = fTime.formatToParts(new Date(d));
    const period = (parts.find((p) => p.type === 'dayPeriod') || {}).value || '';
    const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    return { main, period };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const minutes = (s) => Math.round((new Date(s.ends_at) - new Date(s.starts_at)) / MIN);
  function rel(ms) {
    const m = Math.round(ms / MIN);
    if (Math.abs(m) < 60) return rtf.format(m, 'minute');
    const h = Math.round(m / 60);
    // الأيام بالتقويم: درس مساء الغد «غداً» حتى لو بقي عليه 36 ساعة
    const now = new Date();
    const d = Math.round((startOfDay(+now + ms) - startOfDay(now)) / 864e5);
    if (Math.abs(h) < 12 || d === 0) return rtf.format(h, 'hour');
    return rtf.format(d, 'day');
  }
  function dayLabel(d) {
    const k = dayKey(d);
    const today = dayKey(new Date());
    if (k === today) return 'اليوم، ' + fDayLong.format(d);
    if (k === dayKey(addDays(new Date(), 1))) return 'غداً، ' + fDayLong.format(d);
    if (k === dayKey(addDays(new Date(), -1))) return 'أمس، ' + fDayLong.format(d);
    return fDayLong.format(d);
  }
  // ------------------------------------------------------------------
  //  المنهج: الفصل الدراسي والوحدة ونوع الدرس
  // ------------------------------------------------------------------
  const TERMS = C.TERMS || { 1: 'الفصل الدراسي الأول', 2: 'الفصل الدراسي الثاني' };
  const TYPES = C.LESSON_TYPES || { lesson: 'شرح درس', book: 'حل أسئلة الكتاب', review: 'مراجعة', exam: 'حل امتحانات سابقة' };
  const CERT_LEVELS = C.CERT_LEVELS || [5, 10, 25, 50, 100];
  const isExamGrade = (g) => !!(GRADES[g] && GRADES[g].exam);
  const typeName = (t, grade) => (t === 'exam' && isExamGrade(grade) ? 'حل امتحانات الدبلوم' : TYPES[t] || TYPES.lesson);
  function currentTerm(d) {
    const m = (d || new Date()).getMonth() + 1;
    return m >= (C.TERM2_FROM_MONTH || 2) && m < (C.TERM1_FROM_MONTH || 8) ? 2 : 1;
  }
  // سنة الامتحان تُكتب كما هي (بلا فاصل آلاف)
  const examLine = (s) => (s.exam_year ? `${s.exam_year}${s.exam_round ? ' — الدور ' + (s.exam_round === 1 ? 'الأول' : 'الثاني') : ''}` : '');
  const LEVELS = C.SKILL_LEVELS || { 1: 'مبتدئ', 2: 'متوسط', 3: 'متقدم' };
  const AGES = C.SKILL_AGES || { all: 'للجميع', c1: 'الحلقة الأولى (1–4)', c2: 'الحلقة الثانية (5–10)', c3: 'ما بعد الأساسي (11–12)' };
  const AGE_IDS = ['c1', 'c2', 'c3'].filter((a) => AGES[a]);
  // في المهارات: اسم الدورة ورقم الجزء؛ في المنهج: رقم الوحدة واسمها
  const unitLabel = (s) => (isSkills(s.grade) ? [s.unit_title, s.unit ? 'الجزء ' + fNum(s.unit) : ''].filter(Boolean).join(' — ')
    : s.unit ? `الوحدة ${fNum(s.unit)}${s.unit_title ? ': ' + s.unit_title : ''}` : '');
  const placeLine = (s) => (isSkills(s.grade) ? [unitLabel(s), LEVELS[s.level] || '', AGES[s.ages] || ''].filter(Boolean).join(' · ') : '') || [s.term ? TERMS[s.term] : '', unitLabel(s),
    s.lesson_type && s.lesson_type !== 'lesson' ? typeName(s.lesson_type, s.grade) : '',
    examLine(s)].filter(Boolean).join(' · ');

  // ------------------------------------------------------------------
  //  سجل المشاهدة: في جهاز الطالب فقط، ولا يُرسل إلى أي خادم
  // ------------------------------------------------------------------
  const watch = {
    read() { const o = store.json('watch', null); return o && o.items ? o : { v: 1, items: {} }; },
    get(id) { return this.read().items[id] || null; },
    put(s, patch) {
      const o = this.read();
      const prev = o.items[s.id] || {};
      o.items[s.id] = Object.assign(prev, {
        ti: s.title, g: s.grade, s: s.subject, tn: (s.teacher && s.teacher.display_name) || prev.tn || '',
        y: ytId(videoOf(s)) || prev.y || '', at: Date.now(),
      }, patch);
      const ids = Object.keys(o.items);
      if (ids.length > 300) ids.sort((a, b) => o.items[a].at - o.items[b].at).slice(0, ids.length - 300).forEach((k) => delete o.items[k]);
      store.set('watch', JSON.stringify(o));
      return o.items[s.id];
    },
    drop(id) { const o = this.read(); if (o.items[id]) { delete o.items[id]; store.set('watch', JSON.stringify(o)); } },
    clear() { ['watch', 'counted', 'thanked'].forEach((k) => store.del(k)); },
  };
  // قائمة صغيرة محفوظة في الجهاز (لمنع تكرار العدّ والشكر)
  const localSet = (key, max) => ({
    has(id) { return store.json(key, []).includes(id); },
    add(id) { const a = store.json(key, []).filter((x) => x !== id); a.push(id); store.set(key, JSON.stringify(a.slice(-max))); },
  });
  const counted = localSet('counted', 500);
  const mmss = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor(sec / 60) % 60;
    return (h ? `${h}:${pad(m)}` : String(m)) + ':' + pad(sec % 60);
  };
  const progressOf = (w) => (w && !w.done && w.d > 0 && w.p >= 30 ? Math.min(98, Math.round((100 * w.p) / w.d)) : 0);

  const countShort = (n) => (n === 1 ? 'حصة' : n === 2 ? 'حصتان' : `${fNum(n)} ${n <= 10 ? 'حصص' : 'حصة'}`);
  // العدد والمعدود: 3–10 جمع، 11–99 مفرد منصوب، 100 و101 و102 مفرد مجرور
  const plural = (n, one, two, few, many) => {
    const r = n % 100;
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 100 && r <= 2) return `${fNum(n)} ${many.replace(/اً$/, '')}`;
    return r >= 3 && r <= 10 ? `${fNum(n)} ${few}` : `${fNum(n)} ${many}`;
  };
  const lessonsN = (n) => plural(n, 'درس واحد', 'درسان', 'دروس', 'درساً');
  const minsTxt = (m) => plural(m, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');

  // ------------------------------------------------------------------
  //  يوتيوب
  // ------------------------------------------------------------------
  function ytId(url) {
    if (!url) return null;
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v');
      if (!id) { const m = u.pathname.match(/^\/(?:live|embed|shorts|v)\/([^/?#]+)/); if (m) id = m[1]; }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  const isYouTube = (url) => /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/\S+$/i.test(url || '');
  // رابط الحصة المباشرة: Jitsi Meet تنشئه المنصة، أو رابط يضعه المعلم من Google Meet أو Zoom أو Teams
  const newRoom = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const r = new Uint32Array(14); crypto.getRandomValues(r); return 'https://meet.jit.si/MidrarElm-' + Array.from(r, (x) => a[x % a.length]).join(''); };
  const isZoom = (url) => /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/[^\s<>"]+$/i.test(url || '') && url.length <= 300;
  const isMeet = (url) => /^https:\/\/(meet\.jit\.si|meet\.google\.com|([a-z0-9-]+\.)*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"]+$/i.test(url || '') && url.length <= 300;
  const meetApp = (url) => (/zoom\.us/i.test(url) ? 'Zoom' : /teams\./i.test(url) ? 'Microsoft Teams' : /jit\.si/i.test(url) ? 'Jitsi Meet' : 'Google Meet');
  // رابط قناة المعلم: نقبل «@الاسم» أو رابط القناة بأي صيغة، ونرفض روابط الفيديو
  function channelUrl(raw) {
    let v = String(raw || '').trim().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
    if (!v) return { error: 'empty' };
    if (/^@[^\s/?#]{3,30}$/.test(v)) v = 'https://www.youtube.com/' + v;
    else if (/^((www|m)\.)?youtube\.com\//i.test(v)) v = 'https://' + v;
    v = v.replace(/^http:\/\//i, 'https://');
    let u;
    try { u = new URL(v); } catch (e) { return { error: 'bad' }; }
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    try { path = decodeURIComponent(path); } catch (e) { /* يبقى كما هو */ }
    let m;
    if (host === 'studio.youtube.com' && (m = /^\/channel\/(UC[\w-]{22})(?:\/|$)/.exec(path))) return { url: 'https://www.youtube.com/channel/' + m[1] };
    if (!/^((www|m)\.)?youtube\.com$/.test(host)) return { error: host === 'youtu.be' ? 'video' : 'bad' };
    if ((m = /^\/(@[^/\s]{3,30})(?:\/|$)/.exec(path))) return { url: 'https://www.youtube.com/' + m[1] };
    if ((m = /^\/channel\/(UC[\w-]{22})(?:\/|$)/.exec(path))) return { url: 'https://www.youtube.com/channel/' + m[1] };
    if ((m = /^\/(c|user)\/([^/\s]{1,100})(?:\/|$)/.exec(path))) return { url: `https://www.youtube.com/${m[1]}/${m[2]}` };
    return { error: /^\/(watch|live|shorts|embed|playlist)/.test(path) || u.searchParams.has('v') ? 'video' : 'bad' };
  }
  const CHANNEL_ERR = {
    video: 'هذا رابط فيديو، والمطلوب رابط القناة نفسها، مثل https://www.youtube.com/@اسم_قناتك',
    bad: 'رابط القناة غير صحيح. اكتب اسم قناتك المعرّف مثل @midrarelm، أو الصق رابط القناة من يوتيوب.',
  };
  // من ينسخ عنوان صفحة الفيديو في YouTube Studio بدلاً من رابط المشاهدة
  const normYt = (url) => { const m = /^https:\/\/studio\.youtube\.com\/video\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(url || ''); return m ? 'https://youtu.be/' + m[1] : url; };
  const isDemoVideo = (url) => API.mode === 'demo' && /demo-video/.test(url || '');
  const videoOf = (s) => s.recording_url || s.video_url;
  const watchUrl = (s) => {
    const st = stateOf(s).key;
    return (st === 'replay' ? (s.recording_url || s.video_url) : (s.video_url || s.recording_url)) || '';
  };
  const thumbUrl = (url) => { const id = ytId(url); return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null; };

  function calendarUrl(s) {
    const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const link = pageUrl('#/s/' + s.id);
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${subjOf(s)}: ${s.title}`,
      dates: `${z(s.starts_at)}/${z(s.ends_at)}`,
      details: `${gradeName(s.grade)} — ${(s.teacher && s.teacher.display_name) || ''}\nرابط الحصة: ${link}`,
      location: link,
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function pageUrl(hash) { return location.origin + location.pathname + hash; }
  // ملف تقويم (آيفون وأوتلوك) مع تنبيه قبل الموعد بربع ساعة
  function icsUrl(s) {
    const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const tx = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const link = pageUrl('#/s/' + s.id);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Midrar Elm//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${s.id}@midrarelm`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(s.starts_at)}`, `DTEND:${z(s.ends_at)}`,
      `SUMMARY:${tx(subjOf(s) + ': ' + s.title)}`, `DESCRIPTION:${tx(gradeName(s.grade) + ' — ' + ((s.teacher && s.teacher.display_name) || '') + '\n' + link)}`,
      `URL:${link}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${tx(s.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }
  // أزرار التذكير بموعد الدرس
  const remindHtml = (s, sm) => `<a class="btn${sm ? ' btn-sm' : ''}" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">ذكّرني (تقويم Google)</a>
    <a class="btn${sm ? ' btn-sm' : ''}" href="${esc(icsUrl(s))}" download="midrar-lesson.ics">ذكّرني (آيفون وغيره)</a>`;
  function whatsappUrl(s) {
    const up = +new Date(s.starts_at) > Date.now();
    const text = `${up ? '📚 موعد درس على ' + C.SITE_NAME + '\n' : ''}${subjOf(s)} — ${s.title}\n${gradeName(s.grade)} · ${up ? 'يُعرض ' : ''}${dayLabel(new Date(s.starts_at))} ${time(s.starts_at)}\n${pageUrl('#/s/' + s.id)}`;
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  // ------------------------------------------------------------------
  //  حالة الحصة (قادمة / تبدأ قريباً / مباشر / تسجيل ...)
  // ------------------------------------------------------------------
  // درس حدّد المعلم موعد عرضه (أُضيف قبل موعده بأكثر من 10 دقائق): يُعرض «الآن» طوال مدته
  const isPremiere = (s) => s.kind === 'recorded' && !!s.created_at && +new Date(s.starts_at) - +new Date(s.created_at) > 10 * MIN;
  function stateOf(s, now) {
    now = now || Date.now();
    const st = +new Date(s.starts_at);
    const en = +new Date(s.ends_at);
    if (s.status === 'cancelled') return { key: 'cancelled', label: 'ملغاة' };
    if (s.kind === 'recorded') {
      if (now < st) return { key: 'upcoming', label: 'يُعرض ' + rel(st - now) };
      if (now < en && isPremiere(s) && videoOf(s)) return { key: 'premiere', label: 'يُعرض الآن' };
      return { key: 'recorded', label: 'درس مسجّل' };
    }
    if (now < st - C.JOIN_EARLY_MIN * MIN) return { key: 'upcoming', label: rel(st - now) };
    if (now < st) return { key: 'soon', label: 'تبدأ ' + rel(st - now) };
    if (now < en) return { key: 'live', label: 'مباشر الآن' };
    if (videoOf(s)) return { key: 'replay', label: 'التسجيل متاح' };
    return { key: 'ended', label: 'انتهت' };
  }
  function badgeHtml(s) {
    const st = stateOf(s);
    return `<span class="badge b-${st.key}">${st.key === 'live' || st.key === 'premiere' ? '<span class="dot-live"></span>' : ''}${esc(st.label)}</span>`;
  }
  function actionHtml(s, compact) {
    const st = stateOf(s).key;
    const to = '#/s/' + esc(s.id);
    if (st === 'live' || st === 'soon') return `<a class="btn btn-live${compact ? ' btn-sm' : ''}" href="${to}">ادخل الحصة</a>`;
    if (st === 'premiere') return `<a class="btn btn-live${compact ? ' btn-sm' : ''}" href="${to}">شاهد الآن</a>`;
    if (st === 'replay' || st === 'recorded') return `<a class="btn btn-primary${compact ? ' btn-sm' : ''}" href="${to}">شاهد التسجيل</a>`;
    if (st === 'upcoming') {
      return `<a class="btn${compact ? ' btn-sm' : ''}" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">ذكّرني في التقويم</a>
              <a class="btn btn-ghost${compact ? ' btn-sm' : ''}" href="${to}">التفاصيل</a>`;
    }
    if (st === 'ended') return `<a class="btn btn-ghost${compact ? ' btn-sm' : ''}" href="${to}">${s.upload_state ? 'انتهت — التسجيل قريباً' : 'انتهت — لا يوجد تسجيل بعد'}</a>`;
    return '';
  }

  // ------------------------------------------------------------------
  //  عناصر مشتركة
  // ------------------------------------------------------------------
  function initial(name) { return String(name || '؟').replace(/^(أ\.|د\.|م\.|ا\.)\s*/, '').trim().charAt(0) || '؟'; }
  // أيقونتا المعلم: رجل بالكُمّة والدشداشة، وامرأة بالحجاب
  const FACE = {
    m: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 66c0-12.5 10.5-19.5 25-19.5S57 53.5 57 66z" fill="#fff" stroke="#C9D6D0"/><path d="M26.5 42h11v6.5c0 2.6-2.4 4.5-5.5 4.5s-5.5-1.9-5.5-4.5z" fill="#D9A97E"/><path d="M32 52.5v7" stroke="#B08D5B" stroke-width="1.4"/><circle cx="32" cy="60.5" r="1.7" fill="#B08D5B"/><ellipse cx="32" cy="33" rx="10.5" ry="12" fill="#E8BE95"/><path d="M22.5 35.5c.6 7 4.6 10.5 9.5 10.5s8.9-3.5 9.5-10.5c-1.8 2.8-4 4.2-6 4.2-1.2-1-2.3-1.4-3.5-1.4s-2.3.4-3.5 1.4c-2 0-4.2-1.4-6-4.2z" fill="#4A3A30"/><path d="M20.8 27.2V13.6c0-1.5 5-2.6 11.2-2.6s11.2 1.1 11.2 2.6v13.6c-3 .9-6.8 1.3-11.2 1.3s-8.2-.4-11.2-1.3z" fill="#fff" stroke="#C9D6D0"/><ellipse cx="32" cy="13.6" rx="11.2" ry="2.3" fill="#F4F8F6" stroke="#C9D6D0" stroke-width=".8"/><path d="M20.9 24.6c3 .9 6.8 1.3 11.1 1.3s8.1-.4 11.1-1.3" fill="none" stroke="#0E5A46" stroke-width="1.6"/><path d="M22.5 21.2l1.9-2.2 1.9 2.2 1.9-2.2 1.9 2.2 1.9-2.2 1.9 2.2 1.9-2.2 1.9 2.2 1.9-2.2 1.9 2.2" fill="none" stroke="#B9770E" stroke-width="1.1"/><path d="M24 17.2h16" stroke="#0E5A46" stroke-width="1" stroke-dasharray="1.6 1.6"/></svg>',
    f: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 66c0-11.5 10-18 24-18s24 6.5 24 18z" fill="#1F5A4C"/><path d="M32 17.5c-7.8 0-12.6 6-12.6 14.6 0 5.4 1.5 9.6 4.2 12.6-.7 4.4-2 8.6-3.6 12 3.8 2.2 7.7 3.2 12 3.2s8.2-1 12-3.2c-1.6-3.4-2.9-7.6-3.6-12 2.7-3 4.2-7.2 4.2-12.6 0-8.6-4.8-14.6-12.6-14.6z" fill="#1F5A4C"/><path d="M23.6 44.7c-.7 4.4-2 8.6-3.6 12M40.4 44.7c.7 4.4 2 8.6 3.6 12" fill="none" stroke="#174A3E" stroke-width="1.1"/><ellipse cx="32" cy="33.5" rx="8.2" ry="10" fill="#E8BE95"/><path d="M23.8 31.5c.4-6 3.8-9.4 8.2-9.4s7.8 3.4 8.2 9.4" fill="none" stroke="#2C7462" stroke-width="2"/><path d="M25.2 43.4c1.9 2.2 4.2 3.3 6.8 3.3s4.9-1.1 6.8-3.3" fill="none" stroke="#174A3E" stroke-width="1.3"/></svg>',
  };
  function gOf(t) { return t ? t.gender || app.genders[t.id] : undefined; }
  function avatar(name, url, cls, g) {
    if (FACE[g]) return `<span class="av av-ic ${cls || ''}" data-g="${g}">${FACE[g]}</span>`;
    const letter = esc(initial(name));
    if (url && /^https:\/\/lh\d+\.googleusercontent\.com\//.test(url)) {
      return `<img class="av ${cls || ''}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-letter="${letter}">`;
    }
    return `<span class="av ${cls || ''}" aria-hidden="true">${letter}</span>`;
  }
  // صورة لا تُحمَّل: نعرض الحرف الأول أو اسم المادة بدلاً منها
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.classList.contains('av')) {
      const sp = document.createElement('span');
      sp.className = img.className; sp.setAttribute('aria-hidden', 'true'); sp.textContent = img.getAttribute('data-letter') || '؟';
      img.replaceWith(sp);
    } else if (img.hasAttribute('data-ph')) {
      const sp = document.createElement('span');
      sp.className = 'ph'; sp.textContent = img.getAttribute('data-ph');
      img.replaceWith(sp);
    }
  }, true);
  function teacherLink(t) {
    if (!t) return '';
    return `<a class="who" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url, '', gOf(t))}<span>${esc(t.display_name)}</span></a>`;
  }
  function cardHtml(s, opts) {
    opts = opts || {};
    const st = stateOf(s).key;
    return `<article class="card s-${st}" data-sid="${esc(s.id)}">
      <div class="card-top"><span class="subj">${esc(subjOf(s))}${opts.showGrade ? ' · ' + esc(gradeName(s.grade)) : ''}</span><span data-badge>${badgeHtml(s)}</span></div>
      <h3><a href="#/s/${esc(s.id)}">${esc(s.title)}</a></h3>
      ${teacherLink(s.teacher)}
      <div class="meta">${s.kind === 'recorded' && (st === 'upcoming' || st === 'premiere') ? `<b class="when-at">${esc(dayLabel(new Date(s.starts_at)))} · ${esc(time(s.starts_at))}</b> · `
        : opts.showDay ? esc(fDateShort.format(new Date(s.starts_at))) + ' · ' : ''}${s.kind === 'recorded' ? '' : `${esc(time(s.starts_at))} – ${esc(time(s.ends_at))} · `}${esc(minsTxt(minutes(s)))}</div>
      <div class="act" data-act>${actionHtml(s, true)}</div>
    </article>`;
  }
  // تقويم الأيام السبعة القادمة: لكل يوم حصصه بالساعة
  function calendarHtml(list, showGrade) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
    const by = {};
    list.forEach((s) => { (by[dayKey(s.starts_at)] = by[dayKey(s.starts_at)] || []).push(s); });
    return `<div class="cal">${days.map((d, i) => {
      const items = (by[dayKey(d)] || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return `<div class="cal-day${i === 0 ? ' today' : ''}${items.length ? '' : ' empty'}">
        <div class="cal-head"><span>${i === 0 ? 'اليوم' : i === 1 ? 'غداً' : esc(fWd.format(d))}</span><b>${esc(fNum(d.getDate()))}</b></div>
        ${items.length ? items.slice(0, 4).map((s) => `<a class="cal-item${s.kind === 'live' ? ' is-live' : ''} s-${stateOf(s).key}" href="#/s/${esc(s.id)}">
            <span class="cal-time">${esc(time(s.starts_at))}</span><b>${esc(subjOf(s))}</b><span class="cal-t">${esc(s.title)}</span>
            ${showGrade ? `<span class="cal-g">${esc(gradeName(s.grade))}</span>` : ''}</a>`).join('')
          + (items.length > 4 ? `<span class="cal-more">+${fNum(items.length - 4)}</span>` : '')
          : '<span class="cal-none">—</span>'}
      </div>`;
    }).join('')}</div>`;
  }
  const upNow = (list) => list.filter((s) => s.status === 'scheduled' && ['upcoming', 'soon', 'premiere'].includes(stateOf(s).key));
  const upCards = (list, showGrade) => `<div class="slot-cards up-cards">${list.map((s) => cardHtml(s, { showGrade })).join('')}</div>`;
  function vidHtml(s, showGrade) {
    const url = videoOf(s);
    const th = thumbUrl(url);
    const w = watch.get(s.id);
    const pr = progressOf(w);
    return `<a class="vid${w && w.done ? ' seen' : ''}" href="#/s/${esc(s.id)}">
      <div class="thumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" data-ph="${esc(subjOf(s))}">` : `<span class="ph">${esc(subjOf(s))}</span>`}<span class="play">${w && w.done ? 'شاهدتُه ✓' : s.lesson_type && s.lesson_type !== 'lesson' ? esc(typeName(s.lesson_type, s.grade)) : s.kind === 'recorded' ? 'درس مسجّل' : 'تسجيل حصة'}</span>${pr ? `<span class="prog" style="--p:${pr}%" aria-hidden="true"></span>` : ''}</div>
      <h3>${esc(s.title)}</h3>${s.unit ? `<span class="meta">${esc(unitLabel(s))}</span>` : ''}
      <span class="meta">${showGrade ? esc(gradeName(s.grade)) + ' · ' : ''}${esc(subjOf(s))} · ${esc((s.teacher && s.teacher.display_name) || '')} · ${esc(fDateShort.format(new Date(s.starts_at)))}</span>
    </a>`;
  }
  const known = new Map(); // id → session (لتحديث الشارات كل نصف دقيقة)
  function remember(list) { list.forEach((s) => known.set(s.id, s)); return list; }
  function paintStates() {
    $$('[data-sid]').forEach((el) => {
      const s = known.get(el.getAttribute('data-sid'));
      if (!s) return;
      const st = stateOf(s).key;
      const b = $('[data-badge]', el);
      if (b) b.innerHTML = badgeHtml(s);
      if (el.classList.contains('card')) {
        el.className = 'card s-' + st;
        const a = $('[data-act]', el);
        if (a && a.getAttribute('data-st') !== st) { a.innerHTML = actionHtml(s, true); a.setAttribute('data-st', st); }
      }
    });
  }

  function toast(msg, isErr) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 6500 : 3200);
  }
  const errMsg = (e) => (e && e.message) || 'حدث خطأ غير متوقع.';
  function errorBox(e, retry) {
    return `<div class="empty"><b>تعذّر تحميل البيانات</b><span>${esc(errMsg(e))}</span>${retry ? '<button class="btn" data-retry>إعادة المحاولة</button>' : ''}</div>`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('تم نسخ الرابط'); }
    catch (e) {
      const i = document.createElement('input'); i.value = text; document.body.appendChild(i); i.select();
      try { document.execCommand('copy'); toast('تم نسخ الرابط'); } catch (x) { toast('انسخ الرابط يدوياً: ' + text); }
      i.remove();
    }
  }
  // زر يحتاج ضغطتين للتأكيد (بدلاً من نوافذ التأكيد)
  function armed(btn, fn) {
    btn.addEventListener('click', async () => {
      if (!btn.classList.contains('arm')) {
        const orig = btn.textContent;
        btn.classList.add('arm');
        btn.textContent = 'اضغط مرة أخرى للتأكيد';
        btn._t = setTimeout(() => { btn.classList.remove('arm'); btn.textContent = orig; }, 4000);
        return;
      }
      clearTimeout(btn._t);
      btn.disabled = true;
      try { await fn(); } finally { btn.disabled = false; }
    });
  }
  function setTitle(t) { document.title = t ? `${t} — ${C.SITE_NAME}` : C.SITE_NAME; }
  function setNav(key) { $$('[data-nav]').forEach((a) => { if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

  // ------------------------------------------------------------------
  //  حالة التطبيق والمستخدم
  // ------------------------------------------------------------------
  const app = { user: null, profile: undefined, settings: {}, genders: {}, token: 0, prefill: null, afterProfile: null };

  async function loadProfile() {
    if (!app.user) { app.profile = null; return null; }
    try { app.profile = await API.myProfile(); } catch (e) { app.profile = undefined; throw e; }
    return app.profile;
  }
  function renderAuth() {
    const box = document.getElementById('auth-area');
    if (app.user) {
      const name = (app.profile && app.profile.display_name) || app.user.name || 'لوحتي';
      const pic = (app.profile && app.profile.avatar_url) || app.user.avatar;
      box.innerHTML = `<a class="btn btn-sm" href="#/dashboard">${avatar(name, pic, '', app.profile && app.profile.gender)}<span>لوحتي</span>${app.profile && app.profile.is_admin ? `<span class="badge-n" data-admin-n${badgeN ? '' : ' hidden'}>${badgeN ? fNum(badgeN) : ''}</span>` : ''}</a>`;
    } else {
      box.innerHTML = '<a class="btn btn-primary btn-sm" href="#/dashboard">دخول المعلمين</a>';
    }
  }
  function renderBanners() {
    const b = document.getElementById('banners');
    let h = '';
    if (API.mode === 'demo') {
      h += `<div class="banner banner-demo">وضع تجريبي: البيانات أمثلة محفوظة في متصفحك فقط. لتشغيل المنصة الحقيقية أضف مفاتيح Supabase في <span class="path">assets/config.js</span>. <button type="button" id="demo-reset">إعادة الأمثلة</button></div>`;
    }
    if (app.settings && app.settings.site_notice) h += `<div class="banner banner-notice">${esc(app.settings.site_notice)}</div>`;
    b.innerHTML = h;
    const r = document.getElementById('demo-reset');
    if (r) r.addEventListener('click', async () => { await API.reset(); app.user = null; app.profile = null; renderAuth(); location.hash = '#/'; route(); toast('أُعيدت البيانات التجريبية'); });
  }

  // ------------------------------------------------------------------
  //  الصفحة الرئيسية
  // ------------------------------------------------------------------
  async function pageHome(tok) {
    setNav('home'); setTitle('');
    const mine = store.get('grade');
    const upSec = `<section class="section" id="up-sec" hidden>
        <div class="section-head"><h2>تقويم الحصص القادمة</h2><span class="muted" id="up-for"></span><span class="spacer"></span><a class="btn btn-ghost btn-sm" id="up-all" hidden>جدول صفّي</a></div>
        <div id="up-list"></div>
      </section>`;
    view.innerHTML = `
      <section class="hero">
        <h1>${esc(C.SITE_TAGLINE)}</h1>
        <p>من الصف الأول إلى الثاني عشر · مجاناً · بلا حساب</p>
      </section>
      ${app.profile && app.profile.status !== 'suspended' ? `<div class="mine teacher-bar"><b>مرحباً، ${esc(app.profile.display_name || '')}</b><span class="spacer"></span>
        <a class="btn btn-primary btn-sm" href="#/dashboard/live">حصة مباشرة جديدة</a><a class="btn btn-sm" href="#/dashboard">لوحتي</a></div>` : ''}
      ${mine && GRADES[mine] ? `<div class="mine"><span>صفّك:</span><b>${esc(gradeName(mine))}</b><span class="spacer"></span><a class="btn btn-primary btn-sm" href="#/g/${esc(mine)}">افتح صفّي</a></div>` : ''}
      <section class="section" id="live-sec" hidden>
        <div class="section-head"><span class="dot-live"></span><h2>مباشر الآن</h2><span class="muted" id="live-count"></span></div>
        <div class="live-strip" id="live-list"></div>
      </section>
      ${upSec}
      <section class="section">
        <div class="section-head"><h2>اختر صفّك</h2></div>
        <div class="stages">${C.STAGES.map((st) => `
          <div class="stage"><h3>${esc(st.name)}</h3>
            <div class="grade-grid">${st.grades.map((g) => `<a class="grade-chip${g.id === mine ? ' cur' : ''}" href="#/g/${esc(g.id)}"><span>${esc(g.short)}</span>${g.exam ? `<span class="tag-exam">${esc(C.EXAM_TAG)}</span>` : ''}</a>`).join('')}</div>
          </div>`).join('')}
        </div>
      </section>
      <section class="section" id="feat-sec" hidden></section>
      <section class="section" id="cont-sec" hidden>
        <div class="section-head"><h2>تابع من حيث توقفت</h2><span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" id="clear-watch">مسح السجل</button></div>
        <div class="vids" id="cont-list"></div>
      </section>
      <section class="section" id="new-sec" hidden>
        <div class="section-head"><h2>أحدث الدروس</h2><span class="muted" id="new-for"></span></div>
        <div class="vids" id="new-list"></div>
      </section>
      <section class="band band-teachers">
        <div class="vol-head"><b>معلمونا المتطوعون</b><span>شكراً لكل معلم يمنح وقته وعلمه. أنت معلم؟ انضم إليهم.</span></div>
        <div class="vol-faces" id="vol-faces"></div>
        <div class="row"><a class="btn btn-primary" href="#/teach">تطوّع معنا</a><a class="btn btn-ghost vol-all" href="#/teachers">كل المعلمين</a></div>
      </section>`;
    API.listTeachers().then((list) => {
      const box = document.getElementById('vol-faces');
      if (tok !== app.token || !box || !list || !list.length) return;
      const shown = list.slice(0, 12);
      box.innerHTML = shown.map((t) => `<a class="vol" href="#/t/${esc(t.id)}" title="${esc(t.display_name)}">${avatar(t.display_name, t.avatar_url, 'av-vol', gOf(t))}<span>${esc(t.display_name)}</span></a>`).join('')
        + (list.length > shown.length ? `<a class="vol vol-more" href="#/teachers"><span class="av av-vol">+${fNum(list.length - shown.length)}</span><span>والمزيد</span></a>` : '');
    }).catch(() => { /* اختياري */ });
    const conts = Object.entries(watch.read().items).map(([id, w]) => Object.assign({ id }, w))
      .filter((w) => !w.done && w.p >= 30 && Date.now() - w.at < 60 * DAY).sort((a, b) => b.at - a.at).slice(0, 4);
    if (conts.length) {
      document.getElementById('cont-sec').hidden = false;
      document.getElementById('cont-list').innerHTML = conts.map((w) => `<a class="vid" href="#/s/${esc(w.id)}">
        <div class="thumb">${/^[A-Za-z0-9_-]{11}$/.test(w.y || '') ? `<img src="https://i.ytimg.com/vi/${esc(w.y)}/mqdefault.jpg" alt="" loading="lazy" data-ph="${esc(subjectName(w.s))}">` : `<span class="ph">${esc(subjectName(w.s))}</span>`}
          <span class="play">من الدقيقة ${esc(mmss(w.p))}</span>${progressOf(w) ? `<span class="prog" style="--p:${progressOf(w)}%" aria-hidden="true"></span>` : ''}</div>
        <h3>${esc(w.ti || '')}</h3><span class="meta">${esc(gradeName(w.g))} · ${esc(subjectName(w.s))}${w.tn ? ' · ' + esc(w.tn) : ''}</span></a>`).join('');
      armed(document.getElementById('clear-watch'), async () => { watch.clear(); document.getElementById('cont-sec').hidden = true; toast('مُسح سجل المشاهدة من هذا الجهاز'); });
    }
    // درس الأسبوع يختاره المشرف
    if (app.settings.featured_session) {
      API.getSession(app.settings.featured_session).then((f) => {
        const sec = document.getElementById('feat-sec');
        if (tok !== app.token || !sec || !f || !['recorded', 'premiere'].includes(stateOf(f).key)) return;
        remember([f]);
        const th = thumbUrl(videoOf(f));
        sec.hidden = false;
        sec.innerHTML = `<a class="feat" href="#/s/${esc(f.id)}">
          <div class="thumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" data-ph="${esc(subjOf(f))}">` : `<span class="ph">${esc(subjOf(f))}</span>`}</div>
          <div class="feat-text"><span class="pill pill-exam">درس الأسبوع</span><h2>${esc(f.title)}</h2>
            <span class="muted">${esc(gradeName(f.grade))} · ${esc(subjOf(f))}${f.teacher ? ' · ' + esc(f.teacher.display_name || '') : ''}</span></div></a>`;
      }).catch(() => { /* اختياري */ });
    }
    // الدروس القادمة بمواعيدها (وما يُعرض الآن): لصف الطالب إن اختاره، وإلا لكل الصفوف
    (async () => {
      try {
        const g = mine && GRADES[mine] ? mine : '';
        // الحصة التي تبدأ خلال ربع ساعة تظهر في «مباشر الآن»
        const rows = remember(upNow(await API.listUpcoming({ grade: g, limit: 80 })));
        const sec = document.getElementById('up-sec');
        if (tok !== app.token || !rows.length || !sec) return;
        sec.hidden = false;
        document.getElementById('up-for').textContent = g ? gradeName(g) : 'كل الصفوف';
        if (g) { const a = document.getElementById('up-all'); a.hidden = false; a.href = '#/g/' + g + '/plan'; }
        document.getElementById('up-list').innerHTML = calendarHtml(rows, !g);
      } catch (e) { /* القسم اختياري */ }
    })();
    // أحدث الدروس: لصف الطالب إن اختاره من قبل، وإلا لكل الصفوف
    (async () => {
      try {
        const rows = remember(await API.listLatest(mine && GRADES[mine] ? mine : '', 4));
        if (tok !== app.token || !rows.length) return;
        document.getElementById('new-sec').hidden = false;
        document.getElementById('new-for').textContent = mine && GRADES[mine] ? gradeName(mine) : 'كل الصفوف';
        document.getElementById('new-list').innerHTML = rows.map((s) => vidHtml(s, !(mine && GRADES[mine]))).join('');
      } catch (e) { /* القسم اختياري */ }
    })();
    try {
      const live = remember(await API.listLiveNow());
      if (tok !== app.token) return;
      const sec = document.getElementById('live-sec');
      if (live.length) {
        sec.hidden = false;
        document.getElementById('live-count').textContent = plural(live.length, 'حصة واحدة', 'حصتان', 'حصص', 'حصة');
        live.sort((a, b) => (b.grade === mine) - (a.grade === mine));
        const list = document.getElementById('live-list');
        list.innerHTML = live.slice(0, 3).map((s) => cardHtml(s, { showGrade: true })).join('')
          + (live.length > 3 ? `<button type="button" class="btn" id="live-more">عرض كل الحصص المباشرة (${fNum(live.length)})</button>` : '');
        const mb = document.getElementById('live-more');
        if (mb) mb.addEventListener('click', () => { list.innerHTML = live.map((s) => cardHtml(s, { showGrade: true })).join(''); });
      }
    } catch (e) { /* الشريط اختياري */ }
  }

  // ------------------------------------------------------------------
  //  جدول الصف
  // ------------------------------------------------------------------
  const gradeUi = {}; // gradeId → { day, subject }
  async function pageGrade(tok, gradeId, tab, extra) {
    const g = GRADES[gradeId];
    if (!g) return pageNotFound();
    const plan = tab === 'plan';
    const subj = tab && tab !== 'plan' && tab !== 'rec' ? tab : '';
    if (subj && !C.SUBJECTS[subj]) return pageNotFound();
    store.set('grade', gradeId);
    setNav('home'); setTitle(subj ? `${subjectName(subj)} — ${g.name}` : g.name);
    const ui = gradeUi[gradeId] || (gradeUi[gradeId] = { day: dayKey(new Date()), subject: '' });
    view.innerHTML = `
      <header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الصفوف</a><span>›</span><span>${esc(g.stage.name)}</span></nav>
        <div class="title-row"><h1>${esc(subj ? subjectName(subj) : g.name)}</h1>${subj ? `<span class="muted">${esc(g.name)}</span>` : ''}${g.exam ? `<span class="pill pill-exam">${esc(C.EXAM_PILL)}</span>` : ''}<span class="spacer"></span><a class="btn btn-ghost btn-sm" href="#/">تغيير الصف</a></div>
        <nav class="tabs" aria-label="أقسام الصف">
          <a href="#/g/${esc(gradeId)}"${plan ? '' : ' aria-current="page"'}>الدروس</a>
          <a href="#/g/${esc(gradeId)}/plan"${plan ? ' aria-current="page"' : ''}>جدول الحصص</a>
        </nav>
      </header>
      <div id="grade-body"><p class="loading">جارٍ تحميل الدروس…</p></div>`;
    const body = document.getElementById('grade-body');
    if (subj) return subjectView(tok, gradeId, subj, body, extra === 'exam');
    if (!plan) return gradeRecordings(tok, gradeId, body);

    const from = startOfDay(new Date());
    const to = addDays(from, C.DAYS_AHEAD);
    let sessions;
    try { sessions = remember(await API.listSchedule(gradeId, from, to)); }
    catch (e) {
      if (tok !== app.token) return;
      body.innerHTML = errorBox(e, true);
      $('[data-retry]', body).addEventListener('click', route);
      return;
    }
    if (tok !== app.token) return;

    const byDay = {};
    sessions.forEach((s) => { (byDay[dayKey(s.starts_at)] = byDay[dayKey(s.starts_at)] || []).push(s); });
    const days = Array.from({ length: C.DAYS_AHEAD }, (_, i) => addDays(from, i));
    if (!days.some((d) => dayKey(d) === ui.day)) ui.day = dayKey(from);

    function draw() {
      const daySubjects = Array.from(new Set(sessions.map((s) => s.subject)));
      if (ui.subject && !daySubjects.includes(ui.subject)) ui.subject = '';
      const todays = (byDay[ui.day] || []).filter((s) => !ui.subject || s.subject === ui.subject);
      const slots = {};
      todays.forEach((s) => { const k = +new Date(s.starts_at); (slots[k] = slots[k] || []).push(s); });
      const slotKeys = Object.keys(slots).map(Number).sort((a, b) => a - b);
      const nextDay = days.find((d) => dayKey(d) > ui.day && (byDay[dayKey(d)] || []).some((s) => !ui.subject || s.subject === ui.subject));
      const selDate = days.find((d) => dayKey(d) === ui.day) || from;

      body.innerHTML = `
        <div class="days" role="group" aria-label="اختر اليوم">${days.map((d, i) => {
          const k = dayKey(d);
          const n = (byDay[k] || []).filter((s) => s.status !== 'cancelled' && (!ui.subject || s.subject === ui.subject)).length;
          return `<button type="button" class="day${n ? ' has' : ''}${i === 0 ? ' today' : ''}" data-day="${k}" aria-pressed="${k === ui.day}">
            <span class="wd">${i === 0 ? 'اليوم' : i === 1 ? 'غداً' : esc(fWd.format(d))}</span><span class="dn">${esc(fDn.format(d))}</span><span class="ct">${n ? esc(countShort(n)) : '—'}</span></button>`;
        }).join('')}</div>
        ${daySubjects.length > 1 ? `<div class="filters" role="group" aria-label="تصفية حسب المادة">
          <button type="button" class="chip" data-subj="" aria-pressed="${!ui.subject}">كل المواد</button>
          ${subjectsOf(gradeId).filter((x) => daySubjects.includes(x)).map((x) => `<button type="button" class="chip" data-subj="${esc(x)}" aria-pressed="${ui.subject === x}">${esc(subjectName(x))}</button>`).join('')}
        </div>` : ''}
        <div class="day-title"><h2>${esc(dayLabel(selDate))}</h2><span class="muted small">${slotKeys.length ? plural(todays.length, 'حصة واحدة', 'حصتان', 'حصص', 'حصة') : ''}</span></div>
        ${slotKeys.length ? `<div class="slots">${slotKeys.map((k) => {
          const list = slots[k].sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled'));
          const tp = timeParts(k);
          const live = list.filter((s) => s.status !== 'cancelled').length;
          return `<section class="slot" aria-label="الساعة ${esc(time(k))}">
            <div class="slot-time"><b>${esc(tp.main)}</b><span>${esc(tp.period)}</span>${live > 1 ? `<small>${plural(live, 'معلم واحد', 'معلمان', 'معلمين', 'معلماً')}</small>` : ''}</div>
            <div class="slot-cards">${list.map((s) => cardHtml(s)).join('')}</div>
          </section>`;
        }).join('')}</div>` : `<div class="empty"><b>لا توجد دروس ${ui.subject ? 'لهذه المادة ' : ''}مجدولة في هذا اليوم</b>
          ${nextDay ? `<button type="button" class="btn btn-primary" data-day="${dayKey(nextDay)}">أقرب يوم فيه دروس: ${esc(fDayLong.format(nextDay))}</button>` : '<span>هنا تظهر الدروس التي حدّد المعلمون موعد نشرها.</span>'}
          <a class="btn btn-ghost" href="#/g/${esc(gradeId)}">تصفّح كل الدروس</a></div>`}`;
      $$('[data-day]', body).forEach((b) => b.addEventListener('click', () => {
        ui.day = b.getAttribute('data-day'); draw();
        const cur = $('.day[aria-pressed="true"]', body); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
      }));
      $$('[data-subj]', body).forEach((b) => b.addEventListener('click', () => { ui.subject = b.getAttribute('data-subj'); draw(); }));
      const cur = $('.day[aria-pressed="true"]', body);
      if (cur && cur.scrollIntoView && ui.day !== dayKey(from)) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    draw();
  }

  // ------------------------------------------------------------------
  //  مكتبة دروس الصف، وصفحة المادة مرتبة كما في الكتاب، والبحث، و«اطلب درساً»
  // ------------------------------------------------------------------
  const subjChips = (gradeId, cur) => `<nav class="filters" aria-label="المواد" style="padding-top:14px">
    <a class="chip" href="#/g/${esc(gradeId)}"${cur ? '' : ' aria-current="page"'}>الأحدث</a>
    ${subjectsOf(gradeId).map((x) => `<a class="chip" href="#/g/${esc(gradeId)}/${esc(x)}"${cur === x ? ' aria-current="page"' : ''}>${esc(subjectName(x))}</a>`).join('')}</nav>`;
  function chipIntoView(root) {
    const c = $('.filters [aria-current="page"]', root);
    if (c && c.scrollIntoView && c.previousElementSibling) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // البحث في دروس الصف (أو المادة)
  const searchHtml = (gradeId, subject) => (app.settings.legacy ? '' : `<form class="search" role="search" id="sform">
      <input class="input" type="search" id="sq" enterkeyhint="search" maxlength="60" autocomplete="off" aria-label="ابحث في الدروس"
        placeholder="ابحث في دروس ${esc(subject ? subjectName(subject) : gradeName(gradeId))}: ${isSkills(gradeId) ? 'بايثون، Canva، تصميم شعار…' : 'الكسور، نيوتن، Unit 3…'}"></form>
    <p class="sr-only" role="status" id="scount"></p><div id="sres"></div>`);
  function bindSearch(tok, gradeId, subject, onActive) {
    const inp = $('#sq');
    const res = $('#sres');
    if (!inp) return;
    let timer;
    let seq = 0;
    const say = (t) => { const st = $('#scount'); if (st) st.textContent = t; };
    const run = async () => {
      // مؤقت من صفحة أُعيد رسمها أو غادرها الطالب
      if (tok !== app.token || !inp.isConnected) return;
      const q = inp.value.trim();
      const my = ++seq;
      if (q.length < 2) { res.innerHTML = ''; say(''); onActive(false); return; }
      onActive(true);
      res.innerHTML = '<p class="loading">جارٍ البحث…</p>';
      try {
        const rows = remember(await API.searchLessons(gradeId, q, subject));
        if (my !== seq || tok !== app.token) return;
        res.innerHTML = rows.length
          ? `<p class="muted small">${plural(rows.length, 'نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة')} عن «${esc(q)}»</p><div class="vids">${rows.map((s) => vidHtml(s)).join('')}</div>`
          : `<div class="empty"><b>لم نجد درساً عن «${esc(q)}» بعد.</b>${requestsOn() ? '<span>اطلبه من معلمي الصف.</span><button type="button" class="btn btn-primary" data-askq>اطلب هذا الدرس من المعلمين</button>' : ''}</div>`;
        say(rows.length ? `${plural(rows.length, 'نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة')}` : `لم نجد درساً عن ${q}`);
        const b = $('[data-askq]', res);
        if (b) b.addEventListener('click', () => openRequest(q));
      } catch (e) { if (my === seq && tok === app.token) res.innerHTML = errorBox(e); }
    };
    inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 400); });
    $('#sform').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); run(); });
  }

  // «اطلب درساً»: بلا اسم ولا رقم ولا حساب
  const requestsOn = () => app.settings.requests_on !== false && !!API.requestLesson;
  function requestHtml(gradeId, subject) {
    if (!requestsOn()) return '';
    const term = currentTerm();
    const sk = isSkills(gradeId);
    return `<details class="box req" id="req"><summary><b>${sk ? 'تريد تعلّم مهارة غير موجودة؟ اطلبها من المتطوعين' : 'لم تجد الدرس الذي تحتاجه؟ اطلبه من المعلمين'}</b></summary>
      <form id="req-form" class="stack" novalidate>
        <div class="grid3">
          <div class="field"><label for="rq-subj">${sk ? 'المهارة' : 'المادة'}</label><select class="input" id="rq-subj">${subject ? '' : `<option value="" selected>${sk ? 'اختر المهارة' : 'اختر المادة'}</option>`}${subjectsOf(gradeId).map((x) => `<option value="${esc(x)}"${x === subject ? ' selected' : ''}>${esc(subjectName(x))}</option>`).join('')}</select></div>
          ${sk ? '' : `<div class="field"><label for="rq-term">الفصل الدراسي</label><select class="input" id="rq-term">${[1, 2].map((t) => `<option value="${t}"${t === term ? ' selected' : ''}>${esc(TERMS[t])}</option>`).join('')}</select></div>
          <div class="field"><label for="rq-unit">الوحدة</label><select class="input" id="rq-unit"><option value="">لا أعرف</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">الوحدة ${fNum(i + 1)}</option>`).join('')}</select></div>`}
        </div>
        <div class="field"><label for="rq-topic">${sk ? 'ماذا تريد أن تتعلم؟' : 'اسم الدرس أو الموضوع'}</label>
          <input class="input" id="rq-topic" maxlength="80" placeholder="${sk ? 'مثال: تصميم شعار بأداة Canva' : 'مثال: قانون نيوتن الثاني'}" aria-describedby="rq-hint">
          <span class="hint" id="rq-hint">اكتب اسم الدرس فقط، ولا تكتب اسمك أو رقمك أو أي حساب.</span></div>
        <div><button class="btn btn-primary" type="submit">أرسل الطلب</button></div>
      </form></details>`;
  }
  function bindRequest(gradeId) {
    const f = $('#req-form');
    if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $$('#req-form [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      const subj = $('#rq-subj').value;
      const topic = $('#rq-topic').value.trim();
      const unit = $('#rq-unit') ? Number($('#rq-unit').value) || null : null;
      if (!subj) { $('#rq-subj').setAttribute('aria-invalid', 'true'); $('#rq-subj').focus(); return toast(isSkills(gradeId) ? 'اختر المهارة.' : 'اختر المادة.', true); }
      if (!topic && !unit) { $('#rq-topic').setAttribute('aria-invalid', 'true'); $('#rq-topic').focus(); return toast('اكتب اسم الدرس، أو اختر الوحدة.', true); }
      if (topic && topic.length < 3) { $('#rq-topic').setAttribute('aria-invalid', 'true'); $('#rq-topic').focus(); return toast('اكتب اسم الدرس (3 أحرف على الأقل).', true); }
      const btn = $('button[type=submit]', f); btn.disabled = true;
      try {
        const r = await API.requestLesson({ grade: gradeId, subject: subj, term: $('#rq-term') ? Number($('#rq-term').value) || null : null, unit, topic });
        const votes = (r && r.votes) || 1;
        const min = app.settings.request_min_votes || 2;
        const who = (n) => plural(n, 'طالب واحد', 'طالبان', 'طلاب', 'طالباً');
        f.outerHTML = `<div class="note" id="req-done" tabindex="-1"><b>وصل طلبك ✓</b><span>${votes >= min ? `وصل الطلب إلى معلمي ${esc(subjectName(subj))}${votes > 1 ? `، وطلبه ${who(votes)} حتى الآن` : ''}.`
          : `يظهر لمعلمي ${esc(subjectName(subj))} عندما يطلبه ${who(min)}${votes > 1 ? ` (طلبه ${who(votes)} حتى الآن)` : ''}. اطلب من زملائك أن يطلبوه أيضاً.`}</span></div>`;
        const done = $('#req-done'); if (done) done.focus();
        toast('وصل طلبك ✓');
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }
  function openRequest(topic) {
    const d = $('#req');
    if (!d) return;
    d.open = true;
    const inp = $('#rq-topic');
    if (inp) inp.value = topic || '';
    const sel = $('#rq-subj');
    if (sel && !sel.value) sel.focus(); else if (inp) inp.focus();
    d.scrollIntoView({ block: 'center' });
  }

  // مكتبة الصف: الأحدث أولاً من كل المواد
  async function gradeRecordings(tok, gradeId, body) {
    const PAGE = 24;
    let offset = 0;
    let items = [];
    let seq = 0;
    body.innerHTML = `<div id="g-up"></div>${subjChips(gradeId, '')}${searchHtml(gradeId, '')}<div id="dipl"></div><div id="main-list"><p class="loading">جارٍ التحميل…</p></div><div id="g-paths"></div>${requestHtml(gradeId, '')}`;
    // الحصص القادمة لهذا الصف أولاً
    API.listUpcoming({ grade: gradeId, limit: 12 }).then((rows) => {
      const box = $('#g-up');
      const list = upNow(rows || []).slice(0, 3);
      if (tok !== app.token || !box || !list.length) return;
      remember(list);
      box.innerHTML = `<section class="section"><div class="section-head"><h2>القادم</h2><span class="spacer"></span><a class="btn btn-ghost btn-sm" href="#/g/${esc(gradeId)}/plan">جدول الحصص</a></div>${upCards(list)}</section>`;
    }).catch(() => { /* اختياري */ });
    API.listPaths(gradeId).then((rows) => {
      const box = $('#g-paths');
      if (tok !== app.token || !box || !rows || !rows.length) return;
      box.innerHTML = `<section class="section"><div class="section-head"><h2>مسارات جاهزة</h2></div><div class="pcards">${rows.slice(0, 6).map(pathCard).join('')}</div></section>`;
    }).catch(() => { /* اختياري */ });
    chipIntoView(body);
    bindSearch(tok, gradeId, '', (on) => { ['#main-list', '#dipl', '#g-paths', '#g-up'].forEach((x) => { const el = $(x); if (el) el.hidden = on; }); });
    bindRequest(gradeId);
    if (isExamGrade(gradeId)) {
      API.listExamLessons(gradeId).then((rows) => {
        if (tok !== app.token || !rows || !rows.length) return;
        const n = {};
        rows.forEach((r) => { n[r.subject] = (n[r.subject] || 0) + 1; });
        const list = subjectsOf(gradeId).filter((x) => n[x]);
        if (!list.length) return;
        $('#dipl').innerHTML = `<section class="box dipl"><h2>أسئلة الدبلوم السابقة محلولة</h2>
          <div class="filters">${list.map((x) => `<a class="chip" href="#/g/${esc(gradeId)}/${esc(x)}/exam">${esc(subjectName(x))} <span class="muted">${fNum(n[x])}</span></a>`).join('')}</div></section>`;
      }).catch(() => { /* اختياري */ });
    }
    async function load(more) {
      const req = ++seq;
      try {
        const rows = remember(await API.listRecordings(gradeId, '', offset, PAGE));
        if (tok !== app.token || req !== seq) return;
        // درس نُشر بين صفحتين يزيح القائمة: لا نكرر بطاقة ظهرت من قبل
        const seen = new Set(more ? items.map((x) => x.id) : []);
        items = more ? items.concat(rows.filter((x) => !seen.has(x.id))) : rows;
        offset = more ? offset + rows.length : rows.length;
        draw(rows.length === PAGE);
      } catch (e) {
        if (tok !== app.token || req !== seq) return;
        if (more) { toast(errMsg(e), true); const m = document.getElementById('more'); if (m) m.disabled = false; return; }
        $('#main-list').innerHTML = errorBox(e, true);
        $('[data-retry]', body).addEventListener('click', () => { offset = 0; load(false); });
      }
    }
    function draw(hasMore) {
      const box = $('#main-list');
      if (!box) return;
      box.innerHTML = items.length ? `<div class="vids">${items.map((s) => vidHtml(s)).join('')}</div>
          ${hasMore ? '<div class="row" style="justify-content:center;padding-bottom:24px"><button type="button" class="btn" id="more">عرض المزيد</button></div>' : ''}`
        : `<div class="empty"><b>لا توجد دروس بعد</b><a class="btn" href="#/g/${esc(gradeId)}/plan">جدول الحصص</a></div>`;
      const m = document.getElementById('more');
      if (m) m.addEventListener('click', () => { m.disabled = true; load(true); });
    }
    load(false);
  }

  // صفحة المادة: الفصل الدراسي ← الوحدات ← الدروس، مع «تابع من حيث وصلت»
  const subjUi = {}; // grade|subject → { term, type, touched }
  function lessonRow(s, withUnit, num) {
    const w = watch.get(s.id);
    const pr = progressOf(w);
    const bits = [num ? subjOf(s) : '', withUnit ? unitLabel(s) : isSkills(s.grade) && s.unit ? 'الجزء ' + fNum(s.unit) : '',
      (s.teacher && s.teacher.display_name) || '', minsTxt(minutes(s))];
    if (s.lesson_type && s.lesson_type !== 'lesson') bits.push(typeName(s.lesson_type, s.grade));
    if (s.exam_year) bits.push(examLine(s));
    return `<a class="lrow${w && w.done ? ' seen' : ''}" href="#/s/${esc(s.id)}">
      ${num ? `<span class="lr-num" aria-hidden="true">${fNum(num)}</span>` : '<span class="lr-ic" aria-hidden="true"></span>'}
      <span class="lr-main"><b>${esc(s.title)}</b><span>${esc(bits.filter(Boolean).join(' · '))}</span>
        ${pr ? `<span class="prog" style="--p:${pr}%" aria-hidden="true"></span>` : ''}</span>
      ${w && w.done ? '<span class="pill pill-ok">شاهدتُه ✓</span>' : ''}</a>`;
  }
  async function subjectView(tok, gradeId, subject, body, examOnly) {
    body.innerHTML = subjChips(gradeId, subject) + '<p class="loading">جارٍ تحميل الدروس…</p>';
    chipIntoView(body);
    const toolsReq = getTools().catch(() => []);
    const upReq = API.listUpcoming({ grade: gradeId, subject }).catch(() => []);
    let rows;
    try { rows = remember(await subjectLessons(gradeId, subject)); }
    catch (e) {
      if (tok !== app.token) return;
      body.innerHTML = subjChips(gradeId, subject) + errorBox(e, true);
      chipIntoView(body);
      $('[data-retry]', body).addEventListener('click', route);
      return;
    }
    const tools = toolsFor(await toolsReq, gradeId, subject);
    const ups = remember(upNow(await upReq)).slice(0, 4);
    if (tok !== app.token) return;
    const key = gradeId + '|' + subject;
    // رابط «أسئلة الدبلوم» يعرض الامتحانات فقط دون أن يغيّر اختيار الطالب في صفحة المادة
    const ui = examOnly ? { term: 0, type: 'exam' } : (subjUi[key] || (subjUi[key] = { term: -1, type: '' }));
    const termCount = { 1: rows.filter((r) => r.term === 1).length, 2: rows.filter((r) => r.term === 2).length };
    if (ui.term === -1) { const ct = currentTerm(); ui.term = termCount[ct] ? ct : termCount[1] ? 1 : termCount[2] ? 2 : 0; }
    const typeOf = (r) => r.lesson_type || 'lesson';
    const types = Object.keys(TYPES).filter((t) => rows.some((r) => typeOf(r) === t));
    const exam = isExamGrade(gradeId);

    function draw() {
      const list = rows.filter((r) => (!ui.term || !r.term || r.term === ui.term) && (!ui.type || typeOf(r) === ui.type));
      // متابعة: درس بدأه الطالب ولم يكمله، أو الدرس التالي بعد آخر درس شاهده
      const ws = list.map((r) => watch.get(r.id));
      let cont = null;
      let open = list.findIndex((r, i) => progressOf(ws[i]) > 0);
      if (open >= 0) cont = { s: list[open], label: `تابع مشاهدة: ${list[open].title}`, sub: `من الدقيقة ${mmss(ws[open].p)}` };
      else {
        let last = -1;
        ws.forEach((w, i) => { if (w && w.done) last = i; });
        const nx = last >= 0 ? list.findIndex((r, i) => i > last && !(ws[i] && ws[i].done)) : -1;
        if (nx >= 0) { open = nx; cont = { s: list[nx], label: `الدرس التالي: ${list[nx].title}`, sub: unitLabel(list[nx]) || '' }; }
      }
      const doneCount = ws.filter((w) => w && w.done).length;

      let groups = [];
      if (ui.type === 'exam' && exam) {
        const years = Array.from(new Set(list.map((r) => r.exam_year || 0))).sort((a, b) => b - a);
        groups = years.map((y) => ({ title: y ? `امتحانات ${y}` : 'امتحانات أخرى', items: list.filter((r) => (r.exam_year || 0) === y) }));
      } else {
        // مع «الفصلان» تبقى وحدات كل فصل منفصلة (الوحدة 1 في الفصل الأول غير الوحدة 1 في الثاني)
        const both = !ui.term;
        const gk = (r) => (both ? (r.term || 0) * 100 + r.unit : r.unit);
        const keys = Array.from(new Set(list.filter((r) => r.unit).map(gk))).sort((a, b) => a - b);
        groups = keys.map((k) => {
          const items = list.filter((r) => r.unit && gk(r) === k);
          const t = both && items[0].term;
          const names = {};
          items.forEach((r) => { if (r.unit_title) names[r.unit_title] = (names[r.unit_title] || 0) + 1; });
          const name = Object.keys(names).sort((a, b) => names[b] - names[a])[0];
          return { title: `${t && termCount[1] && termCount[2] ? TERMS[t] + ' · ' : ''}الوحدة ${fNum(items[0].unit)}${name ? ': ' + name : ''}`, items };
        });
        const rev = list.filter((r) => !r.unit && (typeOf(r) === 'review' || typeOf(r) === 'exam'));
        const other = list.filter((r) => !r.unit && typeOf(r) !== 'review' && typeOf(r) !== 'exam');
        if (rev.length) groups.push({ title: exam ? 'مراجعات وامتحانات سابقة' : 'مراجعات', items: rev });
        if (other.length) groups.push({ title: groups.length ? 'دروس أخرى' : 'الدروس', items: other });
      }
      const sparse = list.length <= 5;
      const flat = ui.type === 'exam' ? list.slice().sort((a, b) => (b.exam_year || 0) - (a.exam_year || 0)) : list;
      const openGroup = cont ? groups.findIndex((g) => g.items.includes(cont.s)) : 0;
      const scrolls = $$('.filters', body).map((x) => x.scrollLeft);
      body.innerHTML = `${subjChips(gradeId, subject)}${searchHtml(gradeId, subject)}
        <div id="main-list">
        ${ups.length ? `<section class="up-strip"><h2>قادم في ${esc(subjectName(subject))}</h2>${upCards(ups)}</section>` : ''}
        ${termCount[1] && termCount[2] ? `<div class="filters" role="group" aria-label="الفصل الدراسي">
          ${[1, 2].map((t) => `<button type="button" class="chip" data-term="${t}" aria-pressed="${ui.term === t}">${esc(TERMS[t])} <span class="muted">${fNum(termCount[t])}</span></button>`).join('')}
          <button type="button" class="chip" data-term="0" aria-pressed="${!ui.term}">الفصلان</button></div>` : ''}
        ${types.length > 1 ? `<div class="filters" role="group" aria-label="نوع الدرس">
          <button type="button" class="chip" data-type="" aria-pressed="${!ui.type}">كل الأنواع</button>
          ${types.map((t) => `<button type="button" class="chip" data-type="${t}" aria-pressed="${ui.type === t}">${esc(typeName(t, gradeId))}</button>`).join('')}</div>` : ''}
        ${cont ? `<a class="cont" href="#/s/${esc(cont.s.id)}"><b>${esc(cont.label)}</b>${cont.sub ? `<span>${esc(cont.sub)}</span>` : ''}</a>` : ''}
        ${doneCount ? `<p class="muted small">شاهدتَ ${plural(doneCount, 'درساً واحداً', 'درسين', 'دروس', 'درساً')} من ${fNum(list.length)} في هذه القائمة.</p>` : ''}
        ${!list.length ? `<div class="empty"><b>لا توجد دروس ${ui.term || ui.type ? 'بهذا الاختيار ' : ''}بعد</b><span>تظهر هنا دروس ${esc(subjectName(subject))} فور نشرها.</span>
            ${(ui.term || ui.type) && rows.length ? '<button type="button" class="btn" data-all>عرض كل دروس المادة</button>' : ''}</div>`
          : sparse ? `<div class="lrows">${flat.map((r) => lessonRow(r, true)).join('')}</div>`
          : groups.map((g, i) => {
            const seen = g.items.filter((r) => (watch.get(r.id) || {}).done).length;
            return `<details class="unit"${i === openGroup || groups.length <= 2 ? ' open' : ''}>
              <summary><b>${esc(g.title)}</b><span class="muted small">${plural(g.items.length, 'درس واحد', 'درسان', 'دروس', 'درساً')}${seen ? ` · شاهدتَ ${fNum(seen)}` : ''}</span></summary>
              <div class="lrows">${g.items.map((r) => lessonRow(r)).join('')}</div></details>`;
          }).join('')}
        </div>
        ${tools.length ? `<section class="section subj-tools"><h2>أدوات تفاعلية تساعدك</h2><div class="tool-grid">${tools.map(toolCard).join('')}</div></section>` : ''}
        ${requestHtml(gradeId, subject)}`;
      bindSearch(tok, gradeId, subject, (on) => { const m = $('#main-list'); if (m) m.hidden = on; });
      bindRequest(gradeId);
      // بعد إعادة الرسم: نفس موضع شرائح التمرير، والتركيز على الزر الذي ضغطه الطالب
      $$('.filters', body).forEach((x, i) => { if (scrolls[i]) x.scrollLeft = scrolls[i]; });
      const refocus = (sel) => { const c = $(sel, body); if (c) c.focus(); };
      $$('[data-term]', body).forEach((b) => b.addEventListener('click', () => { ui.term = Number(b.getAttribute('data-term')); draw(); refocus(`[data-term="${ui.term}"]`); }));
      $$('[data-type]', body).forEach((b) => b.addEventListener('click', () => { ui.type = b.getAttribute('data-type'); draw(); refocus(`[data-type="${ui.type}"]`); }));
      const all = $('[data-all]', body);
      if (all) all.addEventListener('click', () => { ui.term = 0; ui.type = ''; draw(); });
    }
    draw();
    chipIntoView(body);
  }

  // ------------------------------------------------------------------
  //  المهارات: دورات خارج المنهج مرتبة بالأجزاء
  // ------------------------------------------------------------------
  const safetyNote = () => `<div class="note safety"><b>للطلاب وأولياء الأمور</b><span>يقدّم هذه الدروس متطوعون تراجعهم إدارة المنصة. لا يوجد أي تواصل خاص داخل المنصة، فلا تتواصل مع أحد خارجها، وبلّغ عن أي طلب غريب بزر «الإبلاغ عن مشكلة».</span></div>`;
  const skillCard = (k) => `<a class="skill-card" href="#/k/${esc(k.id)}"><span class="sk-ic" aria-hidden="true">${esc(k.icon || '✨')}</span>
    <b>${esc(k.name)}</b><span class="muted small">${esc(k.desc || '')}</span><span class="pill" data-count="${esc(k.id)}" hidden></span></a>`;
  // بطاقة مسار مع تقدّم الطالب فيه (من سجل المشاهدة في جهازه)
  function pathCard(p) {
    const items = p.items || [];
    const done = items.filter((id) => (watch.get(id) || {}).done).length;
    const pct = items.length ? Math.round((100 * done) / items.length) : 0;
    return `<a class="pcard" href="#/p/${esc(p.id)}"><span class="pill">مسار</span><b>${esc(p.title)}</b>
      <span class="muted small">${esc(gradeName(p.grade))} · ${lessonsN(items.length)}${p.teacher && p.teacher.display_name ? ' · ' + esc(p.teacher.display_name) : ''}</span>
      ${done ? `<span class="prog" style="--p:${pct}%" aria-hidden="true"></span><span class="small">شاهدتَ ${fNum(done)} من ${fNum(items.length)}</span>` : ''}</a>`;
  }
  async function pageSkills(tok, skillId) {
    setNav('skills');
    const k = skillId ? SKILL[skillId] : null;
    if (skillId && !k) return pageNotFound();
    setTitle(k ? k.name : 'المهارات');
    view.innerHTML = `<header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الرئيسية</a><span>›</span>${k ? `<a href="#/k">المهارات</a><span>›</span><span>${esc(k.name)}</span>` : '<span>المهارات</span>'}</nav>
        <div class="title-row"><h1>${k ? `<span aria-hidden="true">${esc(k.icon || '')}</span> ${esc(k.name)}` : 'مهارات المستقبل'}</h1></div>
        <p class="muted">${esc(k ? k.desc || '' : 'دورات مجانية خارج المنهج: الذكاء الاصطناعي والتصميم والبرمجة وغيرها، يقدّمها متطوعون تراجعهم إدارة المنصة.')}</p>
      </header><div id="skill-body"><p class="loading">جارٍ التحميل…</p></div>`;
    const body = $('#skill-body');
    return k ? skillView(tok, k, body) : skillsIndex(tok, body);
  }
  async function skillsIndex(tok, body) {
    body.innerHTML = `${safetyNote()}
      <div class="skill-cards">${SKILLS.map(skillCard).join('')}</div>
      ${searchHtml('skills', '')}
      <div id="main-list">
        <section class="section" id="sk-paths" hidden><div class="section-head"><h2>مسارات جاهزة</h2></div><div class="pcards" id="sk-paths-list"></div></section>
        <section class="section"><div class="section-head"><h2>أحدث دروس المهارات</h2></div><div id="sk-latest"><p class="loading">جارٍ التحميل…</p></div></section>
      </div>
      ${requestHtml('skills', '')}`;
    bindSearch(tok, 'skills', '', (on) => { const m = $('#main-list'); if (m) m.hidden = on; });
    bindRequest('skills');
    API.skillCounts().then((n) => {
      if (tok !== app.token) return;
      Object.keys(n || {}).forEach((id) => { const el = $(`[data-count="${id}"]`); if (el && n[id]) { el.hidden = false; el.textContent = lessonsN(n[id]); } });
    }).catch(() => { /* اختياري */ });
    API.listPaths('skills').then((rows) => {
      if (tok !== app.token || !rows || !rows.length) return;
      $('#sk-paths').hidden = false; $('#sk-paths-list').innerHTML = rows.map(pathCard).join('');
    }).catch(() => { /* اختياري */ });
    try {
      const rows = remember(await API.listRecordings('skills', '', 0, 12));
      if (tok !== app.token || !$('#sk-latest')) return;
      $('#sk-latest').innerHTML = rows.length ? `<div class="vids">${rows.map((s) => vidHtml(s)).join('')}</div>`
        : `<div class="empty"><b>تُنشر هنا دروس المهارات قريباً</b><span>أنت مهندس أو مصمم أو مبرمج وتريد التطوع؟</span><a class="btn btn-primary" href="#/volunteer">تطوّع معنا</a></div>`;
    } catch (e) { if (tok === app.token && $('#sk-latest')) $('#sk-latest').innerHTML = errorBox(e); }
  }
  const skillUi = {}; // skill → { ages }
  async function skillView(tok, k, body) {
    let rows;
    const upReq = API.listUpcoming({ grade: 'skills', subject: k.id }).catch(() => []);
    try { rows = remember(await subjectLessons('skills', k.id)); }
    catch (e) { if (tok === app.token) { body.innerHTML = errorBox(e, true); $('[data-retry]', body).addEventListener('click', route); } return; }
    if (tok !== app.token) return;
    const ui = skillUi[k.id] || (skillUi[k.id] = { ages: '' });
    const hasAges = rows.some((r) => AGE_IDS.includes(r.ages));
    const ups = remember(upNow(await upReq)).slice(0, 4);
    if (tok !== app.token) return;
    function draw() {
      const list = rows.filter((r) => !ui.ages || !r.ages || r.ages === 'all' || r.ages === ui.ages);
      // الدورات: كل دورة باسمها، وأجزاؤها بالترتيب؛ وفي «أخرى» تُجمع حسب اسم المهارة أيضاً
      const keyOf = (r) => `${k.id === 'sk_other' ? (r.skill_name || 'مهارات متنوعة') + ' · ' : ''}${r.unit_title || 'دروس متفرقة'}|${r.teacher_id}`;
      const groups = [];
      list.forEach((r) => { let g = groups.find((x) => x.key === keyOf(r)); if (!g) groups.push(g = { key: keyOf(r), items: [] }); g.items.push(r); });
      groups.forEach((g) => g.items.sort((a, b) => (a.unit || 99) - (b.unit || 99) || a.starts_at.localeCompare(b.starts_at)));
      const flat = groups.reduce((a, g) => a.concat(g.items), []);
      const ws = flat.map((r) => watch.get(r.id));
      let cont = null;
      const open = flat.findIndex((r, i) => progressOf(ws[i]) > 0);
      if (open >= 0) cont = { s: flat[open], label: `تابع مشاهدة: ${flat[open].title}`, sub: `من الدقيقة ${mmss(ws[open].p)}` };
      else {
        let last = -1; ws.forEach((w, i) => { if (w && w.done) last = i; });
        const nx = last >= 0 ? flat.findIndex((r, i) => i > last && !(ws[i] && ws[i].done)) : -1;
        if (nx >= 0) cont = { s: flat[nx], label: `الجزء التالي: ${flat[nx].title}`, sub: unitLabel(flat[nx]) };
      }
      const most = (arr) => { const n = {}; arr.forEach((x) => { if (x) n[x] = (n[x] || 0) + 1; }); return Object.keys(n).sort((a, b) => n[b] - n[a])[0]; };
      const scrolls = $$('.filters', body).map((x) => x.scrollLeft);
      body.innerHTML = `${safetyNote()}${searchHtml('skills', k.id)}
        <div id="main-list">
          ${ups.length ? `<section class="up-strip"><h2>قادم في ${esc(k.name)}</h2>${upCards(ups)}</section>` : ''}
          ${hasAges ? `<div class="filters" role="group" aria-label="العمر المناسب">
            ${[['', 'كل الأعمار']].concat(AGE_IDS.map((a) => [a, AGES[a]])).map(([v, n]) => `<button type="button" class="chip" data-ages="${v}" aria-pressed="${ui.ages === v}">${esc(n)}</button>`).join('')}</div>` : ''}
          ${cont ? `<a class="cont" href="#/s/${esc(cont.s.id)}"><b>${esc(cont.label)}</b>${cont.sub ? `<span>${esc(cont.sub)}</span>` : ''}</a>` : ''}
          ${!list.length ? `<div class="empty"><b>لا توجد دروس في ${esc(k.name)} ${ui.ages ? 'لهذا العمر ' : ''}بعد</b><span>أنت تتقن هذه المهارة وتريد تعليمها؟</span><a class="btn btn-primary" href="#/volunteer">تطوّع معنا</a></div>`
            : groups.map((g, i) => {
              const lv = most(g.items.map((r) => r.level));
              const ag = most(g.items.map((r) => r.ages));
              const seen = g.items.filter((r) => (watch.get(r.id) || {}).done).length;
              const t = g.items[0].teacher || {};
              return `<details class="unit"${i === 0 || groups.length <= 3 || (cont && g.items.includes(cont.s)) ? ' open' : ''}>
                <summary><b>${esc(g.key.split('|')[0])}</b><span class="muted small">${lessonsN(g.items.length)}${t.display_name ? ' · ' + esc(t.display_name) : ''}${seen ? ` · شاهدتَ ${fNum(seen)}` : ''}</span>
                  ${lv ? `<span class="pill">${esc(LEVELS[lv] || '')}</span>` : ''}${ag && ag !== 'all' ? `<span class="pill">${esc(AGES[ag] || '')}</span>` : ''}</summary>
                <div class="lrows">${g.items.map((r) => lessonRow(r)).join('')}</div></details>`;
            }).join('')}
        </div>
        ${requestHtml('skills', k.id)}`;
      $$('.filters', body).forEach((x, i) => { if (scrolls[i]) x.scrollLeft = scrolls[i]; });
      bindSearch(tok, 'skills', k.id, (on) => { const m = $('#main-list'); if (m) m.hidden = on; });
      bindRequest('skills');
      $$('[data-ages]', body).forEach((b) => b.addEventListener('click', () => {
        ui.ages = b.getAttribute('data-ages'); draw();
        const c = $(`[data-ages="${ui.ages}"]`, body); if (c) c.focus();
      }));
    }
    draw();
  }

  // ------------------------------------------------------------------
  //  المسار: دروس مرتبة يتابعها الطالب واحداً بعد الآخر
  // ------------------------------------------------------------------
  async function pagePath(tok, id) {
    setNav('');
    view.innerHTML = '<p class="loading">جارٍ تحميل المسار…</p>';
    let p; let rows;
    try {
      p = await API.getPath(id);
      rows = p ? remember(await API.lessonsByIds(p.items || [])) : [];
    } catch (e) { if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]').addEventListener('click', route); } return; }
    if (tok !== app.token) return;
    if (!p) return pageNotFound('هذا المسار غير موجود أو لم يُنشر.');
    setTitle(p.title);
    const done = rows.filter((r) => (watch.get(r.id) || {}).done).length;
    const next = rows.find((r) => !(watch.get(r.id) || {}).done);
    const t = p.teacher || {};
    view.innerHTML = `
      <header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الرئيسية</a><span>›</span><a href="${esc(gradeHref(p.grade))}">${esc(gradeName(p.grade))}</a><span>›</span><span>مسار</span></nav>
        <div class="title-row"><h1>${esc(p.title)}</h1><span class="pill">مسار</span></div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        <p class="muted small">${lessonsN(rows.length)}${t.display_name ? ` · أعدّه <a href="#/t/${esc(t.id || p.owner)}">${esc(t.display_name)}</a>` : ''}</p>
        ${p.published === false ? '<div class="note warn">هذا المسار مسودة ولا يراه الطلاب بعد.</div>' : ''}
      </header>
      <div class="stack" style="padding-block:8px 28px">
        ${rows.length ? `<div class="box path-progress"><div class="row"><b>${done ? `شاهدتَ ${fNum(done)} من ${fNum(rows.length)}` : 'لم تبدأ هذا المسار بعد'}</b><span class="spacer"></span>
            ${next ? `<a class="btn btn-primary" href="#/s/${esc(next.id)}">${done ? 'تابع: ' : 'ابدأ: '}${esc(next.title)}</a>` : '<span class="pill pill-ok">أكملتَ المسار ✓</span>'}</div>
          <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${rows.length}" aria-valuenow="${done}" aria-label="التقدم في المسار"><span style="width:${Math.round((100 * done) / rows.length)}%"></span></div></div>
          <div class="lrows">${rows.map((r, i) => lessonRow(r, true, i + 1)).join('')}</div>`
          : '<div class="empty"><b>لا توجد دروس ظاهرة في هذا المسار بعد</b></div>'}
        <p class="muted small">يُحفظ تقدّمك في هذا الجهاز فقط.</p>
      </div>`;
  }

  // ------------------------------------------------------------------
  //  الدعوة والترشيح: صفحة يفتحها المتطوع من رابط خاص
  // ------------------------------------------------------------------
  const joinCode = () => { const j = store.json('join', null); return j && j.code && Date.now() - (j.at || 0) < 14 * DAY ? j.code : ''; };
  async function redeemStored() {
    const code = joinCode();
    if (!code || !API.redeemInvite) return null;
    try {
      const r = await API.redeemInvite(code);
      store.del('join');
      app.profile = await API.myProfile();
      renderAuth();
      if (r && !r.already) toast(r.kind === 'invite' ? `أهلاً بك! اعتُمد حسابك بدعوة من ${r.label}` : `أهلاً بك! اعتُمد حسابك بترشيح ${r.label}`);
      return r;
    } catch (e) { store.del('join'); toast(errMsg(e), true); return null; }
  }

  // ------------------------------------------------------------------
  //  صفحتا «تطوّع معنا» و«لأولياء الأمور»
  // ------------------------------------------------------------------
  function pageVolunteer() {
    setNav(''); setTitle('تطوّع معنا');
    const n = fNum(C.TRUST_AFTER || 3);
    view.innerHTML = `
      <header class="page-head"><h1>تطوّع معنا: اجعل علمك صدقة جارية</h1>
        <p class="muted">نبحث عن معلمين ومعلمات، وعن مهندسين ومصممين ومتخصصين يعلّمون الطلاب مهارات المستقبل. كل ما تحتاجه حاسوب وصوت واضح.</p></header>
      <article class="prose">
        <h2>من نبحث عنه؟</h2>
        <ul>
          <li><b>معلمو المنهج</b> لكل صف ومادة من الصف الأول إلى الثاني عشر، ومنهم المتقاعدون أصحاب الخبرة.</li>
          <li><b>متخصصو المهارات:</b> ${SKILLS.filter((k) => k.id !== 'sk_other').map((k) => esc(k.name)).join('، ')}، وغيرها.</li>
        </ul>
        <h2>كيف تنضم؟</h2>
        <ol>
          <li>ادخل بحساب Google وأكمل ملفك، وتراجع الإدارة حسابك.</li>
          <li>أول ${n} دروس للمتطوع الجديد تراجعها الإدارة قبل ظهورها للطلاب، ثم تُنشر دروسك مباشرة.</li>
        </ol>
        <h2>كيف تشرح؟</h2>
        <p><b>حصة مباشرة:</b> تحدد اليوم والساعة وتحدد الموعد، والمنصة تنشئ رابط الحصة، فيحضرها الطلاب من المنصة في موعدها. وبعدها ترسل تسجيلها فننشره على قناة «مدرار العلم» في يوتيوب باسمك لمن فاته الحضور.</p>
        <p><b>أو درس مسجّل:</b> في استوديو المنصة تسجّل شاشتك وصوتك فقط بلا برامج، أو تصوّر بجوالك، ثم تضغط «أرسل الدرس». لا تحتاج قناة يوتيوب في الحالتين. <a href="#/guide">دليل المعلم خطوة بخطوة</a>.</p>
        <h2>ماذا تجد في المنصة؟</h2>
        <ul>
          <li>أثر دروسك: المشاهدات وشكر الطلاب، شهرياً.</li>
          <li>طلبات الطلاب في موادك، لتعرف ما يحتاجونه فعلاً.</li>
          <li>شهادة شكر وتقدير برمز تحقق عند ${CERT_LEVELS.map((l) => fNum(l)).join(' و')} من الدروس.</li>
          <li>شارة «موثّق ✓» يمنحها المشرف لمن تحقّق منه.</li>
        </ul>
        <h2>ميثاق المتطوع باختصار</h2>
        <p>الشرح مجاني بالكامل، بلا إعلانات لدروس أو دورات مدفوعة، وبلا أي تواصل خاص مع الطلاب. <a href="#/about">اقرأ الميثاق كاملاً</a>.</p>
        <div class="cta-row"><a class="btn btn-primary btn-lg" href="#/teach">تطوّع بدرس واحد</a><a class="btn" href="#/dashboard">اطلب الانضمام</a><a class="btn" href="#/guide">كيف أبدأ؟</a></div>
      </article>`;
  }
  function pageParents() {
    setNav(''); setTitle('لأولياء الأمور');
    view.innerHTML = `
      <header class="page-head"><h1>لأولياء الأمور: كيف نحمي أبناءكم؟</h1>
        <p class="muted">${esc(C.SITE_NAME)} منصة مجانية لحصص مباشرة ودروس مسجّلة، صُممت لتكون آمنة للطلاب من الصف الأول إلى الثاني عشر.</p></header>
      <article class="prose">
        <h2>ما الذي يفعله ابنك في المنصة؟</h2>
        <p>يختار صفّه، فيحضر الحصص المباشرة في مواعيدها، ويشاهد الدروس المسجّلة مرتبة كما في كتابه المدرسي. وفي قسم المهارات دورات مثل الذكاء الاصطناعي والتصميم والبرمجة.</p>
        <h2>الأمان</h2>
        <ul>
          <li><b>لا تواصل خاص:</b> لا دردشة ولا رسائل داخل المنصة. الحصة المباشرة تُعقد في Jitsi Meet برابط تنشئه المنصة، ويدخلها الطالب باسمه الأول فقط، ورابطها لا يظهر إلا قبل الحصة بربع ساعة.</li>
          <li><b>تسجيل الحصة</b> فيه الشرح والأصوات فقط: الكاميرا مغلقة، ولا تظهر صور الطلاب.</li>
          <li><b>المتطوعون تحت المراجعة:</b> كل متطوع جديد تراجع الإدارة حسابه، وأول ${fNum(C.TRUST_AFTER || 3)} دروس له قبل ظهورها، وشارة «موثّق ✓» لمن تحقّقت منه الإدارة.</li>
          <li><b>الإبلاغ:</b> تحت كل درس زر «الإبلاغ عن مشكلة»، والإدارة تُخفي أي درس مخالف وتوقف صاحبه.</li>
          <li><b>بلا إعلانات</b> ولا دورات مدفوعة، وهذا شرط في ميثاق المتطوعين.</li>
          <li>الفيديوهات تُعرض من يوتيوب بوضع الخصوصية المحسّنة.</li>
        </ul>
        <h2>الخصوصية</h2>
        <ul>
          <li>الطالب <b>لا يُنشئ حساباً</b> ولا يُطلب منه اسم أو رقم أو بريد.</li>
          <li>«تابع من حيث توقفت» و«شاهدتُه ✓» ونتائج الاختبارات القصيرة تُحفظ في جهاز الطالب فقط، ولا تصل إلينا.</li>
          <li>طلب الدرس يُرسل دون أي بيانات، ويُرفض إن كان فيه رقم هاتف أو حساب.</li>
        </ul>
        <h2>كيف تتابع تقدّم ابنك؟</h2>
        <ul>
          <li>على الجهاز الذي يدرس منه: الصفحة الرئيسية تعرض «تابع من حيث توقفت»، وصفحة كل مادة تعرض الدروس التي شاهدها.</li>
          <li>«المسارات» تعرض نسبة ما أكمله من مجموعة دروس مرتبة، مثل الاستعداد لاختبار.</li>
          <li>بعد كل درس قد يجد «اختبر نفسك»: أسئلة قصيرة تبيّن هل فهم الدرس.</li>
        </ul>
        <h2>نصائح</h2>
        <ul>
          <li>أضف المنصة إلى الشاشة الرئيسية في هاتف ابنك من قائمة المتصفح، فتفتح مثل التطبيق.</li>
          <li>شاهد معه الدرس الأول، وشجّعه على حل «اختبر نفسك».</li>
          <li>ذكّره ألا يكتب رقمه أو حساباته في تعليقات يوتيوب.</li>
        </ul>
        ${C.CONTACT ? `<p>للتواصل مع إدارة المنصة: <span class="path">${esc(C.CONTACT)}</span></p>` : ''}
      </article>`;
  }

  // ------------------------------------------------------------------
  //  صفحة الحصة
  // ------------------------------------------------------------------
  function playerHtml(s) {
    const st = stateOf(s);
    const url = watchUrl(s);
    if (['live', 'soon', 'replay', 'recorded', 'premiere'].includes(st.key)) {
      if (!url && s.kind === 'recorded') {
        return `<div class="ph"><b>الفيديو في طريقه</b><span>${s.upload_state ? 'أرسله المعلم للمنصة، وتنشره الإدارة على قناة مدرار العلم قريباً.' : 'سيُضاف الفيديو قريباً.'} ستتحدّث هذه الصفحة تلقائياً.</span></div>`;
      }
      if (!url) {
        // حصة Meet: زر الدخول يُملأ بعد جلب الرابط (joinHtml)
        return `<div class="ph ph-join" data-join><b>${st.key === 'live' ? 'الحصة بدأت الآن' : 'الحصة تبدأ ' + esc(rel(new Date(s.starts_at) - Date.now()))}</b><span>جارٍ تجهيز رابط الدخول…</span></div>`;
      }
      if (isDemoVideo(url)) {
        return `<div class="ph"><b>هنا يظهر فيديو يوتيوب</b><span>في المنصة الحقيقية يعمل الفيديو داخل الصفحة مباشرة.</span></div>`;
      }
      const id = ytId(url);
      if (id) {
        return `<button type="button" class="facade" data-play aria-label="اضغط للتشغيل: ${esc(s.title)}">
          <img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy" data-ph="">
          <span class="play-disc" aria-hidden="true"></span><span class="play-hint">اضغط للتشغيل</span></button>`;
      }
      return `<div class="ph"><b>${st.key === 'replay' || st.key === 'recorded' ? 'التسجيل على يوتيوب' : 'البث على يوتيوب'}</b><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">افتح في يوتيوب</a></div>`;
    }
    if (st.key === 'upcoming') {
      const d = new Date(s.starts_at);
      return `<div class="ph ph-up"><span>${s.kind === 'recorded' ? 'يُعرض الدرس' : 'تبدأ الحصة'}</span><span class="big" data-count>${esc(rel(d - Date.now()))}</span>
        <span class="up-when">${esc(dayLabel(d))} · الساعة ${esc(time(d))}</span>
        <div class="row up-btns">${remindHtml(s)}</div>
        <span class="small">${s.kind === 'recorded' ? 'يُفتح الدرس هنا في موعده تلقائياً.' : 'يظهر هنا زر «ادخل الحصة» قبل موعدها بربع ساعة.'}</span></div>`;
    }
    if (st.key === 'cancelled') return '<div class="ph"><b>ألغى المعلم هذه الحصة</b><span>اختر معلماً آخر من جدول الصف.</span></div>';
    if (s.upload_state) return '<div class="ph"><b>انتهت الحصة، وتسجيلها في طريقه</b><span>أرسله المعلم للمنصة، وتنشره الإدارة على قناة مدرار العلم قريباً. ستتحدّث هذه الصفحة تلقائياً.</span></div>';
    return '<div class="ph"><b>انتهت الحصة</b><span>لم يُضف تسجيل لها بعد.</span></div>';
  }

  // زر الدخول لحصة Meet (j من API.joinLink)
  function joinHtml(s, j, mine) {
    const live = stateOf(s).key === 'live';
    const head = `<b>${live ? 'الحصة بدأت الآن' : 'الحصة تبدأ ' + esc(rel(new Date(s.starts_at) - Date.now()))}</b>`;
    if (j && j.url) {
      const app2 = meetApp(j.url);
      if (mine) return `${head}<button type="button" class="btn btn-live btn-lg" data-start-class>ابدأ الحصة</button>
        <span class="small">تُسجَّل الحصة، ثم تفتحها بضغطة.</span>`;
      return `${head}<a class="btn btn-live btn-lg" href="${esc(j.url)}" target="_blank" rel="noopener">ادخل الحصة</a>
        <span class="small">اكتب اسمك الأول، وأبقِ الكاميرا مغلقة.</span>`;
    }
    if (j && j.has) return `${head}<span>يظهر زر الدخول هنا قبل الحصة بربع ساعة.</span>`;
    return `${head}<span>لم يضع المعلم رابط الحصة بعد. ستتحدّث هذه الصفحة تلقائياً عند إضافته.</span>`;
  }

  // ------------------------------------------------------------------
  //  تشغيل الفيديو: نستقبل الوقت والحالة من مشغّل يوتيوب عبر postMessage
  //  (دون تحميل أي سكربت خارجي)، لنحفظ موضع الطالب ونحسب المشاهدة.
  // ------------------------------------------------------------------
  const YT_ORIGIN = 'https://www.youtube-nocookie.com';
  const player = { frame: null, s: null, t: 0, d: 0, st: -1, alive: false, playMs: 0, lastMsg: 0, visMs: 0, saveAt: 0, timer: null, counted: false, mine: false, onSave: null };
  function mountPlayer(s, start) {
    const id = ytId(watchUrl(s));
    const box = document.getElementById('player');
    if (!id || !box) return;
    stopPlayer();
    const at = start > 5 ? Math.floor(start - 3) : 0;
    const src = `${YT_ORIGIN}/embed/${id}?rel=0&playsinline=1&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${at ? '&start=' + at : ''}`;
    box.innerHTML = `<iframe src="${esc(src)}" title="${esc(s.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    box.dataset.h = 'mounted';
    const f = box.querySelector('iframe');
    const prev = watch.get(s.id) || {};
    Object.assign(player, { frame: f, s, t: at, d: prev.d || 0, st: -1, alive: false, playMs: 0, lastMsg: 0, visMs: 0, saveAt: 0, counted: counted.has(s.id) });
    let tries = 0;
    const hello = () => {
      if (player.frame !== f || player.alive || tries++ > 10) return;
      try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN); } catch (e) { /* ignore */ }
      setTimeout(hello, 1000);
    };
    f.addEventListener('load', hello);
    player.timer = setInterval(() => {
      if (!player.frame || !player.frame.isConnected) { stopPlayer(); return; }
      // إن لم تصل رسائل من المشغّل: نحسب المشاهدة بعد 90 ثانية والصفحة ظاهرة
      if (!player.alive && document.visibilityState === 'visible') player.visMs += 1000;
      maybeCount();
    }, 1000);
    watch.put(s, { p: prev.p || 0, d: prev.d || 0, done: !!prev.done });
  }
  function saveProgress(ended) {
    const s = player.s;
    if (!s || !(player.t > 0 || ended)) return;
    player.saveAt = Date.now();
    const prev = watch.get(s.id) || {};
    const done = !!(prev.done || ended || (player.d > 0 && player.t / player.d >= 0.9));
    watch.put(s, { p: Math.floor(player.t), d: Math.floor(player.d || prev.d || 0), done });
    if (player.onSave) player.onSave(done);
  }
  function maybeCount() {
    if (player.counted || !player.s) return;
    if (player.playMs >= 60000 || (!player.alive && player.visMs >= 90000)) {
      player.counted = true;
      counted.add(player.s.id);
      if (!player.mine && app.settings.views_on !== false && API.countView) API.countView(player.s.id).catch(() => { /* العدّ اختياري */ });
    }
  }
  function stopPlayer() {
    if (player.s) saveProgress();
    clearInterval(player.timer);
    Object.assign(player, { frame: null, s: null, timer: null, onSave: null });
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== YT_ORIGIN || !player.frame || e.source !== player.frame.contentWindow) return;
    let d;
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (!d || typeof d !== 'object') return;
    player.alive = true;
    const now = Date.now();
    if (player.st === 1 && player.lastMsg) player.playMs += Math.min(2000, now - player.lastMsg);
    player.lastMsg = now;
    const info = d.info;
    if (d.event === 'onStateChange' && typeof info === 'number') player.st = info;
    if (info && typeof info === 'object') {
      if (typeof info.playerState === 'number') player.st = info.playerState;
      if (typeof info.currentTime === 'number' && isFinite(info.currentTime)) player.t = info.currentTime;
      if (typeof info.duration === 'number' && isFinite(info.duration) && info.duration > 0) player.d = info.duration;
    }
    if (player.st === 0) saveProgress(true);
    else if (now - player.saveAt > 10000) saveProgress();
    maybeCount();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && player.s) saveProgress(); });
  window.addEventListener('pagehide', () => { if (player.s) saveProgress(); });

  // دروس المادة مخزّنة مؤقتاً لخمس دقائق (للتنقل بين الدرس السابق والتالي دون طلبات متكررة)
  const subjCache = new Map();
  async function subjectLessons(grade, subject) {
    const key = grade + '|' + subject;
    const hit = subjCache.get(key);
    // المعلم والمشرف يرون التغييرات فوراً (ينشرون ويعتمدون)، والطالب يستفيد من الذاكرة المؤقتة
    if (hit && !app.user && Date.now() - hit.at < 5 * MIN) return hit.rows;
    const rows = await API.listSubjectLessons(grade, subject);
    subjCache.set(key, { at: Date.now(), rows });
    return rows;
  }

  async function pageSession(tok, id) {
    setNav('home');
    view.innerHTML = '<p class="loading">جارٍ تحميل الدرس…</p>';
    let s;
    try { s = await API.getSession(id); }
    catch (e) {
      if (tok !== app.token) return;
      view.innerHTML = errorBox(e, true);
      $('[data-retry]').addEventListener('click', route);
      return;
    }
    if (tok !== app.token) return;
    if (!s) { watch.drop(id); return pageNotFound('هذا الدرس غير موجود أو حُذف.'); }
    remember([s]);
    setTitle(s.title);
    const t = s.teacher || {};
    const mine = app.user && s.teacher_id === app.user.id;
    const admin = app.profile && app.profile.is_admin;
    const url = watchUrl(s);
    const notPublic = s.hidden || (mine && app.profile && app.profile.status !== 'approved');
    const sk = isSkills(s.grade);
    const review = s.review || 'ok';
    // موعد العرض (بالساعة) لدرس قادم أو يُعرض الآن، وإلا تاريخ النشر
    const showAt = s.kind === 'recorded' && (['upcoming', 'premiere'].includes(stateOf(s).key) || (isPremiere(s) && !videoOf(s)));
    view.innerHTML = `
      <header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">${sk ? 'الرئيسية' : 'الصفوف'}</a><span>›</span><a href="${esc(gradeHref(s.grade))}">${esc(gradeName(s.grade))}</a><span>›</span><a href="${esc(subjHref(s.grade, s.subject))}">${esc(subjOf(s))}</a>${sk ? (s.unit_title ? `<span>›</span><span>${esc(s.unit_title)}</span>` : '') : s.unit ? `<span>›</span><span>${esc('الوحدة ' + fNum(s.unit))}</span>` : ''}</nav>
        <div class="title-row"><h1>${esc(s.title)}</h1><span data-sid="${esc(s.id)}"><span data-badge>${badgeHtml(s)}</span></span></div>
        ${stateOf(s).key === 'premiere' ? '<div class="note live-note"><b>يُعرض الآن في موعده</b><span>حدّد المعلم هذا الوقت ليشاهد الطلاب الدرس معاً. شاهده الآن، ويبقى متاحاً بعد ذلك.</span></div>' : ''}
        ${review === 'pending' ? `<div class="note warn"><b>هذا الدرس بانتظار مراجعة الإدارة.</b><span>لا يراه الطلاب حتى تعتمده الإدارة.${mine ? ` بعد اعتماد ${fNum(C.TRUST_AFTER || 3)} دروس لك تصبح متطوعاً موثوقاً وتُنشر دروسك مباشرة.` : ''}</span></div>` : ''}
        ${review === 'rejected' ? `<div class="note bad"><b>لم تعتمد الإدارة هذا الدرس.</b>${s.review_note ? `<span>السبب: ${esc(s.review_note)}</span>` : ''}${mine ? `<span>${s.kind === 'recorded' && !videoOf(s) && !s.upload_state ? 'أرسل الفيديو من جديد من «تعديل الدرس»، فيعود إلى المراجعة.' : 'عدّل الدرس فيعود إلى المراجعة.'}</span>` : ''}</div>` : ''}
        ${notPublic ? `<div class="note warn">${s.hidden ? `${s.kind === 'recorded' ? 'هذا الدرس مخفي' : 'هذه الحصة مخفية'} عن الطلاب بقرار من إدارة المنصة.` : `${s.kind === 'recorded' ? 'هذا الدرس لا يظهر' : 'هذه الحصة لا تظهر'} للطلاب حتى تعتمد إدارة المنصة حسابك.`}</div>` : ''}
      </header>
      <div class="sess">
        <div class="stack">
          <div class="player" id="player">${playerHtml(s)}</div>
          <div id="mylink"></div>
          <div class="row" id="watchrow"></div>
          <div id="thanks"></div>
          <div id="quiz"></div>
          <div id="files"></div>
          <div class="row">
            ${url && !isDemoVideo(url) ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${s.kind === 'recorded' ? 'افتح في يوتيوب' : 'افتح في يوتيوب (للأسئلة في الدردشة)'}</a>` : ''}
            ${stateOf(s).key === 'soon' ? `<a class="btn" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">أضف إلى تقويم Google</a>` : ''}
            <a class="btn" href="${esc(whatsappUrl(s))}" target="_blank" rel="noopener">${stateOf(s).key === 'upcoming' ? 'أرسل الموعد لزملائك' : 'مشاركة عبر واتساب'}</a>
            <button type="button" class="btn btn-ghost" id="copy">${s.kind === 'recorded' ? 'نسخ رابط الدرس' : 'نسخ رابط الحصة'}</button>
          </div>
          ${s.description ? `<div class="box"><h2>${s.kind === 'recorded' ? 'عن الدرس' : 'عن الحصة'}</h2><p class="desc">${esc(s.description)}</p></div>` : ''}
          ${sk ? safetyNote() : ''}
          <div id="seq"></div>
          <div id="alts"></div>
        </div>
        <aside class="side">
          <div class="box">
            <dl class="kv">
              ${sk ? `<dt>المهارة</dt><dd><a href="${esc(subjHref(s.grade, s.subject))}">${esc(subjOf(s))}</a></dd>
                ${s.unit_title ? `<dt>الدورة</dt><dd>${esc(s.unit_title)}</dd>` : ''}${s.unit ? `<dt>الجزء</dt><dd>${fNum(s.unit)}</dd>` : ''}
                ${s.level ? `<dt>المستوى</dt><dd>${esc(LEVELS[s.level] || '')}</dd>` : ''}${s.ages ? `<dt>يناسب</dt><dd>${esc(AGES[s.ages] || '')}</dd>` : ''}`
              : `<dt>الصف</dt><dd><a href="#/g/${esc(s.grade)}">${esc(gradeName(s.grade))}</a></dd>
              <dt>المادة</dt><dd>${esc(subjectName(s.subject))}</dd>`}
              <dt>${s.kind === 'recorded' ? (showAt ? 'موعد العرض' : 'نُشر') : 'الموعد'}</dt><dd>${esc(fFull.format(new Date(s.starts_at)))}${showAt ? ' · ' + esc(time(s.starts_at)) : ''}</dd>
              ${s.kind === 'recorded' ? '' : `<dt>الوقت</dt><dd>${esc(time(s.starts_at))} – ${esc(time(s.ends_at))}</dd>`}
              <dt>المدة</dt><dd>${esc(minsTxt(minutes(s)))}</dd>
              <dt>النوع</dt><dd>${s.kind === 'recorded' ? (s.lesson_type && s.lesson_type !== 'lesson' ? esc(typeName(s.lesson_type, s.grade)) : 'درس مسجّل') : 'حصة مباشرة'}</dd>
              ${s.term ? `<dt>الفصل</dt><dd>${esc(TERMS[s.term])}</dd>` : ''}
              ${s.unit && !sk ? `<dt>الوحدة</dt><dd>${esc(unitLabel(s).replace(/^الوحدة /, ''))}</dd>` : ''}
              ${s.exam_year ? `<dt>الامتحان</dt><dd>${esc(examLine(s))}</dd>` : ''}
            </dl>
          </div>
          <a class="box tcard" id="tcard" href="#/t/${esc(t.id || s.teacher_id)}">${avatar(t.display_name, t.avatar_url, 'av-md', gOf(t) || app.genders[s.teacher_id])}<div><b>${esc(t.display_name || 'المعلم')}</b><span>كل دروس المعلم</span></div></a>
          ${mine || admin ? `<div class="box"><h2>${mine ? (s.kind === 'recorded' ? 'درسك' : 'حصتك') : 'إدارة'}</h2><div class="row">
            ${mine ? `<a class="btn btn-sm" href="#/dashboard/edit/${esc(s.id)}">${s.kind === 'recorded' ? 'تعديل الدرس' : 'تعديل الحصة'}</a>` : ''}
            ${admin ? `<button type="button" class="btn btn-sm${s.hidden ? '' : ' btn-danger'}" id="hide">${s.hidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}</button>` : ''}
            ${admin && review !== 'ok' ? '<button type="button" class="btn btn-sm btn-primary" id="rv-ok">اعتماد الدرس</button>' : ''}
            ${admin && review === 'pending' ? '<button type="button" class="btn btn-sm btn-danger" id="rv-no">رفض</button>' : ''}
            ${admin && review === 'ok' && s.kind === 'recorded' && API.setFeatured ? `<button type="button" class="btn btn-sm" id="feat">${app.settings.featured_session === s.id ? 'إلغاء «درس الأسبوع»' : 'اجعله «درس الأسبوع» ⭐'}</button>` : ''}
          </div></div>` : ''}
          <details class="report box">
            <summary>الإبلاغ عن مشكلة في ${s.kind === 'recorded' ? 'هذا الدرس' : 'هذه الحصة'}</summary>
            <form id="report" class="stack">
              <div class="field"><label for="r-kind">نوع المشكلة</label>
                <select class="input" id="r-kind">
                  <option>محتوى غير لائق</option><option>إعلان عن دروس أو مجموعات مدفوعة</option>
                  <option>الفيديو لا يعمل أو لا يخص الدرس</option><option>أخرى</option>
                </select></div>
              <div class="field"><label for="r-text">التفاصيل (اختياري)</label><textarea class="input" id="r-text" maxlength="400" rows="3"></textarea></div>
              <button class="btn btn-sm" type="submit">إرسال البلاغ</button>
            </form>
          </details>
        </aside>
      </div>`;
    $('#player').dataset.h = playerHtml(s);
    // شارة «موثّق» وجهة الدعوة على بطاقة المعلم
    if (API.getTeacher) API.getTeacher(s.teacher_id).then((tt) => {
      const card = $('#tcard');
      if (tok !== app.token || !card || !tt) return;
      $('div', card).innerHTML = `<b>${esc(tt.display_name || 'المعلم')}${tt.verified ? ' <span class="verified" title="موثّق من إدارة المنصة">✓ موثّق</span>' : ''}</b><span>${esc(tt.vouch || 'كل دروس المعلم')}</span>`;
    }).catch(() => { /* اختياري */ });
    // «اختبر نفسك»: أسئلة قصيرة تُصحَّح في الجهاز فوراً، ولا تُرسل إجابات الطالب إلى أي خادم
    if (Array.isArray(s.quiz) && s.quiz.length) {
      const qs = s.quiz;
      $('#quiz').innerHTML = `<section class="box quiz"><h2>اختبر نفسك</h2><p class="muted small">${plural(qs.length, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً')}. إجاباتك لا تُرسل إلى أي مكان.</p>
        ${qs.map((q, i) => `<fieldset class="qz" data-q="${i}"><legend>${fNum(i + 1)}. ${esc(q.q)}</legend>
          ${(q.o || []).map((o, j) => `<button type="button" class="qz-o" data-j="${j}"><span class="qz-dot" aria-hidden="true"></span><span dir="auto">${esc(o)}</span></button>`).join('')}
          <p class="qz-r" role="status" tabindex="-1"></p></fieldset>`).join('')}
        <p class="qz-score" id="qz-score" role="status"></p></section>`;
      const answered = {};
      // أزرار لا أزرار اختيار: التنقل بالأسهم لا يعتمد إجابة، والاختيار يكون بضغطة صريحة
      $$('#quiz .qz-o').forEach((b) => b.addEventListener('click', () => {
        const fs = b.closest('.qz');
        const i = Number(fs.getAttribute('data-q'));
        if (i in answered) return;
        const q = qs[i];
        const pick = Number(b.getAttribute('data-j'));
        const ok = pick === q.a;
        answered[i] = ok;
        $$('.qz-o', fs).forEach((l, j) => { l.classList.toggle('right', j === q.a); l.classList.toggle('wrong', !ok && j === pick); l.setAttribute('aria-disabled', 'true'); l.setAttribute('aria-pressed', String(j === pick)); });
        const res = $('.qz-r', fs);
        res.innerHTML = ok ? 'إجابة صحيحة ✓' : `الإجابة الصحيحة: <bdi>${esc(q.o[q.a])}</bdi>`;
        res.focus();
        const n = Object.keys(answered).length;
        if (n === qs.length) {
          const right = Object.values(answered).filter(Boolean).length;
          $('#qz-score').textContent = right === qs.length ? `ممتاز! أجبت عن كل الأسئلة إجابة صحيحة (${fNum(right)} من ${fNum(qs.length)}).` : `أجبت إجابة صحيحة عن ${fNum(right)} من ${fNum(qs.length)}. شاهد الجزء الذي أخطأت فيه مرة أخرى.`;
        }
      }));
    }
    // ملفات مرافقة من خدمات التخزين المعروفة فقط
    const files = (Array.isArray(s.attachments) ? s.attachments : []).filter((f) => f && /^https:\/\/(drive\.google\.com|docs\.google\.com|1drv\.ms|onedrive\.live\.com|(www\.)?dropbox\.com)\//i.test(f.u || ''));
    if (files.length) {
      $('#files').innerHTML = `<section class="box"><h2>ملفات مرافقة</h2><ul class="files">${files.map((f) => {
        let host = ''; try { host = new URL(f.u).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
        return `<li><a href="${esc(f.u)}" target="_blank" rel="noopener nofollow">${esc(f.t)}</a> <span class="muted small">${esc(host)}</span></li>`;
      }).join('')}</ul></section>`;
    }
    const rvOk = $('#rv-ok');
    if (rvOk) rvOk.addEventListener('click', async () => {
      rvOk.disabled = true;
      try { await API.adminReview(s.id, true); toast('اعتُمد الدرس وأصبح ظاهراً للطلاب'); refreshBadge(); route(); }
      catch (e) { toast(errMsg(e), true); rvOk.disabled = false; }
    });
    const rvNo = $('#rv-no');
    if (rvNo) rvNo.addEventListener('click', () => {
      rvNo.outerHTML = `<form id="rv-form" class="row" style="width:100%"><input class="input" id="rv-note" maxlength="200" placeholder="سبب الرفض يراه المعلم، مثل: الصوت غير واضح" style="flex:1 1 200px">
        <button class="btn btn-sm btn-danger" type="submit">تأكيد الرفض</button></form>`;
      $('#rv-note').focus();
      $('#rv-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try { await API.adminReview(s.id, false, $('#rv-note').value.trim()); toast('رُفض الدرس، وسيرى المعلم السبب'); refreshBadge(); route(); }
        catch (e) { toast(errMsg(e), true); }
      });
    });
    const feat = $('#feat');
    if (feat) feat.addEventListener('click', async () => {
      feat.disabled = true;
      const on = app.settings.featured_session === s.id;
      try { await API.setFeatured(on ? null : s.id); app.settings = await API.settings(); toast(on ? 'أُلغي «درس الأسبوع»' : 'أصبح «درس الأسبوع» في الصفحة الرئيسية'); route(); }
      catch (e) { toast(errMsg(e), true); feat.disabled = false; }
    });
    $('#copy').addEventListener('click', () => copyText(pageUrl('#/s/' + s.id)));

    // التشغيل، والمتابعة من حيث توقف الطالب، وعلامة «شاهدتُه»
    player.mine = !!(mine || admin);
    function drawWatchRow() {
      const box = $('#watchrow');
      if (!box) return;
      const k = stateOf(s).key;
      if (!['recorded', 'premiere', 'replay', 'live'].includes(k) || !ytId(watchUrl(s))) { box.innerHTML = ''; return; }
      const w = watch.get(s.id) || {};
      const mounted = player.s && player.s.id === s.id;
      box.innerHTML = `${!mounted && w.p >= 30 && !w.done ? `<button type="button" class="btn btn-primary" data-resume>تابع من الدقيقة ${esc(mmss(w.p))}</button><button type="button" class="btn" data-restart>ابدأ من البداية</button>` : ''}
        <button type="button" class="btn btn-ghost" data-seen aria-pressed="${w.done ? 'true' : 'false'}">${w.done ? 'شاهدتُه ✓' : 'تحديد كدرس شاهدتُه'}</button>`;
      const go = (start) => { mountPlayer(s, start); player.onSave = () => drawWatchRow(); drawWatchRow(); };
      const r1 = $('[data-resume]', box); if (r1) r1.addEventListener('click', () => go(w.p));
      const r2 = $('[data-restart]', box); if (r2) r2.addEventListener('click', () => go(0));
      $('[data-seen]', box).addEventListener('click', () => {
        const cur = watch.get(s.id) || {};
        watch.put(s, { done: !cur.done, p: cur.p || 0, d: cur.d || 0 });
        drawWatchRow();
        const again = $('#watchrow [data-seen]'); if (again) again.focus();
      });
    }
    function bindFacade() {
      const fac = $('#player [data-play]');
      if (!fac) return;
      fac.addEventListener('click', () => {
        const w = watch.get(s.id) || {};
        mountPlayer(s, w.p >= 30 && !w.done ? w.p : 0);
        player.onSave = () => drawWatchRow();
        drawWatchRow();
        const fr = $('#player iframe'); if (fr) fr.focus();
      });
    }
    bindFacade();
    drawWatchRow();
    // رابط الحصة لصاحبها في أي وقت، ليجهّز نفسه ويختبره
    if (mine && s.kind === 'live' && API.myLinks) {
      API.myLinks([s.id]).then((m) => {
        const box = $('#mylink'); const u = m && m[s.id];
        if (tok !== app.token || !box || !u) return;
        box.innerHTML = `<div class="note mylink"><b>رابط حصتك</b><a href="${esc(u)}" target="_blank" rel="noopener" dir="ltr">${esc(u)}</a>
          <div class="row"><button type="button" class="btn btn-sm" id="ml-copy">نسخ الرابط</button><span class="small muted">يراه الطلاب قبل الحصة بربع ساعة.</span></div></div>`;
        $('#ml-copy').addEventListener('click', () => copyText(u));
      }).catch(() => { /* اختياري */ });
    }
    // حصة Meet: زر الدخول (يظهر الرابط قبل الحصة بربع ساعة)
    let joinAt = 0; let joinUrl = null;
    async function fillJoin() {
      const box = $('#player [data-join]');
      if (!box || !API.joinLink) return;
      joinAt = Date.now();
      try {
        const j = await API.joinLink(s.id);
        if (tok !== app.token || !box.isConnected) return;
        joinUrl = j && j.url;
        box.innerHTML = joinHtml(s, j, !!mine);
        const sb = $('[data-start-class]', box);
        if (sb) sb.addEventListener('click', () => startClass(s, j.url, sb));
      } catch (e) { const sp = box.isConnected && $('span', box); if (sp) sp.textContent = 'تعذّر جلب رابط الدخول. حدّث الصفحة.'; }
    }
    fillJoin();

    // «هل أفادك الدرس؟» شكر مجهول يصل إلى المعلم كرقم فقط
    function drawThanks() {
      const tb = $('#thanks');
      const canThank = !mine && s.kind === 'recorded' && ['recorded', 'premiere'].includes(stateOf(s).key) && app.settings.views_on !== false && API.thankLesson;
      if (!tb || !canThank || tb.firstChild) return;
      const thanked = store.json('thanked', {});
      const done = thanked[s.id] || '';
      $('#thanks').innerHTML = `<div class="thanks"><b>هل أفادك الدرس؟</b>
        <button type="button" class="btn btn-sm" data-thank="thanks" aria-pressed="${done.includes('t')}">${done.includes('t') ? 'جزاك الله خيراً ✓' : 'جزاك الله خيراً'}</button>
        <button type="button" class="btn btn-sm" data-thank="understood" aria-pressed="${done.includes('u')}">${done.includes('u') ? 'فهمتُ الدرس ✓' : 'فهمتُ الدرس'}</button>
        <span class="muted small">يصل شكرك إلى المعلم دون اسمك.</span></div>`;
      $$('[data-thank]', $('#thanks')).forEach((b) => b.addEventListener('click', () => {
        if (b.getAttribute('aria-pressed') === 'true') return;
        const kind = b.getAttribute('data-thank');
        const all = store.json('thanked', {});
        all[s.id] = (all[s.id] || '') + (kind === 'thanks' ? 't' : 'u');
        const keys = Object.keys(all); if (keys.length > 500) delete all[keys[0]];
        store.set('thanked', JSON.stringify(all));
        b.setAttribute('aria-pressed', 'true'); b.textContent = (kind === 'thanks' ? 'جزاك الله خيراً' : 'فهمتُ الدرس') + ' ✓';
        toast('شكراً لك، يصل شكرك إلى المعلم');
        API.thankLesson(s.id, kind).catch(() => { /* الشكر اختياري */ });
      }));
    }
    drawThanks();

    // الدرس السابق والتالي في ترتيب الكتاب
    if (s.kind === 'recorded') {
      subjectLessons(s.grade, s.subject).then((all) => {
        if (tok !== app.token) return;
        remember(all);
        // في المهارات: الجزء السابق والتالي من نفس الدورة ونفس المتطوع
        const rows = sk ? all.filter((x) => (x.unit_title || '') === (s.unit_title || '') && x.teacher_id === s.teacher_id)
          .sort((a, b) => (a.unit || 99) - (b.unit || 99) || a.starts_at.localeCompare(b.starts_at)) : all;
        const i = rows.findIndex((x) => x.id === s.id);
        if (i < 0 || rows.length < 2) return;
        const prev = rows[i - 1];
        const next = rows[i + 1];
        $('#seq').innerHTML = `<nav class="seq" aria-label="دروس المادة">
          ${prev ? `<a class="btn" href="#/s/${esc(prev.id)}"><span class="muted small">${sk ? 'الجزء السابق' : 'الدرس السابق'}</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
          ${next ? `<a class="btn" href="#/s/${esc(next.id)}"><span class="muted small">${sk ? 'الجزء التالي' : 'الدرس التالي'}</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
          </nav><p class="small"><a href="${esc(subjHref(s.grade, s.subject))}">${sk ? `كل دروس ${esc(subjOf(s))}` : `كل دروس ${esc(subjectName(s.subject))} — ${esc(gradeName(s.grade))}`}</a></p>`;
      }).catch(() => { /* التنقل اختياري */ });
    }
    $('#report').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('#report button');
      btn.disabled = true;
      try {
        await API.report(s.id, ($('#r-kind').value + ' — ' + $('#r-text').value).trim());
        $('#report').innerHTML = '<p class="note">وصل بلاغك إلى إدارة المنصة. شكراً لك.</p>';
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
    const hide = $('#hide');
    if (hide) hide.addEventListener('click', async () => {
      hide.disabled = true;
      try { await API.adminHideSession(s.id, !s.hidden); toast(s.hidden ? 'أصبحت الحصة ظاهرة' : 'أُخفيت الحصة عن الطلاب'); route(); }
      catch (e) { toast(errMsg(e), true); hide.disabled = false; }
    });

    // متابعة الحالة: تحديث المشغّل عند تغيّر الحالة، وإعادة الجلب إن كان الرابط ناقصاً
    let lastKey = stateOf(s).key;
    let lastFetch = Date.now();
    pageTick = async () => {
      const k = stateOf(s).key;
      // العدّ التنازلي، وانتظار فيديو لم يُضف بعد (حصة بلا رابط، أو درس أُرسل للمنصة)
      if (k === 'upcoming') { const c = $('#player [data-count]'); if (c) c.textContent = rel(new Date(s.starts_at) - Date.now()); }
      const waiting = ((k === 'soon' || k === 'live') && !s.video_url) || (s.kind === 'recorded' && k !== 'upcoming' && !videoOf(s)) || (k === 'ended' && !!s.upload_state);
      if (waiting && Date.now() - lastFetch > 45000) {
        lastFetch = Date.now();
        try {
          const fresh = await API.getSession(s.id);
          if (tok !== app.token || !fresh) return;
          if (fresh.video_url !== s.video_url || fresh.recording_url !== s.recording_url || fresh.status !== s.status || fresh.upload_state !== s.upload_state) {
            s = fresh; remember([s]); lastKey = '';
          }
        } catch (e) { /* محاولة لاحقة */ }
      }
      if (k !== lastKey) {
        lastKey = k;
        const p = $('#player');
        if (p && p.dataset.h !== 'mounted') { const h = playerHtml(s); if (p.dataset.h !== h) { p.innerHTML = h; p.dataset.h = h; bindFacade(); drawWatchRow(); fillJoin(); } }
        drawThanks();
      } else if (!joinUrl && $('#player [data-join]') && Date.now() - joinAt > 45000) {
        fillJoin();
      }
    };

    // معلمون آخرون لنفس الصف في نفس الوقت
    if (s.kind === 'live') {
      try {
        const alts = (await API.listOverlapping(s.grade, s.starts_at, s.ends_at, s.id)).filter((x) => x.status === 'scheduled');
        if (tok !== app.token || !alts.length) return;
        remember(alts);
        $('#alts').innerHTML = `<div class="box"><h2>خيارات أخرى لصفك في نفس الوقت</h2><div class="alts">${alts.map((a) => `
          <a class="alt" href="#/s/${esc(a.id)}">${avatar(a.teacher && a.teacher.display_name, a.teacher && a.teacher.avatar_url, 'av-md', gOf(a.teacher))}
            <div><b>${esc(subjectName(a.subject))}: ${esc(a.title)}</b><span>${esc((a.teacher && a.teacher.display_name) || '')} · ${esc(time(a.starts_at))}</span></div></a>`).join('')}</div></div>`;
      } catch (e) { /* اختياري */ }
    }
  }

  // ------------------------------------------------------------------
  //  صفحة المعلم العامة ودليل المعلمين
  // ------------------------------------------------------------------
  async function pageTeacher(tok, id) {
    setNav('teachers');
    view.innerHTML = '<p class="loading">جارٍ التحميل…</p>';
    let t; let list;
    try { [t, list] = await Promise.all([API.getTeacher(id), API.listTeacherSessions(id)]); }
    catch (e) { if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]').addEventListener('click', route); } return; }
    if (tok !== app.token) return;
    if (!t) return pageNotFound('صفحة المعلم غير متاحة.');
    remember(list);
    setTitle(t.display_name);
    const now = Date.now();
    const upcoming = upNow(list.slice().reverse());
    const recs = list.filter((s) => videoOf(s) && (s.kind === 'recorded' ? +new Date(s.starts_at) <= now : +new Date(s.ends_at) <= now));
    // ملف المتطوع: ما يشرحه، وعدد دروسه، ومن دعاه أو رشّحه
    const areas = Array.from(new Set(recs.map((s) => (isSkills(s.grade) ? subjOf(s) : `${subjectName(s.subject)} (${GRADES[s.grade] ? GRADES[s.grade].short : gradeName(s.grade)})`)))).slice(0, 10);
    const port = t.trusted && /^https:\/\//i.test(t.portfolio_url || '') ? t.portfolio_url : '';
    view.innerHTML = `
      <header class="prof">${avatar(t.display_name, t.avatar_url, 'av-lg', gOf(t))}
        <div class="info"><h1>${esc(t.display_name)}${t.verified ? ' <span class="verified" title="تحقّقت منه إدارة المنصة">✓ موثّق</span>' : ''}</h1>${t.specialty ? `<span class="muted">${esc(t.specialty)}</span>` : ''}
          ${t.vouch ? `<span class="vouch">${esc(t.vouch)}</span>` : ''}
          ${t.bio ? `<p class="desc">${esc(t.bio)}</p>` : ''}
          <div class="row">
            ${t.youtube_channel && isYouTube(t.youtube_channel) ? `<a class="btn btn-sm" href="${esc(t.youtube_channel)}" target="_blank" rel="noopener">قناة المعلم على يوتيوب</a>` : ''}
            ${port ? `<a class="btn btn-sm btn-ghost" href="${esc(port)}" target="_blank" rel="noopener nofollow">أعمال المتطوع</a>` : ''}
          </div>
        </div>
      </header>
      <div class="tiles prof-tiles"><div class="tile"><b class="num">${fNum(recs.length)}</b><span>درس منشور</span></div>
        ${areas.length ? `<div class="tile tile-wide"><span>يشرح</span><b class="areas">${esc(areas.join('، '))}</b></div>` : ''}</div>
      ${upcoming.length ? `<section class="section"><div class="section-head"><h2>دروس قادمة</h2><span class="muted">${fNum(upcoming.length)}</span></div>
        ${upCards(upcoming, true)}</section>` : ''}
      <section class="section"><div class="section-head"><h2>الدروس</h2><span class="muted">${fNum(recs.length)}</span></div>
        ${recs.length ? `<div class="vids">${recs.map((s) => vidHtml(s, true)).join('')}</div>` : '<div class="empty">لم ينشر دروساً بعد.</div>'}
      </section>`;
  }

  async function pageTeachers(tok) {
    setNav('teachers'); setTitle('المعلمون');
    view.innerHTML = '<header class="page-head"><h1>المعلمون المتطوعون</h1><p class="muted">شكراً لكل معلم يمنح وقته وعلمه مجاناً.</p></header><div id="tlist"><p class="loading">جارٍ التحميل…</p></div>';
    try {
      const list = await API.listTeachers();
      if (tok !== app.token) return;
      $('#tlist').innerHTML = list.length
        ? `<div class="tgrid">${list.map((t) => `<a class="tcard" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url, 'av-md', gOf(t))}<div><b>${esc(t.display_name)}${t.verified ? ' <span class="verified" aria-label="موثّق">✓</span>' : ''}</b><span>${esc(t.specialty || 'معلم متطوع')}</span></div></a>`).join('')}</div>`
        : '<div class="empty"><b>لا يوجد معلمون بعد</b><a class="btn btn-primary" href="#/dashboard">كن أول المتطوعين</a></div>';
    } catch (e) { if (tok === app.token) $('#tlist').innerHTML = errorBox(e); }
  }

  // ------------------------------------------------------------------
  //  منطقة المعلم
  // ------------------------------------------------------------------
  const G_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function signInBox(after) {
    setTitle('دخول المعلمين');
    view.innerHTML = `
      <div class="box sign-in stack">
        <h1>دخول المعلمين</h1>
        <p class="muted">سجّل بحساب Google الخاص بك لتسجّل دروسك وتنشرها. الطلاب لا يحتاجون إلى حساب.</p>
        <button type="button" class="btn g-btn" id="gsign">${G_ICON}<span>الدخول بحساب Google</span></button>
        ${API.mode === 'demo' ? '<p class="note warn">في الوضع التجريبي يدخل حساب معلم وهمي مباشرة، ويُعطى صلاحية المشرف حتى تجرّب لوحة الإدارة.</p>' : ''}
        <p class="small muted">بدخولك توافق على <a href="#/about">ميثاق المعلم المتطوع</a>. لا يظهر بريدك الإلكتروني للعامة.</p>
      </div>`;
    $('#gsign').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try { await API.signIn(after || location.hash || '#/dashboard'); if (API.mode === 'demo') route(); }
      catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }
  async function requireTeacher(tok, after) {
    if (!app.user) { signInBox(after); return null; }
    if (app.profile === undefined) {
      try { await loadProfile(); } catch (e) {
        if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]', view).addEventListener('click', route); }
        return null;
      }
    }
    if (tok !== app.token) return null;
    if (!app.profile) { pageProfile(tok, true); return null; }
    return app.profile;
  }
  // لا حصص جديدة ولا تسجيل قبل أن يضيف المعلم رابط قناته على يوتيوب
  function statusPill(st) {
    return st === 'approved' ? '<span class="pill pill-ok">معتمد</span>'
      : st === 'pending' ? '<span class="pill pill-warn">قيد المراجعة</span>'
      : '<span class="pill pill-bad">موقوف</span>';
  }

  async function pageProfile(tok, firstTime) {
    setNav(''); setTitle(firstTime ? 'إكمال التسجيل' : 'ملفي');
    if (!app.user) return signInBox('#/profile');
    if (app.profile === undefined) {
      try { await loadProfile(); } catch (e) {
        if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]', view).addEventListener('click', route); }
        return;
      }
    }
    if (tok !== app.token) return;
    const p = app.profile || {};
    const first = !app.profile;
    const avatarUrl = [p.avatar_url, app.user.avatar].find((u) => /^https:\/\/lh\d+\.googleusercontent\.com\//.test(u || '')) || '';
    view.innerHTML = `
      <header class="page-head"><h1>${first ? 'أهلاً بك معلماً متطوعاً' : 'ملفي'}</h1>
        <p class="muted">${first ? 'خطوة واحدة: أكمل ملفك ليعرفك الطلاب. يظهر اسمك وتخصصك ونبذتك للعامة، ولا يظهر بريدك.' : 'هذه المعلومات تظهر في صفحتك العامة.'}</p></header>
      <form class="form" id="pf" novalidate>
        <fieldset class="field pick-g"><legend>صورتك في المنصة</legend>
          <div class="g-opts">${[['m', 'معلم'], ['f', 'معلمة']].map(([g, l]) => `<label class="g-opt"><input type="radio" name="pf-g" value="${g}"${p.gender === g ? ' checked' : ''}>${avatar('', '', 'av-lg', g)}<span>${l}</span></label>`).join('')}</div>
          <span class="hint email">${esc(app.user.email || '')}</span></fieldset>
        <div class="field"><label for="pf-name">الاسم الذي يظهر للطلاب</label>
          <input class="input" id="pf-name" required minlength="2" maxlength="60" value="${esc(p.display_name || (app.user.name ? 'أ. ' + app.user.name : ''))}" placeholder="مثال: أ. علي حسين">
          <span class="hint">يُفضّل أن يبدأ بـ «أ.» أو «د.»</span></div>
        <div class="field"><label for="pf-spec">التخصص</label>
          <input class="input" id="pf-spec" maxlength="120" value="${esc(p.specialty || '')}" placeholder="مثال: رياضيات لما بعد الأساسي — 10 سنوات خبرة"></div>
        <div class="field"><label for="pf-bio">نبذة قصيرة (اختياري)</label>
          <textarea class="input" id="pf-bio" maxlength="400" rows="3" placeholder="عرّف الطلاب بنفسك وبطريقة شرحك">${esc(p.bio || '')}</textarea></div>
        <div class="field"><label for="pf-yt">رابط قناتك على يوتيوب (اختياري)</label>
          <input class="input" id="pf-yt" type="url" inputmode="url" maxlength="200" value="${esc(p.youtube_channel || '')}" placeholder="@اسم_قناتك أو https://www.youtube.com/@...">
          <span class="hint">لا تحتاج قناة: ترسل دروسك إلينا فننشرها على قناة «مدرار العلم» باسمك. أضف قناتك فقط إن كنت تفضّل النشر عليها.</span>
          <details class="more"><summary>تريد قناتك الخاصة؟ أنشئها مجاناً في دقيقة</summary>
            <ol class="plain">
              <li>افتح <a href="https://www.youtube.com/create_channel" target="_blank" rel="noopener">إنشاء قناة على يوتيوب</a> بحساب Google نفسه.</li>
              <li>اكتب اسم القناة (مثلاً اسمك: أ. علي حسين)، ثم اضغط <b>إنشاء قناة</b>.</li>
              <li>اضغط صورتك أعلى يوتيوب ← <b>قناتك</b>، وانسخ الرابط من شريط العنوان والصقه هنا.</li>
              <li>وثّق القناة برقم هاتفك من <a href="https://www.youtube.com/verify" target="_blank" rel="noopener">youtube.com/verify</a>، لتستطيع رفع دروس أطول من 15 دقيقة.</li>
            </ol></details></div>
        <div class="field"><label for="pf-port">رابط أعمالك أو حسابك المهني (اختياري)</label>
          <input class="input" id="pf-port" type="url" inputmode="url" maxlength="200" value="${esc(p.portfolio_url || '')}" placeholder="https://www.linkedin.com/in/...">
          <span class="hint">مثل LinkedIn أو معرض أعمالك. يساعد الإدارة على اعتمادك، ويظهر في صفحتك بعد أن تصبح متطوعاً موثوقاً.</span></div>
        ${first && joinCode() ? '<p class="note">معك رابط دعوة: يُعتمد حسابك فور إنشاء ملفك.</p>' : ''}
        ${first ? `<label class="check"><input type="checkbox" id="pf-ok"><span>أتعهّد بالالتزام بـ <a href="#/about" target="_blank">ميثاق المعلم المتطوع</a>: الشرح مجاني بالكامل، لا إعلانات لدروس مدفوعة، ولا تواصل خاص مع الطلاب.</span></label>` : ''}
        <div class="form-actions"><button class="btn btn-primary" type="submit">${first ? 'إنشاء ملفي' : 'حفظ التعديلات'}</button>
          ${first ? '' : '<a class="btn" href="#/dashboard">رجوع</a>'}
          <span class="spacer"></span><button type="button" class="btn btn-ghost" id="pf-out">تسجيل الخروج</button></div>
      </form>`;
    $('#pf-out').addEventListener('click', signOut);
    $('#pf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = $('#pf-name').value.trim();
      const rawCh = $('#pf-yt').value.trim();
      const ch = rawCh ? channelUrl(rawCh) : { url: null };
      $('#pf-name').removeAttribute('aria-invalid'); $('#pf-yt').removeAttribute('aria-invalid');
      if (name.length < 2) { $('#pf-name').setAttribute('aria-invalid', 'true'); $('#pf-name').focus(); return toast('اكتب اسمك (حرفان على الأقل).', true); }
      if (ch.error) { $('#pf-yt').setAttribute('aria-invalid', 'true'); $('#pf-yt').focus(); return toast(CHANNEL_ERR[ch.error], true); }
      const yt = ch.url;
      $('#pf-yt').value = yt || '';
      const port = $('#pf-port').value.trim();
      $('#pf-port').removeAttribute('aria-invalid');
      if (port && !/^https:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(port)) { $('#pf-port').setAttribute('aria-invalid', 'true'); $('#pf-port').focus(); return toast('رابط الأعمال يجب أن يبدأ بـ https://', true); }
      const gEl = document.querySelector('input[name="pf-g"]:checked');
      if (!gEl) { document.querySelector('input[name="pf-g"]').focus(); return toast('اختر: معلم أو معلمة.', true); }
      if (first && !$('#pf-ok').checked) return toast('يرجى الموافقة على ميثاق المعلم المتطوع.', true);
      const btn = $('#pf button[type=submit]'); btn.disabled = true;
      try {
        app.profile = await API.saveProfile({ display_name: name, specialty: $('#pf-spec').value.trim(), bio: $('#pf-bio').value.trim(), youtube_channel: yt, avatar_url: avatarUrl, portfolio_url: port || null, gender: gEl.value }, !first);
        if (app.profile && app.profile.gender) app.genders[app.profile.id] = app.profile.gender;
        renderAuth();
        if (first && joinCode()) await redeemStored();
        toast(first ? 'تم إنشاء ملفك. سجّل درسك الأول!' : 'حُفظت التعديلات');
        location.hash = first ? '#/studio' : app.afterProfile || '#/dashboard';
        app.afterProfile = null;
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }

  async function signOut() {
    try { await API.signOut(); } catch (e) { /* ignore */ }
    app.user = null; app.profile = null; renderAuth();
    toast('تم تسجيل الخروج');
    location.hash = '#/';
  }

  // ------------------------------------------------------------------
  //  مكان الدرس في الكتاب: الفصل الدراسي والوحدة ونوع الدرس، وسنة امتحان الدبلوم.
  //  يتذكره المتصفح لكل صف ومادة، فلا يعيد المعلم اختياره في كل درس.
  // ------------------------------------------------------------------
  const examTitle = (year, round, term) => `حل امتحان دبلوم ${year}${round ? ' — الدور ' + (round === 1 ? 'الأول' : 'الثاني') : ''}${term ? ' — ' + TERMS[term] : ''}`;
  function guessType(title) {
    if (/امتحان|اختبار|دبلوم/.test(title)) return 'exam';
    if (/مراجع[ةه]/.test(title)) return 'review';
    if (/حل (أ|ا)?(سئلة|نشطة|تمارين|تدريبات)|أسئلة الكتاب|اسئلة الكتاب/.test(title)) return 'book';
    return 'lesson';
  }
  function placeHtml() {
    const years = [];
    for (let y = new Date().getFullYear(); y >= (C.EXAM_FIRST_YEAR || 2015); y--) years.push(y);
    return `<fieldset class="place" id="pl" hidden>
      <legend id="pl-legend">مكان الدرس في الكتاب</legend>
      <span class="hint" id="pl-hint">ليجده الطالب بترتيب كتابه. يتذكر المتصفح اختيارك لهذه المادة.</span>
      <div id="pl-sk" hidden>
        <div class="field" id="pl-skname-f" hidden><label for="pl-skname">اسم المهارة</label>
          <input class="input" id="pl-skname" maxlength="40" placeholder="مثال: التصوير الفلكي، الإسعافات الأولية"></div>
        <div class="grid2">
          <div class="field"><label for="pl-course">اسم الدورة (اختياري)</label><input class="input" id="pl-course" maxlength="80" placeholder="مثال: أساسيات الذكاء الاصطناعي">
            <span class="hint">أجزاء الدورة الواحدة تظهر للطالب معاً بالترتيب.</span></div>
          <div class="field"><label for="pl-part">رقم الجزء</label><input class="input" id="pl-part" type="number" min="1" max="60" inputmode="numeric"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="pl-level">المستوى</label><select class="input" id="pl-level">${[1, 2, 3].map((l) => `<option value="${l}">${esc(LEVELS[l])}</option>`).join('')}</select></div>
          <div class="field"><label for="pl-ages">يناسب</label><select class="input" id="pl-ages">${['all'].concat(AGE_IDS).map((a) => `<option value="${a}">${esc(AGES[a])}</option>`).join('')}</select></div>
        </div>
      </div>
      <div id="pl-cur">
      <div class="grid3">
        <div class="field"><label for="pl-type">نوع الدرس</label><select class="input" id="pl-type"></select></div>
        <div class="field"><label for="pl-term">الفصل الدراسي</label><select class="input" id="pl-term">${[1, 2].map((t) => `<option value="${t}">${esc(TERMS[t])}</option>`).join('')}</select></div>
        <div class="field" id="pl-unit-f"><label for="pl-unit">الوحدة</label><select class="input" id="pl-unit"><option value="">بلا وحدة</option>${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">الوحدة ${fNum(i + 1)}</option>`).join('')}</select></div>
      </div>
      <div class="field" id="pl-ut-f" hidden><label for="pl-ut">اسم الوحدة (اختياري)</label><input class="input" id="pl-ut" maxlength="80" placeholder="مثال: المعادلات والمتباينات"></div>
      <div class="grid2" id="pl-exam" hidden>
        <div class="field"><label for="pl-year">سنة الامتحان</label><select class="input" id="pl-year"><option value="">اختر السنة</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select></div>
        <div class="field"><label for="pl-round">الدور</label><select class="input" id="pl-round"><option value="1">الدور الأول</option><option value="2">الدور الثاني</option></select></div>
      </div>
      </div>
    </fieldset>`;
  }
  // src: درس موجود (تعديل) أو بيانات مسبقة من الاستوديو أو من طلب
  function bindPlace(gSel, sSel, titleEl, src) {
    const box = $('#pl');
    const el = (id) => $('#pl-' + id);
    let typeTouched = !!(src && src.lesson_type && src.lesson_type !== 'lesson');
    let autoTitle = '';
    let loadedFor = '';
    let usedSrc = false;
    // تعديل درس موجود: نعرض قيمه هو كما هي، ولا نقترح شيئاً من الذاكرة
    const editing = !!(src && src.id);
    if (editing) el('term').insertAdjacentHTML('afterbegin', '<option value="">غير محدد</option>');
    const key = () => `t-place:${gSel.value}:${sSel.value}`;
    const sk = () => isSkills(gSel.value);
    const isDipl = () => !sk() && el('type').value === 'exam' && isExamGrade(gSel.value);
    function fillTypes() {
      const cur = el('type').value || 'lesson';
      el('type').innerHTML = Object.keys(TYPES).map((t) => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(typeName(t, gSel.value))}</option>`).join('');
    }
    function put(p) {
      el('type').value = p.lesson_type || 'lesson';
      el('term').value = p.term ? String(p.term) : editing ? '' : String(currentTerm());
      el('unit').value = p.unit ? String(p.unit) : '';
      el('ut').value = p.unit_title || '';
      el('year').value = p.exam_year ? String(p.exam_year) : '';
      el('round').value = String(p.exam_round || 1);
    }
    function sync() {
      const skill = sk();
      el('sk').hidden = !skill;
      el('cur').hidden = skill;
      el('skname-f').hidden = !(skill && sSel.value === 'sk_other');
      el('legend').textContent = skill ? 'تفاصيل الدورة' : 'مكان الدرس في الكتاب';
      el('hint').textContent = skill ? 'ليجد الطالب أجزاء الدورة مرتبة. يتذكر المتصفح الدورة ويقترح الجزء التالي.' : 'ليجده الطالب بترتيب كتابه. يتذكر المتصفح اختيارك لهذه المادة.';
      if (skill) return;
      const dipl = isDipl();
      el('unit-f').hidden = dipl;
      el('ut-f').hidden = dipl || !el('unit').value;
      el('exam').hidden = !dipl;
      // امتحان الدبلوم: العنوان يُكتب تلقائياً من السنة والدور والفصل ما لم يغيّره المعلم
      if (dipl && el('year').value) {
        const t = examTitle(Number(el('year').value), Number(el('round').value), Number(el('term').value));
        const cur = titleEl.value.trim();
        if (!cur || cur === autoTitle) titleEl.value = t;
        autoTitle = t;
      }
    }
    function load() {
      const ready = !!(gSel.value && sSel.value);
      box.hidden = !ready;
      if (!ready) return;
      fillTypes();
      const k = key();
      if (k !== loadedFor && sk()) {
        // المهارات: نفس الدورة والجزء التالي، والمستوى والعمر كما في المرة السابقة
        loadedFor = k;
        const m = store.json(k, {});
        const fromSrc = !usedSrc && src && (editing || src.unit_title || src.unit || src.level);
        usedSrc = true;
        const v = fromSrc ? src : { unit_title: m.course || '', unit: m.course ? (m.part || 0) + 1 : '', level: m.level || 1, ages: m.ages || 'all', skill_name: m.skname || '' };
        el('course').value = v.unit_title || '';
        el('part').value = v.unit || '';
        el('level').value = String(v.level || 1);
        el('ages').value = v.ages || 'all';
        el('skname').value = v.skill_name || (src && src.skill_name) || '';
      } else if (k !== loadedFor) {
        loadedFor = k;
        if (!usedSrc && src && (editing || src.term || src.unit || (src.lesson_type && src.lesson_type !== 'lesson'))) { usedSrc = true; put(src); }
        else {
          const m = store.json(k, {});
          const unit = src && src.unit && !usedSrc ? src.unit : m.unit;
          usedSrc = true;
          put({ term: (src && src.term) || m.term, unit, unit_title: unit && m.units ? m.units[unit] : '',
            lesson_type: typeTouched ? el('type').value : guessType(titleEl.value) });
        }
      }
      sync();
    }
    gSel.addEventListener('change', () => setTimeout(load));
    sSel.addEventListener('change', load);
    titleEl.addEventListener('input', () => {
      if (typeTouched || box.hidden || sk() || titleEl.value.trim() === autoTitle) return;
      const g = guessType(titleEl.value);
      if (el('type').value !== g) { el('type').value = g; sync(); }
    });
    el('type').addEventListener('change', () => { typeTouched = true; sync(); });
    el('unit').addEventListener('change', () => {
      const m = store.json(key(), {});
      el('ut').value = (m.units && m.units[el('unit').value]) || '';
      sync();
    });
    ['term', 'year', 'round'].forEach((x) => el(x).addEventListener('change', sync));
    load();
    return {
      read() {
        if (box.hidden) return {};
        if (sk()) {
          const course = el('course').value.trim().replace(/\s+/g, ' ');
          const part = Math.min(60, Math.max(0, Math.round(Number(el('part').value) || 0))) || null;
          return { term: null, unit: part, unit_title: course.length >= 2 ? course : null, lesson_type: 'lesson', exam_year: null, exam_round: null,
            level: Number(el('level').value) || null, ages: el('ages').value || null,
            skill_name: sSel.value === 'sk_other' ? el('skname').value.trim().replace(/\s+/g, ' ') || null : null };
        }
        const type = el('type').value || 'lesson';
        const dipl = isDipl();
        const unit = dipl ? null : Number(el('unit').value) || null;
        const ut = unit ? el('ut').value.trim().replace(/\s+/g, ' ') : '';
        return { term: Number(el('term').value) || null, unit, unit_title: ut.length >= 2 ? ut : null, lesson_type: type,
          exam_year: dipl ? Number(el('year').value) || null : null, exam_round: dipl && el('year').value ? Number(el('round').value) || null : null,
          level: null, ages: null, skill_name: null };
      },
      // خطأ يمنع الحفظ: { el, msg } أو null
      check() {
        if (box.hidden || !sk()) return null;
        const n = el('skname').value.trim();
        if (sSel.value === 'sk_other' && (n.length < 2 || n.length > 40)) return { el: el('skname'), msg: 'اكتب اسم المهارة (حرفان على الأقل).' };
        const c = el('course').value.trim();
        if (c && c.length < 2) return { el: el('course'), msg: 'اسم الدورة قصير جداً.' };
        return null;
      },
      remember() {
        if (box.hidden) return;
        const p = this.read();
        if (sk()) {
          store.set(key(), JSON.stringify({ course: p.unit_title || '', part: p.unit || 0, level: p.level, ages: p.ages, skname: p.skill_name || '' }));
          return;
        }
        const m = store.json(key(), {});
        const units = m.units || {};
        if (p.unit && p.unit_title) units[p.unit] = p.unit_title;
        // المراجعة بلا وحدة لا تُنسي الوحدة التي يشرحها المعلم الآن
        store.set(key(), JSON.stringify({ term: p.term, unit: p.unit || m.unit || null, units }));
      },
    };
  }

  // ------------------------------------------------------------------
  //  محرر «اختبر نفسك» والملفات المرافقة (في نموذج الدرس)
  // ------------------------------------------------------------------
  const FILE_HOST = /^https:\/\/(drive\.google\.com|docs\.google\.com|1drv\.ms|onedrive\.live\.com|(www\.)?dropbox\.com)\//i;
  const qzBlock = (q, i) => `<fieldset class="qz-ed" data-qi="${i}"><legend>السؤال ${fNum(i + 1)}</legend>
      <input class="input qz-q" maxlength="200" placeholder="نص السؤال" value="${esc((q && q.q) || '')}" aria-label="نص السؤال ${fNum(i + 1)}">
      <div class="qz-opts">${[0, 1, 2, 3].map((j) => `<label class="qz-opt"><input type="radio" name="qa${i}" value="${j}"${q && q.a === j ? ' checked' : ''} aria-label="الخيار ${fNum(j + 1)} هو الإجابة الصحيحة">
        <input class="input qz-o" maxlength="100" placeholder="الخيار ${fNum(j + 1)}${j > 1 ? ' (اختياري)' : ''}" value="${esc((q && q.o && q.o[j]) || '')}"></label>`).join('')}</div>
      <span class="hint">اضغط الدائرة بجانب الإجابة الصحيحة.</span>
      <div><button type="button" class="btn btn-sm btn-ghost btn-danger" data-qdel>حذف السؤال</button></div></fieldset>`;
  function quizEditorHtml(quiz) {
    const qs = Array.isArray(quiz) ? quiz : [];
    return `<details class="more" id="qz-ed"${qs.length ? ' open' : ''}><summary>اختبر نفسك: أسئلة قصيرة بعد الدرس (اختياري)</summary>
      <p class="hint">حتى 5 أسئلة اختيار من متعدد، يجيب عنها الطالب بعد الدرس ويعرف فوراً إن فهم. لا تُحفظ إجاباته في أي مكان.</p>
      <div id="qz-list">${qs.map(qzBlock).join('')}</div>
      <div><button type="button" class="btn btn-sm" id="qz-add">أضف سؤالاً</button></div></details>`;
  }
  function bindQuizEditor() {
    const list = $('#qz-list');
    if (!list) return;
    const renumber = () => $$('.qz-ed', list).forEach((f, i) => {
      $('legend', f).textContent = `السؤال ${fNum(i + 1)}`;
      $$('input[type=radio]', f).forEach((r) => { r.name = 'qa' + i; });
    });
    const add = $('#qz-add');
    const sync = () => { add.hidden = $$('.qz-ed', list).length >= 5; };
    add.addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', qzBlock(null, $$('.qz-ed', list).length));
      renumber(); sync();
      const last = $$('.qz-q', list).pop(); if (last) last.focus();
    });
    list.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-qdel]');
      if (!b) return;
      b.closest('.qz-ed').remove(); renumber(); sync();
      const next = $$('[data-qdel]', list).pop(); (next || (add.hidden ? null : add) || list).focus();
    });
    sync();
  }
  // يرجع { quiz } أو { el, msg } عند خطأ
  function readQuiz() {
    const out = [];
    for (const f of $$('#qz-list .qz-ed')) {
      const q = $('.qz-q', f).value.trim();
      const opts = $$('.qz-o', f).map((x) => x.value.trim());
      const pick = $$('input[type=radio]', f).find((r) => r.checked);
      if (!q && opts.every((o) => !o)) continue;
      if (q.length < 3) return { el: $('.qz-q', f), msg: 'اكتب نص السؤال (3 أحرف على الأقل).' };
      const kept = opts.map((o, j) => ({ o, j })).filter((x) => x.o);
      if (kept.length < 2) return { el: $$('.qz-o', f)[kept.length ? 1 : 0], msg: 'اكتب خيارين على الأقل للسؤال.' };
      const a = pick ? kept.findIndex((x) => x.j === Number(pick.value)) : -1;
      if (a < 0) return { el: $$('input[type=radio]', f)[0], msg: 'اختر الإجابة الصحيحة لكل سؤال (الدائرة بجانب الخيار).' };
      out.push({ q, o: kept.map((x) => x.o), a });
    }
    return { quiz: out.length ? out : null };
  }
  function filesEditorHtml(files) {
    const fs = Array.isArray(files) ? files : [];
    return `<details class="more" id="fl-ed"${fs.length ? ' open' : ''}><summary>ملفات مرافقة: ملخص أو ورقة عمل (اختياري)</summary>
      <p class="hint">روابط من Google Drive أو OneDrive أو Dropbox، حتى 3 ملفات. اجعل مشاركة الملف «أي شخص لديه الرابط».</p>
      ${[0, 1, 2].map((i) => `<div class="grid2 fl-row"><input class="input fl-t" maxlength="60" placeholder="اسم الملف، مثل: ملخص الدرس" value="${esc((fs[i] && fs[i].t) || '')}" aria-label="اسم الملف ${fNum(i + 1)}">
        <input class="input fl-u" type="url" inputmode="url" maxlength="300" placeholder="https://drive.google.com/..." value="${esc((fs[i] && fs[i].u) || '')}" aria-label="رابط الملف ${fNum(i + 1)}"></div>`).join('')}</details>`;
  }
  function readFiles() {
    const out = [];
    for (const r of $$('#fl-ed .fl-row')) {
      const u = $('.fl-u', r).value.trim();
      let t = $('.fl-t', r).value.trim();
      if (!u) continue;
      if (!FILE_HOST.test(u) || /[\s<>"'`]/.test(u)) return { el: $('.fl-u', r), msg: 'رابط الملف يجب أن يكون من Google Drive أو OneDrive أو Dropbox.' };
      if (t.length < 2) t = 'ملف مرافق';
      out.push({ t: t.slice(0, 60), u });
    }
    return { files: out.length ? out : null };
  }

  // ------------------------------------------------------------------
  //  لوحة المعلم: أثر دروسه، وشهادة الشكر، وطلبات طلاب صفوفه
  // ------------------------------------------------------------------
  // الدروس التي تُحسب للشهادة (نفس شروط الخادم): منشورة ومُضافة منذ 3 أيام، 5 دقائق فأكثر، فيديوهات مختلفة
  function certCount(list) {
    const ago = Date.now() - 3 * DAY;
    const ok = list.filter((s) => s.status === 'scheduled' && !s.hidden && ytId(s.video_url)
      && +new Date(s.starts_at) <= ago && +new Date(s.created_at || s.starts_at) <= ago && +new Date(s.ends_at) - +new Date(s.starts_at) >= 5 * MIN);
    return new Set(ok.map((s) => ytId(s.video_url))).size;
  }
  async function dashImpact(tok, p, list) {
    const box = $('#impact');
    if (!box) return;
    const published = list.filter((s) => s.status === 'scheduled' && +new Date(s.starts_at) <= Date.now()).length;
    const n = certCount(list);
    const [stats, certs] = await Promise.all([
      app.settings.views_on !== false && API.myLessonStats ? API.myLessonStats().catch(() => null) : null,
      API.myCertificates ? API.myCertificates().catch(() => []) : [],
    ]);
    if (tok !== app.token || !$('#impact')) return;
    const sum = (k) => (stats || []).reduce((a, x) => a + (Number(x[k]) || 0), 0);
    // المستوى الملغى لا يُمنح مرة أخرى (كما في الخادم)، فنبدأ من المستوى الذي بعده
    const top = (certs || []).reduce((a, c) => Math.max(a, c.level), 0);
    const next = CERT_LEVELS.find((l) => l > top);
    const claimLvl = CERT_LEVELS.slice().reverse().find((l) => l <= n && l > top);
    const canClaim = p.status === 'approved' && !!claimLvl;
    const tile = (num, label) => `<div class="tile"><b class="num">${fNum(num)}</b><span>${label}</span></div>`;
    if (!published && !(certs || []).length) { box.innerHTML = ''; return; }
    box.innerHTML = `<section class="section"><div class="section-head"><h2>أثر دروسك</h2></div>
      <div class="tiles">${tile(published, 'درس منشور')}${stats ? tile(sum('views'), 'مشاهدة') + tile(sum('thanks') + sum('understood'), 'شكر من الطلاب') : ''}</div>
      <div class="box cert-box">
        <div class="row"><h3>شهادة الشكر</h3><span class="spacer"></span>${(certs || []).map((c) => `<a class="btn btn-sm${c.revoked ? ' btn-ghost' : ''}" href="#/c/${esc(c.code)}">${c.revoked ? 'ملغاة: ' : ''}شهادة ${lessonsN(c.level)}</a>`).join('')}</div>
        ${canClaim ? `<div><button type="button" class="btn btn-primary" id="claim">استلم شهادة ${lessonsN(claimLvl)}</button></div>`
          : next ? `<div class="meter cert-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${next}" aria-valuenow="${Math.min(n, next)}" aria-label="التقدم نحو الشهادة التالية"><span style="width:${Math.round(Math.min(1, n / next) * 100)}%"></span></div>
            <span class="hint">${fNum(Math.min(n, next))} من ${fNum(next)} دروس</span>`
          : ''}
      </div></section>`;
    // أرقام كل درس بجانبه
    (stats || []).forEach((x) => {
      const el = document.querySelector(`[data-rs="${x.session_id}"]`);
      if (!el) return;
      const bits = [];
      if (Number(x.views)) bits.push(`${fNum(x.views)} مشاهدة`);
      if (Number(x.thanks) + Number(x.understood)) bits.push(`${fNum(Number(x.thanks) + Number(x.understood))} شكر`);
      if (bits.length) el.textContent = '· ' + bits.join(' · ');
    });
    const cb = $('#claim');
    if (cb) cb.addEventListener('click', async () => {
      cb.disabled = true;
      try {
        const got = await API.claimCertificate();
        const had = new Set((certs || []).map((c) => c.code));
        const fresh = (got || []).filter((c) => !c.revoked && !had.has(c.code)).sort((a, b) => b.level - a.level)[0];
        if (fresh) { toast('صدرت شهادتك. مبارك!'); location.hash = '#/c/' + fresh.code; } else { toast('لم تصدر شهادة جديدة بعد.'); route(); }
      } catch (e) { toast(errMsg(e), true); cb.disabled = false; }
    });
  }
  async function dashRequests(tok, p, list) {
    const box = $('#reqs');
    if (!box || p.status !== 'approved' || !requestsOn() || !API.teacherRequests) return;
    const keys = [];
    const addKey = (g, s) => { const k = g + ':' + s; if (g && s && (GRADES[g] || isSkills(g)) && !keys.includes(k)) keys.push(k); };
    list.forEach((s) => addKey(s.grade, s.subject));
    addKey(store.get('t-grade'), store.get('t-subject'));
    if (!keys.length) return;
    let rows;
    try { rows = await API.teacherRequests(keys.slice(0, 24)); } catch (e) { return; }
    if (tok !== app.token || !$('#reqs')) return;
    const open = (rows || []).filter((q) => q.status === 'open');
    const done = (rows || []).filter((q) => q.status === 'done');
    if (!open.length && !done.length) return;
    const what = (q) => [q.topic, q.unit ? 'الوحدة ' + fNum(q.unit) : '', q.term ? TERMS[q.term] : ''].filter(Boolean).join(' · ');
    box.innerHTML = `<section class="section"><div class="section-head"><h2>طلبات الطلاب</h2></div>
      ${open.length ? `<div class="list">${open.map((q) => `<div class="item req-item" data-q="${esc(q.id)}">
        <div class="when"><b class="num">${fNum(q.votes)}</b><span>${q.votes === 1 ? 'طالب' : q.votes === 2 ? 'طالبان' : q.votes <= 10 ? 'طلاب' : 'طالباً'}</span></div>
        <div class="what"><b>${esc(what(q) || 'درس')}</b><div class="row"><span>${esc(gradeName(q.grade))}</span><span>·</span><span>${esc(subjectName(q.subject))}</span></div></div>
        <div class="tools"><button type="button" class="btn btn-sm btn-primary" data-rec="${esc(q.id)}">سجّل هذا الدرس</button>
          <button type="button" class="btn btn-sm btn-ghost" data-flag="${esc(q.id)}">غير مناسب</button></div></div>`).join('')}</div>` : ''}
      ${done.length ? `<details class="more"><summary>طلبات سُجّلت مؤخراً (${fNum(done.length)})</summary><ul class="plain">${done.map((q) => `<li>${esc(what(q))} — ${esc(gradeName(q.grade))} · ${esc(subjectName(q.subject))}${q.session_id ? ` · <a href="#/s/${esc(q.session_id)}">الدرس</a>` : ''}</li>`).join('')}</ul></details>` : ''}
    </section>`;
    $$('[data-rec]', box).forEach((b) => b.addEventListener('click', () => {
      const q = open.find((x) => x.id === b.getAttribute('data-rec'));
      store.set('st-req', JSON.stringify({ id: q.id, grade: q.grade, subject: q.subject, term: q.term, unit: q.unit, topic: q.topic || '', at: Date.now() }));
      location.hash = '#/studio';
    }));
    $$('[data-flag]', box).forEach((b) => armed(b, async () => {
      try {
        await API.flagRequest(b.getAttribute('data-flag'));
        const it = b.closest('.item'); if (it) it.remove();
        toast('أُخفي الطلب عنك. إن رآه معلم آخر غير مناسب يُحذف.');
      } catch (e) { toast(errMsg(e), true); }
    }));
  }
  // مساراتي: للمعلم الموثوق والمشرف
  async function dashPaths(tok, p) {
    const box = $('#mypaths');
    if (!box || !API.myPaths || !((p.status === 'approved' && p.trusted) || p.is_admin)) return;
    let rows;
    try { rows = await API.myPaths(); } catch (e) { return; }
    if (tok !== app.token || !$('#mypaths') || !rows.length) return;
    box.innerHTML = `<section class="section"><div class="section-head"><h2>مساراتي</h2>
        <span class="spacer"></span><a class="btn btn-sm" href="#/dashboard/path/new">مسار جديد</a></div>
      ${rows.length ? `<div class="list">${rows.map((x) => `<div class="item" style="grid-template-columns:minmax(0,1fr) auto">
        <div class="what"><b><a href="#/p/${esc(x.id)}">${esc(x.title)}</a></b><div class="row"><span>${esc(gradeName(x.grade))}</span><span>·</span><span>${lessonsN((x.items || []).length)}</span>${x.published ? '<span class="pill pill-ok">منشور</span>' : '<span class="pill">مسودة</span>'}</div></div>
        <div class="tools"><a class="btn btn-sm" href="#/dashboard/path/${esc(x.id)}">تعديل</a></div></div>`).join('')}</div>`
        : '<p class="muted">لم تنشئ مسارات بعد.</p>'}</section>`;
  }
  async function pagePathForm(tok, id) {
    setNav(''); setTitle(id === 'new' ? 'مسار جديد' : 'تعديل المسار');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    if (!((p.status === 'approved' && p.trusted) || p.is_admin)) {
      view.innerHTML = `<div class="empty" style="margin-top:24px"><b>المسارات للمعلمين الموثوقين</b><span>بعد اعتماد ${fNum(C.TRUST_AFTER || 3)} دروس لك تستطيع إنشاء مسارات.</span><a class="btn" href="#/dashboard">لوحتي</a></div>`;
      return;
    }
    let path = { grade: store.get('t-grade') || 'g10', title: '', description: '', items: [], published: true };
    let chosen = [];
    try {
      if (id !== 'new') {
        const x = await API.getPath(id);
        if (!x || (x.owner !== p.id && !p.is_admin)) return pageNotFound('لم نجد هذا المسار في مساراتك.');
        path = x;
        const got = await API.lessonsByIds(x.items || []);
        // دروس المسار المخفية أو قيد المراجعة الآن تبقى في مكانها حتى لا تضيع عند الحفظ
        chosen = (x.items || []).map((sid) => got.find((s) => s.id === sid) || { id: sid, title: 'درس غير ظاهر للطلاب الآن', gone: true });
      }
    } catch (e) { if (tok === app.token) view.innerHTML = errorBox(e); return; }
    if (tok !== app.token) return;
    let mine = [];
    try { mine = (await API.mySessions()).filter((s) => s.status === 'scheduled' && (s.review || 'ok') === 'ok' && +new Date(s.starts_at) <= Date.now() && s.video_url); } catch (e) { /* اختياري */ }
    if (tok !== app.token) return;
    view.innerHTML = `
      <header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>${id === 'new' ? 'مسار جديد' : 'تعديل المسار'}</span></nav>
        <h1>${id === 'new' ? 'مسار جديد' : 'تعديل المسار'}</h1><p class="muted">اختر دروساً منشورة ورتّبها، ليتابعها الطالب واحداً بعد الآخر ويرى تقدّمه.</p></header>
      <form class="form" id="pform" novalidate>
        <div class="grid2">
          <div class="field"><label for="pf-title">عنوان المسار</label><input class="input" id="pf-title" maxlength="80" value="${esc(path.title || '')}" placeholder="مثال: استعد لاختبار الرياضيات — الفصل الأول"></div>
          <div class="field"><label for="pf-grade">الصف أو القسم</label><select class="input" id="pf-grade">
            ${C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.id)}"${g.id === path.grade ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}
            ${SKILLS.length ? `<option value="skills"${path.grade === 'skills' ? ' selected' : ''}>المهارات</option>` : ''}</select></div>
        </div>
        <div class="field"><label for="pf-desc">وصف قصير (اختياري)</label><textarea class="input" id="pf-desc" maxlength="300" rows="2">${esc(path.description || '')}</textarea></div>
        <label class="check"><input type="checkbox" id="pf-pub"${path.published !== false ? ' checked' : ''}><span>منشور للطلاب</span></label>
        <section class="box"><h2>دروس المسار <span class="muted small" id="pf-count"></span></h2><div class="lrows" id="pf-list"></div></section>
        <section class="box"><h2>أضف دروساً</h2>
          <input class="input" type="search" id="pf-q" placeholder="ابحث في دروس هذا الصف بكلمة من العنوان" autocomplete="off">
          <div id="pf-res" class="pick-list"></div>
          ${mine.length ? `<details class="more"><summary>من دروسي (${fNum(mine.length)})</summary><div class="pick-list" id="pf-mine"></div></details>` : ''}
        </section>
        <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ المسار</button><a class="btn" href="#/dashboard">إلغاء</a>
          <span class="spacer"></span>${id !== 'new' ? '<button type="button" class="btn btn-ghost btn-danger" id="pf-del">حذف المسار</button>' : ''}</div>
      </form>`;
    const MAXI = 40;
    const drawChosen = () => {
      $('#pf-count').textContent = `(${fNum(chosen.length)} من ${fNum(MAXI)})`;
      $('#pf-list').innerHTML = chosen.length ? chosen.map((s, i) => `<div class="lrow pick-row"><span class="lr-num">${fNum(i + 1)}</span>
          <span class="lr-main"><b${s.gone ? ' class="muted"' : ''}>${esc(s.title)}</b><span>${s.gone ? 'مخفي أو قيد المراجعة؛ لن يراه الطالب حتى يعود. يمكنك إزالته.' : esc([gradeName(s.grade), subjOf(s), (s.teacher && s.teacher.display_name) || ''].filter(Boolean).join(' · '))}</span></span>
          <span class="row"><button type="button" class="btn btn-sm btn-ghost" data-up="${i}" aria-label="إلى الأعلى"${i ? '' : ' disabled'}>↑</button>
          <button type="button" class="btn btn-sm btn-ghost" data-down="${i}" aria-label="إلى الأسفل"${i < chosen.length - 1 ? '' : ' disabled'}>↓</button>
          <button type="button" class="btn btn-sm btn-ghost btn-danger" data-rm="${i}" aria-label="إزالة">✕</button></span></div>`).join('')
        : '<p class="muted" style="padding:12px 16px">لم تضف دروساً بعد.</p>';
    };
    const pickHtml = (rows) => rows.filter((s) => !chosen.some((c) => c.id === s.id)).slice(0, 20).map((s) => `<div class="pick"><span><b>${esc(s.title)}</b>
        <span class="muted small">${esc([subjOf(s), (s.teacher && s.teacher.display_name) || ''].filter(Boolean).join(' · '))}</span></span>
        <button type="button" class="btn btn-sm" data-add="${esc(s.id)}">أضف</button></div>`).join('') || '<p class="muted small">لا نتائج.</p>';
    let found = [];
    const drawMine = () => { const b = $('#pf-mine'); if (b) b.innerHTML = pickHtml(mine.filter((s) => s.grade === $('#pf-grade').value)); };
    drawChosen(); drawMine();
    const add = (sid) => {
      const s = found.concat(mine).find((x) => x.id === sid);
      if (!s || chosen.some((c) => c.id === sid)) return;
      if (chosen.length >= MAXI) return toast(`الحد الأقصى ${fNum(MAXI)} درساً في المسار.`, true);
      chosen.push(s); drawChosen(); drawMine(); $('#pf-res').innerHTML = found.length ? pickHtml(found) : '';
    };
    $('#pform').addEventListener('click', (ev) => {
      const t = ev.target.closest('button');
      if (!t) return;
      // بعد إعادة الرسم يعود التركيز إلى زر مناسب بدل أن يضيع (لمستخدمي لوحة المفاتيح)
      const focus = (...sels) => { for (const q of sels) { const x = q && $(q); if (x && !x.disabled) { x.focus(); return; } } };
      if (t.hasAttribute('data-add')) {
        const box = t.closest('.pick-list'); const bid = box && box.id;
        add(t.getAttribute('data-add'));
        focus(bid && `#${bid} [data-add]`, '#pf-q');
      }
      const move = (i, d) => { const j = i + d; if (j < 0 || j >= chosen.length) return; [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; drawChosen(); focus(`[data-${d < 0 ? 'up' : 'down'}="${j}"]`, `[data-${d < 0 ? 'down' : 'up'}="${j}"]`); };
      if (t.hasAttribute('data-up')) move(Number(t.getAttribute('data-up')), -1);
      if (t.hasAttribute('data-down')) move(Number(t.getAttribute('data-down')), 1);
      if (t.hasAttribute('data-rm')) {
        const i = Number(t.getAttribute('data-rm'));
        chosen.splice(i, 1); drawChosen(); drawMine();
        focus(`[data-rm="${Math.min(i, chosen.length - 1)}"]`, '#pf-q');
      }
    });
    let timer; let seq = 0;
    $('#pf-q').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = $('#pf-q').value.trim(); const my = ++seq;
        if (q.length < 2) { found = []; $('#pf-res').innerHTML = ''; return; }
        try { found = remember(await API.searchLessons($('#pf-grade').value, q, '')); } catch (e) { found = []; }
        if (my !== seq || !$('#pf-res')) return;
        $('#pf-res').innerHTML = pickHtml(found);
      }, 400);
    });
    $('#pf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    $('#pf-grade').addEventListener('change', () => { found = []; $('#pf-res').innerHTML = ''; $('#pf-q').value = ''; drawMine(); });
    $('#pform').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const title = $('#pf-title').value.trim();
      if (title.length < 3) { $('#pf-title').setAttribute('aria-invalid', 'true'); $('#pf-title').focus(); return toast('اكتب عنواناً للمسار (3 أحرف على الأقل).', true); }
      if (!chosen.length) return toast('أضف درساً واحداً على الأقل.', true);
      const b = $('#pform button[type=submit]'); b.disabled = true;
      try {
        const saved = await API.savePath({ id: id !== 'new' ? id : null, grade: $('#pf-grade').value, title, description: $('#pf-desc').value.trim(), items: chosen.map((s) => s.id), published: $('#pf-pub').checked });
        toast('حُفظ المسار');
        location.hash = '#/p/' + ((saved && saved.id) || id);
      } catch (e) { toast(errMsg(e), true); b.disabled = false; }
    });
    const del = $('#pf-del');
    if (del) armed(del, async () => {
      try { await API.deletePath(id); toast('حُذف المسار'); location.hash = '#/dashboard'; } catch (e) { toast(errMsg(e), true); }
    });
  }
  // رقم صغير للمشرف: معلمون ودروس بانتظار المراجعة وبلاغات
  let badgeN = 0;
  async function refreshBadge() {
    if (!app.profile || !app.profile.is_admin || !API.adminBadge) { badgeN = 0; return; }
    try { badgeN = Number(await API.adminBadge()) || 0; } catch (e) { return; }
    $$('[data-admin-n]').forEach((el) => { el.hidden = !badgeN; el.textContent = badgeN > 99 ? '99+' : fNum(badgeN); });
  }

  // رسالة بعد النشر: المتطوع الجديد يُبلَّغ أن درسه ذهب إلى المراجعة
  const publishedMsg = () => (app.profile && !app.profile.trusted && !app.profile.is_admin && app.profile.trusted !== undefined
    ? 'أُرسل درسك إلى الإدارة للمراجعة، ويظهر للطلاب بعد اعتماده. شكراً لعطائك!' : 'نُشر الدرس. شكراً لعطائك!');
  // الطلب الذي اختار المعلم تسجيله (يبقى أسبوعاً)
  function pendingReq() {
    const q = store.json('st-req', null);
    if (!q || !q.id || Date.now() - (q.at || 0) > 7 * DAY || !(GRADES[q.grade] || isSkills(q.grade))) return null;
    return q;
  }

  // ------------------------------------------------------------------
  //  شهادة الشكر: صفحة عامة يتحقق منها أي شخص برمزها، وتُطبع أو تُحفظ PDF
  // ------------------------------------------------------------------
  const certCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
  async function pageCertificate(tok, code, form) {
    setNav(''); setTitle('شهادة شكر وتقدير');
    view.innerHTML = '<p class="loading">جارٍ التحقق من الشهادة…</p>';
    let c;
    try { c = API.verifyCertificate ? await API.verifyCertificate(code) : null; }
    catch (e) { if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]').addEventListener('click', route); } return; }
    if (tok !== app.token) return;
    if (!c) return pageNotFound('لم نجد شهادة بهذا الرمز. تأكد من كتابته كما هو في الشهادة.');
    const mine = app.user && c.teacher_id === app.user.id;
    // صيغة المخاطبة جزء من الرابط (/m أو /f) فيراها كل من يفتحه كما اختارها صاحب الشهادة؛ وبدونها صيغة محايدة
    const gk = 'cert-g:' + c.code;
    let g = form || (mine && store.get(gk)) || '';
    const issued = new Date(c.issued_at);
    let hijri = '';
    try { hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(issued); } catch (e) { /* التقويم الهجري غير متاح */ }
    const greg = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(issued);
    const subs = Array.from(new Set((c.subjects || []).map((x) => subjectName(String(x).split(':')[1] || x)))).slice(0, 8);
    const grades = Array.from(new Set((c.subjects || []).map((x) => String(x).split(':')[0]).filter((x) => GRADES[x])));
    const W = {
      '': { to: '', vol: 'تقديراً للتطوّع', end: 'سائلين الله أن يجعل ذلك في ميزان الحسنات، وأن يكون من العلم الذي يُنتفع به.' },
      m: { to: ' المعلم الفاضل', vol: 'تقديراً لتطوّعه', end: 'سائلين الله أن يجعلها في ميزان حسناته، وأن تكون من العلم الذي يُنتفع به.' },
      f: { to: ' المعلمة الفاضلة', vol: 'تقديراً لتطوّعها', end: 'سائلين الله أن يجعلها في ميزان حسناتها، وأن تكون من العلم الذي يُنتفع به.' },
    };
    function draw() {
      const w = W[g] || W[''];
      const url = pageUrl('#/c/' + c.code + (g ? '/' + g : ''));
      view.innerHTML = `
        <div class="cert-tools no-print">
          ${c.valid ? '<span class="pill pill-ok">شهادة صحيحة صادرة من المنصة ✓</span>' : '<span class="pill pill-bad">هذه الشهادة ملغاة</span>'}
          <span class="spacer"></span>
          ${mine ? `<div class="seg seg-sm" role="radiogroup" aria-label="صيغة المخاطبة في الشهادة">
            ${[['', 'بلا تحديد'], ['m', 'المعلم'], ['f', 'المعلمة']].map(([v, n]) => `<label><input type="radio" name="cg" value="${v}"${g === v ? ' checked' : ''}>${n}</label>`).join('')}</div>` : ''}
          ${c.valid ? '<button type="button" class="btn btn-primary" id="print">طباعة أو حفظ PDF</button>' : ''}
          <button type="button" class="btn" id="cp">نسخ رابط التحقق</button>
        </div>
        <article class="cert${c.valid ? '' : ' void'}" aria-label="شهادة شكر وتقدير">
          ${c.valid ? '' : '<div class="cert-stamp">ملغاة</div>'}
          <div class="cert-in">
            <header class="cert-head"><img src="assets/logo-mark.svg" alt="" width="64" height="50"><div><b>${esc(C.SITE_NAME)}</b><span>${esc(C.SITE_TAGLINE || '')}</span></div></header>
            <h1>شهادة شكر وتقدير</h1>
            <p class="cert-lead">تتقدّم ${esc(C.SITE_NAME)} بخالص الشكر والتقدير إلى${w.to}</p>
            <p class="cert-name">${esc(c.display_name)}</p>
            <p class="cert-body">${w.vol} بتقديم <b>${lessonsN(c.lessons)}</b> مجاناً لطلاب سلطنة عُمان${subs.length ? ` في ${esc(subs.join('، '))}` : ''}${grades.length ? ` (${esc(grades.map(gradeName).join('، '))})` : ''}، ${w.end}</p>
            <p class="cert-motto">«علمٌ مِدْرار… وأجرٌ يبقى»</p>
            <footer class="cert-foot">
              <div><span>تاريخ الإصدار</span><b>${esc(greg)}</b>${hijri ? `<b>${esc(hijri)}</b>` : ''}</div>
              <div class="cert-level"><b>${fNum(c.level)}</b><span>${c.level >= 100 ? 'درس' : c.level <= 10 ? 'دروس' : 'درساً'}</span></div>
              <div><span>رمز التحقق</span><b class="cert-code">${esc(certCode(c.code))}</b><span class="cert-url">${esc(url)}</span></div>
            </footer>
          </div>
        </article>
        <p class="muted small no-print" style="padding-block:12px 24px">يتحقق أي شخص من صحة الشهادة بفتح رابطها. ${mine ? 'اختر صيغة المخاطبة قبل نسخ الرابط أو الطباعة، ثم اختر «حفظ بتنسيق PDF» في نافذة الطباعة لحفظها على جهازك.' : ''}</p>`;
      const pr = $('#print'); if (pr) pr.addEventListener('click', () => window.print());
      $('#cp').addEventListener('click', () => copyText(url));
      $$('input[name=cg]').forEach((r) => r.addEventListener('change', () => {
        g = r.value;
        if (g) store.set(gk, g); else store.del(gk);
        try { history.replaceState(null, '', '#/c/' + c.code + (g ? '/' + g : '')); } catch (e) { /* ignore */ }
        draw();
        const again = $(`input[name=cg][value="${g}"]`); if (again) again.focus();
      }));
    }
    draw();
  }

  async function pageDashboard(tok) {
    setNav(''); setTitle('لوحتي');
    const p = await requireTeacher(tok, '#/dashboard');
    if (!p) return;
    view.innerHTML = '<p class="loading">جارٍ تحميل حصصك…</p>';
    let list;
    try { list = await API.mySessions(); }
    catch (e) { if (tok === app.token) { view.innerHTML = errorBox(e, true); $('[data-retry]').addEventListener('click', route); } return; }
    if (tok !== app.token) return;
    // روابط Meet للحصص المباشرة
    let links = {};
    const liveIds = list.filter((s) => s.kind === 'live').map((s) => s.id);
    if (liveIds.length) { try { links = await API.myLinks(liveIds); } catch (e) { /* تبقى بلا روابط */ } if (tok !== app.token) return; }
    const now = Date.now();
    // الدرس المسجّل يُعد منشوراً من لحظة نشره، والحصة المباشرة بعد انتهائها
    const isDone = (s) => (s.kind === 'recorded' ? +new Date(s.starts_at) : +new Date(s.ends_at)) <= now;
    // ما أُرسل للمنصة، ثم القادم بموعد، ثم المنشور
    const sending = list.filter((s) => s.upload_state);
    const upcoming = list.filter((s) => !s.upload_state && !isDone(s)).reverse();
    const past = list.filter((s) => !s.upload_state && isDone(s));
    const missingLinks = upcoming.filter((s) => s.kind === 'live' && s.status === 'scheduled' && !s.video_url && !links[s.id] && +new Date(s.starts_at) - now < DAY).length;
    // حصص مباشرة انتهت خلال أسبوع ولم يُرسل تسجيلها
    const needRec = (s) => s.kind === 'live' && s.status === 'scheduled' && !s.upload_state && !s.video_url && !s.recording_url && +new Date(s.starts_at) <= now;
    const noRec = past.filter((s) => needRec(s) && now - +new Date(s.ends_at) < 7 * DAY).length;
    const fl = app.flash; app.flash = null;
    const row = (s) => {
      const st = stateOf(s);
      const d = new Date(s.starts_at);
      const hasLink = !!(s.video_url || s.recording_url || links[s.id]);
      const startsSoon = s.kind === 'live' && s.status === 'scheduled' && links[s.id] && +new Date(s.starts_at) - now < 3600e3 && +new Date(s.ends_at) > now;
      return `<div class="item${s.status === 'cancelled' ? ' cancelled' : ''}" data-id="${esc(s.id)}">
        <div class="when"><b>${esc(time(d))}</b><span>${esc(fWd.format(d))} ${esc(fDateShort.format(d))}</span></div>
        <div class="what"><b><a href="#/s/${esc(s.id)}">${esc(s.title)}</a></b>
          <div class="row"><span>${esc(gradeName(s.grade))}</span><span>·</span><span>${esc(subjOf(s))}</span><span>·</span>${badgeHtml(s)}
            ${s.upload_state === 'uploading' ? '<span class="pill pill-warn">لم يكتمل الإرسال</span>' : s.upload_state === 'waiting' ? '<span class="pill">وصل للإدارة · بانتظار النشر على القناة</span>'
              : s.status === 'scheduled' && !hasLink && st.key !== 'ended' ? '<span class="linkflag no">بلا رابط</span>' : ''}${s.hidden ? '<span class="pill pill-bad">مخفية</span>' : ''}${s.review === 'pending' ? '<span class="pill pill-warn">بانتظار المراجعة</span>' : s.review === 'rejected' ? '<span class="pill pill-bad">لم يُعتمد</span>' : ''}<span class="rs" data-rs="${esc(s.id)}"></span></div>
          ${s.review === 'rejected' ? `<span class="small reject-note">${s.review_note ? 'السبب: ' + esc(s.review_note) + ' — ' : ''}${s.kind === 'recorded' && !hasLink && !s.upload_state ? 'أرسل الفيديو من جديد بعد تصحيحه، فيعود إلى المراجعة.' : 'عدّل الدرس فيعود إلى المراجعة.'}</span>` : ''}</div>
        <div class="tools">
          ${s.upload_state === 'uploading' ? `<a class="btn btn-sm btn-primary" href="#/dashboard/resume/${esc(s.id)}">أكمل الإرسال</a>` : ''}
          ${startsSoon ? `<button type="button" class="btn btn-sm btn-live" data-start="${esc(s.id)}">ابدأ الحصة</button>` : ''}
          ${needRec(s) && isDone(s) ? `<a class="btn btn-sm btn-primary" href="#/dashboard/rec/${esc(s.id)}">ارفع التسجيل</a>` : ''}
          <a class="btn btn-sm" href="#/dashboard/edit/${esc(s.id)}">${!s.upload_state && s.kind === 'recorded' && !hasLink && s.status === 'scheduled' ? 'أضف الفيديو' : !s.upload_state && !hasLink && s.status === 'scheduled' && st.key !== 'ended' ? 'أضف الرابط' : 'تعديل'}</a>
          <details class="row-more"><summary class="btn btn-sm btn-ghost">المزيد</summary><div class="menu">
            ${s.status === 'scheduled' && +new Date(s.starts_at) > now && (s.review || 'ok') === 'ok' ? `<a class="btn btn-sm" href="${esc(whatsappUrl(s))}" target="_blank" rel="noopener">شارك الموعد</a>` : ''}
            ${links[s.id] ? `<button type="button" class="btn btn-sm" data-copylink="${esc(s.id)}">نسخ رابط الحصة</button>` : ''}
            ${s.kind === 'recorded' ? '' : `<a class="btn btn-sm" href="#/dashboard/copy/${esc(s.id)}">نسخ لموعد آخر</a>`}
            ${!isDone(s) ? `<button type="button" class="btn btn-sm" data-toggle="${esc(s.id)}">${s.status === 'cancelled' ? 'إعادة إلى الجدول' : s.kind === 'recorded' ? 'إلغاء النشر' : 'إلغاء الحصة'}</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-del="${esc(s.id)}">حذف</button>
          </div></details>
        </div></div>`;
    };
    view.innerHTML = `
      <header class="dash-head">${avatar(p.display_name, p.avatar_url || app.user.avatar, 'av-lg', p.gender)}
        <div class="who-big"><h1>${esc(p.display_name)}</h1><div class="row">${statusPill(p.status)}${p.is_admin ? '<span class="pill">مشرف</span>' : ''}</div></div>
        <span class="spacer"></span>
        ${p.is_admin ? '<a class="btn" href="#/admin">الإدارة <span class="badge-n" data-admin-n hidden></span></a>' : ''}
      </header>
      ${p.status !== 'suspended' ? `<div class="dash-actions">
        <a class="act-tile act-main" href="#/dashboard/live"><b>حصة مباشرة جديدة</b></a>
        <a class="act-tile" href="#/dashboard/new"><b>أضف درساً جاهزاً</b></a>
      </div>` : ''}
      <nav class="dash-links"><a href="#/studio">سجّل درساً من شاشتك</a><a href="#/tools">أدوات للشرح</a><a href="#/profile">ملفي</a><a href="#/t/${esc(p.id)}">صفحتي العامة</a>${(p.status === 'approved' && p.trusted) || p.is_admin ? '<a href="#/dashboard/path/new">مسار جديد</a>' : ''}<a href="#/guide">دليل المعلم</a></nav>
      ${p.status === 'pending' ? '<div class="note warn"><b>حسابك قيد المراجعة.</b><span>تظهر حصصك للطلاب بعد اعتماده.</span></div>' : ''}
      ${p.status === 'suspended' ? '<div class="note bad"><b>حسابك موقوف.</b><span>تواصل مع إدارة المنصة.</span></div>' : ''}
      ${fl && fl.kind === 'sent' && fl.rec ? `<div class="note ok-note" style="margin-top:10px" role="status"><b>وصل تسجيل حصتك «${esc(fl.title)}» 🎉</b><span>تنشره الإدارة على قناة «مدرار العلم» باسمك، ثم يظهر في صفحة الحصة لمن فاته الحضور.</span></div>` : ''}
      ${fl && fl.kind === 'sent' && !fl.rec ? `<div class="note ok-note" style="margin-top:10px" role="status"><b>وصل درسك «${esc(fl.title)}» 🎉</b><span>ستراجعه الإدارة وتنشره على قناة «مدرار العلم» باسمك، ثم يظهر للطلاب ${fl.at ? `في موعده: ${esc(dayLabel(new Date(fl.at)))} الساعة ${esc(time(fl.at))}` : 'فور نشره'}.</span></div>` : ''}
      ${missingLinks ? `<div class="note warn" style="margin-top:10px"><b>${plural(missingLinks, 'حصة واحدة', 'حصتان', 'حصص', 'حصة')} خلال 24 ساعة بلا رابط.</b><span>أضف رابط حصة Google Meet حتى يتمكن الطلاب من الدخول.</span></div>` : ''}
      ${noRec ? `<div class="note" style="margin-top:10px"><b>${plural(noRec, 'حصة انتهت', 'حصتان انتهتا', 'حصص انتهت', 'حصة انتهت')} دون تسجيل.</b><span>اضغط «ارفع التسجيل» بجانبها، فننشره لمن فاته الحضور.</span></div>` : ''}
      ${p.status === 'approved' && p.trusted !== undefined && !p.trusted && !p.is_admin ? (() => {
        const n = C.TRUST_AFTER || 3;
        const ok = list.filter((s) => (s.review || 'ok') === 'ok').length;
        return `<div class="note" style="margin-top:10px"><b>أهلاً بك</b><span>أول ${fNum(n)} دروس تراجعها الإدارة قبل ظهورها (اعتُمد ${fNum(Math.min(ok, n))} من ${fNum(n)}).</span></div>`;
      })() : ''}
      <div id="unpub"></div>
      ${upcoming.length ? `<section class="section"><div class="section-head"><h2>حصصك ودروسك القادمة</h2><span class="muted">${fNum(upcoming.length)}</span></div>
        <div class="list">${upcoming.map(row).join('')}</div></section>` : ''}
      ${sending.length ? `<section class="section"><div class="section-head"><h2>أرسلتها للمنصة</h2><span class="muted">${fNum(sending.length)} · تنشرها الإدارة قريباً</span></div>
        <div class="list">${sending.map(row).join('')}</div></section>` : ''}
      <div id="reqs"></div>
      <section class="section"><div class="section-head"><h2>دروسي المنشورة</h2><span class="muted">${fNum(past.length)}</span></div>
        ${past.length ? `<div class="list">${past.slice(0, 60).map(row).join('')}</div>${past.length > 60 ? '<p class="muted small">تظهر آخر 60 درساً.</p>' : ''}`
          : `<div class="empty"><b>لم تنشر أي درس بعد</b>${p.status !== 'suspended' ? '<div class="row"><a class="btn btn-primary" href="#/dashboard/live">أنشئ حصتك الأولى</a><a class="btn" href="#/studio">سجّل درسك الأول</a></div>' : ''}</div>`}
      </section>
      <div id="impact"></div><div id="mypaths"></div>
      <div class="row" style="padding-bottom:12px"><span class="spacer"></span><button type="button" class="btn btn-ghost" id="out">تسجيل الخروج</button></div>`;
    $('#out').addEventListener('click', signOut);
    $$('[data-copylink]').forEach((b) => b.addEventListener('click', () => copyText(links[b.getAttribute('data-copylink')])));
    $$('[data-start]').forEach((b) => b.addEventListener('click', () => { const s = list.find((x) => x.id === b.getAttribute('data-start')); if (s) startClass(s, links[s.id], b); }));
    $$('[data-toggle]').forEach((b) => {
      const s = list.find((x) => x.id === b.getAttribute('data-toggle'));
      const act = async () => {
        b.disabled = true;
        try { await API.updateSession(s.id, { status: s.status === 'cancelled' ? 'scheduled' : 'cancelled' }); toast(s.status === 'cancelled' ? 'أُعيد إلى الجدول' : 'أُلغي، وسيراه الطلاب ملغى'); route(); }
        catch (e) { toast(errMsg(e), true); b.disabled = false; }
      };
      if (s.status !== 'cancelled') armed(b, act); else b.addEventListener('click', act);
    });
    $$('[data-del]').forEach((b) => armed(b, async () => {
      try { await API.deleteSession(b.getAttribute('data-del'), app.user.id); toast('حُذف'); route(); }
      catch (e) { toast(errMsg(e), true); }
    }));
    // تسجيلات في هذا المتصفح لم تُنشر بعد
    if (ST && ST.supported()) ST.list().then((items) => {
      const box = $('#unpub');
      if (tok !== app.token || !box || !items.length) return;
      box.innerHTML = `<div class="note warn" style="margin-top:10px"><b>لديك ${plural(items.length, 'تسجيل واحد', 'تسجيلان', 'تسجيلات', 'تسجيلاً')} في هذا المتصفح لم ${items.length === 1 ? 'يُنشر' : items.length === 2 ? 'يُنشرا' : 'تُنشر'} بعد.</b>
        <span>افتحه في الاستوديو واضغط «أرسل الدرس»، حتى لا يضيع إن مُسحت بيانات المتصفح. <a href="#/studio">افتح الاستوديو</a></span></div>`;
    }).catch(() => { /* التخزين غير متاح */ });
    dashImpact(tok, p, list).catch(() => { /* اختياري */ });
    dashRequests(tok, p, list).catch(() => { /* اختياري */ });
    dashPaths(tok, p).catch(() => { /* اختياري */ });
    refreshBadge();
  }

  // نموذج إضافة/تعديل/نسخ حصة
  // ------------------------------------------------------------------
  //  «متى يشاهده الطلاب؟» وإرسال الفيديو للمنصة (مشتركان بين النموذج والاستوديو)
  // ------------------------------------------------------------------
  const dateVal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeVal = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // اقتراح الموعد: السابعة مساءً بعد يوم على الأقل (وقت كافٍ لرفع الفيديو على القناة)
  const nextShow = () => { const d = addDays(new Date(), 1); d.setHours(19, 0, 0, 0); if (+d - Date.now() < DAY) d.setDate(d.getDate() + 1); return d; };
  function whenHtml(p, at, published) {
    const fut = !!at && +at > Date.now();
    const d = fut ? at : nextShow();
    return `<fieldset class="when" id="${p}-when"><legend>متى يشاهده الطلاب؟</legend>
      <label class="when-opt"><input type="radio" name="${p}-w" value="now"${fut ? '' : ' checked'}><span><b>${published ? 'يبقى منشوراً كما هو' : 'فور نشره'}</b>
        <small>${published ? 'لا يتغير موعده.' : 'يظهر في دروس الصف مباشرة بعد نشره.'}</small></span></label>
      <label class="when-opt"><input type="radio" name="${p}-w" value="at"${fut ? ' checked' : ''}><span><b>في موعد أحدده</b>
        <small>يظهر للطلاب في «الدروس القادمة» مع عدّ تنازلي وتذكير، ويُعرض في موعده ليشاهدوه معاً.</small></span></label>
      <div class="grid2 when-at" id="${p}-at"${fut ? '' : ' hidden'}>
        <div class="field"><label for="${p}-date">اليوم</label><input class="input" id="${p}-date" type="date" value="${dateVal(d)}" min="${dateVal(new Date())}"></div>
        <div class="field"><label for="${p}-time">الساعة</label><input class="input" id="${p}-time" type="time" step="300" value="${timeVal(d)}"></div>
      </div>
      <p class="hint when-hint" id="${p}-hint" aria-live="polite"></p>
    </fieldset>`;
  }
  // upload(): هل الفيديو سيُرسل للمنصة (فتحتاج الإدارة وقتاً لرفعه)
  function bindWhen(p, upload) {
    const mode = () => (($(`input[name="${p}-w"]:checked`) || {}).value || 'now');
    const readAt = () => {
      const d = $(`#${p}-date`).value; const t = $(`#${p}-time`).value;
      if (!d || !t) return null;
      const x = new Date(`${d}T${t}`);
      return isNaN(x) ? null : x;
    };
    const paint = () => {
      const hint = $(`#${p}-hint`);
      if (!hint) return;
      $(`#${p}-at`).hidden = mode() !== 'at';
      if (mode() !== 'at') { hint.textContent = ''; return; }
      const x = readAt();
      if (!x) { hint.textContent = 'اختر اليوم والساعة.'; return; }
      const lead = +x - Date.now();
      hint.innerHTML = lead < 10 * MIN ? 'اختر موعداً بعد ربع ساعة على الأقل من الآن.'
        : `يُعرض للطلاب <b>${esc(dayLabel(x))}</b> الساعة <b>${esc(time(x))}</b>.${upload && upload() && lead < DAY ? ' <span class="warn-t">تحتاج الإدارة وقتاً لرفع الفيديو على القناة؛ يُفضّل موعد بعد يوم على الأقل.</span>' : ''}`;
    };
    $$(`input[name="${p}-w"]`).forEach((r) => r.addEventListener('change', paint));
    [`#${p}-date`, `#${p}-time`].forEach((sel) => $(sel).addEventListener('input', paint));
    paint();
    return {
      paint,
      // يرجع { start, at } أو { el, msg }. keep: موعد درس منشور يبقى كما هو
      read(keep) {
        // «الآن» مقرّباً للدقيقة: قوائم الدروس تعرض ما موعده حتى بداية الدقيقة الحالية
        if (mode() === 'now') { const n = keep || new Date(); if (!keep) n.setSeconds(0, 0); return { start: n, at: false }; }
        const x = readAt();
        if (!x) return { el: $(`#${p}-date`), msg: 'اختر يوم الموعد وساعته.' };
        if (+x - Date.now() < 10 * MIN) return { el: $(`#${p}-time`), msg: 'اختر موعداً بعد ربع ساعة على الأقل من الآن.' };
        if (+x - Date.now() > 190 * DAY) return { el: $(`#${p}-date`), msg: 'اختر موعداً خلال ستة أشهر.' };
        return { start: x, at: true };
      },
    };
  }
  // طول الفيديو من الملف نفسه (null إن لم يُعرف، مثل بعض ملفات webm)
  function videoMinutes(file) {
    return new Promise((res) => {
      const v = document.createElement('video');
      const u = URL.createObjectURL(file);
      let done = false;
      const end = (m) => { if (done) return; done = true; URL.revokeObjectURL(u); v.removeAttribute('src'); res(m); };
      v.preload = 'metadata';
      v.onloadedmetadata = () => end(isFinite(v.duration) && v.duration > 0 ? Math.max(1, Math.round(v.duration / 60)) : null);
      v.onerror = () => end(null);
      setTimeout(() => end(null), 8000);
      v.src = u;
    });
  }
  // إرسال الملف مع شريط تقدّم. key يربط الملف بالدرس المنشأ، فإن انقطع الإرسال أكمل من حيث توقف
  async function sendLesson(base, file, box, key, editId) {
    let id = key ? store.get(key) : null;
    if (editId && id !== editId) id = null;
    if (id) {
      const old = await API.getSession(id).catch(() => null);
      if (old && old.upload_state === 'uploading' && old.upload_bytes === file.size) {
        const patch = Object.assign({}, base); delete patch.kind;
        await API.updateSession(id, patch).catch(() => {});
      } else { id = null; store.del(key); }
    }
    const paint = progressBox(box);
    app.sending = (app.sending || 0) + 1;
    try {
      if (!id && editId) {
        await API.resendUpload(editId, base, file);
        id = editId;
        if (key) store.set(key, id);
      } else if (!id) {
        id = (await API.startUpload(base, file)).id;
        if (key) store.set(key, id);
      }
      await API.uploadParts(id, file, paint);
    } finally { app.sending -= 1; }
    if (key) store.del(key);
    return id;
  }
  window.addEventListener('beforeunload', (e) => { if (app.sending > 0) { e.preventDefault(); e.returnValue = ''; } });
  // اكتمل الإرسال: إلى «لوحتي» مع رسالة الوصول. وإن انتقل المعلم أثناءه إلى صفحة أخرى فلا ننقله منها
  function sentDone(tok, title, at) {
    app.flash = sentFlash(title, at);
    if (tok === app.token) { location.hash = '#/dashboard'; return; }
    if (location.hash === '#/dashboard') { route(); return; }
    app.flash = null;
    toast(`وصل درسك «${title}». تجده في «لوحتي».`);
  }
  // توقف الإرسال: الرسالة في مكانها، أو تنبيه إن كان المعلم في صفحة أخرى
  function sentFailed(tok, box, e, key) {
    if (tok === app.token && box && box.isConnected) { box.hidden = false; box.innerHTML = sendFail(e, key); return; }
    toast(`${store.get(key) ? 'توقف إرسال الدرس، أكمله من «لوحتي»' : 'لم يُرسل الدرس'}: ${errMsg(e)}`, true);
  }
  // شريط تقدّم الإرسال
  function progressBox(box) {
    box.hidden = false;
    box.innerHTML = `<div class="up-prog" role="status"><b>جارٍ إرسال الدرس…</b><div class="bar"><span></span></div>
      <span class="small up-txt">يبدأ الآن</span><span class="hint">لا تغلق الصفحة حتى يكتمل الإرسال. إن انقطع الاتصال نكمل من حيث توقف.</span></div>`;
    return (done, total) => {
      const pct = Math.floor((100 * done) / total);
      const bar = $('.bar span', box); const txt = $('.up-txt', box);
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = `${fNum(pct)}% · ${mbs(done)} من ${mbs(total)}`;
    };
  }
  // إكمال إرسال انقطع: يختار المعلم الملف نفسه فنرفع الأجزاء الناقصة فقط
  async function pageResume(tok, id) {
    setNav(''); setTitle('أكمل إرسال الدرس');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    let s = null;
    try { s = (await API.mySessions()).find((x) => x.id === id) || null; } catch (e) { /* أدناه */ }
    if (tok !== app.token) return;
    if (!s || s.upload_state !== 'uploading') return pageNotFound('لا يوجد إرسال غير مكتمل لهذا الدرس.');
    view.innerHTML = `<header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>أكمل الإرسال</span></nav>
        <h1>أكمل إرسال «${esc(s.title)}»</h1>
        <p class="muted">اختر ملف الفيديو نفسه (${esc(mbs(s.upload_bytes))})، ونكمل من حيث توقف الإرسال.</p></header>
      <form class="form" id="rf" novalidate>
        <div class="field"><label for="rf-file">ملف الفيديو</label><input class="input" id="rf-file" type="file" accept="video/*"></div>
        <div id="rf-prog" hidden></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">أكمل الإرسال</button><a class="btn" href="#/dashboard">رجوع</a></div>
      </form>`;
    $('#rf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const inp = $('#rf-file');
      const f = (inp.files || [])[0];
      inp.removeAttribute('aria-invalid');
      if (!f) { inp.focus(); return toast('اختر ملف الفيديو.', true); }
      if (f.size !== s.upload_bytes) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); return toast('هذا ليس الملف نفسه: حجمه يختلف عن الملف الذي بدأت إرساله.', true); }
      const btn = $('#rf button[type=submit]'); btn.disabled = true;
      try {
        app.sending = (app.sending || 0) + 1;
        try { await API.uploadParts(s.id, f, progressBox($('#rf-prog'))); } finally { app.sending -= 1; }
        sentDone(tok, s.title, +new Date(s.starts_at) > Date.now() + 10 * MIN ? s.starts_at : null);
      } catch (e) {
        const pg = $('#rf-prog');
        if (tok === app.token && pg) pg.innerHTML = `<div class="note bad" role="alert"><b>توقف الإرسال</b><span>${esc(errMsg(e))}</span><span>اضغط «أكمل الإرسال» مرة أخرى.</span></div>`;
        else toast('توقف إرسال الدرس، أكمله من «لوحتي»: ' + errMsg(e), true);
        btn.disabled = false;
      }
    });
  }
  // «ابدأ الحصة»: يبدأ تسجيل الشاشة والصوت (صوت المعلم وصوت الحصة)، ثم يفتح المعلم Meet من لوحة التسجيل
  async function startClass(s, link, btn) {
    if (!ST || !ST.supported()) { window.open(link, '_blank', 'noopener'); toast('التسجيل يعمل من الكمبيوتر فقط. اشرح حصتك، وارفع تسجيلها لاحقاً إن وُجد.'); return; }
    if (btn) btn.disabled = true;
    try {
      await ST.start({ micId: store.get('mic') || '', systemAudio: true, label: s.title,
        info: { grade: s.grade, subject: s.subject, title: s.title, live: s.id, link } });
      location.hash = '#/studio';
    } catch (e) { if (btn && btn.isConnected) btn.disabled = false; toast(studioErr(e), true); }
  }
  // تسجيل حصة مباشرة: يُرسل للإدارة لتنشره في صفحة الحصة نفسها
  async function sendRec(s, file, box) {
    const paint = progressBox(box);
    app.sending = (app.sending || 0) + 1;
    try {
      if (!(s.upload_state === 'uploading' && s.upload_bytes === file.size)) await API.sendRecording(s.id, file);
      s.upload_state = 'uploading'; s.upload_bytes = file.size;
      await API.uploadParts(s.id, file, paint);
    } finally { app.sending -= 1; }
  }
  // حصص المعلم المباشرة التي بدأت ولم يُرسل تسجيلها (خلال 3 أيام)
  const recTargets = (list) => list.filter((x) => x.kind === 'live' && x.status === 'scheduled' && !x.upload_state && !x.video_url && !x.recording_url
    && +new Date(x.starts_at) <= Date.now() && Date.now() - +new Date(x.ends_at) < 3 * DAY).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  async function pageRecording(tok, id) {
    setNav(''); setTitle('ارفع التسجيل');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    let s = null;
    try { s = (await API.mySessions()).find((x) => x.id === id) || null; } catch (e) { /* أدناه */ }
    if (tok !== app.token) return;
    if (!s || s.kind !== 'live') return pageNotFound('لم نجد هذه الحصة في حصصك.');
    if (s.upload_state === 'uploading') { location.replace('#/dashboard/resume/' + s.id); return; }
    const head = `<header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>تسجيل الحصة</span></nav>
        <h1>ارفع تسجيل «${esc(s.title)}»</h1>
        <p class="muted">${esc(gradeName(s.grade))} · ${esc(subjOf(s))} · ${esc(dayLabel(new Date(s.starts_at)))} ${esc(time(s.starts_at))}</p></header>`;
    if (s.upload_state === 'waiting') { view.innerHTML = head + '<div class="note ok-note"><b>وصل تسجيل هذه الحصة.</b><span>تنشره الإدارة على قناة «مدرار العلم» قريباً.</span></div>'; return; }
    if (s.video_url || s.recording_url) { view.innerHTML = head + `<div class="note"><b>لهذه الحصة تسجيل منشور.</b><span><a href="#/s/${esc(s.id)}">افتح صفحة الحصة</a></span></div>`; return; }
    if (+new Date(s.starts_at) > Date.now()) { view.innerHTML = head + '<div class="note"><b>لم تبدأ الحصة بعد.</b><span>بعد انتهائها ارجع إلى هنا وأرسل تسجيلها.</span></div>'; return; }
    view.innerHTML = head + `
      <form class="form" id="rc" novalidate>
        <div id="rc-file-box">
          <div class="field"><label for="rc-file">ملف التسجيل</label><input class="input" id="rc-file" type="file" accept="video/*">
            <span class="hint" id="rc-info">حتى 500 ميغابايت</span></div>
          ${consentHtml('rc-consent')}</div>
        <div class="field" id="rc-link-box" hidden><label for="rc-url">رابط التسجيل على يوتيوب</label>
          <input class="input" id="rc-url" type="url" inputmode="url" maxlength="300" placeholder="https://youtu.be/..."></div>
        <div id="rc-prog" hidden></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit" id="rc-go">أرسل</button><a class="btn" href="#/dashboard">رجوع</a></div>
        <button type="button" class="btn btn-ghost btn-sm" id="rc-swap">التسجيل على قناتي في يوتيوب؟ الصق رابطه</button>
      </form>`;
    let mode = 'file';
    $('#rc-swap').addEventListener('click', () => {
      mode = mode === 'file' ? 'link' : 'file';
      $('#rc-file-box').hidden = mode !== 'file'; $('#rc-link-box').hidden = mode !== 'link';
      $('#rc-swap').textContent = mode === 'file' ? 'التسجيل على قناتي في يوتيوب؟ الصق رابطه' : 'ارفع ملفاً بدلاً من ذلك';
    });
    const fileIn = $('#rc-file');
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      fileIn.removeAttribute('aria-invalid');
      if (f && f.size > API.uploadLimit) { fileIn.setAttribute('aria-invalid', 'true'); $('#rc-info').innerHTML = `<span class="warn-t">حجم الملف ${esc(mbs(f.size))}، والحد 500 ميغابايت. قسّمه إلى جزأين، أو ارفعه على قناتك والصق رابطه.</span>`; }
      else if (f) $('#rc-info').textContent = `${f.name} · ${mbs(f.size)}`;
    });
    $('#rc').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('#rc-go');
      const bad = (sel, msg) => { const el = $(sel); el.setAttribute('aria-invalid', 'true'); el.focus(); toast(msg, true); };
      if (mode === 'link') {
        const url = normYt($('#rc-url').value.trim());
        if (!isYouTube(url) || !ytId(url)) return bad('#rc-url', 'الصق رابط التسجيل من يوتيوب، مثل https://youtu.be/...');
        btn.disabled = true;
        try { await API.updateSession(s.id, { recording_url: url }); toast('حُفظ رابط تسجيل الحصة'); location.hash = '#/dashboard'; }
        catch (e) { toast(errMsg(e), true); btn.disabled = false; }
        return;
      }
      const f = (fileIn.files || [])[0];
      if (!f) return bad('#rc-file', 'اختر ملف التسجيل من جهازك.');
      if (f.size > API.uploadLimit) return bad('#rc-file', 'حجم التسجيل أكبر من 500 ميغابايت. قسّمه إلى جزأين، أو ارفعه على قناتك والصق رابطه.');
      btn.disabled = true;
      const box = $('#rc-prog');
      try { await sendRec(s, f, box); sentDoneRec(tok, s.title); }
      catch (e) {
        if (tok === app.token && box.isConnected) { box.hidden = false; box.innerHTML = `<div class="note bad" role="alert"><b>توقف الإرسال</b><span>${esc(errMsg(e))}</span>${s.upload_state ? '<span>اضغط «أرسل التسجيل» مرة أخرى، فنكمل من حيث توقف.</span>' : ''}</div>`; }
        else toast('توقف إرسال تسجيل الحصة، أكمله من «لوحتي»: ' + errMsg(e), true);
        btn.disabled = false;
      }
    });
  }
  function sentDoneRec(tok, title) {
    app.flash = sentFlash(title, null, true);
    if (tok === app.token) { location.hash = '#/dashboard'; return; }
    if (location.hash === '#/dashboard') { route(); return; }
    app.flash = null;
    toast(`وصل تسجيل حصتك «${title}». تجده في «لوحتي».`);
  }
  // رسالة توقف الإرسال: «نكمل من حيث توقف» فقط إن بدأ الإرسال فعلاً
  const sendFail = (e, key) => `<div class="note bad" role="alert"><b>${store.get(key) ? 'توقف الإرسال' : 'لم يُرسل الدرس'}</b><span>${esc(errMsg(e))}</span>${store.get(key) ? '<span>اضغط «أرسل الدرس» مرة أخرى، فنكمل من حيث توقف.</span>' : ''}</div>`;
  const sentFlash = (title, at, rec) => ({ kind: 'sent', title, at: at ? new Date(at).toISOString() : null, rec: !!rec });
  // حفظ رابط Meet: إن تعذّر تبقى الحصة محفوظة، ونطلب إضافة الرابط من «تعديل»
  async function saveLink(id, url) {
    try { await API.setJoinLink(id, url || null); }
    catch (e) { toast('حُفظت الحصة، لكن تعذّر حفظ رابطها: ' + errMsg(e) + ' أضفه من «تعديل».', true); }
  }
  const consentHtml = (id) => `<p class="hint consent" id="${id}">بالإرسال توافق على نشره في قناة «مدرار العلم» باسمك وفق <a href="#/about" target="_blank">الميثاق</a>.</p>`;

  async function pageSessionForm(tok, mode, id) {
    setNav(''); setTitle(mode === 'edit' ? 'تعديل الدرس' : mode === 'live' ? 'حصة مباشرة جديدة' : 'نشر درس');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    if (p.status === 'suspended') { view.innerHTML = '<div class="note bad" style="margin-top:24px">حسابك موقوف ولا يمكنك إضافة حصص.</div>'; return; }
    let s = null;
    if (id) {
      try { s = (await API.mySessions()).find((x) => x.id === id) || null; } catch (e) { /* handled below */ }
      if (tok !== app.token) return;
      if (!s) return pageNotFound('لم نجد هذه الحصة في حصصك.');
    }
    // رابط Meet المحفوظ للحصة
    let link0 = '';
    if (s && s.kind === 'live') { try { link0 = (await API.myLinks([s.id]))[s.id] || ''; } catch (e) { /* يبقى فارغاً */ } if (tok !== app.token) return; }
    const editing = mode === 'edit';
    const pre = mode === 'new' ? app.prefill : null;
    app.prefill = null;
    // درس طلبه الطلاب واختار المعلم أن يسجّله (من الجوال أو بفيديو موجود على يوتيوب)
    const req = mode === 'new' && !(pre && pre.request_id) ? pendingReq() : null;
    let useReq = !!req;
    const src = s || pre || (req ? { grade: req.grade, subject: req.subject, title: req.topic || '', term: req.term, unit: req.unit } : {});
    const lastGrade = store.get('t-grade') || store.get('grade') || '';
    const grade = src.grade || lastGrade;
    let start = src.starts_at ? new Date(src.starts_at) : null;
    if (mode === 'copy' && start) { start = addDays(start, 7); while (start < new Date()) start = addDays(start, 7); }
    if (!start) { start = new Date(Date.now() + 2 * 3600e3); start.setMinutes(0, 0, 0); }
    const kind = mode === 'new' ? 'recorded' : mode === 'live' ? 'live' : src.kind || 'live';
    const rec0 = kind === 'recorded';
    const noun = rec0 ? 'الدرس' : 'الحصة';
    const dur = src.starts_at ? minutes(src) : Math.min(240, (pre && pre.minutes) || (rec0 ? 30 : 60));
    const dVal = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const tVal = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const durs = [20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
    if (!durs.includes(dur)) durs.push(dur);
    durs.sort((a, b) => a - b);
    const isPast = editing && +new Date(src.ends_at) <= Date.now();
    // مصدر الفيديو للدرس الجديد: ملف يُرسل للمنصة (الافتراضي)، أو رابط من قناة المعلم
    const presetFile = pre && pre._file ? pre._file : null;
    // درس بلا فيديو (مثل درس رُفض فحُذف ملفه): يختار المعلم من جديد ملفاً يرسله أو رابطاً
    const needVideo = editing && rec0 && !src.upload_state && !src.video_url && !src.recording_url;
    const srcPick = rec0 && (!editing || needVideo);
    let srcMode = srcPick ? (pre && pre.video_url ? 'link' : presetFile ? 'file' : store.get('t-src') === 'link' ? 'link' : 'file') : 'link';
    const upPending = editing && !!src.upload_state;
    const published = editing && rec0 && !needVideo && +new Date(src.starts_at) <= Date.now();

    // رابط الفيديو للدرس، أو رابط آخر للحصة (وإلا تنشئ المنصة رابط Jitsi)
    const linkBox = `<div class="field" id="sf-link-box"${(srcPick && srcMode !== 'link') || upPending ? ' hidden' : ''}><label for="sf-url" id="lbl-url">رابط البث على يوتيوب</label>
          <input class="input" id="sf-url" type="url" inputmode="url" maxlength="300" value="${esc(kind === 'live' ? (link0 && !/jit\.si/i.test(link0) ? link0 : '') || (mode === 'copy' ? '' : src.video_url || '') : (src.video_url || ''))}" placeholder="${kind === 'live' ? 'https://meet.google.com/...' : 'https://youtu.be/...'}">
          <span class="hint" id="hint-url"></span></div>`;
    view.innerHTML = `
      <header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>${editing ? 'تعديل' : mode === 'copy' ? 'نسخ حصة' : mode === 'live' ? 'حصة مباشرة' : 'درس جديد'}</span></nav>
        <h1>${editing ? 'تعديل ' + noun : mode === 'copy' ? 'نسخ الحصة إلى موعد جديد' : mode === 'live' ? 'حصة مباشرة جديدة' : 'درس جديد'}</h1>

        ${mode === 'new' ? (pre && pre.video_url ? '<p class="note">رابط الفيديو جاهز من الاستوديو. راجع بيانات الدرس ثم انشره.</p>'
          : presetFile ? '<p class="note">الفيديو جاهز من الاستوديو. أكمل بيانات الدرس ثم أرسله.</p>'
          : '') : ''}
        ${req ? `<div class="note" id="sf-req"><b>تنشر درساً طلبه الطلاب</b><span>${esc([req.topic, req.unit ? 'الوحدة ' + fNum(req.unit) : ''].filter(Boolean).join(' · '))} — ${esc(gradeName(req.grade))} · ${esc(subjectName(req.subject))}</span>
          <span class="small">عند نشره يرى الطلاب أن طلبهم صار متاحاً. <button type="button" class="btn btn-ghost btn-sm" id="sf-req-x">إلغاء الربط بالطلب</button></span></div>` : ''}</header>
      <form class="form" id="sf" novalidate>
        ${srcPick && !presetFile && !(pre && pre.video_url) ? `<fieldset class="src-pick"><legend>من أين الفيديو؟</legend>
          <label class="src-opt"><input type="radio" name="sf-src" value="file"${srcMode === 'file' ? ' checked' : ''}><span><b>من جهازي</b>
            <small>ننشره على قناة المنصة باسمك</small></span></label>
          <label class="src-opt"><input type="radio" name="sf-src" value="link"${srcMode === 'link' ? ' checked' : ''}><span><b>رابط من قناتي في يوتيوب</b>
            <small>فيديو «عام» أو «غير مدرج» على قناتك</small></span></label></fieldset>` : ''}
        ${upPending ? `<div class="note"><b>أرسلت فيديو هذا الدرس للإدارة</b><span>${src.upload_state === 'waiting' ? 'تنشره على قناة مدرار العلم قريباً. يمكنك تعديل بياناته وموعده هنا.' : `لم يكتمل الإرسال. <a href="#/dashboard/resume/${esc(src.id)}">أكمل الإرسال</a>`}</span></div>` : ''}
        <div class="grid2">
          <div class="field"><label for="sf-grade">الصف</label>
            <select class="input" id="sf-grade" required><option value="">اختر الصف</option>
              ${C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.id)}"${g.id === grade ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}
              ${SKILLS.length ? `<optgroup label="خارج المنهج"><option value="skills"${grade === 'skills' ? ' selected' : ''}>المهارات (ذكاء اصطناعي، تصميم، برمجة…)</option></optgroup>` : ''}
            </select></div>
          <div class="field"><label for="sf-subj">المادة</label><select class="input" id="sf-subj" required></select></div>
        </div>
        <div class="field"><label for="sf-title">عنوان ${noun}</label>
          <input class="input" id="sf-title" required minlength="3" maxlength="120" value="${esc(src.title || '')}" placeholder="مثال: حل المعادلات من الدرجة الثانية"></div>
        ${rec0 ? '' : `<div class="grid3">
          <div class="field"><label for="sf-date" id="lbl-date">التاريخ</label><input class="input" id="sf-date" type="date" required value="${dVal}"></div>
          <div class="field"><label for="sf-time" id="lbl-time">الساعة</label><input class="input" id="sf-time" type="time" required value="${tVal}" step="300"></div>
          <div class="field"><label for="sf-dur" id="lbl-dur">المدة</label><select class="input" id="sf-dur">${durs.map((m) => `<option value="${m}"${m === dur ? ' selected' : ''}>${fNum(m)} دقيقة</option>`).join('')}</select></div>
        </div>`}
        ${srcPick ? `<div id="sf-file-box"${srcMode === 'file' ? '' : ' hidden'}>
          ${presetFile ? `<div class="note"><b>الفيديو جاهز من الاستوديو</b><span>${esc(mbs(presetFile.size))}${pre.minutes ? ' · ' + esc(minsTxt(pre.minutes)) : ''}</span></div>`
            : `<div class="field"><label for="sf-file">ملف الفيديو</label><input class="input" id="sf-file" type="file" accept="video/*">
              <span class="hint" id="sf-file-info">حتى 500 ميغابايت</span></div>`}
          ${consentHtml('sf-consent')}</div>` : ''}
        ${rec0 ? linkBox : ''}
        <details class="more extra"${editing ? ' open' : ''}><summary>خيارات إضافية</summary>
        ${rec0 ? '' : linkBox}
        ${rec0 ? placeHtml() : ''}
        <div class="field"><label for="sf-desc">وصف ${noun}</label>
          <textarea class="input" id="sf-desc" maxlength="1500" rows="2" placeholder="ماذا سيتعلم الطالب؟">${esc(src.description || '')}</textarea></div>
        ${rec0 ? quizEditorHtml(src.quiz) + filesEditorHtml(src.attachments) : ''}
        ${rec0 ? `${whenHtml('sf', editing && +new Date(src.starts_at) > Date.now() ? new Date(src.starts_at) : null, published)}
        <div class="field" style="max-width:320px"><label for="sf-dur" id="lbl-dur">طول الفيديو تقريباً</label><select class="input" id="sf-dur">${durs.map((m) => `<option value="${m}"${m === dur ? ' selected' : ''}>${fNum(m)} دقيقة</option>`).join('')}</select></div>` : ''}
        ${editing || rec0 ? '' : `<div class="field" id="rep-field"><label for="sf-rep">التكرار</label>
          <select class="input" id="sf-rep"><option value="1">مرة واحدة</option>${[2, 3, 4, 6, 8, 10, 12, 16].map((n) => `<option value="${n}">${n === 2 ? 'كل أسبوع لمدة أسبوعين' : `كل أسبوع لمدة ${fNum(n)} ${n <= 10 ? 'أسابيع' : 'أسبوعاً'}`}</option>`).join('')}</select></div>`}
        <div class="field" id="rec-field"${editing || isPast ? '' : ' hidden'}><label for="sf-rec">رابط التسجيل على يوتيوب</label>
          <input class="input" id="sf-rec" type="url" inputmode="url" maxlength="300" value="${esc(src.recording_url || '')}" placeholder="https://youtu.be/..."></div>
        </details>
        <div id="peers"></div>
        <div id="sf-prog" hidden></div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" id="sf-go">${srcPick && srcMode === 'file' ? 'أرسل الدرس' : editing ? 'حفظ التعديلات' : rec0 ? 'نشر الدرس' : 'نشر الحصة'}</button>
          <a class="btn" href="#/dashboard">إلغاء</a>
        </div>
      </form>`;

    const gSel = $('#sf-grade');
    const sSel = $('#sf-subj');
    function fillSubjects(keep) {
      const list = gSel.value ? subjectsOf(gSel.value) : [];
      const cur = keep || sSel.value;
      sSel.innerHTML = `<option value="">${gSel.value ? 'اختر المادة' : 'اختر الصف أولاً'}</option>` + list.map((x) => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(subjectName(x))}</option>`).join('');
      if (cur && !list.includes(cur) && C.SUBJECTS[cur] && !isSkills(gSel.value) && cur === src.subject) sSel.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" selected>${esc(subjectName(cur))}</option>`);
    }
    fillSubjects(src.subject || store.get('t-subject') || '');
    const kindNow = () => kind;
    function applyKind() {
      const rec = kindNow() === 'recorded';
      if (!rec) { $('#lbl-date').textContent = 'التاريخ'; $('#lbl-time').textContent = 'وقت البدء'; $('#lbl-dur').textContent = 'المدة'; }
      $('#lbl-url').textContent = rec ? 'رابط الفيديو على يوتيوب' : 'رابط آخر للحصة (اختياري)';
      $('#hint-url').innerHTML = rec ? '' : 'تنشئ المنصة رابط الحصة تلقائياً. ضع هنا رابط Google Meet أو Zoom فقط إن أردت استخدامه بدلاً منه.';
      const rf = $('#rep-field'); if (rf) rf.hidden = rec;
      peers();
    }
    function readTimes() {
      if (!$('#sf-date')) return null;
      const d = $('#sf-date').value; const t = $('#sf-time').value;
      if (!d || !t) return null;
      const st = new Date(`${d}T${t}`);
      if (isNaN(st)) return null;
      return { start: st, end: new Date(+st + Number($('#sf-dur').value) * MIN) };
    }
    let peerTimer;
    function peers() {
      clearTimeout(peerTimer);
      peerTimer = setTimeout(async () => {
        const box = $('#peers');
        if (!box) return;
        const tm = readTimes();
        if (!tm || !gSel.value || kindNow() !== 'live') { box.innerHTML = ''; return; }
        try {
          const others = (await API.listOverlapping(gSel.value, tm.start, tm.end, editing ? id : null)).filter((x) => x.teacher_id !== app.user.id);
          if (!$('#peers')) return;
          box.innerHTML = others.length ? `<div class="note"><b>في نفس الوقت ${others.length === 1 ? 'يشرح معلم آخر' : others.length === 2 ? 'يشرح معلمان آخران' : `يشرح ${plural(others.length, '', '', 'معلمين آخرين', 'معلماً آخر')}`} لهذا الصف:</b>
            <span>${others.map((o) => `${esc((o.teacher && o.teacher.display_name) || '')} (${esc(subjectName(o.subject))})`).join('، ')}</span>
            <span class="muted small">لا مشكلة في ذلك، فالطالب يختار المعلم الذي يناسبه.</span></div>` : '';
        } catch (e) { box.innerHTML = ''; }
      }, 350);
    }
    gSel.addEventListener('change', () => { fillSubjects(); peers(); });
    ['#sf-date', '#sf-time', '#sf-dur'].forEach((s2) => { const e = $(s2); if (e) e.addEventListener('change', peers); });
    // موعد العرض، ومصدر الفيديو، وطول الفيديو من الملف
    const whenCtl = rec0 ? bindWhen('sf', () => srcPick && srcMode === 'file') : null;
    const setDur = (m) => {
      const d = $('#sf-dur');
      const v = Math.min(240, Math.max(1, m));
      if (!Array.from(d.options).some((o) => +o.value === v)) d.insertAdjacentHTML('beforeend', `<option value="${v}">${fNum(v)} دقيقة</option>`);
      d.value = String(v);
    };
    const setSrc = (m) => {
      srcMode = m;
      const fb = $('#sf-file-box'); if (fb) fb.hidden = m !== 'file';
      $('#sf-link-box').hidden = m !== 'link' || upPending;
      $('#sf-go').textContent = m === 'file' ? 'أرسل الدرس' : editing ? 'حفظ التعديلات' : 'نشر الدرس';
      if (whenCtl) whenCtl.paint();
    };
    $$('input[name=sf-src]').forEach((r) => r.addEventListener('change', () => setSrc(r.value)));
    if (presetFile && pre.minutes) setDur(pre.minutes);
    const fileIn = $('#sf-file');
    if (fileIn) fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0];
      const info = $('#sf-file-info');
      fileIn.removeAttribute('aria-invalid');
      if (!f) { info.textContent = 'حتى 500 ميغابايت.'; return; }
      if (f.size > API.uploadLimit) { fileIn.setAttribute('aria-invalid', 'true'); info.innerHTML = `<span class="warn-t">حجم الملف ${esc(mbs(f.size))}، والحد 500 ميغابايت. صوّره بدقة 720p أو قسّمه إلى جزأين، أو سجّله في استوديو المنصة.</span>`; return; }
      info.textContent = `${f.name} · ${mbs(f.size)}`;
      const m = await videoMinutes(f);
      if (m && fileIn.files[0] === f) { setDur(m); info.textContent += ` · ${minsTxt(m)}`; }
    });
    $$('input[name=kind]').forEach((r) => r.addEventListener('change', applyKind));
    applyKind();
    const place = rec0 ? bindPlace(gSel, sSel, $('#sf-title'), src) : null;
    if (rec0) bindQuizEditor();
    const rx = $('#sf-req-x');
    if (rx) rx.addEventListener('click', () => { useReq = false; store.del('st-req'); $('#sf-req').remove(); });

    $('#sf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $$('#sf [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      const bad = (sel, msg) => { const el = $(sel); el.setAttribute('aria-invalid', 'true'); el.focus(); toast(msg, true); return false; };
      const k = kindNow();
      const fail = (x) => { x.el.setAttribute('aria-invalid', 'true'); const d = x.el.closest('details'); if (d) d.open = true; x.el.focus(); toast(x.msg, true); return false; };
      const title = $('#sf-title').value.trim();
      const viaLink = !upPending && (!srcPick || srcMode === 'link');
      const url = viaLink ? normYt($('#sf-url').value.trim()) : '';
      const recUrl = $('#sf-rec') ? normYt($('#sf-rec').value.trim()) : '';
      if (!gSel.value) return bad('#sf-grade', 'اختر الصف.');
      if (!sSel.value) return bad('#sf-subj', 'اختر المادة.');
      if (title.length < 3) return bad('#sf-title', `اكتب عنواناً ${rec0 ? 'للدرس' : 'للحصة'} (3 أحرف على الأقل).`);
      let tm;
      if (rec0) {
        const w = whenCtl.read(published ? new Date(src.starts_at) : null);
        if (w.el) return fail(w);
        tm = { start: w.start, end: new Date(+w.start + Number($('#sf-dur').value) * MIN), at: w.at };
      } else {
        tm = readTimes();
        if (!tm) return bad('#sf-date', 'حدّد التاريخ والوقت.');
      }
      // الحصة المباشرة: رابط Meet (أو بث يوتيوب كما في السابق)
      const meet = k === 'live' && url && isMeet(url) ? url : '';
      if (k === 'live' && url && !meet && !(isYouTube(url) && url === src.video_url)) return bad('#sf-url', 'الصق رابط حصة Google Meet، مثل https://meet.google.com/...');
      if (k !== 'live' && url && !isYouTube(url)) return bad('#sf-url', 'الرابط يجب أن يكون من يوتيوب (youtube.com أو youtu.be).');
      if (recUrl && !isYouTube(recUrl)) return bad('#sf-rec', 'رابط التسجيل يجب أن يكون من يوتيوب.');
      if (k === 'recorded' && viaLink && !url) return bad('#sf-url', 'ضع رابط الفيديو المسجّل.');
      if (k === 'live' && !editing && +tm.start < Date.now() - 30 * MIN) return bad('#sf-date', 'هذا الموعد في الماضي. اختر وقتاً قادماً.');
      let file = null;
      if (srcPick && srcMode === 'file') {
        file = presetFile || ((fileIn && fileIn.files) || [])[0] || null;
        if (!file) return bad('#sf-file', 'اختر ملف الفيديو من جهازك.');
        if (file.size > API.uploadLimit) return bad(fileIn ? '#sf-file' : '#sf-title', 'حجم الفيديو أكبر من 500 ميغابايت. صوّره بدقة 720p أو قسّمه إلى جزأين.');
      }
      const base = {
        grade: gSel.value, subject: sSel.value, title, description: $('#sf-desc').value.trim() || null, kind: k,
        starts_at: tm.start.toISOString(), ends_at: tm.end.toISOString(), video_url: meet ? null : url || null,
      };
      if (upPending) delete base.video_url;
      if (editing) base.recording_url = recUrl || null;
      const pc = place && place.check(); if (pc) return fail(pc);
      if (place) Object.assign(base, place.read());
      if (rec0) {
        const qz = readQuiz(); if (qz.el) return fail(qz);
        const fl = readFiles(); if (fl.el) return fail(fl);
        base.quiz = qz.quiz; base.attachments = fl.files;
      }
      if (!editing && pre && pre.request_id) base.request_id = pre.request_id;
      else if (!editing && useReq && req.grade === base.grade && req.subject === base.subject) base.request_id = req.id;
      const btn = $('#sf button[type=submit]'); btn.disabled = true;
      store.set('t-grade', gSel.value); store.set('t-subject', sSel.value);
      if (place && !editing) place.remember();
      if (file) {
        // الإرسال للمنصة: الدرس يُنشأ ثم تُرفع أجزاء الفيديو، وإن انقطع نكمل بالضغط مرة أخرى
        const key = pre && pre._rec ? 'up-rec-' + pre._rec.id : 'up-file-' + [file.name, file.size, file.lastModified].join('|');
        const box = $('#sf-prog');
        try {
          await sendLesson(base, file, box, key, editing ? id : null);
          store.set('t-src', 'file');
          if (base.request_id && req) store.del('st-req');
          if (pre && pre._rec && ST) { if (pre._rec.saved) ST.remove(pre._rec.id).catch(() => {}); else ST.discard(); }
          sentDone(tok, base.title, tm.at ? base.starts_at : null);
        } catch (e) {
          sentFailed(tok, box, e, key);
          btn.disabled = false;
        }
        return;
      }
      if (srcPick) store.set('t-src', 'link');
      try {
        if (editing) {
          await API.updateSession(id, base);
          if (k === 'live' && !base.video_url) {
            const want = meet || (link0 && /jit\.si/i.test(link0) ? link0 : newRoom());
            if (want !== link0) await saveLink(id, want);
          }
          toast('حُفظت التعديلات');
          location.hash = '#/dashboard';
        } else {
          const n = k === 'live' && $('#sf-rep') ? Number($('#sf-rep').value) : 1;
          const rows = Array.from({ length: n }, (_, i) => Object.assign({}, base, {
            starts_at: addDays(tm.start, 7 * i).toISOString(), ends_at: addDays(tm.end, 7 * i).toISOString(),
            video_url: i === 0 ? base.video_url : null,
          }));
          const made = await API.createSessions(rows);
          if (k === 'live' && !base.video_url) for (const m of made || []) await saveLink(m.id, meet || newRoom());
          if (base.request_id && req) store.del('st-req');
          // التسجيل نُشر: لا حاجة لنسخته في المتصفح، ولا لتنبيه «تسجيل لم يُنشر»
          if (pre && pre._rec && ST) { if (pre._rec.saved) ST.remove(pre._rec.id).catch(() => {}); else ST.discard(); }
          toast(n > 1 ? 'نُشرت ' + plural(n, 'حصة واحدة', 'حصتان أسبوعيتان', 'حصص أسبوعية', 'حصة أسبوعية') : k === 'recorded' ? publishedMsg() : 'نُشرت الحصة، وتظهر في جدول الصف');
          location.hash = made && made[0] && n === 1 ? '#/s/' + made[0].id : '#/dashboard';
        }
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }

  // ------------------------------------------------------------------
  //  «تطوّع بالشرح»: طريق قصير للمعلم المتردد، ينتهي برسالة واتساب للإدارة
  //  (لا تحفظ المنصة أي بيانات تواصل)
  // ------------------------------------------------------------------
  const waLink = (text) => (C.WHATSAPP ? `https://wa.me/${String(C.WHATSAPP).replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : '');
  function pageTeach() {
    setNav(''); setTitle('تطوّع بالشرح');
    const gradeOpts = C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('')}</optgroup>`).join('');
    view.innerHTML = `
      <header class="page-head teach-head"><h1>تطوّع بالشرح</h1></header>
      <figure class="hadith">
        <blockquote>«إذا مات ابنُ آدمَ انقطع عملُه إلا من ثلاث: صدقةٍ جارية، أو <mark>علمٍ يُنتفَعُ به</mark>، أو ولدٍ صالحٍ يدعو له»</blockquote>
        <figcaption>رواه مسلم</figcaption>
      </figure>
      <ol class="steps3 teach-steps">
        <li><b>حدّد موعد حصتك</b><span class="muted">والمنصة تنشئ الرابط.</span></li>
        <li><b>اشرح لطلابك مباشرة</b><span class="muted">يدخلون من المنصة.</span></li>
        <li><b>أرسل التسجيل</b><span class="muted">ننشره باسمك على قناة المنصة.</span></li>
      </ol>
      <form class="form box" id="tf" novalidate>
        <h2>أرغب في التطوع</h2>
        <div class="grid2">
          <div class="field"><label for="tf-name">الاسم</label><input class="input" id="tf-name" maxlength="60" autocomplete="name" placeholder="مثال: أ. سالم الهنائي"></div>
          <div class="field"><label for="tf-subj">المادة أو التخصص</label><input class="input" id="tf-subj" maxlength="60" placeholder="مثال: رياضيات، أو تصميم جرافيكي"></div>
        </div>
        <div class="field"><label for="tf-grade">الصف (اختياري)</label><select class="input" id="tf-grade"><option value="">أكثر من صف أو غير محدد</option>${gradeOpts}<option value="المهارات">المهارات (خارج المنهج)</option></select></div>
        <div class="field"><label for="tf-note">ملاحظة (اختياري)</label><textarea class="input" id="tf-note" maxlength="200" rows="2" placeholder="مثال: عندي درس جاهز عن الكسور"></textarea></div>
        <div class="form-actions"><button class="btn btn-primary btn-lg wa-btn" type="submit">أرسل عبر واتساب</button>
          <a class="btn" href="#/dashboard">ادخل وابدأ الآن</a></div>
        <p class="hint">يفتح واتساب برسالة جاهزة إلى الإدارة.</p>
      </form>
      <section class="box" id="tf-next" hidden>
        <h2>شكراً لك! هذه خطواتك التالية</h2>
        <ol class="prose-list">
          <li>ادخل المنصة بحساب Google واضغط «حصة مباشرة جديدة».</li>
          <li>أو سجّل درساً قصيراً وأرسله من المنصة.</li>
          <li>صعب عليك؟ أرسل الفيديو لنا على واتساب وننشره نحن.</li>
        </ol>
      </section>
      <p class="muted small"><a href="#/guide">دليل المعلم</a> · <a href="#/about">ميثاق المتطوع</a></p>`;
    $('#tf').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = $('#tf-name').value.trim(); const subj = $('#tf-subj').value.trim();
      if (name.length < 2) { $('#tf-name').setAttribute('aria-invalid', 'true'); $('#tf-name').focus(); return toast('اكتب اسمك.', true); }
      if (subj.length < 2) { $('#tf-subj').setAttribute('aria-invalid', 'true'); $('#tf-subj').focus(); return toast('اكتب مادتك أو تخصصك.', true); }
      const grade = $('#tf-grade').value; const note = $('#tf-note').value.trim();
      const text = [`السلام عليكم، أنا ${name}، وأرغب في التطوع بالشرح في ${C.SITE_NAME}.`, `المادة أو التخصص: ${subj}`, grade ? `الصف: ${grade}` : '', note ? `ملاحظة: ${note}` : ''].filter(Boolean).join('\n');
      const url = waLink(text);
      if (!url) return toast('لم تُضبط وسيلة التواصل بعد. ادخل المنصة وانشر درسك مباشرة.', true);
      const w = window.open(url, '_blank', 'noopener');
      if (!w) location.href = url;
      $('#tf-next').hidden = false;
      $('#tf-next').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ------------------------------------------------------------------
  //  «أدوات للمعلم والطالب»: روابط لأدوات تفاعلية يضيفها المشرف من الإدارة
  // ------------------------------------------------------------------
  let toolsP = null;
  const getTools = () => (toolsP || (toolsP = API.listTools().catch((e) => { toolsP = null; throw e; })));
  const TOOL_URL = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]+)?(\/[^\s<>"]*)?$/;
  const toolTags = (t) => [t.grade ? gradeName(t.grade) : 'لكل الصفوف', t.subject ? subjectName(t.subject) : ''].filter(Boolean);
  const toolHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const toolCard = (t) => (TOOL_URL.test(t.url || '') ? `<a class="tool-card" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">
      <b>${esc(t.title)}</b>${t.description ? `<span class="muted small">${esc(t.description)}</span>` : ''}
      <span class="tool-tags">${toolTags(t).map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</span>
      <span class="tool-open">افتح الأداة <span aria-hidden="true">↗</span><span class="sr-only"> (تفتح في نافذة جديدة)</span> <span class="muted small">${esc(toolHost(t.url))}</span></span></a>` : '');
  // الأدوات التي تخص صفاً ومادة: أداة المادة لكل الصفوف، أو أداة هذا الصف تحديداً
  const toolsFor = (list, gradeId, subject) => list.filter((t) => (t.subject ? t.subject === subject : true) && (t.grade ? t.grade === gradeId : !!t.subject));
  async function pageTools(tok) {
    setNav('tools'); setTitle('أدوات للمعلم والطالب');
    view.innerHTML = `<header class="page-head"><h1>أدوات للمعلم والطالب</h1>
      <p class="muted">للطالب: افتح الأداة وجرّب بنفسك. للمعلم: افتحها أثناء حصتك وشارك شاشتك.</p></header>
      <div id="tools-box"><p class="loading">جارٍ التحميل…</p></div>`;
    let list;
    try { list = await getTools(); } catch (e) { if (tok === app.token) $('#tools-box').innerHTML = errorBox(e); return; }
    if (tok !== app.token) return;
    const subs = Array.from(new Set(list.map((t) => t.subject || ''))).filter(Boolean);
    let cur = '';
    const draw = () => {
      const rows = list.filter((t) => !cur || t.subject === cur);
      $('#tools-box').innerHTML = !list.length ? '<div class="empty"><b>تُضاف الأدوات هنا قريباً</b><span>تابعنا، أو اقترح أداة مفيدة على إدارة المنصة.</span></div>'
        : `${subs.length > 1 ? `<div class="filters" role="group" aria-label="المادة"><button type="button" class="chip" data-ts="" aria-pressed="${!cur}">الكل</button>
            ${subs.map((x) => `<button type="button" class="chip" data-ts="${esc(x)}" aria-pressed="${cur === x}">${esc(subjectName(x))}</button>`).join('')}</div>` : ''}
          <div class="tool-grid">${rows.map(toolCard).join('')}</div>`;
      $$('[data-ts]').forEach((b) => b.addEventListener('click', () => { cur = b.getAttribute('data-ts'); draw(); const f = $(`[data-ts="${cur}"]`); if (f) f.focus(); }));
    };
    draw();
  }

  // ------------------------------------------------------------------
  //  مساعد المنصة: يجيب عن أسئلة المنصة فقط من إجابات مكتوبة مسبقاً،
  //  بلا ذكاء اصطناعي خارجي ولا إرسال لأي نص إلى خادم
  // ------------------------------------------------------------------
  const nrm = (t) => String(t || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\w؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const FAQ = [
    { k: ['ما هي المنصه', 'ماهي المنصه', 'عن المنصه', 'فكره المنصه', 'ما هي مدرار', 'وش المنصه', 'ايش المنصه'], q: 'ما هي منصة مِدْرار العلم؟',
      a: `${esc(C.SITE_NAME)} منصة تعليمية مجانية وتطوعية: حصص مباشرة يحضرها الطلاب في موعدها، ثم تُنشر تسجيلاتها، ودروس مسجّلة، يقدّمها معلمون متطوعون للطلاب من الصف الأول إلى الثاني عشر، وفيها قسم للمهارات. بلا رسوم وبلا إعلانات.`, l: [['#/about', 'عن المنصة']] },
    { k: ['مجاني', 'مجانا', 'رسوم', 'فلوس', 'سعر', 'اشتراك', 'كم', 'بفلوس', 'مدفوع'], q: 'هل المنصة مجانية؟',
      a: 'نعم، مجانية بالكامل للطلاب والمعلمين، بلا اشتراك وبلا إعلانات.' },
    { k: ['تطوع', 'اتطوع', 'متطوع', 'انضم', 'انضمام', 'اشارك', 'مشاركه', 'اسجل كمعلم', 'معلم جديد', 'ابي اشرح', 'ابغى اشرح', 'اشرح'], q: 'كيف أتطوع بالشرح؟',
      a: 'ادخل بحساب Google، ثم من «لوحتي» اضغط «حصة مباشرة جديدة»، واكتب الموعد، والمنصة تنشئ رابط الحصة. وبعد الحصة ارفع تسجيلها فننشره باسمك. أو املأ نموذج «تطوّع بالشرح» فنتواصل معك عبر واتساب.', l: [['#/teach', 'تطوّع بالشرح'], ['#/volunteer', 'تفاصيل التطوع']] },
    { k: ['اسجل الدرس', 'تسجيل', 'اصور', 'تصوير', 'استوديو', 'سجل الشاشه', 'برنامج', 'كاميرا', 'مايك', 'صوت'], q: 'كيف أسجّل درسي؟',
      a: 'من «استوديو المنصة» تسجّل شاشتك وصوتك من المتصفح بلا برامج وبلا كاميرا، أو صوّر بجوالك. الصوت الواضح أهم من الصورة.', l: [['#/studio', 'استوديو المنصة'], ['#/guide', 'دليل المعلم']] },
    { k: ['يوتيوب', 'قناه', 'قناتي', 'ارفع', 'رفع', 'احتاج قناه', 'ما عندي قناه', 'غير مدرج'], q: 'هل أحتاج قناة على يوتيوب؟',
      a: 'لا. بعد التسجيل اضغط «أرسل الدرس»، أو من «لوحتي» ← «أضف درساً جاهزاً» ← «من جهازي»، فننشره على قناة «مدرار العلم» في يوتيوب باسمك. ومن يفضّل قناته الخاصة يلصق رابط الفيديو بدلاً من ذلك.', l: [['#/guide', 'دليل المعلم']] },
    { k: ['الرابط', 'الصق', 'انشر', 'نشر', 'اضيف درس', 'اضافه درس'], q: 'كيف أنشر الدرس في المنصة؟',
      a: 'ادخل بحساب Google، ثم من «لوحتي» اضغط «سجّل درساً جديداً» أو «أضف درساً جاهزاً»، واختر الصف والمادة والوحدة، ثم «أرسل الدرس». تراجعه الإدارة وتنشره على قناة المنصة باسمك.', l: [['#/dashboard', 'لوحتي']] },
    { k: ['مراجعه', 'قيد المراجعه', 'يظهر', 'ما ظهر', 'اعتماد', 'معتمد', 'موافقه'], q: 'لماذا درسي «قيد المراجعة»؟',
      a: `تراجع الإدارة أول ${fNum(C.TRUST_AFTER || 3)} دروس لكل متطوع جديد قبل ظهورها للطلاب، حمايةً لهم. بعد اعتمادها تُنشر دروسك مباشرة.` },
    { k: ['دعوه', 'رابط دعوه', 'ترشيح', 'رشح', 'زميل', 'مدرستي'], q: 'ما رابط الدعوة والترشيح؟',
      a: 'رابط الدعوة تنشئه الإدارة لمدرسة أو جهة موثوقة، ومن يسجّل عبره يُعتمد مباشرة. ورابط الترشيح ينشئه المعلم الموثوق لزملائه من «لوحتي».' },
    { k: ['شهاده', 'شكر', 'تقدير'], q: 'هل يحصل المتطوع على شهادة؟',
      a: 'نعم، تصدر المنصة شهادة شكر وتقدير برمز تحقق عند بلوغ 5 و10 و25 و50 و100 من الدروس، وتظهر في «لوحتي».' },
    { k: ['طالب', 'ابحث عن درس', 'دروس صفي', 'الصف', 'ماده', 'اذاكر', 'اشوف الدروس', 'وين الدروس'], q: 'أنا طالب، كيف أجد دروسي؟',
      a: 'من الصفحة الرئيسية اختر صفّك ثم المادة، فتظهر الدروس مرتبة كما في كتابك المدرسي. لا تحتاج إلى حساب.', l: [['#/', 'الدروس']] },
    { k: ['اطلب', 'طلب درس', 'ما لقيت', 'ما وجدت', 'غير موجود'], q: 'لم أجد الدرس الذي أحتاجه',
      a: 'في صفحة المادة اضغط «اطلب درساً» واكتب موضوعه، فيظهر طلبك للمعلمين المتطوعين في تلك المادة، دون اسمك.' },
    { k: ['امان', 'حمايه', 'ولي امر', 'اولياء', 'ابني', 'بنتي', 'تواصل خاص'], q: 'هل المنصة آمنة للطلاب؟',
      a: 'نعم: لا تواصل خاص داخل المنصة، ولا حسابات للطلاب، وتراجع الإدارة دروس المتطوعين الجدد، ويمكن الإبلاغ عن أي درس بزر «الإبلاغ عن مشكلة».', l: [['#/parents', 'لأولياء الأمور']] },
    { k: ['خصوصيه', 'بياناتي', 'ايميل', 'بريد', 'رقم', 'جوال'], q: 'ماذا تحفظ المنصة عني؟',
      a: 'لا تحفظ المنصة شيئاً عن الطلاب. وللمعلم: اسمه وقناته وتخصصه فقط، ولا يظهر بريده للعامة.', l: [['#/about', 'الميثاق والخصوصية']] },
    { k: ['مهارات', 'ذكاء اصطناعي', 'تصميم', 'برمجه', 'خط عربي', 'مونتاج'], q: 'ما قسم المهارات؟',
      a: 'دورات خارج المنهج يقدّمها متخصصون متطوعون، مثل الذكاء الاصطناعي والتصميم والبرمجة والخط العربي، مقسّمة إلى أجزاء ومستويات.', l: [['#/k', 'المهارات']] },
    { k: ['ادوات', 'اداه', 'محاكاه', 'مختبر', 'تفاعلي', 'فيزياء', 'كيمياء'], q: 'ما قسم الأدوات؟',
      a: 'أدوات ومحاكاة تفاعلية مجانية، مثل مختبر الفيزياء والكيمياء التفاعلية، تساعد الطالب على الفهم والمعلم على الشرح.', l: [['#/tools', 'أدوات للمعلم والطالب']] },
    { k: ['مسار', 'مسارات'], q: 'ما المسارات؟',
      a: 'مسار يجهزه معلم موثوق: دروس مختارة بالترتيب لهدف واحد، مثل الاستعداد لاختبار، ويرى الطالب تقدّمه فيه.' },
    { k: ['بلاغ', 'ابلغ', 'مشكله', 'خطا', 'غلط', 'لا يعمل', 'ما يشتغل'], q: 'وجدت مشكلة في درس',
      a: 'افتح الدرس واضغط «الإبلاغ عن مشكلة»، فيصل بلاغك إلى الإدارة.' },
    { k: ['تواصل', 'اتواصل', 'الاداره', 'واتساب', 'رقم الاداره', 'مسؤول'], q: 'كيف أتواصل مع الإدارة؟',
      a: 'إن كنت معلماً تريد التطوع فاستخدم نموذج «تطوّع بالشرح»، فيفتح واتساب برسالة جاهزة إلى الإدارة.', l: [['#/teach', 'تطوّع بالشرح']] },
  ];
  FAQ.push(
    { k: ['اسجل حصتي', 'تسجيل الحصه', 'سجل الحصه', 'اسجل الحصه', 'ابدا الحصه', 'ابدأ الحصه'], q: 'كيف أسجّل حصتي المباشرة؟',
      a: 'في «لوحتي» اضغط «ابدأ الحصة»: يبدأ التسجيل، ثم افتح الحصة وادخل بحساب Google واشرح. بعد الحصة اضغط «إنهاء الحصة» ثم «أرسل التسجيل».', l: [['#/dashboard', 'لوحتي']] },
    { k: ['ادوات المنصه', 'استخدم الادوات', 'كيف استخدم', 'المحاكاه', 'المختبر'], q: 'كيف أستخدم أدوات المنصة؟',
      a: 'من «الأدوات» في أعلى الصفحة. الطالب يفتح الأداة ويجرّب بنفسه، والمعلم يفتحها أثناء حصته ويشارك شاشته في الحصة.', l: [['#/tools', 'الأدوات']] },
    { k: ['حصه مباشره', 'مباشره', 'مباشر', 'meet', 'ميت', 'جوجل ميت', 'zoom', 'زوم', 'teams', 'تيمز', 'رابط الحصه', 'اونلاين', 'بث مباشر'], q: 'كيف أقدّم حصة مباشرة؟',
      a: 'من «لوحتي» اضغط «حصة مباشرة جديدة»، واختر الصف والمادة والعنوان واليوم والساعة، والمنصة تنشئ رابط الحصة. تظهر في جدول الصف، ورابطها يراه الطلاب وقت الحصة فقط. وفي الموعد اضغط «ابدأ الحصة».', l: [['#/dashboard/live', 'حصة مباشرة جديدة'], ['#/guide', 'دليل المعلم']] },
    { k: ['ادخل الحصه', 'دخول الحصه', 'رابط الدخول', 'احضر', 'حضور', 'كيف ادخل', 'وين الرابط'], q: 'كيف أدخل الحصة المباشرة؟',
      a: 'افتح الحصة من جدول صفك أو «مباشر الآن». قبل موعدها بربع ساعة يظهر زر «ادخل الحصة»، فتُفتح الحصة. ادخل باسمك الأول فقط. وإن فاتتك فشاهد تسجيلها في الصفحة نفسها بعد نشره.', l: [['#/', 'الدروس']] },
    { k: ['موعد', 'احدد', 'وقت الدرس', 'جدوله', 'اجدول', 'عرض اول'], q: 'كيف أحدد موعداً يشاهد فيه الطلاب الدرس؟',
      a: 'عند الإرسال اختر «في موعد أحدده» واكتب اليوم والساعة. يظهر الدرس للطلاب في «الدروس القادمة» مع عدّ تنازلي وتذكير في التقويم، ويُعرض في موعده ليشاهدوه معاً. وفي «لوحتي» زر «شارك الموعد» لإرساله لطلابك عبر واتساب.', l: [['#/dashboard', 'لوحتي']] },
    { k: ['الدروس القادمه', 'متى الدرس', 'موعد الدرس', 'تذكير', 'ذكرني', 'التقويم', 'يعرض الان'], q: 'كيف أعرف موعد الدرس القادم؟',
      a: 'في الصفحة الرئيسية وصفحة كل مادة قسم «الدروس القادمة» بالمواعيد. افتح الدرس واضغط «ذكّرني» لإضافته إلى تقويمك، وفي موعده يُفتح الدرس ويظهر عليه «يُعرض الآن».', l: [['#/', 'الدروس']] },
  );
  const FAQ_START = [2, 9, 0, 11];
  function botAnswer(text) {
    const q = ' ' + nrm(text) + ' ';
    let best = null; let score = 0;
    FAQ.forEach((f) => {
      const s = f.k.reduce((n, k) => n + (q.includes(' ' + nrm(k)) ? nrm(k).length : 0), 0) + (nrm(f.q).split(' ').filter((w) => w.length > 2 && q.includes(' ' + w)).length);
      if (s > score) { score = s; best = f; }
    });
    return score >= 3 ? best : null;
  }
  function initBot() {
    if ($('#bot-btn')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <button type="button" class="bot-btn" id="bot-btn" aria-expanded="false" aria-controls="bot" aria-label="مساعد المنصة" title="مساعد المنصة"><span aria-hidden="true">؟</span></button>
      <section class="bot" id="bot" role="dialog" aria-label="مساعد المنصة" hidden>
        <header class="bot-head"><b>مساعد ${esc(C.SITE_NAME)}</b><button type="button" class="btn btn-sm btn-ghost" id="bot-x" aria-label="إغلاق">✕</button></header>
        <div class="bot-log" id="bot-log" aria-live="polite"></div>
        <form class="bot-form" id="bot-form"><label class="sr-only" for="bot-in">سؤالك</label><input class="input" id="bot-in" maxlength="200" autocomplete="off" placeholder="اكتب سؤالك عن المنصة"><button class="btn btn-primary" type="submit">أرسل</button></form>
      </section>`);
    const box = $('#bot'); const log = $('#bot-log'); const btn = $('#bot-btn');
    const say = (html, who) => { log.insertAdjacentHTML('beforeend', `<div class="bot-msg ${who === 'bot' ? 'from-bot' : 'from-me'}">${html}</div>`); log.scrollTop = log.scrollHeight; };
    const chips = (ids) => `<div class="bot-chips">${ids.map((i) => `<button type="button" class="chip" data-faq="${i}">${esc(FAQ[i].q)}</button>`).join('')}</div>`;
    const reply = (f) => say(`${f.a}${f.l ? `<div class="bot-links">${f.l.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join('')}</div>` : ''}`, 'bot');
    const ask = (text, f) => {
      say(esc(text), 'me');
      const hit = f || botAnswer(text);
      if (hit) reply(hit);
      else say(`أنا مساعد خاص بـ${esc(C.SITE_NAME)}، وأجيب عن أسئلة المنصة فقط: الدروس، والتطوع، والتسجيل، والنشر. جرّب أحد هذه الأسئلة:${chips(FAQ_START)}`, 'bot');
    };
    let opened = false;
    const toggle = (on) => {
      box.hidden = !on; btn.setAttribute('aria-expanded', String(on));
      if (on && !opened) { opened = true; say(`أهلاً بك! أنا مساعد المنصة. اسألني عن الدروس أو التطوع أو طريقة النشر.${chips(FAQ_START)}`, 'bot'); }
      if (on) $('#bot-in').focus(); else btn.focus();
    };
    btn.addEventListener('click', () => toggle(box.hidden));
    $('#bot-x').addEventListener('click', () => toggle(false));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
    log.addEventListener('click', (e) => {
      const c = e.target.closest('[data-faq]'); if (c) { const f = FAQ[Number(c.getAttribute('data-faq'))]; ask(f.q, f); return; }
      if (e.target.closest('a') && window.matchMedia('(max-width: 640px)').matches) toggle(false);
    });
    $('#bot-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#bot-in').value.trim(); if (!v) return; $('#bot-in').value = ''; ask(v); });
  }

  // ------------------------------------------------------------------
  //  لوحة الإدارة
  // ------------------------------------------------------------------
  async function pageAdmin(tok, tab) {
    setNav(''); setTitle('الإدارة');
    const p = await requireTeacher(tok, '#/admin');
    if (!p) return;
    if (!p.is_admin) { view.innerHTML = '<div class="empty" style="margin-top:24px"><b>هذه الصفحة للمشرفين فقط</b><a class="btn" href="#/dashboard">لوحتي</a></div>'; return; }
    tab = tab || 'overview';
    const tabs = [['overview', 'نظرة عامة'], ['uploads', 'الرفع على القناة'], ['review', 'المراجعة'], ['teachers', 'المعلمون'], ['requests', 'طلبات الطلاب'], ['reports', 'البلاغات'], ['tools', 'الأدوات'], ['settings', 'الإعدادات']];
    view.innerHTML = `
      <header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>الإدارة</span></nav><h1>إدارة المنصة</h1>
        <nav class="tabs">${tabs.map(([k, n]) => `<a href="#/admin/${k}"${tab === k ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
      </header><div id="adm" class="section"><p class="loading">جارٍ التحميل…</p></div>`;
    const box = $('#adm');
    try {
      if (tab === 'overview') {
        const [o, certs] = await Promise.all([API.adminOverview(), API.adminCertificates().catch(() => [])]);
        if (tok !== app.token) return;
        const tile = (num, label, href) => `<${href ? `a href="${href}"` : 'div'} class="tile"><b class="num">${fNum(Number(num) || 0)}</b><span>${label}</span></${href ? 'a' : 'div'}>`;
        box.innerHTML = `<div class="tiles">
            ${o.uploads_waiting != null ? tile(o.uploads_waiting, 'درس بانتظار الرفع على القناة', '#/admin/uploads') : ''}
            ${o.review_pending != null ? tile(o.review_pending, 'درس بانتظار المراجعة', '#/admin/review') : ''}
            ${tile(o.teachers_approved, 'معلم معتمد')}${tile(o.teachers_pending, 'معلم بانتظار الاعتماد', '#/admin/teachers')}
            ${o.teachers_trusted != null ? tile(o.teachers_trusted, 'معلم موثوق') : ''}${o.skills_lessons != null ? tile(o.skills_lessons, 'درس مهارات') : ''}${o.paths != null ? tile(o.paths, 'مسار منشور') : ''}
            ${tile(o.lessons, 'درس منشور')}${tile(o.lessons_week, 'درس هذا الأسبوع')}
            ${tile(o.views, 'مشاهدة')}${tile(o.views_week, 'مشاهدة هذا الأسبوع')}${tile(o.thanks, 'شكر من الطلاب')}
            ${tile(o.requests_open, 'طلب مفتوح', '#/admin/requests')}${tile(o.requests_done, 'طلب سُجّل')}
            ${tile(o.certificates, 'شهادة شكر')}${tile(o.reports_week, 'بلاغ هذا الأسبوع', '#/admin/reports')}</div>
          <section class="section"><h2>شهادات الشكر</h2>
          ${certs.length ? `<div class="list">${certs.map((c) => `<div class="item" style="grid-template-columns:minmax(0,1fr) auto">
            <div class="what"><b><a href="#/c/${esc(c.code)}">${esc(c.display_name)}</a></b>
              <div class="row"><span>شهادة ${lessonsN(c.level)}</span><span>·</span><span class="cert-code">${esc(certCode(c.code))}</span><span>·</span><span>${esc(fDateShort.format(new Date(c.issued_at)))}</span>${c.revoked ? '<span class="pill pill-bad">ملغاة</span>' : ''}</div></div>
            <div class="tools"><button type="button" class="btn btn-sm${c.revoked ? '' : ' btn-danger'}" data-cert="${esc(c.code)}" data-r="${c.revoked ? '0' : '1'}">${c.revoked ? 'إعادة الشهادة' : 'إلغاء الشهادة'}</button></div></div>`).join('')}</div>`
            : '<p class="muted">لم تصدر شهادات بعد. تصدر تلقائياً عندما يطلبها المعلم بعد 5 دروس.</p>'}</section>`;
        $$('[data-cert]', box).forEach((b) => {
          const act = async () => {
            try { await API.adminSetCertificate(b.getAttribute('data-cert'), b.getAttribute('data-r') === '1'); toast('تم'); route(); }
            catch (e) { toast(errMsg(e), true); }
          };
          if (b.getAttribute('data-r') === '1') armed(b, act); else b.addEventListener('click', act);
        });
      } else if (tab === 'requests') {
        const list = await API.adminRequests();
        if (tok !== app.token) return;
        const stName = { open: ['مفتوح', 'pill-warn'], done: ['سُجّل', 'pill-ok'], hidden: ['مخفي', 'pill-bad'] };
        box.innerHTML = `<p class="muted">الطلبات بلا أسماء. يظهر الطلب للمعلمين عندما يطلبه ${plural(app.settings.request_min_votes || 2, 'طالب واحد', 'طالبان', 'طلاب', 'طالباً')} على الأقل، ويُخفى تلقائياً إذا رآه معلمان غير مناسب.</p>
          ${list.length ? `<div class="list">${list.map((q) => `<div class="item" style="grid-template-columns:64px minmax(0,1fr) auto">
            <div class="when"><b class="num">${fNum(q.votes)}</b><span>طلب</span></div>
            <div class="what"><b>${esc([q.topic, q.unit ? 'الوحدة ' + fNum(q.unit) : ''].filter(Boolean).join(' · '))}</b>
              <div class="row"><span>${esc(gradeName(q.grade))}</span><span>·</span><span>${esc(subjectName(q.subject))}</span>${q.term ? `<span>·</span><span>${esc(TERMS[q.term])}</span>` : ''}
                <span class="pill ${(stName[q.status] || stName.open)[1]}">${(stName[q.status] || stName.open)[0]}</span>${q.flags ? `<span class="muted small">${plural(q.flags, 'بلاغ واحد', 'بلاغان', 'بلاغات', 'بلاغاً')} من المعلمين</span>` : ''}
                ${q.session_id ? `<a href="#/s/${esc(q.session_id)}">الدرس</a>` : ''}</div></div>
            <div class="tools">
              ${q.status === 'open' ? `<button type="button" class="btn btn-sm" data-rq="${esc(q.id)}" data-v="hidden">إخفاء</button>` : `<button type="button" class="btn btn-sm" data-rq="${esc(q.id)}" data-v="open">إعادة فتح</button>`}
              <button type="button" class="btn btn-sm btn-ghost btn-danger" data-rq="${esc(q.id)}" data-v="delete">حذف</button></div></div>`).join('')}</div>`
            : '<div class="empty"><b>لا توجد طلبات بعد</b><span>يطلب الطلاب الدروس من صفحة كل صف.</span></div>'}`;
        $$('[data-rq]', box).forEach((b) => {
          const act = async () => {
            try { await API.adminSetRequest(b.getAttribute('data-rq'), b.getAttribute('data-v')); toast('تم'); route(); }
            catch (e) { toast(errMsg(e), true); }
          };
          if (b.getAttribute('data-v') === 'delete') armed(b, act); else b.addEventListener('click', act);
        });
      } else if (tab === 'uploads') {
        // دروس أرسلها المعلمون: تنزيل، ثم رفع على قناة المنصة، ثم لصق الرابط
        const [list, teachers] = await Promise.all([API.adminUploads(), API.adminTeachers().catch(() => [])]);
        if (tok !== app.token) return;
        const now = Date.now();
        const waiting = list.filter((s) => s.upload_state === 'waiting');
        const partial = list.filter((s) => s.upload_state === 'uploading');
        const used = list.reduce((n, s) => n + (s.upload_bytes || 0), 0);
        const tName = (s) => (s.teacher && s.teacher.display_name) || '';
        const ytTitle = (s) => `${s.title} | ${subjOf(s)} — ${GRADES[s.grade] ? GRADES[s.grade].name : gradeName(s.grade)} | ${tName(s)}`.slice(0, 100);
        const tag = (t) => '#' + String(t || '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
        const ytDesc = (s) => [s.title, `${gradeName(s.grade)} — ${subjOf(s)}${placeLine(s) ? ' — ' + placeLine(s) : ''}`, `شرح: ${tName(s)}`, '',
          `شاهد الدرس وبقية دروس صفك على ${C.SITE_NAME}:`, pageUrl('#/s/' + s.id), '',
          `${C.SITE_NAME}: منصة تعليمية مجانية تطوعية بلا إعلانات.`, `${tag('مدرار العلم')} ${tag(gradeName(s.grade))} ${tag(subjOf(s))}`].join('\n');
        const whenLine = (s) => {
          const t = +new Date(s.starts_at);
          if (s.kind === 'live') return `<span class="up-when">تسجيل حصة مباشرة كانت ${esc(dayLabel(new Date(t)))} ${esc(time(t))}: يظهر في صفحة الحصة فور نشره</span>`;
          if (!isPremiere(s)) return '<span class="up-when">يُنشر للطلاب فور نشره على القناة</span>';
          if (t <= now) return `<span class="up-when late">فات موعده (${esc(dayLabel(new Date(t)))} ${esc(time(t))}): انشره الآن</span>`;
          return `<span class="up-when${t - now < DAY ? ' soon' : ''}">موعد العرض: <b>${esc(dayLabel(new Date(t)))} الساعة ${esc(time(t))}</b> (${esc(rel(t - now))})</span>`;
        };
        const item = (s) => `<div class="box up-item" data-up="${esc(s.id)}">
          <div class="up-head"><b>${esc(s.title)}</b>${s.kind === 'live' ? '<span class="pill">تسجيل حصة مباشرة</span>' : ''}${s.review === 'pending' ? '<span class="pill pill-warn">معلم جديد: شاهد الدرس قبل نشره</span>' : ''}</div>
          <div class="row small muted"><span>${esc(tName(s))}</span><span>·</span><span>${esc(gradeName(s.grade))}</span><span>·</span><span>${esc(subjOf(s))}</span>
            ${placeLine(s) ? `<span>·</span><span>${esc(placeLine(s))}</span>` : ''}<span>·</span><span>${esc(mbs(s.upload_bytes || 0))}</span></div>
          ${whenLine(s)}
          <ol class="up-steps">
            <li><button type="button" class="btn btn-sm btn-primary" data-dl>١. نزّل الفيديو</button> <span class="small" data-dlp></span></li>
            <li><span>٢. ارفعه على قناة المنصة:</span> <button type="button" class="btn btn-sm" data-ct>نسخ العنوان</button> <button type="button" class="btn btn-sm" data-cd>نسخ الوصف</button>
              <a class="btn btn-sm btn-ghost" href="https://studio.youtube.com" target="_blank" rel="noopener">افتح YouTube Studio</a></li>
            <li class="up-pub"><label class="sr-only" for="u-${esc(s.id)}">رابط الفيديو على قناة المنصة</label>
              <input class="input" id="u-${esc(s.id)}" type="url" inputmode="url" maxlength="300" placeholder="٣. الصق رابط الفيديو" data-url>
              <button type="button" class="btn btn-sm btn-primary" data-pub>انشر الدرس</button></li>
          </ol>
          <details class="more"><summary>رفض الدرس</summary><div class="row">
            <input class="input" maxlength="200" placeholder="السبب يراه المعلم، مثل: الصوت غير واضح" data-note>
            <button type="button" class="btn btn-sm btn-danger" data-rej>رفض وحذف الفيديو</button></div></details>
        </div>`;
        const tOpts = teachers.filter((t) => t.status === 'approved').sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'ar'))
          .map((t) => `<option value="${esc(t.id)}">${esc(t.display_name)}</option>`).join('');
        box.innerHTML = `<p class="muted">دروس أرسلها المعلمون للمنصة. لكل درس: نزّل الفيديو، ثم ارفعه على قناة «مدرار العلم» في يوتيوب بالعنوان والوصف الجاهزين، ثم الصق رابطه واضغط «انشر الدرس». يُنشر باسم المعلم، ويُحذف الملف من المنصة تلقائياً.</p>
          <div class="tiles"><div class="tile"><b class="num">${fNum(waiting.length)}</b><span>بانتظار الرفع</span></div>
            <div class="tile"><b class="num">${esc(mbs(used))}</b><span>من 900 ميغابايت مؤقتة</span></div></div>
          <p class="hint">في YouTube Studio: اختر قائمة تشغيل الصف والمادة، وحدّد جمهور الفيديو حسب عمر الطلاب، واختر الظهور «عام» أو «غير مدرج». وللدرس الذي له موعد يمكنك جدولته في يوتيوب للموعد نفسه.</p>
          ${waiting.length ? waiting.map(item).join('') : '<div class="empty"><b>لا دروس بانتظار الرفع</b><span>حين يرسل معلم درساً يظهر هنا، الأقرب موعداً أولاً.</span></div>'}
          ${partial.length ? `<section class="section"><h2>لم يكتمل إرسالها</h2><p class="muted small">بدأ المعلم الإرسال ولم يكمله. يستطيع إكماله من «لوحتي»، أو احذفه إن طال.</p>
            <div class="list">${partial.map((s) => `<div class="item" data-up="${esc(s.id)}" style="grid-template-columns:minmax(0,1fr) auto">
              <div class="what"><b>${esc(s.title)}</b><div class="row small"><span>${esc(tName(s))}</span><span>·</span><span>${esc(mbs(s.upload_bytes || 0))}</span><span>·</span><span>${esc(rel(new Date(s.created_at || s.starts_at) - now))}</span></div></div>
              <div class="tools"><button type="button" class="btn btn-sm btn-ghost btn-danger" data-drop>حذف</button></div></div>`).join('')}</div></section>` : ''}
          <details class="box more"><summary><b>وصلك درس على واتساب؟ انشره باسم المعلم</b></summary>
            <form class="form" id="ob" novalidate>
              <p class="muted small">ارفعه أولاً على قناة المنصة، ثم املأ هذا النموذج. المعلم غير مسجّل؟ اطلب منه الدخول مرة واحدة بحساب Google، أو انشره باسمك واذكر اسمه في الوصف.</p>
              <div class="grid2"><div class="field"><label for="ob-t">المعلم</label><select class="input" id="ob-t">${tOpts}</select></div>
                <div class="field"><label for="ob-g">الصف</label><select class="input" id="ob-g"><option value="">اختر الصف</option>${C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}<option value="skills">المهارات</option></select></div></div>
              <div class="grid2"><div class="field"><label for="ob-s">المادة</label><select class="input" id="ob-s"><option value="">اختر الصف أولاً</option></select></div>
                <div class="field"><label for="ob-title">عنوان الدرس</label><input class="input" id="ob-title" maxlength="120"></div></div>
              ${whenHtml('ob', null, false)}
              <div class="grid2"><div class="field"><label for="ob-url">رابط الفيديو على قناة المنصة</label><input class="input" id="ob-url" type="url" inputmode="url" maxlength="300" placeholder="https://youtu.be/..."></div>
                <div class="field"><label for="ob-dur">طول الفيديو (دقائق)</label><input class="input" id="ob-dur" type="number" min="1" max="240" value="20" inputmode="numeric"></div></div>
              <div class="form-actions"><button class="btn btn-primary" type="submit">انشر باسم المعلم</button></div>
            </form></details>
          <details class="box more" id="stor"><summary><b>التخزين المؤقت</b></summary>
            <p class="muted small">ملفات الدروس تُحذف تلقائياً بعد نشرها. إن بقيت ملفات لدروس حُذفت أو رُفضت، نظّفها من هنا.</p>
            <div class="row"><button type="button" class="btn btn-sm" id="stor-scan">افحص التخزين</button><span class="small" id="stor-res"></span></div></details>`;
        const byId = (id) => list.find((x) => x.id === id);
        $$('.up-item', box).forEach((el) => {
          const s = byId(el.getAttribute('data-up'));
          $('[data-ct]', el).addEventListener('click', () => copyText(ytTitle(s)));
          $('[data-cd]', el).addEventListener('click', () => copyText(ytDesc(s)));
          $('[data-dl]', el).addEventListener('click', async (ev) => {
            const b = ev.currentTarget; const p = $('[data-dlp]', el);
            b.disabled = true;
            try {
              const blob = await API.adminDownloadUpload(s, (i, n) => { p.textContent = `الجزء ${fNum(i)} من ${fNum(n)}`; });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${s.title} - ${tName(s)}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120) + '.' + (s.upload_ext || 'mp4');
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(a.href), 120000);
              p.textContent = 'نُزّل ✓';
            } catch (e) { p.textContent = ''; toast(errMsg(e), true); }
            b.disabled = false;
          });
          $('[data-pub]', el).addEventListener('click', async (ev) => {
            const b = ev.currentTarget; const inp = $('[data-url]', el);
            const url = normYt(inp.value.trim());
            inp.removeAttribute('aria-invalid');
            if (!isYouTube(url) || !ytId(url)) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); return toast('الصق رابط الفيديو من يوتيوب، مثل https://youtu.be/...', true); }
            b.disabled = true;
            try { await API.adminFinishUpload(s, url); toast('نُشر الدرس باسم المعلم'); refreshBadge(); route(); }
            catch (e) { toast(errMsg(e), true); b.disabled = false; }
          });
          $('[data-rej]', el).addEventListener('click', async (ev) => {
            const b = ev.currentTarget; const note = $('[data-note]', el).value.trim();
            if (note.length < 3) { $('[data-note]', el).focus(); return toast('اكتب سبباً قصيراً يراه المعلم.', true); }
            b.disabled = true;
            try { await API.adminRejectUpload(s, note); toast('رُفض الدرس وحُذف الفيديو'); refreshBadge(); route(); }
            catch (e) { toast(errMsg(e), true); b.disabled = false; }
          });
        });
        $$('[data-drop]', box).forEach((b) => armed(b, async () => {
          const s = byId(b.closest('[data-up]').getAttribute('data-up'));
          try { await API.deleteSession(s.id, s.teacher_id); toast('حُذف'); route(); }
          catch (e) { toast(errMsg(e), true); }
        }));
        // النشر باسم معلم
        const og = $('#ob-g'); const os = $('#ob-s');
        og.addEventListener('change', () => { os.innerHTML = `<option value="">اختر المادة</option>${(og.value ? subjectsOf(og.value) : []).map((x) => `<option value="${esc(x)}">${esc(subjectName(x))}</option>`).join('')}`; });
        const obWhen = bindWhen('ob');
        $('#ob').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const bad = (sel, msg) => { const e2 = $(sel); e2.setAttribute('aria-invalid', 'true'); e2.focus(); toast(msg, true); };
          $$('#ob [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
          const url = normYt($('#ob-url').value.trim()); const title = $('#ob-title').value.trim();
          if (!$('#ob-t').value) return bad('#ob-t', 'اختر المعلم.');
          if (!og.value) return bad('#ob-g', 'اختر الصف.');
          if (!os.value) return bad('#ob-s', 'اختر المادة.');
          if (title.length < 3) return bad('#ob-title', 'اكتب عنوان الدرس.');
          const w = obWhen.read();
          if (w.el) return bad('#' + w.el.id, w.msg);
          if (!isYouTube(url) || !ytId(url)) return bad('#ob-url', 'الصق رابط الفيديو من يوتيوب.');
          const mins = Math.min(240, Math.max(1, Number($('#ob-dur').value) || 20));
          const b = $('#ob button[type=submit]'); b.disabled = true;
          try {
            const made = await API.createSessions([{ teacher_id: $('#ob-t').value, grade: og.value, subject: os.value, title, description: null, kind: 'recorded',
              starts_at: w.start.toISOString(), ends_at: new Date(+w.start + mins * MIN).toISOString(), video_url: url }]);
            toast('نُشر الدرس باسم المعلم');
            location.hash = made && made[0] ? '#/s/' + made[0].id : '#/admin/uploads';
          } catch (e) { toast(errMsg(e), true); b.disabled = false; }
        });
        // فحص التخزين المؤقت وتنظيفه
        $('#stor-scan').addEventListener('click', async (ev) => {
          const b = ev.currentTarget; const res = $('#stor-res');
          b.disabled = true; res.textContent = 'جارٍ الفحص…';
          try {
            const st = await API.adminStorage();
            res.innerHTML = `المستخدم ${esc(mbs(st.bytes))}${st.orphans.length ? ` · ملفات بلا درس: ${esc(mbs(st.orphanBytes))} <button type="button" class="btn btn-sm btn-danger" id="stor-clean">احذفها</button>` : ' · لا ملفات زائدة ✓'}`;
            const cl = $('#stor-clean');
            if (cl) cl.addEventListener('click', async () => {
              cl.disabled = true;
              try { await API.adminCleanStorage(st.orphans); toast('حُذفت الملفات الزائدة'); res.textContent = 'نُظّف التخزين ✓'; }
              catch (e) { toast(errMsg(e), true); cl.disabled = false; }
            });
          } catch (e) { res.textContent = ''; toast(errMsg(e), true); }
          b.disabled = false;
        });
      } else if (tab === 'review') {
        const list = await API.adminReviewQueue();
        if (tok !== app.token) return;
        box.innerHTML = `<p class="muted">دروس المتطوعين الجدد وحصصهم قبل أن يراها الطلاب. شاهد الدرس، أو راجع بيانات الحصة المباشرة واعتمدها قبل موعدها، أو ارفض مع سبب قصير يراه المعلم. بعد ${fNum(C.TRUST_AFTER || 3)} دروس معتمدة يصبح المتطوع موثوقاً تلقائياً.</p>
          ${list.length ? `<div class="list">${list.map((s) => `<div class="item rv-item" data-rv="${esc(s.id)}" style="grid-template-columns:minmax(0,1fr) auto">
            <div class="what"><b><a href="#/s/${esc(s.id)}">${esc(s.title)}</a></b>
              <div class="row"><span>${esc((s.teacher && s.teacher.display_name) || '')}</span><span>·</span><span>${esc(gradeName(s.grade))}</span><span>·</span><span>${esc(subjOf(s))}</span>
                ${placeLine(s) ? `<span>·</span><span>${esc(placeLine(s))}</span>` : ''}<span>·</span><span>${esc(rel(new Date(s.created_at || s.starts_at) - Date.now()))}</span>
                ${s.quiz ? '<span class="pill">فيه اختبار</span>' : ''}${s.attachments ? '<span class="pill">فيه ملفات</span>' : ''}
                ${s.kind === 'live' ? `<span class="pill${+new Date(s.starts_at) - Date.now() < DAY ? ' pill-warn' : ''}">حصة مباشرة: ${esc(dayLabel(new Date(s.starts_at)))} ${esc(time(s.starts_at))}</span>` : ''}</div></div>
            <div class="tools"><a class="btn btn-sm" href="#/s/${esc(s.id)}">${s.kind === 'live' ? 'التفاصيل' : 'شاهد'}</a>
              <button type="button" class="btn btn-sm btn-primary" data-ok="${esc(s.id)}">اعتماد</button>
              <button type="button" class="btn btn-sm btn-danger" data-no="${esc(s.id)}">رفض</button></div></div>`).join('')}</div>`
            : '<div class="empty"><b>لا دروس بانتظار المراجعة ✓</b><span>ستظهر هنا دروس المتطوعين الجدد.</span></div>'}`;
        const done = (id, msg) => { const it = $(`[data-rv="${id}"]`, box); if (it) it.remove(); toast(msg); refreshBadge(); if (!$('.rv-item', box)) route(); };
        $$('[data-ok]', box).forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true;
          try { await API.adminReview(b.getAttribute('data-ok'), true); done(b.getAttribute('data-ok'), 'اعتُمد الدرس وأصبح ظاهراً للطلاب'); }
          catch (e) { toast(errMsg(e), true); b.disabled = false; }
        }));
        $$('[data-no]', box).forEach((b) => b.addEventListener('click', () => {
          const id = b.getAttribute('data-no');
          const tools = b.closest('.tools');
          tools.innerHTML = `<form class="row rv-form"><input class="input" maxlength="200" placeholder="سبب الرفض يراه المعلم" aria-label="سبب الرفض" style="min-width:200px">
            <button class="btn btn-sm btn-danger" type="submit">تأكيد الرفض</button></form>`;
          const f = $('form', tools); $('input', f).focus();
          f.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            try { await API.adminReview(id, false, $('input', f).value.trim()); done(id, 'رُفض الدرس، وسيرى المعلم السبب'); }
            catch (e) { toast(errMsg(e), true); }
          });
        }));
      } else if (tab === 'tools') {
        const list = await API.adminTools();
        if (tok !== app.token) return;
        const gradeOpts = (sel) => `<option value="">كل الصفوف</option>${C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}<option value="skills"${sel === 'skills' ? ' selected' : ''}>المهارات</option>`;
        const allSubs = Array.from(new Set(Object.keys(C.SUBJECTS).concat(SKILLS.map((k) => k.id))));
        const subjOpts = (g, sel) => `<option value="">كل المواد</option>${(g ? subjectsOf(g) : allSubs).map((x) => `<option value="${esc(x)}"${x === sel ? ' selected' : ''}>${esc(subjectName(x))}</option>`).join('')}`;
        box.innerHTML = `<p class="muted">أضف رابط أي أداة تفاعلية مجانية (مثل محاكاة أو مختبر افتراضي). تظهر في صفحة «الأدوات»، وفي صفحة المادة التي تختارها. يُفضّل أن تكون الأداة بلا تسجيل دخول وبلا إعلانات.</p>
          <form class="box form" id="tl-form" novalidate><h2 id="tl-h">أداة جديدة</h2><input type="hidden" id="tl-id">
            <div class="grid2"><div class="field"><label for="tl-title">اسم الأداة</label><input class="input" id="tl-title" maxlength="80" placeholder="مثال: مختبر الفيزياء التفاعلي"></div>
              <div class="field"><label for="tl-url">الرابط</label><input class="input" id="tl-url" type="url" dir="ltr" maxlength="300" placeholder="https://www.kamirtyai.com/p/..."></div></div>
            <div class="field"><label for="tl-desc">وصف قصير (اختياري)</label><input class="input" id="tl-desc" maxlength="200" placeholder="سطر واحد يوضح فائدة الأداة"></div>
            <div class="grid2"><div class="field"><label for="tl-grade">الصف</label><select class="input" id="tl-grade">${gradeOpts('')}</select></div>
              <div class="field"><label for="tl-subj">المادة</label><select class="input" id="tl-subj">${subjOpts('', '')}</select></div></div>
            <div class="grid2"><div class="field"><label for="tl-sort">الترتيب (الأصغر أولاً)</label><input class="input" id="tl-sort" type="number" min="0" max="10000" value="100" inputmode="numeric"></div>
              <label class="check" style="align-self:end"><input type="checkbox" id="tl-pub" checked><span>ظاهرة للزوار</span></label></div>
            <div class="form-actions"><button class="btn btn-primary" type="submit" id="tl-save">أضف الأداة</button><button type="button" class="btn btn-ghost" id="tl-cancel" hidden>إلغاء التعديل</button></div></form>
          ${list.length ? `<div class="list">${list.map((t) => `<div class="item" style="grid-template-columns:minmax(0,1fr) auto">
            <div class="what"><b>${esc(t.title)}</b><div class="row">${toolTags(t).map((x) => `<span class="pill">${esc(x)}</span>`).join('')}${t.published ? '' : '<span class="pill pill-bad">مخفية</span>'}<span class="muted small">ترتيب ${fNum(t.sort)}</span></div>
              <a class="email small" href="${TOOL_URL.test(t.url) ? esc(t.url) : '#'}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(t.url)}</a></div>
            <div class="tools"><button type="button" class="btn btn-sm" data-tedit="${esc(t.id)}">تعديل</button>
              <button type="button" class="btn btn-sm btn-ghost btn-danger" data-tdel="${esc(t.id)}">حذف</button></div></div>`).join('')}</div>`
            : '<p class="muted">لا توجد أدوات بعد.</p>'}`;
        $('#tl-grade').addEventListener('change', () => { $('#tl-subj').innerHTML = subjOpts($('#tl-grade').value, $('#tl-subj').value); });
        const fill = (t) => {
          $('#tl-id').value = t ? t.id : ''; $('#tl-title').value = t ? t.title : ''; $('#tl-url').value = t ? t.url : ''; $('#tl-desc').value = t ? t.description || '' : '';
          $('#tl-grade').value = t ? t.grade || '' : ''; $('#tl-subj').innerHTML = subjOpts($('#tl-grade').value, t ? t.subject || '' : '');
          $('#tl-sort').value = t ? t.sort : 100; $('#tl-pub').checked = t ? t.published !== false : true;
          $('#tl-h').textContent = t ? 'تعديل الأداة' : 'أداة جديدة'; $('#tl-save').textContent = t ? 'حفظ التعديل' : 'أضف الأداة'; $('#tl-cancel').hidden = !t;
        };
        $('#tl-cancel').addEventListener('click', () => { fill(null); $('#tl-title').focus(); });
        $$('[data-tedit]', box).forEach((b) => b.addEventListener('click', () => { fill(list.find((t) => t.id === b.getAttribute('data-tedit'))); $('#tl-form').scrollIntoView({ block: 'start' }); $('#tl-title').focus(); }));
        $$('[data-tdel]', box).forEach((b) => b.addEventListener('click', async () => {
          const t = list.find((x) => x.id === b.getAttribute('data-tdel'));
          if (!t || !confirm(`حذف «${t.title}»؟`)) return;
          b.disabled = true;
          try { await API.adminDeleteTool(t.id); toolsP = null; toast('حُذفت الأداة'); route(); } catch (e) { toast(errMsg(e), true); b.disabled = false; }
        }));
        $('#tl-form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const title = $('#tl-title').value.trim(); const url = $('#tl-url').value.trim();
          if (title.length < 2) { $('#tl-title').setAttribute('aria-invalid', 'true'); $('#tl-title').focus(); return toast('اكتب اسم الأداة.', true); }
          if (!TOOL_URL.test(url)) { $('#tl-url').setAttribute('aria-invalid', 'true'); $('#tl-url').focus(); return toast('اكتب رابطاً كاملاً يبدأ بـ https://', true); }
          const b = $('#tl-save'); b.disabled = true;
          try {
            await API.adminSaveTool({ id: $('#tl-id').value || null, title, url, description: $('#tl-desc').value.trim(), grade: $('#tl-grade').value, subject: $('#tl-subj').value, sort: $('#tl-sort').value, published: $('#tl-pub').checked });
            toolsP = null; toast($('#tl-id').value ? 'حُفظت الأداة' : 'أُضيفت الأداة'); route();
          } catch (e) { toast(errMsg(e), true); b.disabled = false; }
        });
      } else if (tab === 'teachers') {
        const list = await API.adminTeachers();
        if (tok !== app.token) return;
        const pending = list.filter((t) => t.status === 'pending').length;
        box.innerHTML = `<p class="muted">${plural(list.length, 'معلم واحد', 'معلمان', 'معلمين', 'معلماً')} · ${pending ? `<b>${fNum(pending)} بانتظار المراجعة</b>` : 'لا أحد بانتظار المراجعة'}</p>
          <div class="atable-wrap"><table class="atable"><thead><tr><th>المعلم</th><th>البريد</th><th>التخصص والقناة</th><th>الدروس</th><th>الحالة والثقة</th><th>إجراء</th></tr></thead><tbody>
          ${list.map((t) => `<tr>
            <td><a class="who" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url, '', gOf(t))}<span>${esc(t.display_name)}</span></a><span class="muted small">انضم ${esc(fDateShort.format(new Date(t.created_at)))}</span></td>
            <td class="email">${esc(t.email || '')}</td>
            <td>${esc(t.specialty || '—')}<br>${t.youtube_channel && isYouTube(t.youtube_channel) ? `<a href="${esc(t.youtube_channel)}" target="_blank" rel="noopener">القناة</a>` : '<span class="pill pill-warn">بلا قناة</span>'}
              ${/^https:\/\//i.test(t.portfolio_url || '') ? ` · <a href="${esc(t.portfolio_url)}" target="_blank" rel="noopener nofollow">الأعمال</a>` : ''}</td>
            <td class="num">${fNum(t.sessions_count || 0)}${t.pending_reviews ? `<br><a class="pill pill-warn" href="#/admin/review">${fNum(t.pending_reviews)} للمراجعة</a>` : ''}</td>
            <td>${statusPill(t.status)}${t.is_admin ? ' <span class="pill">مشرف</span>' : ''}
              ${t.trusted ? ' <span class="pill pill-ok">موثوق</span>' : t.trust_lock ? ' <span class="pill pill-bad">سُحبت الثقة</span>' : t.trusted === false ? ' <span class="pill">جديد</span>' : ''}${t.verified ? ' <span class="verified">✓ موثّق</span>' : ''}
              ${t.vouch ? `<br><span class="muted small">${esc(t.vouch)}</span>` : ''}</td>
            <td><div class="row">
              ${t.trusted != null && t.status === 'approved' && !t.is_admin ? `<button type="button" class="btn btn-sm" data-trust="${esc(t.id)}" data-v="${t.trusted ? '0' : '1'}">${t.trusted ? 'سحب الثقة' : 'اجعله موثوقاً'}</button>
                <button type="button" class="btn btn-sm btn-ghost" data-verify="${esc(t.id)}" data-v="${t.verified ? '0' : '1'}">${t.verified ? 'إزالة شارة موثّق' : 'منح شارة موثّق'}</button>` : ''}
              ${t.status !== 'approved' ? `<button type="button" class="btn btn-sm btn-primary" data-st="approved" data-id="${esc(t.id)}">${t.status === 'suspended' ? 'إعادة التفعيل' : 'اعتماد'}</button>` : ''}
              ${t.status !== 'suspended' && t.id !== p.id && !t.is_admin ? `<button type="button" class="btn btn-sm btn-danger" data-st="suspended" data-id="${esc(t.id)}">إيقاف</button>` : ''}
            </div></td></tr>`).join('')}
          </tbody></table></div>`;
        $$('[data-st]', box).forEach((b) => {
          const act = async () => {
            b.disabled = true;
            try { await API.adminSetTeacher(b.getAttribute('data-id'), { status: b.getAttribute('data-st') }); toast(b.getAttribute('data-st') === 'approved' ? 'تم اعتماد المعلم' : 'تم إيقاف المعلم'); route(); }
            catch (e) { toast(errMsg(e), true); b.disabled = false; }
          };
          if (b.getAttribute('data-st') === 'suspended') armed(b, act); else b.addEventListener('click', act);
        });
        $$('[data-trust]', box).forEach((b) => {
          const on = b.getAttribute('data-v') === '1';
          const act = async () => {
            b.disabled = true;
            try { await API.adminSetTeacher(b.getAttribute('data-trust'), on ? { trusted: true, trust_lock: false } : { trusted: false, trust_lock: true }); toast(on ? 'أصبح موثوقاً: تُنشر دروسه مباشرة' : 'سُحبت الثقة: تمر دروسه الجديدة على المراجعة'); route(); }
            catch (e) { toast(errMsg(e), true); b.disabled = false; }
          };
          if (on) b.addEventListener('click', act); else armed(b, act);
        });
        $$('[data-verify]', box).forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true;
          try { await API.adminSetTeacher(b.getAttribute('data-verify'), { verified: b.getAttribute('data-v') === '1' }); route(); }
          catch (e) { toast(errMsg(e), true); b.disabled = false; }
        }));
      } else if (tab === 'reports') {
        const list = await API.adminReports();
        if (tok !== app.token) return;
        box.innerHTML = list.length ? `<div class="list">${list.map((r) => `<div class="item" style="grid-template-columns:minmax(0,1fr) auto">
            <div class="what"><b><a href="#/s/${esc(r.session_id)}">${esc(r.session_title || 'حصة')}</a></b>
              <span>${esc(r.reason)}</span>
              <div class="row"><span>${esc(r.teacher_name || '')}</span><span>·</span><span>${esc(rel(new Date(r.created_at) - Date.now()))}</span>${r.session_hidden ? '<span class="pill pill-bad">مخفية</span>' : ''}</div></div>
            <div class="tools">
              <button type="button" class="btn btn-sm${r.session_hidden ? '' : ' btn-danger'}" data-hide="${esc(r.session_id)}" data-h="${r.session_hidden ? '0' : '1'}">${r.session_hidden ? 'إظهار الحصة' : 'إخفاء الحصة'}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-dismiss="${esc(r.id)}">تجاهل البلاغ</button>
            </div></div>`).join('')}</div>` : '<div class="empty"><b>لا توجد بلاغات</b><span>عندما يبلّغ أحد عن حصة ستظهر هنا.</span></div>';
        $$('[data-hide]', box).forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true;
          try { await API.adminHideSession(b.getAttribute('data-hide'), b.getAttribute('data-h') === '1'); toast('تم'); route(); }
          catch (e) { toast(errMsg(e), true); b.disabled = false; }
        }));
        $$('[data-dismiss]', box).forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true;
          try { await API.adminDeleteReport(Number(b.getAttribute('data-dismiss'))); route(); }
          catch (e) { toast(errMsg(e), true); b.disabled = false; }
        }));
      } else {
        const st = await API.settings();
        if (tok !== app.token) return;
        box.innerHTML = `<form class="form" id="setf">
          <label class="check"><input type="checkbox" id="set-auto"${st.auto_approve ? ' checked' : ''}><span><b>اعتماد المعلمين الجدد تلقائياً</b><br><span class="muted small">إذا أُطفئ هذا الخيار، لا تظهر دروس المعلم الجديد للطلاب حتى تعتمده من تبويب «المعلمون». يُنصح بإطفائه.</span></span></label>
          ${st.legacy ? '<div class="note warn"><b>قاعدة البيانات تحتاج تحديثاً.</b><span>شغّل ملف supabase/schema.sql من جديد في Supabase لتظهر إعدادات «اطلب درساً» وعدّاد المشاهدات.</span></div>' : `
          <label class="check"><input type="checkbox" id="set-req"${st.requests_on !== false ? ' checked' : ''}><span><b>«اطلب درساً»</b><br><span class="muted small">يطلب الطلاب الدروس التي يحتاجونها دون أسماء، وتظهر للمعلمين المعتمدين في موادهم.</span></span></label>
          <div class="field" style="max-width:320px"><label for="set-min">يظهر الطلب للمعلمين بعد أن يطلبه</label>
            <select class="input" id="set-min">${[1, 2, 3, 5, 10].map((n) => `<option value="${n}"${n === (st.request_min_votes || 2) ? ' selected' : ''}>${n === 1 ? 'طالب واحد' : n === 2 ? 'طالبان' : `${fNum(n)} ${n <= 10 ? 'طلاب' : 'طالباً'}`}</option>`).join('')}</select></div>
          <label class="check"><input type="checkbox" id="set-views"${st.views_on !== false ? ' checked' : ''}><span><b>عدّاد المشاهدات وشكر الطلاب</b><br><span class="muted small">يرى المعلم عدد مشاهدات دروسه وشكر الطلاب، دون أي معلومة عن الطالب.</span></span></label>`}
          <div class="field"><label for="set-notice">إعلان أعلى المنصة (اختياري)</label><textarea class="input" id="set-notice" maxlength="300" rows="2" placeholder="مثال: تبدأ مراجعات امتحانات الدبلوم يوم الأحد">${esc(st.site_notice || '')}</textarea></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div></form>`;
        $('#setf').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const b = $('#setf button'); b.disabled = true;
          try {
            const patch = { auto_approve: $('#set-auto').checked, site_notice: $('#set-notice').value.trim() || null };
            if (!st.legacy) Object.assign(patch, { requests_on: $('#set-req').checked, views_on: $('#set-views').checked, request_min_votes: Number($('#set-min').value) || 2 });
            await API.adminSaveSettings(patch);
            app.settings = await API.settings(); renderBanners(); toast('حُفظت الإعدادات');
          } catch (e) { toast(errMsg(e), true); }
          b.disabled = false;
        });
      }
    } catch (e) { if (tok === app.token) box.innerHTML = errorBox(e); }
  }

  // ------------------------------------------------------------------
  //  استوديو التسجيل: يحدد المعلم الدرس، يسجّل شاشته وصوته، يحفظ الفيديو
  //  على جهازه، يرفعه إلى يوتيوب، ثم يلصق الرابط فيُنشر الدرس بضغطة.
  // ------------------------------------------------------------------
  const clock = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor(t / 60) % 60;
    return (h ? `${h}:${pad(m)}` : String(m)) + ':' + pad(t % 60);
  };
  const mbs = (b) => `${fNum(Math.max(1, Math.round(b / 1048576)))} ميغابايت`;
  const onStudio = () => /^#\/studio(\/|$)/.test(location.hash);
  const recActive = () => !!ST && (ST.state === 'recording' || ST.state === 'paused');
  const studio = { peak: 0, silent: 0, quiet: false, prev: 'idle', timer: null };
  let micTest = null;
  // اسم الملف = اسم الدرس، فيكتبه يوتيوب عنواناً للفيديو تلقائياً
  function lessonFileName(info, started, ext) {
    const d = new Date(started);
    const base = info && info.title
      ? `${subjOf(info)} - ${gradeName(info.grade)} - ${info.title}`
      : `midrar-${dayKey(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.' + ext;
  }

  function studioErr(e) {
    const n = e && e.name;
    if (e && e.where === 'mic') {
      if (n === 'NotAllowedError' || n === 'SecurityError') return 'لم يسمح المتصفح بالمايكروفون. اضغط رمز القفل بجانب عنوان الموقع واسمح بالمايكروفون، ثم أعد المحاولة.';
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'لم نجد مايكروفوناً. صِل سماعة بمايكروفون ثم أعد المحاولة.';
      if (n === 'NotReadableError') return 'المايكروفون مشغول ببرنامج آخر مثل زوم أو تيمز. أغلقه ثم أعد المحاولة.';
      return 'تعذّر تشغيل المايكروفون.';
    }
    if (e && e.where === 'display') {
      if (n === 'NotAllowedError') return 'لم يبدأ التسجيل: اختر الشاشة ثم اضغط «مشاركة». إن لم تظهر نافذة الاختيار، اسمح للمتصفح بتسجيل الشاشة من إعدادات الجهاز.';
      return 'تعذّر بدء مشاركة الشاشة.';
    }
    return 'حدث خطأ أثناء التسجيل' + (e && e.message ? ': ' + e.message : '.');
  }
  // مؤشر مستوى الصوت يتحرك ما دام ظاهراً
  function meterLoop(el, fn) {
    if (!el) return;
    const step = () => {
      if (!el.isConnected) return;
      el.style.width = Math.round(fn() * 100) + '%';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // شريط «التسجيل مستمر» في بقية الصفحات، ووقت التسجيل في عنوان التبويب
  function studioTick() {
    const on = recActive();
    let bar = document.getElementById('recbar');
    if (on && !onStudio()) {
      if (!bar) { bar = document.createElement('a'); bar.id = 'recbar'; bar.className = 'recbar'; bar.href = '#/studio'; document.body.appendChild(bar); }
      bar.textContent = `${ST.state === 'paused' ? 'التسجيل متوقف مؤقتاً' : '● التسجيل مستمر'} ${clock(ST.elapsed())} — العودة إلى الاستوديو`;
    } else if (bar) bar.remove();
    if (!on) return;
    document.title = `${ST.state === 'paused' ? 'متوقف' : '●'} ${clock(ST.elapsed())} تسجيل — ${C.SITE_NAME}`;
    if (ST.state === 'recording') {
      const pk = ST.peak();
      studio.peak = Math.max(studio.peak, pk);
      studio.silent = ST.metered && pk < 0.01 ? studio.silent + 1 : 0;
    }
    const t = $('#st-time'); if (t) t.textContent = clock(ST.elapsed());
    const z = $('#st-size'); if (z) z.textContent = mbs(ST.bytes);
    const w = $('#st-silent'); if (w) w.hidden = studio.silent < 45;
  }
  function syncStudio() {
    if (!ST) return;
    const on = recActive();
    if (on && !studio.timer) studio.timer = setInterval(studioTick, 1000);
    if (!on && studio.timer) { clearInterval(studio.timer); studio.timer = null; }
    studioTick();
  }
  if (ST) {
    ST.on((state) => {
      if (state === 'recording' && studio.prev === 'idle') { studio.peak = 0; studio.silent = 0; }
      if (state === 'done') studio.quiet = studio.prev === 'saving' && ST.metered && studio.peak < 0.02;
      const ended = state === 'done' && studio.prev === 'saving';
      studio.prev = state;
      syncStudio();
      if (!onStudio()) {
        if (!recActive() && / تسجيل — /.test(document.title)) setTitle('');
        if (ended) toast('انتهى التسجيل. افتح «سجّل درساً» لحفظ الفيديو ونشره.');
        return;
      }
      if (!recActive()) setTitle('استوديو التسجيل');
      renderStudio(app.token);
    });
    window.addEventListener('beforeunload', (e) => {
      if (recActive() || ST.state === 'saving') { e.preventDefault(); e.returnValue = ''; }
    });
  }

  async function pageStudio(tok) {
    setNav(''); setTitle('استوديو التسجيل');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    renderStudio(tok);
  }

  function renderStudio(tok) {
    if (tok !== app.token) return;
    const head = (h1, sub) => `<header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>استوديو التسجيل</span></nav>
      <h1>${h1}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</header>`;
    if (!ST || !ST.supported()) {
      view.innerHTML = head('استوديو التسجيل') + `<div class="studio">
        <div class="note warn"><b>الاستوديو يعمل على الكمبيوتر فقط</b><span>افتح هذه الصفحة على حاسوب بمتصفح Chrome أو Edge.</span></div>
        <div class="box"><h2>تشرح من الجوال أو الآيباد؟</h2>
          <ol class="plain">
            <li>شغّل <b>تسجيل الشاشة</b> المدمج في جهازك مع تفعيل <b>المايكروفون</b>: في الآيفون والآيباد من مركز التحكم (اضغط مطولاً على زر التسجيل وفعّل المايكروفون)، وفي أندرويد من الإعدادات السريعة ← «مسجّل الشاشة».</li>
            <li>اشرح على الملف أو السبورة بقلمك، ثم أوقف التسجيل. يُحفظ الفيديو في صور جهازك.</li>
            <li>ارفعه من تطبيق يوتيوب إلى قناتك، ثم من <b>لوحتي</b> اضغط <a href="#/dashboard/new">أضف درساً من يوتيوب</a> والصق رابطه.</li>
          </ol></div></div>`;
      return;
    }
    const st = ST.state;

    if (st === 'recording' || st === 'paused') {
      const paused = st === 'paused';
      const liveRec = ST.info && ST.info.live && ST.info.link ? ST.info : null;
      view.innerHTML = head(paused ? 'التسجيل متوقف مؤقتاً' : 'جارٍ التسجيل') + `<div class="studio">
        <div class="box rec-panel${paused ? ' paused' : ''}">
          <div class="rec-top"><span class="rec-dot" aria-hidden="true"></span><b>${paused ? 'متوقف مؤقتاً' : liveRec ? 'تُسجَّل الحصة الآن' : 'يُسجَّل الآن: شاشتك وصوتك'}</b><span class="rec-time" id="st-time">${clock(ST.elapsed())}</span></div>
          <div class="meter" aria-hidden="true"><span id="st-lvl"></span></div>
          <div class="note warn" id="st-silent" hidden><b>لم نسمع صوتاً منذ قليل.</b><span>إن كنت تتكلم، تأكد أن المايكروفون موصول وغير مكتوم.</span></div>
          ${ST.sysLost ? '<div class="note warn"><span>تعذّر تسجيل صوت الحاسوب، وصوتك يُسجَّل بشكل طبيعي.</span></div>' : ''}
          ${liveRec ? `<a class="btn btn-live btn-lg" href="${esc(liveRec.link)}" target="_blank" rel="noopener">افتح الحصة</a>
          <p>${/jit\.si/i.test(liveRec.link) ? 'في صفحة الحصة اضغط «تسجيل الدخول» وادخل بحساب Google، ثم اشرح. ' : 'اشرح في الحصة. '}وبعد انتهائها ارجع إلى هذه الصفحة واضغط «إنهاء الحصة».</p>`
          : `<p>${paused ? 'اضغط «استئناف» لتكمل من حيث توقفت.' : 'انتقل الآن إلى العرض أو الملف واشرح براحتك. عند الانتهاء ارجع إلى هذه الصفحة واضغط «إنهاء التسجيل»، أو اضغط «إيقاف المشاركة» في شريط المتصفح.'}</p>`}
          <div class="row">
            <button type="button" class="btn btn-lg" id="st-pause">${paused ? 'استئناف' : 'إيقاف مؤقت'}</button>
            <button type="button" class="btn btn-primary btn-lg" id="st-stop">${liveRec ? 'إنهاء الحصة' : 'إنهاء التسجيل'}</button>
          </div>
          <span class="muted small">${ST.persistent ? 'يُحفظ التسجيل أولاً بأول في متصفحك، فلا يضيع إن أُغلقت الصفحة.' : 'لا تغلق هذه الصفحة حتى تنهي التسجيل وتحفظه.'} الحجم الآن: <b id="st-size">${mbs(ST.bytes)}</b></span>
        </div></div>`;
      $('#st-pause').addEventListener('click', () => (ST.state === 'paused' ? ST.resume() : ST.pause()));
      $('#st-stop').addEventListener('click', () => ST.stop());
      meterLoop($('#st-lvl'), () => ST.level());
      studioTick();
      return;
    }

    if (st === 'saving') {
      view.innerHTML = head('جارٍ تجهيز الفيديو…') + '<p class="loading">لحظات من فضلك، لا تغلق الصفحة.</p>';
      return;
    }

    if (st === 'done') {
      const r = ST.result;
      const info = r.info && r.info.grade && r.info.subject && r.info.title ? r.info : null;
      const name = lessonFileName(info, r.started, r.ext);
      const minutesOf = Math.min(240, Math.max(1, Math.round(r.ms / 60000)));
      const where = info ? `${isSkills(info.grade) ? `في قسم المهارات: <b>${esc(subjOf(info))}</b>` : `لطلاب <b>${esc(gradeName(info.grade))}</b> في مادة <b>${esc(subjectName(info.subject))}</b>`} بعنوان «${esc(info.title)}»${placeLine(info) ? ` (${esc(placeLine(info))})` : ''}` : '';
      view.innerHTML = head('اكتمل التسجيل', `${info ? `${esc(info.title)} · ` : ''}المدة ${esc(clock(r.ms))} · الحجم ${esc(mbs(r.bytes))}`) + `<div class="studio">
        ${r.partial ? '<div class="note warn"><b>هذا تسجيل توقف قبل أن يكتمل.</b><span>حفظنا ما سُجّل حتى لحظة التوقف.</span></div>' : ''}
        ${studio.quiet ? '<div class="note warn"><b>تنبيه: لم نلتقط صوتاً تقريباً.</b><span>شاهد الفيديو أولاً؛ إن كان بلا صوت فجرّب المايكروفون وأعد التسجيل.</span></div>' : ''}
        <video class="st-video" controls preload="metadata" src="${esc(r.url)}"></video>
        <div id="st-live"></div>
        <div id="st-generic"${r.info && r.info.live ? ' hidden' : ''}>
        <section class="box send-box">
          <h2>أرسل الدرس للمنصة</h2>
          <p class="muted">ننشره على قناة «مدرار العلم» باسمك.</p>
          ${info ? `<p class="small">سيُنشر ${where}.</p>${whenHtml('st', null, false)}${consentHtml('st-consent')}`
            : '<p class="note">في الخطوة التالية تختار صف الدرس ومادته وعنوانه وموعده.</p>'}
          <div class="row"><button type="button" class="btn btn-primary btn-lg" id="st-send">${info ? 'أرسل الدرس' : 'تابع: بيانات الدرس'}</button>
            ${info ? '<button type="button" class="btn btn-ghost" id="st-edit">تعديل بيانات الدرس</button>' : ''}</div>
          <div id="st-prog" hidden></div>
        </section>
        </div>
        ${r.info && r.info.live ? '<button type="button" class="btn btn-ghost" id="st-other">أو انشره درساً مستقلاً</button>' : ''}
        <details class="more own-ch"><summary>لديك قناة على يوتيوب وتفضّل النشر عليها؟</summary>
          <ol class="steps">
            <li class="box"><h2>١. احفظ الفيديو على جهازك</h2>
              <div><a class="btn btn-primary" id="st-dl" href="${esc(r.url)}" download="${esc(name)}">حفظ الفيديو</a></div>
              <span class="hint">يُحفظ في مجلد «التنزيلات» باسم <b>${esc(name)}</b></span></li>
            <li class="box"><h2>٢. ارفعه إلى قناتك في يوتيوب</h2>
              ${r.ms > 15 * 60000 ? '<div class="note warn"><b>الفيديو أطول من 15 دقيقة.</b><span>يقبله يوتيوب بعد توثيق قناتك برقم الهاتف مرة واحدة من <a href="https://www.youtube.com/verify" target="_blank" rel="noopener">youtube.com/verify</a>.</span></div>' : ''}
              <div><a class="btn" href="https://www.youtube.com/upload" target="_blank" rel="noopener">افتح صفحة الرفع في يوتيوب</a></div>
              <ol class="plain">
                <li>اسحب الملف الذي حفظته إلى صفحة يوتيوب.${info ? ' عنوان الفيديو يُكتب تلقائياً من اسم الملف.' : ''}</li>
                <li>أجب عن سؤال «هل الفيديو مخصص للأطفال؟» بصدق.</li>
                <li>في «مستوى الظهور» اختر <b>غير مدرج</b> أو <b>عام</b>، وليس «خاص».</li>
                <li>انسخ <b>رابط الفيديو</b> الظاهر في نافذة الرفع.</li>
              </ol></li>
            <li class="box"><h2>٣. الصق الرابط وانشر الدرس</h2>
              <form id="st-add" class="stack" novalidate>
                <div class="field"><label for="st-url">رابط الفيديو على يوتيوب</label>
                  <input class="input" id="st-url" type="url" inputmode="url" maxlength="300" placeholder="https://youtu.be/..."></div>
                ${info ? `<p class="muted small">سيُنشر ${where}${''}، في الموعد الذي اخترته أعلاه.</p>` : ''}
                <div class="row"><button class="btn btn-primary" type="submit">${info ? 'انشر الدرس' : 'تابع: بيانات الدرس'}</button>
                  ${info ? '<button type="button" class="btn btn-ghost" id="st-more">تعديل البيانات</button>' : ''}</div>
              </form></li>
          </ol>
        </details>
        <div class="row"><a class="btn" id="st-dl2" href="${esc(r.url)}" download="${esc(name)}">احفظ نسخة على جهازك</a>
          <button type="button" class="btn" id="st-new">تسجيل جديد</button><span class="spacer"></span>
          ${r.saved ? '<button type="button" class="btn btn-ghost btn-danger" id="st-del">احذف النسخة من المتصفح</button>' : ''}</div>
      </div>`;
      let saved = false;
      ['#st-dl', '#st-dl2'].forEach((sel) => $(sel).addEventListener('click', () => { saved = true; toast('بدأ حفظ الفيديو في مجلد التنزيلات'); }));
      const nb = $('#st-new');
      if (r.saved) nb.addEventListener('click', () => ST.discard());
      else {
        // التسجيل في الذاكرة فقط: نطلب تأكيداً إن لم يُحفظ بعد
        nb.addEventListener('click', (ev) => { if (saved) { ev.stopImmediatePropagation(); ST.discard(); } }, true);
        armed(nb, async () => ST.discard());
      }
      const del = $('#st-del');
      if (del) armed(del, async () => { try { await ST.remove(r.id); toast('حُذفت النسخة من المتصفح'); } catch (e) { toast(errMsg(e), true); } });
      const whenCtl = info ? bindWhen('st', () => true) : null;
      const fileOf = () => new File([r.blob], name, { type: r.type });
      const readUrl = () => {
        const inp = $('#st-url');
        const url = normYt(inp.value.trim());
        inp.removeAttribute('aria-invalid');
        if (isYouTube(url) && ytId(url)) return url;
        inp.setAttribute('aria-invalid', 'true'); inp.focus();
        toast('الصق رابط الفيديو من يوتيوب، مثل https://youtu.be/...', true);
        return null;
      };
      const toForm = (extra) => {
        app.prefill = Object.assign({ kind: 'recorded', minutes: minutesOf, _rec: { id: r.id, saved: r.saved } }, info || {}, extra);
        location.hash = '#/dashboard/new';
      };
      const baseRow = (start) => {
        const extra = {};
        ['term', 'unit', 'unit_title', 'lesson_type', 'exam_year', 'exam_round', 'request_id', 'skill_name', 'level', 'ages'].forEach((k) => { if (info[k] != null) extra[k] = info[k]; });
        return Object.assign({ grade: info.grade, subject: info.subject, title: info.title, description: null, kind: 'recorded',
          starts_at: start.toISOString(), ends_at: new Date(+start + minutesOf * MIN).toISOString() }, extra);
      };
      const readWhen = () => { const w = whenCtl.read(); if (w.el) { w.el.setAttribute('aria-invalid', 'true'); w.el.focus(); toast(w.msg, true); return null; } return w; };
      // الإرسال للمنصة (الطريق الأسهل)
      $('#st-send').addEventListener('click', async () => {
        if (!info) return toForm({ _file: fileOf() });
        const w = readWhen();
        if (!w) return;
        if (r.bytes > API.uploadLimit) return toast('التسجيل أكبر من 500 ميغابايت. سجّل الدرس على جزأين.', true);
        const btn = $('#st-send'); btn.disabled = true;
        const box = $('#st-prog');
        try {
          await sendLesson(baseRow(w.start), fileOf(), box, 'up-rec-' + r.id);
          if (r.saved) ST.remove(r.id).catch(() => {}); else ST.discard();
          sentDone(tok, info.title, w.at ? w.start : null);
        } catch (e) {
          sentFailed(tok, box, e, 'up-rec-' + r.id);
          btn.disabled = false;
        }
      });
      // تسجيل حصة مباشرة انتهت للتو: يُرسل تسجيلاً لها مباشرة
      const other = $('#st-other');
      if (other) other.addEventListener('click', () => { $('#st-generic').hidden = false; other.remove(); });
      API.mySessions().then((all) => {
        const live = r.info && r.info.live;
        const targets = recTargets(all).sort((a, b) => (b.id === live) - (a.id === live));
        const lb = $('#st-live');
        if (!lb || tok !== app.token) return;
        if (!targets.length) { const g = $('#st-generic'); if (g) g.hidden = false; if (other) other.remove(); return; }
        lb.innerHTML = `<section class="box send-box live-rec"><h2>${live && targets[0].id === live ? 'انتهت الحصة: أرسل تسجيلها' : 'هذا تسجيل حصة مباشرة؟'}</h2>
          <p class="muted">يظهر في صفحة الحصة لمن فاته الحضور.</p>
          <div class="field"><label for="st-lv">الحصة</label><select class="input" id="st-lv">${targets.map((x) => `<option value="${esc(x.id)}">${esc(x.title)} — ${esc(gradeName(x.grade))} · ${esc(dayLabel(new Date(x.starts_at)))} ${esc(time(x.starts_at))}</option>`).join('')}</select></div>
          ${consentHtml('st-lv-consent')}
          <div class="row"><button type="button" class="btn btn-primary btn-lg" id="st-lv-send">${live ? 'أرسل التسجيل' : 'أرسله تسجيلاً للحصة'}</button></div>
          <div id="st-lv-prog" hidden></div></section>`;
        $('#st-lv-send').addEventListener('click', async () => {
          const x = targets.find((y) => y.id === $('#st-lv').value);
          if (!x) return;
          if (r.bytes > API.uploadLimit) return toast('التسجيل أكبر من 500 ميغابايت. احفظه على جهازك وارفعه على قناتك، ثم الصق رابطه من «لوحتي».', true);
          const b = $('#st-lv-send'); b.disabled = true;
          const box = $('#st-lv-prog');
          try {
            await sendRec(x, fileOf(), box);
            if (r.saved) ST.remove(r.id).catch(() => {}); else ST.discard();
            sentDoneRec(tok, x.title);
          } catch (e) {
            if (tok === app.token && box.isConnected) { box.hidden = false; box.innerHTML = `<div class="note bad" role="alert"><b>توقف الإرسال</b><span>${esc(errMsg(e))}</span>${x.upload_state ? '<span>اضغط الزر مرة أخرى، فنكمل من حيث توقف.</span>' : ''}</div>`; }
            else toast('توقف إرسال تسجيل الحصة، أكمله من «لوحتي»: ' + errMsg(e), true);
            b.disabled = false;
          }
        });
      }).catch(() => { /* اختياري */ });
      const edit = $('#st-edit');
      if (edit) edit.addEventListener('click', () => toForm({ _file: fileOf() }));
      const more = $('#st-more');
      if (more) more.addEventListener('click', () => { const url = readUrl(); if (url) toForm({ video_url: url }); });
      // النشر من قناة المعلم
      $('#st-add').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const url = readUrl();
        if (!url) return;
        if (!info) return toForm({ video_url: url });
        const w = readWhen();
        if (!w) return;
        const btn = $('#st-add button[type=submit]'); btn.disabled = true;
        try {
          const made = await API.createSessions([Object.assign(baseRow(w.start), { video_url: url })]);
          // الفيديو صار على يوتيوب وفي جهاز المعلم: لا حاجة لنسخة المتصفح
          if (r.saved) ST.remove(r.id).catch(() => {}); else ST.discard();
          toast(w.at ? `سيُعرض الدرس ${dayLabel(w.start)} الساعة ${time(w.start)}` : publishedMsg());
          location.hash = made && made[0] ? '#/s/' + made[0].id : '#/dashboard';
        } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
      });
      return;
    }

    // الإعداد قبل التسجيل
    const err = ST.error;
    const req = pendingReq();
    const lastGrade = (req && req.grade) || store.get('t-grade') || '';
    view.innerHTML = head('سجّل درساً جديداً', 'شاشتك وصوتك فقط، بلا برامج وبلا كاميرا. بعد التسجيل اضغط «أرسل الدرس»، فننشره على قناة «مدرار العلم» في يوتيوب باسمك.') + `<div class="studio">
      <div class="note"><b>الكاميرا لا تعمل هنا أبداً</b><span>المنصة ممنوعة من تشغيل الكاميرا أصلاً. يُسجَّل فقط ما تختاره من شاشتك، وصوتك.</span></div>
      ${err ? `<div class="note bad"><b>توقف التسجيل.</b><span>${esc(studioErr(err))}</span></div>` : ''}
      <ol class="steps">
        <li class="box"><h2>١. ماذا ستشرح؟</h2>
          ${req ? `<div class="note" id="st-req"><b>تسجّل درساً طلبه الطلاب</b><span>${esc([req.topic, req.unit ? 'الوحدة ' + fNum(req.unit) : ''].filter(Boolean).join(' · '))} — ${esc(gradeName(req.grade))} · ${esc(subjectName(req.subject))}</span>
            <span class="small">عند نشره يرى الطلاب أن طلبهم صار متاحاً. <button type="button" class="btn btn-ghost btn-sm" id="st-req-x">إلغاء الربط بالطلب</button></span></div>` : ''}
          <div class="grid2">
            <div class="field"><label for="st-grade">الصف</label>
              <select class="input" id="st-grade"><option value="">اختر الصف</option>
                ${C.STAGES.map((sg) => `<optgroup label="${esc(sg.name)}">${sg.grades.map((g) => `<option value="${esc(g.id)}"${g.id === lastGrade ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}
                ${SKILLS.length ? `<optgroup label="خارج المنهج"><option value="skills"${lastGrade === 'skills' ? ' selected' : ''}>المهارات (ذكاء اصطناعي، تصميم، برمجة…)</option></optgroup>` : ''}
              </select></div>
            <div class="field"><label for="st-subj">المادة</label><select class="input" id="st-subj"></select></div>
          </div>
          <div class="field"><label for="st-title">عنوان الدرس</label>
            <input class="input" id="st-title" maxlength="120" value="${esc(req ? req.topic || '' : store.get('st-title') || '')}" placeholder="مثال: حل المعادلات من الدرجة الثانية"></div>
          ${placeHtml()}</li>
        <li class="box"><h2>٢. جرّب المايكروفون</h2>
          <div class="field"><label for="st-mic">المايكروفون</label><select class="input" id="st-mic"><option value="">المايكروفون الافتراضي</option></select></div>
          <div class="meter" aria-hidden="true"><span id="st-lvl"></span></div>
          <div class="row"><button type="button" class="btn" id="st-test">تجربة المايكروفون</button><span class="hint" id="st-mic-hint">اضغط ثم تكلّم: يجب أن يتحرك الشريط الأخضر.</span></div></li>
        <li class="box"><h2>٣. جهّز شاشتك</h2>
          <ul class="plain">
            <li>افتح ما ستشرحه: العرض، أو ملف PDF، أو السبورة.</li>
            <li>أغلق واتساب ويب والبريد، وفعّل «عدم الإزعاج». كل ما يظهر على الشاشة يُسجَّل.</li>
            <li>صِل الحاسوب بالشاحن، واستخدم سماعة بمايكروفون إن وُجدت.</li>
          </ul>
          ${ST.canSystemAudio ? `<label class="check"><input type="checkbox" id="st-sys" checked><span>سجّل صوت الحاسوب أيضاً، إن كنت ستشغّل فيديو للطلاب.<br><span class="muted small">عند اختيار الشاشة فعّل خيار «مشاركة الصوت» في نافذة المتصفح.</span></span></label>` : ''}</li>
        <li class="box"><h2>٤. ابدأ التسجيل</h2>
          <p>سيسألك المتصفح ماذا تشارك: اختر <b>الشاشة بالكامل</b> (الأسهل)، أو <b>نافذة</b> برنامج واحد مثل العرض، ثم اضغط «مشاركة».</p>
          <div><button type="button" class="btn btn-live btn-lg" id="st-start"><span class="rec-dot" aria-hidden="true"></span>ابدأ التسجيل</button></div>
          <span class="hint">لا يوجد حد لمدة التسجيل، والإيقاف المؤقت لا يُحسب منها. لرفع فيديو أطول من 15 دقيقة يشترط يوتيوب توثيق قناتك برقم الهاتف مرة واحدة من <a href="https://www.youtube.com/verify" target="_blank" rel="noopener">youtube.com/verify</a>.</span>
          <span class="hint" id="st-space"></span></li>
      </ol>
      <section class="section" id="st-saved" hidden></section>
    </div>`;

    const gSel = $('#st-grade');
    const sSel = $('#st-subj');
    const fillSubjects = () => {
      const list = gSel.value ? subjectsOf(gSel.value) : [];
      const cur = sSel.value || (req && req.grade === gSel.value ? req.subject : store.get('t-subject')) || '';
      sSel.innerHTML = `<option value="">${gSel.value ? 'اختر المادة' : 'اختر الصف أولاً'}</option>` + list.map((x) => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(subjectName(x))}</option>`).join('');
    };
    fillSubjects();
    gSel.addEventListener('change', fillSubjects);
    $('#st-title').addEventListener('input', (e) => store.set('st-title', e.target.value));
    const place = bindPlace(gSel, sSel, $('#st-title'), req ? { term: req.term, unit: req.unit } : null);
    let useReq = !!req;
    const rx = $('#st-req-x');
    if (rx) rx.addEventListener('click', () => { useReq = false; store.del('st-req'); $('#st-req').remove(); });

    const sel = $('#st-mic');
    const fillMics = async () => {
      const list = (await ST.mics()).filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
      const cur = sel.value || store.get('mic') || '';
      sel.innerHTML = '<option value="">المايكروفون الافتراضي</option>' + list.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label || 'مايكروفون ' + fNum(i + 1))}</option>`).join('');
    };
    fillMics();
    const tb = $('#st-test');
    const hint = $('#st-mic-hint');
    const stopTest = () => { if (micTest) { micTest.stop(); micTest = null; } tb.textContent = 'تجربة المايكروفون'; $('#st-lvl').style.width = '0'; };
    const runTest = async () => {
      tb.disabled = true;
      try {
        micTest = await ST.testMic(sel.value);
        if (!tb.isConnected) { stopTest(); return; }
        tb.textContent = 'إيقاف التجربة';
        hint.textContent = 'تكلّم الآن: يجب أن يتحرك الشريط الأخضر مع صوتك.';
        const t = micTest;
        meterLoop($('#st-lvl'), () => (micTest === t ? t.level() : 0));
        fillMics();
      } catch (e) { hint.textContent = studioErr(e); }
      tb.disabled = false;
    };
    tb.addEventListener('click', () => (micTest ? stopTest() : runTest()));
    sel.addEventListener('change', () => { store.set('mic', sel.value); if (micTest) { stopTest(); runTest(); } });
    $('#st-start').addEventListener('click', async () => {
      // التحقق متزامن: نافذة اختيار الشاشة يجب أن تُفتح داخل الضغطة نفسها
      const title = $('#st-title').value.trim();
      const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); el.focus(); toast(msg, true); };
      $$('#view [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      if (!gSel.value) return bad(gSel, 'اختر الصف الذي تشرح له.');
      if (!sSel.value) return bad(sSel, 'اختر المادة.');
      if (title.length < 3) return bad($('#st-title'), 'اكتب عنوان الدرس (3 أحرف على الأقل).');
      const pc = place.check(); if (pc) return bad(pc.el, pc.msg);
      if (micTest) stopTest();
      const btn = $('#st-start');
      btn.disabled = true;
      store.set('t-grade', gSel.value); store.set('t-subject', sSel.value);
      try {
        const linked = useReq && req.grade === gSel.value && req.subject === sSel.value;
        await ST.start({ micId: sel.value, systemAudio: !!($('#st-sys') && $('#st-sys').checked), label: title,
          info: Object.assign({ grade: gSel.value, subject: sSel.value, title }, place.read(), linked ? { request_id: req.id } : {}) });
        store.set('st-title', '');
        place.remember();
        if (linked) store.del('st-req');
      } catch (e) {
        if (btn.isConnected) btn.disabled = false;
        toast(studioErr(e), true);
      }
    });
    ST.freeSpace().then((f) => {
      const el = $('#st-space');
      if (el && f != null && f < 1.5 * 1073741824) el.textContent = 'تنبيه: المساحة المتاحة للتسجيل قليلة. احذف تسجيلات قديمة أو وفّر مساحة على القرص.';
    });
    ST.list().then((items) => {
      const box = $('#st-saved');
      if (!box || !items.length || tok !== app.token) return;
      const total = items.reduce((n, x) => n + (x.bytes || 0), 0);
      box.hidden = false;
      box.innerHTML = `<div class="section-head"><h2>تسجيلات لم تُنشر بعد</h2><span class="muted">${esc(mbs(total))}</span></div>
        <div class="list">${items.map((x) => `<div class="item">
          <div class="when"><b>${esc(time(x.started))}</b><span>${esc(fDateShort.format(new Date(x.started)))}</span></div>
          <div class="what"><b>${esc(x.label || 'تسجيل درس')}</b><div class="row"><span>${esc(clock(x.ms || 0))}</span><span>·</span><span>${esc(mbs(x.bytes || 0))}</span>${x.done ? '' : '<span class="pill pill-warn">توقف قبل أن يكتمل</span>'}</div></div>
          <div class="tools"><button type="button" class="btn btn-sm" data-open="${esc(x.id)}">فتح</button><button type="button" class="btn btn-sm btn-ghost btn-danger" data-rm="${esc(x.id)}">حذف</button></div></div>`).join('')}</div>
        <p class="muted small">محفوظة مؤقتاً في هذا المتصفح. افتحها لتكمل الحفظ والرفع والنشر، أو احذفها.</p>`;
      $$('[data-open]', box).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await ST.open(b.getAttribute('data-open')); } catch (e) { toast(errMsg(e), true); b.disabled = false; }
      }));
      $$('[data-rm]', box).forEach((b) => armed(b, async () => {
        try { await ST.remove(b.getAttribute('data-rm')); toast('حُذف التسجيل من المتصفح'); renderStudio(app.token); } catch (e) { toast(errMsg(e), true); }
      }));
    }).catch(() => { /* التخزين غير متاح */ });
  }

  // ------------------------------------------------------------------
  //  صفحات ثابتة
  // ------------------------------------------------------------------
  function pageGuide() {
    setNav(''); setTitle('دليل المعلم');
    view.innerHTML = `
      <header class="page-head"><h1>دليل المعلم: حصتك المباشرة ودروسك</h1>
        <p class="muted">الطريق الأساسي: تحدد موعد حصة مباشرة، والمنصة تنشئ رابطها، فيحضرها الطلاب من المنصة، ثم ترسل تسجيلها فننشره على قناة «مدرار العلم» في يوتيوب باسمك لمن فاته الحضور. ويمكنك أيضاً تسجيل درس في استوديو المنصة. بلا قناة يوتيوب، وبلا أي تكلفة.</p></header>
      <article class="prose">
        <h2>أولاً: قبل أول درس (مرة واحدة)</h2>
        <ol>
          <li><b>حسابك:</b> ادخل بحساب Google وأكمل <a href="#/profile">ملفي</a>. <b>لا تحتاج قناة على يوتيوب</b>؛ ننشر دروسك على قناة «مدرار العلم» باسمك.</li>
          <li><b>الجهاز:</b> كمبيوتر بمتصفح Chrome أو Edge، وسماعة بمايكروفون إن وُجدت؛ الصوت الواضح أهم من أي شيء. ويمكنك أيضاً التصوير بالجوال.</li>
          <li><b>(اختياري) قناتك الخاصة:</b> إن كنت تفضّل النشر عليها فضع رابطها في «ملفي»، ووثّقها برقم هاتفك من <a href="https://www.youtube.com/verify" target="_blank" rel="noopener">youtube.com/verify</a> لترفع فيديوهات أطول من 15 دقيقة.</li>
        </ol>
        <h2>ثانياً: الحصة المباشرة</h2>
        <ol>
          <li>من <a href="#/dashboard">لوحتي</a> اضغط <b>حصة مباشرة جديدة</b>: الصف، والمادة، والعنوان، والموعد. والمنصة تنشئ رابط الحصة.</li>
          <li>في الموعد اضغط <b>ابدأ الحصة</b> من الكمبيوتر، واختر «الشاشة بالكامل» وفعّل «مشاركة الصوت»، ثم <b>افتح الحصة</b>، واضغط فيها «تسجيل الدخول» بحساب Google، واشرح. فيها مشاركة الشاشة والسبورة.</li>
          <li>بعد الحصة اضغط <b>إنهاء الحصة</b> ثم <b>أرسل التسجيل</b>، فننشره على قناة «مدرار العلم» باسمك.</li>
        </ol>
        <div class="note warn"><b>خصوصية الطلاب</b><span>اطلب من الطلاب إغلاق الكاميرا، واعرض شرحك بملء الشاشة حتى لا تظهر صورهم أو أسماؤهم في التسجيل. ولا تطلب أرقام هواتفهم أو حساباتهم.</span></div>
        <h2>ثالثاً: أو سجّل درساً في الاستوديو</h2>
        <ol>
          <li>من <a href="#/dashboard">لوحتي</a> اضغط <b>سجّل درساً جديداً</b>.</li>
          <li>اختر الصف والمادة، واكتب عنوان الدرس، وحدّد <b>مكانه في الكتاب</b>: الفصل الدراسي والوحدة. يتذكر المتصفح اختيارك، فالدرس التالي في نفس الوحدة لا يحتاج شيئاً.</li>
          <li>جرّب المايكروفون، ثم اضغط <b>ابدأ التسجيل</b> واختر <b>الشاشة بالكامل</b> أو نافذة العرض، ثم «مشاركة».</li>
          <li>اشرح براحتك. يمكنك الإيقاف المؤقت متى شئت، ولا حد لمدة التسجيل. عند الانتهاء ارجع إلى الصفحة واضغط <b>إنهاء التسجيل</b>.</li>
        </ol>
        <div class="note warn"><b>قبل أن تبدأ</b><span>أغلق واتساب ويب والبريد، وفعّل «عدم الإزعاج»؛ كل ما يظهر على شاشتك يُسجَّل، بما فيه الإشعارات. الكاميرا لا تعمل أبداً في المنصة.</span></div>
        <h2>رابعاً: اختر موعد الدرس المسجّل وأرسله</h2>
        <ol>
          <li>في <b>«متى يشاهده الطلاب؟»</b> اختر <b>«فور نشره»</b>، أو <b>«في موعد أحدده»</b> (اليوم والساعة): يظهر الدرس للطلاب في «الدروس القادمة» مع عدّ تنازلي وتذكير في التقويم، ويُعرض في موعده ليشاهدوه معاً.</li>
          <li>وافق على النشر في قناة المنصة، واضغط <b>أرسل الدرس</b>، وانتظر حتى يكتمل شريط الإرسال. إن انقطع الإنترنت اضغط مرة أخرى فنكمل من حيث توقف.</li>
          <li>تراجع الإدارة الدرس وترفعه على قناة «مدرار العلم» باسمك، ثم يظهر للطلاب. ترى حالته في <a href="#/dashboard">لوحتي</a>: «وصل للإدارة» ثم يصبح منشوراً.</li>
          <li>للدرس القادم زر <b>«شارك الموعد»</b> في «لوحتي»، يرسل موعده لطلابك عبر واتساب.</li>
        </ol>
        <p class="muted">لديك قناة وتفضّل النشر عليها؟ افتح <b>«لديك قناة على يوتيوب؟»</b> تحت زر الإرسال: احفظ الفيديو، وارفعه إلى قناتك بظهور «غير مدرج» أو «عام»، ثم الصق رابطه.</p>
        <p class="muted">يحفظ المتصفح التسجيل أولاً بأول، فإن أُغلقت الصفحة أو انقطعت الكهرباء تجد ما سُجّل في الاستوديو تحت «تسجيلات لم تُنشر بعد».</p>
        <h2>حل امتحانات الدبلوم ومراجعات الكتاب</h2>
        <ul>
          <li>اختر <b>نوع الدرس</b>: شرح درس، أو حل أسئلة الكتاب، أو مراجعة، أو حل امتحانات سابقة. يقترحه المتصفح من العنوان، ويمكنك تغييره.</li>
          <li>للصف الثاني عشر اختر «حل امتحانات الدبلوم» ثم السنة والدور، فيُكتب العنوان تلقائياً، ويظهر الدرس للطلاب في صندوق «أسئلة الدبلوم السابقة محلولة» مرتباً بالسنوات.</li>
        </ul>
        <h2>دروس المهارات (خارج المنهج)</h2>
        <ul>
          <li>في الاستوديو أو نموذج الدرس اختر من قائمة الصف <b>«المهارات»</b>، ثم المهارة: ${SKILLS.filter((k) => k.id !== 'sk_other').map((k) => esc(k.name)).join('، ')}. وإن لم تجد مهارتك اختر <b>«أخرى»</b> واكتب اسمها.</li>
          <li>اكتب <b>اسم الدورة</b> ورقم <b>الجزء</b>، فتظهر أجزاء الدورة للطالب معاً بالترتيب. يتذكر المتصفح الدورة ويقترح الجزء التالي تلقائياً.</li>
          <li>حدّد <b>المستوى</b> (مبتدئ، متوسط، متقدم) و<b>العمر المناسب</b> (الحلقة الأولى، الحلقة الثانية، ما بعد الأساسي، للجميع).</li>
        </ul>
        <h2>اختبر نفسك، والملفات المرافقة</h2>
        <ul>
          <li>في نموذج الدرس («أضف درساً جاهزاً»، أو «تعديل بيانات الدرس» بعد التسجيل، أو تعديل درس منشور) أضف حتى <b>5 أسئلة</b> اختيار من متعدد. يجيب عنها الطالب بعد الدرس ويعرف فوراً إن فهم، ولا تُحفظ إجاباته في أي مكان.</li>
          <li>وأضف حتى <b>3 روابط</b> لملخص أو ورقة عمل من Google Drive أو OneDrive أو Dropbox، بعد أن تجعل مشاركة الملف «أي شخص لديه الرابط».</li>
        </ul>
        <h2>المراجعة والثقة</h2>
        <ul>
          <li>أول ${fNum(C.TRUST_AFTER || 3)} دروس للمتطوع الجديد تراجعها الإدارة قبل ظهورها للطلاب. بعدها تصبح <b>متطوعاً موثوقاً</b> وتُنشر دروسك مباشرة. إن لم يُعتمد درس ترى السبب في «لوحتي»، فعدّله ويعود إلى المراجعة.</li>
          <li>المتطوع الموثوق يستطيع إنشاء <b>مسارات</b>: دروس مرتبة (له أو لغيره) يتابعها الطالب خطوة بخطوة، مثل «استعد لاختبار الرياضيات».</li>
        </ul>
        <h2>طلبات الطلاب، وأثر دروسك، وشهادة الشكر</h2>
        <ul>
          <li><b>طلبات الطلاب:</b> بعد اعتماد حسابك تظهر في <a href="#/dashboard">لوحتي</a> الدروس التي طلبها طلاب صفوفك. اضغط <b>سجّل هذا الدرس</b> فيُفتح الاستوديو والصف والمادة والعنوان جاهزة، وعند النشر يرى الطلاب أن طلبهم صار متاحاً. وإن رأيت طلباً غير مناسب اضغط «غير مناسب».</li>
          <li><b>أثر دروسك:</b> عدد المشاهدات، وكم طالباً قال «جزاك الله خيراً» أو «فهمتُ الدرس»، وملخص آخر 30 يوماً. أرقام فقط، بلا أي معلومة عن الطالب.</li>
          <li><b>شهادة شكر وتقدير:</b> عند بلوغ ${CERT_LEVELS.map((l) => fNum(l)).join(' و')} من الدروس، برمز تحقق يفتحه أي شخص، وتُطبع أو تُحفظ PDF. يُحسب الدرس بعد 3 أيام من نشره إن كان 5 دقائق فأكثر.</li>
        </ul>
        <h2>أدوات الشرح على الشاشة (كلها مجانية)</h2>
        <ul>
          <li><b>عرض بوربوينت:</b> أثناء العرض اضغط <span class="path">Ctrl + P</span> لتحويل المؤشر إلى قلم تكتب به على الشريحة، و<span class="path">Ctrl + A</span> للرجوع إلى السهم. شريحة بيضاء فارغة تصلح سبورة.</li>
          <li><b>ملف PDF أو صفحة من الكتاب:</b> افتحه في متصفح <b>Microsoft Edge</b> واضغط زر <b>رسم</b> <span class="path">(Draw)</span> لتكتب وتظلّل عليه.</li>
          <li><b>سبورة بيضاء:</b> تطبيق <a href="https://apps.microsoft.com/detail/9mspc6mp8fm4" target="_blank" rel="noopener">Microsoft Whiteboard</a> على ويندوز، أو موقع <a href="https://excalidraw.com" target="_blank" rel="noopener">excalidraw.com</a> من المتصفح دون تثبيت.</li>
          <li><b>مقطع فيديو:</b> شغّله على حاسوبك. ليُسمع صوته فعّل في الاستوديو «سجّل صوت الحاسوب»، ثم «مشاركة الصوت» عند اختيار الشاشة. تجنّب المقاطع المحمية بحقوق النشر.</li>
          <li><b>للكتابة المريحة:</b> لوح رسم بقلم يوصل بالحاسوب (سعره بسيط)، أو حاسوب بشاشة لمس، يجعل الكتابة مثل السبورة تماماً.</li>
        </ul>
        <h2>تشرح من الجوال أو الآيباد؟</h2>
        <ol>
          <li>شغّل <b>تسجيل الشاشة</b> المدمج مع تفعيل المايكروفون: في الآيفون والآيباد من مركز التحكم (اضغط مطولاً على زر التسجيل)، وفي أندرويد من الإعدادات السريعة ← «مسجّل الشاشة».</li>
          <li>اشرح على الملف أو السبورة بقلمك. ويمكنك أيضاً تصوير نفسك وأنت تشرح على سبورة أو ورقة بكاميرا الجوال، بدقة <b>720p</b> ليكون الملف أصغر.</li>
          <li>من <a href="#/dashboard">لوحتي</a> اضغط <b>أضف درساً جاهزاً</b> ← <b>من جهازي</b>، واختر الفيديو، ثم <b>أرسل الدرس</b> (حتى 500 ميغابايت للدرس).</li>
        </ol>
        <h2>نصائح لدرس ينفع الطلاب</h2>
        <ul>
          <li>الأفضل <b>20 إلى 45 دقيقة</b> للدرس. قسّم المراجعات الطويلة إلى أجزاء بعناوين واضحة، مثل «الجزء 1: …».</li>
          <li>ابدأ بما سيتعلمه الطالب، واختم بتمرين أو سؤال يحلّه بنفسه.</li>
          <li>اكتب عنواناً يبحث عنه الطالب: اسم الدرس كما في الكتاب، فالطالب يجده بالبحث بكلمة من العنوان.</li>
          <li>اترك خيار <b>السماح بالتضمين</b> <span class="path">(Allow embedding)</span> مفعّلاً في يوتيوب ليعمل الفيديو داخل المنصة (وهو مفعّل افتراضياً).</li>
          <li>محتوى الأطفال الصغار يُعلَّم «مخصص للأطفال» كما تطلب قواعد يوتيوب.</li>
        </ul>
        <p><a class="btn btn-primary" href="#/studio">سجّل درساً الآن</a></p>
      </article>`;
  }

  function pageAbout() {
    setNav('about'); setTitle('عن المنصة');
    view.innerHTML = `
      <header class="page-head"><h1>عن ${esc(C.SITE_NAME)}</h1></header>
      <article class="prose">
        <p>${esc(C.SITE_NAME)} منصة مجانية بالكامل. معلمون متطوعون يسجّلون دروسهم لكل صف ومادة، وأي طالب يستطيع مشاهدتها متى شاء دون حساب ودون أي رسوم.</p>
        <h2>للطلاب</h2>
        <ul>
          <li>اختر صفّك، ثم المادة: الدروس مرتبة حسب الفصل الدراسي والوحدات كما في كتابك. قد يشرح أكثر من معلم نفس الدرس، فاختر من يناسبك.</li>
          <li>ابحث عن أي درس بكلمة من عنوانه، مثل «الكسور» أو «نيوتن».</li>
          <li>«تابع من حيث توقفت»: يتذكر متصفحك الدقيقة التي وصلت إليها والدروس التي أكملتها، ويقترح عليك الدرس التالي.</li>
          <li>لم تجد الدرس؟ اضغط «اطلبه من المعلمين» في صفحة صفك، دون اسم أو رقم.</li>
          <li>يبدأ الفيديو عندما تضغط عليه فقط، توفيراً لباقة الإنترنت.</li>
          <li>أضف المنصة إلى الشاشة الرئيسية في هاتفك من قائمة المتصفح ← «إضافة إلى الشاشة الرئيسية»، فتفتح مثل التطبيق.</li>
          <li>في «المهارات» دورات مجانية خارج المنهج: الذكاء الاصطناعي، والتصميم، والبرمجة، وغيرها.</li>
          <li>«المسارات» دروس مرتبة يجهزها معلمون موثوقون، مثل الاستعداد لاختبار، وترى نسبة ما أكملته منها.</li>
          <li>بعد بعض الدروس تجد «اختبر نفسك»: أسئلة قصيرة تعرف بها فوراً إن فهمت.</li>
          <li>«الدروس القادمة» في الصفحة الرئيسية وصفحة كل مادة تعرض مواعيد الدروس القادمة. اضغط «ذكّرني» لتضيفها إلى تقويمك، وفي موعدها يظهر عليها «يُعرض الآن» لتشاهدها مع زملائك.</li>
          <li>إذا رأيت شيئاً غير لائق، استخدم زر «الإبلاغ عن مشكلة» في صفحة الدرس.</li>
          <li>لا تشارك رقم هاتفك أو حساباتك الخاصة في تعليقات يوتيوب.</li>
        </ul>
        <h2>ميثاق المعلم المتطوع</h2>
        <ol>
          <li>الشرح مجاني بالكامل. لا إعلانات لدروس خصوصية أو دورات أو مجموعات مدفوعة.</li>
          <li>لا تواصل خاص مع الطلاب، ولا طلب أرقام هواتفهم أو حساباتهم.</li>
          <li>في الحصة المباشرة: فعّل غرفة الانتظار أو قبول الدخول، ولا تُظهر صور الطلاب في التسجيل المنشور.</li>
          <li>محتوى تعليمي محترم يناسب أعمار الطلاب، دون مواد محمية بحقوق النشر.</li>
          <li>شرح واضح ومتقن، ونشر الدروس في مواعيدها المعلنة أو إلغاؤها من اللوحة مبكراً.</li>
          <li>الإبقاء على فيديوهات الدروس متاحة على يوتيوب قدر الإمكان، فهي علمٌ يُنتفع به.</li>
          <li>الدرس الذي يُرسَل للمنصة تنشره الإدارة على قناة «مدرار العلم» في يوتيوب باسم المعلم، بعد موافقته عند الإرسال، ويُحذف ملفه من المنصة بعد النشر. ويمكن للمعلم أن يطلب إزالته في أي وقت.</li>
        </ol>
        <p>يحق لإدارة المنصة إخفاء أي درس أو إيقاف أي حساب يخالف الميثاق. وتراجع الإدارة أول دروس كل متطوع جديد قبل ظهورها للطلاب. <a href="#/parents">كيف نحمي الطلاب؟</a></p>
        <h2>الخصوصية</h2>
        <p>لا تجمع المنصة أي بيانات شخصية عن الطلاب، ولا تطلب منهم حساباً.</p>
        <ul>
          <li><b>سجل المشاهدة</b> («تابع من حيث توقفت» و«شاهدتُه» والتقدم في المسارات) وإجابات «اختبر نفسك» تُحفظ في متصفح الطالب فقط، ولا تصل إلينا أبداً.</li>
          <li><b>عدّاد المشاهدات والشكر وطلبات الدروس</b> أرقام مجمّعة بلا أسماء. ولمنع العبث بها نستخدم بصمة مشفّرة من عنوان الشبكة بدل العنوان نفسه، وتُحذف البصمات ومفتاح تشفيرها خلال يوم.</li>
          <li><b>للمعلمين</b> نحفظ: الاسم الظاهر، التخصص، النبذة، رابط القناة إن أُضيف، والصورة من حساب Google. البريد الإلكتروني يراه المشرفون فقط ولا يظهر للعامة. وفيديو الدرس المرسل للمنصة يُحفظ مؤقتاً في تخزين خاص لا يراه إلا المعلم والمشرف، ويُحذف بعد نشره.</li>
          <li>الفيديوهات تُعرض من يوتيوب بوضع الخصوصية المحسّنة <span class="path">(youtube-nocookie)</span> وتخضع لسياسات يوتيوب.</li>
        </ul>
        <p><button type="button" class="btn" id="clear-watch2">مسح سجل المشاهدة من هذا الجهاز</button></p>
        ${C.CONTACT ? `<h2>التواصل مع الإدارة</h2><p><span class="path">${esc(C.CONTACT)}</span></p>` : ''}
      </article>`;
    armed($('#clear-watch2'), async () => { watch.clear(); toast('مُسح سجل المشاهدة من هذا الجهاز'); });
  }

  function pageNotFound(msg) {
    setTitle('غير موجود');
    view.innerHTML = `<div class="empty" style="margin-top:32px"><b>${esc(msg || 'الصفحة غير موجودة')}</b><a class="btn btn-primary" href="#/">العودة إلى الصفوف</a></div>`;
  }

  // ------------------------------------------------------------------
  //  التوجيه
  // ------------------------------------------------------------------
  let pageTick = null;
  const ROUTES = [
    [/^#?\/?$/, (t) => pageHome(t)],
    [/^#\/g\/([\w-]+)(?:\/([\w-]+))?(?:\/(exam))?$/, (t, m) => pageGrade(t, m[1], m[2], m[3])],
    [/^#\/s\/([\w-]+)$/, (t, m) => pageSession(t, m[1])],
    [/^#\/t\/([\w-]+)$/, (t, m) => pageTeacher(t, m[1])],
    [/^#\/teachers$/, (t) => pageTeachers(t)],
    [/^#\/k(?:\/(sk_[a-z_]+))?$/, (t, m) => pageSkills(t, m[1])],
    [/^#\/p\/([\w-]+)$/, (t, m) => pagePath(t, m[1])],
    [/^#\/volunteer$/, () => pageVolunteer()],
    [/^#\/teach$/, () => pageTeach()],
    [/^#\/tools$/, (t) => pageTools(t)],
    [/^#\/parents$/, () => pageParents()],
    [/^#\/dashboard\/path\/(new|[\w-]+)$/, (t, m) => pagePathForm(t, m[1])],
    [/^#\/c\/([A-Za-z0-9-]{10,16})(?:\/([mf]))?$/, (t, m) => pageCertificate(t, m[1], m[2])],
    [/^#\/guide$/, () => pageGuide()],
    [/^#\/studio(?:\/[\w-]+)?$/, (t) => pageStudio(t)],
    [/^#\/about$/, () => pageAbout()],
    [/^#\/dashboard$/, (t) => pageDashboard(t)],
    [/^#\/dashboard\/new$/, (t) => pageSessionForm(t, 'new')],
    [/^#\/dashboard\/live$/, (t) => pageSessionForm(t, 'live')],
    [/^#\/dashboard\/rec\/([\w-]+)$/, (t, m) => pageRecording(t, m[1])],
    [/^#\/dashboard\/edit\/([\w-]+)$/, (t, m) => pageSessionForm(t, 'edit', m[1])],
    [/^#\/dashboard\/copy\/([\w-]+)$/, (t, m) => pageSessionForm(t, 'copy', m[1])],
    [/^#\/dashboard\/resume\/([\w-]+)$/, (t, m) => pageResume(t, m[1])],
    [/^#\/profile$/, (t) => pageProfile(t, false)],
    [/^#\/admin(?:\/(overview|uploads|review|teachers|requests|reports|tools|settings))?$/, (t, m) => pageAdmin(t, m[1])],
  ];
  let lastHash = null;
  let booted = false;
  async function route() {
    if (location.hash === '#view') { history.replaceState(null, '', lastHash || '#/'); view.focus(); if (lastHash) return; }
    const tok = ++app.token;
    pageTick = null;
    if (player.s) stopPlayer();
    if (micTest && !onStudio()) { micTest.stop(); micTest = null; }
    syncStudio();
    // زر المساعد لا يظهر في الاستوديو حتى لا يدخل في تسجيل شاشة المعلم
    document.body.classList.toggle('on-studio', onStudio());
    const h = location.hash || '#/';
    const changed = h !== lastHash;
    lastHash = h;
    for (const [re, fn] of ROUTES) {
      const m = h.match(re);
      if (m) {
        try { await fn(tok, m); } catch (e) { if (tok === app.token) view.innerHTML = errorBox(e); console.error(e); }
        if (changed && tok === app.token) {
          window.scrollTo(0, 0);
          if (booted && (document.activeElement === document.body || !view.contains(document.activeElement))) {
            const h1 = view.querySelector('h1');
            if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
          }
          booted = true;
        }
        return;
      }
    }
    pageNotFound();
  }

  // تحديث الحالات كل 30 ثانية دون إعادة تحميل الصفحة
  setInterval(() => {
    paintStates();
    if (pageTick) pageTick();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { paintStates(); if (pageTick) pageTick(); } });

  async function boot() {
    document.getElementById('brand-name').textContent = C.SITE_NAME;
    document.getElementById('foot-name').textContent = C.SITE_NAME;
    const soc = C.SOCIAL || {};
    const socLabels = { youtube: 'يوتيوب', instagram: 'إنستغرام', x: 'إكس (تويتر)' };
    const socLinks = Object.keys(socLabels).filter((k) => /^https:\/\//.test(soc[k] || ''))
      .map((k) => `<a href="${esc(soc[k])}" target="_blank" rel="noopener">${socLabels[k]}</a>`);
    document.getElementById('foot-social').innerHTML = socLinks.length ? 'تابعنا: ' + socLinks.join(' · ') : '';
    API.onAuth(async (u) => {
      app.user = u;
      app.profile = undefined;
      if (u) await loadProfile().catch(() => {});
      renderAuth();
      refreshBadge();
    });
    try { app.user = await API.init(); }
    catch (e) { toast(errMsg(e), true); }
    if (app.user) await loadProfile().catch(() => {});
    renderAuth();
    refreshBadge();
    const [st, gm] = await Promise.all([API.settings().catch(() => ({})), API.teacherGenders().catch(() => ({}))]);
    app.settings = st || {}; app.genders = gm || {};
    renderBanners();
    document.querySelector('.skip').addEventListener('click', (e) => { e.preventDefault(); view.focus(); });
    window.addEventListener('hashchange', route);
    initBot();
    route();
  }
  boot();
})();
