-- Keep admin mutation endpoints unavailable to anonymous callers. The RPCs
-- additionally check the caller's active administrator profile.
revoke all on function public.admin_create_material(text,text,text,numeric,text),
  public.admin_receive_material(uuid,uuid,numeric,text),
  public.admin_save_recipe(uuid,jsonb,text),
  public.admin_set_variant_fulfillment(uuid,text) from public, anon;
grant execute on function public.admin_create_material(text,text,text,numeric,text),
  public.admin_receive_material(uuid,uuid,numeric,text),
  public.admin_save_recipe(uuid,jsonb,text),
  public.admin_set_variant_fulfillment(uuid,text) to authenticated;
