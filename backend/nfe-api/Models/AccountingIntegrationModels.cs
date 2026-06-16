using System.Text.Json;

namespace ContHub.NfeApi.Models;

public sealed record AccountingIntegrationDto
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string Name { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string ConnectionType { get; init; } = "manual";
    public string Environment { get; init; } = "production";
    public string Status { get; init; } = "draft";
    public string BaseUrl { get; init; } = "";
    public string CredentialsReference { get; init; } = "";
    public JsonElement Settings { get; init; }
    public string SyncFrequency { get; init; } = "manual";
    public string LastSyncAt { get; init; } = "";
    public string NextSyncAt { get; init; } = "";
    public bool AutomaticSync { get; init; }
    public bool Active { get; init; } = true;
    public string CreatedAt { get; init; } = "";
    public string UpdatedAt { get; init; } = "";
}

public sealed record AccountingIntegrationInput
{
    public string OrganizationId { get; init; } = "";
    public string Name { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string ConnectionType { get; init; } = "manual";
    public string Environment { get; init; } = "production";
    public string Status { get; init; } = "draft";
    public string BaseUrl { get; init; } = "";
    public string CredentialsReference { get; init; } = "";
    public JsonElement? Settings { get; init; }
    public string SyncFrequency { get; init; } = "manual";
    public string? NextSyncAt { get; init; }
    public bool AutomaticSync { get; init; }
    public bool Active { get; init; } = true;
}

public sealed record AccountingIntegrationClientDto
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string ClientName { get; init; } = "";
    public string ClientCnpj { get; init; } = "";
    public string ExternalCompanyId { get; init; } = "";
    public string ExternalCompanyName { get; init; } = "";
    public string ExternalCnpj { get; init; } = "";
    public string ExternalCode { get; init; } = "";
    public string Status { get; init; } = "linked";
    public string LinkedAt { get; init; } = "";
}

public sealed record AccountingIntegrationClientInput
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string ExternalCompanyId { get; init; } = "";
    public string ExternalCompanyName { get; init; } = "";
    public string ExternalCnpj { get; init; } = "";
    public string ExternalCode { get; init; } = "";
    public string Status { get; init; } = "linked";
}

public sealed record AccountingSyncRunDto
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string SyncType { get; init; } = "manual";
    public string Status { get; init; } = "running";
    public string StartedAt { get; init; } = "";
    public string FinishedAt { get; init; } = "";
    public int ReceivedCount { get; init; }
    public int CreatedCount { get; init; }
    public int UpdatedCount { get; init; }
    public int IgnoredCount { get; init; }
    public int DuplicateCount { get; init; }
    public int ErrorCount { get; init; }
    public string Message { get; init; } = "";
    public string CorrelationId { get; init; } = "";
}

public sealed record AccountingTaxRecordDto
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string ExternalId { get; init; } = "";
    public string Competence { get; init; } = "";
    public string TaxType { get; init; } = "";
    public string Description { get; init; } = "";
    public decimal Amount { get; init; }
    public string DueDate { get; init; } = "";
    public string CalculationDate { get; init; } = "";
    public string Status { get; init; } = "pending";
    public string Barcode { get; init; } = "";
    public string PixCode { get; init; } = "";
    public string DocumentUrl { get; init; } = "";
    public string Source { get; init; } = "manual";
}

public sealed record AccountingObligationDto
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string Competence { get; init; } = "";
    public string ObligationType { get; init; } = "";
    public string DueDate { get; init; } = "";
    public string DeliveryDate { get; init; } = "";
    public string Status { get; init; } = "pending";
    public string Protocol { get; init; } = "";
}

public sealed record AccountingImportPreviewRequest
{
    public string OrganizationId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string TemplateId { get; init; } = "";
    public string Provider { get; init; } = "manual";
    public string RecordType { get; init; } = "tax";
    public string FileName { get; init; } = "";
    public string FileFormat { get; init; } = "csv";
    public string Content { get; init; } = "";
    public string Competence { get; init; } = "";
    public Dictionary<string, string> ColumnMapping { get; init; } = [];
}

public sealed record AccountingImportConfirmRequest
{
    public string OrganizationId { get; init; } = "";
    public string BatchId { get; init; } = "";
}

public sealed record AccountingImportPreviewResult
{
    public bool Ok { get; init; }
    public string BatchId { get; init; } = "";
    public string Message { get; init; } = "";
    public int TotalRows { get; init; }
    public int ValidRows { get; init; }
    public int InvalidRows { get; init; }
    public IReadOnlyList<AccountingImportPreviewRow> Rows { get; init; } = [];
    public IReadOnlyList<AccountingImportError> Errors { get; init; } = [];
    public IReadOnlyList<string> Columns { get; init; } = [];
}

public sealed record AccountingImportPreviewRow
{
    public int RowNumber { get; init; }
    public bool Valid { get; init; }
    public Dictionary<string, string> Raw { get; init; } = [];
    public Dictionary<string, string> Mapped { get; init; } = [];
    public IReadOnlyList<AccountingImportError> Errors { get; init; } = [];
}

public sealed record AccountingImportError
{
    public int RowNumber { get; init; }
    public string FieldName { get; init; } = "";
    public string FieldValue { get; init; } = "";
    public string Reason { get; init; } = "";
    public string ExpectedFix { get; init; } = "";
    public string Severity { get; init; } = "error";
}

public sealed record AccountingImportConfirmResult
{
    public bool Ok { get; init; }
    public string BatchId { get; init; } = "";
    public string Message { get; init; } = "";
    public int CreatedRows { get; init; }
    public int UpdatedRows { get; init; }
    public int DuplicateRows { get; init; }
    public int ErrorRows { get; init; }
}

public sealed record AccountingProviderConnectionResult
{
    public bool Ok { get; init; }
    public string Provider { get; init; } = "";
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public string RecommendedAction { get; init; } = "";
}

public sealed record AccountingProviderSyncRequest
{
    public string OrganizationId { get; init; } = "";
    public string IntegrationId { get; init; } = "";
    public string SyncType { get; init; } = "manual";
}

public sealed record AccountingProviderSyncResult
{
    public bool Ok { get; init; }
    public string SyncRunId { get; init; } = "";
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public int ReceivedCount { get; init; }
    public int CreatedCount { get; init; }
    public int UpdatedCount { get; init; }
    public int ErrorCount { get; init; }
}
