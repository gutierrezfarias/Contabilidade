# Integracao NetSpeed no CONT HUB

## Objetivo

A Central de Integracoes Contabeis prepara o CONT HUB para receber dados vindos do NetSpeed e de outros sistemas contabeis, sem transformar o CONT HUB em um motor contabil completo.

O CONT HUB deve importar, organizar, auditar e exibir resultados como guias, impostos, obrigacoes, documentos, folha e demonstrativos.

## Estado atual

O provider `NetSpeedProvider` existe como adaptador, mas fica em modo seguro ate existir documentacao oficial da NetSpeed.

O sistema nao inventa endpoints, parametros, banco interno ou contrato privado da NetSpeed.

## Formas suportadas nesta fase

- Importacao manual por CSV.
- Importacao manual por JSON.
- Cadastro de integracao NetSpeed em modo `not_configured` ou `configured_pending_contract`.
- Vinculo entre empresa externa e cliente cadastrado no CONT HUB.
- Historico de sincronizacao, diagnostico e auditoria.

## O que falta para integracao real via API

Solicitar oficialmente a NetSpeed:

- Base URL de homologacao e producao.
- Metodo de autenticacao.
- Endpoints para clientes/empresas.
- Endpoints para guias, impostos, documentos, folha e obrigacoes.
- Limites de requisicao.
- Politica de webhooks ou sincronizacao incremental.
- Campos obrigatorios e exemplos de payload.
- Permissao contratual para integracao.

Com isso em maos, implemente um provider real dentro de:

`backend/nfe-api/Services/AccountingIntegrationProviders.cs`

## Seguranca

- Credenciais nao devem ficar expostas no frontend.
- A tela aceita apenas referencia segura do segredo.
- Cada contador acessa somente sua propria `organization_id`.
- Os dados importados usam RLS e auditoria no Supabase.

## Recomendacao inicial

Use exportacao CSV/JSON do NetSpeed e importe pelo provider manual enquanto a API oficial nao estiver contratada/documentada.
