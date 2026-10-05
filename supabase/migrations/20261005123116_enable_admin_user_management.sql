begin;

create index if not exists profiles_role_active_full_name_idx
  on public.profiles (role, is_active, full_name);

update public.profiles as profile
set role = 'admin'::public.app_role,
    is_active = true,
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = 'demo.textilflow@example.com';

commit;
