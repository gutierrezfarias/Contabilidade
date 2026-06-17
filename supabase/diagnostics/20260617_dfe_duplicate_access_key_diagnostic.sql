-- CONT HUB - DF-e duplicate diagnostic.
-- Read-only diagnostic for summary/full XML duplicate analysis.

select
  organization_id,
  client_id,
  access_key,
  count(*) as records,
  count(*) filter (where has_full_xml) as full_xml_records,
  array_agg(id order by has_full_xml desc, updated_at desc, created_at desc) as document_ids,
  array_agg(schema_name order by has_full_xml desc, updated_at desc, created_at desc) as schemas,
  array_agg(document_type order by has_full_xml desc, updated_at desc, created_at desc) as document_types,
  array_agg(xml_storage_path order by has_full_xml desc, updated_at desc, created_at desc) as storage_paths
from public.nfe_dfe_documents
where coalesce(access_key, '') <> ''
group by organization_id, client_id, access_key
having count(*) > 1
order by records desc, access_key;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'nfe_dfe_documents'
  and (
    indexname ilike '%access%'
    or indexname ilike '%chave%'
    or indexname ilike '%xml_hash%'
    or indexname ilike '%nsu%'
  )
order by indexname;
