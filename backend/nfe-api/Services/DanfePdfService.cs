using System.Text;
using System.Xml.Linq;

namespace ContHub.NfeApi.Services;

public sealed class DanfePdfService
{
    public string GenerateBase64(string xml)
    {
        var lines = ExtractLines(xml);
        var pdf = BuildPdf(lines);
        return Convert.ToBase64String(pdf);
    }

    private static List<string> ExtractLines(string xml)
    {
        var lines = new List<string>
        {
            "CONT HUB - DANFE",
            "Documento Auxiliar da Nota Fiscal Eletronica",
            "Consulte a validade no portal nacional da NF-e."
        };

        try
        {
            var document = XDocument.Parse(xml);
            string Value(string name) => document
                .Descendants()
                .FirstOrDefault(element => element.Name.LocalName == name)
                ?.Value
                ?.Trim()
                ?? "";

            lines.Add($"Chave de acesso: {Value("chNFe")}");
            lines.Add($"Numero: {Value("nNF")}    Serie: {Value("serie")}");
            lines.Add($"Emissao: {Value("dhEmi")}");
            lines.Add($"Emitente: {Value("xNome")}");
            lines.Add($"CNPJ emitente: {Value("CNPJ")}");
            lines.Add($"Natureza: {Value("natOp")}");
            lines.Add($"Valor total: R$ {Value("vNF")}");
            lines.Add($"Protocolo: {Value("nProt")}");
            lines.Add($"Status: {Value("cStat")} - {Value("xMotivo")}");
        }
        catch
        {
            lines.Add("XML autorizado salvo, mas nao foi possivel montar o resumo visual.");
        }

        return lines
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(Sanitize)
            .ToList();
    }

    private static byte[] BuildPdf(IReadOnlyList<string> lines)
    {
        var content = new StringBuilder();
        content.AppendLine("BT");
        content.AppendLine("/F1 14 Tf");
        content.AppendLine("50 780 Td");

        foreach (var line in lines.Take(36))
        {
            content.AppendLine($"({EscapePdf(line)}) Tj");
            content.AppendLine("0 -22 Td");
        }

        content.AppendLine("ET");

        var objects = new List<string>
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            $"<< /Length {Encoding.ASCII.GetByteCount(content.ToString())} >>\nstream\n{content}endstream"
        };

        var builder = new StringBuilder();
        builder.AppendLine("%PDF-1.4");
        var offsets = new List<int> { 0 };

        for (var index = 0; index < objects.Count; index++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(builder.ToString()));
            builder.AppendLine($"{index + 1} 0 obj");
            builder.AppendLine(objects[index]);
            builder.AppendLine("endobj");
        }

        var xrefOffset = Encoding.ASCII.GetByteCount(builder.ToString());
        builder.AppendLine("xref");
        builder.AppendLine($"0 {objects.Count + 1}");
        builder.AppendLine("0000000000 65535 f ");

        foreach (var offset in offsets.Skip(1))
        {
            builder.AppendLine($"{offset:0000000000} 00000 n ");
        }

        builder.AppendLine("trailer");
        builder.AppendLine($"<< /Size {objects.Count + 1} /Root 1 0 R >>");
        builder.AppendLine("startxref");
        builder.AppendLine(xrefOffset.ToString());
        builder.AppendLine("%%EOF");

        return Encoding.ASCII.GetBytes(builder.ToString());
    }

    private static string EscapePdf(string value) =>
        value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");

    private static string SanitizedChar(char value) => value switch
    {
        'á' or 'à' or 'â' or 'ã' or 'ä' => "a",
        'Á' or 'À' or 'Â' or 'Ã' or 'Ä' => "A",
        'é' or 'è' or 'ê' or 'ë' => "e",
        'É' or 'È' or 'Ê' or 'Ë' => "E",
        'í' or 'ì' or 'î' or 'ï' => "i",
        'Í' or 'Ì' or 'Î' or 'Ï' => "I",
        'ó' or 'ò' or 'ô' or 'õ' or 'ö' => "o",
        'Ó' or 'Ò' or 'Ô' or 'Õ' or 'Ö' => "O",
        'ú' or 'ù' or 'û' or 'ü' => "u",
        'Ú' or 'Ù' or 'Û' or 'Ü' => "U",
        'ç' => "c",
        'Ç' => "C",
        'ñ' => "n",
        'Ñ' => "N",
        _ => value is >= ' ' and <= '~' ? value.ToString() : "?"
    };

    private static string Sanitize(string value)
    {
        var builder = new StringBuilder();
        foreach (var character in value)
        {
            builder.Append(SanitizedChar(character));
        }

        return builder.ToString();
    }
}
