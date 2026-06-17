using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class ManualRevenueImportService(SupabaseSerproRepository repository)
{
    private const long MaxFileSize = 20 * 1024 * 1024;
    private const long MaxZipTotalSize = 80 * 1024 * 1024;
    private const int MaxFilesPerBatch = 100;

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

    public async Task<ManualRevenueImportPreviewResult> PreviewAsync(
        ManualRevenueImportPreviewRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.OrganizationId))
        {
            throw new InvalidOperationException("Organizacao obrigatoria.");
        }

        var clients = await repository.ListClientsForManualRevenueImportAsync(request.OrganizationId, cancellationToken);
        var files = ExpandFiles(request.Files);
        var items = new List<ManualRevenueImportPreviewItem>();

        foreach (var file in files.Take(MaxFilesPerBatch))
        {
            var item = await BuildPreviewItemAsync(request.OrganizationId, file, clients, cancellationToken);
            items.Add(item);
        }

        return new ManualRevenueImportPreviewResult(
            true,
            items.Count == 0 ? "Nenhum arquivo valido encontrado." : "Previa gerada. Revise antes de confirmar.",
            items);
    }

    public async Task<ManualRevenueImportConfirmResult> ConfirmAsync(
        ManualRevenueImportConfirmRequest request,
        string userId,
        CancellationToken cancellationToken)
    {
        var files = request.Items.Where(item => !item.Ignored).Take(MaxFilesPerBatch).ToList();
        var duplicateCount = 0;
        var errorCount = 0;
        var importedCount = 0;
        var ignoredCount = request.Items.Count(item => item.Ignored);
        var batchId = await repository.CreateManualRevenueBatchAsync(
            request.OrganizationId,
            userId,
            request.Items.Count,
            files.Count,
            0,
            0,
            ignoredCount,
            cancellationToken);

        foreach (var item in files)
        {
            try
            {
                var file = DecodeFile(item.FileName, item.MimeType, item.Base64Data);
                ValidateSingleFile(file);
                var hash = Hash(file.Content);
                var externalId = BuildExternalId(item);
                var logicalKey = BuildLogicalKey(request.OrganizationId, item.ClientId, item, externalId);
                var duplicate = await repository.FindManualRevenueDuplicateAsync(request.OrganizationId, hash, externalId, logicalKey, cancellationToken);
                var safeFileName = SafeFileName(file.FileName);

                if (duplicate.ValueKind != JsonValueKind.Undefined)
                {
                    duplicateCount++;
                    await repository.InsertManualRevenueItemAsync(
                        request.OrganizationId,
                        batchId,
                        item.ClientId,
                        null,
                        item with { FileHash = hash },
                        safeFileName,
                        file.Content.LongLength,
                        "duplicate",
                        "duplicate",
                        "Documento duplicado por hash.",
                        "",
                        cancellationToken);
                    continue;
                }

                var storagePath = $"{request.OrganizationId}/{batchId}/{hash}-{safeFileName}";
                await repository.UploadManualRevenueDocumentAsync(storagePath, file.Content, file.MimeType, cancellationToken);
                var documentId = await repository.InsertManualRevenueDocumentAsync(
                    request.OrganizationId,
                    item.ClientId,
                    batchId,
                    item with { FileHash = hash },
                    safeFileName,
                    file.Content.LongLength,
                    storagePath,
                    userId,
                    cancellationToken);
                await repository.InsertManualRevenueItemAsync(
                    request.OrganizationId,
                    batchId,
                    item.ClientId,
                    documentId,
                    item with { FileHash = hash },
                    safeFileName,
                    file.Content.LongLength,
                    string.IsNullOrWhiteSpace(item.ClientId) ? "client_not_found" : "auto_linked",
                    "imported",
                    "",
                    storagePath,
                    cancellationToken);
                importedCount++;
            }
            catch (Exception error)
            {
                errorCount++;
                await repository.InsertManualRevenueItemAsync(
                    request.OrganizationId,
                    batchId,
                    item.ClientId,
                    null,
                    item,
                    SafeFileName(item.FileName),
                    0,
                    "error",
                    "error",
                    error.Message,
                    "",
                    cancellationToken);
            }
        }

        return new ManualRevenueImportConfirmResult(
            true,
            batchId,
            importedCount,
            duplicateCount,
            errorCount,
            ignoredCount,
            "Importacao manual concluida sem uso de API Serpro e sem consumo de creditos.");
    }

    private async Task<ManualRevenueImportPreviewItem> BuildPreviewItemAsync(
        string organizationId,
        DecodedFile file,
        List<JsonElement> clients,
        CancellationToken cancellationToken)
    {
        var id = Guid.NewGuid().ToString("N");
        var safeName = SafeFileName(file.FileName);
        var error = "";

        try
        {
            ValidateSingleFile(file);
        }
        catch (Exception validationError)
        {
            error = validationError.Message;
        }

        var hash = error.Length == 0 ? Hash(file.Content) : "";
        var text = error.Length == 0 ? ExtractText(file) : "";
        var facts = ExtractFacts(text, file.FileName);
        var match = MatchClient(facts.TaxId, clients);
        var externalId = ManualRevenueImportRules.BuildExternalId(
            "manual_ecac",
            facts.DocumentType,
            facts.TaxId,
            facts.ReceiptNumber,
            facts.ProtocolNumber,
            facts.RevenueCode,
            facts.Competency);
        var logicalKey = ManualRevenueImportRules.BuildLogicalKey(
            organizationId,
            match.ClientId,
            "manual_ecac",
            facts.DocumentType,
            facts.Competency,
            facts.DueDate,
            facts.Amount,
            externalId,
            facts.TaxId);
        var duplicate = hash.Length == 0 && externalId.Length == 0 && logicalKey.Length == 0
            ? default
            : await repository.FindManualRevenueDuplicateAsync(organizationId, hash, externalId, logicalKey, cancellationToken);

        return new ManualRevenueImportPreviewItem(
            id,
            file.FileName,
            safeName,
            file.MimeType,
            file.Content.LongLength,
            hash,
            facts.TaxId,
            facts.CompanyName,
            facts.DocumentType,
            facts.ServiceName,
            facts.Competency,
            facts.PeriodLabel,
            facts.IssuedAt,
            facts.DueDate,
            facts.Amount,
            facts.RevenueCode,
            facts.ReceiptNumber,
            facts.ProtocolNumber,
            facts.DocumentStatus,
            facts.CertificateValidUntil,
            match.ClientId,
            match.ClientName,
            match.MatchStatus,
            duplicate.ValueKind != JsonValueKind.Undefined,
            duplicate.ValueKind == JsonValueKind.Undefined ? null : Get(duplicate, "id"),
            error,
            ActionRequired(error, duplicate.ValueKind != JsonValueKind.Undefined, match.MatchStatus));
    }

    private static List<DecodedFile> ExpandFiles(List<ManualRevenueImportFileInput> inputs)
    {
        var result = new List<DecodedFile>();
        foreach (var input in inputs.Take(MaxFilesPerBatch))
        {
            var file = DecodeFile(input.FileName, input.MimeType, input.Base64Data);
            var extension = Path.GetExtension(file.FileName);
            if (extension.Equals(".zip", StringComparison.OrdinalIgnoreCase))
            {
                result.AddRange(ExpandZip(file));
            }
            else
            {
                result.Add(file);
            }
        }

        return result;
    }

    private static List<DecodedFile> ExpandZip(DecodedFile zipFile)
    {
        if (zipFile.Content.LongLength > MaxFileSize)
        {
            throw new InvalidOperationException("ZIP excede o limite permitido.");
        }

        var result = new List<DecodedFile>();
        long total = 0;
        using var stream = new MemoryStream(zipFile.Content);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name))
            {
                continue;
            }

            if (entry.FullName.Contains("..") || Path.IsPathRooted(entry.FullName))
            {
                throw new InvalidOperationException("ZIP bloqueado por tentativa de path traversal.");
            }

            var extension = Path.GetExtension(entry.Name);
            if (!AllowedExtensions.Contains(extension) || DangerousExtensions.Contains(extension) || extension.Equals(".zip", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Arquivo nao permitido dentro do ZIP: {entry.Name}");
            }

            total += entry.Length;
            if (entry.Length > MaxFileSize || total > MaxZipTotalSize)
            {
                throw new InvalidOperationException("ZIP bloqueado por tamanho excessivo.");
            }

            using var entryStream = entry.Open();
            using var memory = new MemoryStream();
            entryStream.CopyTo(memory);
            result.Add(new DecodedFile($"{zipFile.FileName}::{entry.Name}", GuessMimeType(entry.Name, ""), memory.ToArray()));
        }

        return result;
    }

    private static DecodedFile DecodeFile(string fileName, string mimeType, string base64Data)
    {
        var comma = base64Data.IndexOf(',');
        var payload = comma >= 0 ? base64Data[(comma + 1)..] : base64Data;
        var bytes = Convert.FromBase64String(payload);
        if (fileName.Contains("::", StringComparison.Ordinal))
        {
            var parts = fileName.Split(["::"], 2, StringSplitOptions.None);
            using var stream = new MemoryStream(bytes);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            var entry = archive.Entries.FirstOrDefault(item => item.FullName == parts[1]);
            if (entry is null || entry.FullName.Contains("..") || Path.IsPathRooted(entry.FullName))
            {
                throw new InvalidOperationException("Entrada do ZIP invalida ou nao encontrada.");
            }

            using var entryStream = entry.Open();
            using var memory = new MemoryStream();
            entryStream.CopyTo(memory);
            return new DecodedFile(entry.Name, GuessMimeType(entry.Name, mimeType), memory.ToArray());
        }

        return new DecodedFile(fileName, GuessMimeType(fileName, mimeType), bytes);
    }

    private static void ValidateSingleFile(DecodedFile file)
    {
        if (file.Content.LongLength == 0)
        {
            throw new InvalidOperationException("Arquivo vazio.");
        }

        if (file.Content.LongLength > MaxFileSize)
        {
            throw new InvalidOperationException("Arquivo excede o limite de 20 MB.");
        }

        var extension = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(extension) || DangerousExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Formato de arquivo nao permitido.");
        }

        if (extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase) && !StartsWith(file.Content, "%PDF"u8.ToArray()))
        {
            throw new InvalidOperationException("PDF invalido ou corrompido.");
        }
    }

    private static string ExtractText(DecodedFile file)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension == ".json")
        {
            return Encoding.UTF8.GetString(file.Content);
        }

        if (extension is ".xml" or ".csv")
        {
            return DecodeText(file.Content);
        }

        if (extension == ".pdf")
        {
            return ExtractTextFromPdfBytes(file.Content);
        }

        return DecodeText(file.Content);
    }

    private static string ExtractTextFromPdfBytes(byte[] bytes)
    {
        var text = DecodeText(bytes);
        text = Regex.Replace(text, @"\\[rn]", " ");
        text = Regex.Replace(text, @"[^\u0020-\u007E\u00A0-\u00FF]", " ");
        return Regex.Replace(text, @"\s+", " ");
    }

    private static ExtractedFacts ExtractFacts(string text, string fileName)
    {
        var search = $"{fileName} {text}";
        var taxId = FirstMatch(search, @"\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}");
        if (string.IsNullOrWhiteSpace(taxId))
        {
            taxId = FirstMatch(search, @"\d{3}\.?\d{3}\.?\d{3}-?\d{2}");
        }

        return new ExtractedFacts(
            NormalizeDigits(taxId),
            GuessCompanyName(search),
            GuessDocumentType(search),
            GuessService(search),
            GuessCompetency(search),
            FirstMatch(search, @"(?:periodo|período|competencia|competência)[:\s-]*(\d{2}/\d{4})", 1),
            GuessDate(search, "(?:emissao|emissão|emitido em|data de emissao|data de emissão)"),
            GuessDate(search, "(?:vencimento|venc\\.)"),
            GuessAmount(search),
            FirstMatch(search, @"(?:codigo|código)\s+de\s+receita[:\s-]*(\d{3,6})", 1),
            FirstMatch(search, @"(?:recibo|numero do recibo|número do recibo)[:\s-]*([A-Z0-9.\-/]+)", 1),
            FirstMatch(search, @"(?:protocolo)[:\s-]*([A-Z0-9.\-/]+)", 1),
            GuessStatus(search),
            GuessDate(search, "(?:validade|valida ate|válida até)"));
    }

    private static string GuessDocumentType(string text)
    {
        var normalized = text.ToLowerInvariant();
        if (normalized.Contains("certidao negativa") || normalized.Contains("certidão negativa")) return "CND";
        if (normalized.Contains("positiva com efeitos")) return "CPEND";
        if (normalized.Contains("situacao fiscal") || normalized.Contains("situação fiscal")) return "relatorio_situacao_fiscal";
        if (normalized.Contains("documento de arrecadacao do simples") || normalized.Contains(" das ")) return "DAS";
        if (normalized.Contains("darf")) return "DARF";
        if (normalized.Contains("dctfweb")) return "DCTFWeb";
        if (normalized.Contains("mit ")) return "MIT";
        if (normalized.Contains("recibo")) return "recibo";
        if (normalized.Contains("comprovante de pagamento")) return "comprovante_pagamento";
        if (normalized.Contains("parcelamento")) return "parcelamento";
        if (normalized.Contains("caixa postal")) return "caixa_postal";
        if (normalized.Contains("processo")) return "processo";
        if (normalized.Contains("declaracao") || normalized.Contains("declaração")) return "declaracao";
        return "documento_nao_identificado";
    }

    private static string GuessService(string text)
    {
        var type = GuessDocumentType(text);
        return type == "documento_nao_identificado" ? "" : type;
    }

    private static string GuessCompetency(string text)
    {
        return FirstMatch(text, @"(?:competencia|competência|periodo|período)[:\s-]*(\d{2}/\d{4})", 1);
    }

    private static string GuessCompanyName(string text)
    {
        var name = FirstMatch(text, @"(?:nome empresarial|razao social|razão social)[:\s-]*([A-Z0-9 &.,/\-]{5,120})", 1);
        return Regex.Replace(name, @"\s+", " ").Trim();
    }

    private static string GuessStatus(string text)
    {
        if (Regex.IsMatch(text, @"\bativa\b", RegexOptions.IgnoreCase)) return "Ativa";
        if (Regex.IsMatch(text, @"\bpendente\b", RegexOptions.IgnoreCase)) return "Pendente";
        if (Regex.IsMatch(text, @"\bregular\b", RegexOptions.IgnoreCase)) return "Regular";
        return "";
    }

    private static string? GuessDate(string text, string labelPattern)
    {
        var value = FirstMatch(text, $@"{labelPattern}[:\s-]*(\d{{2}}/\d{{2}}/\d{{4}})", 1);
        if (DateTime.TryParseExact(value, "dd/MM/yyyy", CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out var parsed))
        {
            return parsed.ToString("yyyy-MM-dd");
        }

        return null;
    }

    private static decimal? GuessAmount(string text)
    {
        var value = FirstMatch(text, @"(?:valor|total)[:\sR$-]*([\d.]+,\d{2})", 1);
        if (decimal.TryParse(value, NumberStyles.Number, CultureInfo.GetCultureInfo("pt-BR"), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static ClientMatch MatchClient(string taxId, List<JsonElement> clients)
    {
        var digits = NormalizeDigits(taxId);
        if (string.IsNullOrWhiteSpace(digits))
        {
            return new ClientMatch(null, "", "client_not_found");
        }

        var matches = clients
            .Where(client => NormalizeDigits(Get(client, "cnpj")) == digits)
            .ToList();

        if (matches.Count == 1)
        {
            return new ClientMatch(Get(matches[0], "id"), Get(matches[0], "company_name"), "auto_linked");
        }

        return matches.Count > 1
            ? new ClientMatch(null, "", "multiple_matches")
            : new ClientMatch(null, "", "client_not_found");
    }

    private static string ActionRequired(string error, bool duplicate, string matchStatus)
    {
        if (!string.IsNullOrWhiteSpace(error)) return "Corrigir arquivo";
        if (duplicate) return "Ignorar ou confirmar duplicado";
        if (matchStatus == "multiple_matches") return "Selecionar cliente";
        if (matchStatus == "client_not_found") return "Cadastrar ou selecionar cliente";
        return "Confirmar importacao";
    }

    private static string BuildExternalId(ManualRevenueImportConfirmItem item)
    {
        return ManualRevenueImportRules.BuildExternalId(
            "manual_ecac",
            item.DocumentType,
            item.TaxId,
            item.ReceiptNumber,
            item.ProtocolNumber,
            item.RevenueCode,
            item.Competency);
    }

    private static string BuildLogicalKey(
        string organizationId,
        string? clientId,
        ManualRevenueImportConfirmItem item,
        string externalId)
    {
        return ManualRevenueImportRules.BuildLogicalKey(
            organizationId,
            clientId,
            "manual_ecac",
            item.DocumentType,
            item.Competency,
            item.DueDate,
            item.Amount,
            externalId,
            item.TaxId);
    }

    private static string FirstMatch(string text, string pattern, int group = 0)
    {
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
        return match.Success ? match.Groups[group].Value.Trim() : "";
    }

    private static string Hash(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static string SafeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(invalid, '_');
        }

        return string.IsNullOrWhiteSpace(name) ? $"documento-{Guid.NewGuid():N}.bin" : name;
    }

    private static string GuessMimeType(string fileName, string mimeType)
    {
        if (!string.IsNullOrWhiteSpace(mimeType) && mimeType != "application/octet-stream")
        {
            return mimeType;
        }

        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".xml" => "application/xml",
            ".json" => "application/json",
            ".csv" => "text/csv",
            ".zip" => "application/zip",
            _ => "application/octet-stream"
        };
    }

    private static bool StartsWith(byte[] source, byte[] prefix)
    {
        return source.Length >= prefix.Length && source.AsSpan(0, prefix.Length).SequenceEqual(prefix);
    }

    private static string DecodeText(byte[] bytes)
    {
        try
        {
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return Encoding.Latin1.GetString(bytes);
        }
    }

    private static string NormalizeDigits(string value)
    {
        return new string((value ?? "").Where(char.IsDigit).ToArray());
    }

    private static string Get(JsonElement row, string name)
    {
        return row.ValueKind != JsonValueKind.Undefined
            && row.TryGetProperty(name, out var value)
            && value.ValueKind != JsonValueKind.Null
            ? value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString()
            : "";
    }

    private sealed record DecodedFile(string FileName, string MimeType, byte[] Content);

    private sealed record ExtractedFacts(
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
        string? CertificateValidUntil);

    private sealed record ClientMatch(string? ClientId, string ClientName, string MatchStatus);
}
