# SEFAZ/DF-e - ajuste de experiencia, NSU e cooldown

Data: 2026-06-17

## Resumo executivo

Foi corrigida a experiencia da tela SEFAZ/DF-e para explicar melhor a diferenca entre resumo DF-e, XML completo e DANFE. A tela tambem passou a usar o estado real de NSU salvo no Supabase para nao exibir indevidamente a mensagem de primeira consulta/NSU zero quando ja existe sincronizacao.

Nenhuma migration foi criada. Nao houve alteracao em certificado, senha, XMLs, NSU salvo, backend fiscal ou fluxo de comunicacao real com a SEFAZ.

## O que foi implementado

- Removida a mensagem fixa "Ultimo NSU nao encontrado" quando ja existe controle de NSU.
- O validador agora recebe `dfeSyncState` e mostra mensagens diferentes para:
  - primeira sincronizacao ainda nao realizada;
  - controle NSU carregado sem documentos;
  - controle NSU sequencial;
  - cooldown/intervalo obrigatorio da SEFAZ.
- O frontend agora busca `nfe_dfe_sync_states` pelo escopo correto:
  - `organization_id`;
  - `client_id`;
  - `certificate_id`;
  - `environment`;
  - `cnpj`.
- A tela SEFAZ ganhou cards de contagem para:
  - resumo DF-e;
  - XML completo;
  - eventos;
  - manifestacoes pendentes.
- A grade de notas agora mostra badge de arquivo:
  - `Resumo DF-e`;
  - `XML completo`;
  - `Sem XML`.
- DANFE fica indisponivel quando o documento e apenas resumo DF-e.
- Download de XML diferencia:
  - `Resumo XML`;
  - `XML completo`.
- O download de XML foi corrigido para aceitar resposta `application/xml` do backend, alem de JSON.
- Botoes de consulta ficam bloqueados durante cooldown com explicacao visual.
- O botao `Atualizar NSU` foi substituido por `Diagnosticar NSU`, sem chamada real para a SEFAZ.
- A aba Status recebeu diagnostico de escopo, sequencia NSU e cooldown sem executar nova consulta.

## Arquivos alterados

- `src/pages/accounting/gov/Sefaz.tsx`
- `src/components/sefaz/NfeDfeSearchPanel.tsx`
- `src/components/sefaz/NfeNsuStatusCard.tsx`
- `src/services/nfeValidationService.ts`
- `src/services/sefazDocumentService.ts`
- `src/types/accounting.ts`
- `src/types/nfe.ts`

## Validacoes executadas

| Comando | Resultado |
| --- | --- |
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore` | Falhou por DLL Debug bloqueada por processo `.NET Host` ativo |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou: 118 testes |

## Observacoes tecnicas

- O erro de build Debug nao indica erro de codigo: o arquivo `backend\nfe-api\obj\Debug\net8.0\ContHub.NfeApi.dll` estava em uso por um processo `.NET Host`.
- O build em Release validou a compilacao do backend sem erros.
- A tela nao reinicia NSU e nao cria chamada real adicional quando detecta cooldown.
- A mensagem de consumo indevido/cStat 656 agora e traduzida para uma explicacao operacional para o usuario, mantendo detalhes tecnicos seguros.

## Proxima fase recomendada

1. Validar em producao com um documento que tenha apenas resumo DF-e e outro com XML completo.
2. Confirmar se o backend retorna `xml_storage_path` para resumos e XMLs completos em todos os cenarios.
3. Se necessario, adicionar uma acao futura para transformar resumo em XML completo via manifestacao/consulta por chave, sempre respeitando as regras da SEFAZ.
