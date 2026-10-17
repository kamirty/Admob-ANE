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
  const PLACE_COLS = ',term,unit,unit_title,lesson_type,exam_year,exam_round';
  const PLACE_KEYS = ['term', 'unit', 'unit_title', 'lesson_type', 'exam_year', 'exam_round', 'request_id'];
  const noPlace = (o) => { const x = Object.assign({}, o); PLACE_KEYS.forEach((k) => delete x[k]); return x; };
  const oldDb = (e) => !!e && (e.code === 'PGRST204' || e.code === '42703');
  let LIST_COLS = BASE_COLS + PLACE_COLS;
  let FULL_COLS = LIST_COLS + ',description';
  // إن رُفع الموقع قبل تحديث قاعدة البيانات: نعمل بالأعمدة القديمة بدل أن تتعطل الصفحات
  function legacyCols() {
    if (LIST_COLS === BASE_COLS) return false;
    LIST_COLS = BASE_COLS; FULL_COLS = BASE_COLS + ',description';
    return true;
  }
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
        if (e.code === '42703' && pairs.some((p) => p[0] === 'select' && p[1].includes(PLACE_COLS)) && legacyCols()) {
          return restRaw(table, pairs.map((p) => (p[0] === 'select' ? ['select', p[1].replace(PLACE_COLS, '')]
            : p[0] === 'order' ? ['order', p[1].replace('term.asc.nullslast,unit.asc.nullslast,', '')] : p)));
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
        try { rows = await restRaw('settings', [['select', 'site_notice,auto_approve,requests_on,views_on,request_min_votes'], ['id', 'eq.1']]); }
        catch (e) { if (e.code !== '42703') throw e; rows = await restRaw('settings', [['select', 'site_notice,auto_approve'], ['id', 'eq.1']]); }
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
          const r = await c.from('sessions').select(FULL_COLS).eq('id', id).maybeSingle();
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
        const rows = await rest('teachers', [['select', 'id,display_name,specialty,bio,youtube_channel,avatar_url'], ['id', 'eq.' + id]]);
        return rows[0] || null;
      },
      listTeacherSessions(id) {
        return rest('sessions', [['select', LIST_COLS], ['teacher_id', 'eq.' + id], ['status', 'eq.scheduled'],
          ['order', 'starts_at.desc'], ['limit', '200']]);
      },
      listTeachers() {
        return rest('teachers', [['select', 'id,display_name,specialty,avatar_url'], ['status', 'eq.approved'],
          ['order', 'display_name.asc'], ['limit', '1000']]);
      },
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
          youtube_channel: p.youtube_channel || null, avatar_url: p.avatar_url || null,
        };
        const r = exists
          ? await c.from('teachers').update(row).eq('id', user.id).select().single()
          : await c.from('teachers').insert(Object.assign({ id: user.id }, row)).select().single();
        return check(r);
      },
      async mySessions() {
        const c = await authed();
        let r = await c.from('sessions').select(FULL_COLS).eq('teacher_id', user.id).order('starts_at', { ascending: false }).limit(1000);
        if (r.error && r.error.code === '42703' && legacyCols()) r = null;
        if (r) return check(r);
        return check(await c.from('sessions').select(FULL_COLS).eq('teacher_id', user.id)
          .order('starts_at', { ascending: false }).limit(1000));
      },
      async createSessions(rows) {
        const c = await authed();
        const data = rows.map((r) => Object.assign({ teacher_id: user.id }, r));
        let r = await c.from('sessions').insert(data).select('id');
        // قاعدة بيانات لم تُحدَّث بعد: يُنشر الدرس بلا مكانه في الكتاب بدل أن يفشل
        if (oldDb(r.error)) r = await c.from('sessions').insert(data.map(noPlace)).select('id');
        return check(r);
      },
      async updateSession(id, patch) {
        const c = await authed();
        let q = await c.from('sessions').update(patch).eq('id', id).select('id');
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
        const r = check(await c.from('settings').update(patch).eq('id', 1).select('id'));
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
      ].map(([id, name, sp]) => ({
        id, display_name: name, specialty: sp, bio: 'معلم متطوع (مثال في الوضع التجريبي).',
        youtube_channel: 'https://www.youtube.com/@example', avatar_url: null, status: 'approved', is_admin: false,
        email: id + '@example.com', created_at: iso(Date.now() - 30 * 864e5),
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
          const d = ti * 3 - 9 + (pi % 4);
          const start = at(d, hours[(pi + ti) % hours.length], (pi % 2) * 30);
          // الدرس الأخير في كل قائمة مراجعة، والبقية دروس في وحدات الفصل الأول
          const place = /مراجعة|حل أسئلة/.test(title) ? { term: 1, lesson_type: 'review' } : { term: 1, unit: ti + 1, unit_title: null };
          add(t, g, s, title, start, [45, 60, 60, 90][pi % 4], place);
        });
      });
      add('t-maryam', 'g4', 'math', 'جدول الضرب بطريقة سهلة', at(-1, 9), 20);
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
      const stats = {};
      kept.forEach((s, i) => { if (+new Date(s.starts_at) <= Date.now()) stats[s.id] = { views: (i * 37) % 160 + 5, views7: (i * 13) % 40, thanks: (i * 7) % 30, understood: (i * 5) % 25 }; });
      return { v: 4, teachers, sessions: kept, reports: [], requests, stats, certificates: [], settings: { auto_approve: true, site_notice: '', requests_on: true, views_on: true, request_min_votes: 2 }, me: null };
    }
    function load() {
      if (db) return db;
      try { db = JSON.parse(storeGet(KEY) || 'null'); } catch (e) { db = null; }
      if (!db || db.v !== 4) { db = seed(); save(); }
      return db;
    }
    function save() { storeSet(KEY, JSON.stringify(db)); }
    const teacherOf = (id) => db.teachers.find((t) => t.id === id);
    function withTeacher(s) {
      const t = teacherOf(s.teacher_id);
      return Object.assign(clone(s), { teacher: t ? { id: t.id, display_name: t.display_name, avatar_url: t.avatar_url } : null });
    }
    const visible = (s) => !s.hidden && (teacherOf(s.teacher_id) || {}).status === 'approved';
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
          && words.every((w) => arNorm(s.title + ' ' + (s.unit_title || '')).includes(w)))
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
        if (topic && (/[0-9٠-٩]{5,}|@|https?:|www\.|\.com/.test(topic.replace(/[\s-]/g, '')) || /واتس|انستا|سناب|تيك ?توك|تلجرام|رقمي|خصوصي/.test(arNorm(topic)))) {
          throw new ApiError({ message: 'اكتب اسم الدرس فقط، بلا أرقام هواتف أو حسابات أو روابط' });
        }
        const key = arNorm(topic || '');
        // نفس اسم الدرس في نفس المادة طلبٌ واحد، ولو اختار الطالب وحدة أخرى
        let q = (topic && db.requests.filter((x) => x.grade === r.grade && x.subject === r.subject && x.topic_key === key && (x.status === 'open' || x.status === 'hidden')
          && (!r.term || !x.term || x.term === r.term)).sort((a, b) => b.votes - a.votes)[0])
          || db.requests.find((x) => x.grade === r.grade && x.subject === r.subject && (x.term || 0) === (r.term || 0) && (x.unit || 0) === (r.unit || 0) && x.topic_key === key);
        if (q) { q.votes += 1; q.last_at = iso(Date.now()); }
        else { q = { id: uid(), grade: r.grade, subject: r.subject, term: r.term || null, unit: r.unit || null, topic, topic_key: key, votes: 1, status: 'open', flags: 0, session_id: null, created_at: iso(Date.now()), last_at: iso(Date.now()) }; db.requests.push(q); }
        save();
        return delay({ id: q.id, votes: q.votes });
      },
      async countView(id) { load(); const st = db.stats[id] || (db.stats[id] = { views: 0, views7: 0, thanks: 0, understood: 0 }); st.views += 1; st.views7 += 1; save(); return delay(null); },
      async thankLesson(id, kind) { load(); const st = db.stats[id] || (db.stats[id] = { views: 0, views7: 0, thanks: 0, understood: 0 }); st[kind === 'thanks' ? 'thanks' : 'understood'] += 1; save(); return delay(null); },
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
          t = { id: user.id, status: db.settings.auto_approve ? 'approved' : 'pending', is_admin: true, email: user.email, created_at: iso(Date.now()) };
          db.teachers.push(t);
        }
        Object.assign(t, {
          display_name: p.display_name, specialty: p.specialty || null, bio: p.bio || null,
          youtube_channel: p.youtube_channel || null, avatar_url: p.avatar_url || null,
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
        const made = rows.map((r) => Object.assign({
          id: uid(), teacher_id: user.id, status: 'scheduled', hidden: false, recording_url: null, created_at: iso(Date.now()),
        }, r));
        const staged = [];
        made.forEach((m) => {
          guardOverlap(m);
          if (staged.some((s) => s.kind === 'live' && m.kind === 'live' && overlaps(s, m))) throw new ApiError({ code: '23P01' });
          staged.push(m);
        });
        db.sessions.push(...made);
        made.forEach((m) => {
          const q = m.request_id && db.requests.find((x) => x.id === m.request_id && x.status === 'open' && x.grade === m.grade && x.subject === m.subject);
          if (q && me.status === 'approved') { q.status = 'done'; q.session_id = m.id; q.last_at = iso(Date.now()); }
        });
        save();
        return delay(made.map((m) => ({ id: m.id })));
      },
      async updateSession(id, patch) {
        need(); load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s || (s.teacher_id !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
        const next = Object.assign({}, s, patch);
        if ('hidden' in patch && !isAdmin()) next.hidden = s.hidden;
        guardOverlap(next, id);
        Object.assign(s, next);
        save();
        return delay({ id });
      },
      async deleteSession(id) {
        need(); load();
        const s = db.sessions.find((x) => x.id === id);
        if (!s || (s.teacher_id !== user.id && !isAdmin())) throw new ApiError({ code: '42501' });
        db.sessions = db.sessions.filter((x) => x.id !== id);
        db.reports = db.reports.filter((r) => r.session_id !== id);
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
          && +new Date(s.starts_at) <= Date.now() - 3 * 864e5 && +new Date(s.ends_at) - +new Date(s.starts_at) >= 5 * 60000);
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
        });
      },
      async adminRequests() { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); return delay(db.requests.slice().sort((a, b) => (b.status === 'open') - (a.status === 'open') || b.votes - a.votes).map(clone)); },
      async adminSetRequest(id, status) {
        need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' });
        if (status === 'delete') db.requests = db.requests.filter((q) => q.id !== id);
        else { const q = db.requests.find((x) => x.id === id); if (q) { q.status = status; if (status === 'open') { q.flags = 0; q.flaggedBy = []; } } }
        save(); return delay();
      },
      async adminCertificates() { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); return delay(db.certificates.map(clone)); },
      async adminSetCertificate(code, revoked) { need(); load(); if (!isAdmin()) throw new ApiError({ code: '42501' }); const c = db.certificates.find((x) => x.code === code); if (c) c.revoked = revoked; save(); return delay(); },
      async adminTeachers() {
        need(); load();
        if (!isAdmin()) throw new ApiError({ code: '42501' });
        return delay(db.teachers.map((t) => Object.assign(clone(t), {
          sessions_count: db.sessions.filter((s) => s.teacher_id === t.id).length,
          last_session_at: (db.sessions.filter((s) => s.teacher_id === t.id).map((s) => s.starts_at).sort().pop()) || null,
        })).sort((a, b) => (b.status === 'pending') - (a.status === 'pending')));
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
