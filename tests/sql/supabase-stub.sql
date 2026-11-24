-- 本機測試用：模擬 Supabase 的 auth、storage、角色，讓 supabase/schema.sql 能在一般 PostgreSQL 執行。
-- 用法見 tests/sql/nickname-rls.sql 開頭。不要在 Supabase 執行這個檔案。
-- 模擬 Supabase 的 auth、storage、角色（只為了在本機測 schema.sql）
create role authenticated nologin; create role anon nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
create table storage.objects (id serial, bucket_id text, name text, owner uuid, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
