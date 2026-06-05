create table if not exists public.omnichannel_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('telegram', 'whatsapp', 'instagram', 'facebook')),
  display_name text not null default '',
  status text not null default 'Nao configurado'
    check (status in ('Nao configurado', 'Configurando', 'Ativo', 'Falha')),
  webhook_url text not null default '',
  secret_reference text not null default '',
  config jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

comment on column public.omnichannel_channels.secret_reference is
  'Referencia do token/senha em backend/cofre seguro. Nao exponha token real no frontend.';

create table if not exists public.omnichannel_ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default '',
  role_title text not null default '',
  tone text not null default '',
  instructions text not null default '',
  can_send_documents boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omnichannel_message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null default '',
  trigger_phrase text not null default '',
  response_text text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omnichannel_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid references public.omnichannel_channels (id) on delete set null,
  provider text not null check (provider in ('telegram', 'whatsapp', 'instagram', 'facebook')),
  external_conversation_id text not null default '',
  contact_name text not null default '',
  contact_handle text not null default '',
  status text not null default 'Aberta'
    check (status in ('Aberta', 'Aguardando cliente', 'Resolvida', 'Pendente')),
  assigned_agent_id uuid references public.omnichannel_ai_agents (id) on delete set null,
  last_message_preview text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.omnichannel_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.omnichannel_conversations (id) on delete cascade,
  direction text not null check (direction in ('entrada', 'saida', 'agente')),
  sender_name text not null default '',
  body text not null default '',
  attachment_name text not null default '',
  attachment_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.omnichannel_document_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_name text not null,
  keywords text[] not null default '{}',
  source_hint text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_name)
);

create index if not exists omnichannel_channels_org_idx on public.omnichannel_channels (organization_id);
create index if not exists omnichannel_agents_org_idx on public.omnichannel_ai_agents (organization_id);
create index if not exists omnichannel_templates_org_idx on public.omnichannel_message_templates (organization_id);
create index if not exists omnichannel_conversations_org_idx on public.omnichannel_conversations (organization_id, last_message_at desc);
create index if not exists omnichannel_messages_conversation_idx on public.omnichannel_messages (conversation_id, created_at);
create index if not exists omnichannel_document_rules_org_idx on public.omnichannel_document_rules (organization_id);

alter table public.omnichannel_channels enable row level security;
alter table public.omnichannel_ai_agents enable row level security;
alter table public.omnichannel_message_templates enable row level security;
alter table public.omnichannel_conversations enable row level security;
alter table public.omnichannel_messages enable row level security;
alter table public.omnichannel_document_rules enable row level security;

drop policy if exists "Organization access omnichannel channels" on public.omnichannel_channels;
create policy "Organization access omnichannel channels" on public.omnichannel_channels
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access omnichannel agents" on public.omnichannel_ai_agents;
create policy "Organization access omnichannel agents" on public.omnichannel_ai_agents
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access omnichannel templates" on public.omnichannel_message_templates;
create policy "Organization access omnichannel templates" on public.omnichannel_message_templates
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access omnichannel conversations" on public.omnichannel_conversations;
create policy "Organization access omnichannel conversations" on public.omnichannel_conversations
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access omnichannel messages" on public.omnichannel_messages;
create policy "Organization access omnichannel messages" on public.omnichannel_messages
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access omnichannel document rules" on public.omnichannel_document_rules;
create policy "Organization access omnichannel document rules" on public.omnichannel_document_rules
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

insert into public.omnichannel_ai_agents (
  organization_id,
  name,
  role_title,
  tone,
  instructions,
  can_send_documents,
  active
)
select
  o.id,
  'Agente contabil',
  'Atendimento inicial',
  'Profissional, claro e cordial',
  'Receba o cliente, identifique o pedido, procure documentos disponiveis no sistema e encaminhe para atendimento humano quando nao tiver certeza.',
  true,
  true
from public.organizations o
where not exists (
  select 1
  from public.omnichannel_ai_agents a
  where a.organization_id = o.id
);

insert into public.omnichannel_message_templates (
  organization_id,
  title,
  trigger_phrase,
  response_text,
  sort_order,
  active
)
select
  o.id,
  'Saudacao inicial',
  'Bom dia',
  'Bom dia, tudo bem? Como posso te ajudar hoje?' || chr(10) || chr(10) ||
  '1 - Guias e impostos' || chr(10) ||
  '2 - Notas fiscais' || chr(10) ||
  '3 - Folha / holerite' || chr(10) ||
  '4 - Contrato social' || chr(10) ||
  '5 - Certidoes' || chr(10) ||
  '6 - Falar com atendente',
  1,
  true
from public.organizations o
where not exists (
  select 1
  from public.omnichannel_message_templates t
  where t.organization_id = o.id
);

insert into public.omnichannel_document_rules (organization_id, document_name, keywords, source_hint)
select o.id, item.document_name, item.keywords, item.source_hint
from public.organizations o
cross join (
  values
    ('DARF / DAS / GPS', array['darf', 'das', 'gps', 'guia', 'imposto'], 'Buscar em guias/impostos do cliente.'),
    ('Holerite / folha de pagamento', array['holerite', 'folha', 'pagamento'], 'Buscar em folha de pagamento.'),
    ('Pro-labore', array['pro-labore', 'prolabore', 'socio'], 'Buscar documentos de socios/pro-labore.'),
    ('Notas fiscais', array['nfe', 'nota fiscal', 'nf-e'], 'Buscar em NF-e/SEFAZ.'),
    ('Contrato social', array['contrato social'], 'Buscar nos documentos da empresa.'),
    ('CNPJ / cartao CNPJ', array['cnpj', 'cartao cnpj'], 'Buscar no cadastro/documentos da empresa.'),
    ('Certidoes negativas', array['certidao', 'certidoes', 'negativa'], 'Buscar em documentos fiscais.'),
    ('Balanco patrimonial', array['balanco', 'balanco patrimonial'], 'Buscar em relatorios contabeis.'),
    ('DRE', array['dre', 'resultado'], 'Buscar em demonstrativos.'),
    ('Declaracao de faturamento', array['faturamento', 'declaracao'], 'Buscar em relatorios/faturamento.'),
    ('IRPF / IRPJ', array['irpf', 'irpj', 'imposto de renda'], 'Buscar em declaracoes.'),
    ('Comprovantes de impostos pagos', array['comprovante', 'imposto pago'], 'Buscar em pagamentos/impostos.'),
    ('Livro caixa', array['livro caixa'], 'Buscar em financeiro/livro caixa.'),
    ('Guias de FGTS e INSS', array['fgts', 'inss', 'guia'], 'Buscar em folha/impostos.')
) as item(document_name, keywords, source_hint)
on conflict (organization_id, document_name) do nothing;

notify pgrst, 'reload schema';
