-- CONT HUB - Diagnostico seguro de estados DF-e/NSU.
-- Somente leitura. Nao corrige, nao apaga e nao altera dados.

select
  id,
  organization_id,
  client_id,
  certificate_id,
  cnpj,
  environment,
  last_nsu,
  max_nsu,
  status,
  last_status_code,
  last_status_message,
  next_allowed_sync_at,
  last_sync_at,
  updated_at,
  case
    when regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g') = ''
      then 'last_nsu preenchido e max_nsu vazio'
    when regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g') <> '000000000000000'
      and regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g') = '000000000000000'
      then 'last_nsu avancado com max_nsu zerado'
    when lpad(regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g'), 15, '0')
      > lpad(regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g'), 15, '0')
      then 'last_nsu maior que max_nsu'
    else 'ok'
  end as diagnostic_status
from public.nfe_dfe_sync_states
where
  (
    regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g') <> '000000000000000'
    and regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g') = '000000000000000'
  )
  or (
    regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g') <> ''
    and regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g') <> ''
    and lpad(regexp_replace(coalesce(last_nsu, ''), '\D', '', 'g'), 15, '0')
      > lpad(regexp_replace(coalesce(max_nsu, ''), '\D', '', 'g'), 15, '0')
  )
order by updated_at desc nulls last;
