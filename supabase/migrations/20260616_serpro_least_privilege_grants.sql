-- CONT HUB - Serpro least-privilege table grants.
-- Idempotent and non-destructive. This hardens privileges after the Serpro
-- duplicate-prevention migration without changing data, RLS policies or
-- certificate/PFX/P12 flows.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'serpro_documents',
    'serpro_requests',
    'serpro_operation_locks',
    'serpro_wallet_transactions'
  ]
  loop
    execute format('revoke all privileges on table public.%I from anon', table_name);
    execute format('revoke all privileges on table public.%I from authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
    execute format('grant all privileges on table public.%I to postgres', table_name);
  end loop;
end $$;

-- Direct frontend reads, if needed, remain read-only and still constrained by RLS.
grant select on table public.serpro_documents to authenticated;
grant select on table public.serpro_requests to authenticated;
grant select on table public.serpro_wallet_transactions to authenticated;

-- Locks are backend-only. Do not grant privileges to anon/authenticated.
revoke all privileges on table public.serpro_operation_locks from anon;
revoke all privileges on table public.serpro_operation_locks from authenticated;

-- Keep RLS enabled and keep service operations backend-owned.
alter table public.serpro_documents enable row level security;
alter table public.serpro_requests enable row level security;
alter table public.serpro_operation_locks enable row level security;
alter table public.serpro_wallet_transactions enable row level security;

notify pgrst, 'reload schema';
