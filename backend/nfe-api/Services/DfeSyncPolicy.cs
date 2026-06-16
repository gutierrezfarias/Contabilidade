using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public static class DfeSyncPolicy
{
    public static readonly TimeSpan CooldownAfterNoDocuments = TimeSpan.FromHours(1);
    public static readonly TimeSpan CooldownAfterConsumptionAbuse = TimeSpan.FromHours(1);
    public static readonly TimeSpan CooldownAfterError = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan RunningLockTtl = TimeSpan.FromMinutes(10);
    public const int DefaultMaxCycles = 3;
    public const int HardMaxCycles = 8;

    public static int NormalizeMaxCycles(int requested) =>
        Math.Clamp(requested <= 0 ? DefaultMaxCycles : requested, 1, HardMaxCycles);

    public static bool IsConsumptionAbuse(string statusCode) => statusCode == "656";

    public static bool IsFiscalBackoffStatus(string statusCode) =>
        statusCode is "108" or "109" or "656";

    public static bool MustStopAfterResponse(string statusCode, int documentsCount, string lastNsu, string maxNsu) =>
        statusCode == "137"
        || IsFiscalBackoffStatus(statusCode)
        || documentsCount == 0
        || SameNsu(lastNsu, maxNsu);

    public static bool KeepPreviousNsu(string statusCode) =>
        IsFiscalBackoffStatus(statusCode);

    public static DateTimeOffset? NextAllowedAfterResponse(
        string statusCode,
        int documentsCount,
        string lastNsu,
        string maxNsu,
        DateTimeOffset now)
    {
        if (IsConsumptionAbuse(statusCode))
        {
            return now.Add(CooldownAfterConsumptionAbuse);
        }

        if (statusCode is "108" or "109")
        {
            return now.Add(CooldownAfterError);
        }

        if (statusCode == "137" || documentsCount == 0 || SameNsu(lastNsu, maxNsu))
        {
            return now.Add(CooldownAfterNoDocuments);
        }

        return null;
    }

    public static string PreserveValidMaxNsu(string previousMaxNsu, string returnedMaxNsu)
    {
        var previous = NormalizeNsu(previousMaxNsu);
        var returned = NormalizeNsu(returnedMaxNsu);
        if (previous != ZeroNsu && returned == ZeroNsu)
        {
            return previous;
        }

        return returned;
    }

    public static bool HasSuspiciousNsuState(string lastNsu, string maxNsu)
    {
        var last = NormalizeNsu(lastNsu);
        var max = NormalizeNsu(maxNsu);
        return last != ZeroNsu && (max == ZeroNsu || string.CompareOrdinal(last, max) > 0);
    }

    public static bool ExistingXmlIsComplete(DfeDocument existing, DfeDocumentWrite incoming) =>
        existing.HasFullXml
        && !string.IsNullOrWhiteSpace(existing.XmlStoragePath)
        && !string.IsNullOrWhiteSpace(existing.XmlHash)
        && existing.XmlHash == incoming.XmlHash;

    public static string NormalizeNsu(string value)
    {
        var digits = NfeText.Digits(value);
        return string.IsNullOrWhiteSpace(digits) ? ZeroNsu : digits.PadLeft(15, '0')[^15..];
    }

    private const string ZeroNsu = "000000000000000";

    private static bool SameNsu(string left, string right) =>
        NormalizeNsu(left) == NormalizeNsu(right);
}
