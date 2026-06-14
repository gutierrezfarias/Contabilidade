using System.Net.Http.Headers;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SefazSoapClientService(
    NfeEndpointResolver endpointResolver,
    NfeReturnParserService parser,
    IConfiguration configuration)
{
    private readonly TimeSpan _timeout = TimeSpan.FromSeconds(
        int.TryParse(configuration["Nfe:SefazTimeoutSeconds"], out var seconds)
            ? Math.Clamp(seconds, 10, 180)
            : 60);

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

    public Task<SefazSoapResult> DistributeDfeAsync(
        string ambiente,
        string distDfeXml,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase)
            ? "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
            : "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

        return PostSoapAsync(
            endpoint,
            "NFeDistribuicaoDFe",
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse",
            "nfeDistDFeInteresse",
            distDfeXml,
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

    public async Task<SefazStatusResult> CheckStatusAsync(
        string uf,
        string ambiente,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var endpoint = endpointResolver.ResolveEndpoint(uf, ambiente, NfeServiceType.NfeStatusServico);
        var tpAmb = ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2";
        var xml = $"""
            <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
              <tpAmb>{tpAmb}</tpAmb>
              <cUF>{endpoint.CUf}</cUF>
              <xServ>STATUS</xServ>
            </consStatServ>
            """;
        var correlationId = Guid.NewGuid().ToString("N");

        try
        {
            var response = await PostSoapAsync(
                endpoint.Url,
                "NFeStatusServico4",
                "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF",
                "nfeStatusServicoNF",
                xml,
                certificate,
                cancellationToken);
            var document = XDocument.Parse(response.ResponseXml, LoadOptions.PreserveWhitespace);
            return new SefazStatusResult
            {
                Ambiente = ambiente,
                Authorizer = endpoint.Authorizer.ToString(),
                CorrelationId = correlationId,
                CUf = NfeReturnParserService.LastValue(document, "cUF"),
                CStat = response.CStat,
                DhRecbto = NfeReturnParserService.LastValue(document, "dhRecbto"),
                Endpoint = endpoint.Url,
                Online = response.CStat is "107",
                Status = response.CStat is "107" ? "online" : "instavel",
                TMed = NfeReturnParserService.LastValue(document, "tMed"),
                TpAmb = NfeReturnParserService.LastValue(document, "tpAmb"),
                Uf = endpoint.Uf,
                XMotivo = response.XMotivo
            };
        }
        catch (Exception error)
        {
            return new SefazStatusResult
            {
                Ambiente = ambiente,
                Authorizer = endpoint.Authorizer.ToString(),
                CorrelationId = correlationId,
                CUf = endpoint.CUf,
                Endpoint = endpoint.Url,
                Online = false,
                Status = "offline",
                Uf = endpoint.Uf,
                XMotivo = SanitizeTechnicalError(error)
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
        handler.ClientCertificateOptions = ClientCertificateOption.Manual;
        handler.SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
        handler.ClientCertificates.Add(certificate);

        using var client = new HttpClient(handler)
        {
            Timeout = _timeout
        };
        var response = await PostAsync(client, endpoint, action, operation, payloadXml, cancellationToken);
        return parser.Parse(response, endpoint, requestKind);
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
        request.Content = new StringContent(BuildEnvelope(operation, payloadXml), Encoding.UTF8);
        request.Content.Headers.ContentType =
            MediaTypeHeaderValue.Parse($"application/soap+xml; charset=utf-8; action=\"{action}\"");

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
            <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                             xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                             xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
              <soap12:Body>
                <{operation} xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/{WsdlName(operation)}">
                  <nfeDadosMsg>{payloadXml}</nfeDadosMsg>
                </{operation}>
              </soap12:Body>
            </soap12:Envelope>
            """;
    }

    private static string WsdlName(string operation)
    {
        if (operation.Contains("RetAutorizacao", StringComparison.OrdinalIgnoreCase)) return "NFeRetAutorizacao4";
        if (operation.Contains("Autorizacao", StringComparison.OrdinalIgnoreCase)) return "NFeAutorizacao4";
        if (operation.Contains("Consulta", StringComparison.OrdinalIgnoreCase)) return "NFeConsultaProtocolo4";
        if (operation.Contains("DistDFe", StringComparison.OrdinalIgnoreCase)) return "NFeDistribuicaoDFe";
        if (operation.Contains("RecepcaoEvento", StringComparison.OrdinalIgnoreCase)) return "NFeRecepcaoEvento4";
        if (operation.Contains("Inutilizacao", StringComparison.OrdinalIgnoreCase)) return "NFeInutilizacao4";
        return "NFeStatusServico4";
    }

    private static string SanitizeTechnicalError(Exception error)
    {
        var message = error.Message;
        return message.Length > 500 ? $"{message[..500]}..." : message;
    }
}
