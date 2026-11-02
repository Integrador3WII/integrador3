import { supabase } from './supabase';

export type Material = { id: string; code: string; name: string; unit: string; description: string | null; is_active: boolean; quantity_on_hand: number; quantity_reserved: number; reorder_point: number; updated_at: string };
export type MaterialVariant = { id: string; sku: string; color_name: string; size_code: string; fulfillment_mode: 'stock' | 'made_to_order'; products: { name: string } | null };
export type MaterialMovement = { id:string; movement_type:string; quantity_delta:number; quantity_after:number; reason:string; order_id:string|null; operation_id:string|null; created_at:string };
function db() { if (!supabase) throw new Error('Configura la conexión de Supabase para administrar materiales.'); return supabase; }
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new Error('Necesitas una cuenta de administrador activa para esta acción.');
  if (['22023','23505','23514'].includes(error.code ?? '')) throw new Error(error.message ?? 'Revisa los datos ingresados.');
  if (error.code === 'PGRST202') throw new Error('La actualización de materiales aún no está instalada en Supabase.');
  throw new Error('No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.');
}
export async function listMaterials() {
  const { data, error } = await db().from('materials').select('*').order('name').order('id'); check(error); return (data ?? []) as Material[];
}
export async function listMaterialMovements(materialId:string) {
  const { data, error } = await db().from('material_movements').select('id,movement_type,quantity_delta,quantity_after,reason,order_id,operation_id,created_at').eq('material_id',materialId).order('created_at',{ascending:false}).limit(30); check(error); return (data??[]) as MaterialMovement[];
}
export async function listMaterialVariants() {
  const { data, error } = await db().from('product_variants').select('id,sku,color_name,size_code,fulfillment_mode,products(name)').order('sku'); check(error); return (data ?? []) as unknown as MaterialVariant[];
}
export async function createMaterial(input: { code:string; name:string; unit:string; reorderPoint:number; description:string }) {
  const { error } = await db().rpc('admin_create_material', { p_code:input.code, p_name:input.name, p_unit:input.unit, p_reorder_point:input.reorderPoint, p_description:input.description || null }); check(error);
}
export async function receiveMaterial(materialId:string,operationId:string,quantity:number,reason:string) {
  const { error } = await db().rpc('admin_receive_material', { p_material_id:materialId,p_operation_id:operationId,p_quantity:quantity,p_reason:reason }); check(error);
}
export async function saveRecipe(variantId:string,lines:Array<{material_id:string;quantity_per_unit:number;waste_percent:number}>,notes:string) {
  const { error } = await db().rpc('admin_save_recipe', { p_variant_id:variantId,p_lines:lines,p_notes:notes || null }); check(error);
}
export async function getActiveRecipe(variantId:string) {
  const { data, error } = await db().from('product_recipes').select('notes,lines:product_recipe_materials(material_id,quantity_per_unit,waste_percent)').eq('product_variant_id',variantId).eq('status','active').maybeSingle(); check(error);
  return data as {notes:string|null;lines:Array<{material_id:string;quantity_per_unit:number;waste_percent:number}>}|null;
}
export async function setFulfillment(variantId:string,mode:'stock'|'made_to_order') {
  const { error } = await db().rpc('admin_set_variant_fulfillment', { p_variant_id:variantId,p_mode:mode }); check(error);
}
