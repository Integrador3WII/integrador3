import { supabase } from './supabase';

export type AppRole = 'admin' | 'operator' | 'customer';

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserInput = {
  full_name: string;
  email?: string;
  phone?: string;
  role: AppRole;
  password?: string;
  is_active?: boolean;
};

async function invoke<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase no está configurado.');

  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      const payload = await error.context.json();
      message = payload.error ?? message;
    } catch {
      // The function can return a non-JSON transport error.
    }
    throw new Error(message);
  }

  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function listManagedUsers() {
  const data = await invoke<{ users: ManagedUser[] }>({ action: 'list' });
  return data.users;
}

export async function createManagedUser(input: Required<Pick<UserInput, 'email' | 'password'>> & UserInput) {
  const data = await invoke<{ user: ManagedUser }>({ action: 'create', ...input });
  return data.user;
}

export async function updateManagedUser(id: string, input: UserInput) {
  const data = await invoke<{ user: ManagedUser }>({ action: 'update', id, ...input });
  return data.user;
}

export async function deactivateManagedUser(id: string) {
  const data = await invoke<{ user: ManagedUser }>({ action: 'deactivate', id });
  return data.user;
}
