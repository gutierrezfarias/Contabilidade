using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NfeReturnParserService
{
    public SefazSoapResult Parse(string responseXml, string endpoint, string requestKind)
    {
        var normalized = DecodeSoapEscapedXml(responseXml);
        var document = XDocument.Parse(normalized, LoadOptions.PreserveWhitespace);
        var cStat = LastValue(document, "cStat");
        var xMotivo = LastValue(document, "xMotivo");

        return new SefazSoapResult
        {
            Success = IsSuccessfulStatus(cStat),
            AccessKey = LastValue(document, "chNFe"),
            CStat = cStat,
            Endpoint = endpoint,
            ProtocolNumber = LastValue(document, "nProt"),
            ReceiptNumber = LastValue(document, "nRec"),
            RequestKind = requestKind,
            ResponseXml = normalized,
            XMotivo = xMotivo
        };
    }

    public static string LastValue(XDocument document, string localName) =>
        document.Descendants()
            .Where(element => element.Name.LocalName == localName)
            .Select(element => element.Value.Trim())
            .LastOrDefault() ?? "";

    private static bool IsSuccessfulStatus(string cStat) =>
        cStat is "100" or "102" or "103" or "104" or "105" or "128" or "135" or "136" or "150" or "155";

    private static string DecodeSoapEscapedXml(string value) =>
        value.Replace("&lt;", "<")
            .Replace("&gt;", ">")
            .Replace("&quot;", "\"")
            .Replace("&apos;", "'")
            .Replace("&amp;", "&");
}
