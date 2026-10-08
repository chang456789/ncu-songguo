-- =====================================================================
-- 松果 中大生活通 — Supabase 資料庫結構
-- 在 Supabase 後台「SQL Editor」貼上整份執行一次即可（可重複執行）。
--
-- 設計：所有資料存在一張文件表 docs（路徑 + JSON），前端用 Firestore 風格的
-- collection/doc API 讀寫。權限全部由下方的 Row Level Security 規則把關。
-- =====================================================================

create table if not exists public.docs (
  path        text primary key,                 -- 例：posts/abc123
  collection  text not null,                    -- 例：posts
  doc_id      text not null,                    -- 例：abc123
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint docs_path_shape check (path = collection || '/' || doc_id),
  constraint docs_size check (pg_column_size(data) < 32768)
);
create index if not exists docs_collection_idx on public.docs (collection);
create index if not exists docs_collection_ts_idx on public.docs (collection, ((data->'ts')));
create index if not exists docs_owner_created_idx on public.docs (owner, created_at);

-- 管理員名單：把你自己的使用者 ID 加進來（說明見 README）
create table if not exists public.admins (uid uuid primary key references auth.users(id) on delete cascade);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where uid = auth.uid());
$$;

-- updated_at 自動更新
create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now(); new.owner = old.owner; new.path = old.path;
  -- 共同編輯的地圖（美食、校內地點）：保留原建立者的資料，避免被改掉
  if new.collection in ('food', 'spots') then
    new.data = new.data || jsonb_build_object('uid', old.data->'uid', 'nick', old.data->'nick', 'ts', old.data->'ts');
  end if;
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs for each row execute function public.docs_touch();

-- 防洗版：每人每小時的新增上限
create or replace function public.docs_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int; pat text;
begin
  if public.is_admin() then return new; end if;
  if    new.collection = 'posts'           then lim := 10;  pat := 'posts';
  elsif new.collection like '%/comments'   then lim := 60;  pat := '%/comments';
  elsif new.collection = 'rides'           then lim := 6;   pat := 'rides';
  elsif new.collection = 'food'            then lim := 15;  pat := 'food';
  elsif new.collection = 'spots'           then lim := 30;  pat := 'spots';
  elsif new.collection = 'lobby'           then lim := 120; pat := 'lobby';
  elsif new.collection = 'events'          then lim := 10;  pat := 'events';
  elsif new.collection = 'going'           then lim := 200; pat := 'going';
  elsif new.collection = 'locations'       then lim := 3;   pat := 'locations';
  elsif new.collection = 'dmreq'           then lim := 20;  pat := 'dmreq';
  elsif new.collection like 'dms/%'        then lim := 300; pat := 'dms/%';
  else return new; end if;
  select count(*) into n from public.docs
   where owner = auth.uid() and collection like pat and created_at > now() - interval '1 hour';
  if n >= lim then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'too many writes';
  end if;
  return new;
end $$;
drop trigger if exists docs_rate_limit on public.docs;
create trigger docs_rate_limit before insert on public.docs for each row execute function public.docs_rate_limit();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.docs   enable row level security;
alter table public.admins enable row level security;

-- 誰可以讀：已登入（含匿名登入）的人可讀所有公開資料；
-- data/users/<uid>/... 是個人私密資料（設定、私訊金鑰），只有本人讀得到。
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (
  path not like 'data/users/%'
  or path like 'data/users/' || auth.uid()::text || '/%'
);

-- 寫入時一律要是自己的資料；帶有 uid / from 欄位的必須是自己的 ID（不能冒名）。
create or replace function public.docs_write_ok(p_collection text, p_path text, p_data jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- 個人私密區只能寫自己的
    (p_path not like 'data/users/%' or p_path like 'data/users/' || auth.uid()::text || '/%')
    -- 設定檔只有管理員能寫
    and (p_collection <> 'config' or public.is_admin())
    -- 公開金鑰只能寫自己的
    and (p_collection <> 'keys' or p_path = 'keys/' || auth.uid()::text)
    -- 私訊內容只能寫進自己參與的對話
    and (p_collection not like 'dms/%' or position(auth.uid()::text in p_collection) > 0)
    -- 不能冒用別人的 uid / from
    and (not (p_data ? 'uid')  or p_data->>'uid'  = '' or p_data->>'uid'  = auth.uid()::text)
    and (
      not (p_data ? 'from')
      or (p_collection <> 'dmreq' and p_collection not like 'dms/%')
      or p_data->>'from' = auth.uid()::text
    );
$$;

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated with check (
  owner = auth.uid() and public.docs_write_ok(collection, path, data)
);

-- 修改：本人、管理員、私訊請求的收件人（回覆同意／拒絕），
-- 以及任何人都能編輯共同地圖（美食地圖 food、校內地點 spots）
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (owner = auth.uid() or public.is_admin()
         or (collection = 'dmreq' and data->>'to' = auth.uid()::text)
         or collection in ('food', 'spots'))
  with check (
    (owner = auth.uid() and public.docs_write_ok(collection, path, data))
    or public.is_admin()
    or (collection = 'dmreq' and data->>'to' = auth.uid()::text)
    or collection in ('food', 'spots')
  );

-- 刪除：本人或管理員
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated
  using (owner = auth.uid() or public.is_admin());

-- 管理員名單：每個人只能查到自己是不是管理員
drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (uid = auth.uid());

grant select, insert, update, delete on public.docs to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 即時更新（Realtime）
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
exception when undefined_object then null;
end $$;
