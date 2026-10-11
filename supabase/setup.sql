create table if not exists public.tournament_user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role_name text not null check (role_name in ('manager', 'contestant')),
  display_name text not null,
  player_number integer,
  constraint contestant_has_player_number
    check (
      role_name <> 'contestant'
      or (player_number is not null and player_number between 1 and 7)
    )
);

create table if not exists public.tournament_app_state (
  id text primary key check (id = 'main'),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.tournament_user_roles enable row level security;
alter table public.tournament_app_state enable row level security;

drop policy if exists "Users can read their own tournament role"
  on public.tournament_user_roles;
create policy "Users can read their own tournament role"
  on public.tournament_user_roles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Tournament members can read shared state"
  on public.tournament_app_state;
create policy "Tournament members can read shared state"
  on public.tournament_app_state for select to authenticated
  using (
    exists (
      select 1 from public.tournament_user_roles
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Managers can create shared state"
  on public.tournament_app_state;
create policy "Managers can create shared state"
  on public.tournament_app_state for insert to authenticated
  with check (
    exists (
      select 1 from public.tournament_user_roles
      where user_id = (select auth.uid()) and role_name = 'manager'
    )
  );

drop policy if exists "Managers can update shared state"
  on public.tournament_app_state;
create policy "Managers can update shared state"
  on public.tournament_app_state for update to authenticated
  using (
    exists (
      select 1 from public.tournament_user_roles
      where user_id = (select auth.uid()) and role_name = 'manager'
    )
  )
  with check (
    exists (
      select 1 from public.tournament_user_roles
      where user_id = (select auth.uid()) and role_name = 'manager'
    )
  );

grant select on public.tournament_user_roles to authenticated;
grant select, insert, update on public.tournament_app_state to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_app_state'
  ) then
    alter publication supabase_realtime
      add table public.tournament_app_state;
  end if;
end
$$;

-- Create these two users in Supabase Auth first and confirm their accounts.
-- This maps the existing Auth users to the app's manager/contestant roles.
insert into public.tournament_user_roles
  (user_id, username, role_name, display_name, player_number)
select
  id,
  email,
  case when email = 'quanly@gmail.com' then 'manager' else 'contestant' end,
  case when email = 'quanly@gmail.com'
    then 'Quản lý'
    else 'Người chơi 1'
  end,
  case
    when email = 'quanly@gmail.com' then null
    else 1
  end
from auth.users
where email in (
  'quanly@gmail.com',
  'cothu@gmail.com'
)
on conflict (user_id) do update set
  username = excluded.username,
  role_name = excluded.role_name,
  display_name = excluded.display_name,
  player_number = excluded.player_number;
