alter table public.clients
  add column if not exists tax_regime text not null default 'Nao informado',
  add column if not exists company_size text not null default 'Nao informado',
  add column if not exists main_cnae text not null default '',
  add column if not exists legal_nature text not null default '';

comment on column public.clients.tax_regime is
  'Regime tributario do cliente: MEI, Simples Nacional, Lucro Presumido, Lucro Real, Imune, Isento, Produtor Rural ou Outros.';

comment on column public.clients.company_size is
  'Porte/enquadramento do cliente: MEI, ME, EPP, Medio porte, Grande porte ou Demais.';

comment on column public.clients.main_cnae is
  'CNAE principal informado/importado para apoio fiscal.';

comment on column public.clients.legal_nature is
  'Natureza juridica da empresa cliente.';

create or replace function public.normalize_client_fields()
returns trigger
language plpgsql
as $$
begin
  new.cnpj := public.format_br_cnpj(new.cnpj);
  new.phone := public.format_br_phone(new.phone);
  new.cep := public.format_br_cep(new.cep);
  new.tax_regime := coalesce(nullif(new.tax_regime, ''), 'Nao informado');
  new.company_size := coalesce(nullif(new.company_size, ''), 'Nao informado');
  new.main_cnae := coalesce(new.main_cnae, '');
  new.legal_nature := coalesce(new.legal_nature, '');
  new.photo_data := nullif(new.photo_data, '');
  new.monthly_fee := coalesce(new.monthly_fee, 0);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_client_fields_trigger on public.clients;
create trigger normalize_client_fields_trigger
before insert or update on public.clients
for each row execute function public.normalize_client_fields();

notify pgrst, 'reload schema';
