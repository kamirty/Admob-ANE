/* =====================================================================
   طبقة البيانات: Supabase في التشغيل الحقيقي، أو بيانات تجريبية محلية
   عندما لا تكون مفاتيح Supabase موجودة في config.js
   ===================================================================== */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const AUTH_KEY = 'midrar-auth';
  const BASE_COLS = 'id,grade,subject,title,kind,starts_at,ends_at,video_url,recording_url,status,hidden,teacher_id,teacher:teachers(id,display_name,avatar_url)';
  // الأعمدة على مراحل: v4 (مكان الدرس في الكتاب) ثم v5 (المهارات والاختبار والمراجعة)
  const V4_COLS = ',term,unit,unit_title,lesson_type,exam_year,exam_round';
  const V5_COLS = ',skill_name,level,ages';
  const EXTRA_COLS = ',quiz,attachments,review,review_note';
  const PLACE_KEYS = ['term', 'unit', 'unit_title', 'lesson_type', 'exam_year', 'exam_round', 'request_id', 'skill_name', 'level', 'ages', 'quiz', 'attachments'];
  const V5_KEYS = ['skill_name', 'level', 'ages', 'quiz', 'attachments'];
  const strip = (o, keys) => { const x = Object.assign({}, o); keys.forEach((k) => delete x[k]); return x; };
  const noV5 = (o) => strip(o, V5_KEYS);
  const noPlace = (o) => strip(o, PLACE_KEYS);
  const oldDb = (e) => !!e && (e.code === 'PGRST204' || e.code === '42703');
  let colTier = 2;
  let LIST_COLS = BASE_COLS + V4_COLS + V5_COLS;
  let FULL_COLS = LIST_COLS + ',description,created_at' + EXTRA_COLS;
  // إن رُفع الموقع قبل تحديث قاعدة البيانات: نعمل بالأعمدة الأقدم خطوة خطوة بدل أن تتعطل الصفحات
  function legacyCols() {
    if (colTier === 0) return false;
    colTier--;
    LIST_COLS = BASE_COLS + (colTier ? V4_COLS : '');
    FULL_COLS = LIST_COLS + ',description,created_at';
    return true;
  }
  const ALL_COLS = [2, 1, 0].flatMap((t) => { const l = BASE_COLS + (t ? V4_COLS : '') + (t > 1 ? V5_COLS : ''); return [l, l + ',description,created_at' + (t > 1 ? EXTRA_COLS : '')]; });
  // طلب فشل بأعمدة used: إن خفّض طلبٌ آخر الأعمدة في الأثناء نعيد المحاولة بالحالية دون خفض جديد
  const lowerFrom = (used) => (used === LIST_COLS || used === FULL_COLS ? legacyCols() : ALL_COLS.includes(used));
  const iso = (d) => new Date(d).toISOString();
  // «الآن» مقرّباً للدقيقة حتى تتطابق الطلبات المتكررة
  const isoMin = () => { const d = new Date(); d.setSeconds(0, 0); return d.toISOString(); };
  // توحيد النص العربي للبحث (نفس دالة ar_norm في قاعدة البيانات)
  const arNorm = (t) => String(t || '').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[\u064B-\u0652\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  const ytKey = (url) => { const m = /(?:youtu\.be\/|[?&]v=|\/(?:live|shorts|embed)\/)([A-Za-z0-9_-]{11})/.exec(url || ''); return m ? m[1] : url; };

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  // تحويل أخطاء قاعدة البيانات إلى رسائل مفهومة
  function friendly(err) {
    const code = err && (err.code || (err.details && err.details.code));
    const msg = (err && (err.message || err.error_description || err.msg)) || '';
    if (code === '23P01') return 'لديك حصة مباشرة أخرى تتداخل مع هذا الوقت. غيّر الوقت أو ألغِ الحصة الأخرى.';
    if (code === '23514') return 'بعض البيانات غير صالحة. تأكد من الرابط (يجب أن يكون من يوتيوب) ومن طول العنوان والمدة.';
    if (code === '42501' && /[؀-ۿ]/.test(msg)) return msg;
    if (code === '42501') return 'ليست لديك صلاحية لهذا الإجراء. إذا كان حسابك موقوفاً تواصل مع إدارة المنصة.';
    if (code === '42703' || code === 'PGRST204' || code === 'PGRST202') return 'قاعدة البيانات تحتاج تحديثاً: شغّل ملف supabase/schema.sql من جديد في Supabase.';
    if (code === 'PGRST301' || /JWT/i.test(msg)) return 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'تعذّر الاتصال بالإنترنت. تحقق من الاتصال وحاول مجدداً.';
    if (/[؀-ۿ]/.test(msg)) return msg; // رسائل عربية من قاعدة البيانات نفسها
    return 'حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.';
  }
  class ApiError extends Error {
    constructor(err) { super(friendly(err)); this.code = err && err.code; this.raw = err; }
  }

  // ===================================================================
  //  التشغيل الحقيقي: Supabase
  // ===================================================================
  function liveApi() {
    const BASE = C.SUPABASE_URL.replace(/\/+$/, '');
    const KEY = C.SUPABASE_ANON_KEY;
    // المفاتيح القديمة (JWT) تُرسل أيضاً كـ Bearer؛ المفاتيح الجديدة sb_publishable_ تكفيها ترويسة apikey
    const AUTHZ = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
    let sb = null;
    let loading = null;
    let user = null;
    const listeners = [];

    // قراءة عامة خفيفة بدون تحميل مكتبة Supabase (للطلاب)
    async function rest(table, pairs) {
      try { return await restRaw(table, pairs); }
      catch (e) {
        const sel = pairs.find((p) => p[0] === 'select');
        if (e.code === '42703' && sel && ALL_COLS.includes(sel[1])) {
          const full = ALL_COLS.indexOf(sel[1]) % 2 === 1;
          if (!lowerFrom(sel[1])) throw e;
          return rest(table, pairs.map((p) => (p[0] === 'select' ? ['select', full ? FULL_COLS : LIST_COLS]
            : p[0] === 'order' && !colTier ? ['order', p[1].replace('term.asc.nullslast,unit.asc.nullslast,', '')] : p)));
        }
        throw e;
      }
    }
    async function restRaw(table, pairs) {
      const qs = new URLSearchParams(pairs).toString();
      let res;
      try {
        res = await fetch(`${BASE}/rest/v1/${table}?${qs}`, {
          headers: Object.assign({ apikey: KEY, Accept: 'application/json' }, AUTHZ),
        });
      } catch (e) { throw new ApiError(e); }
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch (e) { /* not json */ }
        throw new ApiError(body);
      }
      return res.json();
    }
    async function rpcPublic(fn, args) {
      let res;
      try {
        res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, AUTHZ),
          body: JSON.stringify(args),
        });
      } catch (e) { throw new ApiError(e); }
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch (e) { /* not json */ }
        throw new ApiError(body);
      }
      if (res.status === 204) return null;
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    }

    function loadLib() {
      if (window.supabase && window.supabase.createClient) return Promise.resolve();
      if (loading) return loading;
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'assets/vendor/supabase.js';
        s.onload = () => resolve();
        s.onerror = () => { loading = null; reject(new ApiError({ message: 'Failed to fetch' })); };
        document.head.appendChild(s);
      });
      return loading;
    }
    function toUser(session) {
      if (!session || !session.user) return null;
      const u = session.user;
      const m = u.user_metadata || {};
      return { id: u.id, email: u.email, name: m.full_name || m.name || '', avatar: m.avatar_url || m.picture || '' };
    }
    async function client() {
      if (sb) return sb;
      await loadLib();
      sb = window.supabase.createClient(BASE, KEY, {
        auth: { flowType: 'pkce', storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      sb.auth.onAuthStateChange((_evt, session) => {
        const next = toUser(session);
        const changed = (next && next.id) !== (user && user.id);
        user = next;
        if (changed) listeners.forEach((fn) => fn(user));
      });
      return sb;
    }
    function check(r) { if (r.error) throw new ApiError(r.error); return r.data; }
    async function authed() {
      const c = await client();
      if (!user) throw new ApiError({ code: 'PGRST301' });
      return c;
    }

    return {
      mode: 'live',
      async init() {
        const q = new URLSearchParams(location.search);
        const returning = q.has('code') || q.has('error_description');
        const hasStored = !!storeGet(AUTH_KEY);
        if (q.has('error_description')) {
          history.replaceState(null, '', location.pathname + location.hash);
          throw new ApiError({ message: 'تعذّر تسجيل الدخول بحساب Google. حاول مرة أخرى.' });
        }
        if (!returning && !hasStored) return null;
        const c = await client();
        const { data, error } = await c.auth.getSession();
        user = toUser(data && data.session);
        if (returning && (error || !user)) {
          history.replaceState(null, '', location.pathname);
          throw new ApiError({ message: 'تعذّر إكمال الدخول. افتح الموقع من عنوانه الرئيسي وحاول مرة أخرى.' });
        }
        if (returning) {
          let after = '#/dashboard';
          try { const a = sessionStorage.getItem('midrar-after-login'); if (a && /^#\/[\w\/-]*$/.test(a)) after = a; sessionStorage.removeItem('midrar-after-login'); } catch (e) { /* ignore */ }
          history.replaceState(null, '', location.pathname + after);
        }
        return user;
      },
      onAuth(fn) { listeners.push(fn); },
      currentUser() { return user; },
      async signIn(after) {
        try { sessionStorage.setItem('midrar-after-login', after || '#/dashboard'); } catch (e) { /* ignore */ }
        const c = await client();
        const r = await c.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
        });
        check(r);
      },
      async signOut() {
        const c = await client();
        const r = await c.auth.signOut();
        if (r && r.error) await c.auth.signOut({ scope: 'local' });
        try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
        user = null;
        listeners.forEach((fn) => fn(null));
      },

      // ---------- قراءة عامة ----------
      async settings() {
        let rows;
        try { rows = await restRaw('settings', [['select', 'site_notice,auto_approve,requests_on,views_on,request_min_votes,featured_session'], ['id', 'eq.1']]); }
        catch (e) {
          if (e.code !== '42703') throw e;
          try { rows = await restRaw('settings', [['select', 'site_notice,auto_approve,requests_on,views_on,request_min_votes'], ['id', 'eq.1']]); return rows[0] || {}; }
          catch (e2) { if (e2.code !== '42703') throw e2; }
          // قاعدة بيانات قديمة: الميزات الجديدة متوقفة حتى يُشغَّل schema.sql
          rows = (await restRaw('settings', [['select', 'site_notice,auto_approve'], ['id', 'eq.1']]))
            .map((r) => Object.assign(r, { requests_on: false, views_on: false, legacy: true }));
        }
        return rows[0] || {};
      },
      listSchedule(grade, from, to) {
        return rest('sessions', [['select', LIST_COLS], ['grade', 'eq.' + grade], ['starts_at', 'gte.' + iso(from)],
          ['starts_at', 'lt.' + iso(to)], ['order', 'starts_at.asc'], ['limit', '600']]);
      },
      listLiveNow() {
        const now = Date.now();
        return rest('sessions', [['select', LIST_COLS], ['kind', 'eq.live'], ['status', 'eq.scheduled'],
          ['starts_at', 'lte.' + iso(now + C.JOIN_EARLY_MIN * 60000)], ['ends_at', 'gt.' + iso(now)],
          ['order', 'starts_at.asc'], ['limit', '60']]);
      },
      listRecordings(grade, subject, offset, limit) {
        const p = [['select', LIST_COLS], ['grade', 'eq.' + grade], ['status', 'eq.scheduled'],
          ['starts_at', 'lte.' + isoMin()], ['or', '(video_url.not.is.null,recording_url.not.is.null)'],
          ['order', 'starts_at.desc,id.desc'], ['limit', String(limit)], ['offset', String(offset)]];
        if (subject) p.push(['subject', 'eq.' + subject]);
        return rest('sessions', p);
      },
      // دروس مادة واحدة مرتبة كما في الكتاب: الفصل الدراسي ← الوحدة ← تاريخ النشر
      listSubjectLessons(grade, subject) {
        return rest('sessions', [['select', LIST_COLS], ['grade', 'eq.' + grade], ['subject', 'eq.' + subject], ['status', 'eq.scheduled'],
          ['starts_at', 'lte.' + isoMin()], ['or', '(video_url.not.is.null,recording_url.not.is.null)'],
          ['order', LIST_COLS === BASE_COLS ? 'starts_at.asc,id.asc' : 'term.asc.nullslast,unit.asc.nullslast,starts_at.asc,id.asc'], ['limit', '800']]);
      },
      searchLessons(grade, q, subject) {
        return rest('rpc/search_lessons', [['p_grade', grade], ['p_q', q], ['p_subject', subject || ''], ['select', LIST_COLS]]);
      },
      // دروس امتحانات الدبلوم المحلولة لصف (لمربع «أسئلة الدبلوم السابقة»)
      listExamLessons(grade) {
        return rest('sessions', [['select', 'id,subject,exam_year'], ['grade', 'eq.' + grade], ['lesson_type', 'eq.exam'], ['status', 'eq.scheduled'],
          ['starts_at', 'lte.' + isoMin()], ['video_url', 'not.is.null'], ['limit', '1000']]).catch(() => []);
      },
      requestLesson(r) {
        return rpcPublic('request_lesson', { p_grade: r.grade, p_subject: r.subject, p_term: r.term || null, p_unit: r.unit || null, p_topic: r.topic || null });
      },
      countView(id) { return rpcPublic('count_view', { p_session: id }); },
      thankLesson(id, kind) { return rpcPublic('thank_lesson', { p_session: id, p_kind: kind }); },
      async verifyCertificate(code) { const rows = await rpcPublic('verify_certificate', { p_code: code }); return (rows && rows[0]) || null; },
      // أحدث الدروس المنشورة (لصف معيّن أو لكل الصفوف)
      listLatest(grade, limit) {
        const p = [['select', LIST_COLS], ['status', 'eq.scheduled'], ['kind', 'eq.recorded'], ['starts_at', 'lte.' + isoMin()],
          ['video_url', 'not.is.null'], ['order', 'starts_at.desc,id.desc'], ['limit', String(limit)]];
        if (grade) p.push(['grade', 'eq.' + grade]);
        return rest('sessions', p);
      },
      async getSession(id) {
        const rows = await rest('sessions', [['select', FULL_COLS], ['id', 'eq.' + id]]);
        if (rows[0]) return rows[0];
        if (user) { // المعلم صاحب الحصة أو المشرف يرى الحصص غير المنشورة
          const c = await client();
          let used = FULL_COLS;
          const go = () => c.from('sessions').select(used = FULL_COLS).eq('id', id).maybeSingle();
          let r = await go();
          while (r.error && r.error.code === '42703' && lowerFrom(used)) r = await go();
          return check(r);
        }
        return null;
      },
      listOverlapping(grade, start, end, excludeId) {
        const p = [['select', LIST_COLS], ['grade', 'eq.' + grade], ['status', 'eq.scheduled'], ['kind', 'eq.live'],
          ['starts_at', 'lt.' + iso(end)], ['ends_at', 'gt.' + iso(start)], ['order', 'starts_at.asc'], ['limit', '30']];
        if (excludeId) p.push(['id', 'neq.' + excludeId]);
        return rest('sessions', p);
      },
      async getTeacher(id) {
        const base = 'id,display_name,specialty,bio,youtube_channel,avatar_url';
        let rows;
        try { rows = await restRaw('teachers', [['select', base + ',verified,trusted,vouch,portfolio_url'], ['id', 'eq.' + id]]); }
        catch (e) { if (e.code !== '42703') throw e; rows = await restRaw('teachers', [['select', base], ['id', 'eq.' + id]]); }
        return rows[0] || null;
      },
      listTeacherSessions(id) {
        return rest('sessions', [['select', LIST_COLS], ['teacher_id', 'eq.' + id], ['status', 'eq.scheduled'],
          ['order', 'starts_at.desc'], ['limit', '200']]);
      },
      async listTeachers() {
        const q = (cols) => restRaw('teachers', [['select', cols], ['status', 'eq.approved'], ['order', 'display_name.asc'], ['limit', '1000']]);
        try { return await q('id,display_name,specialty,avatar_url,verified'); }
        catch (e) { if (e.code !== '42703') throw e; return q('id,display_name,specialty,avatar_url'); }
      },
      // عدد دروس كل مهارة (لصفحة المهارات)
      async skillCounts() {
        try {
          const rows = await restRaw('sessions', [['select', 'subject'], ['grade', 'eq.skills'], ['status', 'eq.scheduled'],
            ['starts_at', 'lte.' + isoMin()], ['video_url', 'not.is.null'], ['limit', '3000']]);
          const n = {}; rows.forEach((r) => { n[r.subject] = (n[r.subject] || 0) + 1; }); return n;
        } catch (e) { return {}; }
      },
      // المسارات: مجموعات دروس مرتبة
      listPaths(grade) {
        const p = [['select', 'id,grade,title,description,items,owner,updated_at,teacher:teachers(id,display_name)'], ['published', 'is.true'],
          ['order', 'updated_at.desc'], ['limit', '60']];
        if (grade) p.push(['grade', 'eq.' + grade]);
        return restRaw('paths', p).catch(() => []);
      },
      async getPath(id) {
        let rows = [];
        try { rows = await restRaw('paths', [['select', 'id,grade,title,description,items,owner,published,updated_at,teacher:teachers(id,display_name)'], ['id', 'eq.' + id]]); }
        catch (e) { if (!user) throw e; }
        if (rows[0]) return rows[0];
        if (user) { const c = await client(); return check(await c.from('paths').select('*,teacher:teachers(id,display_name)').eq('id', id).maybeSingle()); }
        return null;
      },
      async lessonsByIds(ids) {
        const list = (ids || []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
        if (!list.length) return [];
        const rows = await rest('sessions', [['select', LIST_COLS], ['id', 'in.(' + list.join(',') + ')'], ['status', 'eq.scheduled'], ['starts_at', 'lte.' + isoMin()]]);
        return list.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
      },
      inviteInfo(code) { return rpcPublic('invite_info', { p_code: code }).then((r) => (r && r[0]) || null); },
      report(sessionId, reason) { return rpcPublic('report_session', { p_session: sessionId, p_reason: reason }); },

      // ---------- المعلم ----------
      async myProfile() {
        const c = await authed();
        return check(await c.from('teachers').select('*').eq('id', user.id).maybeSingle());
      },
      async saveProfile(p, exists) {
        const c = await authed();
        const row = {
          display_name: p.display_name, specialty: p.specialty || null, bio: p.bio || null,
          youtube_channel: p.youtube_channel || null, avatar_url: p.avatar_url || null, portfolio_url: p.portfolio_url || null,
        };
        const go = (x) => (exists
          ? c.from('teachers').update(x).eq('id', user.id).select().single()
          : c.from('teachers').insert(Object.assign({ id: user.id }, x)).select().single());
        let r = await go(row);
        if (oldDb(r.error)) { delete row.portfolio_url; r = await go(row); }
        return check(r);
      },
      async redeemInvite(code) {
        const c = await authed();
        const r = check(await c.rpc('redeem_invite', { p_code: code }));
        if (r && r.error) throw new ApiError({ message: r.error });
        return r;
      },
      async myNomination() { const c = await authed(); const r = check(await c.rpc('my_nomination')); return (r && r[0]) || null; },
      async myPaths() { const c = await authed(); return check(await c.from('paths').select('*').eq('owner', user.id).order('updated_at', { ascending: false })); },
      async savePath(pth) {
        const c = await authed();
        const row = { grade: pth.grade, title: pth.title, description: pth.description || null, items: pth.items || [], published: !!pth.published };
        const r = pth.id ? await c.from('paths').update(row).eq('id', pth.id).select().single()
          : await c.from('paths').insert(Object.assign({ owner: user.id }, row)).select().single();
        return check(r);
      },
      async deletePath(id) { const c = await authed(); check(await c.from('paths').delete().eq('id', id)); },
      async mySessions() {
        const c = await authed();
        let used = FULL_COLS;
        const go = () => c.from('sessions').select(used = FULL_COLS).eq('teacher_id', user.id).order('starts_at', { ascending: false }).limit(1000);
        let r = await go();
        while (r.error && r.error.code === '42703' && lowerFrom(used)) r = await go();
        return check(r);
      },
      async createSessions(rows) {
        const c = await authed();
        const data = rows.map((r) => Object.assign({ teacher_id: user.id }, r));
        let r = await c.from('sessions').insert(data).select('id');
        // قاعدة بيانات لم تُحدَّث بعد: يُنشر الدرس بلا مكانه في الكتاب بدل أن يفشل
        if (oldDb(r.error)) r = await c.from('sessions').insert(data.map(noV5)).select('id');
        if (oldDb(r.error)) r = await c.from('sessions').insert(data.map(noPlace)).select('id');
        return check(r);
      },
      async updateSession(id, patch) {
        const c = await authed();
        let q = await c.from('sessions').update(patch).eq('id', id).select('id');
        if (oldDb(q.error)) q = await c.from('sessions').update(noV5(patch)).eq('id', id).select('id');
        if (oldDb(q.error)) q = await c.from('sessions').update(noPlace(patch)).eq('id', id).select('id');
        const r = check(q);
        if (!r || !r.length) throw new ApiError({ code: '42501' });
        return r[0];
      },
      async deleteSession(id) {
        const c = await authed();
        check(await c.from('sessions').delete().eq('id', id));
      },

      async teacherRequests(keys) { const c = await authed(); return check(await c.rpc('teacher_requests', { p_keys: keys })); },
      async flagRequest(id) { const c = await authed(); check(await c.rpc('flag_request', { p_id: id })); },
      async myLessonStats() { const c = await authed(); return check(await c.rpc('my_lesson_stats')); },
      async claimCertificate() { const c = await authed(); return check(await c.rpc('claim_certificate')); },
      async myCertificates() { const c = await authed(); return check(await c.rpc('my_certificates')); },

      // ---------- المشرف ----------
      async adminOverview() { const c = await authed(); return check(await c.rpc('admin_overview')); },
      async adminRequests() { const c = await authed(); return check(await c.rpc('admin_list_requests')); },
      async adminSetRequest(id, status) { const c = await authed(); check(await c.rpc('admin_set_request', { p_id: id, p_status: status })); },
      async adminCertificates() { const c = await authed(); return check(await c.rpc('admin_list_certificates')); },
      async adminBadge() { const c = await authed(); return check(await c.rpc('admin_badge')) || 0; },
      async adminReviewQueue() {
        const c = await authed();
        return check(await c.from('sessions').select(FULL_COLS).eq('review', 'pending').eq('status', 'scheduled').order('created_at', { ascending: true }).limit(200));
      },
      async adminReview(id, ok, note) { return this.updateSession(id, { review: ok ? 'ok' : 'rejected', review_note: ok ? null : (note || null) }); },
      async adminCreateInvite(label, uses) { const c = await authed(); return check(await c.rpc('admin_create_invite', { p_label: label, p_uses: uses })); },
      async adminInvites() { const c = await authed(); return check(await c.rpc('admin_list_invites')); },
      async adminSetInvite(code, active) { const c = await authed(); check(await c.rpc('admin_set_invite', { p_code: code, p_active: active })); },
      async adminSetCertificate(code, revoked) { const c = await authed(); check(await c.rpc('admin_set_certificate', { p_code: code, p_revoked: revoked })); },
      async adminTeachers() { const c = await authed(); return check(await c.rpc('admin_list_teachers')); },
      async adminSetTeacher(id, patch) {
        const c = await authed();
        const r = check(await c.from('teachers').update(patch).eq('id', id).select('id'));
        if (!r || !r.length) throw new ApiError({ code: '42501' });
      },
      async adminReports() { const c = await authed(); return check(await c.rpc('admin_list_reports')); },
      async adminDeleteReport(id) { const c = await authed(); check(await c.from('reports').delete().eq('id', id)); },
      async adminHideSession(id, hidden) { return this.updateSession(id, { hidden }); },
      async adminSaveSettings(patch) {
        const c = await authed();
        let q = await c.from('settings').update(patch).eq('id', 1).select('id');
        if (oldDb(q.error)) q = await c.from('settings').update({ auto_approve: patch.auto_approve, site_notice: patch.site_notice }).eq('id', 1).select('id');
        const r = check(q);
        if (!r || !r.length) throw new ApiError({ code: '42501' });
      },
      async setFeatured(id) {
        const c = await authed();
        const r = check(await c.from('settings').update({ featured_session: id || null }).eq('id', 1).select('id'));
        if (!r || !r.length) throw new ApiError({ code: '42501' });
      },
    };
  }

  // ===================================================================
  //  الوضع التجريبي: بيانات أمثلة محفوظة في هذا المتصفح فقط
  // ===================================================================
  function demoApi() {
    const KEY = 'midrar-demo-v2';
    const DEMO_UID = 'demo-teacher-you';
    let db = null;
    let user = null;
    const listeners = [];
    const uid = () => 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));
    const clone = (v) => JSON.parse(JSON.stringify(v));

    function seed() {
      const teachers = [
        ['t-ali', 'أ. سالم البلوشي', 'رياضيات — 12 سنة خبرة'],
        ['t-zainab', 'أ. مريم الحارثية', 'فيزياء وكيمياء'],
        ['t-mustafa', 'أ. خالد الراشدي', 'لغة عربية'],
        ['t-noor', 'أ. عائشة الهنائية', 'لغة إنجليزية'],
        ['t-haider', 'أ. يوسف العبري', 'أحياء وعلوم'],
        ['t-maryam', 'أ. شيماء الكندية', 'رياضيات وعلوم للحلقة الأولى'],
        ['t-eng', 'م. أحمد الحسني', 'مهندس برمجيات — ذكاء اصطناعي وبرمجة'],
        ['t-new', 'أ. هند المعمرية', 'مصممة جرافيك'],
      ].map(([id, name, sp]) => ({
        id, display_name: name, specialty: sp, bio: 'معلم متطوع (مثال في الوضع التجريبي).',
        youtube_channel: 'https://www.youtube.com/@example', avatar_url: null, status: 'approved', is_admin: false,
        email: id + '@example.com', created_at: iso(Date.now() - 30 * 864e5),
        trusted: id !== 't-new', verified: id === 't-ali' || id === 't-zainab' || id === 't-eng', trust_lock: false,
        vouch: id === 't-ali' ? 'بدعوة من مدرسة الخوض' : id === 't-eng' ? 'بدعوة من جامعة السلطان قابوس' : id === 't-new' ? 'رشّحه أ. سالم البلوشي' : null,
        portfolio_url: id === 't-eng' ? 'https://www.linkedin.com/in/example' : null,
      }));
      const day0 = new Date(); day0.setHours(0, 0, 0, 0);
      const at = (dayOff, h, m) => { const d = new Date(day0); d.setDate(d.getDate() + dayOff); d.setHours(h, m || 0, 0, 0); return d; };
      const sessions = [];
      const add = (t, grade, subject, title, start, mins, extra) => {
        sessions.push(Object.assign({
          id: uid(), teacher_id: t, grade, subject, title, kind: 'recorded', term: null, unit: null, unit_title: null,
          lesson_type: 'lesson', exam_year: null, exam_round: null,
          description: 'شرح مبسّط مع أمثلة وحل أسئلة امتحانات سابقة. جهّز دفترك وقلمك.',
          starts_at: iso(start), ends_at: iso(+start + mins * 60000), video_url: 'https://youtu.be/demo-video',
          recording_url: null, status: 'scheduled', hidden: false, created_at: iso(Date.now() - 864e5),
        }, extra || {}));
      };
      const now = new Date();
      // دروس نُشرت اليوم: معلمان شرحا نفس المادة للصف العاشر، والطالب يختار
      const u3 = { term: 1, unit: 3, unit_title: 'المعادلات والمتباينات' };
      add('t-ali', 'g10', 'math', 'المعادلات التربيعية — الحل بالقانون العام', new Date(now.getTime() - 2 * 3600e3), 35, u3);
      add('t-maryam', 'g10', 'math', 'المعادلات التربيعية بطريقة مبسطة', new Date(now.getTime() - 3600e3), 28, u3);
      add('t-zainab', 'g10', 'science', 'قوانين نيوتن مع مسائل محلولة', new Date(now.getTime() - 40 * 60000), 32, { term: 1, unit: 2, unit_title: 'الحركة والقوى' });
      add('t-haider', 'g12', 'biology', 'الوراثة: مسائل التهجين الثنائي', new Date(now.getTime() - 20 * 60000), 41, { term: 1, unit: 4, unit_title: 'الوراثة' });
      // حل امتحانات دبلوم سابقة للصف الثاني عشر
      add('t-ali', 'g12', 'math_adv', 'حل امتحان دبلوم 2024 — الدور الأول — الفصل الدراسي الأول', at(-6, 18), 55, { term: 1, lesson_type: 'exam', exam_year: 2024, exam_round: 1 });
      add('t-ali', 'g12', 'math_adv', 'حل امتحان دبلوم 2023 — الدور الأول — الفصل الدراسي الأول', at(-8, 18), 50, { term: 1, lesson_type: 'exam', exam_year: 2023, exam_round: 1 });
      add('t-zainab', 'g12', 'physics', 'حل امتحان دبلوم 2024 — الدور الثاني — الفصل الدراسي الأول', at(-5, 17), 48, { term: 1, lesson_type: 'exam', exam_year: 2024, exam_round: 2 });
      const plan = [
        ['t-ali', 'g10', 'math', ['تحليل المقادير الجبرية', 'المتباينات', 'الهندسة الإحداثية', 'حل أسئلة سابقة']],
        ['t-maryam', 'g10', 'math', ['تحليل المقادير الجبرية (شرح ثانٍ)', 'المتباينات بطريقة مبسطة', 'الدوال', 'مراجعة الفصل الأول']],
        ['t-zainab', 'g10', 'science', ['الجدول الدوري', 'الأحماض والقواعد', 'المحاليل', 'مراجعة شاملة']],
        ['t-noor', 'g10', 'english', ['Unit 1: Reading skills', 'Grammar: Present perfect', 'Writing a paragraph', 'Vocabulary review']],
        ['t-mustafa', 'g10', 'arabic', ['المفعول المطلق', 'النعت', 'البلاغة: التشبيه', 'النصوص الأدبية']],
        ['t-haider', 'g12', 'biology', ['التكاثر في النبات', 'الجهاز العصبي', 'الهرمونات', 'حل أسئلة الدبلوم']],
        ['t-zainab', 'g12', 'physics', ['المجال الكهربائي', 'الحث الكهرومغناطيسي', 'التيار المتردد', 'الفيزياء الحديثة']],
        ['t-ali', 'g12', 'math_adv', ['الأعداد المركبة', 'القطوع المخروطية', 'التفاضل', 'التكامل']],
        ['t-noor', 'g12', 'english', ['Unit 2: The environment', 'Grammar: Passive voice', 'Reading comprehension', 'Exam practice']],
        ['t-mustafa', 'g11', 'arabic', ['الممنوع من الصرف', 'العروض', 'الأدب العباسي', 'التعبير']],
        ['t-maryam', 'g4', 'math', ['الكسور العشرية', 'الضرب والقسمة', 'المساحات', 'مراجعة']],
        ['t-maryam', 'g4', 'science', ['جسم الإنسان', 'المادة وخواصها', 'الطاقة', 'مراجعة']],
        ['t-haider', 'g7', 'science', ['الخلية', 'تصنيف الكائنات', 'النبات', 'مراجعة']],
      ];
      const hours = [16, 17, 18, 19, 20];
      plan.forEach(([t, g, s, titles], pi) => {
        titles.forEach((title, ti) => {
          // كل درس مرة واحدة: معظمها منشور، وآخرها مجدول للنشر عند بعض المعلمين
          // (المراجعة الأخيرة منشورة عند نصف المعلمين، ومجدولة عند النصف الآخر)
          const d = ti * 3 - 9 + (pi % 4) - (ti === titles.length - 1 && pi % 2 === 0 ? 2 : 0);
          const start = at(d, hours[(pi + ti) % hours.length], (pi % 2) * 30);
          // الدرس الأخير في كل قائمة مراجعة، والبقية دروس في وحدات الفصل الأول
          const place = /مراجعة|حل أسئلة/.test(title) ? { term: 1, lesson_type: 'review' } : { term: 1, unit: ti + 1, unit_title: null };
          add(t, g, s, title, start, [45, 60, 60, 90][pi % 4], place);
        });
      });
      add('t-maryam', 'g4', 'math', 'جدول الضرب بطريقة سهلة', at(-1, 9), 20);
      // المهارات: دورات مرتبة بالأجزاء
      const sk = (t, subject, course, part, title, dayOff, extra) => add(t, 'skills', subject, title, at(dayOff, 18), 25,
        Object.assign({ unit: part, unit_title: course, level: 1, ages: 'all' }, extra || {}));
      sk('t-eng', 'sk_ai', 'أساسيات الذكاء الاصطناعي', 1, 'ما هو الذكاء الاصطناعي؟ أمثلة من حياتنا', -12);
      sk('t-eng', 'sk_ai', 'أساسيات الذكاء الاصطناعي', 2, 'كيف تتعلم الآلة من البيانات', -9);
      sk('t-eng', 'sk_ai', 'أساسيات الذكاء الاصطناعي', 3, 'استخدام أدوات الذكاء الاصطناعي في الدراسة بأمان', -6);
      sk('t-eng', 'sk_code', 'البرمجة بلغة بايثون للمبتدئين', 1, 'أول برنامج لك بلغة بايثون', -10, { ages: 'c2' });
      sk('t-eng', 'sk_code', 'البرمجة بلغة بايثون للمبتدئين', 2, 'المتغيرات والشروط', -4, { ages: 'c2' });
      sk('t-new', 'sk_design', 'التصميم بأداة Canva', 1, 'أساسيات التصميم: الألوان والخطوط', -3, { review: 'ok' });
      sk('t-new', 'sk_design', 'التصميم بأداة Canva', 2, 'تصميم ملصق لمشروع مدرسي', -1, { review: 'pending' });
      sk('t-maryam', 'sk_other', 'التصوير بالجوال', 1, 'أسرار الصورة الجميلة بالجوال', -7, { skill_name: 'التصوير بالجوال', ages: 'c1' });
      add('t-new', 'g10', 'arabic', 'كتابة التقرير بطريقة منظمة', at(-1, 20), 22, { review: 'pending' });
      // حصة ملغاة
      add('t-noor', 'g10', 'english', 'Listening practice', at(1, 21), 45, { status: 'cancelled' });
      // إزالة الحجوزات المزدوجة لنفس المعلم
      const kept = [];
      sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).forEach((s) => {
        if (s.kind === 'live' && s.status === 'scheduled' && kept.some((k) => k.teacher_id === s.teacher_id && k.kind === 'live'
          && k.status === 'scheduled' && k.starts_at < s.ends_at && s.starts_at < k.ends_at)) return;
        kept.push(s);
      });
      const req = (grade, subject, unit, topic, votes) => ({ id: uid(), grade, subject, term: 1, unit, topic, topic_key: arNorm(topic || ''), votes, status: 'open', flags: 0, session_id: null, created_at: iso(Date.now() - 864e5), last_at: iso(Date.now() - 3600e3) });
      const requests = [req('g10', 'math', 4, 'الدوال الأسية واللوغاريتمية', 7), req('g10', 'math', null, 'حل أسئلة الكتاب الوحدة الثانية', 3), req('g10', 'science', 2, 'قانون نيوتن الثالث', 2), req('g12', 'physics', null, 'الحث الكهرومغناطيسي', 5)];
      requests.push(req('skills', 'sk_ai', null, 'كيف أكتب طلباً جيداً لأداة الذكاء الاصطناعي', 4));
      const stats = {};
      kept.forEach((s, i) => {
        if (+new Date(s.starts_at) > Date.now() || s.review === 'pending') return;
        const st = { views: (i * 37) % 160 + 5, views7: (i * 13) % 40, thanks: (i * 7) % 30, understood: (i * 5) % 25 };
        st.views30 = Math.min(st.views, st.views7 * 3 + 4); st.thanks30 = Math.round((st.thanks + st.understood) / 2);
        stats[s.id] = st;
      });
      // اختبار قصير وملف مرافق لدرس، ودرس الأسبوع، ومسار جاهز
      const quad = kept.find((s) => s.title === 'المعادلات التربيعية — الحل بالقانون العام');
      if (quad) {
        quad.quiz = [
          { q: 'كم عدد حلول المعادلة التربيعية إذا كان المميز موجباً؟', o: ['لا حلول', 'حل واحد', 'حلان مختلفان'], a: 2 },
          { q: 'ما قيمة المميز للمعادلة س² − 4 = 0 ؟', o: ['0', '16', '−16', '4'], a: 1 },
          { q: 'القانون العام يستخدم لحل المعادلات من الدرجة:', o: ['الأولى', 'الثانية', 'الثالثة'], a: 1 },
        ];
        quad.attachments = [{ t: 'ملخص القانون العام (PDF)', u: 'https://drive.google.com/file/d/demo/view' }];
      }
      const pub = (g, sub) => kept.filter((s) => s.grade === g && s.subject === sub && s.teacher_id === 't-ali' && s.review !== 'pending'
        && +new Date(s.starts_at) <= Date.now()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((s) => s.id);
      const paths = [
        { id: uid(), owner: 't-ali', grade: 'g10', title: 'استعد لاختبار الرياضيات — الفصل الأول', description: 'دروس مختارة بالترتيب، من التحليل إلى المعادلات التربيعية.',
          items: pub('g10', 'math').concat(quad ? [quad.id] : []).filter((x, i, a) => a.indexOf(x) === i), published: true, created_at: iso(Date.now() - 5 * 864e5), updated_at: iso(Date.now() - 864e5) },
        { id: uid(), owner: 't-eng', grade: 'skills', title: 'ابدأ في الذكاء الاصطناعي من الصفر', description: 'ثلاثة دروس قصيرة تعرّفك بالذكاء الاصطناعي وكيف تستخدمه بأمان.',
          items: kept.filter((s) => s.subject === 'sk_ai').map((s) => s.id), published: true, created_at: iso(Date.now() - 4 * 864e5), updated_at: iso(Date.now() - 2 * 864e5) },
      ];
      const invites = [{ code: 'KHWDSCHL26', kind: 'invite', label: 'مدرسة الخوض', created_by: null, uses_left: 8, active: true, created_at: iso(Date.now() - 10 * 864e5), used: 2 }];
      return { v: 5, teachers, sessions: kept, reports: [], requests, stats, certificates: [], paths, invites, inviteUses: [],
        settings: { auto_approve: true, site_notice: '', requests_on: true, views_on: true, request_min_votes: 2, featured_session: quad ? quad.id : null }, me: null };
    }
    function load() {
      if (db) return db;
      try { db = JSON.parse(storeGet(KEY) || 'null'); } catch (e) { db = null; }
      if (!db || db.v !== 5) { db = seed(); save(); }
      return db;
    }
    function save() { storeSet(KEY, JSON.stringify(db)); }
    const teacherOf = (id) => db.teachers.find((t) => t.id === id);
    function withTeacher(s) {
      const t = teacherOf(s.teacher_id);
      return Object.assign(clone(s), { teacher: t ? { id: t.id, display_name: t.display_name, avatar_url: t.avatar_url } : null });
    }
    const visible = (s) => !s.hidden && (s.review || 'ok') === 'ok' && (teacherOf(s.teacher_id) || {}).status === 'approved';
    // نفس قواعد sessions_guard: حقول المهارات، ومراجعة دروس المعلم غير الموثوق
    function cleanRow(r) {
      if (r.grade !== 'skills') { r.level = null; r.ages = null; }
      r.skill_name = r.grade === 'skills' && r.subject === 'sk_other' ? (String(r.skill_name || '').trim() || null) : null;
      if (r.unit == null && r.grade !== 'skills') r.unit_title = null;
      return r;
    }
    const CONTENT = ['title', 'description', 'video_url', 'recording_url', 'skill_name', 'quiz', 'attachments', 'unit', 'unit_title', 'grade', 'subject', 'ages', 'level'];
    // الدعوة صالحة ما دام صاحبها مشرفاً، والترشيح ما دام صاحبه موثوقاً (كما في invite_valid)
    const inviteValid = (i) => { if (!i.created_by) return i.kind === 'invite'; const t = teacherOf(i.created_by) || {}; return t.status === 'approved' && (i.kind === 'invite' ? t.is_admin : t.trusted); };
    function trustAfterReview(teacherId) {
      const t = teacherOf(teacherId);
      if (!t || t.trusted || t.trust_lock || t.status !== 'approved') return;
      if (db.sessions.filter((x) => x.teacher_id === teacherId && (x.review || 'ok') === 'ok' && !x.hidden).length >= (C.TRUST_AFTER || 3)) t.trusted = true;
    }
    const isAdmin = () => !!(user && (teacherOf(user.id) || {}).is_admin);
    const overlaps = (a, b) => a.starts_at < b.ends_at && b.starts_at < a.ends_at;
    function guardOverlap(row, ignoreId) {
      if (row.kind !== 'live' || row.status !== 'scheduled') return;
      const clash = db.sessions.some((s) => s.id !== ignoreId && s.teacher_id === row.teacher_id && s.kind === 'live'
        && s.status === 'scheduled' && overlaps(s, row));
      if (clash) throw new ApiError({ code: '23P01' });
    }
    function need() { if (!user) throw new ApiError({ code: 'PGRST301' }); }

    return {
      mode: 'demo',
      async init() {
        load();
        if (db.me) user = clone(db.me);
        return user;
      },
      onAuth(fn) { listeners.push(fn); },
      currentUser() { return user; },
      async signIn(after) {
        load();
        user = { id: DEMO_UID, email: 'you@example.com', name: 'أنت (معلم تجريبي)', avatar: '' };
        db.me = user; save();
        listeners.forEach((fn) => fn(user));
        location.hash = after || '#/dashboard';
      },
      async signOut() {
        user = null; db.me = null; save();
        listeners.forEach((fn) => fn(null));
      },
      async reset() { db = seed(); save(); user = null; },

      async settings() { load(); return delay(clone(db.settings)); },
      async listSchedule(grade, from, to) {
        load();
        const a = iso(from), b = iso(to);
        return delay(db.sessions.filter((s) => s.grade === grade && s.starts_at >= a && s.starts_at < b && visible(s)).map(withTeacher));
      },
      async listLiveNow() {
        load();
        const now = Date.now();
        return delay(db.sessions.filter((s) => s.kind === 'live' && s.status === 'scheduled' && visible(s)
          && +new Date(s.starts_at) <= now + C.JOIN_EARLY_MIN * 60000 && +new Date(s.ends_at) > now).map(withTeacher));
      },
      async listRecordings(grade, subject, offset, limit) {
        load();
        const now = iso(Date.now());
        const rows = db.sessions.filter((s) => s.grade === grade && s.status === 'scheduled' && visible(s) && s.starts_at <= now
          && (s.video_url || s.recording_url) && (!subject || s.subject === subject))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at) || String(b.id).localeCompare(String(a.id)));
        return delay(rows.slice(offset, offset + limit).map(withTeacher));
      },
      async listSubjectLessons(grade, subject) {
        load();
        const now = iso(Date.now());
        const k = (v) => (v == null ? 99 : v);
        return delay(db.sessions.filter((s) => s.grade === grade && s.subject === subject && s.status === 'scheduled' && visible(s)
          && s.starts_at <= now && (s.video_url || s.recording_url))
          .sort((a, b) => k(a.term) - k(b.term) || k(a.unit) - k(b.unit) || a.starts_at.localeCompare(b.starts_at))
          .map(withTeacher));
      },
      async searchLessons(grade, q, subject) {
        load();
        const words = arNorm(q).split(' ').filter(Boolean);
        const now = iso(Date.now());
        if (arNorm(q).length < 2) return delay([]);
        return delay(db.sessions.filter((s) => s.grade === grade && (!subject || s.subject === subject) && s.status === 'scheduled' && visible(s)
          && s.starts_at <= now && (s.video_url || s.recording_url)
          && words.every((w) => arNorm(s.title + ' ' + (s.unit_title || '') + ' ' + (s.skill_name || '')).includes(w)))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 40).map(withTeacher));
      },
      async listExamLessons(grade) {
        load();
        const now = iso(Date.now());
        return delay(db.sessions.filter((s) => s.grade === grade && s.lesson_type === 'exam' && s.status === 'scheduled' && visible(s) && s.starts_at <= now && s.video_url)
          .map((s) => ({ id: s.id, subject: s.subject, exam_year: s.exam_year })));
      },
      async requestLesson(r) {
        load();
        const topic = (r.topic || '').replace(/\s+/g, ' ').trim() || null;
        if (!topic && !r.unit) throw new ApiError({ message: 'اختر الوحدة أو اكتب اسم الدرس' });
        // نفس قواعد request_lesson في قاعدة البيانات
        const norm = arNorm(topic || '');
        const digits = norm.replace(/(^|[^0-9])(19|20)\d{2}(?=[^0-9]|$)/g, '$1');
        if (topic && (/[0-9]([^a-z0-9ء-ي]{0,3}[0-9]){7,}/.test(digits) || /@|https?:|www\.|\.com|\.net|\.org/.test(norm)
          || /(^|[^a-z0-9ء-ي])(و|ف|ب|ل|ال|وال|بال|فال|لل)?(واتس|whatsapp|wa\.me|انستا|انستقرام|انستغرام|instagram|سناب شات|سنابشات|snap|تيك توك|تيكتوك|tiktok|تلجرام|تليجرام|telegram|رقم هاتف|رقم الهاتف|تواصل معي|كلموني|دروس خصوصي|درس خصوصي|مدرس خصوصي)/.test(norm))) {
          throw new ApiError({ message: 'اكتب اسم الدرس فقط، بلا أرقام هواتف أو حسابات أو روابط' });
        }
        const key = arNorm(topic || '');
        // نفس اسم الدرس في نفس المادة طلبٌ واحد، ولو اختار الطالب وحدة أخرى
        let q = (topic && db.requests.filter((x) => x.grade === r.grade && x.subject === r.subject && x.topic_key === key && (x.status === 'open' || x.status === 'hidden')
          && (!r.term || !x.term || x.term === r.term)).sort((a, b) => b.votes - a.votes)[0])
          || db.requests.find((x) => x.grade === r.grade && x.subject === r.subject && (x.term || 0) === (r.term || 0) && (x.unit || 0) === (r.unit || 0) && x.topic_key === key);
        if (q && q.status === 'done' && !db.sessions.some((x) => x.id === q.session_id && x.status === 'scheduled' && visible(x) && +new Date(x.starts_at) <= Date.now())) { q.status = 'open'; q.session_id = null; }
        if (q) { q.votes += 1; q.last_at = iso(Date.now()); }
        else { q = { id: uid(), grade: r.grade, subject: r.subject, term: r.term || null, unit: r.unit || null, topic, topic_key: key, votes: 1, status: 'open', flags: 0, session_id: null, created_at: iso(Date.now()), last_at: iso(Date.now()) }; db.requests.push(q); }
        save();
        return delay({ id: q.id, votes: q.votes });
      },
      async countView(id) {
        load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s || !visible(s)) return delay(null);
        const st = db.stats[id] || (db.stats[id] = { views: 0, views7: 0, thanks: 0, understood: 0, views30: 0, thanks30: 0 });
        st.views += 1; st.views7 += 1; st.views30 = (st.views30 || 0) + 1; save(); return delay(null);
      },
      async thankLesson(id, kind) {
        load();
        const st = db.stats[id] || (db.stats[id] = { views: 0, views7: 0, thanks: 0, understood: 0, views30: 0, thanks30: 0 });
        st[kind === 'thanks' ? 'thanks' : 'understood'] += 1; st.thanks30 = (st.thanks30 || 0) + 1; save(); return delay(null);
      },
      async skillCounts() {
        load();
        const now = iso(Date.now()); const n = {};
        db.sessions.filter((s) => s.grade === 'skills' && s.status === 'scheduled' && visible(s) && s.starts_at <= now && s.video_url)
          .forEach((s) => { n[s.subject] = (n[s.subject] || 0) + 1; });
        return delay(n);
      },
      async listPaths(grade) {
        load();
        const ok = (x) => { const t = teacherOf(x.owner) || {}; return x.published && t.status === 'approved' && (t.trusted || t.is_admin); };
        return delay((db.paths || []).filter((x) => ok(x) && (!grade || x.grade === grade))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((x) => Object.assign(clone(x), { teacher: { id: x.owner, display_name: (teacherOf(x.owner) || {}).display_name } })));
      },
      async getPath(id) {
        load();
        const x = (db.paths || []).find((y) => y.id === id);
        if (!x) return delay(null);
        const t = teacherOf(x.owner) || {};
        const mine = user && (x.owner === user.id || isAdmin());
        if (!mine && !(x.published && t.status === 'approved' && (t.trusted || t.is_admin))) return delay(null);
        return delay(Object.assign(clone(x), { teacher: { id: x.owner, display_name: t.display_name } }));
      },
      async lessonsByIds(ids) {
        load();
        const now = iso(Date.now());
        return delay((ids || []).map((id) => db.sessions.find((s) => s.id === id)).filter((s) => s && s.status === 'scheduled' && visible(s) && s.starts_at <= now).map(withTeacher));
      },
      async inviteInfo(code) {
        load();
        const c = String(code || '').toUpperCase().replace(/[\s-]/g, '');
        const i = (db.invites || []).find((x) => x.code === c && x.active && x.uses_left > 0 && inviteValid(x));
        return delay(i ? { label: i.label, kind: i.kind } : null);
      },
      async redeemInvite(code) {
        need(); load();
        const me = teacherOf(user.id);
        if (!me) throw new ApiError({ message: 'أكمل ملفك أولاً' });
        if (me.status === 'suspended') throw new ApiError({ code: '42501', message: 'حسابك موقوف' });
        const c = String(code || '').toUpperCase().replace(/[\s-]/g, '');
        const i = (db.invites || []).find((x) => x.code === c);
        if (!i || !i.active || i.uses_left < 1 || !inviteValid(i)) throw new ApiError({ message: 'رابط الدعوة غير صالح أو انتهى' });
        if (i.created_by === user.id) throw new ApiError({ message: 'لا يمكنك استخدام رابط الترشيح الخاص بك' });
        db.inviteUses = db.inviteUses || [];
        if (db.inviteUses.some((u) => u.teacher_id === user.id)) return delay({ kind: i.kind, label: i.label, already: true });
        db.inviteUses.push({ code: c, teacher_id: user.id }); i.uses_left -= 1; i.used = (i.used || 0) + 1;
        me.status = 'approved'; if (i.kind === 'invite' && !me.trust_lock) me.trusted = true;
        me.vouch = (i.kind === 'invite' ? 'بدعوة من ' : 'رشّحه ') + i.label;
        save();
        return delay({ kind: i.kind, label: i.label });
      },
      async myNomination() {
        need(); load();
        const me = teacherOf(user.id) || {};
        if (me.status !== 'approved' || !me.trusted) throw new ApiError({ code: '42501', message: 'يصبح رابط الترشيح متاحاً بعد أن تصبح معلماً موثوقاً' });
        db.invites = db.invites || [];
        let i = db.invites.filter((x) => x.created_by === user.id && x.kind === 'nominate').pop();
        if (i && !i.active) throw new ApiError({ code: '42501', message: 'أوقفت الإدارة رابط الترشيح الخاص بك' });
        if (!i) {
          const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          i = { code: Array.from({ length: 10 }, () => A[Math.floor(Math.random() * 32)]).join(''), kind: 'nominate', label: me.display_name,
            created_by: user.id, uses_left: 5, active: true, created_at: iso(Date.now()), used: 0 };
          db.invites.push(i); save();
        }
        return delay({ code: i.code, uses_left: i.uses_left });
      },
      async myPaths() { need(); load(); return delay((db.paths || []).filter((x) => x.owner === user.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(clone)); },
      async savePath(pth) {
        need(); load();
        const me = teacherOf(user.id) || {};
        db.paths = db.paths || [];
        const title = String(pth.title || '').trim();
        if (title.length < 3) throw new ApiError({ message: 'اكتب عنواناً للمسار (3 أحرف على الأقل)' });
        const row = { grade: pth.grade, title, description: (pth.description || '').trim() || null, items: (pth.items || []).slice(0, 40), published: !!pth.published, updated_at: iso(Date.now()) };
        if (pth.id) {
          const x = db.paths.find((y) => y.id === pth.id);
          if (!x || (x.owner !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
          Object.assign(x, row); save(); return delay(clone(x));
        }
        if (!(me.status === 'approved' && me.trusted) && !isAdmin()) throw new ApiError({ code: '42501' });
        const x = Object.assign({ id: uid(), owner: user.id, created_at: iso(Date.now()) }, row);
        db.paths.push(x); save(); return delay(clone(x));
      },
      async deletePath(id) {
        need(); load();
        const x = (db.paths || []).find((y) => y.id === id);
        if (!x || (x.owner !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
        db.paths = db.paths.filter((y) => y.id !== id); save(); return delay();
      },
      async verifyCertificate(code) {
        load();
        const c = String(code || '').toUpperCase().replace(/[\s-]/g, '');
        const x = db.certificates.find((y) => y.code === c);
        if (!x) return delay(null);
        const t = teacherOf(x.teacher_id) || {};
        return delay(Object.assign(clone(x), { valid: !x.revoked && t.status !== 'suspended' }));
      },
      async listLatest(grade, limit) {
        load();
        const now = iso(Date.now());
        const rows = db.sessions.filter((s) => s.kind === 'recorded' && s.status === 'scheduled' && visible(s) && s.starts_at <= now && s.video_url && (!grade || s.grade === grade))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at) || String(b.id).localeCompare(String(a.id)));
        return delay(rows.slice(0, limit).map(withTeacher));
      },
      async getSession(id) {
        load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s) return delay(null);
        if (!visible(s) && !(user && (s.teacher_id === user.id || isAdmin()))) return delay(null);
        return delay(withTeacher(s));
      },
      async listOverlapping(grade, start, end, excludeId) {
        load();
        const a = iso(start), b = iso(end);
        return delay(db.sessions.filter((s) => s.grade === grade && s.status === 'scheduled' && s.kind === 'live' && visible(s)
          && s.starts_at < b && s.ends_at > a && s.id !== excludeId).map(withTeacher));
      },
      async getTeacher(id) {
        load();
        const t = teacherOf(id);
        return delay(t && t.status === 'approved' ? clone(t) : null);
      },
      async listTeacherSessions(id) {
        load();
        return delay(db.sessions.filter((s) => s.teacher_id === id && s.status === 'scheduled' && visible(s))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at)).map(withTeacher));
      },
      async listTeachers() {
        load();
        return delay(db.teachers.filter((t) => t.status === 'approved').map(clone)
          .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ar')));
      },
      async report(sessionId, reason) {
        load();
        if (!reason || reason.trim().length < 3) throw new ApiError({ message: 'اكتب سبب البلاغ' });
        db.reports.unshift({ id: Date.now(), session_id: sessionId, reason: reason.trim().slice(0, 500), created_at: iso(Date.now()) });
        save();
        return delay();
      },

      async myProfile() { need(); load(); return delay(teacherOf(user.id) ? clone(teacherOf(user.id)) : null); },
      async saveProfile(p, exists) {
        need(); load();
        let t = teacherOf(user.id);
        if (!exists || !t) {
          // المعلم التجريبي يصبح مشرفاً حتى ترى لوحة الإدارة
          t = { id: user.id, status: db.settings.auto_approve ? 'approved' : 'pending', is_admin: true, email: user.email, created_at: iso(Date.now()),
            trusted: true, verified: false, trust_lock: false, vouch: null };
          db.teachers.push(t);
        }
        Object.assign(t, {
          display_name: p.display_name, specialty: p.specialty || null, bio: p.bio || null,
          youtube_channel: p.youtube_channel || null, avatar_url: p.avatar_url || null, portfolio_url: p.portfolio_url || null,
        });
        save();
        return delay(clone(t));
      },
      async mySessions() {
        need(); load();
        return delay(db.sessions.filter((s) => s.teacher_id === user.id)
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at)).map(withTeacher));
      },
      async createSessions(rows) {
        need(); load();
        const me = teacherOf(user.id);
        if (!me || me.status === 'suspended') throw new ApiError({ code: '42501' });
        const made = rows.map((r) => cleanRow(Object.assign({
          id: uid(), teacher_id: user.id, status: 'scheduled', hidden: false, recording_url: null, created_at: iso(Date.now()),
        }, r, { review: me.trusted || me.is_admin ? 'ok' : 'pending', review_note: null })));
        const staged = [];
        made.forEach((m) => {
          guardOverlap(m);
          if (staged.some((s) => s.kind === 'live' && m.kind === 'live' && overlaps(s, m))) throw new ApiError({ code: '23P01' });
          staged.push(m);
        });
        db.sessions.push(...made);
        made.forEach((m) => {
          const q = m.request_id && m.review === 'ok' && db.requests.find((x) => x.id === m.request_id && x.status === 'open' && x.grade === m.grade && x.subject === m.subject);
          if (q && me.status === 'approved') { q.status = 'done'; q.session_id = m.id; q.last_at = iso(Date.now()); }
        });
        save();
        return delay(made.map((m) => ({ id: m.id })));
      },
      async updateSession(id, patch) {
        need(); load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s || (s.teacher_id !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
        const next = cleanRow(Object.assign({}, s, patch));
        if (!isAdmin()) {
          next.hidden = s.hidden; next.review = s.review; next.review_note = s.review_note;
          const me = teacherOf(user.id) || {};
          if ((!me.trusted || s.review === 'rejected') && CONTENT.some((k) => JSON.stringify(next[k] == null ? null : next[k]) !== JSON.stringify(s[k] == null ? null : s[k]))) {
            next.review = 'pending'; next.review_note = null;
          }
        }
        guardOverlap(next, id);
        const approved = next.review === 'ok' && (s.review || 'ok') !== 'ok';
        Object.assign(s, next);
        if (approved) {
          trustAfterReview(s.teacher_id);
          const q = s.request_id && db.requests.find((x) => x.id === s.request_id && x.status === 'open' && x.grade === s.grade && x.subject === s.subject);
          if (q) { q.status = 'done'; q.session_id = s.id; q.last_at = iso(Date.now()); }
        }
        save();
        return delay({ id });
      },
      async deleteSession(id) {
        need(); load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s || (s.teacher_id !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
        db.sessions = db.sessions.filter((x) => x.id !== id);
        db.reports = db.reports.filter((r) => r.session_id !== id);
        // الطلب الذي سُجّل بهذا الدرس يعود مفتوحاً
        db.requests.forEach((q) => { if (q.session_id === id && q.status === 'done') { q.status = 'open'; q.session_id = null; } });
        save();
        return delay();
      },

      async teacherRequests(keys) {
        need(); load();
        if ((teacherOf(user.id) || {}).status !== 'approved') throw new ApiError({ code: '42501', message: 'تظهر طلبات الطلاب بعد اعتماد حسابك' });
        const min = db.settings.request_min_votes || 2;
        return delay(db.requests.filter((q) => keys.includes(q.grade + ':' + q.subject) && q.votes >= min
          && (q.status === 'open' || (q.status === 'done' && Date.now() - +new Date(q.last_at) < 30 * 864e5)) && !(q.flaggedBy || []).includes(user.id))
          .sort((a, b) => (b.status === 'open') - (a.status === 'open') || b.votes - a.votes).slice(0, 30).map(clone));
      },
      async flagRequest(id) {
        need(); load();
        const q = db.requests.find((x) => x.id === id);
        if (q && !(q.flaggedBy || []).includes(user.id)) { q.flaggedBy = (q.flaggedBy || []).concat(user.id); q.flags += 1; if (q.flags >= 2 && q.status === 'open') q.status = 'hidden'; save(); }
        return delay();
      },
      async myLessonStats() {
        need(); load();
        return delay(db.sessions.filter((s) => s.teacher_id === user.id && db.stats[s.id])
          .map((s) => Object.assign({ session_id: s.id }, db.stats[s.id])));
      },
      async myCertificates() { need(); load(); return delay(db.certificates.filter((c) => c.teacher_id === user.id).sort((a, b) => b.level - a.level).map(clone)); },
      async claimCertificate() {
        need(); load();
        const me = teacherOf(user.id);
        if (!me || me.status !== 'approved') throw new ApiError({ code: '42501', message: 'تُمنح الشهادة بعد اعتماد حسابك' });
        const ok = db.sessions.filter((s) => s.teacher_id === user.id && s.status === 'scheduled' && !s.hidden && s.video_url
          && +new Date(s.starts_at) <= Date.now() - 3 * 864e5 && +new Date(s.created_at || s.starts_at) <= Date.now() - 3 * 864e5
          && +new Date(s.ends_at) - +new Date(s.starts_at) >= 5 * 60000 && ytKey(s.video_url) !== s.video_url);
        const n = new Set(ok.map((s) => ytKey(s.video_url))).size;
        const lvl = [100, 50, 25, 10, 5].find((l) => l <= n);
        if (!lvl) throw new ApiError({ message: `تحتاج 5 دروس منشورة منذ 3 أيام على الأقل (لديك ${n})` });
        if (!db.certificates.some((c) => c.teacher_id === user.id && c.level === lvl)) {
          const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const code = Array.from({ length: 10 }, () => A[Math.floor(Math.random() * 32)]).join('');
          db.certificates.push({ code, teacher_id: user.id, display_name: me.display_name, channel: me.youtube_channel, lessons: n, level: lvl,
            subjects: Array.from(new Set(ok.map((s) => s.grade + ':' + s.subject))), issued_at: iso(Date.now()), revoked: false });
          save();
        }
        return this.myCertificates();
      },
      async adminOverview() {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        const now = Date.now();
        const pub = db.sessions.filter((s) => s.status === 'scheduled' && !s.hidden && +new Date(s.starts_at) <= now);
        const sum = (k) => Object.values(db.stats).reduce((n, x) => n + (x[k] || 0), 0);
        return delay({
          teachers_approved: db.teachers.filter((t) => t.status === 'approved').length, teachers_pending: db.teachers.filter((t) => t.status === 'pending').length,
          lessons: pub.length, lessons_week: pub.filter((s) => now - +new Date(s.starts_at) < 7 * 864e5).length,
          views: sum('views'), views_week: sum('views7'), thanks: sum('thanks') + sum('understood'),
          requests_open: db.requests.filter((q) => q.status === 'open').length, requests_done: db.requests.filter((q) => q.status === 'done').length,
          certificates: db.certificates.filter((c) => !c.revoked).length, reports_week: db.reports.length,
          review_pending: db.sessions.filter((s) => s.review === 'pending' && s.status === 'scheduled').length,
          teachers_trusted: db.teachers.filter((t) => t.status === 'approved' && t.trusted).length,
          skills_lessons: pub.filter((s) => s.grade === 'skills' && (s.review || 'ok') === 'ok').length,
          paths: (db.paths || []).filter((x) => x.published).length,
        });
      },
      async adminRequests() { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); return delay(db.requests.slice().sort((a, b) => (b.status === 'open') - (a.status === 'open') || b.votes - a.votes).map(clone)); },
      async adminSetRequest(id, status) {
        need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' });
        if (status === 'delete') db.requests = db.requests.filter((q) => q.id !== id);
        else { const q = db.requests.find((x) => x.id === id); if (q) { q.status = status; if (status === 'open') q.flags = 0; } }
        save(); return delay();
      },
      async adminCertificates() { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); return delay(db.certificates.map(clone)); },
      async adminBadge() {
        need(); load(); if (!isAdmin()) return delay(0);
        return delay(db.teachers.filter((t) => t.status === 'pending').length + db.sessions.filter((s) => s.review === 'pending' && s.status === 'scheduled').length + db.reports.length);
      },
      async adminReviewQueue() {
        need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' });
        return delay(db.sessions.filter((s) => s.review === 'pending' && s.status === 'scheduled').sort((a, b) => a.created_at.localeCompare(b.created_at)).map(withTeacher));
      },
      async adminReview(id, ok, note) { return this.updateSession(id, { review: ok ? 'ok' : 'rejected', review_note: ok ? null : (note || null) }); },
      async adminCreateInvite(label, uses) {
        need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' });
        if (String(label || '').trim().length < 2) throw new ApiError({ message: 'اكتب اسم الجهة أو الشخص المدعو' });
        const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const code = Array.from({ length: 10 }, () => A[Math.floor(Math.random() * 32)]).join('');
        db.invites = db.invites || [];
        db.invites.unshift({ code, kind: 'invite', label: String(label).trim(), created_by: user.id, uses_left: Math.min(500, Math.max(1, Number(uses) || 1)), active: true, created_at: iso(Date.now()), used: 0 });
        save(); return delay(code);
      },
      async adminInvites() { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); return delay((db.invites || []).map((i) => Object.assign({ used: 0 }, clone(i)))); },
      async adminSetInvite(code, active) { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); const i = (db.invites || []).find((x) => x.code === code); if (i) i.active = !!active; save(); return delay(); },
      async setFeatured(id) { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); db.settings.featured_session = id || null; save(); return delay(); },
      async adminSetCertificate(code, revoked) { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); const c = db.certificates.find((x) => x.code === code); if (c) c.revoked = revoked; save(); return delay(); },
      async adminTeachers() {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        return delay(db.teachers.map((t) => Object.assign(clone(t), {
          sessions_count: db.sessions.filter((s) => s.teacher_id === t.id).length,
          last_session_at: (db.sessions.filter((s) => s.teacher_id === t.id).map((s) => s.starts_at).sort().pop()) || null,
          pending_reviews: db.sessions.filter((s) => s.teacher_id === t.id && s.review === 'pending').length,
        })).sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || (b.pending_reviews > 0) - (a.pending_reviews > 0)));
      },
      async adminSetTeacher(id, patch) {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        Object.assign(teacherOf(id), patch); save();
        return delay();
      },
      async adminReports() {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        return delay(db.reports.map((r) => {
          const s = db.sessions.find((x) => x.id === r.session_id) || {};
          const t = teacherOf(s.teacher_id) || {};
          return Object.assign(clone(r), { session_title: s.title, session_hidden: !!s.hidden, teacher_id: t.id, teacher_name: t.display_name });
        }));
      },
      async adminDeleteReport(id) { need(); load(); db.reports = db.reports.filter((r) => r.id !== id); save(); return delay(); },
      async adminHideSession(id, hidden) { return this.updateSession(id, { hidden }); },
      async adminSaveSettings(patch) {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        Object.assign(db.settings, patch); save();
        return delay();
      },
    };
  }

  window.API = LIVE ? liveApi() : demoApi();
})();
