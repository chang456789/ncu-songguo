-- 暱稱不重複的資料庫規則測試（在本機 PostgreSQL 16 跑，不需要 Supabase）
-- 用法：
--   createdb sg
--   psql -d sg -f tests/sql/supabase-stub.sql
--   psql -d sg -v ON_ERROR_STOP=1 -f supabase/schema.sql
--   psql -d sg -f tests/sql/nickname-rls.sql      # 每一段的 \echo 寫著應該看到的結果
\set ON_ERROR_STOP 0
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
set role authenticated;
-- A 登記「小明」
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.docs (path, collection, doc_id, data) values ('nicknames/小明', 'nicknames', '小明', jsonb_build_object('key','小明','uid',:'A','ts',1));
\echo '--- 1. A 登記 小明：上面應該 INSERT 0 1'
-- A 重新 upsert 自己的（像 shim 的 set）
insert into public.docs (path, collection, doc_id, data) values ('nicknames/小明', 'nicknames', '小明', jsonb_build_object('key','小明','uid',:'A','ts',2)) on conflict (path) do update set data = excluded.data;
\echo '--- 2. A 重新登記自己的名字：應該成功'
-- B 搶「小明」（upsert）
select set_config('request.jwt.claim.sub', :'B', false);
\echo '--- 3. B 搶 小明（upsert）：應該 ERROR row-level security'
insert into public.docs (path, collection, doc_id, data) values ('nicknames/小明', 'nicknames', '小明', jsonb_build_object('key','小明','uid',:'B','ts',3)) on conflict (path) do update set data = excluded.data;
\echo '--- 4. B 搶 小明（直接改）：應該 UPDATE 0'
update public.docs set data = jsonb_build_object('key','小明','uid',:'B') where path = 'nicknames/小明';
\echo '--- 5. B 看得到 A 的暱稱登記嗎：應該 0'
select count(*) from public.docs where collection = 'nicknames';
\echo '--- 6. B 冒用 A 的 uid 登記：應該 ERROR'
insert into public.docs (path, collection, doc_id, data) values ('nicknames/阿華', 'nicknames', '阿華', jsonb_build_object('key','阿華','uid',:'A'));
\echo '--- 7. key 和文件 ID 不一致：應該 ERROR'
insert into public.docs (path, collection, doc_id, data) values ('nicknames/阿華', 'nicknames', '阿華', jsonb_build_object('key','別的','uid',:'B'));
\echo '--- 8. key 有大寫或空白：應該 ERROR ×2'
insert into public.docs (path, collection, doc_id, data) values ('nicknames/Abc', 'nicknames', 'Abc', jsonb_build_object('key','Abc','uid',:'B'));
insert into public.docs (path, collection, doc_id, data) values ('nicknames/a b', 'nicknames', 'a b', jsonb_build_object('key','a b','uid',:'B'));
\echo '--- 9. B 登記 阿華：應該成功；B 只看得到自己的 1 筆'
insert into public.docs (path, collection, doc_id, data) values ('nicknames/阿華', 'nicknames', '阿華', jsonb_build_object('key','阿華','uid',:'B'));
select count(*) from public.docs where collection = 'nicknames';
\echo '--- 10. B 刪不掉 A 的：應該 DELETE 0'
delete from public.docs where path = 'nicknames/小明';
\echo '--- 11. 每小時上限 10：B 再登記 10 個，第 10 個（總共第 11 個）應該 ERROR rate_limited'
do $$ begin for i in 1..10 loop
  begin insert into public.docs (path, collection, doc_id, data) values ('nicknames/b' || i, 'nicknames', 'b' || i, jsonb_build_object('key','b' || i,'uid',auth.uid()::text));
  exception when others then raise notice '第 % 個：%', i + 1, sqlerrm; end; end loop; end $$;
\echo '--- 12. 名字紀錄 data/users/B/names：A 讀不到'
insert into public.docs (path, collection, doc_id, data) values ('data/users/' || :'B' || '/names', 'data/users/' || :'B', 'names', '{"list":[{"nick":"阿華"}]}');
select set_config('request.jwt.claim.sub', :'A', false);
select count(*) as a_sees_b_names from public.docs where path like 'data/users/' || :'B' || '%';
\echo '--- 13. 舊功能不受影響：A 發貼文、B 讀得到'
insert into public.docs (path, collection, doc_id, data) values ('posts/p1', 'posts', 'p1', jsonb_build_object('title','hi','uid',:'A'));
select set_config('request.jwt.claim.sub', :'B', false);
select count(*) as b_sees_posts from public.docs where collection = 'posts';
\echo '--- 14. 我的紀錄（owner＝自己）：A 查自己的 posts'
select set_config('request.jwt.claim.sub', :'A', false);
select collection, doc_id from public.docs where owner = auth.uid() order by collection;
