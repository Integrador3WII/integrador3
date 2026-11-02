-- Schema-only contract captured from Supabase on 2026-11-01; no production data.
-- Auth is stubbed for isolated PostgreSQL tests. RLS policies are tested remotely separately.
create role anon; create role authenticated;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
set check_function_bodies=off;
create type public.app_role as enum ('customer','operator','admin');
create type public.delivery_method as enum ('pickup','delivery');
create type public.design_file_type as enum ('source','preview','thumbnail','other');
create type public.design_status as enum ('draft','submitted','approved','revision_requested','rejected');
create type public.inventory_movement_type as enum ('sale','purchase','adjustment','return','release');
create type public.notification_type as enum ('quote','order','production','quality','inventory','system');
create type public.order_status as enum ('confirmed','in_production','quality_check','ready','delivered','cancelled');
create type public.order_type as enum ('retail','bulk');
create type public.pricing_mode as enum ('flat','per_item','per_unit');
create type public.product_status as enum ('draft','active','inactive','archived');
create type public.production_task_status as enum ('pending','assigned','in_progress','blocked','completed');
create type public.quality_result as enum ('pending','approved','rejected','rework');
create type public.quote_status as enum ('draft','submitted','under_review','sent','approved','rejected','expired','cancelled');
create sequence public.order_number_seq;
create sequence public.audit_logs_id_seq;
create sequence public.quote_number_seq;
create table public.audit_logs (id bigint not null,actor_id uuid,table_name text not null,record_id uuid,action text not null,old_data jsonb,new_data jsonb,created_at timestamp with time zone default now() not null);
create table public.cart_items (id uuid default gen_random_uuid() not null,cart_id uuid not null,product_variant_id uuid not null,design_id uuid,quantity integer not null,notes text,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.carts (id uuid default gen_random_uuid() not null,customer_id uuid not null,status text default 'open'::text not null,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.categories (id uuid default gen_random_uuid() not null,parent_id uuid,name text not null,slug text not null,description text,is_active boolean default true not null,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.customer_addresses (id uuid default gen_random_uuid() not null,customer_id uuid not null,label text not null,recipient_name text not null,phone text not null,address_line text not null,neighborhood text,city text not null,department text,reference text,is_default boolean default false not null,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.customization_services (id uuid default gen_random_uuid() not null,code text not null,name text not null,description text,pricing_mode pricing_mode not null,unit_price numeric(12,2) default 0 not null,is_active boolean default true not null,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.design_files (id uuid default gen_random_uuid() not null,design_id uuid not null,file_type design_file_type not null,storage_path text not null,mime_type text not null,file_size_bytes bigint,created_at timestamp with time zone default now() not null);
create table public.designs (id uuid default gen_random_uuid() not null,customer_id uuid not null,name text not null,status design_status default 'draft'::design_status not null,design_data jsonb default '{}'::jsonb not null,preview_path text,rejection_reason text,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null,approved_at timestamp with time zone);
create table public.favorites (customer_id uuid not null,product_id uuid not null,created_at timestamp with time zone default now() not null);
create table public.inventory (product_variant_id uuid not null,quantity_available integer default 0 not null,minimum_stock integer default 0 not null,updated_at timestamp with time zone default now() not null);
create table public.inventory_movements (id uuid default gen_random_uuid() not null,product_variant_id uuid not null,movement_type inventory_movement_type not null,quantity_delta integer not null,reason text,order_id uuid,created_by uuid,created_at timestamp with time zone default now() not null);
create table public.notifications (id uuid default gen_random_uuid() not null,recipient_id uuid not null,type notification_type not null,title text not null,message text not null,order_id uuid,quote_id uuid,read_at timestamp with time zone,created_at timestamp with time zone default now() not null);
create table public.order_item_services (id uuid default gen_random_uuid() not null,order_item_id uuid not null,service_id uuid,service_name_snapshot text not null,pricing_mode_snapshot pricing_mode not null,units numeric(10,2) not null,unit_price numeric(12,2) not null,amount numeric(12,2) not null,created_at timestamp with time zone default now() not null);
create table public.order_items (id uuid default gen_random_uuid() not null,order_id uuid not null,product_variant_id uuid not null,design_id uuid,product_name_snapshot text not null,sku_snapshot text not null,color_snapshot text not null,size_snapshot text not null,design_data_snapshot jsonb,preview_path_snapshot text,quantity integer not null,unit_price numeric(12,2) not null,customization_total numeric(12,2) default 0 not null,line_subtotal numeric(12,2) generated always as ((((quantity)::numeric * unit_price) + customization_total)) stored,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.order_status_history (id uuid default gen_random_uuid() not null,order_id uuid not null,from_status order_status,to_status order_status not null,changed_by uuid,note text,created_at timestamp with time zone default now() not null);
create table public.orders (id uuid default gen_random_uuid() not null,order_number text default ('ORD-'::text || lpad((nextval('order_number_seq'::regclass))::text, 6, '0'::text)) not null,quote_id uuid,customer_id uuid not null,status order_status default 'confirmed'::order_status not null,delivery_method delivery_method default 'pickup'::delivery_method not null,shipping_recipient_name text,shipping_phone text,shipping_address text,shipping_neighborhood text,shipping_city text,shipping_department text,shipping_reference text,subtotal numeric(12,2) default 0 not null,discount_amount numeric(12,2) default 0 not null,shipping_amount numeric(12,2) default 0 not null,total numeric(12,2) default 0 not null,customer_notes text,admin_notes text,confirmed_at timestamp with time zone default now() not null,started_at timestamp with time zone,ready_at timestamp with time zone,delivered_at timestamp with time zone,cancelled_at timestamp with time zone,inventory_released_at timestamp with time zone,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.product_images (id uuid default gen_random_uuid() not null,product_id uuid not null,variant_id uuid,storage_path text not null,alt_text text,sort_order integer default 0 not null,is_primary boolean default false not null,created_at timestamp with time zone default now() not null);
create table public.product_variants (id uuid default gen_random_uuid() not null,product_id uuid not null,sku text not null,color_name text not null,size_code text not null,base_price numeric(12,2) not null,status product_status default 'active'::product_status not null,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.production_tasks (id uuid default gen_random_uuid() not null,order_id uuid not null,order_item_id uuid not null,assigned_to uuid,status production_task_status default 'pending'::production_task_status not null,priority integer default 3 not null,notes text,started_at timestamp with time zone,completed_at timestamp with time zone,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.products (id uuid default gen_random_uuid() not null,category_id uuid not null,name text not null,slug text not null,description text,status product_status default 'draft'::product_status not null,allows_customization boolean default true not null,min_order_quantity integer default 1 not null,max_order_quantity integer,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null,image_path text);
create table public.profiles (id uuid not null,full_name text,phone text,role app_role default 'customer'::app_role not null,is_active boolean default true not null,avatar_path text,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.quality_checks (id uuid default gen_random_uuid() not null,order_id uuid not null,performed_by uuid,result quality_result default 'pending'::quality_result not null,checklist jsonb default '{}'::jsonb not null,notes text,checked_at timestamp with time zone default now() not null,created_at timestamp with time zone default now() not null);
create table public.quote_item_services (id uuid default gen_random_uuid() not null,quote_item_id uuid not null,service_id uuid not null,units numeric(10,2) default 1 not null,pricing_mode_snapshot pricing_mode,unit_price_snapshot numeric(12,2),unit_price_override numeric(12,2),created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.quote_items (id uuid default gen_random_uuid() not null,quote_id uuid not null,product_variant_id uuid not null,design_id uuid,quantity integer not null,unit_price_snapshot numeric(12,2),unit_price_override numeric(12,2),line_notes text,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
create table public.quote_status_history (id uuid default gen_random_uuid() not null,quote_id uuid not null,from_status quote_status,to_status quote_status not null,changed_by uuid,note text,created_at timestamp with time zone default now() not null);
create table public.quotes (id uuid default gen_random_uuid() not null,quote_number text default ('COT-'::text || lpad((nextval('quote_number_seq'::regclass))::text, 6, '0'::text)) not null,customer_id uuid not null,order_type order_type default 'retail'::order_type not null,status quote_status default 'draft'::quote_status not null,delivery_method delivery_method default 'pickup'::delivery_method not null,delivery_address_id uuid,valid_until date,discount_amount numeric(12,2) default 0 not null,shipping_amount numeric(12,2) default 0 not null,customer_notes text,admin_notes text,submitted_at timestamp with time zone,sent_at timestamp with time zone,responded_at timestamp with time zone,created_at timestamp with time zone default now() not null,updated_at timestamp with time zone default now() not null);
alter table order_item_services add constraint order_item_services_pkey PRIMARY KEY (id);
alter table profiles add constraint profiles_phone_ck CHECK (((phone IS NULL) OR ((char_length(TRIM(BOTH FROM phone)) >= 7) AND (char_length(TRIM(BOTH FROM phone)) <= 30))));
alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table quotes add constraint quotes_valid_until_ck CHECK (((valid_until IS NULL) OR (valid_until >= (created_at)::date)));
alter table quotes add constraint quotes_pkey PRIMARY KEY (id);
alter table quotes add constraint quotes_quote_number_key UNIQUE (quote_number);
alter table quote_items add constraint quote_items_quantity_ck CHECK (((quantity >= 1) AND (quantity <= 10000)));
alter table quote_items add constraint quote_items_snapshot_ck CHECK (((unit_price_snapshot IS NULL) OR (unit_price_snapshot >= (0)::numeric)));
alter table quote_items add constraint quote_items_override_ck CHECK (((unit_price_override IS NULL) OR (unit_price_override >= (0)::numeric)));
alter table quote_items add constraint quote_items_pkey PRIMARY KEY (id);
alter table quote_item_services add constraint quote_item_services_units_ck CHECK ((units > (0)::numeric));
alter table quote_item_services add constraint quote_item_services_snapshot_ck CHECK (((unit_price_snapshot IS NULL) OR (unit_price_snapshot >= (0)::numeric)));
alter table quote_item_services add constraint quote_item_services_override_ck CHECK (((unit_price_override IS NULL) OR (unit_price_override >= (0)::numeric)));
alter table quote_item_services add constraint quote_item_services_pkey PRIMARY KEY (id);
alter table quote_item_services add constraint quote_item_services_unique_ck UNIQUE (quote_item_id, service_id);
alter table quote_status_history add constraint quote_status_history_pkey PRIMARY KEY (id);
alter table orders add constraint orders_subtotal_ck CHECK ((subtotal >= (0)::numeric));
alter table orders add constraint orders_discount_ck CHECK ((discount_amount >= (0)::numeric));
alter table orders add constraint orders_shipping_ck CHECK ((shipping_amount >= (0)::numeric));
alter table orders add constraint orders_total_ck CHECK ((total >= (0)::numeric));
alter table orders add constraint orders_delivery_data_ck CHECK (((delivery_method = 'pickup'::delivery_method) OR ((shipping_recipient_name IS NOT NULL) AND (shipping_phone IS NOT NULL) AND (shipping_address IS NOT NULL) AND (shipping_city IS NOT NULL))));
alter table orders add constraint orders_pkey PRIMARY KEY (id);
alter table orders add constraint orders_order_number_key UNIQUE (order_number);
alter table orders add constraint orders_quote_id_key UNIQUE (quote_id);
alter table order_items add constraint order_items_quantity_ck CHECK (((quantity >= 1) AND (quantity <= 10000)));
alter table order_items add constraint order_items_unit_price_ck CHECK ((unit_price >= (0)::numeric));
alter table order_items add constraint order_items_customization_ck CHECK ((customization_total >= (0)::numeric));
alter table order_items add constraint order_items_design_snapshot_ck CHECK (((design_data_snapshot IS NULL) OR (jsonb_typeof(design_data_snapshot) = 'object'::text)));
alter table order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table order_item_services add constraint order_item_services_units_ck CHECK ((units > (0)::numeric));
alter table order_item_services add constraint order_item_services_price_ck CHECK (((unit_price >= (0)::numeric) AND (amount >= (0)::numeric)));
alter table profiles add constraint profiles_full_name_ck CHECK (((full_name IS NULL) OR ((char_length(TRIM(BOTH FROM full_name)) >= 2) AND (char_length(TRIM(BOTH FROM full_name)) <= 120))));
alter table order_status_history add constraint order_status_history_pkey PRIMARY KEY (id);
alter table production_tasks add constraint production_tasks_priority_ck CHECK (((priority >= 1) AND (priority <= 5)));
alter table production_tasks add constraint production_tasks_dates_ck CHECK (((completed_at IS NULL) OR (started_at IS NOT NULL)));
alter table production_tasks add constraint production_tasks_pkey PRIMARY KEY (id);
alter table quality_checks add constraint quality_checks_checklist_ck CHECK ((jsonb_typeof(checklist) = 'object'::text));
alter table quality_checks add constraint quality_checks_pkey PRIMARY KEY (id);
alter table inventory add constraint inventory_quantity_ck CHECK ((quantity_available >= 0));
alter table inventory add constraint inventory_minimum_ck CHECK ((minimum_stock >= 0));
alter table inventory add constraint inventory_pkey PRIMARY KEY (product_variant_id);
alter table inventory_movements add constraint inventory_movements_delta_ck CHECK ((quantity_delta <> 0));
alter table inventory_movements add constraint inventory_movements_pkey PRIMARY KEY (id);
alter table notifications add constraint notifications_title_ck CHECK (((char_length(TRIM(BOTH FROM title)) >= 2) AND (char_length(TRIM(BOTH FROM title)) <= 120)));
alter table notifications add constraint notifications_message_ck CHECK (((char_length(TRIM(BOTH FROM message)) >= 2) AND (char_length(TRIM(BOTH FROM message)) <= 500)));
alter table notifications add constraint notifications_reference_ck CHECK (((order_id IS NOT NULL) OR (quote_id IS NOT NULL) OR (type = 'system'::notification_type)));
alter table notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table audit_logs add constraint audit_logs_action_ck CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
alter table audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table customization_services add constraint customization_services_code_ck CHECK ((code ~ '^[A-Z0-9_-]{3,40}$'::text));
alter table categories add constraint categories_name_ck CHECK (((char_length(TRIM(BOTH FROM name)) >= 2) AND (char_length(TRIM(BOTH FROM name)) <= 80)));
alter table categories add constraint categories_slug_ck CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
alter table categories add constraint categories_pkey PRIMARY KEY (id);
alter table categories add constraint categories_slug_key UNIQUE (slug);
alter table products add constraint products_name_ck CHECK (((char_length(TRIM(BOTH FROM name)) >= 2) AND (char_length(TRIM(BOTH FROM name)) <= 160)));
alter table products add constraint products_slug_ck CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
alter table products add constraint products_min_qty_ck CHECK ((min_order_quantity >= 1));
alter table products add constraint products_max_qty_ck CHECK (((max_order_quantity IS NULL) OR (max_order_quantity >= min_order_quantity)));
alter table products add constraint products_pkey PRIMARY KEY (id);
alter table products add constraint products_slug_key UNIQUE (slug);
alter table product_variants add constraint variants_sku_ck CHECK ((sku ~ '^[A-Za-z0-9._-]{3,50}$'::text));
alter table product_variants add constraint variants_color_ck CHECK (((char_length(TRIM(BOTH FROM color_name)) >= 2) AND (char_length(TRIM(BOTH FROM color_name)) <= 50)));
alter table product_variants add constraint variants_size_ck CHECK ((size_code = ANY (ARRAY['XXXS'::text, 'XXS'::text, 'XS'::text, 'S'::text, 'M'::text, 'L'::text, 'XL'::text, 'XXL'::text, 'XXXL'::text, 'UNICA'::text])));
alter table product_variants add constraint variants_price_ck CHECK ((base_price >= (0)::numeric));
alter table product_variants add constraint product_variants_pkey PRIMARY KEY (id);
alter table product_variants add constraint product_variants_sku_key UNIQUE (sku);
alter table product_images add constraint product_images_sort_ck CHECK ((sort_order >= 0));
alter table product_images add constraint product_images_alt_ck CHECK (((alt_text IS NULL) OR (char_length(TRIM(BOTH FROM alt_text)) <= 200)));
alter table product_images add constraint product_images_pkey PRIMARY KEY (id);
alter table customer_addresses add constraint customer_addresses_label_ck CHECK (((char_length(TRIM(BOTH FROM label)) >= 2) AND (char_length(TRIM(BOTH FROM label)) <= 50)));
alter table customer_addresses add constraint customer_addresses_recipient_ck CHECK (((char_length(TRIM(BOTH FROM recipient_name)) >= 2) AND (char_length(TRIM(BOTH FROM recipient_name)) <= 120)));
alter table customer_addresses add constraint customer_addresses_phone_ck CHECK (((char_length(TRIM(BOTH FROM phone)) >= 7) AND (char_length(TRIM(BOTH FROM phone)) <= 30)));
alter table customer_addresses add constraint customer_addresses_address_ck CHECK (((char_length(TRIM(BOTH FROM address_line)) >= 5) AND (char_length(TRIM(BOTH FROM address_line)) <= 250)));
alter table customer_addresses add constraint customer_addresses_city_ck CHECK (((char_length(TRIM(BOTH FROM city)) >= 2) AND (char_length(TRIM(BOTH FROM city)) <= 80)));
alter table customer_addresses add constraint customer_addresses_pkey PRIMARY KEY (id);
alter table quotes add constraint quotes_shipping_ck CHECK ((shipping_amount >= (0)::numeric));
alter table designs add constraint designs_name_ck CHECK (((char_length(TRIM(BOTH FROM name)) >= 2) AND (char_length(TRIM(BOTH FROM name)) <= 120)));
alter table designs add constraint designs_data_object_ck CHECK ((jsonb_typeof(design_data) = 'object'::text));
alter table designs add constraint designs_rejection_ck CHECK (((rejection_reason IS NULL) OR ((char_length(TRIM(BOTH FROM rejection_reason)) >= 3) AND (char_length(TRIM(BOTH FROM rejection_reason)) <= 500))));
alter table designs add constraint designs_pkey PRIMARY KEY (id);
alter table design_files add constraint design_files_size_ck CHECK (((file_size_bytes IS NULL) OR ((file_size_bytes >= 1) AND (file_size_bytes <= 15728640))));
alter table design_files add constraint design_files_mime_ck CHECK ((mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text, 'application/json'::text, 'application/pdf'::text])));
alter table design_files add constraint design_files_pkey PRIMARY KEY (id);
alter table customization_services add constraint customization_services_name_ck CHECK (((char_length(TRIM(BOTH FROM name)) >= 2) AND (char_length(TRIM(BOTH FROM name)) <= 100)));
alter table customization_services add constraint customization_services_price_ck CHECK ((unit_price >= (0)::numeric));
alter table customization_services add constraint customization_services_pkey PRIMARY KEY (id);
alter table customization_services add constraint customization_services_code_key UNIQUE (code);
alter table carts add constraint carts_status_ck CHECK ((status = ANY (ARRAY['open'::text, 'converted'::text, 'abandoned'::text])));
alter table carts add constraint carts_pkey PRIMARY KEY (id);
alter table cart_items add constraint cart_items_quantity_ck CHECK (((quantity >= 1) AND (quantity <= 10000)));
alter table cart_items add constraint cart_items_pkey PRIMARY KEY (id);
alter table favorites add constraint favorites_pkey PRIMARY KEY (customer_id, product_id);
alter table quotes add constraint quotes_discount_ck CHECK ((discount_amount >= (0)::numeric));
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table order_status_history add constraint order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table order_status_history add constraint order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table inventory add constraint inventory_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
alter table carts add constraint carts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table notifications add constraint notifications_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;
alter table categories add constraint categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
alter table audit_logs add constraint audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table cart_items add constraint cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;
alter table cart_items add constraint cart_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
alter table cart_items add constraint cart_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE SET NULL;
alter table production_tasks add constraint production_tasks_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table favorites add constraint favorites_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
alter table favorites add constraint favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table orders add constraint orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE RESTRICT;
alter table orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table production_tasks add constraint production_tasks_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
alter table production_tasks add constraint production_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table quotes add constraint quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table product_variants add constraint product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table quotes add constraint quotes_delivery_address_id_fkey FOREIGN KEY (delivery_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;
alter table inventory_movements add constraint inventory_movements_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
alter table inventory_movements add constraint inventory_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table product_images add constraint product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table product_images add constraint product_images_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
alter table quality_checks add constraint quality_checks_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table quote_items add constraint quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;
alter table quote_items add constraint quote_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
alter table quote_items add constraint quote_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE SET NULL;
alter table order_items add constraint order_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
alter table customer_addresses add constraint customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table order_items add constraint order_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE SET NULL;
alter table quality_checks add constraint quality_checks_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table inventory_movements add constraint inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table notifications add constraint notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table quote_item_services add constraint quote_item_services_quote_item_id_fkey FOREIGN KEY (quote_item_id) REFERENCES quote_items(id) ON DELETE CASCADE;
alter table designs add constraint designs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table quote_item_services add constraint quote_item_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES customization_services(id) ON DELETE RESTRICT;
alter table order_item_services add constraint order_item_services_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
alter table quote_status_history add constraint quote_status_history_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;
alter table design_files add constraint design_files_design_id_fkey FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;
alter table quote_status_history add constraint quote_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table order_item_services add constraint order_item_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES customization_services(id) ON DELETE SET NULL;
alter table notifications add constraint notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
create view public.v_admin_dashboard with (security_invoker=true) as  SELECT ( SELECT count(*) AS count
           FROM orders
          WHERE ((orders.status <> 'delivered'::order_status) AND (orders.status <> 'cancelled'::order_status))) AS active_orders,
    ( SELECT count(*) AS count
           FROM orders
          WHERE (orders.status = 'in_production'::order_status)) AS orders_in_production,
    ( SELECT count(*) AS count
           FROM orders
          WHERE (orders.status = 'quality_check'::order_status)) AS orders_quality_check,
    ( SELECT count(*) AS count
           FROM orders
          WHERE (orders.status = 'ready'::order_status)) AS orders_ready,
    ( SELECT count(*) AS count
           FROM quotes
          WHERE (quotes.status = ANY (ARRAY['submitted'::quote_status, 'under_review'::quote_status, 'sent'::quote_status]))) AS pending_quotes,
    ( SELECT count(*) AS count
           FROM products
          WHERE (products.status = 'active'::product_status)) AS active_products,
    ( SELECT count(*) AS count
           FROM (product_variants pv
             JOIN inventory i ON ((i.product_variant_id = pv.id)))
          WHERE (i.quantity_available <= i.minimum_stock)) AS low_stock_variants;
create view public.v_order_summary with (security_invoker=true) as  SELECT o.id,
    o.order_number,
    o.customer_id,
    p.full_name AS customer_name,
    o.status,
    o.delivery_method,
    o.subtotal,
    o.discount_amount,
    o.shipping_amount,
    o.total,
    o.created_at,
    o.updated_at
   FROM (orders o
     JOIN profiles p ON ((p.id = o.customer_id)));
create view public.v_quote_item_pricing with (security_invoker=true) as  SELECT qi.id,
    qi.quote_id,
    qi.product_variant_id,
    qi.design_id,
    qi.quantity,
    qi.unit_price_override,
    COALESCE(qi.unit_price_override, qi.unit_price_snapshot, pv.base_price) AS unit_price,
    (COALESCE(( SELECT sum(
                CASE COALESCE(qis.pricing_mode_snapshot, cs.pricing_mode)
                    WHEN 'flat'::pricing_mode THEN COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price)
                    WHEN 'per_item'::pricing_mode THEN (COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * (qi.quantity)::numeric)
                    WHEN 'per_unit'::pricing_mode THEN (COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * qis.units)
                    ELSE NULL::numeric
                END) AS sum
           FROM (quote_item_services qis
             JOIN customization_services cs ON ((cs.id = qis.service_id)))
          WHERE (qis.quote_item_id = qi.id)), (0)::numeric))::numeric(12,2) AS customization_total,
    (((qi.quantity)::numeric * COALESCE(qi.unit_price_override, qi.unit_price_snapshot, pv.base_price)) + (COALESCE(( SELECT sum(
                CASE COALESCE(qis.pricing_mode_snapshot, cs.pricing_mode)
                    WHEN 'flat'::pricing_mode THEN COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price)
                    WHEN 'per_item'::pricing_mode THEN (COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * (qi.quantity)::numeric)
                    WHEN 'per_unit'::pricing_mode THEN (COALESCE(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * qis.units)
                    ELSE NULL::numeric
                END) AS sum
           FROM (quote_item_services qis
             JOIN customization_services cs ON ((cs.id = qis.service_id)))
          WHERE (qis.quote_item_id = qi.id)), (0)::numeric))::numeric(12,2)) AS line_total
   FROM (quote_items qi
     JOIN product_variants pv ON ((pv.id = qi.product_variant_id)));
create view public.v_quote_totals with (security_invoker=true) as  SELECT q.id,
    q.quote_number,
    q.customer_id,
    q.status,
    q.order_type,
    q.discount_amount,
    q.shipping_amount,
    (COALESCE(sum(vqi.line_total), (0)::numeric))::numeric(12,2) AS subtotal,
    (GREATEST((0)::numeric, ((COALESCE(sum(vqi.line_total), (0)::numeric) - q.discount_amount) + q.shipping_amount)))::numeric(12,2) AS total
   FROM (quotes q
     LEFT JOIN v_quote_item_pricing vqi ON ((vqi.quote_id = q.id)))
  GROUP BY q.id, q.quote_number, q.customer_id, q.status, q.order_type, q.discount_amount, q.shipping_amount;
CREATE OR REPLACE FUNCTION private.log_quote_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.quote_status_history (
      quote_id,
      from_status,
      to_status,
      changed_by
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      (select auth.uid())
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.create_production_task_for_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.production_tasks (
    order_id,
    order_item_id,
    priority,
    status
  )
  values (
    new.order_id,
    new.id,
    3,
    'pending'
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      (select auth.uid())
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.protect_profile_security_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null
     and not (select private.is_admin()) then
    if new.role is distinct from old.role then
      raise exception 'No puedes cambiar tu propio rol';
    end if;

    if new.is_active is distinct from old.is_active then
      raise exception 'No puedes cambiar tu propio estado de activación';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.create_inventory_for_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.inventory(product_variant_id)
  values (new.id)
  on conflict (product_variant_id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.recalculate_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.orders o
  set
    subtotal = coalesce((
      select sum(oi.line_subtotal)
      from public.order_items oi
      where oi.order_id = coalesce(new.order_id, old.order_id)
    ), 0),
    total = greatest(
      0::numeric,
      coalesce((
        select sum(oi.line_subtotal)
        from public.order_items oi
        where oi.order_id = coalesce(new.order_id, old.order_id)
      ), 0)
      - o.discount_amount
      + o.shipping_amount
    ),
    updated_at = now()
  where o.id = coalesce(new.order_id, old.order_id);

  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role in ('admin'::public.app_role, 'operator'::public.app_role)
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role = 'admin'::public.app_role
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_customer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role = 'customer'::public.app_role
  );
$function$
;
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid;
  v_status public.quote_status;
begin
  select customer_id, status
    into v_customer_id, v_status
  from public.quotes
  where id = p_quote_id;

  if v_customer_id is null then
    raise exception 'Cotización no encontrada';
  end if;

  if v_customer_id <> (select auth.uid()) then
    raise exception 'No puedes enviar esta cotización';
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo una cotización en borrador puede enviarse';
  end if;

  if not exists (
    select 1 from public.quote_items where quote_id = p_quote_id
  ) then
    raise exception 'La cotización debe tener al menos un producto';
  end if;

  update public.quote_items qi
  set unit_price_snapshot = coalesce(qi.unit_price_override, pv.base_price)
  from public.product_variants pv
  where qi.id in (
    select id from public.quote_items where quote_id = p_quote_id
  )
    and pv.id = qi.product_variant_id;

  update public.quote_item_services qis
  set
    pricing_mode_snapshot = cs.pricing_mode,
    unit_price_snapshot = coalesce(qis.unit_price_override, cs.unit_price)
  from public.customization_services cs
  where qis.quote_item_id in (
    select id from public.quote_items where quote_id = p_quote_id
  )
    and cs.id = qis.service_id;

  update public.quotes
  set
    status = 'submitted',
    submitted_at = now(),
    valid_until = coalesce(valid_until, current_date + 7)
  where id = p_quote_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid;
  v_status public.quote_status;
begin
  select customer_id, status
    into v_customer_id, v_status
  from public.quotes
  where id = p_quote_id;

  if v_customer_id is null then
    raise exception 'Cotización no encontrada';
  end if;

  if v_customer_id <> (select auth.uid()) then
    raise exception 'No puedes responder esta cotización';
  end if;

  if v_status <> 'sent' then
    raise exception 'La cotización no está pendiente de respuesta';
  end if;

  update public.quotes
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    responded_at = now()
  where id = p_quote_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.convert_quote_to_order(p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote public.quotes%rowtype;
  v_order_id uuid;
  v_existing_order uuid;
  v_order_item_id uuid;
  v_stock integer;
  v_item record;
  v_service record;
  v_delivery_address public.customer_addresses%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede convertir cotizaciones en pedidos';
  end if;

  select *
    into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if v_quote.id is null then
    raise exception 'Cotización no encontrada';
  end if;

  if v_quote.status <> 'approved' then
    raise exception 'La cotización debe estar aprobada por el cliente';
  end if;

  select id into v_existing_order
  from public.orders
  where quote_id = p_quote_id;

  if v_existing_order is not null then
    return v_existing_order;
  end if;

  if v_quote.valid_until is not null and v_quote.valid_until < current_date then
    raise exception 'La cotización está vencida';
  end if;

  if v_quote.delivery_method = 'delivery' then
    if v_quote.delivery_address_id is null then
      raise exception 'El pedido de entrega necesita una dirección';
    end if;

    select * into v_delivery_address
    from public.customer_addresses
    where id = v_quote.delivery_address_id
      and customer_id = v_quote.customer_id;

    if v_delivery_address.id is null then
      raise exception 'La dirección de entrega no es válida';
    end if;
  end if;

  insert into public.orders (
    quote_id,
    customer_id,
    status,
    delivery_method,
    shipping_recipient_name,
    shipping_phone,
    shipping_address,
    shipping_neighborhood,
    shipping_city,
    shipping_department,
    shipping_reference,
    discount_amount,
    shipping_amount,
    customer_notes,
    admin_notes
  )
  values (
    v_quote.id,
    v_quote.customer_id,
    'confirmed',
    v_quote.delivery_method,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.recipient_name end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.phone end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.address_line end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.neighborhood end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.city end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.department end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.reference end,
    v_quote.discount_amount,
    v_quote.shipping_amount,
    v_quote.customer_notes,
    v_quote.admin_notes
  )
  returning id into v_order_id;

  for v_item in
    select
      vqi.*,
      p.name as product_name,
      pv.sku,
      pv.color_name,
      pv.size_code,
      d.design_data,
      d.preview_path
    from public.v_quote_item_pricing vqi
    join public.product_variants pv
      on pv.id = vqi.product_variant_id
    join public.products p
      on p.id = pv.product_id
    left join public.designs d
      on d.id = vqi.design_id
    where vqi.quote_id = p_quote_id
    order by vqi.id
  loop
    select quantity_available
      into v_stock
    from public.inventory
    where product_variant_id = v_item.product_variant_id
    for update;

    if v_stock is null then
      raise exception 'La variante % no tiene inventario configurado', v_item.sku;
    end if;

    if v_stock < v_item.quantity then
      raise exception 'Stock insuficiente para SKU %. Disponible: %, solicitado: %',
        v_item.sku, v_stock, v_item.quantity;
    end if;

    insert into public.order_items (
      order_id,
      product_variant_id,
      design_id,
      product_name_snapshot,
      sku_snapshot,
      color_snapshot,
      size_snapshot,
      design_data_snapshot,
      preview_path_snapshot,
      quantity,
      unit_price,
      customization_total
    )
    values (
      v_order_id,
      v_item.product_variant_id,
      v_item.design_id,
      v_item.product_name,
      v_item.sku,
      v_item.color_name,
      v_item.size_code,
      v_item.design_data,
      v_item.preview_path,
      v_item.quantity,
      v_item.unit_price,
      v_item.customization_total
    )
    returning id into v_order_item_id;

    for v_service in
      select
        qis.service_id,
        cs.name,
        coalesce(qis.pricing_mode_snapshot, cs.pricing_mode) as pricing_mode,
        qis.units,
        coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) as unit_price,
        case coalesce(qis.pricing_mode_snapshot, cs.pricing_mode)
          when 'flat' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price)
          when 'per_item' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * v_item.quantity
          when 'per_unit' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * qis.units
        end as amount
      from public.quote_item_services qis
      join public.customization_services cs
        on cs.id = qis.service_id
      where qis.quote_item_id = v_item.id
    loop
      insert into public.order_item_services (
        order_item_id,
        service_id,
        service_name_snapshot,
        pricing_mode_snapshot,
        units,
        unit_price,
        amount
      )
      values (
        v_order_item_id,
        v_service.service_id,
        v_service.name,
        v_service.pricing_mode,
        v_service.units,
        v_service.unit_price,
        v_service.amount
      );
    end loop;

    update public.inventory
    set
      quantity_available = quantity_available - v_item.quantity,
      updated_at = now()
    where product_variant_id = v_item.product_variant_id;

    insert into public.inventory_movements (
      product_variant_id,
      movement_type,
      quantity_delta,
      reason,
      order_id,
      created_by
    )
    values (
      v_item.product_variant_id,
      'sale',
      -v_item.quantity,
      'Reserva/descuento de stock al convertir cotización en pedido',
      v_order_id,
      (select auth.uid())
    );
  end loop;

  return v_order_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_quote_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_title text;
  v_message text;
begin
  if new.status is distinct from old.status then
    v_title := case new.status
      when 'submitted' then 'Cotización enviada'
      when 'under_review' then 'Cotización en revisión'
      when 'sent' then 'Cotización lista para revisar'
      when 'approved' then 'Cotización aprobada'
      when 'rejected' then 'Cotización rechazada'
      when 'expired' then 'Cotización vencida'
      when 'cancelled' then 'Cotización cancelada'
      else 'Actualización de cotización'
    end;

    v_message := case new.status
      when 'submitted' then 'Tu cotización ' || new.quote_number || ' fue enviada y será revisada.'
      when 'under_review' then 'Tu cotización ' || new.quote_number || ' está siendo revisada.'
      when 'sent' then 'La cotización ' || new.quote_number || ' está disponible para tu aprobación.'
      when 'approved' then 'La cotización ' || new.quote_number || ' fue aprobada.'
      when 'rejected' then 'La cotización ' || new.quote_number || ' fue rechazada.'
      when 'expired' then 'La cotización ' || new.quote_number || ' ha vencido.'
      when 'cancelled' then 'La cotización ' || new.quote_number || ' fue cancelada.'
      else 'La cotización ' || new.quote_number || ' cambió de estado.'
    end;

    insert into public.notifications (
      recipient_id,
      type,
      title,
      message,
      quote_id
    )
    values (
      new.customer_id,
      'quote',
      v_title,
      v_message,
      new.id
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_title text;
  v_message text;
begin
  if new.status is distinct from old.status then
    v_title := case new.status
      when 'confirmed' then 'Pedido confirmado'
      when 'in_production' then 'Pedido en producción'
      when 'quality_check' then 'Pedido en control de calidad'
      when 'ready' then 'Pedido listo'
      when 'delivered' then 'Pedido entregado'
      when 'cancelled' then 'Pedido cancelado'
    end;

    v_message := case new.status
      when 'confirmed' then 'Tu pedido ' || new.order_number || ' fue confirmado.'
      when 'in_production' then 'Tu pedido ' || new.order_number || ' entró en producción.'
      when 'quality_check' then 'Tu pedido ' || new.order_number || ' está en control de calidad.'
      when 'ready' then 'Tu pedido ' || new.order_number || ' está listo.'
      when 'delivered' then 'Tu pedido ' || new.order_number || ' fue entregado.'
      when 'cancelled' then 'Tu pedido ' || new.order_number || ' fue cancelado.'
    end;

    insert into public.notifications (
      recipient_id,
      type,
      title,
      message,
      order_id
    )
    values (
      new.customer_id,
      'order',
      v_title,
      v_message,
      new.id
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.transition_order_status(p_order_id uuid, p_new_status order_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_latest_quality public.quality_result;
begin
  if not (select private.is_staff()) then
    raise exception 'Solo el personal autorizado puede actualizar pedidos';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status = p_new_status then
    return;
  end if;

  if p_new_status = 'in_production'
     and v_order.status <> 'confirmed'
     and v_order.status <> 'quality_check' then
    raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status;
  end if;

  if p_new_status = 'quality_check' then
    if v_order.status <> 'in_production' then
      raise exception 'El pedido debe estar en producción antes del control de calidad';
    end if;

    if exists (
      select 1
      from public.production_tasks pt
      where pt.order_id = p_order_id
        and pt.status <> 'completed'
    ) then
      raise exception 'No se puede enviar a calidad mientras existan tareas de producción incompletas';
    end if;
  end if;

  if p_new_status = 'ready' then
    if v_order.status <> 'quality_check' then
      raise exception 'El pedido debe estar en control de calidad';
    end if;

    select qc.result
      into v_latest_quality
    from public.quality_checks qc
    where qc.order_id = p_order_id
    order by qc.checked_at desc
    limit 1;

    if v_latest_quality is distinct from 'approved'::public.quality_result then
      raise exception 'Se necesita un control de calidad aprobado';
    end if;
  end if;

  if p_new_status = 'delivered' and v_order.status <> 'ready' then
    raise exception 'Solo un pedido listo puede marcarse como entregado';
  end if;

  if p_new_status = 'cancelled' and v_order.status <> 'confirmed' then
    raise exception 'Solo se puede cancelar un pedido antes de iniciar producción';
  end if;

  if v_order.status = 'confirmed'
     and p_new_status not in ('in_production','cancelled') then
    raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status;
  end if;

  update public.orders
  set
    status = p_new_status,
    confirmed_at = case when p_new_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    started_at = case when p_new_status = 'in_production' then coalesce(started_at, now()) else started_at end,
    ready_at = case when p_new_status = 'ready' then now() else ready_at end,
    delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    updated_at = now()
  where id = p_order_id;

  if p_new_status = 'cancelled' and v_order.inventory_released_at is null then
    update public.inventory i
    set quantity_available = i.quantity_available + x.quantity
    from (
      select product_variant_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_variant_id
    ) x
    where i.product_variant_id = x.product_variant_id;

    insert into public.inventory_movements (
      product_variant_id,
      movement_type,
      quantity_delta,
      reason,
      order_id,
      created_by
    )
    select
      product_variant_id,
      'release',
      quantity,
      'Devolución de stock por cancelación de pedido',
      p_order_id,
      (select auth.uid())
    from (
      select product_variant_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_variant_id
    ) x;

    update public.orders
    set inventory_released_at = now()
    where id = p_order_id;
  end if;

  if p_note is not null and char_length(trim(p_note)) > 0 then
    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      p_order_id,
      v_order.status,
      p_new_status,
      (select auth.uid()),
      left(trim(p_note), 500)
    );
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_record_id := old.id;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_record_id := new.id;
  else
    v_old := null;
    v_new := to_jsonb(new);
    v_record_id := new.id;
  end if;

  insert into public.audit_logs (
    actor_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    (select auth.uid()),
    tg_table_name,
    v_record_id,
    tg_op,
    v_old,
    v_new
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER customer_addresses_set_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER designs_set_updated_at BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER customization_services_set_updated_at BEFORE UPDATE ON public.customization_services FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER quotes_set_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER quote_items_set_updated_at BEFORE UPDATE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER quote_item_services_set_updated_at BEFORE UPDATE ON public.quote_item_services FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER production_tasks_set_updated_at BEFORE UPDATE ON public.production_tasks FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER profiles_protect_security_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_profile_security_fields();
CREATE TRIGGER product_variant_create_inventory AFTER INSERT ON public.product_variants FOR EACH ROW EXECUTE FUNCTION private.create_inventory_for_variant();
CREATE TRIGGER order_items_recalculate_totals AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.recalculate_order_totals();
CREATE TRIGGER order_item_create_production_task AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.create_production_task_for_order_item();
CREATE TRIGGER quotes_log_status AFTER INSERT OR UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.log_quote_status_change();
CREATE TRIGGER orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.log_order_status_change();
CREATE TRIGGER quotes_notify_status AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.notify_quote_status_change();
CREATE TRIGGER orders_notify_status AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.notify_order_status_change();
CREATE TRIGGER quotes_audit AFTER INSERT OR DELETE OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
CREATE TRIGGER orders_audit AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
CREATE TRIGGER production_tasks_audit AFTER INSERT OR DELETE OR UPDATE ON public.production_tasks FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
CREATE TRIGGER quality_checks_audit AFTER INSERT OR DELETE OR UPDATE ON public.quality_checks FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
CREATE TRIGGER inventory_audit AFTER INSERT OR DELETE OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
alter table public.audit_logs alter column id set default nextval('public.audit_logs_id_seq');
grant usage on schema public,private,auth to authenticated;
grant all on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
