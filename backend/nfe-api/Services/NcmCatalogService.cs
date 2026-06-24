using System.Diagnostics;
using System.Text.Json;
using ContHub.NfeApi.Models;
using Microsoft.AspNetCore.Http;

namespace ContHub.NfeApi.Services;

public sealed class NcmCatalogService(
    IHttpClientFactory httpClientFactory,
    SupabaseFiscalRepository repository)
{
    private const string DefaultSourceUrl =
        "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
    private const long MaxUploadBytes = 15 * 1024 * 1024;

    private readonly HttpClient _http = httpClientFactory.CreateClient();

    public Task<List<NcmCatalogItem>> SearchAsync(string query, int limit, CancellationToken cancellationToken) =>
        repository.SearchNcmAsync(query, limit, cancellationToken);

    public Task<NcmCatalogItem?> GetAsync(string code, CancellationToken cancellationToken) =>
        repository.GetNcmAsync(code, cancellationToken);

    public Task<NcmSyncStatus?> GetStatusAsync(CancellationToken cancellationToken) =>
        repository.GetLatestNcmSyncStatusAsync(cancellationToken);

    public async Task<NcmSyncResult> SyncAsync(string userId, CancellationToken cancellationToken)
    {
        var jobId = await repository.StartNcmSyncJobAsync(userId, cancellationToken);
        var stopwatch = Stopwatch.StartNew();
        var sourceVersion = DateTimeOffset.UtcNow.ToString("yyyyMMdd");

        try
        {
            using var response = await _http.GetAsync(DefaultSourceUrl, cancellationToken);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new NcmCatalogImportException(
                    "NCM_SOURCE_HTTP_ERROR",
                    $"A fonte da Tabela NCM retornou HTTP {(int)response.StatusCode}.",
                    contentType,
                    StatusCodes.Status502BadGateway);
            }

            var items = ParseSourceItems(bytes, contentType, "Siscomex", sourceVersion);
            return await PersistItemsAsync(
                jobId,
                items,
                "Tabela NCM sincronizada com a fonte publica oficial.",
                "Siscomex",
                sourceVersion,
                stopwatch,
                cancellationToken);
        }
        catch (NcmCatalogImportException error)
        {
            await repository.FailNcmSyncJobAsync(jobId, error.Detail, cancellationToken);
            return new NcmSyncResult
            {
                Code = error.Code,
                Detail = error.Detail,
                JobId = jobId,
                Message = error.Detail,
                ReceivedContentType = error.ReceivedContentType,
                Status = "Falha",
                Success = false
            };
        }
        catch (Exception error)
        {
            await repository.FailNcmSyncJobAsync(jobId, error.Message, cancellationToken);
            return new NcmSyncResult
            {
                JobId = jobId,
                Message = error.Message,
                Status = "Falha",
                Success = false
            };
        }
    }

    public async Task<NcmSyncResult> ImportFileAsync(string userId, IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_REQUIRED",
                "Selecione um arquivo XLSX para importar.",
                "",
                StatusCodes.Status400BadRequest);
        }

        var contentType = file.ContentType ?? "";
        ValidateUploadMetadata(file.FileName, contentType, file.Length);

        await using var stream = file.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        ValidateUploadContent(bytes, contentType);

        var jobId = await repository.StartNcmSyncJobAsync(userId, cancellationToken);
        var stopwatch = Stopwatch.StartNew();
        var sourceVersion = Path.GetFileName(file.FileName);

        try
        {
            var items = NcmXlsxParser.Parse(bytes, sourceVersion, DateTimeOffset.UtcNow);
            return await PersistItemsAsync(
                jobId,
                items,
                "Tabela NCM importada por arquivo XLSX.",
                "Upload manual",
                sourceVersion,
                stopwatch,
                cancellationToken);
        }
        catch (NcmCatalogImportException error)
        {
            await repository.FailNcmSyncJobAsync(jobId, error.Detail, cancellationToken);
            throw;
        }
        catch (Exception error)
        {
            await repository.FailNcmSyncJobAsync(jobId, error.Message, cancellationToken);
            throw new NcmCatalogImportException(
                "NCM_IMPORT_FAILED",
                "Nao foi possivel importar a Tabela NCM. Selecione um arquivo XLSX valido.",
                contentType);
        }
    }

    private async Task<NcmSyncResult> PersistItemsAsync(
        string jobId,
        IReadOnlyList<NcmCatalogItem> sourceItems,
        string message,
        string source,
        string sourceVersion,
        Stopwatch stopwatch,
        CancellationToken cancellationToken)
    {
        if (sourceItems.Count == 0)
        {
            throw new NcmCatalogImportException(
                "NCM_SOURCE_WITHOUT_VALID_CODES",
                "A fonte oficial nao retornou codigos NCM validos.");
        }

        var importedAt = DateTimeOffset.UtcNow;
        var items = sourceItems
            .Select(item => item with
            {
                Source = source,
                SourceVersion = string.IsNullOrWhiteSpace(item.SourceVersion) ? sourceVersion : item.SourceVersion,
                ImportedAt = item.ImportedAt ?? importedAt,
                SourceUpdatedAt = item.SourceUpdatedAt ?? importedAt
            })
            .GroupBy(item => item.NormalizedCode)
            .Select(group => group.First())
            .OrderBy(item => item.NormalizedCode)
            .ToList();

        var before = await repository.CountActiveNcmAsync(cancellationToken);
        await repository.UpsertNcmCatalogAsync(items, cancellationToken);
        var after = await repository.CountActiveNcmAsync(cancellationToken);
        var inserted = Math.Max(0, after - before);
        var updated = Math.Max(0, items.Count - inserted);

        await repository.CompleteNcmSyncJobAsync(
            jobId,
            items.Count,
            inserted,
            updated,
            0,
            cancellationToken,
            rejectedCodes: Math.Max(0, sourceItems.Count - items.Count),
            sourceVersion: sourceVersion,
            source: source,
            durationMs: (int)Math.Min(int.MaxValue, stopwatch.ElapsedMilliseconds));

        return new NcmSyncResult
        {
            JobId = jobId,
            InsertedCodes = inserted,
            Message = message,
            Status = "Concluido",
            Success = true,
            TotalCodes = items.Count,
            UpdatedCodes = updated,
            RejectedCodes = Math.Max(0, sourceItems.Count - items.Count)
        };
    }

    private static List<NcmCatalogItem> ParseSourceItems(
        byte[] bytes,
        string contentType,
        string source,
        string sourceVersion)
    {
        if (bytes.Length == 0)
        {
            throw new NcmCatalogImportException("NCM_SOURCE_EMPTY", "A fonte da Tabela NCM retornou um arquivo vazio.", contentType);
        }

        if (NcmXlsxParser.LooksLikeHtml(bytes))
        {
            throw new NcmCatalogImportException(
                "NCM_SOURCE_HTML_UNEXPECTED",
                "A fonte da Tabela NCM respondeu HTML em vez de JSON ou XLSX.",
                contentType,
                StatusCodes.Status502BadGateway);
        }

        if (IsJsonContentType(contentType) || NcmXlsxParser.LooksLikeJson(bytes))
        {
            return ParseJsonItems(bytes, contentType, source, sourceVersion);
        }

        if (IsXlsxContentType(contentType) || IsOctetStream(contentType))
        {
            if (!NcmXlsxParser.HasZipSignature(bytes))
            {
                throw new NcmCatalogImportException(
                    "NCM_SOURCE_FILE_SIGNATURE_INVALID",
                    "A fonte da Tabela NCM respondeu em um formato nao suportado.",
                    contentType,
                    StatusCodes.Status502BadGateway);
            }

            return NcmXlsxParser.Parse(bytes, sourceVersion, DateTimeOffset.UtcNow)
                .Select(item => item with { Source = source, SourceVersion = sourceVersion })
                .ToList();
        }

        throw new NcmCatalogImportException(
            "NCM_SOURCE_CONTENT_TYPE_NOT_SUPPORTED",
            "A fonte da Tabela NCM respondeu em um formato nao suportado.",
            contentType,
            StatusCodes.Status502BadGateway);
    }

    private static List<NcmCatalogItem> ParseJsonItems(byte[] bytes, string contentType, string source, string sourceVersion)
    {
        using var document = JsonDocument.Parse(bytes);
        if (document.RootElement.ValueKind == JsonValueKind.Object
            && document.RootElement.TryGetProperty("detail", out var detail)
            && detail.ValueKind == JsonValueKind.String)
        {
            throw new NcmCatalogImportException(
                "NCM_SOURCE_CONTENT_TYPE_NOT_SUPPORTED",
                "A fonte da Tabela NCM respondeu em um formato nao suportado.",
                contentType,
                StatusCodes.Status502BadGateway);
        }

        return ExtractNcmItems(document.RootElement)
            .Select(item => item with { Source = source, SourceVersion = sourceVersion })
            .GroupBy(item => item.NormalizedCode)
            .Select(group => group.First())
            .OrderBy(item => item.NormalizedCode)
            .ToList();
    }

    private static void ValidateUploadMetadata(string fileName, string contentType, long length)
    {
        if (length <= 0)
        {
            throw new NcmCatalogImportException("NCM_FILE_EMPTY", "O arquivo XLSX esta vazio.", contentType);
        }

        if (length > MaxUploadBytes)
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_TOO_LARGE",
                "O arquivo XLSX ultrapassa o tamanho maximo permitido.",
                contentType,
                StatusCodes.Status413PayloadTooLarge);
        }

        if (!fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_EXTENSION_NOT_SUPPORTED",
                "O arquivo deve estar no formato XLSX.",
                contentType,
                StatusCodes.Status415UnsupportedMediaType);
        }

        if (!IsXlsxContentType(contentType) && !IsOctetStream(contentType) && !string.IsNullOrWhiteSpace(contentType))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_TYPE_NOT_SUPPORTED",
                "O arquivo deve estar no formato XLSX.",
                contentType,
                StatusCodes.Status415UnsupportedMediaType);
        }
    }

    private static void ValidateUploadContent(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0)
        {
            throw new NcmCatalogImportException("NCM_FILE_EMPTY", "O arquivo XLSX esta vazio.", contentType);
        }

        if (NcmXlsxParser.LooksLikeHtml(bytes))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_HTML_NOT_SUPPORTED",
                "O arquivo enviado parece ser HTML, nao uma planilha XLSX.",
                contentType,
                StatusCodes.Status415UnsupportedMediaType);
        }

        if (NcmXlsxParser.LooksLikeJson(bytes))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_JSON_NOT_SUPPORTED",
                "O arquivo deve estar no formato XLSX.",
                contentType,
                StatusCodes.Status415UnsupportedMediaType);
        }

        if (!NcmXlsxParser.HasZipSignature(bytes))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_SIGNATURE_INVALID",
                "O arquivo informado nao possui assinatura valida de XLSX.",
                contentType,
                StatusCodes.Status415UnsupportedMediaType);
        }
    }

    private static bool IsJsonContentType(string contentType) =>
        MediaType(contentType) is "application/json" or "text/json" or "application/problem+json";

    private static bool IsXlsxContentType(string contentType) =>
        MediaType(contentType) == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private static bool IsOctetStream(string contentType) =>
        string.IsNullOrWhiteSpace(contentType) || MediaType(contentType) == "application/octet-stream";

    private static string MediaType(string contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return "";
        }

        return contentType.Split(';', 2)[0].Trim().ToLowerInvariant();
    }

    private static IEnumerable<NcmCatalogItem> ExtractNcmItems(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray().SelectMany(ExtractNcmItems))
            {
                yield return item;
            }

            yield break;
        }

        if (element.ValueKind != JsonValueKind.Object)
        {
            yield break;
        }

        var direct = TryReadNcm(element);
        if (direct is not null)
        {
            yield return direct;
        }

        foreach (var property in element.EnumerateObject())
        {
            if (property.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
            {
                foreach (var item in ExtractNcmItems(property.Value))
                {
                    yield return item;
                }
            }
        }
    }

    private static NcmCatalogItem? TryReadNcm(JsonElement element)
    {
        var code = FirstString(element, "Codigo", "codigo", "Code", "code", "codigoNcm", "ncm");
        var digits = NfeText.Digits(code);
        if (digits.Length != 8)
        {
            return null;
        }

        var description = FirstString(element, "Descricao", "descricao", "Description", "description", "texto", "nome");
        if (string.IsNullOrWhiteSpace(description))
        {
            return null;
        }

        var endDate = ParseDate(FirstString(element, "Data_Fim", "dataFim", "fimVigencia", "endDate"));

        return new NcmCatalogItem
        {
            Code = FormatNcm(digits),
            Description = description.Trim(),
            EndDate = endDate,
            FormattedCode = FormatNcm(digits),
            HierarchyLevel = FirstInt(element, "Nivel", "nivel", "level", "hierarchyLevel"),
            IsActive = endDate is null || endDate >= DateOnly.FromDateTime(DateTime.UtcNow),
            LegalAct = FirstString(element, "Ato_Legal", "atoLegal", "legalAct"),
            LegalActNumber = FirstString(element, "Numero_Ato_Legal", "numeroAtoLegal", "legalActNumber"),
            LegalActYear = FirstString(element, "Ano_Ato_Legal", "anoAtoLegal", "legalActYear"),
            NormalizedCode = digits,
            Source = "Siscomex",
            SourceUpdatedAt = DateTimeOffset.UtcNow,
            StartDate = ParseDate(FirstString(element, "Data_Inicio", "dataInicio", "inicioVigencia", "startDate"))
        };
    }

    private static string FirstString(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
            {
                continue;
            }

            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
        }

        return "";
    }

    private static int FirstInt(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
            {
                continue;
            }

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
            {
                return number;
            }

            if (int.TryParse(value.ToString(), out var parsed))
            {
                return parsed;
            }
        }

        return 0;
    }

    private static DateOnly? ParseDate(string value)
    {
        if (DateOnly.TryParse(value, out var parsed))
        {
            return parsed;
        }

        return DateTimeOffset.TryParse(value, out var dateTime)
            ? DateOnly.FromDateTime(dateTime.Date)
            : null;
    }

    private static string FormatNcm(string code) =>
        code.Length == 8 ? $"{code[..4]}.{code.Substring(4, 2)}.{code.Substring(6, 2)}" : code;
}
