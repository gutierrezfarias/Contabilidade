-- Testes manuais de isolamento RLS fiscal.
-- Execute em ambiente de teste com dois usuarios autenticados e duas organizacoes.
-- Este roteiro nao desabilita RLS e nao usa service role.

-- Preparacao esperada:
-- 1. user_a pertence apenas a org_a.
-- 2. user_b pertence apenas a org_b.
-- 3. client_a pertence a org_a.
-- 4. client_b pertence a org_b.
-- 5. Existem registros fiscais nas duas organizacoes.

-- Como testar no SQL Editor:
-- Substitua os valores abaixo e rode cada bloco usando o JWT do usuario no painel/API.
-- O resultado esperado para acessos cruzados e zero linha.

-- A. user_a deve ler apenas perfil fiscal da org_a/client_a.
select id, organization_id, client_id
from public.fiscal_company_profiles
where organization_id = :'org_a'
  and client_id = :'client_a';

-- B. user_a NAO deve ler perfil fiscal da org_b/client_b.
select id, organization_id, client_id
from public.fiscal_company_profiles
where organization_id = :'org_b'
  and client_id = :'client_b';

-- C. user_a NAO deve atualizar produto fiscal da org_b mesmo conhecendo o id.
update public.fiscal_products
set notes = 'tentativa cross-org bloqueada por RLS'
where id = :'product_b_id'
returning id, organization_id, client_id;

-- D. user_a NAO deve atualizar regra fiscal da org_b mesmo conhecendo o id.
update public.fiscal_rules
set notes = 'tentativa cross-org bloqueada por RLS'
where id = :'rule_b_id'
returning id, organization_id, client_id;

-- E. user_a NAO deve inserir conflito fiscal apontando org_b/client_b.
insert into public.fiscal_rule_conflicts (
  organization_id,
  client_id,
  rule_id,
  conflicting_rule_id,
  reason,
  conflict_key
) values (
  :'org_b',
  :'client_b',
  :'rule_b_id',
  :'rule_b_2_id',
  'teste cross-org',
  'rls-cross-org-test'
)
returning id;

-- F. user_a deve ler auditoria apenas da propria organizacao.
select id, organization_id, client_id, entity_type, action
from public.fiscal_audit_logs
where organization_id = :'org_a'
order by created_at desc
limit 20;

-- G. user_a NAO deve ler auditoria da org_b.
select id, organization_id, client_id, entity_type, action
from public.fiscal_audit_logs
where organization_id = :'org_b'
order by created_at desc
limit 20;

-- Resultado esperado:
-- B, C, D, E e G retornam zero linha ou erro de permissao.
-- A e F retornam apenas dados da org_a.
