import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/supabase', () => ({ supabase: null }));
vi.mock('./lib/adminUsers', () => ({
  listManagedUsers: vi.fn().mockResolvedValue([]),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  deactivateManagedUser: vi.fn(),
}));

describe('Dashboard administrativo', () => {
  it('muestra el panel principal y sus métricas', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /gestión textil con intención/i })).toBeInTheDocument();
    expect(screen.getByText('Pedidos hoy')).toBeInTheDocument();
    expect(screen.getAllByText('En producción')).toHaveLength(1);
  });

  it('abre la gestión de usuarios como una sección independiente', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /usuarios/i }));

    expect(screen.getByRole('heading', { name: /usuarios del equipo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo usuario/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0 cuentas')).toBeInTheDocument());
  });

  it('permite cambiar el panel a modo oscuro', () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /modo oscuro/i }));

    expect(container.querySelector('.admin-shell')).toHaveClass('dark-mode');
  });
});
