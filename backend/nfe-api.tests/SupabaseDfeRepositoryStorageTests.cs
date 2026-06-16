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

    private static string DocumentJson() =>
        $$"""
        {
          "id":"doc-1",
          "organization_id":"{{OrganizationId}}",
          "client_id":"{{ClientId}}",
          "certificate_id":"{{CertificateId}}",
          "nsu":"000000000000123",
          "access_key":"{{AccessKey}}",
          "schema_name":"procNFe_v4.00.xsd",
          "document_type":"procNFe",
          "direction":"recebida",
          "issuer_cnpj":"11111111000191",
          "issuer_name":"EMPRESA EMITENTE LTDA",
          "recipient_cnpj":"",
          "recipient_name":"",
          "total_value":0,
          "nfe_status":"",
          "manifestation_status":"Pendente",
          "has_full_xml":true,
          "xml_storage_path":"{{StoragePath}}",
          "xml_hash":"abcdef1234567890",
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
