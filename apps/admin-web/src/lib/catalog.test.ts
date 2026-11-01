import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { catalogError, hasCatalogAccess, recordMovement, slugify, validateMovement, type MovementInput } from './catalog';

const valid: MovementInput = { variantId: 'variant', operationId: 'operation', direction: 'in', quantity: 5, reason: 'Compra inicial' };
beforeEach(() => vi.clearAllMocks());

describe('Validaciones del catálogo', () => {
  it('genera códigos legibles sin acentos ni espacios', () => expect(slugify('  Polerón / Algodón  ')).toBe('poleron-algodon'));
  it('traduce restricciones y permisos del servidor', () => {
    expect(catalogError({ code: '23505' })).toMatch(/ya existe/i);
    expect(catalogError({ code: '42501' })).toMatch(/administrador activa/i);
    expect(catalogError({ code: 'PGRST202' })).toMatch(/aún no está instalada/i);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1000001])('rechaza cantidad inválida %s antes de enviar', async quantity => {
    await expect(recordMovement({ ...valid, quantity })).rejects.toThrow(/entera/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['', '    ', 'corto'.repeat(51)])('rechaza un motivo inválido', reason => {
    expect(() => validateMovement({ ...valid, reason })).toThrow(/motivo/i);
  });
  it('envía el mismo UUID y los mismos datos en un reintento', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'movement', quantity_after: 5 }, error: null });
    await recordMovement(valid); await recordMovement(valid);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_record_inventory_movement', expect.objectContaining({ p_operation_id: 'operation', p_quantity: 5 }));
  });
  it('conserva el código de rechazo del servidor para permitir corregir datos', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Stock insuficiente' } });
    await expect(recordMovement(valid)).rejects.toMatchObject({ code: '22023', message: 'Stock insuficiente' });
  });
  it('no concede acceso con una respuesta vacía o negativa', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await hasCatalogAccess()).toBe(false);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await hasCatalogAccess()).toBe(true);
  });
});
