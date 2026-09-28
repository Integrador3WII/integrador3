import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/supabase', () => ({ supabase: null }));

describe('Dashboard administrativo', () => {
  it('muestra el panel principal y sus métricas', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /buenos días, administrador/i })).toBeInTheDocument();
    expect(screen.getByText('Pedidos hoy')).toBeInTheDocument();
    expect(screen.getAllByText('En producción')).toHaveLength(2);
  });

  it('muestra los pedidos recientes del incremento', () => {
    render(<App />);

    expect(screen.getByText('#1042')).toBeInTheDocument();
    expect(screen.getByText('Ana Vargas')).toBeInTheDocument();
    expect(screen.getByText('Hoodie bordado')).toBeInTheDocument();
  });
});
