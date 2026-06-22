# CONT HUB - Remediation Backlog

Data: 2026-06-21

## P0 - Seguranca, isolamento e perda de dados

1. Validar RLS/grants no Supabase live com diagnostico SQL somente leitura.
2. Criar testes SQL parametrizados para isolamento multiempresa e IDOR em staging/local.
3. Mapear segredos e impedir novos segredos em texto puro sem cofre.
4. Corrigir/fortalecer identidade DF-e para `organization_id + client_id + access_key`.

## P1 - Fiscal NF-e/DF-e

1. Expor no proxy Vercel os endpoints NF-e que ja existem no backend .NET.
2. Adicionar testes locais para DF-e: resumo/completo/idempotencia/eventos/cooldown/locks quando aplicavel.
3. Adicionar plano de homologacao NF-e real, sem marcar como testado localmente.
4. Ampliar testes do gate fiscal quando viavel sem SEFAZ.

## P2 - Funcoes essenciais do escritorio

1. Endurecer importacoes CSV/JSON/XLSX contra injection, duplicidade e falha por linha.
2. Completar admin pagamentos apos gateway real.
3. Exportacao de historico do cliente para troca de contador.

## P3 - Portal e experiencia

1. Publicacao/dominio real do Website Builder.
2. Estados vazios/loading/erros nos fluxos restantes.

## P4 - Funcionalidades adicionais

1. Psicologa IA fora do escopo desta execucao.
2. Ponto/folha fora do Cont Hub, apenas integracao futura.

## P5 - Dependencias externas

1. Serpro, Meta, gateway de pagamento e NetSpeed real permanecem bloqueados ate contrato, credenciais e documentacao oficial.

