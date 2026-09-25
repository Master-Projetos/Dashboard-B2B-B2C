-- Login do painel: quem pode entrar, quem aprova e o que cada um pode mudar.
--
-- Qualquer pessoa com e-mail @soumaster.com.br pede acesso (nome, e-mail e
-- senha). O pedido fica "pendente" até um admin aprovar ou recusar.
--
-- Papéis:
--   master — a primeira conta do projeto (hoje eduardo.chaves). Admin para
--            sempre; ninguém mexe nela; só ela promove, rebaixa, remove ou
--            exclui outros admins.
--   admin  — aprova, recusa, remove e exclui quem não é admin.
--   membro — vê o painel e cuida da própria conta (e-mail, senha e tema).
--
-- O site só lê a tabela; toda mudança passa pelas funções abaixo, que
-- conferem quem está pedindo. Rodar de novo é seguro.

-- ===== Tabela =====

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovado', 'recusado')),
  admin boolean not null default false,
  master boolean not null default false,
  tema text not null default 'claro',
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid
);

-- Colunas que entraram depois da primeira versão.
alter table public.perfis add column if not exists master boolean not null default false;
alter table public.perfis add column if not exists tema text not null default 'claro';

alter table public.perfis drop constraint if exists perfis_tema_valido;
alter table public.perfis add constraint perfis_tema_valido check (tema in ('claro', 'escuro', 'sistema'));

-- Apagar quem aprovou não pode travar: o registro de quem decidiu só esvazia.
alter table public.perfis drop constraint if exists perfis_decidido_por_fkey;
alter table public.perfis add constraint perfis_decidido_por_fkey
  foreign key (decidido_por) references auth.users (id) on delete set null;

-- Uma master só. Se ainda não houver, é a conta mais antiga.
create unique index if not exists perfis_uma_master on public.perfis (master) where master;

update public.perfis
   set master = true, admin = true, situacao = 'aprovado'
 where id = (select id from public.perfis order by criado_em limit 1)
   and not exists (select 1 from public.perfis where master);

alter table public.perfis enable row level security;

revoke insert, update, delete on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;

-- ===== Quem é quem =====

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from perfis where id = auth.uid() and admin and situacao = 'aprovado');
$$;

create or replace function public.eh_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from perfis where id = auth.uid() and master);
$$;

drop policy if exists "ve o proprio perfil" on public.perfis;
create policy "ve o proprio perfil" on public.perfis
  for select to authenticated using (id = auth.uid());

drop policy if exists "admin ve todos" on public.perfis;
create policy "admin ve todos" on public.perfis
  for select to authenticated using (public.eh_admin());

-- ===== Cadastro =====

-- Só @soumaster.com.br, venha o cadastro por onde vier.
create or replace function public.conferir_dominio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) not like '%@soumaster.com.br' then
    raise exception 'Somente e-mails @soumaster.com.br podem se cadastrar';
  end if;
  return new;
end;
$$;

drop trigger if exists conferir_dominio on auth.users;
create trigger conferir_dominio
  before insert on auth.users
  for each row execute function public.conferir_dominio();

-- Todo cadastro ganha um perfil pendente. O primeiro do projeto nasce master.
-- A trava evita que dois cadastros simultâneos virem master juntos.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primeiro boolean;
begin
  perform pg_advisory_xact_lock(hashtext('perfis-primeiro'));
  select not exists (select 1 from perfis) into primeiro;

  insert into perfis (id, nome, email, situacao, admin, master)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when primeiro then 'aprovado' else 'pendente' end,
    primeiro,
    primeiro
  );
  return new;
end;
$$;

drop trigger if exists criar_perfil on auth.users;
create trigger criar_perfil
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Pedido de acesso sem e-mail de confirmação.
--
-- O cadastro padrão do Supabase manda um e-mail de confirmação a cada conta,
-- e o servidor de e-mail padrão aceita poucos envios por hora: a partir do
-- terceiro cadastro dava "email rate limit exceeded". Aqui quem confirma é o
-- admin, então a conta nasce confirmada e nenhum e-mail sai. Os gatilhos
-- acima continuam valendo: domínio conferido e perfil pendente.
create or replace function public.pedir_acesso(nome text, email text, senha text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  novo_id uuid := gen_random_uuid();
  email_limpo text := lower(trim(email));
begin
  if coalesce(trim(nome), '') = '' then
    raise exception 'Informe seu nome';
  end if;
  if email_limpo !~ '^[a-z0-9._%+-]+@soumaster\.com\.br$' then
    raise exception 'Somente e-mails @soumaster.com.br podem se cadastrar';
  end if;
  if length(coalesce(senha, '')) < 6 then
    raise exception 'A senha precisa de pelo menos 6 caracteres';
  end if;
  if exists (select 1 from auth.users where lower(auth.users.email) = email_limpo) then
    raise exception 'Este e-mail já tem cadastro';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', novo_id, 'authenticated', 'authenticated', email_limpo,
    crypt(senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', trim(nome)), now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (
    gen_random_uuid(), novo_id, novo_id::text,
    jsonb_build_object('sub', novo_id::text, 'email', email_limpo, 'email_verified', true),
    'email', now(), now()
  );
end;
$$;

-- ===== Ações do admin =====

-- Regra comum a toda ação sobre outra pessoa: quem pede é admin, não mexe em
-- si mesmo, ninguém mexe na master, e só a master mexe em outros admins.
create or replace function public.conferir_quem_decide(usuario uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  alvo perfis;
begin
  if not public.eh_admin() then
    raise exception 'Só o admin pode fazer isso';
  end if;
  if usuario = auth.uid() then
    raise exception 'Ninguém mexe no próprio acesso';
  end if;

  select * into alvo from perfis where id = usuario;
  if alvo.master then
    raise exception 'A conta master não pode ser alterada';
  end if;
  if alvo.admin and not public.eh_master() then
    raise exception 'Só a conta master mexe em outros admins';
  end if;
end;
$$;

-- Aprovar ou recusar. Tirar o acesso também tira o admin.
create or replace function public.decidir_acesso(usuario uuid, aprovar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.conferir_quem_decide(usuario);

  update perfis
     set situacao = case when aprovar then 'aprovado' else 'recusado' end,
         admin = case when aprovar then admin else false end,
         decidido_em = now(),
         decidido_por = auth.uid()
   where id = usuario;
end;
$$;

-- Promover ou rebaixar: só a master, e só quem está aprovado vira admin.
create or replace function public.definir_admin(usuario uuid, tornar_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_master() then
    raise exception 'Só a conta master promove ou rebaixa admins';
  end if;
  perform public.conferir_quem_decide(usuario);
  if tornar_admin and not exists (select 1 from perfis where id = usuario and situacao = 'aprovado') then
    raise exception 'Só membros aprovados podem virar admin';
  end if;

  update perfis
     set admin = tornar_admin, decidido_em = now(), decidido_por = auth.uid()
   where id = usuario;
end;
$$;

-- Excluir o cadastro de vez (conta e perfil). A pessoa pode pedir de novo.
create or replace function public.excluir_membro(usuario uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.conferir_quem_decide(usuario);
  delete from auth.users where id = usuario;
end;
$$;

-- ===== A própria conta =====

-- Tema salvo na conta: vale em qualquer computador em que a pessoa entrar.
create or replace function public.salvar_tema(tema text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre para salvar o tema';
  end if;
  update perfis set tema = salvar_tema.tema where id = auth.uid();
end;
$$;

-- Nome que aparece no painel e na lista de membros.
create or replace function public.alterar_meu_nome(novo_nome text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre para alterar o nome';
  end if;
  if length(trim(coalesce(novo_nome, ''))) < 2 then
    raise exception 'Informe seu nome';
  end if;

  update perfis set nome = trim(novo_nome) where id = auth.uid();
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', trim(novo_nome))
   where id = auth.uid();
end;
$$;

-- Troca do e-mail sem e-mail de confirmação (mesmo motivo do pedir_acesso).
-- Pede a senha atual para ninguém trocar numa sessão esquecida aberta.
create or replace function public.alterar_meu_email(novo_email text, senha_atual text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  email_limpo text := lower(trim(novo_email));
begin
  if auth.uid() is null then
    raise exception 'Entre para alterar o e-mail';
  end if;
  if not exists (
    select 1 from auth.users where id = auth.uid() and encrypted_password = crypt(senha_atual, encrypted_password)
  ) then
    raise exception 'Senha atual incorreta';
  end if;
  if email_limpo !~ '^[a-z0-9._%+-]+@soumaster\.com\.br$' then
    raise exception 'Somente e-mails @soumaster.com.br';
  end if;
  if exists (select 1 from auth.users where lower(email) = email_limpo and id <> auth.uid()) then
    raise exception 'Este e-mail já tem cadastro';
  end if;

  update auth.users set email = email_limpo, updated_at = now() where id = auth.uid();
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', email_limpo), updated_at = now()
   where user_id = auth.uid() and provider = 'email';
  update perfis set email = email_limpo where id = auth.uid();
end;
$$;

-- Troca da senha, conferindo a atual.
create or replace function public.alterar_minha_senha(senha_atual text, nova_senha text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre para alterar a senha';
  end if;
  if not exists (
    select 1 from auth.users where id = auth.uid() and encrypted_password = crypt(senha_atual, encrypted_password)
  ) then
    raise exception 'Senha atual incorreta';
  end if;
  if length(coalesce(nova_senha, '')) < 6 then
    raise exception 'A senha precisa de pelo menos 6 caracteres';
  end if;

  update auth.users set encrypted_password = crypt(nova_senha, gen_salt('bf')), updated_at = now()
   where id = auth.uid();
end;
$$;

-- ===== Permissões das funções =====

revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;
revoke all on function public.eh_master() from public, anon;
grant execute on function public.eh_master() to authenticated;
revoke all on function public.conferir_quem_decide(uuid) from public, anon, authenticated;

revoke all on function public.pedir_acesso(text, text, text) from public;
grant execute on function public.pedir_acesso(text, text, text) to anon, authenticated;

revoke all on function public.decidir_acesso(uuid, boolean) from public, anon;
grant execute on function public.decidir_acesso(uuid, boolean) to authenticated;
revoke all on function public.definir_admin(uuid, boolean) from public, anon;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;
revoke all on function public.excluir_membro(uuid) from public, anon;
grant execute on function public.excluir_membro(uuid) to authenticated;

revoke all on function public.salvar_tema(text) from public, anon;
grant execute on function public.salvar_tema(text) to authenticated;
revoke all on function public.alterar_meu_email(text, text) from public, anon;
grant execute on function public.alterar_meu_email(text, text) to authenticated;
revoke all on function public.alterar_minha_senha(text, text) from public, anon;
grant execute on function public.alterar_minha_senha(text, text) to authenticated;
revoke all on function public.alterar_meu_nome(text) from public, anon;
grant execute on function public.alterar_meu_nome(text) to authenticated;
