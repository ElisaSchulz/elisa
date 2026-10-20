-- Schema do site da Elisa.
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run.
-- Depois rode supabase/seed.sql para carregar os 72 episódios e o primeiro conteúdo gratuito.
-- Pode rodar de novo sem problema: tudo usa "if not exists" ou "or replace".

-- ─────────────────────────────────────────────────────────────
-- Quem pode entrar na área logada
-- ─────────────────────────────────────────────────────────────
-- Só usuários listados aqui conseguem ler ou mudar os dados privados.
-- Mesmo que alguém consiga criar uma conta, sem estar nesta tabela não vê nada.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "admin ve a propria linha" on public.admins;
create policy "admin ve a propria linha" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Atualiza a coluna atualizado_em automaticamente
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Conteúdos gratuitos (página pública)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.conteudos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null default '',
  tipo text not null default 'ebook' check (tipo in ('ebook', 'guia', 'planilha', 'aula', 'artigo', 'link')),
  arquivo_url text not null,
  capa_url text,
  cor text not null default 'areia' check (cor in ('terracota', 'salvia', 'areia', 'rose', 'oliva')),
  publicado boolean not null default false,
  destaque boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.conteudos enable row level security;

drop trigger if exists conteudos_atualizado_em on public.conteudos;
create trigger conteudos_atualizado_em before update on public.conteudos
  for each row execute function public.tocar_atualizado_em();

drop policy if exists "todos leem conteudos publicados" on public.conteudos;
create policy "todos leem conteudos publicados" on public.conteudos
  for select to anon, authenticated using (publicado or public.is_admin());

drop policy if exists "admin gerencia conteudos" on public.conteudos;
create policy "admin gerencia conteudos" on public.conteudos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Cronograma de postagens (privado)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.episodios (
  id uuid primary key default gen_random_uuid(),
  mes int not null,
  tema_mes text not null default '',
  semana int not null,
  dia text not null check (dia in ('seg', 'qua', 'sex')),
  titulo text not null,
  subtitulo text not null default '',
  status text not null default 'ideia' check (status in ('ideia', 'roteiro', 'gravado', 'editado', 'publicado')),
  data_publicacao date,
  hook text not null default '',
  roteiro text not null default '',
  cta text not null default '',
  notas text not null default '',
  link_post text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (semana, dia)
);
alter table public.episodios enable row level security;

drop trigger if exists episodios_atualizado_em on public.episodios;
create trigger episodios_atualizado_em before update on public.episodios
  for each row execute function public.tocar_atualizado_em();

drop policy if exists "admin gerencia episodios" on public.episodios;
create policy "admin gerencia episodios" on public.episodios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Links úteis (privado): canvas da identidade, docs do curso etc.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  url text not null,
  categoria text not null default 'Outros',
  criado_em timestamptz not null default now()
);
alter table public.links enable row level security;

drop policy if exists "admin gerencia links" on public.links;
create policy "admin gerencia links" on public.links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Arquivos (Storage)
-- ─────────────────────────────────────────────────────────────
-- "documentos": privado, só a admin lê e escreve.
-- "conteudos-publicos": qualquer pessoa baixa, só a admin envia.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('conteudos-publicos', 'conteudos-publicos', true)
on conflict (id) do update set public = true;

drop policy if exists "admin gerencia documentos" on storage.objects;
create policy "admin gerencia documentos" on storage.objects
  for all to authenticated
  using (bucket_id = 'documentos' and public.is_admin())
  with check (bucket_id = 'documentos' and public.is_admin());

drop policy if exists "admin gerencia conteudos publicos" on storage.objects;
create policy "admin gerencia conteudos publicos" on storage.objects
  for all to authenticated
  using (bucket_id = 'conteudos-publicos' and public.is_admin())
  with check (bucket_id = 'conteudos-publicos' and public.is_admin());
