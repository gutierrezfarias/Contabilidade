# CONT HUB - mapa de segredos

Data: 2026-06-21

Este mapa separa o que ja esta protegido por ambiente/backend do que ainda esta em modo MVP. Nao inclui valores de segredos.

| Segredo | Local atual | Classificacao | Risco | Acao |
| --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel/Railway env e backend .NET | env/backend only | Alto se exposto | Manter somente em backend/API server-side. Nunca enviar ao browser. |
| Certificado A1/PFX/P12 | `digital_certificates.certificate_file_data` | DB plaintext/data URL MVP | Alto | Migrar para Storage privado/cofre com leitura somente pelo backend fiscal. |
| Senha do certificado | `digital_certificates.certificate_password` | DB plaintext MVP | Alto | Manter fluxo atual por requisito do usuario, mas planejar cofre/criptografia server-side. |
| Tokens Telegram/Meta/Instagram/Facebook | Configuracoes omnichannel | Frontend + DB MVP | Alto | Criar cofre por escritorio antes de producao ampla. |
| Google OAuth access/refresh token | `accountant_google_connections` | DB plaintext server-side | Alto | Criptografar refresh token ou migrar para vault. |
| Credenciais Serpro | Backend/Admin Serpro | backend/service role | Alto | Manter criacao/uso no backend; frontend nao deve ler secret salvo. |
| `SEFAZ_BACKEND_URL` | Vercel env | env | Medio | Obrigatorio para proxy fiscal. Valor nao secreto. |
| `SEFAZ_BACKEND_TOKEN` | Vercel env | env sem validacao atual | Medio | Nao depender ate existir validacao no backend. |

Correcao local aplicada:

- Criada a abstracao `ISecretProvider` / `EnvironmentSecretProvider` no backend .NET para novos segredos.
- Registrada no DI do backend.
- Criados testes garantindo que erro de segredo ausente nao imprime valor sensivel.

Pendencia externa:

- Definir cofre real por escritorio antes de permitir producao multiempresa com certificados e tokens de canais em larga escala.
