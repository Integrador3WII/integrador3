import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { catalogError, hasCatalogAccess, PAGE_SIZE } from '../lib/catalog';

export function CatalogGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    hasCatalogAccess().then(allowed => { if (active) setState(allowed ? 'allowed' : 'denied'); })
      .catch(e => { if (active) { setError(catalogError(e)); setState('error'); } });
    return () => { active = false; };
  }, [retry]);
  if (state === 'loading') return <p role="status" className="catalog-empty">Verificando permisos…</p>;
  if (state === 'denied') return <p role="alert" className="catalog-empty">Esta sección requiere una cuenta de administrador activa.</p>;
  if (state === 'error') return <div className="catalog-empty"><p role="alert">{error}</p><button className="catalog-button" onClick={() => setRetry(n => n + 1)}>Reintentar conexión</button></div>;
  return <>{children}</>;
}

export function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const first = node.querySelector<HTMLElement>('input,select,textarea,button');
    (first ?? node).focus();
    return () => { previous?.focus(); };
  }, []);
  useEffect(() => {
    // Async content replacement can remove the focused form control.
    // Keep focus inside the dialog so Escape and Tab still work after saving.
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus();
  });
  return <div className="modal-backdrop"><div className="catalog-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));
        if (!nodes.length) { event.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}><div className="catalog-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button></div>{children}</div></div>;
}

export function Pagination({ page, count, onPage, busy = false }: { page: number; count: number; onPage: (page: number) => void; busy?: boolean }) {
  return <div className="catalog-pagination"><span>{count} registros · página {page + 1} de {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span><div>
    <button type="button" className="catalog-button" disabled={busy || page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
    <button type="button" className="catalog-button" disabled={busy || (page + 1) * PAGE_SIZE >= count} onClick={() => onPage(page + 1)}>Siguiente</button>
  </div></div>;
}

export function FormActions({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return <div className="catalog-actions"><button type="button" className="catalog-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="add-user-button" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>;
}
