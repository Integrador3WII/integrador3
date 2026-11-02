import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OrderManagement from './OrderManagement';
import * as api from '../lib/adminOrders';
vi.mock('./CatalogShared', async original => ({ ...await original<typeof import('./CatalogShared')>(), CatalogGate: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../lib/adminOrders', async original => ({ ...await original<typeof import('../lib/adminOrders')>(), listAdminOrders: vi.fn(), getAdminOrder: vi.fn(), listOrderHistory: vi.fn(), transitionOrder: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.listOrderHistory).mockResolvedValue({ rows: [], count: 0 }); });
it('muestra un estado vacío cuando no hay pedidos', async () => {
  vi.mocked(api.listAdminOrders).mockResolvedValue({ rows: [], count: 0 });
  render(<OrderManagement />);
  expect(await screen.findByText('No hay pedidos para esta consulta.')).toBeInTheDocument();
});
it('permite recuperar un listado tras un fallo de conexión', async () => {
  vi.mocked(api.listAdminOrders).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue({ rows: [], count: 0 });
  render(<OrderManagement />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('No hay pedidos para esta consulta.')).toBeInTheDocument();
});
it('abre el detalle y presenta el precio histórico', async () => {
  vi.mocked(api.listAdminOrders).mockResolvedValue({ rows: [{ id: 'pedido-1', status: 'confirmed', total: 100 }], count: 1 });
  vi.mocked(api.getAdminOrder).mockResolvedValue({ order: { id: 'pedido-1', total: 100 }, items: [{ id: 'item', product_name_snapshot: 'Polera histórica', unit_price: 50, quantity: 2 }] });
  render(<OrderManagement />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver pedido' }));
  expect(await screen.findByText('Polera histórica')).toBeInTheDocument();
  expect(screen.getByText(/Estado:.*Total:/).textContent).toContain(api.displayAmount(100));
  expect(api.getAdminOrder).toHaveBeenCalledWith('pedido-1');
});
it('recupera el historial después de un error y muestra la observación registrada', async () => {
  vi.mocked(api.listAdminOrders).mockResolvedValue({ rows: [{ id: 'pedido-2', status: 'in_production', total: 50 }], count: 1 });
  vi.mocked(api.getAdminOrder).mockResolvedValue({ order: { id: 'pedido-2', total: 50 }, items: [] });
  vi.mocked(api.listOrderHistory).mockRejectedValueOnce(new Error('Historial temporalmente inaccesible')).mockResolvedValue({ rows: [{ id: 'history-1', from_status: 'confirmed', to_status: 'in_production', note: 'Inicio autorizado por taller', created_at: '2026-11-01T15:00:00Z' }], count: 1 });
  render(<OrderManagement />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver pedido' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar historial' }));
  expect(await screen.findByText('Inicio autorizado por taller')).toBeInTheDocument();
  expect(screen.getByText('Confirmado → En producción')).toBeInTheDocument();
  expect(api.listOrderHistory).toHaveBeenLastCalledWith('pedido-2', 0);
});
it('no confunde estados desconocidos con pedidos pendientes', () => {
  expect(api.displayStatus('future_state')).toBe('future_state');
  expect(api.displayAmount(null)).toBe('No disponible');
  expect(api.displayAmount('invalid')).toBe('No disponible');
});
it('incluye el día final completo según horario de Bolivia', () => {
  expect(api.orderDateBounds({ from: '2026-10-31', until: '2026-10-31' })).toEqual({ lower: '2026-10-31T04:00:00.000Z', upper: '2026-11-01T04:00:00.000Z' });
  expect(() => api.orderDateBounds({ from: '2026-11-01', until: '2026-10-31' })).toThrow(/fecha inicial/);
});
it('envía el filtro de estado y reinicia la página', async () => {
  vi.mocked(api.listAdminOrders).mockResolvedValue({ rows: [], count: 0 });
  render(<OrderManagement />);
  await screen.findByText('No hay pedidos para esta consulta.');
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'quality_check' } });
  await screen.findByText('No hay pedidos para esta consulta.');
  expect(api.listAdminOrders).toHaveBeenLastCalledWith(0, '', { status: 'quality_check' });
});
it('mantiene el diálogo y explica un cambio rechazado por el servidor', async () => {
  vi.mocked(api.listAdminOrders).mockResolvedValue({ rows: [{ id:'pedido-3',status:'confirmed',total:50 }],count:1 });
  vi.mocked(api.getAdminOrder).mockResolvedValue({ order:{id:'pedido-3',status:'confirmed',total:50},items:[] });
  vi.mocked(api.transitionOrder).mockRejectedValue(new Error('Estado actualizado por otra persona'));
  render(<OrderManagement />);
  fireEvent.click(await screen.findByRole('button',{name:'Ver pedido'}));
  fireEvent.change(await screen.findByLabelText('Nuevo estado'),{target:{value:'in_production'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar cambio'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Estado actualizado por otra persona');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(api.transitionOrder).toHaveBeenCalledWith('pedido-3','in_production','');
});
