using System.Text.Json;

namespace ContHub.NfeApi.Models;

public sealed record NcmCatalogItem
{
    public string Code { get; init; } = "";
    public string NormalizedCode { get; init; } = "";
    public string FormattedCode { get; init; } = "";
    public string Description { get; init; } = "";
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public bool IsActive { get; init; } = true;
    public string LegalAct { get; init; } = "";
    public string LegalActNumber { get; init; } = "";
    public string LegalActYear { get; init; } = "";
    public int HierarchyLevel { get; init; }
    public string Source { get; init; } = "";
    public string SourceVersion { get; init; } = "";
    public DateTimeOffset? ImportedAt { get; init; }
    public DateTimeOffset? SourceUpdatedAt { get; init; }
}

public sealed record NcmSyncResult
{
    public bool Success { get; init; }
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public string Code { get; init; } = "";
    public string Detail { get; init; } = "";
    public string ReceivedContentType { get; init; } = "";
    public int TotalCodes { get; init; }
    public int InsertedCodes { get; init; }
    public int UpdatedCodes { get; init; }
    public int DeactivatedCodes { get; init; }
    public int RejectedCodes { get; init; }
    public string JobId { get; init; } = "";
}

public sealed record NcmSyncStatus
{
    public string Status { get; init; } = "Pendente";
    public int TotalCodes { get; init; }
    public int InsertedCodes { get; init; }
    public int UpdatedCodes { get; init; }
    public int DeactivatedCodes { get; init; }
    public int RejectedCodes { get; init; }
    public string Source { get; init; } = "";
    public string SourceVersion { get; init; } = "";
    public int DurationMs { get; init; }
    public string ErrorMessage { get; init; } = "";
    public string StartedAt { get; init; } = "";
    public string FinishedAt { get; init; } = "";
    public string CreatedAt { get; init; } = "";
}

public sealed record NfeTaxPreviewRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string Direction { get; init; } = "saida";
    public string OperationTypeCode { get; init; } = "";
    public string Finalidade { get; init; } = "normal";
    public NfeParty Destinatario { get; init; } = new();
    public List<NfeItem> Itens { get; init; } = [];
}

public sealed record NfeTaxPreviewResult
{
    public bool Success { get; init; }
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public string FiscalProfileStatus { get; init; } = "";
    public List<NfeTaxPreviewItem> Items { get; init; } = [];
    public List<string> Errors { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
    public List<FiscalBlockError> BlockingErrors { get; init; } = [];
    public List<string> AppliedRuleIds { get; init; } = [];
    public string FiscalProfileId { get; init; } = "";
}

public sealed record NfeTaxPreviewItem
{
    public int Index { get; init; }
    public NfeItem OriginalItem { get; init; } = new();
    public NfeItem CalculatedItem { get; init; } = new();
    public string AppliedRuleId { get; init; } = "";
    public string AppliedRuleCode { get; init; } = "";
    public int AppliedRuleVersion { get; init; }
    public string Justification { get; init; } = "";
    public List<string> Errors { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
    public List<FiscalBlockError> BlockingErrors { get; init; } = [];
}

public sealed record FiscalCompanyProfile
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string TaxRegime { get; init; } = "";
    public string Crt { get; init; } = "";
    public string StateUf { get; init; } = "";
    public string CityIbgeCode { get; init; } = "";
    public string ApprovalStatus { get; init; } = "";
    public bool Active { get; init; }
}

public sealed record FiscalProduct
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string ProductCode { get; init; } = "";
    public string Description { get; init; } = "";
    public string CommercialUnit { get; init; } = "";
    public string Ncm { get; init; } = "";
    public string Cest { get; init; } = "";
    public string GroupId { get; init; } = "";
    public string MerchandiseOrigin { get; init; } = "";
    public string DefaultCfopIn { get; init; } = "";
    public string DefaultCfopOut { get; init; } = "";
    public string IcmsCst { get; init; } = "";
    public string IcmsCsosn { get; init; } = "";
    public string PisCst { get; init; } = "";
    public decimal PisRate { get; init; }
    public string CofinsCst { get; init; } = "";
    public decimal CofinsRate { get; init; }
    public string IpiCst { get; init; } = "";
    public decimal IpiRate { get; init; }
    public decimal IcmsRate { get; init; }
    public bool HasIcmsSt { get; init; }
    public decimal MvaRate { get; init; }
    public string FiscalStatus { get; init; } = "";
    public bool Active { get; init; }
}

public sealed record FiscalRule
{
    public string Id { get; init; } = "";
    public string RuleCode { get; init; } = "";
    public string Name { get; init; } = "";
    public int Priority { get; init; }
    public bool Active { get; init; }
    public DateOnly StartDate { get; init; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? EndDate { get; init; }
    public string TaxRegime { get; init; } = "";
    public string Direction { get; init; } = "";
    public string OriginUf { get; init; } = "";
    public string DestinationUf { get; init; } = "";
    public string RecipientTaxpayerIndicator { get; init; } = "";
    public bool? FinalConsumer { get; init; }
    public string NfePurpose { get; init; } = "";
    public string Ncm { get; init; } = "";
    public string Cest { get; init; } = "";
    public string ProductId { get; init; } = "";
    public string GroupId { get; init; } = "";
    public string MerchandiseOrigin { get; init; } = "";
    public string Cfop { get; init; } = "";
    public string IcmsCst { get; init; } = "";
    public string IcmsCsosn { get; init; } = "";
    public string IcmsBaseMode { get; init; } = "";
    public decimal IcmsRate { get; init; }
    public decimal IcmsBaseReduction { get; init; }
    public string PisCst { get; init; } = "";
    public decimal PisRate { get; init; }
    public string CofinsCst { get; init; } = "";
    public decimal CofinsRate { get; init; }
    public string IpiCst { get; init; } = "";
    public decimal IpiRate { get; init; }
    public bool HasIcmsSt { get; init; }
    public decimal MvaRate { get; init; }
    public decimal FcpRate { get; init; }
    public string FiscalBenefitCode { get; init; } = "";
    public string ApprovalStatus { get; init; } = "";
    public int Version { get; init; }
}

public sealed record FiscalBlockError
{
    public string Code { get; init; } = "";
    public string Message { get; init; } = "";
    public string ProductCode { get; init; } = "";
    public string Field { get; init; } = "";
    public string RuleId { get; init; } = "";
    public string Action { get; init; } = "";
}

public sealed record FiscalConflictWrite
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string RuleId { get; init; } = "";
    public string ConflictingRuleId { get; init; } = "";
    public string ProductId { get; init; } = "";
    public string ProductCode { get; init; } = "";
    public string Ncm { get; init; } = "";
    public string Cest { get; init; } = "";
    public string Reason { get; init; } = "";
    public string ConflictKey { get; init; } = "";
    public string CreatedBy { get; init; } = "";
}

public sealed record FiscalAuditWrite
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string EntityType { get; init; } = "";
    public string EntityId { get; init; } = "";
    public string Action { get; init; } = "";
    public object? OldData { get; init; }
    public object? NewData { get; init; }
    public string Reason { get; init; } = "";
    public string CreatedBy { get; init; } = "";
    public string Origin { get; init; } = "backend";
    public string CorrelationId { get; init; } = "";
    public object? Metadata { get; init; }
}

public static class FiscalJson
{
    public static string Get(JsonElement row, string property, string fallback = "")
    {
        return row.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ToString() ?? fallback
            : fallback;
    }

    public static int GetInt(JsonElement row, string property, int fallback = 0)
    {
        return row.TryGetProperty(property, out var value) && value.TryGetInt32(out var result)
            ? result
            : fallback;
    }

    public static decimal GetDecimal(JsonElement row, string property)
    {
        if (!row.TryGetProperty(property, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return 0;
        }

        return value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var numeric)
            ? numeric
            : decimal.TryParse(value.ToString(), out var parsed) ? parsed : 0;
    }

    public static bool GetBool(JsonElement row, string property)
    {
        if (!row.TryGetProperty(property, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return false;
        }

        return value.ValueKind == JsonValueKind.True
            || (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed) && parsed);
    }

    public static DateOnly? GetDate(JsonElement row, string property)
    {
        var value = Get(row, property);
        return DateOnly.TryParse(value, out var parsed) ? parsed : null;
    }
}
