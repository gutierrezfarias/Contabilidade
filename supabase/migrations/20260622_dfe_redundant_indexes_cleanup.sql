-- CONT HUB - limpeza de índices DF-e redundantes.
-- Seguro e idempotente: não remove dados ou constraints.

DROP INDEX IF EXISTS public.nfe_dfe_documents_unique_access_schema_idx;
DROP INDEX IF EXISTS public.nfe_dfe_documents_unique_logical_access_key_idx;
DROP INDEX IF EXISTS public.nfe_dfe_documents_filters_idx;

NOTIFY pgrst, 'reload schema';
