using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public static partial class NcmXlsxParser
{
    private static readonly XNamespace SpreadsheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    public static IReadOnlyList<NcmCatalogItem> Parse(byte[] content, string sourceName, DateTimeOffset importedAt)
    {
        if (content.Length == 0)
        {
            throw new NcmCatalogImportException("NCM_FILE_EMPTY", "O arquivo XLSX esta vazio.");
        }

        if (!HasZipSignature(content))
        {
            throw new NcmCatalogImportException(
                "NCM_FILE_SIGNATURE_INVALID",
                "O arquivo informado nao possui assinatura valida de XLSX.");
        }

        using var stream = new MemoryStream(content, writable: false);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        var sharedStrings = ReadSharedStrings(archive);
        var sheet = archive.Entries
            .Where(entry => entry.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase)
                && entry.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(entry => entry.FullName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (sheet is null)
        {
            throw new NcmCatalogImportException(
                "NCM_XLSX_WORKSHEET_NOT_FOUND",
                "Nao foi possivel localizar uma planilha dentro do arquivo XLSX.");
        }

        var rows = ReadRows(sheet, sharedStrings).ToList();
        var header = DetectHeader(rows);
        var items = rows
            .Select(row => TryReadItem(row, header, sourceName, importedAt))
            .OfType<NcmCatalogItem>()
            .GroupBy(item => item.NormalizedCode)
            .Select(group => group.First())
            .OrderBy(item => item.NormalizedCode, StringComparer.Ordinal)
            .ToList();

        if (items.Count == 0)
        {
            throw new NcmCatalogImportException(
                "NCM_XLSX_WITHOUT_VALID_CODES",
                "A planilha nao possui codigos NCM completos validos.");
        }

        return items;
    }

    public static bool HasZipSignature(byte[] content)
    {
        return content.Length >= 4
            && content[0] == (byte)'P'
            && content[1] == (byte)'K'
            && (content[2] == 3 || content[2] == 5 || content[2] == 7)
            && (content[3] == 4 || content[3] == 6 || content[3] == 8);
    }

    public static bool LooksLikeHtml(byte[] content)
    {
        var prefix = Encoding.UTF8.GetString(content.Take(Math.Min(content.Length, 256)).ToArray()).TrimStart();
        return prefix.StartsWith("<!doctype html", StringComparison.OrdinalIgnoreCase)
            || prefix.StartsWith("<html", StringComparison.OrdinalIgnoreCase);
    }

    public static bool LooksLikeJson(byte[] content)
    {
        var prefix = Encoding.UTF8.GetString(content.Take(Math.Min(content.Length, 64)).ToArray()).TrimStart();
        return prefix.StartsWith('{') || prefix.StartsWith('[');
    }

    private static NcmCatalogItem? TryReadItem(
        IReadOnlyList<string> row,
        IReadOnlyDictionary<string, int> header,
        string sourceName,
        DateTimeOffset importedAt)
    {
        var codeIndex = FindCodeIndex(row, header);
        if (codeIndex < 0)
        {
            return null;
        }

        var rawCode = row.ElementAtOrDefault(codeIndex) ?? "";
        var normalizedCode = NormalizeCode(rawCode);
        if (normalizedCode.Length != 8)
        {
            return null;
        }

        var description = ReadByHeader(row, header, "description");
        if (string.IsNullOrWhiteSpace(description))
        {
            description = row
                .Skip(codeIndex + 1)
                .FirstOrDefault(value =>
                    !string.IsNullOrWhiteSpace(value)
                    && NormalizeCode(value).Length != 8
                    && !LooksLikeDate(value)) ?? "";
        }

        if (string.IsNullOrWhiteSpace(description))
        {
            return null;
        }

        var endDate = ParseDate(ReadByHeader(row, header, "endDate"));

        return new NcmCatalogItem
        {
            Code = FormatNcm(normalizedCode),
            Description = description.Trim(),
            EndDate = endDate,
            FormattedCode = FormatNcm(normalizedCode),
            HierarchyLevel = ParseInt(ReadByHeader(row, header, "level")),
            IsActive = endDate is null || endDate >= DateOnly.FromDateTime(DateTime.UtcNow),
            LegalAct = ReadByHeader(row, header, "legalAct"),
            LegalActNumber = ReadByHeader(row, header, "legalActNumber"),
            LegalActYear = ReadByHeader(row, header, "legalActYear"),
            NormalizedCode = normalizedCode,
            Source = "Upload manual",
            SourceUpdatedAt = importedAt,
            SourceVersion = sourceName,
            ImportedAt = importedAt,
            StartDate = ParseDate(ReadByHeader(row, header, "startDate"))
        };
    }

    private static int FindCodeIndex(IReadOnlyList<string> row, IReadOnlyDictionary<string, int> header)
    {
        if (header.TryGetValue("code", out var headerIndex) && NormalizeCode(row.ElementAtOrDefault(headerIndex) ?? "").Length == 8)
        {
            return headerIndex;
        }

        for (var index = 0; index < row.Count; index++)
        {
            if (NormalizeCode(row[index]).Length == 8)
            {
                return index;
            }
        }

        return -1;
    }

    private static Dictionary<string, int> DetectHeader(IEnumerable<IReadOnlyList<string>> rows)
    {
        foreach (var row in rows)
        {
            var normalized = row.Select(NormalizeHeader).ToList();
            var hasCode = normalized.Any(value => value.Contains("codigo", StringComparison.Ordinal) || value.Contains("ncm", StringComparison.Ordinal));
            var hasDescription = normalized.Any(value => value.Contains("descricao", StringComparison.Ordinal) || value.Contains("nome", StringComparison.Ordinal));
            if (!hasCode || !hasDescription)
            {
                continue;
            }

            var header = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < normalized.Count; index++)
            {
                var value = normalized[index];
                if (!header.ContainsKey("code") && (value.Contains("codigo", StringComparison.Ordinal) || value.Contains("ncm", StringComparison.Ordinal)))
                {
                    header["code"] = index;
                }
                else if (!header.ContainsKey("description") && (value.Contains("descricao", StringComparison.Ordinal) || value.Contains("nome", StringComparison.Ordinal)))
                {
                    header["description"] = index;
                }
                else if (!header.ContainsKey("startDate") && value.Contains("inicio", StringComparison.Ordinal))
                {
                    header["startDate"] = index;
                }
                else if (!header.ContainsKey("endDate") && value.Contains("fim", StringComparison.Ordinal))
                {
                    header["endDate"] = index;
                }
                else if (!header.ContainsKey("level") && (value.Contains("nivel", StringComparison.Ordinal) || value.Contains("hierarquia", StringComparison.Ordinal)))
                {
                    header["level"] = index;
                }
                else if (!header.ContainsKey("legalActNumber") && value.Contains("numero", StringComparison.Ordinal) && value.Contains("ato", StringComparison.Ordinal))
                {
                    header["legalActNumber"] = index;
                }
                else if (!header.ContainsKey("legalActYear") && value.Contains("ano", StringComparison.Ordinal) && value.Contains("ato", StringComparison.Ordinal))
                {
                    header["legalActYear"] = index;
                }
                else if (!header.ContainsKey("legalAct") && value.Contains("ato", StringComparison.Ordinal))
                {
                    header["legalAct"] = index;
                }
            }

            return header;
        }

        return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }

    private static IReadOnlyList<string> ReadSharedStrings(ZipArchive archive)
    {
        var entry = archive.GetEntry("xl/sharedStrings.xml");
        if (entry is null)
        {
            return [];
        }

        using var stream = entry.Open();
        var document = XDocument.Load(stream);
        return document
            .Descendants(SpreadsheetNs + "si")
            .Select(item => string.Concat(item.Descendants(SpreadsheetNs + "t").Select(text => text.Value)))
            .ToList();
    }

    private static IEnumerable<IReadOnlyList<string>> ReadRows(ZipArchiveEntry sheet, IReadOnlyList<string> sharedStrings)
    {
        using var stream = sheet.Open();
        var document = XDocument.Load(stream);

        foreach (var row in document.Descendants(SpreadsheetNs + "row"))
        {
            var values = new List<string>();
            foreach (var cell in row.Elements(SpreadsheetNs + "c"))
            {
                var index = CellIndex(cell.Attribute("r")?.Value ?? "");
                while (values.Count <= index)
                {
                    values.Add("");
                }

                values[index] = CellValue(cell, sharedStrings);
            }

            if (values.Any(value => !string.IsNullOrWhiteSpace(value)))
            {
                yield return values;
            }
        }
    }

    private static string CellValue(XElement cell, IReadOnlyList<string> sharedStrings)
    {
        var type = cell.Attribute("t")?.Value ?? "";
        if (type == "s")
        {
            var sharedIndexText = cell.Element(SpreadsheetNs + "v")?.Value ?? "";
            return int.TryParse(sharedIndexText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sharedIndex)
                && sharedIndex >= 0
                && sharedIndex < sharedStrings.Count
                    ? sharedStrings[sharedIndex].Trim()
                    : "";
        }

        if (type == "inlineStr")
        {
            return string.Concat(cell.Descendants(SpreadsheetNs + "t").Select(text => text.Value)).Trim();
        }

        return (cell.Element(SpreadsheetNs + "v")?.Value ?? "").Trim();
    }

    private static int CellIndex(string reference)
    {
        var letters = new string(reference.TakeWhile(char.IsLetter).ToArray()).ToUpperInvariant();
        if (letters.Length == 0)
        {
            return 0;
        }

        var value = 0;
        foreach (var letter in letters)
        {
            value = (value * 26) + (letter - 'A' + 1);
        }

        return Math.Max(0, value - 1);
    }

    private static string ReadByHeader(IReadOnlyList<string> row, IReadOnlyDictionary<string, int> header, string key)
    {
        return header.TryGetValue(key, out var index) && index >= 0 && index < row.Count
            ? row[index].Trim()
            : "";
    }

    private static string NormalizeCode(string value)
    {
        var digits = Digits().Replace(value ?? "", "");
        return digits.Length == 7 ? digits.PadLeft(8, '0') : digits;
    }

    private static string FormatNcm(string code) =>
        code.Length == 8 ? $"{code[..4]}.{code.Substring(4, 2)}.{code.Substring(6, 2)}" : code;

    private static DateOnly? ParseDate(string value)
    {
        if (DateOnly.TryParse(value, CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out var ptDate))
        {
            return ptDate;
        }

        if (DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var invariantDate))
        {
            return invariantDate;
        }

        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateTime)
            ? DateOnly.FromDateTime(dateTime.Date)
            : null;
    }

    private static int ParseInt(string value) =>
        int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;

    private static bool LooksLikeDate(string value) => ParseDate(value) is not null;

    private static string NormalizeHeader(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder();

        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return Regex.Replace(builder.ToString(), @"\s+", " ").Trim();
    }

    [GeneratedRegex(@"\D")]
    private static partial Regex Digits();
}
