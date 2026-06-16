using System.Text.Json;

namespace ContHub.NfeApi.Models;

public sealed record DfeSyncRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public int MaxCycles { get; init; } = 3;
    public string QueryType { get; init; } = "summary";
    public bool ResetNsu { get; init; }
    public string SyncRunId { get; init; } = "";
}

public sealed record DfeQueryNsuRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string Nsu { get; init; } = "";
}

public sealed record DfeQueryAccessKeyRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string AccessKey { get; init; } = "";
}

public sealed record DfeManifestRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string DocumentId { get; init; } = "";
    public string EventType { get; init; } = "";
    public string Justification { get; init; } = "";
    public bool UserConfirmed { get; init; }
}

public sealed record DfeSyncState
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string Cnpj { get; init; } = "";
    public string Environment { get; init; } = "homologacao";
    public string LastNsu { get; init; } = "000000000000000";
    public string MaxNsu { get; init; } = "000000000000000";
    public DateTimeOffset? LastSyncAt { get; init; }
    public DateTimeOffset? NextAllowedSyncAt { get; init; }
    public string LastStatusCode { get; init; } = "";
    public string LastStatusMessage { get; init; } = "";
    public string Status { get; init; } = "idle";
    public int ConsecutiveErrors { get; init; }
    public string LockToken { get; init; } = "";
    public DateTimeOffset? LockedAt { get; init; }
}

public sealed record DfeDocument
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string Nsu { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string SchemaName { get; init; } = "";
    public string DocumentType { get; init; } = "";
    public string Direction { get; init; } = "citada";
    public string IssuerCnpj { get; init; } = "";
    public string IssuerName { get; init; } = "";
    public string RecipientCnpj { get; init; } = "";
    public string RecipientName { get; init; } = "";
    public DateTimeOffset? IssueDate { get; init; }
    public DateTimeOffset? AuthorizationDate { get; init; }
    public decimal TotalValue { get; init; }
    public string NfeStatus { get; init; } = "";
    public string ManifestationStatus { get; init; } = "Pendente";
    public bool HasFullXml { get; init; }
    public string XmlStoragePath { get; init; } = "";
    public string XmlHash { get; init; } = "";
    public JsonElement SummaryData { get; init; }
}

public sealed record DfeDocumentWrite
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string Nsu { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string SchemaName { get; init; } = "";
    public string DocumentType { get; init; } = "";
    public string Direction { get; init; } = "citada";
    public string IssuerCnpj { get; init; } = "";
    public string IssuerName { get; init; } = "";
    public string RecipientCnpj { get; init; } = "";
    public string RecipientName { get; init; } = "";
    public DateTimeOffset? IssueDate { get; init; }
    public DateTimeOffset? AuthorizationDate { get; init; }
    public decimal TotalValue { get; init; }
    public string NfeStatus { get; init; } = "";
    public string ManifestationStatus { get; init; } = "Pendente";
    public bool HasFullXml { get; init; }
    public string XmlStoragePath { get; init; } = "";
    public string XmlHash { get; init; } = "";
    public object SummaryData { get; init; } = new();
}

public sealed record DfeEventWrite
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string DocumentId { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string ProtocolNumber { get; init; } = "";
    public string EventType { get; init; } = "";
    public int Sequence { get; init; } = 1;
    public DateTimeOffset? EventDate { get; init; }
    public string StatusCode { get; init; } = "";
    public string StatusMessage { get; init; } = "";
    public string PrivateXmlStoragePath { get; init; } = "";
    public string RequestXmlHash { get; init; } = "";
    public string ResponseXmlHash { get; init; } = "";
    public string CreatedBy { get; init; } = "";
}

public sealed record DfeProcessedDocument
{
    public DfeDocumentWrite Document { get; init; } = new();
    public DfeEventWrite? Event { get; init; }
    public string Xml { get; init; } = "";
}

public sealed record DfeProcessResult
{
    public string StatusCode { get; init; } = "";
    public string StatusMessage { get; init; } = "";
    public string LastNsu { get; init; } = "000000000000000";
    public string MaxNsu { get; init; } = "000000000000000";
    public List<DfeProcessedDocument> Documents { get; init; } = [];
}

public sealed record DfePersistResult
{
    public int CompletedExisting { get; init; }
    public int Inserted { get; init; }
    public int Updated { get; init; }
    public int Ignored { get; init; }
    public int IgnoredExisting { get; init; }
    public int StorageUploads { get; init; }
    public List<DfeDocument> Documents { get; init; } = [];
}

public sealed record DfeOperationResult
{
    public string Code { get; init; } = "";
    public bool Success { get; init; }
    public string Message { get; init; } = "";
    public string StatusCode { get; init; } = "";
    public string StatusMessage { get; init; } = "";
    public string LastNsu { get; init; } = "";
    public string MaxNsu { get; init; } = "";
    public DateTimeOffset? NextAllowedSyncAt { get; init; }
    public string SyncRunId { get; init; } = "";
    public int ReceivedCount { get; init; }
    public int InsertedCount { get; init; }
    public int UpdatedCount { get; init; }
    public int IgnoredCount { get; init; }
    public int IgnoredExistingCount { get; init; }
    public int CompletedExistingCount { get; init; }
    public int SefazRequestCount { get; init; }
    public int DatabaseReadCount { get; init; }
    public int DatabaseWriteCount { get; init; }
    public int StorageUploadCount { get; init; }
    public List<DfeDocument> Documents { get; init; } = [];
}

public sealed class DfeSyncCooldownException : InvalidOperationException
{
    public DfeSyncCooldownException(DateTimeOffset nextAllowedSyncAt, string statusCode = "", string message = "")
        : base(string.IsNullOrWhiteSpace(message)
            ? $"Consulta temporariamente bloqueada. Tente apos {nextAllowedSyncAt:dd/MM/yyyy HH:mm}."
            : message)
    {
        NextAllowedSyncAt = nextAllowedSyncAt;
        StatusCode = statusCode;
    }

    public string Code => "DFE_SYNC_COOLDOWN";
    public DateTimeOffset NextAllowedSyncAt { get; }
    public string RecommendedAction => "Aguarde o horario informado antes de consultar novamente.";
    public string StatusCode { get; }
}

public sealed class DfeSyncAlreadyRunningException : InvalidOperationException
{
    public DfeSyncAlreadyRunningException()
        : base("Ja existe uma sincronizacao DF-e em andamento para este CNPJ e ambiente.")
    {
    }

    public string Code => "DFE_SYNC_ALREADY_RUNNING";
    public string RecommendedAction => "Aguarde a sincronizacao em andamento finalizar.";
}

public sealed class DfeStorageUploadException : InvalidOperationException
{
    public DfeStorageUploadException(int storageStatusCode, string logicalPath)
        : base($"Falha ao salvar XML privado no Storage. codigo=dfe_storage_upload_failed; etapa=storage_upload; status={storageStatusCode}; caminho={logicalPath}; acao=Verifique o MIME type permitido do bucket nfe-dfe-xml e tente sincronizar novamente.")
    {
        StorageStatusCode = storageStatusCode;
        LogicalPath = logicalPath;
    }

    public string Code => "dfe_storage_upload_failed";
    public string Step => "storage_upload";
    public int StorageStatusCode { get; }
    public string SafeMessage => "Supabase Storage recusou o XML privado.";
    public string LogicalPath { get; }
    public string RecommendedAction => "Verifique se o bucket privado nfe-dfe-xml aceita application/xml e tente sincronizar novamente.";
}
