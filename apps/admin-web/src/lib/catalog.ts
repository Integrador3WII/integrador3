import { supabase } from './supabase';

export type CatalogStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type Category = { id: string; name: string; slug: string; description: string | null; is_active: boolean };
export type Product = {
  id: string; name: string; slug: string; description: string | null;
  category_id: string; status: CatalogStatus; allows_customization: boolean;
  image_path?: string | null;
  categories: Pick<Category, 'name' | 'is_active'> | null;
};
export type Variant = {
  id: string; product_id: string; sku: string; color_name: string; size_code: string;
  base_price: number; status: CatalogStatus;
  inventory: { quantity_available: number; minimum_stock: number } | null;
  products: { name: string; status: CatalogStatus; categories: { is_active: boolean } | null } | null;
};
export type Movement = {
  id: string; operation_id: string | null; product_variant_id: string;
  movement_type: string; quantity_delta: number; quantity_after: number | null;
  reason: string | null; created_by: string | null; created_at: string;
  profiles?: { full_name: string | null } | null;
};
export type MovementInput = { variantId: string; operationId: string; direction: 'in' | 'out'; quantity: number; reason: string };
export type Page<T> = { rows: T[]; count: number };
export const PAGE_SIZE = 12;
export const SIZES = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'UNICA'];
export const statusLabels: Record<CatalogStatus, string> = { draft: 'Borrador', active: 'Activo', inactive: 'Inactivo', archived: 'Archivado' };

function client() {
  if (!supabase) throw new Error('Configura Supabase para gestionar datos reales.');
  return supabase;
}

export function catalogError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === '23505') return 'Ya existe ese código, SKU o combinación de talla y color.';
  if (e?.code === '23514') return 'Revisa el nombre, talla y precio: los datos no cumplen las reglas del catálogo.';
  if (e?.code === '42501') return 'Necesitas una cuenta de administrador activa para esta operación.';
  if (e?.code === 'PGRST202') return 'La actualización de catálogo e inventario aún no está instalada en Supabase.';
  return e?.message || 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}

function check(error: unknown) {
  if (error) throw Object.assign(new Error(catalogError(error)), { code: (error as { code?: string }).code });
}
export function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function searchTerm(value: string) { return value.trim().replace(/[\\%_]/g, '\\$&'); }

export async function hasCatalogAccess() {
  const { data, error } = await client().rpc('admin_catalog_access');
  check(error);
  return data === true;
}

export async function listCategories(): Promise<Category[]> {
  const rows: Category[] = [];
  for (let start = 0; ; start += 200) {
    const { data, error } = await client().from('categories')
      .select('id,name,slug,description,is_active').order('name').order('id').range(start, start + 199);
    check(error);
    rows.push(...(data ?? []) as Category[]);
    if (!data || data.length < 200) return rows;
  }
}

export async function saveCategory(input: Omit<Category, 'id'>, id?: string) {
  const values = { ...input, name: input.name.trim(), slug: input.slug.trim(), description: input.description?.trim() || null };
  const query = id ? client().from('categories').update(values).eq('id', id) : client().from('categories').insert(values);
  const { data, error } = await query.select('id').single();
  check(error);
  return data!.id as string;
}

export async function listProducts(page = 0, search = '', status = ''): Promise<Page<Product>> {
  let query = client().from('products').select('id,name,slug,description,category_id,status,allows_customization,image_path,categories(name,is_active)', { count: 'exact' });
  if (search.trim()) query = query.ilike('name', `%${searchTerm(search)}%`);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  check(error);
  return { rows: (data ?? []) as unknown as Product[], count: count ?? 0 };
}

export async function saveProduct(input: Omit<Product, 'id' | 'categories'>, id?: string) {
  const values = { ...input, name: input.name.trim(), slug: input.slug.trim(), description: input.description?.trim() || null };
  const query = id ? client().from('products').update(values).eq('id', id) : client().from('products').insert(values);
  const { data, error } = await query.select('id').single();
  check(error);
  return data!.id as string;
}

export function productImageUrl(path: string | null) {
  if (!path || !supabase) return null;
  return client().storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export async function uploadProductImage(productId: string, file: File, previousPath?: string | null) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen JPG, PNG o WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5 MB.');
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${productId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
  check(error);
  const { error: updateError } = await client().from('products').update({ image_path: path }).eq('id', productId);
  if (updateError) { await client().storage.from('product-images').remove([path]); check(updateError); }
  if (previousPath) await client().storage.from('product-images').remove([previousPath]);
  return path;
}

export async function removeProductImage(productId: string, path: string) {
  const { error } = await client().from('products').update({ image_path: null }).eq('id', productId);
  check(error);
  const result = await client().storage.from('product-images').remove([path]);
  check(result.error);
}

export async function listVariants(page = 0, search = '', productId?: string): Promise<Page<Variant>> {
  let query = client().from('product_variants').select('id,product_id,sku,color_name,size_code,base_price,status,inventory(quantity_available,minimum_stock),products(name,status,categories(is_active))', { count: 'exact' });
  if (productId) query = query.eq('product_id', productId);
  if (search.trim()) query = query.ilike('sku', `%${searchTerm(search)}%`);
  const { data, error, count } = await query.order('sku').order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  check(error);
  return { rows: (data ?? []) as unknown as Variant[], count: count ?? 0 };
}

export async function saveVariant(input: Pick<Variant, 'product_id' | 'sku' | 'color_name' | 'size_code' | 'base_price' | 'status'>, id?: string) {
  if (!Number.isFinite(input.base_price) || input.base_price < 0) throw new Error('El precio debe ser un número mayor o igual a cero.');
  const values = { ...input, sku: input.sku.trim(), color_name: input.color_name.trim() };
  const query = id ? client().from('product_variants').update(values).eq('id', id) : client().from('product_variants').insert(values);
  const { data, error } = await query.select('id').single();
  check(error);
  return data!.id as string;
}

export function validateMovement(input: MovementInput) {
  if (!input.variantId || !input.operationId || !['in', 'out'].includes(input.direction)
    || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000000)
    throw new Error('Ingresa una cantidad entera entre 1 y 1.000.000.');
  if (input.reason.trim().length < 5 || input.reason.trim().length > 250)
    throw new Error('El motivo debe tener entre 5 y 250 caracteres.');
}

export async function recordMovement(input: MovementInput): Promise<Movement> {
  validateMovement(input);
  const { data, error } = await client().rpc('admin_record_inventory_movement', {
    p_variant_id: input.variantId, p_operation_id: input.operationId,
    p_direction: input.direction, p_quantity: input.quantity, p_reason: input.reason.trim(),
  });
  check(error);
  return data as Movement;
}

export async function listMovements(variantId: string, page = 0): Promise<Page<Movement>> {
  const { data, error, count } = await client().from('inventory_movements')
    .select('id,operation_id,product_variant_id,movement_type,quantity_delta,quantity_after,reason,created_by,created_at,profiles!inventory_movements_created_by_fkey(full_name)', { count: 'exact' })
    .eq('product_variant_id', variantId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  check(error);
  return { rows: (data ?? []) as unknown as Movement[], count: count ?? 0 };
}
