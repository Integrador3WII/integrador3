begin;

drop function public.customer_catalog();
create function public.customer_catalog()
returns table (
  variant_id uuid, product_name text, description text, category text, size text, color text,
  base_price numeric, min_quantity integer, max_quantity integer, allows_customization boolean,
  image_path text
)
language sql stable security definer set search_path = '' as $$
  select v.id, p.name, p.description, c.name, v.size_code, v.color_name,
    v.base_price, p.min_order_quantity, p.max_order_quantity, p.allows_customization, p.image_path
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.status = 'active'
  join public.categories c on c.id = p.category_id and c.is_active
  where v.status = 'active'
  order by c.name, p.name, v.color_name, v.size_code, v.id;
$$;

revoke all on function public.customer_catalog() from public, anon, authenticated;
grant execute on function public.customer_catalog() to anon, authenticated;
notify pgrst, 'reload schema';

commit;
