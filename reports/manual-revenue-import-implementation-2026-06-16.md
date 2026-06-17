# Implementacao - Importacao Manual Receita/e-CAC - 2026-06-16

## Auditoria inicial

A tela `/gov/receita-federal` ainda nao possuia modalidade funcional de importacao manual gratuita. Havia modos Serpro gerenciado e direto, mas nao havia upload em lote de documentos baixados manualmente do e-CAC.

## Implementado

- Modalidade `manual_revenue_import`.
- Campo `access_mode = manual_free`.
- Upload multiplo na tela Receita Federal.
- Previa antes da confirmacao.
- Confirmacao de lote.
- Suporte inicial a PDF, XML, JSON, CSV e ZIP.
- Extracao segura de ZIP sem path traversal.
- Bloqueio de extensoes perigosas.
- Hash SHA-256 por documento.
- Deteccao de duplicidade por hash.
- Identificacao inicial por regex/metadados/nome do arquivo.
- Vinculo automatico por CPF/CNPJ quando existe exatamente um cliente.
- Correcao manual de cliente, tipo e competencia na previa.
- Armazenamento no Supabase Storage privado `revenue-documents`.
- Registro em `serpro_documents`.
- Registro de lote e itens.
- Sem uso de API Serpro.
- Sem consumo de creditos.

## Arquivos principais

- `supabase/migrations/20260616_manual_revenue_import.sql`
- `backend/nfe-api/Services/ManualRevenueImportService.cs`
- `backend/nfe-api/Services/ManualRevenueImportRules.cs`
- `backend/nfe-api.tests/ManualRevenueImportRulesTests.cs`
- `src/pages/accounting/settings/RevenueFederalSettings.tsx`
- `src/services/serproService.ts`
- `docs/integrations/manual-revenue-import.md`

## Observacoes

PDF usa texto nativo/best-effort. OCR nao foi usado como primeira opcao. XLSX e TXT ficaram preparados conceitualmente, mas nao habilitados nesta fase.
