using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public static class AccountingImportParser
{
    private static readonly string[] TaxRequiredFields = ["cnpj", "competence", "taxType", "amount"];
    private static readonly string[] ObligationRequiredFields = ["cnpj", "competence", "obligationType", "dueDate"];
    private static readonly char[] DangerousFormulaPrefixes = ['=', '+', '-', '@'];

    public static string HashContent(string content)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(content));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static AccountingImportPreviewResult Preview(AccountingImportPreviewRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OrganizationId))
        {
            throw new InvalidOperationException("Organizacao obrigatoria para importar dados contabeis.");
        }

        var format = NormalizeFormat(request.FileFormat, request.FileName);
        if (format == "xlsx")
        {
            throw new InvalidOperationException("XLSX ainda nao e processado no backend sem biblioteca dedicada. Exporte para CSV ou JSON nesta fase.");
        }

        var rows = format == "json"
            ? ParseJsonRows(request.Content)
            : ParseCsvRows(request.Content);

        var columns = rows.SelectMany(row => row.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(column => column, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var mapping = NormalizeMapping(request.ColumnMapping, request.RecordType);
        var previewRows = rows
            .Select((row, index) => MapAndValidate(row, index + 2, mapping, request.RecordType))
            .ToList();

        var errors = previewRows.SelectMany(row => row.Errors).ToList();

        return new AccountingImportPreviewResult
        {
            Ok = errors.All(error => error.Severity != "error"),
            Message = errors.Count == 0
                ? "Arquivo validado. Revise a previa antes de confirmar."
                : "Arquivo possui pendencias. Corrija as linhas indicadas antes de confirmar.",
            TotalRows = previewRows.Count,
            ValidRows = previewRows.Count(row => row.Valid),
            InvalidRows = previewRows.Count(row => !row.Valid),
            Rows = previewRows.Take(100).ToList(),
            Errors = errors.Take(250).ToList(),
            Columns = columns
        };
    }

    public static IReadOnlyList<Dictionary<string, string>> ValidMappedRows(AccountingImportPreviewRequest request)
    {
        var preview = Preview(request);
        if (!preview.Ok)
        {
            throw new InvalidOperationException("A importacao possui erros e nao pode ser confirmada.");
        }

        return preview.Rows.Where(row => row.Valid).Select(row => row.Mapped).ToList();
    }

    public static string NormalizeFormat(string fileFormat, string fileName)
    {
        var value = fileFormat.Trim().Trim('.').ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var extension = Path.GetExtension(fileName).Trim('.').ToLowerInvariant();
        return string.IsNullOrWhiteSpace(extension) ? "csv" : extension;
    }

    private static Dictionary<string, string> NormalizeMapping(
        IReadOnlyDictionary<string, string> requestMapping,
        string recordType)
    {
        var defaults = recordType.Equals("obligation", StringComparison.OrdinalIgnoreCase)
            ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["cnpj"] = "cnpj",
                ["competencia"] = "competence",
                ["competence"] = "competence",
                ["obrigacao"] = "obligationType",
                ["obligationType"] = "obligationType",
                ["vencimento"] = "dueDate",
                ["dueDate"] = "dueDate",
                ["entrega"] = "deliveryDate",
                ["status"] = "status",
                ["protocolo"] = "protocol"
            }
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["cnpj"] = "cnpj",
                ["competencia"] = "competence",
                ["competence"] = "competence",
                ["tipo_imposto"] = "taxType",
                ["taxType"] = "taxType",
                ["descricao"] = "description",
                ["description"] = "description",
                ["valor"] = "amount",
                ["amount"] = "amount",
                ["vencimento"] = "dueDate",
                ["dueDate"] = "dueDate",
                ["codigo_barras"] = "barcode",
                ["pix"] = "pixCode",
                ["status"] = "status",
                ["external_id"] = "externalId"
            };

        foreach (var item in requestMapping)
        {
            if (!string.IsNullOrWhiteSpace(item.Key) && !string.IsNullOrWhiteSpace(item.Value))
            {
                defaults[item.Key.Trim()] = item.Value.Trim();
            }
        }

        return defaults;
    }

    private static AccountingImportPreviewRow MapAndValidate(
        Dictionary<string, string> row,
        int rowNumber,
        IReadOnlyDictionary<string, string> mapping,
        string recordType)
    {
        var mapped = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in row)
        {
            if (mapping.TryGetValue(item.Key, out var target))
            {
                mapped[target] = item.Value.Trim();
            }
        }

        var errors = new List<AccountingImportError>();
        foreach (var item in row)
        {
            if (HasFormulaInjection(item.Value))
            {
                errors.Add(Error(rowNumber, item.Key, item.Value, "Valor com prefixo de formula bloqueado.", "Remova =, +, - ou @ no inicio do campo."));
            }
        }

        var requiredFields = recordType.Equals("obligation", StringComparison.OrdinalIgnoreCase)
            ? ObligationRequiredFields
            : TaxRequiredFields;

        foreach (var field in requiredFields)
        {
            if (!mapped.TryGetValue(field, out var value) || string.IsNullOrWhiteSpace(value))
            {
                errors.Add(Error(rowNumber, field, "", "Campo obrigatorio ausente.", "Mapeie ou preencha o campo antes de importar."));
            }
        }

        if (mapped.TryGetValue("cnpj", out var cnpj) && NfeText.Digits(cnpj).Length != 14)
        {
            errors.Add(Error(rowNumber, "cnpj", cnpj, "CNPJ invalido.", "Informe CNPJ com 14 digitos."));
        }

        if (mapped.TryGetValue("competence", out var competence) && !TryParseDate(competence, out _))
        {
            errors.Add(Error(rowNumber, "competence", competence, "Competencia invalida.", "Use AAAA-MM-DD, DD/MM/AAAA ou MM/AAAA."));
        }

        if (mapped.TryGetValue("dueDate", out var dueDate) && !string.IsNullOrWhiteSpace(dueDate) && !TryParseDate(dueDate, out _))
        {
            errors.Add(Error(rowNumber, "dueDate", dueDate, "Data de vencimento invalida.", "Use AAAA-MM-DD ou DD/MM/AAAA."));
        }

        if (mapped.TryGetValue("amount", out var amount) && !TryParseDecimal(amount, out _))
        {
            errors.Add(Error(rowNumber, "amount", amount, "Valor invalido.", "Use numero com ponto ou virgula decimal."));
        }

        return new AccountingImportPreviewRow
        {
            RowNumber = rowNumber,
            Valid = errors.All(error => error.Severity != "error"),
            Raw = row,
            Mapped = mapped,
            Errors = errors
        };
    }

    public static bool TryParseDate(string value, out DateOnly date)
    {
        value = value.Trim();
        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date)
            || DateOnly.TryParseExact(value, "dd/MM/yyyy", CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out date))
        {
            return true;
        }

        if (DateOnly.TryParseExact($"01/{value}", "dd/MM/yyyy", CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out date)
            || DateOnly.TryParseExact($"{value}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            return true;
        }

        date = default;
        return false;
    }

    public static bool TryParseDecimal(string value, out decimal amount)
    {
        var normalized = value.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (normalized.Contains(',') && normalized.Contains('.'))
        {
            normalized = normalized.Replace(".", "", StringComparison.Ordinal).Replace(',', '.');
        }
        else
        {
            normalized = normalized.Replace(',', '.');
        }

        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out amount);
    }

    private static List<Dictionary<string, string>> ParseJsonRows(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement.ValueKind == JsonValueKind.Array
            ? document.RootElement
            : document.RootElement.TryGetProperty("rows", out var rowsElement) ? rowsElement : document.RootElement;

        if (root.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("JSON de importacao deve ser um array ou possuir a propriedade rows.");
        }

        return root.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.Object)
            .Select(item => item.EnumerateObject().ToDictionary(
                property => property.Name,
                property => ValueToString(property.Value),
                StringComparer.OrdinalIgnoreCase))
            .ToList();
    }

    private static List<Dictionary<string, string>> ParseCsvRows(string content)
    {
        var lines = content.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n')
            .Split('\n')
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();

        if (lines.Count < 2)
        {
            throw new InvalidOperationException("CSV deve conter cabecalho e ao menos uma linha.");
        }

        var delimiter = GuessDelimiter(lines[0]);
        var headers = SplitCsvLine(lines[0], delimiter).Select(header => header.Trim()).ToList();

        return lines.Skip(1)
            .Select(line => SplitCsvLine(line, delimiter))
            .Select(values =>
            {
                var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (var index = 0; index < headers.Count; index++)
                {
                    row[headers[index]] = index < values.Count ? values[index] : "";
                }

                return row;
            })
            .ToList();
    }

    private static char GuessDelimiter(string header)
    {
        var semicolons = header.Count(character => character == ';');
        var commas = header.Count(character => character == ',');
        return semicolons > commas ? ';' : ',';
    }

    private static List<string> SplitCsvLine(string line, char delimiter)
    {
        var values = new List<string>();
        var current = new StringBuilder();
        var quoted = false;

        for (var index = 0; index < line.Length; index++)
        {
            var character = line[index];
            if (character == '"')
            {
                if (quoted && index + 1 < line.Length && line[index + 1] == '"')
                {
                    current.Append('"');
                    index++;
                }
                else
                {
                    quoted = !quoted;
                }
                continue;
            }

            if (character == delimiter && !quoted)
            {
                values.Add(current.ToString().Trim());
                current.Clear();
                continue;
            }

            current.Append(character);
        }

        values.Add(current.ToString().Trim());
        return values;
    }

    private static string ValueToString(JsonElement value) =>
        value.ValueKind switch
        {
            JsonValueKind.Null => "",
            JsonValueKind.Undefined => "",
            JsonValueKind.String => value.GetString() ?? "",
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => value.GetRawText()
        };

    private static bool HasFormulaInjection(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length > 0 && DangerousFormulaPrefixes.Contains(trimmed[0]);
    }

    private static AccountingImportError Error(
        int rowNumber,
        string fieldName,
        string fieldValue,
        string reason,
        string expectedFix) =>
        new()
        {
            RowNumber = rowNumber,
            FieldName = fieldName,
            FieldValue = fieldValue,
            Reason = reason,
            ExpectedFix = expectedFix
        };
}
