-- =====================================================================
--  منصة مِدْرار العلم — مخطط قاعدة البيانات (Supabase / PostgreSQL)
--  انسخ هذا الملف كاملاً والصقه في: Supabase → SQL Editor → New query → Run
--  يمكن تشغيله أكثر من مرة بأمان.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto   with schema extensions;

-- ---------------------------------------------------------------------
-- 1) إعدادات المنصة (صف واحد فقط)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  auto_approve boolean not null default false,          -- قبول المعلمين تلقائياً بدون مراجعة
  site_notice  text check (char_length(site_notice) <= 300), -- إعلان يظهر أعلى المنصة
  updated_at   timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings add column if not exists requests_on       boolean  not null default true; -- «اطلب درساً»
alter table public.settings add column if not exists views_on          boolean  not null default true; -- عدّاد المشاهدات والشكر
alter table public.settings add column if not exists request_min_votes smallint not null default 2;    -- أقل عدد طلاب ليظهر الطلب للمعلمين
alter table public.settings drop constraint if exists settings_request_min_votes_check;
alter table public.settings add constraint settings_request_min_votes_check check (request_min_votes between 1 and 50);

-- ---------------------------------------------------------------------
-- 2) المعلمون (كل معلم مرتبط بحساب Google الخاص به)
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text not null check (char_length(btrim(display_name)) between 2 and 60),
  specialty       text check (char_length(specialty) <= 120),
  bio             text check (char_length(bio) <= 400),
  youtube_channel text check (youtube_channel is null or (char_length(youtube_channel) <= 200
                        and youtube_channel ~* '^https://(www\.|m\.)?youtube\.com/')),
  avatar_url      text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  is_admin        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) الحصص — كل حصة تخص معلماً واحداً. يمكن لعدة معلمين الشرح لنفس
--    الصف والمادة في نفس الوقت، لكن المعلم الواحد لا يُحجز مرتين.
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  grade         text not null check (grade ~ '^[a-z0-9_-]{1,20}$'),
  subject       text not null check (subject ~ '^[a-z0-9_-]{1,30}$'),
  title         text not null check (char_length(btrim(title)) between 3 and 120),
  description   text check (char_length(description) <= 1500),
  kind          text not null default 'live' check (kind in ('live', 'recorded')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  video_url     text check (video_url is null or (char_length(video_url) <= 300
                    and video_url ~* '^https://(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/')),
  recording_url text check (recording_url is null or (char_length(recording_url) <= 300
                    and recording_url ~* '^https://(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/')),
  status        text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  hidden        boolean not null default false,       -- يخفيها المشرف فقط
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sessions_duration check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours'),
  constraint sessions_no_teacher_overlap exclude using gist (
    teacher_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled' and kind = 'live')
);

-- مكان الدرس في الكتاب المدرسي ونوعه (كلها اختيارية)
alter table public.sessions add column if not exists term        smallint;               -- الفصل الدراسي 1 أو 2
alter table public.sessions add column if not exists unit        smallint;               -- رقم الوحدة
alter table public.sessions add column if not exists unit_title  text;                   -- اسم الوحدة
alter table public.sessions add column if not exists lesson_type text not null default 'lesson'; -- شرح/حل الكتاب/مراجعة/امتحانات
alter table public.sessions add column if not exists exam_year   smallint;               -- سنة امتحان الدبلوم المحلول
alter table public.sessions add column if not exists exam_round  smallint;               -- الدور الأول أو الثاني
alter table public.sessions drop constraint if exists sessions_curriculum;
alter table public.sessions add constraint sessions_curriculum check (
  (term is null or term in (1, 2))
  and (unit is null or unit between 1 and 20)
  and (unit_title is null or char_length(btrim(unit_title)) between 2 and 80)
  and lesson_type in ('lesson', 'book', 'review', 'exam')
  and (exam_year is null or (lesson_type = 'exam' and exam_year between 2000 and 2100))
  and (exam_round is null or (lesson_type = 'exam' and exam_round in (1, 2)))
);

-- طلبات الطلاب «اطلب درساً»: بلا أسماء ولا حسابات، تُقرأ عبر الدوال فقط
create table if not exists public.lesson_requests (
  id         uuid primary key default gen_random_uuid(),
  grade      text not null check (grade ~ '^[a-z0-9_-]{1,20}$'),
  subject    text not null check (subject ~ '^[a-z0-9_-]{1,30}$'),
  term       smallint check (term in (1, 2)),
  unit       smallint check (unit between 1 and 20),
  topic      text check (topic is null or char_length(topic) between 3 and 80),
  topic_key  text not null default '',
  votes      int not null default 1 check (votes >= 1),
  status     text not null default 'open' check (status in ('open', 'done', 'hidden')),
  session_id uuid references public.sessions (id) on delete set null,
  flags      smallint not null default 0,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  constraint lesson_requests_what check (topic is not null or unit is not null)
);
create unique index if not exists lesson_requests_key
  on public.lesson_requests (grade, subject, (coalesce(term, 0)), (coalesce(unit, 0)), topic_key);
create index if not exists lesson_requests_top on public.lesson_requests (grade, subject, status, votes desc);
alter table public.sessions add column if not exists request_id uuid;
-- مرجع مرن بلا قيد: حذف الطلب لا يمنع نشر الدرس الذي سُجّل له
alter table public.sessions drop constraint if exists sessions_request_id_fkey;

create index if not exists sessions_grade_start_idx   on public.sessions (grade, starts_at);
create index if not exists sessions_curriculum_idx    on public.sessions (grade, subject, term, unit, starts_at);
create index if not exists sessions_teacher_start_idx on public.sessions (teacher_id, starts_at);
create index if not exists sessions_ends_idx          on public.sessions (ends_at);

-- ---------------------------------------------------------------------
-- 4) البلاغات (يرسلها الزوار، ويقرؤها المشرفون فقط)
-- ---------------------------------------------------------------------
-- البلاغ يبقى محفوظاً حتى لو حذف المعلم الحصة
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  session_id uuid references public.sessions (id) on delete set null,
  reason     text not null check (char_length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);
alter table public.reports add column if not exists teacher_id    uuid;
alter table public.reports add column if not exists session_title text;
alter table public.reports add column if not exists client_hash   text;
alter table public.reports alter column session_id drop not null;
alter table public.reports drop constraint if exists reports_session_id_fkey;
alter table public.reports add constraint reports_session_id_fkey
  foreign key (session_id) references public.sessions (id) on delete set null;
create index if not exists reports_session_idx on public.reports (session_id, created_at);
create index if not exists reports_client_idx  on public.reports (client_hash, created_at);

-- صورة المعلم من حساب Google فقط (لا روابط خارجية تتتبع الطلاب)
alter table public.teachers drop constraint if exists teachers_avatar_url_check;
alter table public.teachers add constraint teachers_avatar_url_check check (avatar_url is null or
  (char_length(avatar_url) <= 500 and avatar_url ~ '^https://lh[0-9]+\.googleusercontent\.com/'));

-- ---------------------------------------------------------------------
-- 5) دوال مساعدة
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select t.is_admin from public.teachers t
                    where t.id = auth.uid() and t.status = 'approved'), false);
$$;

create or replace function public.my_status() returns text
language sql stable security definer set search_path = public as $$
  select t.status from public.teachers t where t.id = auth.uid();
$$;

-- حماية حقول المعلم: المعلم لا يستطيع اعتماد نفسه أو جعل نفسه مشرفاً.
-- (الدالة تعمل بصلاحية المستدعي عمداً حتى نعرف إن كان الطلب من الموقع)
create or replace function public.teachers_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin   := false;
      new.created_at := now();
      new.status     := case when coalesce((select s.auto_approve from public.settings s where s.id = 1), false)
                             then 'approved' else 'pending' end;
    else
      new.id         := old.id;
      new.created_at := old.created_at;
      -- صلاحية المشرف تُمنح من SQL Editor فقط، لا من الموقع
      new.is_admin   := old.is_admin;
      if not public.is_admin() then
        new.status   := old.status;
      end if;
    end if;
  end if;
  if new.status = 'suspended' then
    new.is_admin := false;
  end if;
  return new;
end $$;

drop trigger if exists teachers_guard on public.teachers;
create trigger teachers_guard before insert or update on public.teachers
  for each row execute function public.teachers_guard();

-- حماية حقول الحصة + حدود معقولة لمنع الإساءة
create or replace function public.sessions_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  admin boolean;
begin
  new.updated_at := now();
  new.unit_title := nullif(btrim(new.unit_title), '');
  if new.unit is null then new.unit_title := null; end if;
  if current_user in ('anon', 'authenticated') then
    admin := public.is_admin();
    if tg_op = 'INSERT' then
      new.created_at := now();
      new.hidden     := false;
      if not admin then
        new.teacher_id := auth.uid();
      end if;
      if new.starts_at > now() + interval '200 days' then
        raise exception 'لا يمكن جدولة حصة بعد أكثر من 200 يوم' using errcode = '22023';
      end if;
      if (select count(*) from public.sessions x
           where x.teacher_id = new.teacher_id and x.created_at > now() - interval '1 day') >= 80 then
        raise exception 'تجاوزت الحد اليومي لإضافة الحصص' using errcode = '54000';
      end if;
    else
      new.id         := old.id;
      new.created_at := old.created_at;
      if not admin then
        new.teacher_id := old.teacher_id;
        new.hidden     := old.hidden;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard before insert or update on public.sessions
  for each row execute function public.sessions_guard();

create or replace function public.settings_touch() returns trigger
language plpgsql as $$
begin
  new.id := 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.settings_touch();

-- ---------------------------------------------------------------------
-- 6) سياسات الأمان (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.teachers enable row level security;
alter table public.sessions enable row level security;
alter table public.reports  enable row level security;

drop policy if exists settings_read   on public.settings;
drop policy if exists settings_update on public.settings;
create policy settings_read   on public.settings for select using (true);
create policy settings_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists teachers_read   on public.teachers;
drop policy if exists teachers_insert on public.teachers;
drop policy if exists teachers_update on public.teachers;
drop policy if exists teachers_delete on public.teachers;
create policy teachers_read on public.teachers for select
  using (status = 'approved' or id = auth.uid() or public.is_admin());
create policy teachers_insert on public.teachers for insert to authenticated
  with check (id = auth.uid());
create policy teachers_update on public.teachers for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy teachers_delete on public.teachers for delete to authenticated
  using (public.is_admin());

drop policy if exists sessions_read   on public.sessions;
drop policy if exists sessions_insert on public.sessions;
drop policy if exists sessions_update on public.sessions;
drop policy if exists sessions_delete on public.sessions;
create policy sessions_read on public.sessions for select using (
  (not hidden and exists (select 1 from public.teachers t
                           where t.id = sessions.teacher_id and t.status = 'approved'))
  or teacher_id = auth.uid()
  or public.is_admin()
);
create policy sessions_insert on public.sessions for insert to authenticated with check (
  (teacher_id = auth.uid() and public.my_status() in ('pending', 'approved'))
  or public.is_admin()
);
create policy sessions_update on public.sessions for update to authenticated
  using      ((teacher_id = auth.uid() and public.my_status() in ('pending', 'approved')) or public.is_admin())
  with check ((teacher_id = auth.uid() and public.my_status() in ('pending', 'approved')) or public.is_admin());
create policy sessions_delete on public.sessions for delete to authenticated
  using ((teacher_id = auth.uid() and not hidden and public.my_status() in ('pending', 'approved'))
         or public.is_admin());

drop policy if exists reports_admin_read   on public.reports;
drop policy if exists reports_admin_delete on public.reports;
create policy reports_admin_read   on public.reports for select to authenticated using (public.is_admin());
create policy reports_admin_delete on public.reports for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 7) الصلاحيات
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.settings, public.teachers, public.sessions, public.reports from anon, authenticated;
grant select on public.settings, public.teachers, public.sessions to anon, authenticated;
grant update (auto_approve, site_notice, requests_on, views_on, request_min_votes) on public.settings to authenticated;
grant insert, update, delete on public.teachers to authenticated;
grant insert, update, delete on public.sessions to authenticated;
grant select, delete on public.reports to authenticated;

-- ---------------------------------------------------------------------
-- 8) دوال يستدعيها الموقع
-- ---------------------------------------------------------------------

-- إرسال بلاغ عن حصة (متاح للجميع، مع حدود ضد الإغراق)
create or replace function public.report_session(p_session uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  hdr    json;
  ip     text;
  client text;
  s      record;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'اكتب سبب البلاغ' using errcode = '22023';
  end if;
  select x.id, x.teacher_id, x.title into s from public.sessions x where x.id = p_session;
  if not found then
    raise exception 'الحصة غير موجودة' using errcode = '22023';
  end if;
  begin
    hdr := current_setting('request.headers', true)::json;
  exception when others then
    hdr := null;
  end;
  ip := coalesce(hdr ->> 'cf-connecting-ip', split_part(hdr ->> 'x-forwarded-for', ',', 1),
                 hdr ->> 'x-real-ip', 'unknown');
  client := md5(btrim(ip) || ':ataa-reports');
  -- حدود لكل زائر: بلاغ واحد لكل حصة يومياً، و6 بلاغات في الساعة
  if exists (select 1 from public.reports r where r.client_hash = client and r.session_id = p_session
              and r.created_at > now() - interval '1 day') then
    return;
  end if;
  if (select count(*) from public.reports r where r.client_hash = client
       and r.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'أرسلت بلاغات كثيرة، حاول بعد ساعة' using errcode = '54000';
  end if;
  if (select count(*) from public.reports r where r.created_at > now() - interval '1 hour') >= 3000 then
    raise exception 'البلاغات كثيرة الآن، حاول لاحقاً' using errcode = '54000';
  end if;
  insert into public.reports (session_id, reason, teacher_id, session_title, client_hash)
  values (p_session, left(btrim(p_reason), 500), s.teacher_id, s.title, client);
end $$;

-- قائمة المعلمين للمشرف (مع البريد الإلكتروني)
drop function if exists public.admin_list_teachers();
create or replace function public.admin_list_teachers()
returns table (
  id uuid, display_name text, email text, specialty text, bio text, youtube_channel text,
  avatar_url text, status text, is_admin boolean, created_at timestamptz,
  sessions_count bigint, last_session_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'هذه الصفحة للمشرفين فقط' using errcode = '42501';
  end if;
  return query
    select t.id, t.display_name, u.email::text, t.specialty, t.bio, t.youtube_channel,
           t.avatar_url, t.status, t.is_admin, t.created_at,
           (select count(*) from public.sessions s where s.teacher_id = t.id),
           (select max(s.starts_at) from public.sessions s where s.teacher_id = t.id)
      from public.teachers t
      left join auth.users u on u.id = t.id
     order by (t.status = 'pending') desc, t.created_at desc;
end $$;

-- البلاغات مع معلومات الحصة للمشرف
drop function if exists public.admin_list_reports();
create or replace function public.admin_list_reports()
returns table (
  id bigint, session_id uuid, reason text, created_at timestamptz,
  session_title text, session_hidden boolean, teacher_id uuid, teacher_name text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'هذه الصفحة للمشرفين فقط' using errcode = '42501';
  end if;
  return query
    select r.id, r.session_id, r.reason, r.created_at,
           coalesce(s.title, r.session_title || ' (حذفها المعلم)'), coalesce(s.hidden, false),
           t.id, t.display_name
      from public.reports r
      left join public.sessions s on s.id = r.session_id
      left join public.teachers t on t.id = coalesce(s.teacher_id, r.teacher_id)
     order by r.created_at desc
     limit 1000;
end $$;

revoke execute on function public.admin_list_teachers() from public, anon;
revoke execute on function public.admin_list_reports()  from public, anon;
grant  execute on function public.admin_list_teachers() to authenticated;
grant  execute on function public.admin_list_reports()  to authenticated;
grant  execute on function public.report_session(uuid, text) to anon, authenticated;
grant  execute on function public.is_admin()  to anon, authenticated;
grant  execute on function public.my_status() to anon, authenticated;

-- =====================================================================
-- 9) ميزات الطلاب والمعلمين: طلبات الدروس، المشاهدات والشكر، الشهادات، البحث
-- =====================================================================

-- ---------------------------------------------------------------------
-- 9.1) طبقة الحماية: بصمة مجهولة تتغير يومياً + حدود الاستخدام
--      لا نحفظ عنوان IP أبداً. البصمة مشفّرة بملح يتجدد كل يوم ويُحذف خلال يومين.
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.daily_salt (
  day  date primary key,
  salt bytea not null
);
create table if not exists private.rate_hits (
  client text not null,
  scope  text not null,
  bucket timestamp not null,
  n      int not null default 1,
  primary key (client, scope, bucket)
);
create table if not exists private.request_votes (
  request_id uuid not null references public.lesson_requests (id) on delete cascade,
  client     text not null,
  at         timestamptz not null default now(),
  primary key (request_id, client)
);
create table if not exists private.request_flags (
  request_id uuid not null references public.lesson_requests (id) on delete cascade,
  teacher_id uuid not null,
  primary key (request_id, teacher_id)
);
-- كلمات تُرفض في «اطلب درساً» (وسائل تواصل وإعلانات). يضيف المشرف ما يشاء:
-- insert into private.blocked_terms (term, action) values ('كلمة', 'hide');
-- action = 'reject' يرفض الطلب برسالة، و 'hide' يقبله ظاهرياً ويخفيه عن المعلمين.
create table if not exists private.blocked_terms (
  term   text primary key check (char_length(term) between 2 and 40),
  action text not null default 'hide' check (action in ('reject', 'hide'))
);
insert into private.blocked_terms (term, action) values
  ('واتس', 'reject'), ('واتساب', 'reject'), ('whatsapp', 'reject'), ('wa.me', 'reject'),
  ('انستا', 'reject'), ('انستقرام', 'reject'), ('انستغرام', 'reject'), ('instagram', 'reject'),
  ('سناب شات', 'reject'), ('سنابشات', 'reject'), ('snap', 'reject'), ('تيك توك', 'reject'), ('تيكتوك', 'reject'), ('tiktok', 'reject'),
  ('تلجرام', 'reject'), ('تليجرام', 'reject'), ('telegram', 'reject'),
  ('رقم هاتف', 'reject'), ('رقم الهاتف', 'reject'), ('تواصل معي', 'reject'), ('كلموني', 'reject'),
  ('دروس خصوصي', 'reject'), ('درس خصوصي', 'reject'), ('مدرس خصوصي', 'reject')
on conflict (term) do nothing;
-- كلمات أوقعت دروساً حقيقية («المواطنة الرقمية»، «سبع سنابل») في نسخة سابقة
delete from private.blocked_terms where term in ('رقمي', 'سناب');

-- توحيد النص العربي للبحث والمقارنة: الهمزات، التاء المربوطة، الياء، الأرقام، التشكيل
create or replace function public.ar_norm(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')),
      'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      'ااااهيوي01234567890123456789'),
    '[ً-ْـ​-‏‪-‮⁦-⁩[:cntrl:]]', '', 'g'),
    '\s+', ' ', 'g'));
$$;

-- هل في النص كلمة من القائمة؟ تُطابق بداية الكلمة (مع «و» و«ال» و«بال»…) لا وسطها
create or replace function private.has_term(k text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from private.blocked_terms b
     where b.action = p_action
       and k ~ ('(^|[^a-z0-9ء-ي])(و|ف|ب|ل|ال|وال|بال|فال|لل)?'
                || replace(regexp_replace(public.ar_norm(b.term), '[^a-z0-9ء-ي .]', '', 'g'), '.', '\.')));
$$;

create or replace function private.client_hash(p_scope text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  hdr json;
  ip  text;
  d   date := (now() at time zone 'Asia/Muscat')::date;
  s   bytea;
begin
  begin
    hdr := current_setting('request.headers', true)::json;
  exception when others then
    hdr := null;
  end;
  ip := btrim(coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(split_part(hdr ->> 'x-forwarded-for', ',', 1), ''),
                       nullif(hdr ->> 'x-real-ip', ''), 'unknown'));
  if ip like '%:%' then
    -- IPv6: نكتفي بالشبكة /64 حتى لا يتهرب أحد بتغيير آخر العنوان
    begin
      ip := host(network(set_masklen(ip::inet, 64)));
    exception when others then
      null;
    end;
  end if;
  select x.salt into s from private.daily_salt x where x.day = d;
  if s is null then
    insert into private.daily_salt (day, salt) values (d, extensions.gen_random_bytes(32)) on conflict (day) do nothing;
    select x.salt into s from private.daily_salt x where x.day = d;
    -- مرة في اليوم: يُحذف ملح الأمس وبصماته، فلا يمكن الرجوع منها إلى أي عنوان
    delete from private.daily_salt where day < d;
    delete from private.rate_hits where bucket < (now() at time zone 'Asia/Muscat') - interval '1 day';
    delete from private.request_votes where at < now() - interval '1 day';
  end if;
  return encode(extensions.digest(convert_to(ip || '|' || p_scope, 'UTF8') || s, 'sha256'), 'hex');
end $$;

-- عدّاد حدود الاستخدام: يرجع true ما دام الزائر ضمن الحد
create or replace function private.hit(p_client text, p_scope text, p_limit int, p_window text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v int;
begin
  insert into private.rate_hits as r (client, scope, bucket, n)
  values (p_client, p_scope, date_trunc(p_window, now() at time zone 'Asia/Muscat'), 1)
  on conflict (client, scope, bucket) do update set n = r.n + 1
  returning r.n into v;
  return v <= p_limit;
end $$;

-- الدرس متاح للطلاب الآن؟ (منشور، غير مخفي، معلمه معتمد، وله فيديو)
create or replace function private.watchable(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s join public.teachers t on t.id = s.teacher_id
     where s.id = p_session and s.status = 'scheduled' and not s.hidden and t.status = 'approved'
       and s.starts_at <= now() and (s.video_url is not null or s.recording_url is not null));
$$;

create or replace function private.new_code() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  b bytea := extensions.gen_random_bytes(10);
  a text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- بلا 0/O/1/I حتى لا تختلط عند الكتابة
  s text  := '';
begin
  for i in 0..9 loop
    s := s || substr(a, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return s;
end $$;

revoke all on all tables    in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9.2) «اطلب درساً»
-- ---------------------------------------------------------------------
alter table public.lesson_requests enable row level security;  -- بلا سياسات: الوصول عبر الدوال فقط
revoke all on public.lesson_requests from anon, authenticated;

create or replace function public.request_lesson(p_grade text, p_subject text, p_term int, p_unit int, p_topic text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  t      text := nullif(btrim(regexp_replace(coalesce(p_topic, ''), '\s+', ' ', 'g')), '');
  k      text := '';
  hide   boolean := false;
  client text;
  r      record;
  added  int;
  joined boolean := false;
begin
  if not coalesce((select s.requests_on from public.settings s where s.id = 1), true) then
    raise exception 'استقبال الطلبات متوقف مؤقتاً' using errcode = '22023';
  end if;
  if coalesce(p_grade, '') !~ '^[a-z0-9_-]{1,20}$' or coalesce(p_subject, '') !~ '^[a-z0-9_-]{1,30}$'
     or (p_term is not null and p_term not in (1, 2)) or (p_unit is not null and (p_unit < 1 or p_unit > 20)) then
    raise exception 'بيانات الطلب غير صالحة' using errcode = '22023';
  end if;
  if t is null and p_unit is null then
    raise exception 'اختر الوحدة أو اكتب اسم الدرس' using errcode = '22023';
  end if;
  if t is not null then
    t := left(t, 80);
    if char_length(t) < 3 then
      raise exception 'اكتب اسم الدرس (3 أحرف على الأقل)' using errcode = '22023';
    end if;
    k := public.ar_norm(t);
    -- رقم هاتف: 8 أرقام فأكثر ولو فُصلت بنقاط أو شرطات أو مسافات (بعد استبعاد السنوات مثل 2023-2024)
    if regexp_replace(k, '(^|[^0-9])(19|20)[0-9]{2}(?=[^0-9]|$)', '\1', 'g') ~ '[0-9]([^a-z0-9ء-ي]{0,3}[0-9]){7,}'
       or k ~ '(@|https?:|www\.|\.com|\.net|\.org|\.om\M)' or private.has_term(k, 'reject') then
      raise exception 'اكتب اسم الدرس فقط، بلا أرقام هواتف أو حسابات أو روابط' using errcode = '22023';
    end if;
    hide := private.has_term(k, 'hide');
  end if;
  client := private.client_hash('req');
  -- حدود تتسع لفصل كامل يطلب من شبكة مدرسة واحدة
  if not private.hit(client, 'req', 40, 'hour') or not private.hit(client, 'req-day', 120, 'day') then
    raise exception 'أرسلت طلبات كثيرة، حاول لاحقاً' using errcode = '54000';
  end if;
  if (select count(*) from public.lesson_requests q where q.last_at > now() - interval '1 hour') >= 600 then
    raise exception 'الطلبات كثيرة الآن، حاول لاحقاً' using errcode = '54000';
  end if;
  -- نفس اسم الدرس في نفس المادة طلبٌ واحد، ولو اختار الطالب وحدة أخرى أو «لا أعرف»
  if t is not null then
    select q.id, q.votes, false as inserted into r from public.lesson_requests q
     where q.grade = p_grade and q.subject = p_subject and q.topic_key = k and q.status in ('open', 'hidden')
       and (p_term is null or q.term is null or q.term = p_term)
     order by q.votes desc, q.last_at desc limit 1;
    joined := found;
  end if;
  if joined then
    update public.lesson_requests q set last_at = now() where q.id = r.id;
  else
    insert into public.lesson_requests as q (grade, subject, term, unit, topic, topic_key, status)
    values (p_grade, p_subject, p_term, p_unit, t, k, case when hide then 'hidden' else 'open' end)
    on conflict (grade, subject, (coalesce(term, 0)), (coalesce(unit, 0)), topic_key)
    -- طلب سُجّل من قبل ثم حُذف درسه أو أُخفي: يعود مفتوحاً
    do update set last_at = now(),
      status = case when q.status = 'done' and not private.watchable(q.session_id) then 'open' else q.status end,
      session_id = case when q.status = 'done' and not private.watchable(q.session_id) then null else q.session_id end
    returning q.id, q.votes, (q.xmax = 0) as inserted into r;
  end if;
  -- صوت واحد لكل زائر يومياً لكل طلب
  insert into private.request_votes (request_id, client) values (r.id, client) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 1 and not r.inserted then
    update public.lesson_requests q set votes = q.votes + 1 where q.id = r.id returning q.votes into r.votes;
  end if;
  return json_build_object('id', r.id, 'votes', r.votes);
end $$;

-- طلبات صفوف المعلم ومواده (للمعلمين المعتمدين فقط، وبعد أن يطلبها عدد كافٍ من الطلاب)
drop function if exists public.teacher_requests(text[]);
create or replace function public.teacher_requests(p_keys text[])
returns table (id uuid, grade text, subject text, term smallint, unit smallint, topic text,
               votes int, status text, session_id uuid, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_status(), '') <> 'approved' then
    raise exception 'تظهر طلبات الطلاب بعد اعتماد حسابك' using errcode = '42501';
  end if;
  return query
    select q.id, q.grade, q.subject, q.term, q.unit, q.topic, q.votes, q.status, q.session_id, q.last_at
      from public.lesson_requests q
     where (q.grade || ':' || q.subject) = any ((coalesce(p_keys, '{}'::text[]))[1:24])
       and q.votes >= coalesce((select s.request_min_votes from public.settings s where s.id = 1), 2)
       and (q.status = 'open' or (q.status = 'done' and q.last_at > now() - interval '30 days'))
       and not exists (select 1 from private.request_flags f where f.request_id = q.id and f.teacher_id = auth.uid())
     order by (q.status = 'open') desc, q.votes desc, q.last_at desc
     limit 30;
end $$;

-- «غير مناسب»: إخفاء الطلب بعد بلاغين من معلمَين مختلفين
create or replace function public.flag_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  added int;
begin
  if coalesce(public.my_status(), '') <> 'approved' then
    raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;
  insert into private.request_flags (request_id, teacher_id) values (p_id, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 1 then
    update public.lesson_requests q
       set flags = q.flags + 1, status = case when q.flags + 1 >= 2 and q.status = 'open' then 'hidden' else q.status end
     where q.id = p_id;
  end if;
end $$;

-- عند نشر درس لطلب: يصبح الطلب «تم»
create or replace function public.sessions_fulfil_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.request_id is not null then
    update public.lesson_requests q set status = 'done', session_id = new.id, last_at = now()
     where q.id = new.request_id and q.status = 'open' and q.grade = new.grade and q.subject = new.subject
       and exists (select 1 from public.teachers t where t.id = new.teacher_id and t.status = 'approved');
  end if;
  return null;
end $$;
drop trigger if exists sessions_fulfil_request on public.sessions;
create trigger sessions_fulfil_request after insert on public.sessions
  for each row execute function public.sessions_fulfil_request();

-- حذف الدرس يعيد طلبه مفتوحاً ليراه المعلمون من جديد
create or replace function public.sessions_unfulfil_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.lesson_requests q set status = 'open', session_id = null
   where q.session_id = old.id and q.status = 'done';
  return old;
end $$;
drop trigger if exists sessions_unfulfil_request on public.sessions;
create trigger sessions_unfulfil_request before delete on public.sessions
  for each row execute function public.sessions_unfulfil_request();

-- ---------------------------------------------------------------------
-- 9.3) المشاهدات والشكر: أرقام إجمالية يراها المعلم وحده
-- ---------------------------------------------------------------------
create table if not exists public.lesson_stats (
  session_id uuid not null references public.sessions (id) on delete cascade,
  day        date not null,
  views      int not null default 0 check (views >= 0),
  thanks     int not null default 0 check (thanks >= 0),
  understood int not null default 0 check (understood >= 0),
  primary key (session_id, day)
);
alter table public.lesson_stats enable row level security;  -- بلا سياسات: الوصول عبر الدوال فقط
revoke all on public.lesson_stats from anon, authenticated;

create or replace function public.count_view(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  client text;
begin
  if not coalesce((select s.views_on from public.settings s where s.id = 1), true) then return; end if;
  if not private.watchable(p_session) then return; end if;
  if auth.uid() is not null and exists (select 1 from public.sessions s where s.id = p_session and s.teacher_id = auth.uid()) then
    return;
  end if;
  client := private.client_hash('views');
  -- فصل دراسي كامل على شبكة واحدة: حتى 20 مشاهدة للدرس في الساعة، و300 لكل الدروس
  if not private.hit(client, 'view:' || p_session, 40, 'hour') or not private.hit(client, 'views', 300, 'hour') then
    return;
  end if;
  insert into public.lesson_stats as l (session_id, day, views)
  values (p_session, (now() at time zone 'Asia/Muscat')::date, 1)
  on conflict (session_id, day) do update set views = l.views + 1;
end $$;

create or replace function public.thank_lesson(p_session uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  client text;
begin
  if p_kind not in ('thanks', 'understood') then
    raise exception 'نوع غير معروف' using errcode = '22023';
  end if;
  if not coalesce((select s.views_on from public.settings s where s.id = 1), true) then return; end if;
  if not private.watchable(p_session) then return; end if;
  client := private.client_hash('thanks');
  if not private.hit(client, p_kind || ':' || p_session, 40, 'day') or not private.hit(client, 'thanks', 80, 'hour') then
    return;
  end if;
  insert into public.lesson_stats as l (session_id, day, thanks, understood)
  values (p_session, (now() at time zone 'Asia/Muscat')::date, (p_kind = 'thanks')::int, (p_kind = 'understood')::int)
  on conflict (session_id, day) do update
    set thanks = l.thanks + excluded.thanks, understood = l.understood + excluded.understood;
end $$;

drop function if exists public.my_lesson_stats();
create or replace function public.my_lesson_stats()
returns table (session_id uuid, views bigint, views7 bigint, thanks bigint, understood bigint)
language sql stable security definer set search_path = public as $$
  select l.session_id, sum(l.views), sum(l.views) filter (where l.day > (now() at time zone 'Asia/Muscat')::date - 7),
         sum(l.thanks), sum(l.understood)
    from public.lesson_stats l
    join public.sessions s on s.id = l.session_id
   where s.teacher_id = auth.uid()
   group by l.session_id;
$$;

-- ---------------------------------------------------------------------
-- 9.4) شهادة الشكر والتقدير للمعلم المتطوع (قابلة للتحقق برابط عام)
-- ---------------------------------------------------------------------
create table if not exists public.certificates (
  code         text primary key check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  display_name text not null,
  channel      text,
  lessons      int not null check (lessons > 0),
  level        int not null check (level in (5, 10, 25, 50, 100)),
  subjects     text[] not null default '{}',
  issued_at    timestamptz not null default now(),
  revoked      boolean not null default false,
  unique (teacher_id, level)
);
alter table public.certificates enable row level security;  -- بلا سياسات: الوصول عبر الدوال فقط
revoke all on public.certificates from anon, authenticated;

-- تُحسب الدروس المنشورة منذ 3 أيام على الأقل (وقت كافٍ للبلاغات)، ومدتها 5 دقائق فأكثر، وكل فيديو مرة واحدة
create or replace function public.claim_certificate()
returns table (code text, level int, lessons int, issued_at timestamptz, revoked boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me   record;
  n    int;
  subj text[];
  lvl  int;
begin
  if coalesce(public.my_status(), '') <> 'approved' then
    raise exception 'تُمنح الشهادة بعد اعتماد حسابك' using errcode = '42501';
  end if;
  select t.display_name, t.youtube_channel into me from public.teachers t where t.id = auth.uid();
  select count(distinct substring(s.video_url from '(?:youtu\.be/|[?&]v=|/(?:live|shorts|embed)/)([A-Za-z0-9_-]{11})'))::int,
         coalesce(array_agg(distinct s.grade || ':' || s.subject), '{}')
    into n, subj
    from public.sessions s
   where s.teacher_id = auth.uid() and s.status = 'scheduled' and not s.hidden and s.video_url is not null
     -- تاريخ الإضافة يضعه الخادم، فلا يُحتسب درس أُضيف اليوم بتاريخ نشر قديم
     and s.starts_at <= now() - interval '3 days' and s.created_at <= now() - interval '3 days'
     and s.ends_at - s.starts_at >= interval '5 minutes'
     and s.video_url ~ '(youtu\.be/|[?&]v=|/(live|shorts|embed)/)[A-Za-z0-9_-]{11}';
  select max(l) into lvl from unnest(array[5, 10, 25, 50, 100]) l where l <= n;
  if lvl is null then
    raise exception 'تحتاج 5 دروس منشورة منذ 3 أيام على الأقل (لديك %)', coalesce(n, 0) using errcode = '22023';
  end if;
  insert into public.certificates (code, teacher_id, display_name, channel, lessons, level, subjects)
  values (private.new_code(), auth.uid(), me.display_name, me.youtube_channel, n, lvl, subj)
  on conflict (teacher_id, level) do nothing;
  return query select c.code, c.level, c.lessons, c.issued_at, c.revoked
                 from public.certificates c where c.teacher_id = auth.uid() order by c.level desc;
end $$;

drop function if exists public.my_certificates();
create or replace function public.my_certificates()
returns table (code text, level int, lessons int, issued_at timestamptz, revoked boolean)
language sql stable security definer set search_path = public as $$
  select c.code, c.level, c.lessons, c.issued_at, c.revoked
    from public.certificates c where c.teacher_id = auth.uid() order by c.level desc;
$$;

-- صفحة التحقق العامة: أي شخص يفتح رابط الشهادة يرى إن كانت صحيحة
drop function if exists public.verify_certificate(text);
create or replace function public.verify_certificate(p_code text)
returns table (code text, display_name text, level int, lessons int, subjects text[], issued_at timestamptz,
               valid boolean, teacher_id uuid, channel text)
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
begin
  if c !~ '^[A-HJ-NP-Z2-9]{10}$' then return; end if;
  if not private.hit(private.client_hash('cert'), 'cert', 60, 'hour') then
    raise exception 'محاولات كثيرة، حاول بعد ساعة' using errcode = '54000';
  end if;
  return query
    select x.code, x.display_name, x.level, x.lessons, x.subjects, x.issued_at,
           (not x.revoked and coalesce(t.status, 'suspended') <> 'suspended'), x.teacher_id, x.channel
      from public.certificates x left join public.teachers t on t.id = x.teacher_id
     where x.code = c;
end $$;

-- ---------------------------------------------------------------------
-- 9.5) البحث في دروس الصف (يحترم سياسات القراءة لأنه بصلاحية المستدعي)
-- ---------------------------------------------------------------------
drop index if exists public.sessions_search_trgm;

create or replace function public.search_lessons(p_grade text, p_q text, p_subject text default '')
returns setof public.sessions
language sql stable security invoker set search_path = public as $$
  select s.* from public.sessions s
   where s.grade = p_grade and (coalesce(p_subject, '') = '' or s.subject = p_subject)
     and s.status = 'scheduled' and s.starts_at <= now()
     and (s.video_url is not null or s.recording_url is not null)
     and char_length(btrim(coalesce(p_q, ''))) between 2 and 60
     -- كل كلمة من البحث يجب أن تظهر في العنوان أو اسم الوحدة (بأي ترتيب)
     and not exists (
       select 1 from unnest(string_to_array(public.ar_norm(p_q), ' ')) w
        where w <> '' and position(w in public.ar_norm(s.title || ' ' || coalesce(s.unit_title, ''))) = 0)
   order by s.starts_at desc
   limit 40;
$$;

-- ---------------------------------------------------------------------
-- 9.6) أدوات المشرف
-- ---------------------------------------------------------------------
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'هذه الصفحة للمشرفين فقط' using errcode = '42501';
  end if;
  return json_build_object(
    'teachers_approved', (select count(*) from public.teachers where status = 'approved'),
    'teachers_pending',  (select count(*) from public.teachers where status = 'pending'),
    'lessons',           (select count(*) from public.sessions where status = 'scheduled' and not hidden and starts_at <= now()),
    'lessons_week',      (select count(*) from public.sessions where status = 'scheduled' and starts_at > now() - interval '7 days' and starts_at <= now()),
    'views',             (select coalesce(sum(views), 0) from public.lesson_stats),
    'views_week',        (select coalesce(sum(views), 0) from public.lesson_stats where day > (now() at time zone 'Asia/Muscat')::date - 7),
    'thanks',            (select coalesce(sum(thanks + understood), 0) from public.lesson_stats),
    'requests_open',     (select count(*) from public.lesson_requests where status = 'open'),
    'requests_done',     (select count(*) from public.lesson_requests where status = 'done'),
    'certificates',      (select count(*) from public.certificates where not revoked),
    'reports_week',      (select count(*) from public.reports where created_at > now() - interval '7 days')
  );
end $$;

drop function if exists public.admin_list_requests();
create or replace function public.admin_list_requests()
returns table (id uuid, grade text, subject text, term smallint, unit smallint, topic text, votes int,
               status text, flags smallint, session_id uuid, created_at timestamptz, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'هذه الصفحة للمشرفين فقط' using errcode = '42501';
  end if;
  return query
    select q.id, q.grade, q.subject, q.term, q.unit, q.topic, q.votes, q.status, q.flags, q.session_id, q.created_at, q.last_at
      from public.lesson_requests q
     order by (q.status = 'open') desc, q.votes desc, q.last_at desc
     limit 300;
end $$;

create or replace function public.admin_set_request(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;
  if p_status = 'delete' then
    delete from public.lesson_requests where id = p_id;
  elsif p_status in ('open', 'hidden', 'done') then
    update public.lesson_requests set status = p_status, flags = case when p_status = 'open' then 0 else flags end where id = p_id;
  else
    raise exception 'حالة غير معروفة' using errcode = '22023';
  end if;
end $$;

drop function if exists public.admin_list_certificates();
create or replace function public.admin_list_certificates()
returns table (code text, teacher_id uuid, display_name text, lessons int, level int, issued_at timestamptz, revoked boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'هذه الصفحة للمشرفين فقط' using errcode = '42501';
  end if;
  return query
    select c.code, c.teacher_id, c.display_name, c.lessons, c.level, c.issued_at, c.revoked
      from public.certificates c order by c.issued_at desc limit 300;
end $$;

create or replace function public.admin_set_certificate(p_code text, p_revoked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;
  update public.certificates set revoked = coalesce(p_revoked, true) where code = p_code;
end $$;

-- ---------------------------------------------------------------------
-- 9.7) صلاحيات الدوال الجديدة
-- ---------------------------------------------------------------------
revoke execute on function public.request_lesson(text, text, int, int, text)  from public;
revoke execute on function public.count_view(uuid)                             from public;
revoke execute on function public.thank_lesson(uuid, text)                     from public;
revoke execute on function public.verify_certificate(text)                     from public;
revoke execute on function public.search_lessons(text, text, text)             from public;
grant  execute on function public.request_lesson(text, text, int, int, text)  to anon, authenticated;
grant  execute on function public.count_view(uuid)                             to anon, authenticated;
grant  execute on function public.thank_lesson(uuid, text)                     to anon, authenticated;
grant  execute on function public.verify_certificate(text)                     to anon, authenticated;
grant  execute on function public.search_lessons(text, text, text)             to anon, authenticated;
grant  execute on function public.ar_norm(text)                                to anon, authenticated;

revoke execute on function public.teacher_requests(text[])          from public, anon;
revoke execute on function public.flag_request(uuid)                from public, anon;
revoke execute on function public.my_lesson_stats()                 from public, anon;
revoke execute on function public.claim_certificate()               from public, anon;
revoke execute on function public.my_certificates()                 from public, anon;
revoke execute on function public.admin_overview()                  from public, anon;
revoke execute on function public.admin_list_requests()             from public, anon;
revoke execute on function public.admin_set_request(uuid, text)     from public, anon;
revoke execute on function public.admin_list_certificates()         from public, anon;
revoke execute on function public.admin_set_certificate(text, boolean) from public, anon;
grant  execute on function public.teacher_requests(text[])          to authenticated;
grant  execute on function public.flag_request(uuid)                to authenticated;
grant  execute on function public.my_lesson_stats()                 to authenticated;
grant  execute on function public.claim_certificate()               to authenticated;
grant  execute on function public.my_certificates()                 to authenticated;
grant  execute on function public.admin_overview()                  to authenticated;
grant  execute on function public.admin_list_requests()             to authenticated;
grant  execute on function public.admin_set_request(uuid, text)     to authenticated;
grant  execute on function public.admin_list_certificates()         to authenticated;
grant  execute on function public.admin_set_certificate(text, boolean) to authenticated;
revoke execute on function public.sessions_fulfil_request() from public, anon, authenticated;
revoke execute on function public.sessions_unfulfil_request() from public, anon, authenticated;

-- =====================================================================
--  بعد أول دخول لك كمعلم من الموقع، اجعل نفسك مشرفاً بتشغيل هذا السطر
--  (ضع بريدك بدل المثال):
--
--  update public.teachers set is_admin = true, status = 'approved'
--   where id = (select id from auth.users where email = 'you@gmail.com');
-- =====================================================================
