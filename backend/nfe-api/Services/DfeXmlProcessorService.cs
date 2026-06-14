using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class DfeXmlProcessorService
{
    private static readonly XNamespace NfeNs = "http://www.portalfiscal.inf.br/nfe";

    public string BuildDistNsuXml(string cnpj, string uf, string environment, string lastNsu) =>
        BuildDistributionXml(cnpj, uf, environment, new XElement(NfeNs + "distNSU",
            new XElement(NfeNs + "ultNSU", NormalizeNsu(lastNsu))));

    public string BuildConsNsuXml(string cnpj, string uf, string environment, string nsu) =>
        BuildDistributionXml(cnpj, uf, environment, new XElement(NfeNs + "consNSU",
            new XElement(NfeNs + "NSU", NormalizeNsu(nsu))));

    public string BuildConsAccessKeyXml(string cnpj, string uf, string environment, string accessKey) =>
        BuildDistributionXml(cnpj, uf, environment, new XElement(NfeNs + "consChNFe",
            new XElement(NfeNs + "chNFe", NfeText.Digits(accessKey))));

    public DfeProcessResult ParseDistributionResponse(
        string responseXml,
        string organizationId,
        string clientId,
        string certificateId,
        string clientCnpj,
        string fallbackDirection)
    {
        var document = XDocument.Parse(responseXml, LoadOptions.PreserveWhitespace);
        var statusCode = LastValue(document, "cStat");
        var statusMessage = LastValue(document, "xMotivo");
        var lastNsu = NormalizeNsu(LastValue(document, "ultNSU"));
        var maxNsu = NormalizeNsu(LastValue(document, "maxNSU"));
        var docs = new List<DfeProcessedDocument>();

        foreach (var docZip in document.Descendants().Where(item => item.Name.LocalName == "docZip"))
        {
            var nsu = docZip.Attribute("NSU")?.Value ?? "";
            var schema = docZip.Attribute("schema")?.Value ?? "";
            var zipped = docZip.Value.Trim();
            if (string.IsNullOrWhiteSpace(zipped))
            {
                continue;
            }

            var xml = DecodeDocZip(zipped);
            var processed = ParseReturnedXml(
                xml,
                organizationId,
                clientId,
                certificateId,
                NormalizeNsu(nsu),
                schema,
                NfeText.Digits(clientCnpj),
                fallbackDirection);
            docs.Add(processed);
        }

        return new DfeProcessResult
        {
            Documents = docs,
            LastNsu = lastNsu,
            MaxNsu = maxNsu,
            StatusCode = statusCode,
            StatusMessage = statusMessage
        };
    }

    public string HashXml(string xml)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(xml));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private DfeProcessedDocument ParseReturnedXml(
        string xml,
        string organizationId,
        string clientId,
        string certificateId,
        string nsu,
        string schema,
        string clientCnpj,
        string fallbackDirection)
    {
        var document = XDocument.Parse(xml, LoadOptions.PreserveWhitespace);
        var rootName = document.Root?.Name.LocalName ?? schema;
        var schemaName = string.IsNullOrWhiteSpace(schema) ? rootName : schema;
        var hash = HashXml(xml);
        var parsed = schemaName.Contains("procEvento", StringComparison.OrdinalIgnoreCase) || rootName == "procEventoNFe"
            ? ParseProcEvento(document, clientCnpj, fallbackDirection)
            : schemaName.Contains("procNFe", StringComparison.OrdinalIgnoreCase) || document.Descendants().Any(item => item.Name.LocalName == "infNFe")
                ? ParseProcNfe(document, clientCnpj, fallbackDirection)
                : ParseResumo(document, clientCnpj, fallbackDirection);

        var write = parsed.Document with
        {
            CertificateId = certificateId,
            ClientId = clientId,
            HasFullXml = IsFullXml(schemaName, rootName),
            OrganizationId = organizationId,
            Nsu = nsu,
            SchemaName = schemaName,
            XmlHash = hash
        };

        var storagePath = BuildStoragePath(write, hash);
        write = write with { XmlStoragePath = storagePath };

        return new DfeProcessedDocument
        {
            Document = write,
            Event = parsed.Event is null
                ? null
                : parsed.Event with
                {
                    ClientId = clientId,
                    OrganizationId = organizationId,
                    PrivateXmlStoragePath = storagePath,
                    ResponseXmlHash = hash
                },
            Xml = xml
        };
    }

    private static (DfeDocumentWrite Document, DfeEventWrite? Event) ParseResumo(
        XDocument xml,
        string clientCnpj,
        string fallbackDirection)
    {
        var root = xml.Descendants().FirstOrDefault(item => item.Name.LocalName == "resNFe") ?? xml.Root!;
        var accessKey = Value(root, "chNFe");
        var issuer = Digits(Value(root, "CNPJ") + Value(root, "CPF"));
        var issueDate = ParseDate(Value(root, "dhEmi"));
        var statusCode = Value(root, "cSitNFe");
        var summary = new
        {
            chNFe = accessKey,
            cSitNFe = statusCode,
            dhEmi = Value(root, "dhEmi"),
            nProt = Value(root, "nProt"),
            xNome = Value(root, "xNome")
        };

        return (new DfeDocumentWrite
        {
            AccessKey = accessKey,
            Direction = ClassifyDirection(clientCnpj, issuer, "", fallbackDirection),
            DocumentType = "resNFe",
            IssuerCnpj = issuer,
            IssuerName = Value(root, "xNome"),
            IssueDate = issueDate,
            AuthorizationDate = ParseDate(Value(root, "dhRecbto")),
            NfeStatus = StatusFromCode(statusCode),
            ManifestationStatus = "Pendente",
            SummaryData = summary,
            TotalValue = ParseDecimal(Value(root, "vNF"))
        }, null);
    }

    private static (DfeDocumentWrite Document, DfeEventWrite? Event) ParseProcNfe(
        XDocument xml,
        string clientCnpj,
        string fallbackDirection)
    {
        var infNfe = xml.Descendants().FirstOrDefault(item => item.Name.LocalName == "infNFe") ?? xml.Root!;
        var ide = infNfe.Elements().FirstOrDefault(item => item.Name.LocalName == "ide");
        var emit = infNfe.Elements().FirstOrDefault(item => item.Name.LocalName == "emit");
        var dest = infNfe.Elements().FirstOrDefault(item => item.Name.LocalName == "dest");
        var total = infNfe.Descendants().FirstOrDefault(item => item.Name.LocalName == "ICMSTot");
        var prot = xml.Descendants().FirstOrDefault(item => item.Name.LocalName == "protNFe");
        var infProt = prot?.Descendants().FirstOrDefault(item => item.Name.LocalName == "infProt");
        var accessKey = Value(infProt, "chNFe");
        if (string.IsNullOrWhiteSpace(accessKey))
        {
            accessKey = (infNfe.Attribute("Id")?.Value ?? "").Replace("NFe", "", StringComparison.OrdinalIgnoreCase);
        }

        var issuer = Digits(Value(emit, "CNPJ") + Value(emit, "CPF"));
        var recipient = Digits(Value(dest, "CNPJ") + Value(dest, "CPF"));
        var cStat = Value(infProt, "cStat");
        var products = infNfe.Descendants()
            .Where(item => item.Name.LocalName == "det")
            .Select(item => new
            {
                codigo = Value(item, "cProd"),
                descricao = Value(item, "xProd"),
                ncm = Value(item, "NCM"),
                cfop = Value(item, "CFOP"),
                quantidade = Value(item, "qCom"),
                valor = Value(item, "vProd")
            })
            .ToArray();

        return (new DfeDocumentWrite
        {
            AccessKey = accessKey,
            AuthorizationDate = ParseDate(Value(infProt, "dhRecbto")),
            Direction = ClassifyDirection(clientCnpj, issuer, recipient, fallbackDirection),
            DocumentType = "procNFe",
            IssuerCnpj = issuer,
            IssuerName = Value(emit, "xNome"),
            IssueDate = ParseDate(Value(ide, "dhEmi")),
            NfeStatus = StatusFromCode(cStat),
            ManifestationStatus = "Pendente",
            RecipientCnpj = recipient,
            RecipientName = Value(dest, "xNome"),
            SummaryData = new
            {
                cStat,
                cfops = products.Select(item => item.cfop).Distinct().ToArray(),
                nProt = Value(infProt, "nProt"),
                numero = Value(ide, "nNF"),
                produtos = products,
                serie = Value(ide, "serie"),
                xMotivo = Value(infProt, "xMotivo")
            },
            TotalValue = ParseDecimal(Value(total, "vNF"))
        }, null);
    }

    private static (DfeDocumentWrite Document, DfeEventWrite? Event) ParseProcEvento(
        XDocument xml,
        string clientCnpj,
        string fallbackDirection)
    {
        var infEvento = xml.Descendants().FirstOrDefault(item => item.Name.LocalName == "infEvento");
        var retEvento = xml.Descendants().FirstOrDefault(item => item.Name.LocalName == "retEvento");
        var infRetEvento = retEvento?.Descendants().FirstOrDefault(item => item.Name.LocalName == "infEvento");
        var accessKey = Value(infEvento, "chNFe") is { Length: > 0 } key ? key : Value(infRetEvento, "chNFe");
        var eventType = Value(infEvento, "tpEvento") is { Length: > 0 } tp ? tp : Value(infRetEvento, "tpEvento");
        var sequence = int.TryParse(Value(infEvento, "nSeqEvento"), out var seq) ? seq : 1;
        var cnpj = Digits(Value(infEvento, "CNPJ") + Value(infEvento, "CPF"));
        var statusCode = Value(infRetEvento, "cStat");
        var statusMessage = Value(infRetEvento, "xMotivo");

        var eventWrite = new DfeEventWrite
        {
            AccessKey = accessKey,
            EventDate = ParseDate(Value(infEvento, "dhEvento")),
            EventType = eventType,
            ProtocolNumber = Value(infRetEvento, "nProt"),
            Sequence = sequence,
            StatusCode = statusCode,
            StatusMessage = statusMessage
        };

        return (new DfeDocumentWrite
        {
            AccessKey = accessKey,
            AuthorizationDate = ParseDate(Value(infRetEvento, "dhRegEvento")),
            Direction = ClassifyDirection(clientCnpj, cnpj, "", fallbackDirection) == "emitida" ? "emitida" : "evento",
            DocumentType = "procEventoNFe",
            IssuerCnpj = cnpj,
            IssueDate = ParseDate(Value(infEvento, "dhEvento")),
            ManifestationStatus = ManifestationStatusFromEvent(eventType),
            NfeStatus = StatusFromCode(statusCode),
            SummaryData = new
            {
                cStat = statusCode,
                eventType,
                nProt = eventWrite.ProtocolNumber,
                sequence,
                xMotivo = statusMessage
            }
        }, eventWrite);
    }

    private static string BuildDistributionXml(string cnpj, string uf, string environment, XElement queryElement)
    {
        var tpAmb = NfeEndpointResolver.ParseEnvironment(environment) == NfeEnvironment.Producao ? "1" : "2";
        var cUf = NfeEndpointResolver.CodeForUf(uf);
        return new XElement(NfeNs + "distDFeInt",
            new XAttribute("versao", "1.01"),
            new XElement(NfeNs + "tpAmb", tpAmb),
            new XElement(NfeNs + "cUFAutor", cUf),
            new XElement(NfeNs + "CNPJ", NfeText.Digits(cnpj)),
            queryElement).ToString(SaveOptions.DisableFormatting);
    }

    private static string DecodeDocZip(string base64)
    {
        var bytes = Convert.FromBase64String(base64);
        using var input = new MemoryStream(bytes);
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        using var output = new MemoryStream();
        gzip.CopyTo(output);
        return Encoding.UTF8.GetString(output.ToArray());
    }

    private static string BuildStoragePath(DfeDocumentWrite document, string hash)
    {
        var today = DateTimeOffset.UtcNow;
        var safeKey = string.IsNullOrWhiteSpace(document.AccessKey) ? document.Nsu : document.AccessKey;
        safeKey = string.IsNullOrWhiteSpace(safeKey) ? hash[..16] : safeKey;
        return $"{document.OrganizationId}/{document.ClientId}/{today:yyyy/MM}/{document.SchemaName}-{safeKey}-{hash[..16]}.xml";
    }

    private static bool IsFullXml(string schemaName, string rootName) =>
        schemaName.Contains("procNFe", StringComparison.OrdinalIgnoreCase)
        || schemaName.Contains("procEvento", StringComparison.OrdinalIgnoreCase)
        || rootName.Contains("procNFe", StringComparison.OrdinalIgnoreCase)
        || rootName.Contains("procEvento", StringComparison.OrdinalIgnoreCase);

    private static string ClassifyDirection(string clientCnpj, string issuerCnpj, string recipientCnpj, string fallback)
    {
        if (!string.IsNullOrWhiteSpace(issuerCnpj) && issuerCnpj == clientCnpj) return "emitida";
        if (!string.IsNullOrWhiteSpace(recipientCnpj) && recipientCnpj == clientCnpj) return "recebida";
        return string.IsNullOrWhiteSpace(fallback) ? "citada" : fallback;
    }

    private static string StatusFromCode(string value) => value switch
    {
        "1" or "100" or "135" or "136" => "Autorizada",
        "3" or "101" or "151" or "155" => "Cancelada",
        "2" or "110" or "301" or "302" => "Rejeitada",
        _ => string.IsNullOrWhiteSpace(value) ? "Consultada" : value
    };

    private static string ManifestationStatusFromEvent(string eventType) => eventType switch
    {
        "210200" => "Confirmada",
        "210210" => "Ciencia",
        "210220" => "Desconhecida",
        "210240" => "Nao realizada",
        _ => "Pendente"
    };

    private static DateTimeOffset? ParseDate(string value)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var result))
        {
            return result;
        }

        return null;
    }

    private static decimal ParseDecimal(string value) =>
        decimal.TryParse(value.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var result)
            ? result
            : 0;

    private static string NormalizeNsu(string value)
    {
        var digits = NfeText.Digits(value);
        return string.IsNullOrWhiteSpace(digits) ? "000000000000000" : digits.PadLeft(15, '0')[^15..];
    }

    private static string LastValue(XDocument document, string localName) =>
        document.Descendants()
            .Where(item => item.Name.LocalName == localName)
            .Select(item => item.Value.Trim())
            .LastOrDefault() ?? "";

    private static string Value(XElement? element, string localName) =>
        element?.Descendants()
            .FirstOrDefault(item => item.Name.LocalName == localName)
            ?.Value.Trim() ?? "";

    private static string Digits(string value) => NfeText.Digits(value);
}
