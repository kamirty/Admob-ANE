/* =====================================================================
   طبقة البيانات: Supabase في التشغيل الحقيقي، أو بيانات تجريبية محلية
   عندما لا تكون مفاتيح Supabase موجودة في config.js
   ===================================================================== */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const AUTH_KEY = 'ataa-auth';
  const LIST_COLS = 'id,grade,subject,title,kind,starts_at,ends_at,video_url,recording_url,status,hidden,teacher_id,teacher:teachers(id,display_name,avatar_url)';
  const FULL_COLS = LIST_COLS + ',description';
  const iso = (d) => new Date(d).toISOString();

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  // تحويل أخطاء قاعدة البيانات إلى رسائل مفهومة
  function friendly(err) {
    const code = err && (err.code || (err.details && err.details.code));
    const msg = (err && (err.message || err.error_description || err.msg)) || '';
    if (code === '23P01') return 'لديك حصة مباشرة أخرى تتداخل مع هذا الوقت. غيّر الوقت أو ألغِ الحصة الأخرى.';
    if (code === '23514') return 'بعض البيانات غير صالحة. تأكد من الرابط (يجب أن يكون من يوتيوب) ومن طول العنوان والمدة.';
    if (code === '42501') return 'ليست لديك صلاحية لهذا الإجراء. إذا كان حسابك موقوفاً تواصل مع إدارة المنصة.';
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
    let sb = null;
    let loading = null;
    let user = null;
    const listeners = [];

    // قراءة عامة خفيفة بدون تحميل مكتبة Supabase (للطلاب)
    async function rest(table, pairs) {
      const qs = new URLSearchParams(pairs).toString();
      let res;
      try {
        res = await fetch(`${BASE}/rest/v1/${table}?${qs}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
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
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
      } catch (e) { throw new ApiError(e); }
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch (e) { /* not json */ }
        throw new ApiError(body);
      }
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
          try { const a = sessionStorage.getItem('ataa-after-login'); if (a && /^#\/[\w\/-]*$/.test(a)) after = a; sessionStorage.removeItem('ataa-after-login'); } catch (e) { /* ignore */ }
          history.replaceState(null, '', location.pathname + after);
        }
        return user;
      },
      onAuth(fn) { listeners.push(fn); },
      currentUser() { return user; },
      async signIn(after) {
        try { sessionStorage.setItem('ataa-after-login', after || '#/dashboard'); } catch (e) { /* ignore */ }
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
        const rows = await rest('settings', [['select', 'site_notice,auto_approve'], ['id', 'eq.1']]);
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
          ['ends_at', 'lt.' + iso(Date.now())], ['or', '(video_url.not.is.null,recording_url.not.is.null)'],
          ['order', 'starts_at.desc,id.desc'], ['limit', String(limit)], ['offset', String(offset)]];
        if (subject) p.push(['subject', 'eq.' + subject]);
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
        return check(await c.from('sessions').select(FULL_COLS).eq('teacher_id', user.id)
          .order('starts_at', { ascending: false }).limit(1000));
      },
      async createSessions(rows) {
        const c = await authed();
        const data = rows.map((r) => Object.assign({ teacher_id: user.id }, r));
        return check(await c.from('sessions').insert(data).select('id'));
      },
      async updateSession(id, patch) {
        const c = await authed();
        const r = check(await c.from('sessions').update(patch).eq('id', id).select('id'));
        if (!r || !r.length) throw new ApiError({ code: '42501' });
        return r[0];
      },
      async deleteSession(id) {
        const c = await authed();
        check(await c.from('sessions').delete().eq('id', id));
      },

      // ---------- المشرف ----------
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
    const KEY = 'ataa-demo-v2';
    const DEMO_UID = 'demo-teacher-you';
    let db = null;
    let user = null;
    const listeners = [];
    const uid = () => 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));
    const clone = (v) => JSON.parse(JSON.stringify(v));

    function seed() {
      const teachers = [
        ['t-ali', 'أ. علي حسين', 'رياضيات — 12 سنة خبرة'],
        ['t-zainab', 'أ. زينب كاظم', 'فيزياء وكيمياء'],
        ['t-mustafa', 'أ. مصطفى عبد الله', 'لغة عربية'],
        ['t-noor', 'أ. نور الهدى سامي', 'لغة إنكليزية'],
        ['t-haider', 'أ. حيدر جاسم', 'أحياء'],
        ['t-maryam', 'أ. مريم عادل', 'رياضيات وعلوم للمرحلة الابتدائية'],
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
          id: uid(), teacher_id: t, grade, subject, title, kind: 'live',
          description: 'شرح مبسّط مع أمثلة وحل أسئلة وزارية سابقة. جهّز دفترك وقلمك.',
          starts_at: iso(start), ends_at: iso(+start + mins * 60000), video_url: 'https://youtu.be/demo-video',
          recording_url: null, status: 'scheduled', hidden: false, created_at: iso(Date.now() - 864e5),
        }, extra || {}));
      };
      const now = new Date();
      const liveStart = new Date(now.getTime() - 20 * 60000);
      // الآن: معلمان يشرحان للثالث المتوسط في نفس الوقت
      add('t-ali', 'm3', 'math', 'المعادلات من الدرجة الثانية — الحل بالدستور', liveStart, 60);
      add('t-zainab', 'm3', 'physics', 'قوانين نيوتن مع مسائل محلولة', liveStart, 75);
      add('t-haider', 'i6b', 'biology', 'الوراثة: مسائل الهجين الثنائي', new Date(now.getTime() - 10 * 60000), 90);
      add('t-mustafa', 'm3', 'arabic', 'إعراب الأفعال الخمسة', new Date(now.getTime() + 10 * 60000), 45);
      const plan = [
        ['t-ali', 'm3', 'math', ['تحليل المقادير الجبرية', 'المتباينات', 'الهندسة الإحداثية', 'حل أسئلة وزارية']],
        ['t-maryam', 'm3', 'math', ['تحليل المقادير الجبرية (شرح ثانٍ)', 'المتباينات بطريقة مبسطة', 'الدوال', 'مراجعة الفصل الأول']],
        ['t-zainab', 'm3', 'chemistry', ['الجدول الدوري', 'الأحماض والقواعد', 'المحاليل', 'مراجعة شاملة']],
        ['t-noor', 'm3', 'english', ['Unit 1: Reading skills', 'Grammar: Present perfect', 'Writing a paragraph', 'Vocabulary review']],
        ['t-mustafa', 'm3', 'arabic', ['المفعول المطلق', 'النعت', 'البلاغة: التشبيه', 'قصيدة الحفظ']],
        ['t-haider', 'i6b', 'biology', ['التكاثر في النبات', 'الجهاز العصبي', 'الهرمونات', 'حل أسئلة الوزاري']],
        ['t-zainab', 'i6b', 'physics', ['المتسعات', 'الحث الكهرومغناطيسي', 'التيار المتناوب', 'الفيزياء الذرية']],
        ['t-ali', 'i6a', 'math', ['الأعداد المركبة', 'القطوع المخروطية', 'التفاضل', 'التكامل']],
        ['t-noor', 'i6l', 'english', ['Unit 2: The environment', 'Grammar: Passive voice', 'Literature: short story', 'Exam practice']],
        ['t-mustafa', 'i6l', 'arabic', ['الممنوع من الصرف', 'العروض', 'الأدب العباسي', 'التعبير']],
        ['t-maryam', 'p6', 'math', ['الكسور العشرية', 'النسبة والتناسب', 'المساحات', 'مراجعة']],
        ['t-maryam', 'p6', 'science', ['جسم الإنسان', 'المادة وخواصها', 'الطاقة', 'مراجعة']],
        ['t-haider', 'm1', 'biology', ['الخلية', 'تصنيف الكائنات', 'النبات', 'مراجعة']],
      ];
      const hours = [16, 17, 18, 19, 20];
      plan.forEach(([t, g, s, titles], pi) => {
        for (let d = -9; d <= 12; d++) {
          if ((d + pi) % 3 === 0) continue; // ليس كل يوم
          const h = hours[(pi + Math.abs(d)) % hours.length];
          const start = at(d, h, (pi % 2) * 30);
          if (d === 0 && start < now) continue;
          const title = titles[(d + 12) % titles.length];
          add(t, g, s, title, start, [45, 60, 60, 90][pi % 4], d < 0 ? { recording_url: null } : null);
        }
      });
      // درس مسجّل
      add('t-maryam', 'p6', 'math', 'جدول الضرب بطريقة سهلة (درس مسجّل)', at(-1, 9), 20, { kind: 'recorded' });
      // حصة ملغاة
      add('t-noor', 'm3', 'english', 'Listening practice', at(1, 21), 45, { status: 'cancelled' });
      // إزالة الحجوزات المزدوجة لنفس المعلم
      const kept = [];
      sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).forEach((s) => {
        if (s.kind === 'live' && s.status === 'scheduled' && kept.some((k) => k.teacher_id === s.teacher_id && k.kind === 'live'
          && k.status === 'scheduled' && k.starts_at < s.ends_at && s.starts_at < k.ends_at)) return;
        kept.push(s);
      });
      return { v: 2, teachers, sessions: kept, reports: [], settings: { auto_approve: true, site_notice: '' }, me: null };
    }
    function load() {
      if (db) return db;
      try { db = JSON.parse(storeGet(KEY) || 'null'); } catch (e) { db = null; }
      if (!db || db.v !== 2) { db = seed(); save(); }
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
        const rows = db.sessions.filter((s) => s.grade === grade && s.status === 'scheduled' && visible(s) && s.ends_at < now
          && (s.video_url || s.recording_url) && (!subject || s.subject === subject))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at) || String(b.id).localeCompare(String(a.id)));
        return delay(rows.slice(offset, offset + limit).map(withTeacher));
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
