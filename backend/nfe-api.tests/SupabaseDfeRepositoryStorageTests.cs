using System.Net;
using System.Text;
using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class SupabaseDfeRepositoryStorageTests
{
    [Fact]
    public async Task SaveProcessedDocumentsAsync_uploads_xml_as_application_xml_without_charset()
    {
        ConfigureSupabaseEnv();
        var xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><nfe>Razao \u00e7\u00e3</nfe>";
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Empty(HttpStatusCode.OK));
            }

            if (request.Method == HttpMethod.Get)
            {
                return Task.FromResult(Json("[]"));
            }

            if (request.Method == HttpMethod.Post)
            {
                return Task.FromResult(Json($"[{DocumentJson()}]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        await repository.SaveProcessedDocumentsAsync([ProcessedDocument(xml)], CancellationToken.None);

        var upload = Assert.Single(handler.Requests, item => IsStorageUpload(item.Method, item.Uri));
        Assert.Equal("application/xml", upload.ContentType);
        Assert.True(string.IsNullOrWhiteSpace(upload.CharSet));
        Assert.Equal(xml, Encoding.UTF8.GetString(upload.Body));
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_storage_415_throws_structured_error_and_does_not_persist_document()
    {
        ConfigureSupabaseEnv();
        var xml = "<procNFe><senha>nao-logar</senha></procNFe>";
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Json(
                    """{"statusCode":415,"error":"invalid_mime_type","message":"mime type recusado"}""",
                    HttpStatusCode.UnsupportedMediaType));
            }

            return Task.FromResult(Json("[]"));
        });
        var repository = Repository(handler);

        var error = await Assert.ThrowsAsync<DfeStorageUploadException>(() =>
            repository.SaveProcessedDocumentsAsync([ProcessedDocument(xml)], CancellationToken.None));

        Assert.Equal("dfe_storage_upload_failed", error.Code);
        Assert.Equal("storage_upload", error.Step);
        Assert.Equal(415, error.StorageStatusCode);
        Assert.Equal(StoragePath, error.LogicalPath);
        Assert.DoesNotContain(xml, error.Message);
        Assert.DoesNotContain("service_role", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("jwt", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("senha", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(handler.Requests, item =>
            item.Uri.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal)
            && item.Method != HttpMethod.Get);
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_existing_complete_xml_is_not_uploaded_again()
    {
        ConfigureSupabaseEnv();
        var documentExists = false;
        var inserts = 0;
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Empty(HttpStatusCode.OK));
            }

            if (request.Method == HttpMethod.Get)
            {
                return Task.FromResult(Json(documentExists ? $"[{DocumentJson()}]" : "[]"));
            }

            if (request.Method == HttpMethod.Post)
            {
                inserts += 1;
                documentExists = true;
                return Task.FromResult(Json($"[{DocumentJson()}]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        var first = await repository.SaveProcessedDocumentsAsync([ProcessedDocument("<procNFe>1</procNFe>")], CancellationToken.None);
        var second = await repository.SaveProcessedDocumentsAsync([ProcessedDocument("<procNFe>1</procNFe>")], CancellationToken.None);

        Assert.Equal(1, inserts);
        Assert.Equal(1, first.StorageUploads);
        Assert.Equal(0, second.StorageUploads);
        Assert.Equal(1, second.IgnoredExisting);
        Assert.Equal(1, handler.Requests.Count(item => IsStorageUpload(item.Method, item.Uri)));
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_updates_summary_to_full_xml_by_logical_access_key()
    {
        ConfigureSupabaseEnv();
        var existing = "";
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Empty(HttpStatusCode.OK));
            }

            if (request.Method == HttpMethod.Get && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                if (request.RequestUri.Query.Contains("id=eq.doc-summary", StringComparison.Ordinal))
                {
                    return Task.FromResult(Json($"[{DocumentJson(id: "doc-summary", hasFullXml: true, schemaName: "procNFe_v4.00.xsd", documentType: "procNFe")}]"));
                }

                return Task.FromResult(string.IsNullOrWhiteSpace(existing)
                    ? Json("[]")
                    : Json($"[{existing}]"));
            }

            if (request.Method == HttpMethod.Post && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                existing = DocumentJson(id: "doc-summary", hasFullXml: false, schemaName: "resNFe_v1.01.xsd", documentType: "resNFe", xmlHash: "summary-hash");
                return Task.FromResult(Json($"[{existing}]"));
            }

            if (request.Method == HttpMethod.Patch && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                existing = DocumentJson(id: "doc-summary", hasFullXml: true, schemaName: "procNFe_v4.00.xsd", documentType: "procNFe");
                return Task.FromResult(Empty(HttpStatusCode.NoContent));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        var summary = ProcessedDocument("<resNFe>summary</resNFe>") with
        {
            Document = ProcessedDocument("<resNFe>summary</resNFe>").Document with
            {
                DocumentType = "resNFe",
                HasFullXml = false,
                SchemaName = "resNFe_v1.01.xsd",
                XmlHash = "summary-hash",
                XmlStoragePath = $"{OrganizationId}/{ClientId}/2026/06/resNFe-{AccessKey}-summary-hash.xml"
            }
        };

        var first = await repository.SaveProcessedDocumentsAsync([summary], CancellationToken.None);
        var second = await repository.SaveProcessedDocumentsAsync([ProcessedDocument("<procNFe>full</procNFe>")], CancellationToken.None);

        Assert.Equal(1, first.Inserted);
        Assert.Equal(1, second.Updated);
        Assert.Equal(1, second.CompletedExisting);
        Assert.Equal(1, handler.Requests.Count(item =>
            item.Method == HttpMethod.Patch
            && item.Uri.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal)));
        Assert.Contains(handler.Requests, item =>
            item.Method == HttpMethod.Get
            && item.Uri.Query.Contains($"access_key=eq.{AccessKey}", StringComparison.Ordinal)
            && !item.Uri.Query.Contains("schema_name", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_does_not_downgrade_full_xml_to_summary()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(request =>
        {
            if (request.Method == HttpMethod.Get
                && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                return Task.FromResult(Json($"[{DocumentJson()}]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);
        var summary = ProcessedDocument("<resNFe>summary</resNFe>") with
        {
            Document = ProcessedDocument("<resNFe>summary</resNFe>").Document with
            {
                DocumentType = "resNFe",
                HasFullXml = false,
                SchemaName = "resNFe_v1.01.xsd",
                XmlHash = "summary-hash"
            }
        };

        var result = await repository.SaveProcessedDocumentsAsync([summary], CancellationToken.None);

        Assert.Equal(1, result.IgnoredExisting);
        Assert.DoesNotContain(handler.Requests, item => IsStorageUpload(item.Method, item.Uri));
        Assert.DoesNotContain(handler.Requests, item => item.Method == HttpMethod.Patch);
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_stores_proc_event_only_in_events_table()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Empty(HttpStatusCode.OK));
            }

            if (request.Method == HttpMethod.Get
                && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                return Task.FromResult(Json($"[{DocumentJson()}]"));
            }

            if (request.Method == HttpMethod.Get
                && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_events", StringComparison.Ordinal))
            {
                return Task.FromResult(Json("[]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);
        var evt = ProcessedDocument("<procEventoNFe>event</procEventoNFe>") with
        {
            Document = ProcessedDocument("<procEventoNFe>event</procEventoNFe>").Document with
            {
                Direction = "evento",
                DocumentType = "procEventoNFe",
                HasFullXml = true,
                SchemaName = "procEventoNFe_v1.00.xsd",
                XmlHash = "event-hash",
                XmlStoragePath = $"{OrganizationId}/{ClientId}/2026/06/procEventoNFe-{AccessKey}-event-hash.xml"
            },
            Event = new DfeEventWrite
            {
                AccessKey = AccessKey,
                ClientId = ClientId,
                EventType = "210200",
                OrganizationId = OrganizationId,
                ResponseXmlHash = "event-hash",
                Sequence = 1
            }
        };

        await repository.SaveProcessedDocumentsAsync([evt], CancellationToken.None);

        Assert.Contains(handler.Requests, item =>
            item.Method == HttpMethod.Post
            && item.Uri.AbsolutePath.Contains("/rest/v1/nfe_dfe_events", StringComparison.Ordinal));
        Assert.DoesNotContain(handler.Requests, item =>
            item.Method == HttpMethod.Patch
            && item.Uri.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal));
        Assert.DoesNotContain(handler.Requests, item =>
            item.Method == HttpMethod.Post
            && item.Uri.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SaveProcessedDocumentsAsync_duplicate_insert_throws_structured_conflict_and_cleans_storage()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(request =>
        {
            if (IsStorageUpload(request))
            {
                return Task.FromResult(Empty(HttpStatusCode.OK));
            }

            if (request.Method == HttpMethod.Get)
            {
                return Task.FromResult(Json("[]"));
            }

            if (request.Method == HttpMethod.Post
                && request.RequestUri!.AbsolutePath.Contains("/rest/v1/nfe_dfe_documents", StringComparison.Ordinal))
            {
                return Task.FromResult(Json(
                    """{"code":"23505","message":"duplicate key value violates unique constraint \"idx_nfe_dfe_documents_company_chave\""}""",
                    HttpStatusCode.Conflict));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        var error = await Assert.ThrowsAsync<DfeDocumentPersistenceException>(() =>
            repository.SaveProcessedDocumentsAsync([ProcessedDocument("<procNFe>full</procNFe>")], CancellationToken.None));

        Assert.Equal("DFE_DOCUMENT_PERSISTENCE_CONFLICT", error.Code);
        Assert.Equal("document_insert", error.Step);
        Assert.Equal(AccessKey, error.AccessKey);
        Assert.Contains(handler.Requests, item =>
            item.Method == HttpMethod.Delete
            && item.Uri.AbsolutePath.Contains("/storage/v1/object/nfe-dfe-xml/", StringComparison.Ordinal));
    }

    private const string OrganizationId = "org-1";
    private const string ClientId = "client-1";
    private const string CertificateId = "cert-1";
    private const string AccessKey = "25260611111111000191550010000001231000001234";
    private const string StoragePath = $"{OrganizationId}/{ClientId}/2026/06/procNFe-{AccessKey}-abcdef1234567890.xml";

    private static SupabaseDfeRepository Repository(RecordingHandler handler) =>
        new(new StaticHttpClientFactory(new HttpClient(handler)));

    private static DfeProcessedDocument ProcessedDocument(string xml) => new()
    {
        Xml = xml,
        Document = new DfeDocumentWrite
        {
            AccessKey = AccessKey,
            CertificateId = CertificateId,
            ClientId = ClientId,
            Direction = "recebida",
            DocumentType = "procNFe",
            HasFullXml = true,
            Nsu = "000000000000123",
            OrganizationId = OrganizationId,
            SchemaName = "procNFe_v4.00.xsd",
            SummaryData = new { teste = true },
            XmlHash = "abcdef1234567890",
            XmlStoragePath = StoragePath
        }
    };

    private static string DocumentJson(
        string id = "doc-1",
        bool hasFullXml = true,
        string schemaName = "procNFe_v4.00.xsd",
        string documentType = "procNFe",
        string xmlHash = "abcdef1234567890") =>
        $$"""
        {
          "id":"{{id}}",
          "organization_id":"{{OrganizationId}}",
          "client_id":"{{ClientId}}",
          "certificate_id":"{{CertificateId}}",
          "nsu":"000000000000123",
          "access_key":"{{AccessKey}}",
          "schema_name":"{{schemaName}}",
          "document_type":"{{documentType}}",
          "direction":"recebida",
          "issuer_cnpj":"11111111000191",
          "issuer_name":"EMPRESA EMITENTE LTDA",
          "recipient_cnpj":"",
          "recipient_name":"",
          "total_value":0,
          "nfe_status":"",
          "manifestation_status":"Pendente",
          "has_full_xml":{{hasFullXml.ToString().ToLowerInvariant()}},
          "xml_storage_path":"{{StoragePath}}",
          "xml_hash":"{{xmlHash}}",
          "summary_data":{}
        }
        """;

    private static bool IsStorageUpload(HttpRequestMessage request) =>
        IsStorageUpload(request.Method, request.RequestUri!);

    private static bool IsStorageUpload(HttpMethod method, Uri uri) =>
        method == HttpMethod.Post && uri.AbsolutePath.Contains("/storage/v1/object/nfe-dfe-xml/", StringComparison.Ordinal);

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static HttpResponseMessage Empty(HttpStatusCode status) => new(status);

    private static void ConfigureSupabaseEnv()
    {
        Environment.SetEnvironmentVariable("SUPABASE_URL", "https://unit-test.supabase.co");
        Environment.SetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
    }

    private sealed record CapturedRequest(
        HttpMethod Method,
        Uri Uri,
        string ContentType,
        string? CharSet,
        byte[] Body);

    private sealed class RecordingHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responder)
        : HttpMessageHandler
    {
        public List<CapturedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var contentType = request.Content?.Headers.ContentType;
            var body = request.Content is null
                ? []
                : await request.Content.ReadAsByteArrayAsync(cancellationToken);
            Requests.Add(new CapturedRequest(
                request.Method,
                request.RequestUri!,
                contentType?.MediaType ?? "",
                contentType?.CharSet,
                body));

            return await responder(request);
        }
    }

    private sealed class StaticHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }
}
