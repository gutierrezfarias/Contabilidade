alter table public.digital_certificates
  add column if not exists certificate_password text not null default '';

comment on column public.digital_certificates.certificate_password is
  'MVP: senha do certificado informada pelo contador no cadastro. Para producao, recomenda-se criptografia e controle de acesso rigoroso.';

notify pgrst, 'reload schema';
