alter table public.digital_certificates
  add column if not exists certificate_file_name text not null default '',
  add column if not exists certificate_file_size integer not null default 0,
  add column if not exists certificate_file_data text;

comment on column public.digital_certificates.certificate_file_data is
  'MVP: certificado A1 PFX/P12 em data URL. Para producao, migrar para Storage/cofre criptografado e nunca salvar senha em texto.';

notify pgrst, 'reload schema';
