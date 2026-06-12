using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NcmCatalogService(
    IHttpClientFactory httpClientFactory,
    SupabaseFiscalRepository repository)
{
    private const string DefaultSourceUrl =
        "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";

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

        try
        {
            using var response = await _http.GetAsync(DefaultSourceUrl, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Siscomex retornou HTTP {(int)response.StatusCode}.");
            }

            using var document = JsonDocument.Parse(content);
            var items = ExtractNcmItems(document.RootElement)
                .GroupBy(item => item.Code)
                .Select(group => group.First())
                .OrderBy(item => item.Code)
                .ToList();

            if (items.Count == 0)
            {
                throw new InvalidOperationException("A fonte oficial nao retornou codigos NCM validos.");
            }

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
                cancellationToken);

            return new NcmSyncResult
            {
                JobId = jobId,
                InsertedCodes = inserted,
                Message = "Tabela NCM sincronizada com a fonte publica oficial.",
                Status = "Concluido",
                Success = true,
                TotalCodes = items.Count,
                UpdatedCodes = updated
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
            Code = digits,
            Description = description.Trim(),
            EndDate = endDate,
            FormattedCode = FormatNcm(digits),
            IsActive = endDate is null || endDate >= DateOnly.FromDateTime(DateTime.UtcNow),
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
