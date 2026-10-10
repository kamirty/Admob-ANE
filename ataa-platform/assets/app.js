/* =====================================================================
   منصة عطاء — واجهة المستخدم
   صفحة واحدة بروابط (#/...) بدون أي إطار عمل، لتبقى خفيفة على الهواتف.
   ===================================================================== */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const API = window.API;
  const view = document.getElementById('view');

  // ------------------------------------------------------------------
  //  أدوات عامة
  // ------------------------------------------------------------------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const store = {
    get(k) { try { return localStorage.getItem('ataa-' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('ataa-' + k, v); } catch (e) { /* ignore */ } },
  };
  const MIN = 60000;
  const DAY = 864e5;

  const GRADES = {};
  C.STAGES.forEach((st) => st.grades.forEach((g) => { GRADES[g.id] = Object.assign({ stage: st }, g); }));
  const gradeName = (id) => (GRADES[id] ? GRADES[id].name : id);
  const subjectName = (id) => C.SUBJECTS[id] || id;
  const subjectsOf = (gradeId) => (GRADES[gradeId] ? C.SUBJECT_SETS[GRADES[gradeId].subjects] || [] : Object.keys(C.SUBJECTS));

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
    if (Math.abs(h) < 24) return rtf.format(h, 'hour');
    return rtf.format(Math.round(h / 24), 'day');
  }
  function dayLabel(d) {
    const k = dayKey(d);
    const today = dayKey(new Date());
    if (k === today) return 'اليوم، ' + fDayLong.format(d);
    if (k === dayKey(addDays(new Date(), 1))) return 'غداً، ' + fDayLong.format(d);
    if (k === dayKey(addDays(new Date(), -1))) return 'أمس، ' + fDayLong.format(d);
    return fDayLong.format(d);
  }
  const countShort = (n) => (n === 1 ? 'حصة' : n === 2 ? 'حصتان' : `${fNum(n)} ${n <= 10 ? 'حصص' : 'حصة'}`);
  const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${fNum(n)} ${few}` : `${fNum(n)} ${many}`);

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
      text: `${subjectName(s.subject)}: ${s.title}`,
      dates: `${z(s.starts_at)}/${z(s.ends_at)}`,
      details: `${gradeName(s.grade)} — ${(s.teacher && s.teacher.display_name) || ''}\nرابط الحصة: ${link}`,
      location: link,
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function pageUrl(hash) { return location.origin + location.pathname + hash; }
  function whatsappUrl(s) {
    const text = `${subjectName(s.subject)} — ${s.title}\n${gradeName(s.grade)} · ${dayLabel(new Date(s.starts_at))} ${time(s.starts_at)}\n${pageUrl('#/s/' + s.id)}`;
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  // ------------------------------------------------------------------
  //  حالة الحصة (قادمة / تبدأ قريباً / مباشر / تسجيل ...)
  // ------------------------------------------------------------------
  function stateOf(s, now) {
    now = now || Date.now();
    const st = +new Date(s.starts_at);
    const en = +new Date(s.ends_at);
    if (s.status === 'cancelled') return { key: 'cancelled', label: 'ملغاة' };
    if (s.kind === 'recorded') {
      return now >= st ? { key: 'recorded', label: 'درس مسجّل' } : { key: 'upcoming', label: 'يُنشر ' + rel(st - now) };
    }
    if (now < st - C.JOIN_EARLY_MIN * MIN) return { key: 'upcoming', label: rel(st - now) };
    if (now < st) return { key: 'soon', label: 'تبدأ ' + rel(st - now) };
    if (now < en) return { key: 'live', label: 'مباشر الآن' };
    if (videoOf(s)) return { key: 'replay', label: 'التسجيل متاح' };
    return { key: 'ended', label: 'انتهت' };
  }
  function badgeHtml(s) {
    const st = stateOf(s);
    return `<span class="badge b-${st.key}">${st.key === 'live' ? '<span class="dot-live"></span>' : ''}${esc(st.label)}</span>`;
  }
  function actionHtml(s, compact) {
    const st = stateOf(s).key;
    const to = '#/s/' + esc(s.id);
    if (st === 'live' || st === 'soon') {
      return s.video_url
        ? `<a class="btn btn-live${compact ? ' btn-sm' : ''}" href="${to}">ادخل الحصة</a>`
        : `<a class="btn${compact ? ' btn-sm' : ''}" href="${to}">بانتظار رابط المعلم</a>`;
    }
    if (st === 'replay' || st === 'recorded') return `<a class="btn btn-primary${compact ? ' btn-sm' : ''}" href="${to}">شاهد التسجيل</a>`;
    if (st === 'upcoming') {
      return `<a class="btn${compact ? ' btn-sm' : ''}" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">ذكّرني في التقويم</a>
              <a class="btn btn-ghost${compact ? ' btn-sm' : ''}" href="${to}">التفاصيل</a>`;
    }
    if (st === 'ended') return `<a class="btn btn-ghost${compact ? ' btn-sm' : ''}" href="${to}">انتهت — لا يوجد تسجيل بعد</a>`;
    return '';
  }

  // ------------------------------------------------------------------
  //  عناصر مشتركة
  // ------------------------------------------------------------------
  function initial(name) { return String(name || '؟').replace(/^(أ\.|د\.|م\.|ا\.)\s*/, '').trim().charAt(0) || '؟'; }
  function avatar(name, url, cls) {
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
    return `<a class="who" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url)}<span>${esc(t.display_name)}</span></a>`;
  }
  function cardHtml(s, opts) {
    opts = opts || {};
    const st = stateOf(s).key;
    return `<article class="card s-${st}" data-sid="${esc(s.id)}">
      <div class="card-top"><span class="subj">${esc(subjectName(s.subject))}${opts.showGrade ? ' · ' + esc(gradeName(s.grade)) : ''}</span><span data-badge>${badgeHtml(s)}</span></div>
      <h3><a href="#/s/${esc(s.id)}">${esc(s.title)}</a></h3>
      ${teacherLink(s.teacher)}
      <div class="meta">${opts.showDay ? esc(fDateShort.format(new Date(s.starts_at))) + ' · ' : ''}${esc(time(s.starts_at))} – ${esc(time(s.ends_at))} · ${fNum(minutes(s))} دقيقة</div>
      <div class="act" data-act>${actionHtml(s, true)}</div>
    </article>`;
  }
  function vidHtml(s) {
    const url = videoOf(s);
    const th = thumbUrl(url);
    return `<a class="vid" href="#/s/${esc(s.id)}">
      <div class="thumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" data-ph="${esc(subjectName(s.subject))}">` : `<span class="ph">${esc(subjectName(s.subject))}</span>`}<span class="play">${s.kind === 'recorded' ? 'درس مسجّل' : 'تسجيل حصة'}</span></div>
      <h3>${esc(s.title)}</h3>
      <span class="meta">${esc(subjectName(s.subject))} · ${esc((s.teacher && s.teacher.display_name) || '')} · ${esc(fDateShort.format(new Date(s.starts_at)))}</span>
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
  const app = { user: null, profile: undefined, settings: {}, token: 0 };

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
      box.innerHTML = `<a class="btn btn-sm" href="#/dashboard">${avatar(name, pic)}<span>لوحتي</span></a>`;
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
    view.innerHTML = `
      <section class="hero">
        <h1>${esc(C.SITE_TAGLINE)}</h1>
        <p>اختر صفّك لترى جدول الحصص. ادخل أي حصة مع المعلم الذي تفضّله، أو شاهد تسجيلها لاحقاً. لا تحتاج إلى حساب.</p>
      </section>
      ${mine && GRADES[mine] ? `<div class="mine"><span>صفّك:</span><b>${esc(gradeName(mine))}</b><span class="spacer"></span><a class="btn btn-primary btn-sm" href="#/g/${esc(mine)}">افتح جدولي</a></div>` : ''}
      <section class="section" id="live-sec" hidden>
        <div class="section-head"><span class="dot-live"></span><h2>مباشر الآن</h2><span class="muted" id="live-count"></span></div>
        <div class="live-strip" id="live-list"></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>اختر صفّك</h2><span class="muted">صف دبلوم التعليم العام عليه علامة «${esc(C.EXAM_TAG)}»</span></div>
        <div class="stages">${C.STAGES.map((st) => `
          <div class="stage"><h2>${esc(st.name)}</h2>
            <div class="grade-grid">${st.grades.map((g) => `<a class="grade-chip${g.id === mine ? ' cur' : ''}" href="#/g/${esc(g.id)}"><span>${esc(g.short)}</span>${g.exam ? `<span class="tag-exam">${esc(C.EXAM_TAG)}</span>` : ''}</a>`).join('')}</div>
          </div>`).join('')}
        </div>
      </section>
      <section class="section">
        <h2>كيف تعمل المنصة؟</h2>
        <ol class="steps3">
          <li><b>المعلم يضيف حصته</b><span class="muted">يدخل بحساب Google ويحدد الصف والمادة والوقت ورابط بث يوتيوب.</span></li>
          <li><b>الطالب يختار</b><span class="muted">يرى كل المعلمين الذين يشرحون لصفه في نفس الوقت ويختار من يناسبه.</span></li>
          <li><b>التسجيل يبقى</b><span class="muted">بعد انتهاء البث يبقى التسجيل على نفس الرابط لمن فاتته الحصة.</span></li>
        </ol>
      </section>
      <section class="cta">
        <h2>أنت معلم وتريد التطوع؟</h2>
        <p class="muted">سجّل بحساب Google، وأضف حصصك في دقيقة، واشرح من شاشة حاسوبك عبر بث يوتيوب. كل شيء مجاني.</p>
        <div class="cta-row"><a class="btn btn-primary" href="#/dashboard">ابدأ التطوع</a><a class="btn" href="#/guide">كيف أبث حصتي؟</a></div>
      </section>`;
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
  async function pageGrade(tok, gradeId, tab) {
    const g = GRADES[gradeId];
    if (!g) return pageNotFound();
    store.set('grade', gradeId);
    setNav('home'); setTitle(g.name);
    const ui = gradeUi[gradeId] || (gradeUi[gradeId] = { day: dayKey(new Date()), subject: '' });
    view.innerHTML = `
      <header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الصفوف</a><span>›</span><span>${esc(g.stage.name)}</span></nav>
        <div class="title-row"><h1>${esc(g.name)}</h1>${g.exam ? `<span class="pill pill-exam">${esc(C.EXAM_PILL)}</span>` : ''}<span class="spacer"></span><a class="btn btn-ghost btn-sm" href="#/">تغيير الصف</a></div>
        <nav class="tabs" aria-label="أقسام الصف">
          <a href="#/g/${esc(gradeId)}"${tab ? '' : ' aria-current="page"'}>جدول الحصص</a>
          <a href="#/g/${esc(gradeId)}/rec"${tab ? ' aria-current="page"' : ''}>التسجيلات</a>
        </nav>
      </header>
      <div id="grade-body"><p class="loading">جارٍ تحميل الحصص…</p></div>`;
    const body = document.getElementById('grade-body');
    if (tab === 'rec') return gradeRecordings(tok, gradeId, body, ui);

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
        }).join('')}</div>` : `<div class="empty"><b>لا توجد حصص ${ui.subject ? 'لهذه المادة ' : ''}في هذا اليوم بعد</b>
          ${nextDay ? `<button type="button" class="btn btn-primary" data-day="${dayKey(nextDay)}">أقرب يوم فيه حصص: ${esc(fDayLong.format(nextDay))}</button>` : '<span>عندما يضيف المعلمون حصصاً لهذا الصف ستظهر هنا.</span>'}
          <a class="btn btn-ghost" href="#/g/${esc(gradeId)}/rec">تصفّح التسجيلات السابقة</a></div>`}`;
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

  async function gradeRecordings(tok, gradeId, body, ui) {
    const PAGE = 24;
    let offset = 0;
    let items = [];
    let seq = 0;
    async function load(more) {
      const req = ++seq;
      try {
        const rows = remember(await API.listRecordings(gradeId, ui.subject, offset, PAGE));
        if (tok !== app.token || req !== seq) return;
        items = more ? items.concat(rows) : rows;
        offset = items.length;
        draw(rows.length === PAGE);
      } catch (e) {
        if (tok !== app.token || req !== seq) return;
        if (more) { toast(errMsg(e), true); const m = document.getElementById('more'); if (m) m.disabled = false; return; }
        body.innerHTML = errorBox(e, true);
        $('[data-retry]', body).addEventListener('click', () => { offset = 0; load(false); });
      }
    }
    function draw(hasMore) {
      body.innerHTML = `
        <div class="filters" role="group" aria-label="تصفية حسب المادة" style="padding-top:14px">
          <button type="button" class="chip" data-subj="" aria-pressed="${!ui.subject}">كل المواد</button>
          ${subjectsOf(gradeId).map((x) => `<button type="button" class="chip" data-subj="${esc(x)}" aria-pressed="${ui.subject === x}">${esc(subjectName(x))}</button>`).join('')}
        </div>
        ${items.length ? `<div class="vids">${items.map(vidHtml).join('')}</div>
          ${hasMore ? '<div class="row" style="justify-content:center;padding-bottom:24px"><button type="button" class="btn" id="more">عرض المزيد</button></div>' : ''}`
        : `<div class="empty"><b>لا توجد تسجيلات ${ui.subject ? 'لهذه المادة ' : ''}بعد</b><span>تظهر هنا تسجيلات الحصص بعد انتهائها.</span><a class="btn" href="#/g/${esc(gradeId)}">العودة إلى الجدول</a></div>`}`;
      $$('[data-subj]', body).forEach((b) => b.addEventListener('click', () => {
        ui.subject = b.getAttribute('data-subj'); offset = 0; body.innerHTML = '<p class="loading">جارٍ التحميل…</p>'; load(false);
      }));
      const m = document.getElementById('more');
      if (m) m.addEventListener('click', () => { m.disabled = true; load(true); });
    }
    load(false);
  }

  // ------------------------------------------------------------------
  //  صفحة الحصة
  // ------------------------------------------------------------------
  function playerHtml(s) {
    const st = stateOf(s);
    const url = watchUrl(s);
    if (['live', 'soon', 'replay', 'recorded'].includes(st.key)) {
      if (!url) {
        return `<div class="ph"><b>${st.key === 'live' ? 'الحصة بدأت' : 'الحصة تبدأ قريباً'}</b><span>لم يضع المعلم رابط البث بعد. ستتحدّث هذه الصفحة تلقائياً عند إضافته.</span></div>`;
      }
      if (isDemoVideo(url)) {
        return `<div class="ph"><b>هنا يظهر بث يوتيوب</b><span>في المنصة الحقيقية يعمل الفيديو داخل الصفحة مباشرة.</span></div>`;
      }
      const id = ytId(url);
      if (id) {
        return `<iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0&playsinline=1" title="${esc(s.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      }
      return `<div class="ph"><b>${st.key === 'replay' || st.key === 'recorded' ? 'التسجيل على يوتيوب' : 'البث على يوتيوب'}</b><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">افتح في يوتيوب</a></div>`;
    }
    if (st.key === 'upcoming') {
      return `<div class="ph"><span>تبدأ الحصة</span><span class="big">${esc(rel(new Date(s.starts_at) - Date.now()))}</span><span>${esc(dayLabel(new Date(s.starts_at)))} · ${esc(time(s.starts_at))}</span>
        <a class="btn" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">أضفها إلى تقويمي</a></div>`;
    }
    if (st.key === 'cancelled') return '<div class="ph"><b>ألغى المعلم هذه الحصة</b><span>اختر معلماً آخر من جدول الصف.</span></div>';
    return '<div class="ph"><b>انتهت الحصة</b><span>لم يُضف تسجيل لها بعد.</span></div>';
  }

  async function pageSession(tok, id) {
    setNav('home');
    view.innerHTML = '<p class="loading">جارٍ تحميل الحصة…</p>';
    let s;
    try { s = await API.getSession(id); }
    catch (e) {
      if (tok !== app.token) return;
      view.innerHTML = errorBox(e, true);
      $('[data-retry]').addEventListener('click', route);
      return;
    }
    if (tok !== app.token) return;
    if (!s) return pageNotFound('هذه الحصة غير موجودة أو حُذفت.');
    remember([s]);
    setTitle(s.title);
    const t = s.teacher || {};
    const mine = app.user && s.teacher_id === app.user.id;
    const admin = app.profile && app.profile.is_admin;
    const url = watchUrl(s);
    const notPublic = s.hidden || (mine && app.profile && app.profile.status !== 'approved');
    view.innerHTML = `
      <header class="page-head">
        <nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الصفوف</a><span>›</span><a href="#/g/${esc(s.grade)}">${esc(gradeName(s.grade))}</a><span>›</span><span>${esc(subjectName(s.subject))}</span></nav>
        <div class="title-row"><h1>${esc(s.title)}</h1><span data-sid="${esc(s.id)}"><span data-badge>${badgeHtml(s)}</span></span></div>
        ${notPublic ? `<div class="note warn">${s.hidden ? 'هذه الحصة مخفية عن الطلاب بقرار من إدارة المنصة.' : 'هذه الحصة لا تظهر للطلاب حتى تعتمد إدارة المنصة حسابك.'}</div>` : ''}
      </header>
      <div class="sess">
        <div class="stack">
          <div class="player" id="player">${playerHtml(s)}</div>
          <div class="row">
            ${url && !isDemoVideo(url) ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">افتح في يوتيوب (للأسئلة في الدردشة)</a>` : ''}
            ${stateOf(s).key === 'upcoming' || stateOf(s).key === 'soon' ? `<a class="btn" href="${esc(calendarUrl(s))}" target="_blank" rel="noopener">أضف إلى تقويم Google</a>` : ''}
            <a class="btn" href="${esc(whatsappUrl(s))}" target="_blank" rel="noopener">مشاركة عبر واتساب</a>
            <button type="button" class="btn btn-ghost" id="copy">نسخ رابط الحصة</button>
          </div>
          ${s.description ? `<div class="box"><h2>عن الحصة</h2><p class="desc">${esc(s.description)}</p></div>` : ''}
          <div id="alts"></div>
        </div>
        <aside class="side">
          <div class="box">
            <dl class="kv">
              <dt>الصف</dt><dd><a href="#/g/${esc(s.grade)}">${esc(gradeName(s.grade))}</a></dd>
              <dt>المادة</dt><dd>${esc(subjectName(s.subject))}</dd>
              <dt>${s.kind === 'recorded' ? 'نُشر' : 'الموعد'}</dt><dd>${esc(fFull.format(new Date(s.starts_at)))}</dd>
              ${s.kind === 'recorded' ? '' : `<dt>الوقت</dt><dd>${esc(time(s.starts_at))} – ${esc(time(s.ends_at))}</dd>`}
              <dt>المدة</dt><dd>${fNum(minutes(s))} دقيقة</dd>
              <dt>النوع</dt><dd>${s.kind === 'recorded' ? 'درس مسجّل' : 'بث مباشر'}</dd>
            </dl>
          </div>
          <a class="box tcard" href="#/t/${esc(t.id || s.teacher_id)}">${avatar(t.display_name, t.avatar_url, 'av-md')}<div><b>${esc(t.display_name || 'المعلم')}</b><span>كل حصص المعلم وتسجيلاته</span></div></a>
          ${mine || admin ? `<div class="box"><h2>${mine ? 'حصتك' : 'إدارة'}</h2><div class="row">
            ${mine ? `<a class="btn btn-sm" href="#/dashboard/edit/${esc(s.id)}">تعديل الحصة</a>` : ''}
            ${admin ? `<button type="button" class="btn btn-sm${s.hidden ? '' : ' btn-danger'}" id="hide">${s.hidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}</button>` : ''}
          </div></div>` : ''}
          <details class="report box">
            <summary>الإبلاغ عن مشكلة في هذه الحصة</summary>
            <form id="report" class="stack">
              <div class="field"><label for="r-kind">نوع المشكلة</label>
                <select class="input" id="r-kind">
                  <option>محتوى غير لائق</option><option>إعلان عن دروس أو مجموعات مدفوعة</option>
                  <option>الرابط لا يعمل أو لا يخص الحصة</option><option>المعلم لم يحضر</option><option>أخرى</option>
                </select></div>
              <div class="field"><label for="r-text">التفاصيل (اختياري)</label><textarea class="input" id="r-text" maxlength="400" rows="3"></textarea></div>
              <button class="btn btn-sm" type="submit">إرسال البلاغ</button>
            </form>
          </details>
        </aside>
      </div>`;
    $('#player').dataset.h = playerHtml(s);
    $('#copy').addEventListener('click', () => copyText(pageUrl('#/s/' + s.id)));
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
      const waiting = (k === 'soon' || k === 'live') && !s.video_url;
      if (waiting && Date.now() - lastFetch > 45000) {
        lastFetch = Date.now();
        try {
          const fresh = await API.getSession(s.id);
          if (tok !== app.token || !fresh) return;
          if (fresh.video_url !== s.video_url || fresh.recording_url !== s.recording_url || fresh.status !== s.status) {
            s = fresh; remember([s]); lastKey = '';
          }
        } catch (e) { /* محاولة لاحقة */ }
      }
      if (k !== lastKey) {
        lastKey = k;
        const p = $('#player');
        if (p) { const h = playerHtml(s); if (p.dataset.h !== h) { p.innerHTML = h; p.dataset.h = h; } }
      }
    };

    // معلمون آخرون لنفس الصف في نفس الوقت
    if (s.kind === 'live') {
      try {
        const alts = (await API.listOverlapping(s.grade, s.starts_at, s.ends_at, s.id)).filter((x) => x.status === 'scheduled');
        if (tok !== app.token || !alts.length) return;
        remember(alts);
        $('#alts').innerHTML = `<div class="box"><h2>خيارات أخرى لصفك في نفس الوقت</h2><div class="alts">${alts.map((a) => `
          <a class="alt" href="#/s/${esc(a.id)}">${avatar(a.teacher && a.teacher.display_name, a.teacher && a.teacher.avatar_url, 'av-md')}
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
    const upcoming = list.filter((s) => +new Date(s.ends_at) > now && s.kind === 'live').reverse();
    const recs = list.filter((s) => videoOf(s) && (s.kind === 'recorded' ? +new Date(s.starts_at) <= now : +new Date(s.ends_at) <= now));
    view.innerHTML = `
      <header class="prof">${avatar(t.display_name, t.avatar_url, 'av-lg')}
        <div class="info"><h1>${esc(t.display_name)}</h1>${t.specialty ? `<span class="muted">${esc(t.specialty)}</span>` : ''}
          ${t.bio ? `<p class="desc">${esc(t.bio)}</p>` : ''}
          ${t.youtube_channel && isYouTube(t.youtube_channel) ? `<div class="row"><a class="btn btn-sm" href="${esc(t.youtube_channel)}" target="_blank" rel="noopener">قناة المعلم على يوتيوب</a></div>` : ''}
        </div>
      </header>
      <section class="section"><div class="section-head"><h2>الحصص القادمة</h2><span class="muted">${fNum(upcoming.length)}</span></div>
        ${upcoming.length ? `<div class="slot-cards">${upcoming.map((s) => cardHtml(s, { showGrade: true, showDay: true })).join('')}</div>` : '<div class="empty">لا توجد حصص قادمة حالياً.</div>'}
      </section>
      <section class="section"><div class="section-head"><h2>التسجيلات</h2><span class="muted">${fNum(recs.length)}</span></div>
        ${recs.length ? `<div class="vids">${recs.map(vidHtml).join('')}</div>` : '<div class="empty">لا توجد تسجيلات بعد.</div>'}
      </section>`;
  }

  async function pageTeachers(tok) {
    setNav('teachers'); setTitle('المعلمون');
    view.innerHTML = '<header class="page-head"><h1>المعلمون المتطوعون</h1><p class="muted">شكراً لكل معلم يمنح وقته وعلمه مجاناً.</p></header><div id="tlist"><p class="loading">جارٍ التحميل…</p></div>';
    try {
      const list = await API.listTeachers();
      if (tok !== app.token) return;
      $('#tlist').innerHTML = list.length
        ? `<div class="tgrid">${list.map((t) => `<a class="tcard" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url, 'av-md')}<div><b>${esc(t.display_name)}</b><span>${esc(t.specialty || 'معلم متطوع')}</span></div></a>`).join('')}</div>`
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
        <p class="muted">سجّل بحساب Google الخاص بك لتضيف حصصك وتديرها. الطلاب لا يحتاجون إلى حساب.</p>
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
        <div class="row">${avatar(p.display_name || app.user.name, avatarUrl, 'av-lg')}<span class="muted small">الصورة من حساب Google<br><span class="email">${esc(app.user.email || '')}</span></span></div>
        <div class="field"><label for="pf-name">الاسم الذي يظهر للطلاب</label>
          <input class="input" id="pf-name" required minlength="2" maxlength="60" value="${esc(p.display_name || (app.user.name ? 'أ. ' + app.user.name : ''))}" placeholder="مثال: أ. علي حسين">
          <span class="hint">يُفضّل أن يبدأ بـ «أ.» أو «د.»</span></div>
        <div class="field"><label for="pf-spec">التخصص</label>
          <input class="input" id="pf-spec" maxlength="120" value="${esc(p.specialty || '')}" placeholder="مثال: رياضيات لما بعد الأساسي — 10 سنوات خبرة"></div>
        <div class="field"><label for="pf-bio">نبذة قصيرة (اختياري)</label>
          <textarea class="input" id="pf-bio" maxlength="400" rows="3" placeholder="عرّف الطلاب بنفسك وبطريقة شرحك">${esc(p.bio || '')}</textarea></div>
        <div class="field"><label for="pf-yt">رابط قناتك على يوتيوب</label>
          <input class="input" id="pf-yt" type="url" inputmode="url" maxlength="200" value="${esc(p.youtube_channel || '')}" placeholder="https://www.youtube.com/@channel">
          <span class="hint">القناة التي ستبث منها حصصك. يساعد الإدارة على التحقق من حسابك.</span></div>
        ${first ? `<label class="check"><input type="checkbox" id="pf-ok"><span>أتعهّد بالالتزام بـ <a href="#/about" target="_blank">ميثاق المعلم المتطوع</a>: الشرح مجاني بالكامل، لا إعلانات لدروس مدفوعة، ولا تواصل خاص مع الطلاب.</span></label>` : ''}
        <div class="form-actions"><button class="btn btn-primary" type="submit">${first ? 'إنشاء ملفي' : 'حفظ التعديلات'}</button>
          ${first ? '' : '<a class="btn" href="#/dashboard">رجوع</a>'}
          <span class="spacer"></span><button type="button" class="btn btn-ghost" id="pf-out">تسجيل الخروج</button></div>
      </form>`;
    $('#pf-out').addEventListener('click', signOut);
    $('#pf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = $('#pf-name').value.trim();
      const yt = $('#pf-yt').value.trim();
      $('#pf-name').removeAttribute('aria-invalid'); $('#pf-yt').removeAttribute('aria-invalid');
      if (name.length < 2) { $('#pf-name').setAttribute('aria-invalid', 'true'); $('#pf-name').focus(); return toast('اكتب اسمك (حرفان على الأقل).', true); }
      if (yt && !/^https:\/\/(www\.|m\.)?youtube\.com\//i.test(yt)) { $('#pf-yt').setAttribute('aria-invalid', 'true'); $('#pf-yt').focus(); return toast('رابط القناة يجب أن يبدأ بـ https://www.youtube.com/', true); }
      if (first && !$('#pf-ok').checked) return toast('يرجى الموافقة على ميثاق المعلم المتطوع.', true);
      const btn = $('#pf button[type=submit]'); btn.disabled = true;
      try {
        app.profile = await API.saveProfile({ display_name: name, specialty: $('#pf-spec').value.trim(), bio: $('#pf-bio').value.trim(), youtube_channel: yt, avatar_url: avatarUrl }, !first);
        renderAuth();
        toast(first ? 'تم إنشاء ملفك. أضف حصتك الأولى!' : 'حُفظت التعديلات');
        location.hash = first ? '#/dashboard/new' : '#/dashboard';
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }

  async function signOut() {
    try { await API.signOut(); } catch (e) { /* ignore */ }
    app.user = null; app.profile = null; renderAuth();
    toast('تم تسجيل الخروج');
    location.hash = '#/';
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
    const now = Date.now();
    const upcoming = list.filter((s) => +new Date(s.ends_at) > now).reverse();
    const past = list.filter((s) => +new Date(s.ends_at) <= now);
    const missingLinks = upcoming.filter((s) => s.status === 'scheduled' && !s.video_url && +new Date(s.starts_at) - now < DAY).length;
    const row = (s) => {
      const st = stateOf(s);
      const d = new Date(s.starts_at);
      const hasLink = !!(s.video_url || s.recording_url);
      return `<div class="item${s.status === 'cancelled' ? ' cancelled' : ''}" data-id="${esc(s.id)}">
        <div class="when"><b>${esc(time(d))}</b><span>${esc(fWd.format(d))} ${esc(fDateShort.format(d))}</span></div>
        <div class="what"><b><a href="#/s/${esc(s.id)}">${esc(s.title)}</a></b>
          <div class="row"><span>${esc(gradeName(s.grade))}</span><span>·</span><span>${esc(subjectName(s.subject))}</span><span>·</span>${badgeHtml(s)}
            ${s.status === 'scheduled' ? `<span class="linkflag ${hasLink ? 'ok' : 'no'}">${hasLink ? 'الرابط موجود' : 'بلا رابط'}</span>` : ''}${s.hidden ? '<span class="pill pill-bad">مخفية</span>' : ''}</div></div>
        <div class="tools">
          <a class="btn btn-sm" href="#/dashboard/edit/${esc(s.id)}">${st.key === 'ended' || (!hasLink && s.status === 'scheduled') ? 'أضف الرابط' : 'تعديل'}</a>
          <a class="btn btn-sm btn-ghost" href="#/dashboard/copy/${esc(s.id)}">نسخ</a>
          ${+new Date(s.ends_at) > now ? `<button type="button" class="btn btn-sm btn-ghost" data-toggle="${esc(s.id)}">${s.status === 'cancelled' ? 'إعادة الحصة إلى الجدول' : 'إلغاء الحصة'}</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost btn-danger" data-del="${esc(s.id)}">حذف</button>
        </div></div>`;
    };
    view.innerHTML = `
      <header class="dash-head">${avatar(p.display_name, p.avatar_url || app.user.avatar, 'av-lg')}
        <div class="who-big"><h1>${esc(p.display_name)}</h1><div class="row">${statusPill(p.status)}${p.is_admin ? '<span class="pill">مشرف</span>' : ''}</div></div>
        <span class="spacer"></span>
        <div class="dash-actions">
          ${p.status !== 'suspended' ? '<a class="btn btn-primary" href="#/dashboard/new">+ حصة جديدة</a>' : ''}
          <a class="btn" href="#/profile">ملفي</a>
          <a class="btn" href="#/t/${esc(p.id)}">صفحتي العامة</a>
          ${p.is_admin ? '<a class="btn" href="#/admin">الإدارة</a>' : ''}
          <a class="btn btn-ghost" href="#/guide">دليل البث</a>
        </div>
      </header>
      ${p.status === 'pending' ? '<div class="note warn"><b>حسابك قيد المراجعة.</b><span>يمكنك إضافة حصصك الآن، وستظهر للطلاب بعد أن تعتمد إدارة المنصة حسابك.</span></div>' : ''}
      ${p.status === 'suspended' ? '<div class="note bad"><b>حسابك موقوف.</b><span>حصصك لا تظهر للطلاب. تواصل مع إدارة المنصة.</span></div>' : ''}
      ${missingLinks ? `<div class="note warn" style="margin-top:10px"><b>${plural(missingLinks, 'حصة واحدة', 'حصتان', 'حصص', 'حصة')} خلال 24 ساعة بلا رابط بث.</b><span>أضف رابط يوتيوب حتى يتمكن الطلاب من الدخول.</span></div>` : ''}
      <section class="section"><div class="section-head"><h2>حصصي القادمة</h2><span class="muted">${fNum(upcoming.length)}</span></div>
        ${upcoming.length ? `<div class="list">${upcoming.map(row).join('')}</div>` : `<div class="empty"><b>لا توجد حصص قادمة</b>${p.status !== 'suspended' ? '<a class="btn btn-primary" href="#/dashboard/new">أضف حصتك الأولى</a>' : ''}</div>`}
      </section>
      <section class="section"><div class="section-head"><h2>حصص سابقة</h2><span class="muted">${fNum(past.length)}</span></div>
        ${past.length ? `<div class="list">${past.slice(0, 60).map(row).join('')}</div>${past.length > 60 ? '<p class="muted small">تظهر آخر 60 حصة.</p>' : ''}` : '<div class="empty">ستظهر هنا حصصك بعد انتهائها. تأكد من وجود رابط التسجيل لكل حصة.</div>'}
      </section>
      <div class="row" style="padding-bottom:12px"><span class="spacer"></span><button type="button" class="btn btn-ghost" id="out">تسجيل الخروج</button></div>`;
    $('#out').addEventListener('click', signOut);
    $$('[data-toggle]').forEach((b) => {
      const s = list.find((x) => x.id === b.getAttribute('data-toggle'));
      const act = async () => {
        b.disabled = true;
        try { await API.updateSession(s.id, { status: s.status === 'cancelled' ? 'scheduled' : 'cancelled' }); toast(s.status === 'cancelled' ? 'أُعيدت الحصة إلى الجدول' : 'أُلغيت الحصة وسيراها الطلاب ملغاة'); route(); }
        catch (e) { toast(errMsg(e), true); b.disabled = false; }
      };
      if (s.status !== 'cancelled') armed(b, act); else b.addEventListener('click', act);
    });
    $$('[data-del]').forEach((b) => armed(b, async () => {
      try { await API.deleteSession(b.getAttribute('data-del')); toast('حُذفت الحصة'); route(); }
      catch (e) { toast(errMsg(e), true); }
    }));
  }

  // نموذج إضافة/تعديل/نسخ حصة
  async function pageSessionForm(tok, mode, id) {
    setNav(''); setTitle(mode === 'edit' ? 'تعديل الحصة' : 'حصة جديدة');
    const p = await requireTeacher(tok, location.hash);
    if (!p) return;
    if (p.status === 'suspended') { view.innerHTML = '<div class="note bad" style="margin-top:24px">حسابك موقوف ولا يمكنك إضافة حصص.</div>'; return; }
    let s = null;
    if (id) {
      try { s = (await API.mySessions()).find((x) => x.id === id) || null; } catch (e) { /* handled below */ }
      if (tok !== app.token) return;
      if (!s) return pageNotFound('لم نجد هذه الحصة في حصصك.');
    }
    const editing = mode === 'edit';
    const src = s || {};
    const lastGrade = store.get('t-grade') || store.get('grade') || '';
    const grade = src.grade || lastGrade;
    let start = src.starts_at ? new Date(src.starts_at) : null;
    if (mode === 'copy' && start) { start = addDays(start, 7); while (start < new Date()) start = addDays(start, 7); }
    if (!start) { start = new Date(Date.now() + 2 * 3600e3); start.setMinutes(0, 0, 0); }
    const dur = src.starts_at ? minutes(src) : 60;
    const dVal = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const tVal = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const kind = src.kind || 'live';
    const durs = [20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
    if (!durs.includes(dur)) durs.push(dur);
    durs.sort((a, b) => a - b);
    const isPast = editing && +new Date(src.ends_at) <= Date.now();

    view.innerHTML = `
      <header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>${editing ? 'تعديل حصة' : mode === 'copy' ? 'نسخ حصة' : 'حصة جديدة'}</span></nav>
        <h1>${editing ? 'تعديل الحصة' : mode === 'copy' ? 'نسخ الحصة إلى موعد جديد' : 'إضافة حصة جديدة'}</h1></header>
      <form class="form" id="sf" novalidate>
        <div class="field"><span class="lbl">نوع الحصة</span>
          <div class="seg">
            <label><input type="radio" name="kind" value="live"${kind === 'live' ? ' checked' : ''}> بث مباشر في موعد محدد</label>
            <label><input type="radio" name="kind" value="recorded"${kind === 'recorded' ? ' checked' : ''}> درس مسجّل (فيديو جاهز على يوتيوب)</label>
          </div></div>
        <div class="grid2">
          <div class="field"><label for="sf-grade">الصف</label>
            <select class="input" id="sf-grade" required><option value="">اختر الصف</option>
              ${C.STAGES.map((st) => `<optgroup label="${esc(st.name)}">${st.grades.map((g) => `<option value="${esc(g.id)}"${g.id === grade ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}
            </select></div>
          <div class="field"><label for="sf-subj">المادة</label><select class="input" id="sf-subj" required></select></div>
        </div>
        <div class="field"><label for="sf-title">عنوان الحصة</label>
          <input class="input" id="sf-title" required minlength="3" maxlength="120" value="${esc(src.title || '')}" placeholder="مثال: الفصل الثالث — حل المعادلات من الدرجة الثانية"></div>
        <div class="field"><label for="sf-desc">وصف الحصة (اختياري)</label>
          <textarea class="input" id="sf-desc" maxlength="1500" rows="4" placeholder="ماذا سيتعلم الطالب؟ ماذا يحضّر قبل الحصة؟">${esc(src.description || '')}</textarea></div>
        <div class="grid3">
          <div class="field"><label for="sf-date" id="lbl-date">التاريخ</label><input class="input" id="sf-date" type="date" required value="${dVal}"></div>
          <div class="field"><label for="sf-time" id="lbl-time">وقت البدء</label><input class="input" id="sf-time" type="time" required value="${tVal}" step="300"></div>
          <div class="field"><label for="sf-dur" id="lbl-dur">المدة</label><select class="input" id="sf-dur">${durs.map((m) => `<option value="${m}"${m === dur ? ' selected' : ''}>${fNum(m)} دقيقة</option>`).join('')}</select></div>
        </div>
        ${editing ? '' : `<div class="field" id="rep-field"><label for="sf-rep">التكرار</label>
          <select class="input" id="sf-rep"><option value="1">مرة واحدة</option>${[2, 3, 4, 6, 8, 10, 12, 16].map((n) => `<option value="${n}">${n === 2 ? 'كل أسبوع لمدة أسبوعين' : `كل أسبوع لمدة ${fNum(n)} ${n <= 10 ? 'أسابيع' : 'أسبوعاً'}`}</option>`).join('')}</select>
          <span class="hint">ينشئ حصة في نفس اليوم والوقت من كل أسبوع.</span></div>`}
        <div id="peers"></div>
        <div class="field"><label for="sf-url" id="lbl-url">رابط البث على يوتيوب</label>
          <input class="input" id="sf-url" type="url" inputmode="url" maxlength="300" value="${esc(mode === 'copy' && kind === 'live' ? '' : (src.video_url || ''))}" placeholder="https://www.youtube.com/live/...">
          <span class="hint" id="hint-url">يمكنك إضافته لاحقاً. أنشئ بثاً مجدولاً في YouTube Studio وضع رابطه هنا، وسيصبح نفس الرابط هو التسجيل بعد الحصة. <a href="#/guide" target="_blank">كيف؟</a></span></div>
        <div class="field" id="rec-field"${editing || isPast ? '' : ' hidden'}><label for="sf-rec">رابط التسجيل (إذا كان مختلفاً عن رابط البث)</label>
          <input class="input" id="sf-rec" type="url" inputmode="url" maxlength="300" value="${esc(src.recording_url || '')}" placeholder="https://youtu.be/...">
          <span class="hint">اتركه فارغاً إذا بقي التسجيل على نفس رابط البث.</span></div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${editing ? 'حفظ التعديلات' : 'نشر الحصة'}</button>
          <a class="btn" href="#/dashboard">إلغاء</a>
        </div>
      </form>`;

    const gSel = $('#sf-grade');
    const sSel = $('#sf-subj');
    function fillSubjects(keep) {
      const list = gSel.value ? subjectsOf(gSel.value) : [];
      const cur = keep || sSel.value;
      sSel.innerHTML = `<option value="">${gSel.value ? 'اختر المادة' : 'اختر الصف أولاً'}</option>` + list.map((x) => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(subjectName(x))}</option>`).join('');
      if (cur && !list.includes(cur) && C.SUBJECTS[cur]) sSel.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" selected>${esc(subjectName(cur))}</option>`);
    }
    fillSubjects(src.subject || store.get('t-subject') || '');
    const kindNow = () => (($('input[name=kind]:checked') || {}).value || 'live');
    function applyKind() {
      const rec = kindNow() === 'recorded';
      $('#lbl-date').textContent = rec ? 'تاريخ النشر' : 'التاريخ';
      $('#lbl-time').textContent = rec ? 'وقت النشر' : 'وقت البدء';
      $('#lbl-dur').textContent = rec ? 'طول الفيديو تقريباً' : 'المدة';
      $('#lbl-url').textContent = rec ? 'رابط الفيديو على يوتيوب' : 'رابط البث على يوتيوب';
      $('#hint-url').innerHTML = rec ? 'ارفع الفيديو إلى قناتك (عام أو غير مدرج) ثم الصق رابطه هنا.' : 'يمكنك إضافته لاحقاً. أنشئ بثاً مجدولاً في YouTube Studio وضع رابطه هنا، وسيصبح نفس الرابط هو التسجيل بعد الحصة. <a href="#/guide" target="_blank">كيف؟</a>';
      const rf = $('#rep-field'); if (rf) rf.hidden = rec;
      if (rec && !editing && !src.starts_at) {
        const n = new Date(); $('#sf-date').value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; $('#sf-time').value = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
      }
      peers();
    }
    function readTimes() {
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
    ['#sf-date', '#sf-time', '#sf-dur'].forEach((s2) => $(s2).addEventListener('change', peers));
    $$('input[name=kind]').forEach((r) => r.addEventListener('change', applyKind));
    applyKind();

    $('#sf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $$('#sf [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      const bad = (sel, msg) => { const el = $(sel); el.setAttribute('aria-invalid', 'true'); el.focus(); toast(msg, true); return false; };
      const k = kindNow();
      const title = $('#sf-title').value.trim();
      const url = $('#sf-url').value.trim();
      const recUrl = $('#sf-rec') ? $('#sf-rec').value.trim() : '';
      const tm = readTimes();
      if (!gSel.value) return bad('#sf-grade', 'اختر الصف.');
      if (!sSel.value) return bad('#sf-subj', 'اختر المادة.');
      if (title.length < 3) return bad('#sf-title', 'اكتب عنواناً للحصة (3 أحرف على الأقل).');
      if (!tm) return bad('#sf-date', 'حدّد التاريخ والوقت.');
      if (url && !isYouTube(url)) return bad('#sf-url', 'الرابط يجب أن يكون من يوتيوب (youtube.com أو youtu.be).');
      if (recUrl && !isYouTube(recUrl)) return bad('#sf-rec', 'رابط التسجيل يجب أن يكون من يوتيوب.');
      if (k === 'recorded' && !url) return bad('#sf-url', 'ضع رابط الفيديو المسجّل.');
      if (k === 'live' && !editing && +tm.start < Date.now() - 30 * MIN) return bad('#sf-date', 'هذا الموعد في الماضي. اختر وقتاً قادماً.');
      const base = {
        grade: gSel.value, subject: sSel.value, title, description: $('#sf-desc').value.trim() || null, kind: k,
        starts_at: tm.start.toISOString(), ends_at: tm.end.toISOString(), video_url: url || null,
      };
      if (editing) base.recording_url = recUrl || null;
      const btn = $('#sf button[type=submit]'); btn.disabled = true;
      store.set('t-grade', gSel.value); store.set('t-subject', sSel.value);
      try {
        if (editing) {
          await API.updateSession(id, base);
          toast('حُفظت التعديلات');
          location.hash = '#/dashboard';
        } else {
          const n = k === 'live' && $('#sf-rep') ? Number($('#sf-rep').value) : 1;
          const rows = Array.from({ length: n }, (_, i) => Object.assign({}, base, {
            starts_at: addDays(tm.start, 7 * i).toISOString(), ends_at: addDays(tm.end, 7 * i).toISOString(),
            video_url: i === 0 ? base.video_url : null,
          }));
          const made = await API.createSessions(rows);
          toast(n > 1 ? 'نُشرت ' + plural(n, 'حصة واحدة', 'حصتان أسبوعيتان', 'حصص أسبوعية', 'حصة أسبوعية') : 'نُشرت الحصة');
          location.hash = made && made[0] && n === 1 ? '#/s/' + made[0].id : '#/dashboard';
        }
      } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    });
  }

  // ------------------------------------------------------------------
  //  لوحة الإدارة
  // ------------------------------------------------------------------
  async function pageAdmin(tok, tab) {
    setNav(''); setTitle('الإدارة');
    const p = await requireTeacher(tok, '#/admin');
    if (!p) return;
    if (!p.is_admin) { view.innerHTML = '<div class="empty" style="margin-top:24px"><b>هذه الصفحة للمشرفين فقط</b><a class="btn" href="#/dashboard">لوحتي</a></div>'; return; }
    tab = tab || 'teachers';
    view.innerHTML = `
      <header class="page-head"><nav class="crumbs"><a href="#/dashboard">لوحتي</a><span>›</span><span>الإدارة</span></nav><h1>إدارة المنصة</h1>
        <nav class="tabs"><a href="#/admin/teachers"${tab === 'teachers' ? ' aria-current="page"' : ''}>المعلمون</a><a href="#/admin/reports"${tab === 'reports' ? ' aria-current="page"' : ''}>البلاغات</a><a href="#/admin/settings"${tab === 'settings' ? ' aria-current="page"' : ''}>الإعدادات</a></nav>
      </header><div id="adm" class="section"><p class="loading">جارٍ التحميل…</p></div>`;
    const box = $('#adm');
    try {
      if (tab === 'teachers') {
        const list = await API.adminTeachers();
        if (tok !== app.token) return;
        const pending = list.filter((t) => t.status === 'pending').length;
        box.innerHTML = `<p class="muted">${plural(list.length, 'معلم واحد', 'معلمان', 'معلمين', 'معلماً')} · ${pending ? `<b>${fNum(pending)} بانتظار المراجعة</b>` : 'لا أحد بانتظار المراجعة'}</p>
          <div class="atable-wrap"><table class="atable"><thead><tr><th>المعلم</th><th>البريد</th><th>التخصص والقناة</th><th>الحصص</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
          ${list.map((t) => `<tr>
            <td><a class="who" href="#/t/${esc(t.id)}">${avatar(t.display_name, t.avatar_url)}<span>${esc(t.display_name)}</span></a><span class="muted small">انضم ${esc(fDateShort.format(new Date(t.created_at)))}</span></td>
            <td class="email">${esc(t.email || '')}</td>
            <td>${esc(t.specialty || '—')}${t.youtube_channel && isYouTube(t.youtube_channel) ? `<br><a href="${esc(t.youtube_channel)}" target="_blank" rel="noopener">القناة</a>` : ''}</td>
            <td class="num">${fNum(t.sessions_count || 0)}</td>
            <td>${statusPill(t.status)}${t.is_admin ? ' <span class="pill">مشرف</span>' : ''}</td>
            <td><div class="row">
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
          <label class="check"><input type="checkbox" id="set-auto"${st.auto_approve ? ' checked' : ''}><span><b>اعتماد المعلمين الجدد تلقائياً</b><br><span class="muted small">إذا أُطفئ هذا الخيار، لا تظهر حصص المعلم الجديد للطلاب حتى تعتمده من تبويب «المعلمون». يُنصح بإطفائه.</span></span></label>
          <div class="field"><label for="set-notice">إعلان أعلى المنصة (اختياري)</label><textarea class="input" id="set-notice" maxlength="300" rows="2" placeholder="مثال: تبدأ مراجعات امتحانات الدبلوم يوم الأحد">${esc(st.site_notice || '')}</textarea></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div></form>`;
        $('#setf').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const b = $('#setf button'); b.disabled = true;
          try {
            await API.adminSaveSettings({ auto_approve: $('#set-auto').checked, site_notice: $('#set-notice').value.trim() || null });
            app.settings = await API.settings(); renderBanners(); toast('حُفظت الإعدادات');
          } catch (e) { toast(errMsg(e), true); }
          b.disabled = false;
        });
      }
    } catch (e) { if (tok === app.token) box.innerHTML = errorBox(e); }
  }

  // ------------------------------------------------------------------
  //  صفحات ثابتة
  // ------------------------------------------------------------------
  function pageGuide() {
    setNav(''); setTitle('دليل المعلم');
    view.innerHTML = `
      <header class="page-head"><h1>دليل المعلم: كيف تشرح حصتك مع مشاركة الشاشة</h1>
        <p class="muted">البث والتسجيل يجريان على قناتك في يوتيوب مجاناً، والمنصة تعرض الحصة في جدول الطلاب.</p></header>
      <article class="prose">
        <h2>أولاً: جهّز قناتك (مرة واحدة، قبل أول حصة بيوم)</h2>
        <ol>
          <li>ادخل إلى <a href="https://studio.youtube.com" target="_blank" rel="noopener">YouTube Studio</a> بحساب Google. إن لم تكن لديك قناة سيطلب منك إنشاءها.</li>
          <li>وثّق القناة برقم هاتفك من <a href="https://www.youtube.com/verify" target="_blank" rel="noopener">youtube.com/verify</a> (رسالة SMS أو اتصال صوتي).</li>
          <li>اضغط <b>إنشاء ← بث مباشر</b> <span class="path">(Create → Go live)</span> لطلب تفعيل البث. <b>التفعيل الأول قد يستغرق حتى 24 ساعة</b>، لذلك افعله مبكراً.</li>
        </ol>
        <h2>ثانياً: أضف حصتك في المنصة</h2>
        <ol>
          <li>من <a href="#/dashboard">لوحتي</a> اضغط <b>حصة جديدة</b>، واختر الصف والمادة والوقت.</li>
          <li>يمكنك ترك رابط البث فارغاً الآن وإضافته لاحقاً من زر <b>أضف الرابط</b>.</li>
          <li>لا بأس إن كان معلم آخر يشرح لنفس الصف في نفس الوقت؛ الطالب يختار.</li>
        </ol>
        <h2>ثالثاً: احصل على رابط البث</h2>
        <p><b>الطريقة المفضّلة — رابط مسبق:</b> في YouTube Studio اختر <b>إنشاء ← بث مباشر ← إدارة ← جدولة بث</b> <span class="path">(Manage → Schedule stream)</span>، واكتب عنوان الحصة وموعدها. انسخ رابط المشاهدة وضعه في حصتك على المنصة. هكذا يرى الطلاب الرابط قبل الحصة.</p>
        <p><b>الطريقة السريعة:</b> ابدأ البث في وقت الحصة، ثم انسخ رابطه وضعه في الحصة فوراً. صفحة الحصة عند الطلاب تتحدّث تلقائياً خلال أقل من دقيقة.</p>
        <h2>رابعاً: ابدأ البث وشارك شاشتك</h2>
        <ol>
          <li>على حاسوبك افتح YouTube Studio بمتصفح <b>Chrome</b> أو <b>Firefox</b>، ثم <b>إنشاء ← بث مباشر ← كاميرا الويب</b> <span class="path">(Webcam)</span>.</li>
          <li>بعد بدء البث اضغط زر <b>مشاركة الشاشة</b> <span class="path">(SHARE SCREEN)</span> واختر الشاشة كاملة أو نافذة السبورة أو ملف العرض.</li>
          <li>يحتاج هذا الوضع إلى كاميرا ومايكروفون موصولين بالحاسوب.</li>
          <li><b>إن لم يظهر لك زر مشاركة الشاشة:</b> استخدم برنامج <a href="https://obsproject.com" target="_blank" rel="noopener">OBS Studio</a> المجاني. أضف مصدراً من نوع <span class="path">Display Capture</span>، ثم من <span class="path">Settings → Stream</span> اختر YouTube واضغط <span class="path">Connect Account</span>. يمكنه أيضاً حفظ نسخة على حاسوبك في حال انقطاع الكهرباء أو الإنترنت.</li>
        </ol>
        <h2>خامساً: بعد الحصة</h2>
        <ul>
          <li>يحفظ يوتيوب البث تلقائياً على <b>نفس الرابط</b> (للبث الأقصر من 12 ساعة)، وقد يحتاج بعض الوقت للمعالجة.</li>
          <li>إن انقطع البث وبدأت بثاً جديداً، أو رفعت التسجيل كفيديو منفصل، ضع الرابط الجديد في خانة <b>رابط التسجيل</b>.</li>
        </ul>
        <h2>تشرح من الهاتف فقط؟</h2>
        <p>البث المباشر من تطبيق يوتيوب على الهاتف يتطلب عدداً من المشتركين (50 على الأقل حالياً). البديل السهل: سجّل شاشة هاتفك مع صوتك بمسجّل الشاشة المدمج، ارفع الفيديو إلى قناتك، ثم أضفه في المنصة كـ<b>درس مسجّل</b>.</p>
        <h2>نصائح مهمة</h2>
        <ul>
          <li>اجعل البث <b>عاماً</b> أو <b>غير مدرج</b> <span class="path">(Unlisted)</span>، وليس <b>خاصاً</b>، وإلا لن يراه الطلاب.</li>
          <li>اترك خيار <b>السماح بالتضمين</b> <span class="path">(Allow embedding)</span> مفعّلاً ليعمل الفيديو داخل المنصة.</li>
          <li>اختر إعداد <b>«مخصص للأطفال»</b> بصدق كما تطلب قواعد يوتيوب. محتوى الأطفال الصغار يُعلَّم «مخصص للأطفال»، وهذا يوقف الدردشة والتعليقات.</li>
          <li>لا تشغّل موسيقى أو مقاطع محمية بحقوق النشر؛ قد يوقف يوتيوب البث.</li>
          <li>سماعة بمايكروفون بسيطة تحسّن الصوت كثيراً، والصوت أهم من الصورة في الشرح.</li>
          <li>إن لم تستطع الحضور، ألغِ الحصة من لوحتك مبكراً ليراها الطلاب «ملغاة».</li>
        </ul>
        <p><a class="btn btn-primary" href="#/dashboard">إلى لوحتي</a></p>
      </article>`;
  }

  function pageAbout() {
    setNav('about'); setTitle('عن المنصة');
    view.innerHTML = `
      <header class="page-head"><h1>عن ${esc(C.SITE_NAME)}</h1></header>
      <article class="prose">
        <p>${esc(C.SITE_NAME)} منصة مجانية بالكامل. معلمون متطوعون يضيفون حصصهم المباشرة في جدول عام، وأي طالب يستطيع الحضور أو مشاهدة التسجيل دون حساب ودون أي رسوم.</p>
        <h2>للطلاب</h2>
        <ul>
          <li>اختر صفّك، ثم اليوم، ثم الحصة مع المعلم الذي تفضّله. قد يشرح أكثر من معلم لنفس الصف في نفس الوقت.</li>
          <li>زر «ذكّرني في التقويم» يضيف الحصة إلى تقويم هاتفك.</li>
          <li>إذا رأيت شيئاً غير لائق، استخدم زر «الإبلاغ عن مشكلة» في صفحة الحصة.</li>
          <li>لا تشارك رقم هاتفك أو حساباتك الخاصة في دردشة البث.</li>
        </ul>
        <h2>ميثاق المعلم المتطوع</h2>
        <ol>
          <li>الشرح مجاني بالكامل. لا إعلانات لدروس خصوصية أو دورات أو مجموعات مدفوعة.</li>
          <li>لا تواصل خاص مع الطلاب، ولا طلب أرقام هواتفهم أو حساباتهم.</li>
          <li>محتوى تعليمي محترم يناسب أعمار الطلاب، دون مواد محمية بحقوق النشر.</li>
          <li>الالتزام بموعد الحصة، أو إلغاؤها من اللوحة مبكراً.</li>
          <li>الإبقاء على تسجيلات الحصص متاحة قدر الإمكان لمن فاتته الحصة.</li>
        </ol>
        <p>يحق لإدارة المنصة إخفاء أي حصة أو إيقاف أي حساب يخالف الميثاق.</p>
        <h2>الخصوصية</h2>
        <p>لا تجمع المنصة أي بيانات عن الطلاب. للمعلمين نحفظ: الاسم الظاهر، التخصص، النبذة، رابط القناة، والصورة من حساب Google. البريد الإلكتروني يراه المشرفون فقط ولا يظهر للعامة. الفيديوهات تُعرض من يوتيوب وتخضع لسياسات يوتيوب.</p>
        ${C.CONTACT ? `<h2>التواصل مع الإدارة</h2><p><span class="path">${esc(C.CONTACT)}</span></p>` : ''}
      </article>`;
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
    [/^#\/g\/([\w-]+)(?:\/(rec))?$/, (t, m) => pageGrade(t, m[1], m[2])],
    [/^#\/s\/([\w-]+)$/, (t, m) => pageSession(t, m[1])],
    [/^#\/t\/([\w-]+)$/, (t, m) => pageTeacher(t, m[1])],
    [/^#\/teachers$/, (t) => pageTeachers(t)],
    [/^#\/guide$/, () => pageGuide()],
    [/^#\/about$/, () => pageAbout()],
    [/^#\/dashboard$/, (t) => pageDashboard(t)],
    [/^#\/dashboard\/new$/, (t) => pageSessionForm(t, 'new')],
    [/^#\/dashboard\/edit\/([\w-]+)$/, (t, m) => pageSessionForm(t, 'edit', m[1])],
    [/^#\/dashboard\/copy\/([\w-]+)$/, (t, m) => pageSessionForm(t, 'copy', m[1])],
    [/^#\/profile$/, (t) => pageProfile(t, false)],
    [/^#\/admin(?:\/(teachers|reports|settings))?$/, (t, m) => pageAdmin(t, m[1])],
  ];
  let lastHash = null;
  let booted = false;
  async function route() {
    if (location.hash === '#view') { history.replaceState(null, '', lastHash || '#/'); view.focus(); if (lastHash) return; }
    const tok = ++app.token;
    pageTick = null;
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
    API.onAuth(async (u) => {
      app.user = u;
      app.profile = undefined;
      if (u) await loadProfile().catch(() => {});
      renderAuth();
    });
    try { app.user = await API.init(); }
    catch (e) { toast(errMsg(e), true); }
    if (app.user) await loadProfile().catch(() => {});
    renderAuth();
    try { app.settings = await API.settings(); } catch (e) { app.settings = {}; }
    renderBanners();
    document.querySelector('.skip').addEventListener('click', (e) => { e.preventDefault(); view.focus(); });
    window.addEventListener('hashchange', route);
    route();
  }
  boot();
})();
