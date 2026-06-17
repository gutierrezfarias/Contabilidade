using System.Security.Cryptography;
using System.Text;

namespace ContHub.NfeApi.Services;

public static class ManualRevenueImportRules
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".xml",
        ".json",
        ".csv",
        ".zip",
    };

    private static readonly HashSet<string> DangerousExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".bat",
        ".cmd",
        ".com",
        ".dll",
        ".exe",
        ".js",
        ".msi",
        ".ps1",
        ".scr",
        ".sh",
        ".vbs",
    };

    public static bool IsAllowedExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName);
        return AllowedExtensions.Contains(extension) && !DangerousExtensions.Contains(extension);
    }

    public static bool HasPathTraversal(string path)
    {
        return path.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(path);
    }

    public static string SafeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(invalid, '_');
        }

        return string.IsNullOrWhiteSpace(name) ? $"documento-{Guid.NewGuid():N}.bin" : name;
    }

    public static string Sha256(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    public static string BuildExternalId(
        string provider,
        string documentType,
        string taxId,
        string receiptNumber,
        string protocolNumber,
        string revenueCode,
        string competence)
    {
        var officialId = FirstNonEmpty(protocolNumber, receiptNumber);
        if (officialId.Length == 0)
        {
            return "";
        }

        return StableKey(provider, documentType, NormalizeDigits(taxId), officialId, revenueCode, competence);
    }

    public static string BuildLogicalKey(
        string organizationId,
        string? clientId,
        string provider,
        string documentType,
        string competence,
        string? dueDate,
        decimal? amount,
        string externalId,
        string taxId)
    {
        return StableKey(
            organizationId,
            string.IsNullOrWhiteSpace(clientId) ? NormalizeDigits(taxId) : clientId,
            provider,
            NormalizeDocumentType(documentType),
            competence,
            dueDate ?? "",
            amount?.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) ?? "",
            externalId);
    }

    public static bool IsCsvFormula(string value)
    {
        var trimmed = (value ?? "").TrimStart();
        return trimmed.StartsWith('=') || trimmed.StartsWith('+') || trimmed.StartsWith('-') || trimmed.StartsWith('@');
    }

    private static string StableKey(params string?[] values)
    {
        var normalized = string.Join("|", values.Select(value => (value ?? "").Trim().ToLowerInvariant()));
        return Sha256(Encoding.UTF8.GetBytes(normalized));
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        return values.Select(value => (value ?? "").Trim()).FirstOrDefault(value => value.Length > 0) ?? "";
    }

    private static string NormalizeDigits(string value)
    {
        return new string((value ?? "").Where(char.IsDigit).ToArray());
    }

    private static string NormalizeDocumentType(string value)
    {
        return (value ?? "")
            .Trim()
            .ToLowerInvariant()
            .Replace(" ", "_")
            .Replace("-", "_")
            .Replace("/", "_");
    }
}
