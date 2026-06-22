# CONT HUB - Remaining Gaps

Data: 2026-06-21

## Lacunas criticas

1. Cofre/criptografia para certificado, senha e tokens.
2. Validacao live de RLS/grants no Supabase.
3. Homologacao NF-e 55 ponta a ponta.
4. Gateway de pagamento real.
5. Proxy Vercel nao expoe todos endpoints .NET historicos de NF-e.
6. Admin pagamentos ainda placeholder.
7. Exportacao/migracao completa de cliente entre contadores.

## Lacunas fiscais

- Massa de testes por UF/regime/NCM/CFOP.
- Validacao oficial de schemas XSD no ambiente publicado.
- Consulta emitidas: SEFAZ nao entrega historico completo de emitidas apenas pelo certificado; precisa XML/importacao/chave/emissao pelo sistema.
- NFS-e depende provedor municipal/nacional.

## Lacunas Receita/Serpro/e-CAC

- Serpro real depende contrato e credenciais.
- Modo manual existe para arquivos do e-CAC.
- Automacao de portal deve ser tratada com cuidado juridico/tecnico.

## Lacunas omnichannel

- Telegram parcial.
- WhatsApp/Instagram/Facebook dependem Meta API, app aprovado, webhook e tokens.
- Agentes IA nao devem acessar documentos sem politica granular e auditoria.

## Lacunas contabeis

- NetSpeed real bloqueado ate documentacao oficial.
- Importacao/exportacao por Excel/CSV precisa mais testes de seguranca, preview e historico.

## Atualizacao apos remediacao local de 2026-06-21

- Lacuna 5 foi corrigida localmente em `api/nfe/[action].ts`.
- RLS/grants e isolamento agora possuem diagnostico/checks SQL, mas ainda precisam ser executados no Supabase real.
- DF-e ganhou migration local para identidade `organization_id + client_id + access_key`; ainda precisa rodar no Supabase.
- Cofre/criptografia segue lacuna critica, apesar do novo mapa de segredos e provider backend para novos usos.
