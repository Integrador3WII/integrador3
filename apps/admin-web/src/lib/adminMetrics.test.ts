import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { getOrderMetrics } from './adminMetrics';
beforeEach(() => vi.resetAllMocks());
const snapshot = { orders_today: 0, in_production: 0, delivered_today: 0, delivered_amount_today: 0, as_of: '2026-11-01T15:00:00Z', timezone: 'America/La_Paz' };
it('conserva los ceros reales de una base sin pedidos', async () => {
  mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
  expect(await getOrderMetrics()).toEqual(snapshot);
  expect(mocks.rpc).toHaveBeenCalledWith('admin_order_metrics');
});
it('no convierte fallos de acceso en indicadores con cero', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  await expect(getOrderMetrics()).rejects.toThrow(/acceso administrativo/);
});
it.each([null, {}, { ...snapshot, orders_today: -1 }, { ...snapshot, in_production: '4' }, { ...snapshot, as_of: 'invalid' }])('rechaza una respuesta incompleta o inválida %#', async data => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  await expect(getOrderMetrics()).rejects.toThrow(/incompletos/);
});
