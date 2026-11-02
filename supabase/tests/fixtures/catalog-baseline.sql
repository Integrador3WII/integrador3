-- Isolated test fixture: only the pre-existing catalog/inventory contracts.
-- NOT a replacement for the complete remote baseline or its order workflows.
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, private, public to anon, authenticated;
create type public.product_status as enum ('draft','active','inactive','archived');
create type public.inventory_movement_type as enum ('sale','purchase','adjustment','return','release');
create table public.profiles (id uuid primary key, role text not null, is_active boolean not null default true);
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 2 and 80),
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), description text, is_active boolean not null default true
);
create table public.products (
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories,
 name text not null check (length(btrim(name)) between 2 and 160), slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 description text, status public.product_status not null default 'draft', allows_customization boolean not null default true
);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products,
 sku text not null unique check (sku ~ '^[A-Za-z0-9._-]{3,50}$'),
 color_name text not null check (length(btrim(color_name)) between 2 and 50),
 size_code text not null check (size_code in ('XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','UNICA')),
 base_price numeric not null check (base_price >= 0), status public.product_status not null default 'active'
);
create table public.inventory (
 product_variant_id uuid primary key references public.product_variants,
 quantity_available integer not null default 0 check (quantity_available >= 0), minimum_stock integer not null default 0,
 updated_at timestamptz not null default now()
);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), product_variant_id uuid not null references public.product_variants,
 movement_type public.inventory_movement_type not null, quantity_delta integer not null check (quantity_delta <> 0),
 reason text, order_id uuid, created_by uuid references public.profiles, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles,
 table_name text, record_id uuid not null, action text, old_data jsonb, new_data jsonb
);
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role='admin');
$$;
create function private.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','operator'));
$$;
create function private.create_inventory_for_variant() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.inventory(product_variant_id) values (new.id) on conflict do nothing; return new;
end;
$$;
-- Mirrors the original bug, to prove the migration fixes its real key mismatch.
create function private.audit_row_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_logs(record_id, table_name) values (new.id, tg_table_name); return new;
end;
$$;
create trigger variants_create_inventory after insert on public.product_variants for each row execute function private.create_inventory_for_variant();
create trigger inventory_audit after insert or update or delete on public.inventory for each row execute function private.audit_row_change();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
create policy categories_admin_all on public.categories to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy categories_public_select on public.categories for select to anon, authenticated using (is_active);
create policy products_admin_all on public.products to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy products_public_select on public.products for select to anon, authenticated using (status='active');
create policy variants_admin_all on public.product_variants to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy variants_public_select on public.product_variants for select to anon, authenticated using (status='active' and exists(select 1 from public.products p where p.id=product_id and p.status='active'));
create policy inventory_staff_select on public.inventory for select to authenticated using ((select private.is_staff()));
create policy inventory_admin_update on public.inventory for update to authenticated using ((select private.is_admin()));
create policy movements_staff_select on public.inventory_movements for select to authenticated using ((select private.is_staff()));
create policy movements_admin_insert on public.inventory_movements for insert to authenticated with check ((select private.is_admin()));
grant select on public.categories, public.products, public.product_variants to anon;
grant select,insert,update,delete on public.categories, public.products, public.product_variants to authenticated;
grant select,update on public.inventory to authenticated;
grant select on public.inventory_movements to authenticated;
