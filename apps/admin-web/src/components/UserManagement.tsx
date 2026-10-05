import { FormEvent, useEffect, useState } from 'react';
import { createManagedUser, deactivateManagedUser, listManagedUsers, type AppRole, type ManagedUser, updateManagedUser } from '../lib/adminUsers';

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  role: AppRole;
  password: string;
  is_active: boolean;
};

const emptyForm: FormState = { full_name: '', email: '', phone: '', role: 'operator', password: '', is_active: true };

const roleLabel: Record<AppRole, string> = { admin: 'Administrador', operator: 'Operador', customer: 'Cliente' };

function toForm(user: ManagedUser): FormState {
  return { full_name: user.full_name ?? '', email: user.email, phone: user.phone ?? '', role: user.role, password: '', is_active: user.is_active };
}

function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ManagedUser | null | 'create'>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setUsers(await listManagedUsers());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  function openCreate() {
    setNotice('');
    setForm(emptyForm);
    setEditing('create');
  }

  function openEdit(user: ManagedUser) {
    setNotice('');
    setForm(toForm(user));
    setEditing(user);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing === 'create') {
        await createManagedUser({ ...form, email: form.email, password: form.password });
        setNotice('Usuario creado correctamente.');
      } else if (editing) {
        await updateManagedUser(editing.id, { ...form, password: form.password || undefined });
        setNotice('Usuario actualizado correctamente.');
      }
      setEditing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(user: ManagedUser) {
    setError('');
    setNotice('');
    try {
      await deactivateManagedUser(user.id);
      setNotice(`${user.full_name || user.email} fue desactivado.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo desactivar el usuario.');
    }
  }

  return (
    <section className="users-workspace" aria-labelledby="users-title">
      <header className="users-header">
        <div><p className="eyebrow">Accesos y permisos</p><h1 id="users-title">Usuarios <em>del equipo.</em></h1><p>Gestiona altas, permisos y estado de las cuentas internas.</p></div>
        <button className="add-user-button" type="button" onClick={openCreate}>+ Nuevo usuario</button>
      </header>

      {error && <div className="users-message error" role="alert">{error}</div>}
      {notice && <div className="users-message success" role="status">{notice}</div>}

      <div className="users-table-card">
        <div className="users-table-heading"><span>{loading ? 'Cargando usuarios…' : `${users.length} cuenta${users.length === 1 ? '' : 's'}`}</span><span>Las bajas son lógicas para preservar el historial.</span></div>
        <div className="users-table-scroll">
          <table className="users-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Teléfono</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {!loading && users.map((user) => <tr key={user.id}>
                <td><strong>{user.full_name || 'Sin nombre'}</strong><small>{user.email}</small></td>
                <td><span className={`role-chip ${user.role}`}>{roleLabel[user.role]}</span></td>
                <td>{user.phone || '—'}</td>
                <td><span className={`active-chip ${user.is_active ? 'active' : ''}`}>{user.is_active ? 'Activo' : 'Inactivo'}</span></td>
                <td><div className="row-actions"><button type="button" onClick={() => openEdit(user)}>Editar</button>{user.is_active && <button type="button" className="danger-action" onClick={() => void deactivate(user)}>Desactivar</button>}</div></td>
              </tr>)}
              {!loading && users.length === 0 && <tr><td colSpan={5} className="empty-users">No hay usuarios para mostrar.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <div className="modal-backdrop" role="presentation">
        <form className="user-form" onSubmit={submit} aria-label={editing === 'create' ? 'Crear usuario' : 'Editar usuario'}>
          <div className="form-heading"><div><p className="eyebrow">{editing === 'create' ? 'Nueva cuenta' : 'Editar acceso'}</p><h2>{editing === 'create' ? 'Agregar usuario' : 'Actualizar usuario'}</h2></div><button type="button" className="close-modal" onClick={() => setEditing(null)} aria-label="Cerrar">×</button></div>
          <label>Nombre completo<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} minLength={2} maxLength={120} required /></label>
          <label>Correo electrónico<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <div className="form-row"><label>Rol<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}><option value="operator">Operador</option><option value="admin">Administrador</option><option value="customer">Cliente</option></select></label><label>Teléfono<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} /></label></div>
          <label>{editing === 'create' ? 'Contraseña' : 'Nueva contraseña (opcional)'}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={editing === 'create' ? 10 : undefined} required={editing === 'create'} /></label>
          {editing !== 'create' && <label className="active-field"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Cuenta activa</label>}
          <div className="form-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="add-user-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </form>
      </div>}
    </section>
  );
}

export default UserManagement;
