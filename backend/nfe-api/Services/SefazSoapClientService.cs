using System.Net.Http.Headers;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SefazSoapClientService(
    NfeEndpointResolver endpointResolver,
    NfeReturnParserService parser)
{
    public Task<SefazSoapResult> AuthorizeAsync(
        string uf,
        string ambiente,
        string enviNfeXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.Authorization(uf, ambiente);
        return PostSoapAsync(
            endpoint,
            "NFeAutorizacao4",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
            "nfeAutorizacaoLote",
            enviNfeXml,
            certificate,
            cancellationToken);
    }

    public Task<SefazSoapResult> ConsultReceiptAsync(
        string uf,
        string ambiente,
        string consReciXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.RetAuthorization(uf, ambiente);
        return PostSoapAsync(
            endpoint,
            "NFeRetAutorizacao4",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4/nfeRetAutorizacaoLote",
            "nfeRetAutorizacaoLote",
            consReciXml,
            certificate,
            cancellationToken);
    }

    public Task<SefazSoapResult> ConsultAccessKeyAsync(
        string uf,
        string ambiente,
        string consSitXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.Query(uf, ambiente);
        return PostSoapAsync(
            endpoint,
            "NFeConsultaProtocolo4",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF",
            "nfeConsultaNF",
            consSitXml,
            certificate,
            cancellationToken);
    }

    public Task<SefazSoapResult> SendEventAsync(
        string uf,
        string ambiente,
        string signedEventXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.Event(uf, ambiente);
        return PostSoapAsync(
            endpoint,
            "NFeRecepcaoEvento4",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF",
            "nfeRecepcaoEventoNF",
            signedEventXml,
            certificate,
            cancellationToken);
    }

    public Task<SefazSoapResult> InutilizeAsync(
        string uf,
        string ambiente,
        string signedInutilizationXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.Inutilization(uf, ambiente);
        return PostSoapAsync(
            endpoint,
            "NFeInutilizacao4",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF",
            "nfeInutilizacaoNF",
            signedInutilizationXml,
            certificate,
            cancellationToken);
    }

    public async Task<SefazStatusResult> CheckStatusAsync(string uf, string ambiente, CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.Status(uf, ambiente);
        var tpAmb = ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2";
        var xml = $"""
            <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
              <tpAmb>{tpAmb}</tpAmb>
              <cUF>{UfCode(uf)}</cUF>
              <xServ>STATUS</xServ>
            </consStatServ>
            """;

        try
        {
            var response = await PostSoapWithoutCertificateAsync(
                endpoint,
                "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF",
                "nfeStatusServicoNF",
                xml,
                cancellationToken);
            var result = parser.Parse(response, endpoint, "status_servico");
            return new SefazStatusResult
            {
                Ambiente = ambiente,
                CStat = result.CStat,
                Endpoint = endpoint,
                Online = result.CStat is "107",
                Status = result.CStat is "107" ? "online" : "instavel",
                Uf = uf,
                XMotivo = result.XMotivo
            };
        }
        catch (Exception error)
        {
            return new SefazStatusResult
            {
                Ambiente = ambiente,
                Endpoint = endpoint,
                Online = false,
                Status = "offline",
                Uf = uf,
                XMotivo = error.Message
            };
        }
    }

    private async Task<SefazSoapResult> PostSoapAsync(
        string endpoint,
        string requestKind,
        string action,
        string operation,
        string payloadXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        using var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(certificate);

        using var client = new HttpClient(handler);
        var response = await PostAsync(client, endpoint, action, operation, payloadXml, cancellationToken);
        return parser.Parse(response, endpoint, requestKind);
    }

    private async Task<string> PostSoapWithoutCertificateAsync(
        string endpoint,
        string action,
        string operation,
        string payloadXml,
        CancellationToken cancellationToken)
    {
        using var client = new HttpClient();
        return await PostAsync(client, endpoint, action, operation, payloadXml, cancellationToken);
    }

    private static async Task<string> PostAsync(
        HttpClient client,
        string endpoint,
        string action,
        string operation,
        string payloadXml,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.TryAddWithoutValidation("SOAPAction", $"\"{action}\"");
        request.Content = new StringContent(BuildEnvelope(operation, payloadXml), Encoding.UTF8, "text/xml");
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("text/xml")
        {
            CharSet = "utf-8"
        };

        using var response = await client.SendAsync(request, cancellationToken);
        var responseXml = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"SEFAZ retornou HTTP {(int)response.StatusCode}.");
        }

        return responseXml;
    }

    private static string BuildEnvelope(string operation, string payloadXml)
    {
        return $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                           xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                           xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <{operation} xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/{WsdlName(operation)}">
                  <nfeDadosMsg>{payloadXml}</nfeDadosMsg>
                </{operation}>
              </soap:Body>
            </soap:Envelope>
            """;
    }

    private static string WsdlName(string operation)
    {
        if (operation.Contains("RetAutorizacao", StringComparison.OrdinalIgnoreCase)) return "NFeRetAutorizacao4";
        if (operation.Contains("Autorizacao", StringComparison.OrdinalIgnoreCase)) return "NFeAutorizacao4";
        if (operation.Contains("Consulta", StringComparison.OrdinalIgnoreCase)) return "NFeConsultaProtocolo4";
        if (operation.Contains("RecepcaoEvento", StringComparison.OrdinalIgnoreCase)) return "NFeRecepcaoEvento4";
        if (operation.Contains("Inutilizacao", StringComparison.OrdinalIgnoreCase)) return "NFeInutilizacao4";
        return "NFeStatusServico4";
    }

    private static string UfCode(string uf) => uf.ToUpperInvariant() switch
    {
        "AC" => "12",
        "AL" => "27",
        "AM" => "13",
        "AP" => "16",
        "BA" => "29",
        "CE" => "23",
        "DF" => "53",
        "ES" => "32",
        "GO" => "52",
        "MA" => "21",
        "MG" => "31",
        "MS" => "50",
        "MT" => "51",
        "PA" => "15",
        "PB" => "25",
        "PE" => "26",
        "PI" => "22",
        "PR" => "41",
        "RJ" => "33",
        "RN" => "24",
        "RO" => "11",
        "RR" => "14",
        "RS" => "43",
        "SC" => "42",
        "SE" => "28",
        "SP" => "35",
        "TO" => "17",
        _ => "35"
    };
}
