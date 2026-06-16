using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SupabaseAccountingRepository(IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _http = httpClientFactory.CreateClient();
    private readonly string _serviceKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY")
        ?? "";
    private readonly string _supabaseUrl = (Environment.GetEnvironmentVariable("SUPABASE_URL")
        ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL")
        ?? "").TrimEnd('/');

    public async Task<List<AccountingIntegrationDto>> ListIntegrationsAsync(
        string organizationId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"accounting_integrations?select=*&organization_id=eq.{Escape(organizationId)}&deleted_at=is.null&order=created_at.desc",
            cancellationToken);

        return rows.Select(MapIntegration).ToList();
    }

    public async Task<AccountingIntegrationDto> GetIntegrationAsync(
        string organizationId,
        string integrationId,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"accounting_integrations?select=*&organization_id=eq.{Escape(organizationId)}&id=eq.{Escape(integrationId)}&deleted_at=is.null",
            "Integracao contabil nao encontrada.",
            cancellationToken);

        return MapIntegration(row);
    }

    public async Task<AccountingIntegrationDto> CreateIntegrationAsync(
        AccountingIntegrationInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var rows = await PostAsync(
            "accounting_integrations",
            new
            {
                active = input.Active,
                automatic_sync = input.AutomaticSync,
                base_url = input.BaseUrl,
                connection_type = NormalizeConnectionType(input.ConnectionType),
                credentials_reference = input.CredentialsReference,
                created_by = userId,
                environment = NormalizeEnvironment(input.Environment),
                name = Require(input.Name, "Informe o nome da integracao."),
                next_sync_at = EmptyToNull(input.NextSyncAt),
                organization_id = Require(input.OrganizationId, "Organizacao obrigatoria."),
                provider = NormalizeProvider(input.Provider),
                settings = input.Settings ?? JsonDocument.Parse("{}").RootElement,
                status = NormalizeStatus(input.Status),
                sync_frequency = string.IsNullOrWhiteSpace(input.SyncFrequency) ? "manual" : input.SyncFrequency,
                updated_by = userId
            },
            cancellationToken);

        return MapIntegration(rows[0]);
    }

    public async Task<AccountingIntegrationDto> UpdateIntegrationAsync(
        string organizationId,
        string integrationId,
        AccountingIntegrationInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var rows = await PatchAsync(
            $"accounting_integrations?id=eq.{Escape(integrationId)}&organization_id=eq.{Escape(organizationId)}",
            new
            {
                active = input.Active,
                automatic_sync = input.AutomaticSync,
                base_url = input.BaseUrl,
                connection_type = NormalizeConnectionType(input.ConnectionType),
                credentials_reference = input.CredentialsReference,
                environment = NormalizeEnvironment(input.Environment),
                name = Require(input.Name, "Informe o nome da integracao."),
                next_sync_at = EmptyToNull(input.NextSyncAt),
                provider = NormalizeProvider(input.Provider),
                settings = input.Settings ?? JsonDocument.Parse("{}").RootElement,
                status = NormalizeStatus(input.Status),
                sync_frequency = string.IsNullOrWhiteSpace(input.SyncFrequency) ? "manual" : input.SyncFrequency,
                updated_by = userId
            },
            cancellationToken);

        return MapIntegration(rows[0]);
    }

    public async Task SoftDeleteIntegrationAsync(
        string organizationId,
        string integrationId,
        string userId,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"accounting_integrations?id=eq.{Escape(integrationId)}&organization_id=eq.{Escape(organizationId)}",
            new
            {
                active = false,
                deleted_at = DateTimeOffset.UtcNow,
                status = "paused",
                updated_by = userId
            },
            cancellationToken,
            preferReturn: false);
    }

    public async Task<List<AccountingIntegrationClientDto>> ListLinkedClientsAsync(
        string organizationId,
        string integrationId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"accounting_integration_clients?select=*,clients(company_name,cnpj)&organization_id=eq.{Escape(organizationId)}&integration_id=eq.{Escape(integrationId)}&deleted_at=is.null&order=linked_at.desc",
            cancellationToken);

        return rows.Select(MapIntegrationClient).ToList();
    }

    public async Task<AccountingIntegrationClientDto> LinkClientAsync(
        string integrationId,
        AccountingIntegrationClientInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var existing = await GetSingleAsync(
            $"accounting_integration_clients?select=id&organization_id=eq.{Escape(input.OrganizationId)}&integration_id=eq.{Escape(integrationId)}&client_id=eq.{Escape(input.ClientId)}&deleted_at=is.null",
            cancellationToken);
        var payload = new
        {
            client_id = Require(input.ClientId, "Cliente obrigatorio."),
            external_cnpj = input.ExternalCnpj,
            external_code = input.ExternalCode,
            external_company_id = input.ExternalCompanyId,
            external_company_name = input.ExternalCompanyName,
            integration_id = Require(integrationId, "Integracao obrigatoria."),
            linked_by = EmptyToNull(userId),
            metadata = new { },
            organization_id = Require(input.OrganizationId, "Organizacao obrigatoria."),
            status = string.IsNullOrWhiteSpace(input.Status) ? "linked" : input.Status
        };

        var rows = existing.ValueKind == JsonValueKind.Undefined
            ? await PostAsync("accounting_integration_clients", payload, cancellationToken)
            : await PatchAsync(
                $"accounting_integration_clients?id=eq.{Escape(Get(existing, "id"))}",
                new
            {
                    external_cnpj = payload.external_cnpj,
                    external_code = payload.external_code,
                    external_company_id = payload.external_company_id,
                    external_company_name = payload.external_company_name,
                    metadata = payload.metadata,
                    status = payload.status
            },
                cancellationToken);

        return MapIntegrationClient(rows[0]);
    }

    public async Task UnlinkClientAsync(
        string organizationId,
        string integrationId,
        string linkId,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"accounting_integration_clients?id=eq.{Escape(linkId)}&organization_id=eq.{Escape(organizationId)}&integration_id=eq.{Escape(integrationId)}",
            new { deleted_at = DateTimeOffset.UtcNow, status = "inactive" },
            cancellationToken,
            preferReturn: false);
    }

    public async Task<string> CreateSyncRunAsync(
        string organizationId,
        string integrationId,
        string clientId,
        string provider,
        string syncType,
        string correlationId,
        string userId,
        CancellationToken cancellationToken)
    {
        var rows = await PostAsync(
            "accounting_sync_runs",
            new
            {
                client_id = EmptyToNull(clientId),
                correlation_id = correlationId,
                initiated_by = EmptyToNull(userId),
                integration_id = EmptyToNull(integrationId),
                organization_id = organizationId,
                provider,
                status = "running",
                sync_type = syncType
            },
            cancellationToken);

        return Get(rows[0], "id");
    }

    public async Task CompleteSyncRunAsync(
        string syncRunId,
        string status,
        string message,
        int receivedCount,
        int createdCount,
        int updatedCount,
        int ignoredCount,
        int duplicateCount,
        int errorCount,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"accounting_sync_runs?id=eq.{Escape(syncRunId)}",
            new
            {
                created_count = createdCount,
                duplicate_count = duplicateCount,
                error_count = errorCount,
                finished_at = DateTimeOffset.UtcNow,
                ignored_count = ignoredCount,
                message,
                received_count = receivedCount,
                status,
                updated_count = updatedCount
            },
            cancellationToken,
            preferReturn: false);
    }

    public async Task<List<AccountingSyncRunDto>> ListSyncRunsAsync(
        string organizationId,
        string integrationId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"accounting_sync_runs?select=*&organization_id=eq.{Escape(organizationId)}&integration_id=eq.{Escape(integrationId)}&order=started_at.desc&limit=50",
            cancellationToken);

        return rows.Select(MapSyncRun).ToList();
    }

    public async Task<string> CreateImportBatchAsync(
        AccountingImportPreviewRequest request,
        AccountingImportPreviewResult preview,
        string fileHash,
        string userId,
        CancellationToken cancellationToken)
    {
        var rows = await PostAsync(
            "accounting_import_batches",
            new
            {
                client_id = EmptyToNull(request.ClientId),
                column_mapping = request.ColumnMapping,
                competence = EmptyToNull(NormalizeDate(request.Competence)),
                file_format = AccountingImportParser.NormalizeFormat(request.FileFormat, request.FileName),
                file_hash = fileHash,
                file_name = request.FileName,
                integration_id = EmptyToNull(request.IntegrationId),
                invalid_rows = preview.InvalidRows,
                metadata = new { },
                organization_id = request.OrganizationId,
                preview_data = preview.Rows,
                provider = request.Provider,
                record_type = request.RecordType,
                status = "preview",
                template_id = EmptyToNull(request.TemplateId),
                total_rows = preview.TotalRows,
                valid_rows = preview.ValidRows,
                created_by = userId
            },
            cancellationToken);

        return Get(rows[0], "id");
    }

    public async Task SaveImportErrorsAsync(
        string organizationId,
        string batchId,
        IReadOnlyList<AccountingImportError> errors,
        CancellationToken cancellationToken)
    {
        if (errors.Count == 0)
        {
            return;
        }

        await PostAsync(
            "accounting_import_errors",
            errors.Select(error => new
            {
                batch_id = batchId,
                expected_fix = error.ExpectedFix,
                field_name = error.FieldName,
                field_value = error.FieldValue,
                organization_id = organizationId,
                reason = error.Reason,
                row_number = error.RowNumber,
                severity = error.Severity
            }).ToArray(),
            cancellationToken,
            preferReturn: false);
    }

    public async Task<(AccountingImportPreviewRequest Request, List<AccountingImportPreviewRow> Rows)> GetImportBatchForConfirmAsync(
        string organizationId,
        string batchId,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"accounting_import_batches?select=*&organization_id=eq.{Escape(organizationId)}&id=eq.{Escape(batchId)}",
            "Lote de importacao nao encontrado.",
            cancellationToken);

        var rows = row.TryGetProperty("preview_data", out var previewElement)
            ? JsonSerializer.Deserialize<List<AccountingImportPreviewRow>>(previewElement.GetRawText(), NfeText.JsonOptions) ?? []
            : [];

        var request = new AccountingImportPreviewRequest
        {
            ClientId = Get(row, "client_id"),
            Competence = Get(row, "competence"),
            FileFormat = Get(row, "file_format"),
            FileName = Get(row, "file_name"),
            IntegrationId = Get(row, "integration_id"),
            OrganizationId = Get(row, "organization_id"),
            Provider = Get(row, "provider", "manual"),
            RecordType = Get(row, "record_type", "tax"),
            TemplateId = Get(row, "template_id")
        };

        return (request, rows);
    }

    public async Task<AccountingImportConfirmResult> ConfirmImportBatchAsync(
        string organizationId,
        string batchId,
        string userId,
        CancellationToken cancellationToken)
    {
        var (request, rows) = await GetImportBatchForConfirmAsync(organizationId, batchId, cancellationToken);
        var validRows = rows.Where(row => row.Valid).ToList();
        var createdRows = 0;
        var duplicateRows = 0;
        var errorRows = rows.Count(row => !row.Valid);

        foreach (var row in validRows)
        {
            var clientId = string.IsNullOrWhiteSpace(request.ClientId)
                ? await FindClientIdByCnpjAsync(organizationId, row.Mapped.GetValueOrDefault("cnpj", ""), cancellationToken)
                : request.ClientId;

            if (string.IsNullOrWhiteSpace(clientId))
            {
                errorRows++;
                continue;
            }

            if (request.RecordType.Equals("obligation", StringComparison.OrdinalIgnoreCase))
            {
                var inserted = await UpsertObligationAsync(request, row.Mapped, clientId, userId, cancellationToken);
                if (inserted) createdRows++; else duplicateRows++;
            }
            else
            {
                var inserted = await UpsertTaxRecordAsync(request, row.Mapped, clientId, userId, cancellationToken);
                if (inserted) createdRows++; else duplicateRows++;
            }
        }

        await PatchAsync(
            $"accounting_import_batches?id=eq.{Escape(batchId)}&organization_id=eq.{Escape(organizationId)}",
            new
            {
                confirmed_at = DateTimeOffset.UtcNow,
                confirmed_by = userId,
                created_rows = createdRows,
                duplicate_rows = duplicateRows,
                invalid_rows = errorRows,
                status = errorRows > 0 ? "completed_with_errors" : "completed"
            },
            cancellationToken,
            preferReturn: false);

        return new AccountingImportConfirmResult
        {
            Ok = errorRows == 0,
            BatchId = batchId,
            Message = errorRows == 0 ? "Importacao confirmada com sucesso." : "Importacao concluida com pendencias.",
            CreatedRows = createdRows,
            DuplicateRows = duplicateRows,
            ErrorRows = errorRows
        };
    }

    public async Task<List<AccountingImportError>> ListImportErrorsAsync(
        string organizationId,
        string batchId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"accounting_import_errors?select=*&organization_id=eq.{Escape(organizationId)}&batch_id=eq.{Escape(batchId)}&order=row_number.asc",
            cancellationToken);

        return rows.Select(row => new AccountingImportError
        {
            ExpectedFix = Get(row, "expected_fix"),
            FieldName = Get(row, "field_name"),
            FieldValue = Get(row, "field_value"),
            Reason = Get(row, "reason"),
            RowNumber = GetInt(row, "row_number"),
            Severity = Get(row, "severity", "error")
        }).ToList();
    }

    public async Task<List<AccountingTaxRecordDto>> ListTaxRecordsAsync(
        string organizationId,
        string? clientId,
        string? competence,
        string? status,
        CancellationToken cancellationToken)
    {
        var path = new StringBuilder($"accounting_tax_records?select=*&organization_id=eq.{Escape(organizationId)}&deleted_at=is.null");
        if (!string.IsNullOrWhiteSpace(clientId)) path.Append($"&client_id=eq.{Escape(clientId)}");
        if (!string.IsNullOrWhiteSpace(competence)) path.Append($"&competence=eq.{Escape(NormalizeDate(competence))}");
        if (!string.IsNullOrWhiteSpace(status)) path.Append($"&status=eq.{Escape(status)}");
        path.Append("&order=due_date.asc,competence.desc&limit=200");

        var rows = await GetArrayAsync(path.ToString(), cancellationToken);
        return rows.Select(MapTaxRecord).ToList();
    }

    public async Task<List<AccountingObligationDto>> ListObligationsAsync(
        string organizationId,
        string? clientId,
        string? competence,
        string? status,
        CancellationToken cancellationToken)
    {
        var path = new StringBuilder($"accounting_obligations?select=*&organization_id=eq.{Escape(organizationId)}&deleted_at=is.null");
        if (!string.IsNullOrWhiteSpace(clientId)) path.Append($"&client_id=eq.{Escape(clientId)}");
        if (!string.IsNullOrWhiteSpace(competence)) path.Append($"&competence=eq.{Escape(NormalizeDate(competence))}");
        if (!string.IsNullOrWhiteSpace(status)) path.Append($"&status=eq.{Escape(status)}");
        path.Append("&order=due_date.asc,competence.desc&limit=200");

        var rows = await GetArrayAsync(path.ToString(), cancellationToken);
        return rows.Select(MapObligation).ToList();
    }

    public async Task<List<JsonElement>> ListGenericRecordsAsync(
        string tableName,
        string organizationId,
        string? clientId,
        CancellationToken cancellationToken)
    {
        var safeTable = tableName switch
        {
            "documents" => "accounting_documents",
            "payroll" => "accounting_payroll_records",
            "statements" => "accounting_statements",
            _ => throw new InvalidOperationException("Tipo de consulta contabil nao suportado.")
        };

        var path = new StringBuilder($"{safeTable}?select=*&organization_id=eq.{Escape(organizationId)}&deleted_at=is.null");
        if (!string.IsNullOrWhiteSpace(clientId)) path.Append($"&client_id=eq.{Escape(clientId)}");
        path.Append("&order=created_at.desc&limit=200");

        return await GetArrayAsync(path.ToString(), cancellationToken);
    }

    private async Task<string> FindClientIdByCnpjAsync(
        string organizationId,
        string cnpj,
        CancellationToken cancellationToken)
    {
        var digits = NfeText.Digits(cnpj);
        if (digits.Length != 14)
        {
            return "";
        }

        var rows = await GetArrayAsync(
            $"clients?select=id,cnpj&organization_id=eq.{Escape(organizationId)}",
            cancellationToken);

        var match = rows.FirstOrDefault(row => NfeText.Digits(Get(row, "cnpj")) == digits);
        return match.ValueKind == JsonValueKind.Undefined ? "" : Get(match, "id");
    }

    private async Task<bool> UpsertTaxRecordAsync(
        AccountingImportPreviewRequest request,
        Dictionary<string, string> mapped,
        string clientId,
        string userId,
        CancellationToken cancellationToken)
    {
        var idempotency = BuildIdempotencyKey(request, mapped, clientId);
        var existing = await GetSingleAsync(
            $"accounting_tax_records?select=id&organization_id=eq.{Escape(request.OrganizationId)}&idempotency_key=eq.{Escape(idempotency)}&deleted_at=is.null",
            cancellationToken);
        var isNew = existing.ValueKind == JsonValueKind.Undefined;

        AccountingImportParser.TryParseDecimal(mapped.GetValueOrDefault("amount", "0"), out var amount);
        var payload = new
            {
                amount,
                barcode = mapped.GetValueOrDefault("barcode", ""),
                calculation_date = EmptyToNull(NormalizeDate(mapped.GetValueOrDefault("calculationDate", ""))),
                client_id = clientId,
                competence = NormalizeDate(mapped.GetValueOrDefault("competence", request.Competence)),
                created_by = userId,
                description = mapped.GetValueOrDefault("description", ""),
                document_url = mapped.GetValueOrDefault("documentUrl", ""),
                due_date = EmptyToNull(NormalizeDate(mapped.GetValueOrDefault("dueDate", ""))),
                external_id = mapped.GetValueOrDefault("externalId", ""),
                idempotency_key = idempotency,
                integration_id = EmptyToNull(request.IntegrationId),
                metadata = mapped,
                organization_id = request.OrganizationId,
                pix_code = mapped.GetValueOrDefault("pixCode", ""),
                provider = request.Provider,
                source = "manual_import",
                status = NormalizeRecordStatus(mapped.GetValueOrDefault("status", "pending")),
                tax_type = mapped.GetValueOrDefault("taxType", "Imposto"),
                updated_by = userId
            };

        if (isNew)
        {
            await PostAsync("accounting_tax_records", payload, cancellationToken, preferReturn: false);
        }
        else
        {
            await PatchAsync(
                $"accounting_tax_records?id=eq.{Escape(Get(existing, "id"))}",
                payload,
                cancellationToken,
                preferReturn: false);
        }

        return isNew;
    }

    private async Task<bool> UpsertObligationAsync(
        AccountingImportPreviewRequest request,
        Dictionary<string, string> mapped,
        string clientId,
        string userId,
        CancellationToken cancellationToken)
    {
        var idempotency = BuildIdempotencyKey(request, mapped, clientId);
        var existing = await GetSingleAsync(
            $"accounting_obligations?select=id&organization_id=eq.{Escape(request.OrganizationId)}&idempotency_key=eq.{Escape(idempotency)}&deleted_at=is.null",
            cancellationToken);
        var isNew = existing.ValueKind == JsonValueKind.Undefined;

        var payload = new
            {
                client_id = clientId,
                competence = NormalizeDate(mapped.GetValueOrDefault("competence", request.Competence)),
                created_by = userId,
                delivery_date = EmptyToNull(NormalizeDate(mapped.GetValueOrDefault("deliveryDate", ""))),
                due_date = EmptyToNull(NormalizeDate(mapped.GetValueOrDefault("dueDate", ""))),
                external_id = mapped.GetValueOrDefault("externalId", ""),
                idempotency_key = idempotency,
                integration_id = EmptyToNull(request.IntegrationId),
                metadata = mapped,
                obligation_type = mapped.GetValueOrDefault("obligationType", "Obrigacao"),
                organization_id = request.OrganizationId,
                protocol = mapped.GetValueOrDefault("protocol", ""),
                provider = request.Provider,
                status = NormalizeObligationStatus(mapped.GetValueOrDefault("status", "pending")),
                updated_by = userId
            };

        if (isNew)
        {
            await PostAsync("accounting_obligations", payload, cancellationToken, preferReturn: false);
        }
        else
        {
            await PatchAsync(
                $"accounting_obligations?id=eq.{Escape(Get(existing, "id"))}",
                payload,
                cancellationToken,
                preferReturn: false);
        }

        return isNew;
    }

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
        var rows = await GetArrayAsync($"{path}{(path.Contains('?') ? "&" : "?")}limit=1", cancellationToken);
        return rows.Count == 0 ? default : rows[0];
    }

    private async Task<List<JsonElement>> GetArrayAsync(string path, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Get, path);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a consulta contabil: {response.StatusCode}. {content}");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.ValueKind == JsonValueKind.Array
            ? document.RootElement.EnumerateArray().Select(item => item.Clone()).ToList()
            : [];
    }

    private async Task<JsonElement> PostAsync(
        string path,
        object body,
        CancellationToken cancellationToken,
        string? prefer = null,
        bool preferReturn = true)
    {
        using var request = RestRequest(HttpMethod.Post, path);
        request.Headers.Add("Prefer", prefer ?? (preferReturn ? "return=representation" : "return=minimal"));
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou o salvamento contabil: {response.StatusCode}. {content}");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.Clone();
    }

    private async Task<JsonElement> PatchAsync(
        string path,
        object body,
        CancellationToken cancellationToken,
        bool preferReturn = true)
    {
        using var request = RestRequest(HttpMethod.Patch, path);
        request.Headers.Add("Prefer", preferReturn ? "return=representation" : "return=minimal");
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a atualizacao contabil: {response.StatusCode}. {content}");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.Clone();
    }

    private HttpRequestMessage RestRequest(HttpMethod method, string path)
    {
        EnsureConfigured();
        var request = new HttpRequestMessage(method, $"{_supabaseUrl}/rest/v1/{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        return request;
    }

    private static StringContent JsonBody(object body) =>
        new(JsonSerializer.Serialize(body, NfeText.JsonOptions), Encoding.UTF8, "application/json");

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceKey))
        {
            throw new InvalidOperationException("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
        }
    }

    private static AccountingIntegrationDto MapIntegration(JsonElement row) => new()
    {
        Active = GetBool(row, "active"),
        AutomaticSync = GetBool(row, "automatic_sync"),
        BaseUrl = Get(row, "base_url"),
        ConnectionType = Get(row, "connection_type", "manual"),
        CreatedAt = Get(row, "created_at"),
        CredentialsReference = Get(row, "credentials_reference"),
        Environment = Get(row, "environment", "production"),
        Id = Get(row, "id"),
        LastSyncAt = Get(row, "last_sync_at"),
        Name = Get(row, "name"),
        NextSyncAt = Get(row, "next_sync_at"),
        OrganizationId = Get(row, "organization_id"),
        Provider = Get(row, "provider", "manual"),
        Settings = row.TryGetProperty("settings", out var settings) ? settings.Clone() : JsonDocument.Parse("{}").RootElement.Clone(),
        Status = Get(row, "status", "draft"),
        SyncFrequency = Get(row, "sync_frequency", "manual"),
        UpdatedAt = Get(row, "updated_at")
    };

    private static AccountingIntegrationClientDto MapIntegrationClient(JsonElement row)
    {
        var client = row.TryGetProperty("clients", out var clients) && clients.ValueKind == JsonValueKind.Object
            ? clients
            : default;

        return new AccountingIntegrationClientDto
        {
            ClientCnpj = client.ValueKind == JsonValueKind.Object ? Get(client, "cnpj") : "",
            ClientId = Get(row, "client_id"),
            ClientName = client.ValueKind == JsonValueKind.Object ? Get(client, "company_name") : "",
            ExternalCnpj = Get(row, "external_cnpj"),
            ExternalCode = Get(row, "external_code"),
            ExternalCompanyId = Get(row, "external_company_id"),
            ExternalCompanyName = Get(row, "external_company_name"),
            Id = Get(row, "id"),
            IntegrationId = Get(row, "integration_id"),
            LinkedAt = Get(row, "linked_at"),
            OrganizationId = Get(row, "organization_id"),
            Status = Get(row, "status", "linked")
        };
    }

    private static AccountingSyncRunDto MapSyncRun(JsonElement row) => new()
    {
        ClientId = Get(row, "client_id"),
        CorrelationId = Get(row, "correlation_id"),
        CreatedCount = GetInt(row, "created_count"),
        DuplicateCount = GetInt(row, "duplicate_count"),
        ErrorCount = GetInt(row, "error_count"),
        FinishedAt = Get(row, "finished_at"),
        Id = Get(row, "id"),
        IgnoredCount = GetInt(row, "ignored_count"),
        IntegrationId = Get(row, "integration_id"),
        Message = Get(row, "message"),
        OrganizationId = Get(row, "organization_id"),
        Provider = Get(row, "provider", "manual"),
        ReceivedCount = GetInt(row, "received_count"),
        StartedAt = Get(row, "started_at"),
        Status = Get(row, "status"),
        SyncType = Get(row, "sync_type"),
        UpdatedCount = GetInt(row, "updated_count")
    };

    private static AccountingTaxRecordDto MapTaxRecord(JsonElement row) => new()
    {
        Amount = GetDecimal(row, "amount"),
        Barcode = Get(row, "barcode"),
        CalculationDate = Get(row, "calculation_date"),
        ClientId = Get(row, "client_id"),
        Competence = Get(row, "competence"),
        Description = Get(row, "description"),
        DocumentUrl = Get(row, "document_url"),
        DueDate = Get(row, "due_date"),
        ExternalId = Get(row, "external_id"),
        Id = Get(row, "id"),
        IntegrationId = Get(row, "integration_id"),
        OrganizationId = Get(row, "organization_id"),
        PixCode = Get(row, "pix_code"),
        Provider = Get(row, "provider"),
        Source = Get(row, "source"),
        Status = Get(row, "status"),
        TaxType = Get(row, "tax_type")
    };

    private static AccountingObligationDto MapObligation(JsonElement row) => new()
    {
        ClientId = Get(row, "client_id"),
        Competence = Get(row, "competence"),
        DeliveryDate = Get(row, "delivery_date"),
        DueDate = Get(row, "due_date"),
        Id = Get(row, "id"),
        IntegrationId = Get(row, "integration_id"),
        ObligationType = Get(row, "obligation_type"),
        OrganizationId = Get(row, "organization_id"),
        Protocol = Get(row, "protocol"),
        Provider = Get(row, "provider"),
        Status = Get(row, "status")
    };

    private static string BuildIdempotencyKey(
        AccountingImportPreviewRequest request,
        IReadOnlyDictionary<string, string> mapped,
        string clientId)
    {
        var externalId = mapped.GetValueOrDefault("externalId", "");
        var source = string.IsNullOrWhiteSpace(externalId)
            ? string.Join("|", [
                request.OrganizationId,
                request.IntegrationId,
                clientId,
                request.Provider,
                request.RecordType,
                mapped.GetValueOrDefault("competence", ""),
                mapped.GetValueOrDefault("taxType", mapped.GetValueOrDefault("obligationType", "")),
                mapped.GetValueOrDefault("dueDate", ""),
                mapped.GetValueOrDefault("amount", "")
            ])
            : string.Join("|", request.OrganizationId, request.IntegrationId, clientId, request.Provider, externalId);

        return AccountingImportParser.HashContent(source);
    }

    private static string NormalizeDate(string value)
    {
        return AccountingImportParser.TryParseDate(value, out var date) ? date.ToString("yyyy-MM-dd") : value;
    }

    private static string NormalizeProvider(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "netspeed" => "netspeed",
            "dominio" => "dominio",
            "alterdata" => "alterdata",
            "sci" => "sci",
            "questor" => "questor",
            "contmatic" => "contmatic",
            "generic" => "generic",
            _ => "manual"
        };

    private static string NormalizeConnectionType(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "api" => "api",
            "webservice" => "webservice",
            "file_import" => "file_import",
            "local_connector" => "local_connector",
            _ => "manual"
        };

    private static string NormalizeEnvironment(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "sandbox" => "sandbox",
            "homologation" => "homologation",
            _ => "production"
        };

    private static string NormalizeStatus(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "active" => "active",
            "disconnected" => "disconnected",
            "error" => "error",
            "paused" => "paused",
            _ => "draft"
        };

    private static string NormalizeRecordStatus(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "pago" or "paid" => "paid",
            "vencido" or "overdue" => "overdue",
            "enviado" or "sent" => "sent",
            "visualizado" or "viewed" => "viewed",
            "cancelado" or "cancelled" => "cancelled",
            "disponivel" or "available" => "available",
            _ => "pending"
        };

    private static string NormalizeObligationStatus(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "entregue" or "delivered" => "delivered",
            "em andamento" or "in_progress" => "in_progress",
            "atrasado" or "late" => "late",
            "cancelado" or "cancelled" => "cancelled",
            _ => "pending"
        };

    private static object? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static string Require(string value, string message)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(message);
        }

        return value.Trim();
    }

    private static string Escape(string value) => Uri.EscapeDataString(value);

    private static string Get(JsonElement row, string property, string fallback = "")
    {
        return row.TryGetProperty(property, out var value) && value.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined
            ? value.ToString() ?? fallback
            : fallback;
    }

    private static bool GetBool(JsonElement row, string property)
    {
        return row.TryGetProperty(property, out var value)
            && value.ValueKind == JsonValueKind.True;
    }

    private static int GetInt(JsonElement row, string property)
    {
        return row.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : 0;
    }

    private static decimal GetDecimal(JsonElement row, string property)
    {
        return row.TryGetProperty(property, out var value) && value.TryGetDecimal(out var number) ? number : 0;
    }
}
