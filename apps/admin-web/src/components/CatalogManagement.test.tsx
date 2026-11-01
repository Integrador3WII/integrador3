import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogManagement from './CatalogManagement';
import InventoryManagement from './InventoryManagement';
import * as api from '../lib/catalog';

vi.mock('../lib/catalog', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/catalog')>(),
  hasCatalogAccess: vi.fn(), listCategories: vi.fn(), listProducts: vi.fn(), listVariants: vi.fn(),
  saveCategory: vi.fn(), saveProduct: vi.fn(), saveVariant: vi.fn(), recordMovement: vi.fn(), listMovements: vi.fn(),
}));
const category = { id: 'cat', name: 'Poleras', slug: 'poleras', description: null, is_active: true };
const product = { id: 'product', name: 'Polera algodón', slug: 'polera', description: null, category_id: 'cat', status: 'active' as const, allows_customization: true, categories: category };
const variant = { id: 'variant', product_id: 'product', sku: 'POL-AZ-M', color_name: 'Azul', size_code: 'M', base_price: 50, status: 'active' as const, products: { name: product.name, status: 'active' as const, categories: { is_active: true } }, inventory: { quantity_available: 10, minimum_stock: 0 } };

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  vi.mocked(api.hasCatalogAccess).mockResolvedValue(true);
  vi.mocked(api.listCategories).mockResolvedValue([category]);
  vi.mocked(api.listProducts).mockResolvedValue({ rows: [product], count: 1 });
  vi.mocked(api.listVariants).mockResolvedValue({ rows: [variant], count: 1 });
  vi.mocked(api.listMovements).mockResolvedValue({ rows: [], count: 0 });
});
afterEach(cleanup);

describe('Catálogo administrativo', () => {
  it('bloquea la sección si el usuario no es administrador activo', async () => {
    vi.mocked(api.hasCatalogAccess).mockResolvedValue(false);
    render(<CatalogManagement />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/administrador activa/);
    expect(api.listProducts).not.toHaveBeenCalled();
  });
  it('informa si falta la migración y permite reintentar', async () => {
    vi.mocked(api.hasCatalogAccess).mockRejectedValueOnce(new Error('Actualización pendiente'));
    render(<CatalogManagement />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Actualización pendiente');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar conexión' }));
    expect(await screen.findByText('Polera algodón')).toBeInTheDocument();
  });
  it('permite crear categorías reales y comunica el éxito', async () => {
    vi.mocked(api.saveCategory).mockResolvedValue('new-category');
    render(<CatalogManagement />);
    await screen.findByText(product.name);
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }));
    fireEvent.click(screen.getByRole('button', { name: /nueva categoría/i }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Buzos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.saveCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Buzos', slug: 'buzos', is_active: true }), undefined));
    expect(await screen.findByText('Cambios guardados en Supabase.')).toBeInTheDocument();
  });
  it('crea el producto como borrador antes de agregar variantes', async () => {
    vi.mocked(api.saveProduct).mockResolvedValue('new-product');
    render(<CatalogManagement />); await screen.findByText(product.name);
    fireEvent.click(screen.getByRole('button', { name: /nuevo producto/i }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Polera nueva' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.saveProduct).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', category_id: 'cat' }), undefined));
  });
  it('mantiene el formulario abierto y muestra un duplicado del servidor', async () => {
    vi.mocked(api.saveVariant).mockRejectedValue(new Error('Ya existe ese SKU'));
    render(<CatalogManagement />); await screen.findByText(product.name);
    fireEvent.click(screen.getByRole('button', { name: `Variantes de ${product.name}` }));
    await screen.findByText(variant.sku);
    fireEvent.click(screen.getByRole('button', { name: `Editar variante ${variant.sku}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe ese SKU');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('permite cerrar un formulario con Escape', async () => {
    render(<CatalogManagement />); await screen.findByText(product.name);
    fireEvent.click(screen.getByRole('button', { name: /nuevo producto/i }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Inventario administrativo', () => {
  async function openMovement() {
    render(<InventoryManagement userId="admin" />);
    fireEvent.click(await screen.findByRole('button', { name: `Registrar movimiento de ${variant.sku}` }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Compra proveedor' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar movimiento' })); });
  }
  it('registra una entrada y actualiza el listado', async () => {
    vi.mocked(api.recordMovement).mockResolvedValue({ quantity_delta: 5, quantity_after: 15 } as api.Movement);
    await openMovement();
    expect(await screen.findByText(/Movimiento confirmado: \+5 unidades/)).toBeInTheDocument();
    expect(sessionStorage.getItem('textilflow.inventory.pending:admin')).toBeNull();
  });
  it('conserva UUID y payload tras un fallo de red incluso al recargar', async () => {
    vi.mocked(api.recordMovement).mockRejectedValueOnce(new Error('Conexión interrumpida'));
    await openMovement();
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexión interrumpida');
    const firstInput = vi.mocked(api.recordMovement).mock.calls[0][0];
    expect(screen.getByLabelText('Cantidad')).toBeDisabled();
    cleanup();
    vi.mocked(api.recordMovement).mockResolvedValue({ quantity_delta: 5, quantity_after: 15 } as api.Movement);
    render(<InventoryManagement userId="admin" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar operación pendiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma operación' }));
    await waitFor(() => expect(api.recordMovement).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.recordMovement).mock.calls[1][0]).toEqual(firstInput);
    expect(await screen.findByText(/Movimiento confirmado/)).toBeInTheDocument();
  });
  it('permite corregir tras un rechazo definitivo de stock', async () => {
    vi.mocked(api.recordMovement).mockRejectedValue(Object.assign(new Error('Stock insuficiente'), { code: '22023' }));
    await openMovement();
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuficiente');
    expect(screen.getByLabelText('Cantidad')).not.toBeDisabled();
    expect(sessionStorage.getItem('textilflow.inventory.pending:admin')).toBeNull();
  });
  it('deshabilita movimientos para productos no publicados', async () => {
    vi.mocked(api.listVariants).mockResolvedValue({ rows: [{ ...variant, products: { ...variant.products, status: 'draft' } }], count: 1 });
    render(<InventoryManagement />);
    expect(await screen.findByRole('button', { name: `Registrar movimiento de ${variant.sku}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Historial de ${variant.sku}` })).not.toBeDisabled();
  });
  it('muestra historial con autor, motivo, fecha y saldo', async () => {
    vi.mocked(api.listMovements).mockResolvedValue({ rows: [{ id: 'm1', product_variant_id: 'variant', operation_id: 'op1', quantity_delta: 5, quantity_after: 15, movement_type: 'purchase', reason: 'Compra inicial', created_by: 'admin', created_at: '2026-10-07T12:00:00Z', profiles: { full_name: 'Admin prueba' } }], count: 1 });
    render(<InventoryManagement />);
    fireEvent.click(await screen.findByRole('button', { name: `Historial de ${variant.sku}` }));
    expect(await screen.findByText('Compra inicial')).toBeInTheDocument();
    expect(screen.getByText(/Admin prueba · Saldo al registrar: 15/)).toBeInTheDocument();
  });
});
