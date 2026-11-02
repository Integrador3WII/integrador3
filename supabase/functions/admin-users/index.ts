import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type AppRole = 'admin' | 'operator' | 'customer';
type Action = 'list' | 'create' | 'update' | 'deactivate';

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const roles = new Set<AppRole>(['admin', 'operator', 'customer']);

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function respond(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function requiredString(value: unknown, field: string, maxLength = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`El campo ${field} no es válido.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength = 120) {
  if (value === undefined || value === null || value === '') return null;
  return requiredString(value, field, maxLength);
}

function roleFrom(value: unknown): AppRole {
  if (typeof value !== 'string' || !roles.has(value as AppRole)) {
    throw new Error('El rol seleccionado no es válido.');
  }
  return value as AppRole;
}

function emailFrom(value: unknown) {
  const email = requiredString(value, 'correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo no es válido.');
  return email;
}

function passwordFrom(value: unknown, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('La contraseña es obligatoria para crear un usuario.');
    return undefined;
  }
  if (typeof value !== 'string' || value.length < 10 || value.length > 72) {
    throw new Error('La contraseña debe tener entre 10 y 72 caracteres.');
  }
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return respond(request, 405, { error: 'Método no permitido.' });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!serviceRoleKey || !supabaseUrl) return respond(request, 500, { error: 'Configuración segura incompleta.' });

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return respond(request, 401, { error: 'Sesión no válida.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return respond(request, 401, { error: 'Sesión no válida.' });

  const { data: callerProfile, error: callerError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single();

  if (callerError || callerProfile?.role !== 'admin' || !callerProfile.is_active) {
    return respond(request, 403, { error: 'Solo una cuenta administradora puede gestionar usuarios.' });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return respond(request, 400, { error: 'La solicitud no contiene datos válidos.' });
  }

  const action = input.action as Action;
  if (!['list', 'create', 'update', 'deactivate'].includes(action)) {
    return respond(request, 400, { error: 'Acción no permitida.' });
  }

  try {
    if (action === 'list') {
      const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, phone, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((profile) => profile.id);
      const { data: users, error: usersError } = ids.length
        ? await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        : { data: { users: [] }, error: null };
      if (usersError) throw usersError;

      const emailById = new Map(users.users.map((user) => [user.id, user.email ?? '']));
      return respond(request, 200, { users: (data ?? []).map((profile) => ({ ...profile, email: emailById.get(profile.id) ?? '' })) });
    }

    const userId = action === 'create' ? undefined : requiredString(input.id, 'id', 36);
    if (userId === authData.user.id && action !== 'update') {
      return respond(request, 400, { error: 'No puedes desactivar tu propia cuenta.' });
    }

    if (action === 'create') {
      const fullName = requiredString(input.full_name, 'nombre completo');
      const email = emailFrom(input.email);
      const password = passwordFrom(input.password, true)!;
      const role = roleFrom(input.role);
      const phone = optionalString(input.phone, 'teléfono', 30);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) throw createError ?? new Error('No se pudo crear el usuario.');

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .update({ full_name: fullName, phone, role, is_active: true })
        .eq('id', created.user.id)
        .select('id, full_name, phone, role, is_active, created_at, updated_at')
        .single();
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return respond(request, 201, { user: { ...profile, email } });
    }

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userId)
      .single();
    if (targetError || !target) return respond(request, 404, { error: 'Usuario no encontrado.' });

    const requestedRole = input.role === undefined ? target.role as AppRole : roleFrom(input.role);
    const requestedActive = action === 'deactivate' ? false : input.is_active === undefined ? target.is_active : Boolean(input.is_active);
    if (userId === authData.user.id && (requestedRole !== 'admin' || !requestedActive)) {
      return respond(request, 400, { error: 'No puedes quitarte permisos ni desactivar tu propia cuenta.' });
    }

    if (target.role === 'admin' && target.is_active && (requestedRole !== 'admin' || !requestedActive)) {
      const { count, error: adminCountError } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);
      if (adminCountError) throw adminCountError;
      if ((count ?? 0) <= 1) return respond(request, 400, { error: 'Debe permanecer al menos una cuenta administradora activa.' });
    }

    const fullName = input.full_name === undefined ? undefined : requiredString(input.full_name, 'nombre completo');
    const phone = input.phone === undefined ? undefined : optionalString(input.phone, 'teléfono', 30);
    const email = input.email === undefined ? undefined : emailFrom(input.email);
    const password = passwordFrom(input.password);
    const authUpdates: Record<string, unknown> = { ban_duration: requestedActive ? 'none' : '876000h' };
    if (email) { authUpdates.email = email; authUpdates.email_confirm = true; }
    if (password) authUpdates.password = password;

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId!, authUpdates);
    if (authUpdateError) throw authUpdateError;

    const update: Record<string, unknown> = { role: requestedRole, is_active: requestedActive };
    if (fullName !== undefined) update.full_name = fullName;
    if (phone !== undefined) update.phone = phone;
    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select('id, full_name, phone, role, is_active, created_at, updated_at')
      .single();
    if (updateError) throw updateError;

    return respond(request, 200, { user: { ...profile, email: email ?? '' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la operación.';
    return respond(request, 400, { error: message });
  }
});
