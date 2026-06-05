alter table public.clients
  add column if not exists neighborhood text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists photo_data text,
  add column if not exists is_monthly boolean not null default true,
  add column if not exists monthly_fee numeric(12,2) not null default 0;

alter table public.admin_client_profiles
  add column if not exists neighborhood text not null default '';

comment on column public.clients.photo_data is
  'Imagem do cliente/logotipo em data URL. Para arquivos maiores, migrar para Supabase Storage.';

create or replace function public.format_br_cnpj(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 14 then
    return regexp_replace(digits, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.format_br_phone(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 11 then
    return regexp_replace(digits, '^(\d{2})(\d{5})(\d{4})$', '(\1) \2-\3');
  end if;

  if length(digits) = 10 then
    return regexp_replace(digits, '^(\d{2})(\d{4})(\d{4})$', '(\1) \2-\3');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.format_br_cep(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 8 then
    return regexp_replace(digits, '^(\d{5})(\d{3})$', '\1-\2');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.normalize_client_fields()
returns trigger
language plpgsql
as $$
begin
  new.cnpj := public.format_br_cnpj(new.cnpj);
  new.phone := public.format_br_phone(new.phone);
  new.cep := public.format_br_cep(new.cep);
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
