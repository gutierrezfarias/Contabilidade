using System.Text.Json;

namespace ContHub.NfeApi.Models;

public sealed record SerproServiceDto(
    string Id,
    string Name,
    string Category,
    string Description,
    string OfficialProduct,
    bool RequiresCertificate,
    bool RequiresAuthorization,
    bool SupportsManagedMode,
    bool SupportsDirectMode,
    string Status,
    bool SupportsLocalAgent = false,
    bool SupportsManualImport = true,
    bool ConsumesCredit = true);

public sealed record SerproContractPlanDto(
    string Code,
    string CommercialName,
    decimal MonthlyPrice,
    string Description,
    bool Active,
    List<string> AllowedServiceIds,
    int DefaultDailyLimit,
    bool AllowsFallback,
    bool AllowsHomologation,
    bool AllowsProduction,
    int DisplayOrder,
    string InstallerUrl);

public sealed record SerproContractPlanInput(
    string Code,
    string CommercialName,
    decimal MonthlyPrice,
    string Description,
    bool Active,
    List<string> AllowedServiceIds,
    int DefaultDailyLimit,
    bool AllowsFallback,
    bool AllowsHomologation,
    bool AllowsProduction,
    int DisplayOrder,
    string InstallerUrl);

public sealed record SerproPricingDto(
    string ServiceId,
    string Environment,
    decimal ProviderCost,
    decimal SalePrice,
    decimal MarginAmount,
    bool Active);

public sealed record SerproOrganizationSettingsDto(
    string OrganizationId,
    string BillingMode,
    string AccessMode,
    string Environment,
    string Status,
    bool ManagedModeEnabled,
    bool DirectModeEnabled,
    bool AllowManagedFallback,
    decimal MonthlyCreditLimit,
    int DailyRequestLimit,
    string NotificationEmail,
    string Notes,
    string PlanCode = "cont_hub_full");

public sealed record SerproCredentialStatusDto(
    string Owner,
    string Environment,
    string Status,
    bool ConsumerKeyConfigured,
    bool ConsumerSecretConfigured,
    string ConsumerSecretReference,
    bool CertificateConfigured,
    string LastTestStatus,
    string LastTestMessage,
    string ContractCnpj = "",
    string ConsumerKeyMasked = "");

public sealed record SerproWalletDto(
    string OrganizationId,
    decimal Balance,
    decimal ReservedBalance,
    string Currency,
    bool AutoRechargeEnabled,
    decimal AutoRechargeThreshold,
    decimal AutoRechargeAmount,
    string Status);

public sealed record SerproContractInput(
    string Name,
    string ContractCnpj,
    string Environment,
    string Status,
    bool AllowManagedMode,
    string Notes,
    string ConsumerKey,
    string ConsumerSecret,
    string ConsumerSecretReference,
    string? CertificateId);

public sealed record SerproOrganizationSettingsInput(
    string OrganizationId,
    string BillingMode,
    string AccessMode,
    string Environment,
    string Status,
    bool ManagedModeEnabled,
    bool DirectModeEnabled,
    bool AllowManagedFallback,
    decimal MonthlyCreditLimit,
    int DailyRequestLimit,
    string NotificationEmail,
    string Notes,
    string? PlanCode = null);

public sealed record SerproLocalAgentDto(
    string OrganizationId,
    string Status,
    string PairingKeyPrefix,
    string? PairingKeyCreatedAt,
    string? PairingKeyExpiresAt,
    string InstalledVersion,
    string? LastSeenAt,
    string? LastSyncAt,
    string LastError);

public sealed record SerproPairingKeyInput(string OrganizationId);

public sealed record SerproPairingKeyResult(
    bool Ok,
    string PairingKey,
    string PairingKeyPrefix,
    string ExpiresAt,
    string Message);

public sealed record SerproDirectCredentialInput(
    string OrganizationId,
    string ContractCnpj,
    string ConsumerKey,
    string ConsumerSecret,
    string ConsumerSecretReference,
    string Environment,
    string Status,
    string? CertificateId);

public sealed record SerproServiceToggleInput(
    string OrganizationId,
    string ServiceId,
    bool Enabled,
    string? BillingModeOverride,
    decimal? CustomSalePrice,
    bool Exempt,
    int MonthlyLimit);

public sealed record SerproRevenueRequestInput(
    string OrganizationId,
    string? ClientId,
    string ServiceId,
    string? CertificateId,
    string? AuthorizationId,
    string? Cnpj,
    string? Competence,
    string? IdempotencyKey,
    string? CorrelationId,
    JsonElement Payload);

public sealed record SerproRevenueRequestResult(
    bool Ok,
    string Status,
    string Message,
    string? RequestId,
    string BillingMode,
    decimal SaleAmount,
    decimal ProviderCost,
    decimal MarginAmount);

public sealed record SerproResolvedMode(
    string BillingMode,
    string CredentialOwner,
    bool CredentialsReady,
    bool WalletRequired,
    string BlockReason);

public sealed record ManualRevenueImportFileInput(
    string FileName,
    string MimeType,
    string Base64Data);

public sealed record ManualRevenueImportPreviewRequest(
    string OrganizationId,
    List<ManualRevenueImportFileInput> Files);

public sealed record ManualRevenueImportConfirmRequest(
    string OrganizationId,
    List<ManualRevenueImportConfirmItem> Items);

public sealed record ManualRevenueImportConfirmItem(
    string FileName,
    string MimeType,
    string Base64Data,
    string FileHash,
    string? ClientId,
    string TaxId,
    string CompanyName,
    string DocumentType,
    string ServiceName,
    string Competency,
    string PeriodLabel,
    string? IssuedAt,
    string? DueDate,
    decimal? Amount,
    string RevenueCode,
    string ReceiptNumber,
    string ProtocolNumber,
    string DocumentStatus,
    string? CertificateValidUntil,
    bool Ignored);

public sealed record ManualRevenueImportPreviewItem(
    string Id,
    string FileName,
    string SafeFileName,
    string MimeType,
    long FileSize,
    string FileHash,
    string TaxId,
    string CompanyName,
    string DocumentType,
    string ServiceName,
    string Competency,
    string PeriodLabel,
    string? IssuedAt,
    string? DueDate,
    decimal? Amount,
    string RevenueCode,
    string ReceiptNumber,
    string ProtocolNumber,
    string DocumentStatus,
    string? CertificateValidUntil,
    string? ClientId,
    string ClientName,
    string MatchStatus,
    bool Duplicate,
    string? DuplicateDocumentId,
    string Error,
    string ActionRequired);

public sealed record ManualRevenueImportPreviewResult(
    bool Ok,
    string Message,
    List<ManualRevenueImportPreviewItem> Items);

public sealed record ManualRevenueImportConfirmResult(
    bool Ok,
    string BatchId,
    int ImportedCount,
    int DuplicateCount,
    int ErrorCount,
    int IgnoredCount,
    string Message);
