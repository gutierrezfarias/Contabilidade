using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SupabaseFiscalRepository(IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _http = httpClientFactory.CreateClient();
    private readonly string _serviceKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY")
        ?? "";
    private readonly string _supabaseUrl = (Environment.GetEnvironmentVariable("SUPABASE_URL")
        ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL")
        ?? "").TrimEnd('/');

    public async Task<List<NcmCatalogItem>> SearchNcmAsync(string query, int limit, CancellationToken cancellationToken)
    {
        EnsureConfigured();

        var normalized = NfeText.Digits(query);
        var safeLimit = Math.Clamp(limit, 1, 50);
        var path = string.IsNullOrWhiteSpace(normalized)
            ? $"ncm_catalog?select=*&is_active=eq.true&description=ilike.*{Uri.EscapeDataString(query.Trim())}*&limit={safeLimit}&order=code.asc"
            : $"ncm_catalog?select=*&is_active=eq.true&or=(code.ilike.*{Uri.EscapeDataString(normalized)}*,formatted_code.ilike.*{Uri.EscapeDataString(query.Trim())}*)&limit={safeLimit}&order=code.asc";

        var rows = await GetArrayAsync(path, cancellationToken);
        return rows.Select(MapNcm).ToList();
    }

    public async Task<NcmCatalogItem?> GetNcmAsync(string code, CancellationToken cancellationToken)
    {
        var normalized = NfeText.Digits(code);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var rows = await GetArrayAsync(
            $"ncm_catalog?select=*&code=eq.{Uri.EscapeDataString(normalized)}&limit=1",
            cancellationToken);

        return rows.Count == 0 ? null : MapNcm(rows[0]);
    }

    public async Task<NcmSyncStatus?> GetLatestNcmSyncStatusAsync(CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            "ncm_sync_jobs?select=*&order=created_at.desc&limit=1",
            cancellationToken);

        return rows.Count == 0 ? null : new NcmSyncStatus
        {
            CreatedAt = FiscalJson.Get(rows[0], "created_at"),
            DeactivatedCodes = FiscalJson.GetInt(rows[0], "deactivated_codes"),
            ErrorMessage = FiscalJson.Get(rows[0], "error_message"),
            FinishedAt = FiscalJson.Get(rows[0], "finished_at"),
            InsertedCodes = FiscalJson.GetInt(rows[0], "inserted_codes"),
            StartedAt = FiscalJson.Get(rows[0], "started_at"),
            Status = FiscalJson.Get(rows[0], "status", "Pendente"),
            TotalCodes = FiscalJson.GetInt(rows[0], "total_codes"),
            UpdatedCodes = FiscalJson.GetInt(rows[0], "updated_codes")
        };
    }

    public async Task<string> StartNcmSyncJobAsync(string userId, CancellationToken cancellationToken)
    {
        var rows = await PostAsync(
            "ncm_sync_jobs",
            new
            {
                created_by = string.IsNullOrWhiteSpace(userId) ? null : userId,
                started_at = DateTimeOffset.UtcNow,
                status = "Executando"
            },
            cancellationToken);

        return rows[0].GetProperty("id").GetString() ?? "";
    }

    public async Task CompleteNcmSyncJobAsync(
        string jobId,
        int totalCodes,
        int insertedCodes,
        int updatedCodes,
        int deactivatedCodes,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"ncm_sync_jobs?id=eq.{Uri.EscapeDataString(jobId)}",
            new
            {
                deactivated_codes = deactivatedCodes,
                finished_at = DateTimeOffset.UtcNow,
                inserted_codes = insertedCodes,
                status = "Concluido",
                total_codes = totalCodes,
                updated_codes = updatedCodes
            },
            cancellationToken);
    }

    public async Task FailNcmSyncJobAsync(string jobId, string message, CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"ncm_sync_jobs?id=eq.{Uri.EscapeDataString(jobId)}",
            new
            {
                error_message = message,
                finished_at = DateTimeOffset.UtcNow,
                status = "Falha"
            },
            cancellationToken);
    }

    public async Task UpsertNcmCatalogAsync(IReadOnlyList<NcmCatalogItem> items, CancellationToken cancellationToken)
    {
        foreach (var chunk in items.Chunk(500))
        {
            await PostAsync(
                "ncm_catalog?on_conflict=code",
                chunk.Select(item => new
                {
                    code = item.Code,
                    description = item.Description,
                    end_date = item.EndDate?.ToString("yyyy-MM-dd"),
                    formatted_code = item.FormattedCode,
                    is_active = item.IsActive,
                    source = "Siscomex",
                    source_updated_at = item.SourceUpdatedAt,
                    start_date = item.StartDate?.ToString("yyyy-MM-dd"),
                    updated_at = DateTimeOffset.UtcNow
                }).ToArray(),
                cancellationToken,
                prefer: "resolution=merge-duplicates,return=minimal");
        }
    }

    public async Task<int> CountActiveNcmAsync(CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Get, "ncm_catalog?select=id&is_active=eq.true&limit=1");
        request.Headers.Add("Prefer", "count=exact");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a consulta NCM: {response.StatusCode}.");
        }

        var range = response.Headers.TryGetValues("Content-Range", out var values)
            ? values.FirstOrDefault() ?? ""
            : "";
        var total = range.Split('/').LastOrDefault();
        return int.TryParse(total, out var parsed) ? parsed : 0;
    }

    public async Task<FiscalCompanyProfile?> GetFiscalProfileAsync(
        string organizationId,
        string clientId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"fiscal_company_profiles?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&limit=1",
            cancellationToken);

        if (rows.Count == 0)
        {
            return null;
        }

        var row = rows[0];
        return new FiscalCompanyProfile
        {
            Active = FiscalJson.GetBool(row, "active"),
            ApprovalStatus = FiscalJson.Get(row, "approval_status"),
            CityIbgeCode = FiscalJson.Get(row, "city_ibge_code"),
            ClientId = FiscalJson.Get(row, "client_id"),
            Crt = FiscalJson.Get(row, "crt"),
            Id = FiscalJson.Get(row, "id"),
            OrganizationId = FiscalJson.Get(row, "organization_id"),
            StateUf = FiscalJson.Get(row, "state_uf"),
            TaxRegime = FiscalJson.Get(row, "tax_regime")
        };
    }

    public async Task<List<FiscalRule>> ListActiveRulesAsync(
        string organizationId,
        string clientId,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
        var rows = await GetArrayAsync(
            $"fiscal_rules?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&active=eq.true&approval_status=eq.Aprovada&start_date=lte.{today}&order=priority.asc,rule_code.asc,version.desc",
            cancellationToken);

        return rows
            .Select(MapFiscalRule)
            .Where(rule => rule.EndDate is null || rule.EndDate >= DateOnly.FromDateTime(DateTime.UtcNow))
            .ToList();
    }

    public async Task<List<FiscalRule>> ListRulesAsync(
        string organizationId,
        string clientId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"fiscal_rules?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&order=priority.asc,rule_code.asc,version.desc",
            cancellationToken);

        return rows.Select(MapFiscalRule).ToList();
    }

    public async Task<List<FiscalProduct>> ListFiscalProductsAsync(
        string organizationId,
        string clientId,
        CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            $"fiscal_products?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&order=product_code.asc",
            cancellationToken);

        return rows.Select(MapFiscalProduct).ToList();
    }

    public async Task SaveFiscalConflictAsync(FiscalConflictWrite conflict, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(conflict.OrganizationId)
            || string.IsNullOrWhiteSpace(conflict.ClientId)
            || string.IsNullOrWhiteSpace(conflict.RuleId)
            || string.IsNullOrWhiteSpace(conflict.ConflictingRuleId)
            || string.IsNullOrWhiteSpace(conflict.ConflictKey))
        {
            return;
        }

        var existing = await GetArrayAsync(
            $"fiscal_rule_conflicts?select=id&organization_id=eq.{Uri.EscapeDataString(conflict.OrganizationId)}&client_id=eq.{Uri.EscapeDataString(conflict.ClientId)}&conflict_key=eq.{Uri.EscapeDataString(conflict.ConflictKey)}&resolution_status=eq.pendente&limit=1",
            cancellationToken);

        if (existing.Count > 0)
        {
            return;
        }

        try
        {
            await PostAsync(
                "fiscal_rule_conflicts",
                new
                {
                    cest = NfeText.Digits(conflict.Cest),
                    client_id = conflict.ClientId,
                    conflict_key = conflict.ConflictKey,
                    conflicting_rule_id = conflict.ConflictingRuleId,
                    created_by = string.IsNullOrWhiteSpace(conflict.CreatedBy) ? null : conflict.CreatedBy,
                    ncm = NfeText.Digits(conflict.Ncm),
                    organization_id = conflict.OrganizationId,
                    product_code = conflict.ProductCode,
                    product_id = string.IsNullOrWhiteSpace(conflict.ProductId) ? null : conflict.ProductId,
                    reason = conflict.Reason,
                    resolution_status = "pendente",
                    rule_id = conflict.RuleId,
                    severity = "Bloqueio"
                },
                cancellationToken,
                prefer: "return=minimal");
        }
        catch (InvalidOperationException error) when (error.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
            || error.Message.Contains("23505", StringComparison.OrdinalIgnoreCase))
        {
            // Outro request registrou o mesmo conflito ao mesmo tempo.
        }
    }

    public async Task SaveAuditAsync(FiscalAuditWrite audit, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(audit.OrganizationId)
            || string.IsNullOrWhiteSpace(audit.ClientId)
            || string.IsNullOrWhiteSpace(audit.EntityType)
            || string.IsNullOrWhiteSpace(audit.Action))
        {
            return;
        }

        await PostAsync(
            "fiscal_audit_logs",
            new
            {
                action = audit.Action,
                client_id = audit.ClientId,
                created_by = string.IsNullOrWhiteSpace(audit.CreatedBy) ? null : audit.CreatedBy,
                entity_id = string.IsNullOrWhiteSpace(audit.EntityId) ? null : audit.EntityId,
                entity_type = audit.EntityType,
                metadata = audit.Metadata,
                new_data = audit.NewData,
                old_data = audit.OldData,
                organization_id = audit.OrganizationId,
                origin = audit.Origin,
                reason = audit.Reason
            },
            cancellationToken,
            prefer: "return=minimal");
    }

    private async Task<List<JsonElement>> GetArrayAsync(string path, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Get, path);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a consulta fiscal: {response.StatusCode}.");
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
        string prefer = "return=representation")
    {
        using var request = RestRequest(HttpMethod.Post, path);
        request.Headers.Add("Prefer", prefer);
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou o salvamento fiscal: {response.StatusCode}. {content}");
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
            throw new InvalidOperationException($"Supabase recusou a atualizacao fiscal: {response.StatusCode}. {content}");
        }
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

    private static NcmCatalogItem MapNcm(JsonElement row)
    {
        return new NcmCatalogItem
        {
            Code = FiscalJson.Get(row, "code"),
            Description = FiscalJson.Get(row, "description"),
            EndDate = FiscalJson.GetDate(row, "end_date"),
            FormattedCode = FiscalJson.Get(row, "formatted_code"),
            IsActive = FiscalJson.GetBool(row, "is_active"),
            SourceUpdatedAt = DateTimeOffset.TryParse(FiscalJson.Get(row, "source_updated_at"), out var sourceDate)
                ? sourceDate
                : null,
            StartDate = FiscalJson.GetDate(row, "start_date")
        };
    }

    private static FiscalRule MapFiscalRule(JsonElement row)
    {
        return new FiscalRule
        {
            Active = FiscalJson.GetBool(row, "active"),
            ApprovalStatus = FiscalJson.Get(row, "approval_status"),
            Cest = FiscalJson.Get(row, "cest"),
            Cfop = FiscalJson.Get(row, "cfop"),
            CofinsCst = FiscalJson.Get(row, "cofins_cst"),
            CofinsRate = FiscalJson.GetDecimal(row, "cofins_rate"),
            DestinationUf = FiscalJson.Get(row, "destination_uf"),
            Direction = FiscalJson.Get(row, "direction"),
            EndDate = FiscalJson.GetDate(row, "end_date"),
            FcpRate = FiscalJson.GetDecimal(row, "fcp_rate"),
            FinalConsumer = row.TryGetProperty("final_consumer", out var finalConsumer) && finalConsumer.ValueKind != JsonValueKind.Null
                ? finalConsumer.GetBoolean()
                : null,
            FiscalBenefitCode = FiscalJson.Get(row, "fiscal_benefit_code"),
            GroupId = FiscalJson.Get(row, "group_id"),
            HasIcmsSt = FiscalJson.GetBool(row, "has_icms_st"),
            IcmsBaseMode = FiscalJson.Get(row, "icms_base_mode"),
            IcmsBaseReduction = FiscalJson.GetDecimal(row, "icms_base_reduction"),
            IcmsCsosn = FiscalJson.Get(row, "icms_csosn"),
            IcmsCst = FiscalJson.Get(row, "icms_cst"),
            IcmsRate = FiscalJson.GetDecimal(row, "icms_rate"),
            Id = FiscalJson.Get(row, "id"),
            IpiCst = FiscalJson.Get(row, "ipi_cst"),
            IpiRate = FiscalJson.GetDecimal(row, "ipi_rate"),
            MerchandiseOrigin = FiscalJson.Get(row, "merchandise_origin"),
            MvaRate = FiscalJson.GetDecimal(row, "mva_rate"),
            Name = FiscalJson.Get(row, "name"),
            Ncm = FiscalJson.Get(row, "ncm"),
            NfePurpose = FiscalJson.Get(row, "nfe_purpose"),
            OriginUf = FiscalJson.Get(row, "origin_uf"),
            PisCst = FiscalJson.Get(row, "pis_cst"),
            PisRate = FiscalJson.GetDecimal(row, "pis_rate"),
            Priority = FiscalJson.GetInt(row, "priority", 100),
            ProductId = FiscalJson.Get(row, "product_id"),
            RecipientTaxpayerIndicator = FiscalJson.Get(row, "recipient_taxpayer_indicator"),
            RuleCode = FiscalJson.Get(row, "rule_code"),
            StartDate = FiscalJson.GetDate(row, "start_date") ?? DateOnly.FromDateTime(DateTime.Today),
            TaxRegime = FiscalJson.Get(row, "tax_regime"),
            Version = FiscalJson.GetInt(row, "version", 1)
        };
    }

    private static FiscalProduct MapFiscalProduct(JsonElement row)
    {
        return new FiscalProduct
        {
            Active = FiscalJson.GetBool(row, "active"),
            Cest = FiscalJson.Get(row, "cest"),
            ClientId = FiscalJson.Get(row, "client_id"),
            CofinsCst = FiscalJson.Get(row, "cofins_cst"),
            CofinsRate = FiscalJson.GetDecimal(row, "cofins_rate"),
            CommercialUnit = FiscalJson.Get(row, "commercial_unit"),
            DefaultCfopIn = FiscalJson.Get(row, "default_cfop_in"),
            DefaultCfopOut = FiscalJson.Get(row, "default_cfop_out"),
            Description = FiscalJson.Get(row, "description"),
            FiscalStatus = FiscalJson.Get(row, "fiscal_status"),
            GroupId = FiscalJson.Get(row, "group_id"),
            HasIcmsSt = FiscalJson.GetBool(row, "has_icms_st"),
            IcmsCsosn = FiscalJson.Get(row, "icms_csosn"),
            IcmsCst = FiscalJson.Get(row, "icms_cst"),
            IcmsRate = FiscalJson.GetDecimal(row, "icms_rate"),
            Id = FiscalJson.Get(row, "id"),
            IpiCst = FiscalJson.Get(row, "ipi_cst"),
            IpiRate = FiscalJson.GetDecimal(row, "ipi_rate"),
            MerchandiseOrigin = FiscalJson.Get(row, "merchandise_origin"),
            MvaRate = FiscalJson.GetDecimal(row, "mva_rate"),
            Ncm = FiscalJson.Get(row, "ncm"),
            OrganizationId = FiscalJson.Get(row, "organization_id"),
            PisCst = FiscalJson.Get(row, "pis_cst"),
            PisRate = FiscalJson.GetDecimal(row, "pis_rate"),
            ProductCode = FiscalJson.Get(row, "product_code")
        };
    }
}
