-- Nosso Bolso — banco de dados na nuvem (Supabase)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Pode ser executado mais de uma vez sem perder dados.

-- ============================================================ Tabelas

-- Espaço compartilhado do casal
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Quem faz parte de cada espaço (no máximo 2 pessoas; cada pessoa em 1 espaço)
create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.categories (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  icon text not null,
  name text not null,
  color text not null,
  nature text not null check (nature in ('fixo', 'variavel', 'receita')),
  budget numeric(12, 2) not null default 0 check (budget >= 0),
  position int not null default 0,
  primary key (household_id, id)
);

create table if not exists public.transactions (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  type text not null check (type in ('despesa', 'receita', 'acerto')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  date date not null,
  category_id text,
  paid_by text not null check (paid_by in ('p1', 'p2')),
  split text check (split in ('shared', 'p1', 'p2')),
  to_person text check (to_person in ('p1', 'p2')),
  note text not null default '',
  created_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
create index if not exists transactions_household_date_idx on public.transactions (household_id, date);

-- ============================================================ Funções auxiliares

-- Espaço do usuário logado (security definer evita recursão nas políticas)
create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

create or replace function public.is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = h and user_id = auth.uid())
$$;

-- ============================================================ Segurança (RLS)
-- Cada casal só enxerga e altera os próprios dados.

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "membros leem o espaço" on public.households;
create policy "membros leem o espaço" on public.households
  for select to authenticated using (public.is_member(id));

drop policy if exists "membros alteram o espaço" on public.households;
create policy "membros alteram o espaço" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "membros veem os membros" on public.household_members;
create policy "membros veem os membros" on public.household_members
  for select to authenticated using (public.is_member(household_id));

drop policy if exists "membros gerenciam categorias" on public.categories;
create policy "membros gerenciam categorias" on public.categories
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "membros gerenciam lançamentos" on public.transactions;
create policy "membros gerenciam lançamentos" on public.transactions
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Espaço e membros só mudam pelas funções abaixo
grant select, update (settings) on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.categories, public.transactions to authenticated;
revoke all on public.households, public.household_members, public.categories, public.transactions from anon;

-- ============================================================ Funções chamadas pelo app

-- Cria o espaço do casal para o usuário logado
create or replace function public.create_household(p_settings jsonb default '{}'::jsonb)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if public.my_household_id() is not null then raise exception 'Você já participa de um espaço.'; end if;
  insert into public.households (settings, created_by) values (coalesce(p_settings, '{}'::jsonb), auth.uid()) returning * into h;
  insert into public.household_members (household_id, user_id, email)
    values (h.id, auth.uid(), auth.jwt() ->> 'email');
  return h;
end $$;

-- Entra no espaço do par usando o código de convite
create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if public.my_household_id() is not null then raise exception 'Você já participa de um espaço.'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception 'Código de convite não encontrado.'; end if;
  if (select count(*) from public.household_members where household_id = h.id) >= 2 then
    raise exception 'Este espaço já tem duas pessoas.';
  end if;
  insert into public.household_members (household_id, user_id, email)
    values (h.id, auth.uid(), auth.jwt() ->> 'email');
  return h;
end $$;

-- Sai do espaço (o espaço é apagado quando não sobra ninguém)
create or replace function public.leave_household()
returns void language plpgsql security definer set search_path = public as $$
declare h uuid := public.my_household_id();
begin
  if h is null then return; end if;
  delete from public.household_members where household_id = h and user_id = auth.uid();
  if not exists (select 1 from public.household_members where household_id = h) then
    delete from public.households where id = h;
  end if;
end $$;

-- Todos os dados do espaço em uma única chamada (null se o usuário não tem espaço)
create or replace function public.get_household_data()
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when h.id is null then null else jsonb_build_object(
    'household', jsonb_build_object('id', h.id, 'invite_code', h.invite_code, 'settings', h.settings),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('email', m.email, 'me', m.user_id = auth.uid()) order by m.created_at), '[]')
                from public.household_members m where m.household_id = h.id),
    'categories', (select coalesce(jsonb_agg(to_jsonb(c) - 'household_id' order by c.position, c.name), '[]')
                   from public.categories c where c.household_id = h.id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) - 'household_id' - 'updated_at' order by t.date, t.created_at), '[]')
                     from public.transactions t where t.household_id = h.id)
  ) end
  from (select 1) x
  left join public.households h on h.id = public.my_household_id()
$$;

-- Substitui todos os dados do espaço (importar backup, dados de exemplo, apagar tudo)
create or replace function public.replace_household_data(p_settings jsonb, p_categories jsonb, p_transactions jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare h uuid := public.my_household_id();
begin
  if h is null then raise exception 'Você ainda não participa de um espaço.'; end if;
  update public.households set settings = coalesce(p_settings, settings) where id = h;
  delete from public.transactions where household_id = h;
  delete from public.categories where household_id = h;
  insert into public.categories (household_id, id, icon, name, color, nature, budget, position)
    select h, c.id, c.icon, c.name, c.color, c.nature, coalesce(c.budget, 0), coalesce(c.position, 0)
    from jsonb_to_recordset(coalesce(p_categories, '[]')) as c(id text, icon text, name text, color text, nature text, budget numeric, position int);
  insert into public.transactions (household_id, id, type, description, amount, date, category_id, paid_by, split, to_person, note, created_at)
    select h, t.id, t.type, t.description, t.amount, t.date, t.category_id, t.paid_by, t.split, t.to_person, coalesce(t.note, ''), coalesce(t.created_at, 0)
    from jsonb_to_recordset(coalesce(p_transactions, '[]')) as t(id text, type text, description text, amount numeric, date date,
      category_id text, paid_by text, split text, to_person text, note text, created_at bigint);
end $$;

revoke all on function public.my_household_id(), public.is_member(uuid), public.create_household(jsonb),
  public.join_household(text), public.leave_household(), public.get_household_data(),
  public.replace_household_data(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.my_household_id(), public.is_member(uuid), public.create_household(jsonb),
  public.join_household(text), public.leave_household(), public.get_household_data(),
  public.replace_household_data(jsonb, jsonb, jsonb) to authenticated;

-- ============================================================ Tempo real
-- Quando um dos dois lança algo, a tela do outro atualiza sozinha.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['households', 'household_members', 'categories', 'transactions'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
