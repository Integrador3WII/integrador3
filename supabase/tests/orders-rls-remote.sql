-- Integration verification against the existing Supabase schema.
-- All fixture users, profiles and orders are rolled back. No email is sent.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); ob uuid:=gen_random_uuid(); admin_id uuid; operator_id uuid; n integer;
begin
 select id into admin_id from public.profiles where role='admin' and is_active limit 1;
 select id into operator_id from public.profiles where role='operator' and is_active limit 1;
 if admin_id is null or operator_id is null then raise exception 'Requires existing active admin and operator'; end if;
 insert into auth.users(id,raw_user_meta_data) values(a,'{"full_name":"QA customer A"}'),(b,'{"full_name":"QA customer B"}');
 insert into public.profiles(id,role,is_active) values(a,'customer',true),(b,'customer',true) on conflict(id) do nothing;
 insert into public.orders(id,order_number,customer_id) values(oa,'QA-'||oa::text,a),(ob,'QA-'||ob::text,b);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.orders where id in (oa,ob); if n<>2 then raise exception 'Admin visibility failed'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 select count(*) into n from public.orders where id=oa; if n<>1 then raise exception 'Customer A cannot read own order'; end if;
 select count(*) into n from public.orders where id=ob; if n<>0 then raise exception 'Customer A sees B'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 select count(*) into n from public.orders where id=ob; if n<>1 then raise exception 'Customer B cannot read own order'; end if;
 select count(*) into n from public.orders where id=oa; if n<>0 then raise exception 'Customer B sees A'; end if;
 perform set_config('request.jwt.claim.sub',operator_id::text,true);
 select count(*) into n from public.orders where id in (oa,ob); if n<>2 then raise exception 'Operator staff read failed'; end if;
 begin update public.orders set status='delivered' where id=oa; raise exception 'Direct operator write was allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 select count(*) into n from public.orders where id in (oa,ob); if n<>0 then raise exception 'Unknown identity sees orders'; end if;
 execute 'reset role'; execute 'set local role anon';
 begin
  select count(*) into n from public.orders where id in (oa,ob); if n<>0 then raise exception 'Anon sees orders'; end if;
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
end $$;
select 'PASS: admin, customers A/B isolation, staff operator read, direct-write rejection, unknown identity and anonymous denial' as rls_result;
rollback;
