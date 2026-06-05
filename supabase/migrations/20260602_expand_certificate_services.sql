alter table public.certificate_services
  drop constraint if exists certificate_services_service_code_check;

alter table public.certificate_services
  add constraint certificate_services_service_code_check
  check (
    service_code in (
      'nfe',
      'nfe_emissao',
      'nfe_consulta',
      'nfe_cancelamento',
      'nfe_cce',
      'nfe_inutilizacao',
      'nfce',
      'cte',
      'mdfe',
      'nfse',
      'dfe_distribuicao',
      'manifestacao_destinatario',
      'ecac',
      'ecac_caixa_postal',
      'ecac_situacao_fiscal',
      'ecac_certidoes',
      'ecac_processos_digitais',
      'ecac_dctfweb',
      'ecac_perdcomp',
      'sped_reinf',
      'simples_nacional'
    )
  );

notify pgrst, 'reload schema';
