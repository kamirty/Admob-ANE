-- =====================================================================
--  منصة عطاء — مخطط قاعدة البيانات (Supabase / PostgreSQL)
--  انسخ هذا الملف كاملاً والصقه في: Supabase → SQL Editor → New query → Run
--  يمكن تشغيله أكثر من مرة بأمان.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

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

create index if not exists sessions_grade_start_idx   on public.sessions (grade, starts_at);
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
grant update (auto_approve, site_notice) on public.settings to authenticated;
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
--  بعد أول دخول لك كمعلم من الموقع، اجعل نفسك مشرفاً بتشغيل هذا السطر
--  (ضع بريدك بدل المثال):
--
--  update public.teachers set is_admin = true, status = 'approved'
--   where id = (select id from auth.users where email = 'you@gmail.com');
-- =====================================================================
