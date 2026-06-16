# Correcao do MIME type dos XMLs DF-e no Storage - 2026-06-15

## 1. Causa exata

O upload do XML privado da Distribuicao DF-e usava `StringContent(xml, Encoding.UTF8, "application/xml")`.

Essa sobrecarga adiciona automaticamente `charset=utf-8`, fazendo o Supabase Storage receber:

```text
application/xml; charset=utf-8
```

O bucket privado `nfe-dfe-xml` aceita somente:

```text
application/xml
text/xml
```

Por isso o Supabase retornou `415 invalid_mime_type`.

## 2. Arquivo e linha do problema

Arquivo:

```text
backend/nfe-api/Services/SupabaseDfeRepository.cs
```

Ponto original:

```csharp
request.Content = new StringContent(xml, Encoding.UTF8, "application/xml");
```

## 3. Codigo anterior

```csharp
request.Content = new StringContent(xml, Encoding.UTF8, "application/xml");
```

## 4. Codigo corrigido

```csharp
request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(xml));
request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/xml");
```

## 5. MIME type final enviado

```text
application/xml
```

Sem `charset=utf-8`.

## 6. Comportamento do NSU em caso de falha

O servico agora mantem um `persistedNsu`, que representa o ultimo NSU salvo com seguranca.

Se o Storage falhar:

- `last_nsu` nao avanca para o NSU do retorno que falhou;
- o lock da sincronizacao e liberado com status `error`;
- o erro e registrado em `nfe_dfe_sync_logs`;
- o documento nao e salvo/atualizado como completo;
- o mesmo NSU continua disponivel para nova tentativa;
- a nova tentativa nao deve duplicar documento, pois a persistencia procura registro existente por chave/NSU antes de inserir.

## 7. Tratamento de erro estruturado

Foi criada a excecao:

```text
DfeStorageUploadException
```

Ela retorna dados seguros para o frontend:

```json
{
  "success": false,
  "ok": false,
  "code": "dfe_storage_upload_failed",
  "step": "storage_upload",
  "storageStatus": 415,
  "error": "Supabase Storage recusou o XML privado.",
  "message": "Supabase Storage recusou o XML privado.",
  "logicalPath": "organization/client/yyyy/mm/documento.xml",
  "recommendedAction": "Verifique se o bucket privado nfe-dfe-xml aceita application/xml e tente sincronizar novamente."
}
```

Sem XML completo, senha, PFX, JWT ou service role.

## 8. Testes criados

Arquivo:

```text
backend/nfe-api.tests/SupabaseDfeRepositoryStorageTests.cs
```

Testes:

- `SaveProcessedDocumentsAsync_uploads_xml_as_application_xml_without_charset`
- `SaveProcessedDocumentsAsync_storage_415_throws_structured_error_and_does_not_persist_document`
- `SaveProcessedDocumentsAsync_retry_updates_existing_document_without_duplicate_insert`

Cobertura adicionada:

- upload envia `Content-Type: application/xml`;
- upload nao envia `charset=utf-8`;
- XML em UTF-8 e preservado;
- Storage com sucesso permite persistencia;
- Storage `415 invalid_mime_type` gera erro estruturado;
- falha no Storage nao chama a tabela `nfe_dfe_documents`;
- erro nao vaza XML/segredos;
- nova tentativa atualiza registro existente em vez de duplicar.

## 9. Resultado dos comandos

```powershell
npm.cmd run lint
```

Passou.

```powershell
npm.cmd run build
```

Passou. Apenas aviso existente de chunk grande do Vite.

```powershell
dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore
```

Passou com 0 erros e 0 avisos.

```powershell
dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore
```

Passou: 50 testes aprovados, 0 falhas.

## 10. Arquivos alterados

- `backend/nfe-api/Services/SupabaseDfeRepository.cs`
- `backend/nfe-api/Services/SefazDfeDistributionService.cs`
- `backend/nfe-api/Models/DfeModels.cs`
- `backend/nfe-api/Program.cs`
- `backend/nfe-api.tests/SupabaseDfeRepositoryStorageTests.cs`

## 11. Como publicar

Nao houve alteracao de SQL, bucket ou frontend.

Publicar somente o backend .NET no host fiscal/Railway.

Se o projeto Railway estiver conectado ao repositorio, faca o redeploy pelo painel do Railway. Se estiver usando Railway CLI no diretorio do backend, o caminho esperado e publicar a API .NET atualizada.

Depois de publicado, nao adicione `application/xml; charset=utf-8` nos MIME types do bucket.

## 12. Como repetir o teste do cliente que falhou

1. Publicar o backend corrigido.
2. Manter o bucket `nfe-dfe-xml` privado.
3. Manter os MIME types permitidos como `application/xml` e `text/xml`.
4. No frontend, selecionar o mesmo cliente/certificado que falhou.
5. Executar a consulta DF-e novamente.
6. Confirmar que o retorno nao apresenta mais `invalid_mime_type`.

## 13. O que verificar em `nfe_dfe_sync_states`

Verificar para o cliente/certificado:

- `last_nsu` deve continuar no ultimo NSU persistido com sucesso;
- depois da nova tentativa bem-sucedida, `last_nsu` deve avancar;
- `status` deve sair de `error/running` para `success` ou estado coerente;
- `lock_token` deve ficar vazio;
- `locked_at` deve ficar nulo.

## 14. O que verificar em `nfe_dfe_sync_logs`

Na falha anterior/caso reproduza:

- `error_message` deve indicar `codigo=dfe_storage_upload_failed`;
- deve conter `etapa=storage_upload`;
- nao deve conter XML completo;
- nao deve conter senha, PFX, JWT ou service role.

Na nova tentativa:

- deve registrar sucesso ou o novo retorno da SEFAZ;
- `sefaz_status_code` deve refletir o `cStat` recebido.

## 15. O que verificar em `nfe_dfe_documents`

Depois da nova tentativa bem-sucedida:

- documento salvo sem duplicidade;
- `has_full_xml = true` apenas quando o XML foi salvo no Storage;
- `xml_storage_path` preenchido com caminho privado segregado por organizacao/cliente;
- `xml_hash` preenchido;
- dados de chave, NSU e tipo de documento consistentes.

## 16. Observacao sobre outros XMLs

Foi pesquisado o uso de `application/xml`, `StringContent`, `ByteArrayContent`, `Storage` e `nfe-dfe-xml`.

O upload privado de XML DF-e estava centralizado em `SupabaseDfeRepository.UploadPrivateXmlAsync`. XMLs de NF-e gerados/autorizados hoje sao persistidos em campos do banco, nao no bucket `nfe-dfe-xml`. O `application/soap+xml; charset=utf-8` encontrado em `SefazSoapClientService` pertence ao protocolo SOAP da SEFAZ e nao ao upload do Supabase Storage.
