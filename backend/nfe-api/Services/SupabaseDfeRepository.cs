using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SupabaseDfeRepository(IHttpClientFactory httpClientFactory)
{
    private const string XmlBucket = "nfe-dfe-xml";
    private readonly HttpClient _http = httpClientFactory.CreateClient();
    private readonly string _serviceKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY")
        ?? "";
    private readonly string _supabaseUrl = (Environment.GetEnvironmentVariable("SUPABASE_URL")
        ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL")
        ?? "").TrimEnd('/');

    public async Task<DfeSyncState> GetOrCreateSyncStateAsync(
        SupabaseCompany company,
        SupabaseCertificate certificate,
        bool resetNsu,
        CancellationToken cancellationToken)
    {
        var existing = await GetSingleAsync(
            $"nfe_dfe_sync_states?select=*&organization_id=eq.{Uri.EscapeDataString(company.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(company.Id)}&certificate_id=eq.{Uri.EscapeDataString(certificate.Id)}&environment=eq.{Uri.EscapeDataString(NormalizeEnvironment(certificate.Environment))}",
            cancellationToken);

        if (existing.ValueKind != JsonValueKind.Undefined)
        {
            if (!resetNsu) return MapSyncState(existing);
            var existingState = MapSyncState(existing);
            if (existingState.LastNsu != "000000000000000" || existingState.MaxNsu != "000000000000000")
            {
                return existingState;
            }

            await PatchAsync(
                $"nfe_dfe_sync_states?id=eq.{Uri.EscapeDataString(Get(existing, "id"))}",
                new
                {
                    cnpj = NfeText.Digits(company.Cnpj),
                    consecutive_errors = 0,
                    last_nsu = "000000000000000",
                    last_status_code = "",
                    last_status_message = "",
                    max_nsu = "000000000000000",
                    next_allowed_sync_at = (DateTimeOffset?)null,
                    status = "idle"
                },
                cancellationToken);

            var refreshed = await GetSingleAsync(
                $"nfe_dfe_sync_states?id=eq.{Uri.EscapeDataString(Get(existing, "id"))}",
                cancellationToken);
            return MapSyncState(refreshed);
        }

        var inserted = await PostAsync(
            "nfe_dfe_sync_states",
            new
            {
                certificate_id = certificate.Id,
                client_id = company.Id,
                cnpj = NfeText.Digits(company.Cnpj),
                environment = NormalizeEnvironment(certificate.Environment),
                organization_id = company.OrganizationId,
                status = "idle"
            },
            cancellationToken);

        return MapSyncState(inserted[0]);
    }

    public async Task<DfeSyncState?> GetLatestSyncStateAsync(
        string organizationId,
        string clientId,
        string certificateId,
        CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"nfe_dfe_sync_states?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&certificate_id=eq.{Uri.EscapeDataString(certificateId)}&order=updated_at.desc",
            cancellationToken);
        return row.ValueKind == JsonValueKind.Undefined ? null : MapSyncState(row);
    }

    public async Task AcquireLockAsync(DfeSyncState state, string lockToken, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (state.Status == "running" && state.LockedAt is not null && state.LockedAt > now.Subtract(DfeSyncPolicy.RunningLockTtl))
        {
            throw new DfeSyncAlreadyRunningException();
        }

        if (state.NextAllowedSyncAt is not null && state.NextAllowedSyncAt > now)
        {
            throw new DfeSyncCooldownException(
                state.NextAllowedSyncAt.Value,
                state.LastStatusCode,
                $"Consulta temporariamente bloqueada. Tente apos {state.NextAllowedSyncAt:dd/MM/yyyy HH:mm}.");
        }

        var activeLock = await GetSingleAsync(
            $"nfe_dfe_sync_states?select=*&cnpj=eq.{Uri.EscapeDataString(state.Cnpj)}&environment=eq.{Uri.EscapeDataString(state.Environment)}&status=eq.running&locked_at=gte.{Uri.EscapeDataString(now.Subtract(DfeSyncPolicy.RunningLockTtl).ToString("O"))}",
            cancellationToken);
        if (activeLock.ValueKind != JsonValueKind.Undefined && Get(activeLock, "id") != state.Id)
        {
            throw new DfeSyncAlreadyRunningException();
        }

        await PatchAsync(
            $"nfe_dfe_sync_states?id=eq.{Uri.EscapeDataString(state.Id)}",
            new
            {
                lock_token = lockToken,
                locked_at = DateTimeOffset.UtcNow,
                status = "running"
            },
            cancellationToken);
    }

    public async Task ReleaseLockAsync(
        string stateId,
        string status,
        string statusCode,
        string statusMessage,
        string lastNsu,
        string maxNsu,
        DateTimeOffset? nextAllowedSyncAt,
        int consecutiveErrors,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_dfe_sync_states?id=eq.{Uri.EscapeDataString(stateId)}",
            new
            {
                consecutive_errors = consecutiveErrors,
                last_nsu = NormalizeNsu(lastNsu),
                last_status_code = statusCode,
                last_status_message = statusMessage,
                last_sync_at = DateTimeOffset.UtcNow,
                lock_token = "",
                locked_at = (DateTimeOffset?)null,
                max_nsu = NormalizeNsu(maxNsu),
                next_allowed_sync_at = nextAllowedSyncAt,
                status
            },
            cancellationToken);
    }

    public async Task<DfePersistResult> SaveProcessedDocumentsAsync(
        IReadOnlyList<DfeProcessedDocument> documents,
        CancellationToken cancellationToken)
    {
        var inserted = 0;
        var updated = 0;
        var ignored = 0;
        var ignoredExisting = 0;
        var completedExisting = 0;
        var storageUploads = 0;
        var saved = new List<DfeDocument>();

        foreach (var processed in documents)
        {
            if (string.IsNullOrWhiteSpace(processed.Document.AccessKey)
                && string.IsNullOrWhiteSpace(processed.Document.Nsu))
            {
                ignored += 1;
                continue;
            }

            var existing = await FindExistingDocumentAsync(processed.Document, cancellationToken);
            var body = DocumentBody(processed.Document);
            DfeDocument document;

            if (existing.ValueKind == JsonValueKind.Undefined)
            {
                if (!string.IsNullOrWhiteSpace(processed.Xml))
                {
                    await UploadPrivateXmlAsync(processed.Document.XmlStoragePath, processed.Xml, cancellationToken);
                    storageUploads += 1;
                }

                var response = await PostAsync("nfe_dfe_documents", body, cancellationToken);
                document = MapDocument(response[0]);
                inserted += 1;
            }
            else
            {
                var existingDocument = MapDocument(existing);
                if (DfeSyncPolicy.ExistingXmlIsComplete(existingDocument, processed.Document))
                {
                    ignored += 1;
                    ignoredExisting += 1;
                    saved.Add(existingDocument);

                    if (processed.Event is not null)
                    {
                        await SaveEventAsync(processed.Event with { DocumentId = existingDocument.Id }, cancellationToken);
                    }

                    continue;
                }

                if (!string.IsNullOrWhiteSpace(processed.Xml))
                {
                    await UploadPrivateXmlAsync(processed.Document.XmlStoragePath, processed.Xml, cancellationToken);
                    storageUploads += 1;
                }

                await PatchAsync(
                    $"nfe_dfe_documents?id=eq.{Uri.EscapeDataString(Get(existing, "id"))}",
                    body,
                    cancellationToken);
                var refreshed = await GetSingleAsync(
                    $"nfe_dfe_documents?id=eq.{Uri.EscapeDataString(Get(existing, "id"))}",
                    cancellationToken);
                document = MapDocument(refreshed);
                if (!existingDocument.HasFullXml && document.HasFullXml)
                {
                    completedExisting += 1;
                }

                updated += 1;
            }

            saved.Add(document);

            if (processed.Event is not null)
            {
                await SaveEventAsync(processed.Event with { DocumentId = document.Id }, cancellationToken);
            }
        }

        return new DfePersistResult
        {
            CompletedExisting = completedExisting,
            Documents = saved,
            Ignored = ignored,
            IgnoredExisting = ignoredExisting,
            Inserted = inserted,
            StorageUploads = storageUploads,
            Updated = updated
        };
    }

    public async Task SaveEventAsync(DfeEventWrite input, CancellationToken cancellationToken)
    {
        var existing = await GetSingleAsync(
            $"nfe_dfe_events?select=id&organization_id=eq.{Uri.EscapeDataString(input.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(input.ClientId)}&access_key=eq.{Uri.EscapeDataString(input.AccessKey)}&event_type=eq.{Uri.EscapeDataString(input.EventType)}&sequence=eq.{input.Sequence}",
            cancellationToken);
        var body = new
        {
            access_key = input.AccessKey,
            client_id = input.ClientId,
            created_by = string.IsNullOrWhiteSpace(input.CreatedBy) ? null : input.CreatedBy,
            document_id = string.IsNullOrWhiteSpace(input.DocumentId) ? null : input.DocumentId,
            event_date = input.EventDate,
            event_type = input.EventType,
            organization_id = input.OrganizationId,
            private_xml_storage_path = input.PrivateXmlStoragePath,
            protocol_number = input.ProtocolNumber,
            request_xml_hash = input.RequestXmlHash,
            response_xml_hash = input.ResponseXmlHash,
            sequence = input.Sequence,
            status_code = input.StatusCode,
            status_message = input.StatusMessage
        };

        if (existing.ValueKind == JsonValueKind.Undefined)
        {
            await PostAsync("nfe_dfe_events", body, cancellationToken, preferReturn: false);
            return;
        }

        await PatchAsync(
            $"nfe_dfe_events?id=eq.{Uri.EscapeDataString(Get(existing, "id"))}",
            body,
            cancellationToken);
    }

    public async Task SaveSyncLogAsync(
        string organizationId,
        string clientId,
        string certificateId,
        string environment,
        string startNsu,
        string endNsu,
        string maxNsu,
        int received,
        int inserted,
        int updated,
        int ignored,
        string statusCode,
        string statusMessage,
        int durationMs,
        string errorMessage,
        string userId,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken)
    {
        await PostAsync(
            "nfe_dfe_sync_logs",
            new
            {
                certificate_id = certificateId,
                client_id = clientId,
                duration_ms = durationMs,
                end_nsu = NormalizeNsu(endNsu),
                environment = NormalizeEnvironment(environment),
                error_message = errorMessage,
                finished_at = DateTimeOffset.UtcNow,
                ignored_count = ignored,
                inserted_count = inserted,
                max_nsu = NormalizeNsu(maxNsu),
                organization_id = organizationId,
                received_count = received,
                sefaz_status_code = statusCode,
                sefaz_status_message = statusMessage,
                start_nsu = NormalizeNsu(startNsu),
                started_at = startedAt,
                triggered_by = string.IsNullOrWhiteSpace(userId) ? null : userId,
                updated_count = updated
            },
            cancellationToken,
            preferReturn: false);
    }

    public async Task<IReadOnlyList<DfeDocument>> ListDocumentsAsync(
        string organizationId,
        string clientId,
        string? direction,
        string? search,
        int limit,
        int offset,
        CancellationToken cancellationToken)
    {
        var query = new StringBuilder(
            $"nfe_dfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&active=eq.true&order=issue_date.desc.nullslast,created_at.desc&limit={Math.Clamp(limit, 1, 100)}&offset={Math.Max(offset, 0)}");

        if (!string.IsNullOrWhiteSpace(direction) && direction != "todas")
        {
            query.Append($"&direction=eq.{Uri.EscapeDataString(direction)}");
        }

        var rows = await GetArrayAsync(query.ToString(), cancellationToken);
        var documents = rows.Select(MapDocument).ToList();
        var text = (search ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(text)) return documents;

        return documents
            .Where(item => new[]
            {
                item.AccessKey,
                item.IssuerCnpj,
                item.IssuerName,
                item.Nsu,
                item.RecipientCnpj,
                item.RecipientName
            }.Any(value => value.ToLowerInvariant().Contains(text)))
            .ToList();
    }

    public async Task<DfeDocument> GetDocumentAsync(
        string organizationId,
        string clientId,
        string id,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"nfe_dfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&id=eq.{Uri.EscapeDataString(id)}",
            "Documento DF-e nao encontrado.",
            cancellationToken);
        return MapDocument(row);
    }

    public async Task<IReadOnlyList<JsonElement>> ListEventsAsync(
        string organizationId,
        string clientId,
        string documentId,
        CancellationToken cancellationToken) =>
        await GetArrayAsync(
            $"nfe_dfe_events?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&document_id=eq.{Uri.EscapeDataString(documentId)}&order=created_at.desc",
            cancellationToken);

    public async Task<string> ReadPrivateXmlAsync(string storagePath, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(storagePath))
        {
            throw new InvalidOperationException("Este documento ainda nao possui XML completo salvo.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_supabaseUrl}/storage/v1/object/authenticated/{XmlBucket}/{Uri.EscapeDataString(storagePath).Replace("%2F", "/")}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);

        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException("Nao foi possivel ler o XML privado no Storage.");
        }

        return content;
    }

    public async Task UpdateDocumentManifestationAsync(
        string documentId,
        string manifestationStatus,
        string statusCode,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_dfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                manifestation_status = manifestationStatus,
                summary_data = new { lastManifestationStatus = manifestationStatus, lastManifestationCode = statusCode }
            },
            cancellationToken);
    }

    private async Task UploadPrivateXmlAsync(string storagePath, string xml, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_supabaseUrl}/storage/v1/object/{XmlBucket}/{Uri.EscapeDataString(storagePath).Replace("%2F", "/")}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        request.Headers.Add("x-upsert", "true");
        request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(xml));
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/xml");

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new DfeStorageUploadException((int)response.StatusCode, storagePath);
        }
    }

    private async Task<JsonElement> FindExistingDocumentAsync(DfeDocumentWrite document, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(document.AccessKey))
        {
            var byKey = await GetSingleAsync(
                $"nfe_dfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(document.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(document.ClientId)}&access_key=eq.{Uri.EscapeDataString(document.AccessKey)}&schema_name=eq.{Uri.EscapeDataString(document.SchemaName)}",
                cancellationToken);
            if (byKey.ValueKind != JsonValueKind.Undefined) return byKey;
        }

        var byNsu = await GetSingleAsync(
            $"nfe_dfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(document.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(document.ClientId)}&certificate_id=eq.{Uri.EscapeDataString(document.CertificateId)}&nsu=eq.{Uri.EscapeDataString(document.Nsu)}&schema_name=eq.{Uri.EscapeDataString(document.SchemaName)}",
            cancellationToken);
        if (byNsu.ValueKind != JsonValueKind.Undefined) return byNsu;

        if (!string.IsNullOrWhiteSpace(document.XmlHash))
        {
            return await GetSingleAsync(
                $"nfe_dfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(document.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(document.ClientId)}&xml_hash=eq.{Uri.EscapeDataString(document.XmlHash)}",
                cancellationToken);
        }

        return default;
    }

    private static object DocumentBody(DfeDocumentWrite document) => new
    {
        access_key = document.AccessKey,
        active = true,
        authorization_date = document.AuthorizationDate,
        certificate_id = document.CertificateId,
        client_id = document.ClientId,
        direction = document.Direction,
        document_type = document.DocumentType,
        has_full_xml = document.HasFullXml,
        issue_date = document.IssueDate,
        issuer_cnpj = document.IssuerCnpj,
        issuer_name = document.IssuerName,
        manifestation_status = document.ManifestationStatus,
        nfe_status = document.NfeStatus,
        nsu = document.Nsu,
        organization_id = document.OrganizationId,
        recipient_cnpj = document.RecipientCnpj,
        recipient_name = document.RecipientName,
        schema_name = document.SchemaName,
        summary_data = document.SummaryData,
        total_value = document.TotalValue,
        xml_hash = document.XmlHash,
        xml_storage_path = document.XmlStoragePath
    };

    private async Task<JsonElement> GetRequiredSingleAsync(string path, string fallback, CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(path, cancellationToken);
        if (row.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException(fallback);
        }

        return row;
    }

    private async Task<JsonElement> GetSingleAsync(string path, CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(path.Contains("limit=") ? path : $"{path}&limit=1", cancellationToken);
        return rows.Count > 0 ? rows[0] : default;
    }

    private async Task<IReadOnlyList<JsonElement>> GetArrayAsync(string path, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Get, path);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a consulta DF-e: {response.StatusCode}.");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.EnumerateArray().Select(item => item.Clone()).ToList();
    }

    private async Task<JsonElement> PostAsync(
        string path,
        object body,
        CancellationToken cancellationToken,
        bool preferReturn = true)
    {
        using var request = RestRequest(HttpMethod.Post, path);
        request.Headers.Add("Prefer", preferReturn ? "return=representation" : "return=minimal");
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou o salvamento DF-e: {response.StatusCode}. {content}");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.Clone();
    }

    private async Task PatchAsync(string path, object body, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Patch, path);
        request.Headers.Add("Prefer", "return=minimal");
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Supabase recusou a atualizacao DF-e: {response.StatusCode}. {content}");
        }
    }

    private HttpRequestMessage RestRequest(HttpMethod method, string path)
    {
        EnsureConfigured();
        var separator = path.Contains('?') ? "&" : "?";
        var suffix = path.Contains("select=", StringComparison.OrdinalIgnoreCase) ? "" : $"{separator}select=*";
        var request = new HttpRequestMessage(method, $"{_supabaseUrl}/rest/v1/{path}{suffix}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        return request;
    }

    private static DfeSyncState MapSyncState(JsonElement row) => new()
    {
        CertificateId = Get(row, "certificate_id"),
        ClientId = Get(row, "client_id"),
        Cnpj = Get(row, "cnpj"),
        ConsecutiveErrors = GetInt(row, "consecutive_errors"),
        Environment = Get(row, "environment", "homologacao"),
        Id = Get(row, "id"),
        LastNsu = NormalizeNsu(Get(row, "last_nsu")),
        LastStatusCode = Get(row, "last_status_code"),
        LastStatusMessage = Get(row, "last_status_message"),
        LastSyncAt = GetDate(row, "last_sync_at"),
        LockedAt = GetDate(row, "locked_at"),
        LockToken = Get(row, "lock_token"),
        MaxNsu = NormalizeNsu(Get(row, "max_nsu")),
        NextAllowedSyncAt = GetDate(row, "next_allowed_sync_at"),
        OrganizationId = Get(row, "organization_id"),
        Status = Get(row, "status", "idle")
    };

    private static DfeDocument MapDocument(JsonElement row) => new()
    {
        AccessKey = Get(row, "access_key"),
        AuthorizationDate = GetDate(row, "authorization_date"),
        CertificateId = Get(row, "certificate_id"),
        ClientId = Get(row, "client_id"),
        Direction = Get(row, "direction"),
        DocumentType = Get(row, "document_type"),
        HasFullXml = GetBool(row, "has_full_xml"),
        Id = Get(row, "id"),
        IssueDate = GetDate(row, "issue_date"),
        IssuerCnpj = Get(row, "issuer_cnpj"),
        IssuerName = Get(row, "issuer_name"),
        ManifestationStatus = Get(row, "manifestation_status"),
        NfeStatus = Get(row, "nfe_status"),
        Nsu = Get(row, "nsu"),
        OrganizationId = Get(row, "organization_id"),
        RecipientCnpj = Get(row, "recipient_cnpj"),
        RecipientName = Get(row, "recipient_name"),
        SchemaName = Get(row, "schema_name"),
        SummaryData = row.TryGetProperty("summary_data", out var summary) ? summary.Clone() : default,
        TotalValue = GetDecimal(row, "total_value"),
        XmlHash = Get(row, "xml_hash"),
        XmlStoragePath = Get(row, "xml_storage_path")
    };

    private static StringContent JsonBody(object body) =>
        new(JsonSerializer.Serialize(body, NfeText.JsonOptions), Encoding.UTF8, "application/json");

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceKey))
        {
            throw new InvalidOperationException("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
        }
    }

    private static string NormalizeEnvironment(string value) =>
        value.Equals("producao", StringComparison.OrdinalIgnoreCase) || value == "1"
            ? "producao"
            : "homologacao";

    private static string NormalizeNsu(string value)
    {
        var digits = NfeText.Digits(value);
        return string.IsNullOrWhiteSpace(digits) ? "000000000000000" : digits.PadLeft(15, '0')[^15..];
    }

    private static string Get(JsonElement row, string property, string fallback = "") =>
        row.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ToString() ?? fallback
            : fallback;

    private static bool GetBool(JsonElement row, string property) =>
        row.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.True;

    private static int GetInt(JsonElement row, string property) =>
        row.TryGetProperty(property, out var value) && value.TryGetInt32(out var result) ? result : 0;

    private static decimal GetDecimal(JsonElement row, string property) =>
        row.TryGetProperty(property, out var value) && value.TryGetDecimal(out var result) ? result : 0;

    private static DateTimeOffset? GetDate(JsonElement row, string property) =>
        row.TryGetProperty(property, out var value) && DateTimeOffset.TryParse(value.ToString(), out var result)
            ? result
            : null;
}
