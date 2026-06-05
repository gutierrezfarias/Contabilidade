using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NfeEndpointResolver
{
    private static readonly IReadOnlyDictionary<string, string> UfCodes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["RO"] = "11",
        ["AC"] = "12",
        ["AM"] = "13",
        ["RR"] = "14",
        ["PA"] = "15",
        ["AP"] = "16",
        ["TO"] = "17",
        ["MA"] = "21",
        ["PI"] = "22",
        ["CE"] = "23",
        ["RN"] = "24",
        ["PB"] = "25",
        ["PE"] = "26",
        ["AL"] = "27",
        ["SE"] = "28",
        ["BA"] = "29",
        ["MG"] = "31",
        ["ES"] = "32",
        ["RJ"] = "33",
        ["SP"] = "35",
        ["PR"] = "41",
        ["SC"] = "42",
        ["RS"] = "43",
        ["MS"] = "50",
        ["MT"] = "51",
        ["GO"] = "52",
        ["DF"] = "53"
    };

    private static readonly IReadOnlyDictionary<string, NfeAuthorizer> NormalAuthorizers = new Dictionary<string, NfeAuthorizer>(StringComparer.OrdinalIgnoreCase)
    {
        ["AC"] = NfeAuthorizer.SVRS,
        ["AL"] = NfeAuthorizer.SVRS,
        ["AP"] = NfeAuthorizer.SVRS,
        ["CE"] = NfeAuthorizer.SVRS,
        ["DF"] = NfeAuthorizer.SVRS,
        ["ES"] = NfeAuthorizer.SVRS,
        ["PA"] = NfeAuthorizer.SVRS,
        ["PB"] = NfeAuthorizer.SVRS,
        ["PI"] = NfeAuthorizer.SVRS,
        ["RJ"] = NfeAuthorizer.SVRS,
        ["RN"] = NfeAuthorizer.SVRS,
        ["RO"] = NfeAuthorizer.SVRS,
        ["RR"] = NfeAuthorizer.SVRS,
        ["SC"] = NfeAuthorizer.SVRS,
        ["SE"] = NfeAuthorizer.SVRS,
        ["TO"] = NfeAuthorizer.SVRS,
        ["MA"] = NfeAuthorizer.SVAN,
        ["AM"] = NfeAuthorizer.AM,
        ["BA"] = NfeAuthorizer.BA,
        ["GO"] = NfeAuthorizer.GO,
        ["MG"] = NfeAuthorizer.MG,
        ["MS"] = NfeAuthorizer.MS,
        ["MT"] = NfeAuthorizer.MT,
        ["PE"] = NfeAuthorizer.PE,
        ["PR"] = NfeAuthorizer.PR,
        ["RS"] = NfeAuthorizer.RS,
        ["SP"] = NfeAuthorizer.SP
    };

    private static readonly IReadOnlyDictionary<string, NfeAuthorizer> ConsultaCadastroAuthorizers = new Dictionary<string, NfeAuthorizer>(StringComparer.OrdinalIgnoreCase)
    {
        ["AC"] = NfeAuthorizer.SVRS,
        ["AM"] = NfeAuthorizer.AM,
        ["BA"] = NfeAuthorizer.BA,
        ["ES"] = NfeAuthorizer.SVRS,
        ["GO"] = NfeAuthorizer.GO,
        ["MG"] = NfeAuthorizer.MG,
        ["MS"] = NfeAuthorizer.MS,
        ["MT"] = NfeAuthorizer.MT,
        ["PB"] = NfeAuthorizer.SVRS,
        ["PE"] = NfeAuthorizer.PE,
        ["PR"] = NfeAuthorizer.PR,
        ["RN"] = NfeAuthorizer.SVRS,
        ["RS"] = NfeAuthorizer.RS,
        ["SC"] = NfeAuthorizer.SVRS,
        ["SP"] = NfeAuthorizer.SP
    };

    private static readonly IReadOnlyDictionary<NfeAuthorizer, IReadOnlyDictionary<NfeEnvironment, ServiceUrls>> Endpoints =
        new Dictionary<NfeAuthorizer, IReadOnlyDictionary<NfeEnvironment, ServiceUrls>>
        {
            [NfeAuthorizer.SVRS] = Pair(
                hom: new(
                    Authorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    RetAuthorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    Query: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
                    Status: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
                    Event: "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
                    Inutilization: "https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
                    ConsultaCadastro: "https://cad-homologacao.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx"),
                prod: new(
                    Authorization: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    RetAuthorization: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    Query: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
                    Status: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
                    Event: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
                    Inutilization: "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
                    ConsultaCadastro: "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx")),
            [NfeAuthorizer.SVAN] = Pair(
                hom: Svan("https://hom.sefazvirtual.fazenda.gov.br"),
                prod: Svan("https://www.sefazvirtual.fazenda.gov.br")),
            [NfeAuthorizer.SvcAn] = Pair(
                hom: Svan("https://hom.svc.fazenda.gov.br"),
                prod: Svan("https://www.svc.fazenda.gov.br"),
                isContingency: true),
            [NfeAuthorizer.SvcRs] = Pair(
                hom: new(
                    Authorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    RetAuthorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    Query: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
                    Status: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
                    Event: null,
                    Inutilization: null,
                    ConsultaCadastro: null),
                prod: new(
                    Authorization: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    RetAuthorization: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    Query: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
                    Status: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
                    Event: null,
                    Inutilization: null,
                    ConsultaCadastro: null),
                isContingency: true),
            [NfeAuthorizer.AM] = Pair(
                hom: BaseServices("https://homnfe.sefaz.am.gov.br/services2/services", consultaCadastroName: "CadConsultaCadastro4"),
                prod: BaseServices("https://nfe.sefaz.am.gov.br/services2/services", consultaCadastroName: "CadConsultaCadastro4")),
            [NfeAuthorizer.BA] = Pair(
                hom: WebServices("https://hnfe.sefaz.ba.gov.br/webservices"),
                prod: WebServices("https://nfe.sefaz.ba.gov.br/webservices")),
            [NfeAuthorizer.GO] = Pair(
                hom: BaseServices("https://nfehomolog.sefaz.go.gov.br/nfe/services", consultaCadastroName: "CadConsultaCadastro4"),
                prod: BaseServices("https://nfe.sefaz.go.gov.br/nfe/services", consultaCadastroName: "CadConsultaCadastro4")),
            [NfeAuthorizer.MG] = Pair(
                hom: BaseServices("https://hnfe.fazenda.mg.gov.br/nfe2/services", consultaCadastroName: "NFeConsultaCadastro4"),
                prod: BaseServices("https://nfe.fazenda.mg.gov.br/nfe2/services", consultaCadastroName: "NFeConsultaCadastro4")),
            [NfeAuthorizer.MS] = Pair(
                hom: BaseServices("https://hom.nfe.sefaz.ms.gov.br/ws", consultaCadastroName: "NFeConsultaCadastro4"),
                prod: BaseServices("https://nfe.sefaz.ms.gov.br/ws", consultaCadastroName: "NFeConsultaCadastro4")),
            [NfeAuthorizer.MT] = Pair(
                hom: Mt("https://homologacao.sefaz.mt.gov.br/nfews/v2/services"),
                prod: Mt("https://nfe.sefaz.mt.gov.br/nfews/v2/services")),
            [NfeAuthorizer.PE] = Pair(
                hom: BaseServices("https://nfehomolog.sefaz.pe.gov.br/nfe-service/services", consultaCadastroName: "NFeConsultaCadastro4"),
                prod: BaseServices("https://nfe.sefaz.pe.gov.br/nfe-service/services", consultaCadastroName: "NFeConsultaCadastro4")),
            [NfeAuthorizer.PR] = Pair(
                hom: BaseServices("https://homologacao.nfe.sefa.pr.gov.br/nfe", consultaCadastroName: "NFeConsultaCadastro4"),
                prod: BaseServices("https://nfe.sefa.pr.gov.br/nfe", consultaCadastroName: "NFeConsultaCadastro4")),
            [NfeAuthorizer.RS] = Pair(
                hom: Rs("https://nfe-homologacao.sefazrs.rs.gov.br/ws"),
                prod: Rs("https://nfe.sefazrs.rs.gov.br/ws")),
            [NfeAuthorizer.SP] = Pair(
                hom: Sp("https://homologacao.nfe.fazenda.sp.gov.br/ws"),
                prod: Sp("https://nfe.fazenda.sp.gov.br/ws"))
        };

    public string Authorization(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.NfeAutorizacao).Url;

    public string RetAuthorization(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.NfeRetAutorizacao).Url;

    public string Query(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.NfeConsultaProtocolo).Url;

    public string Status(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.NfeStatusServico).Url;

    public string Event(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.RecepcaoEvento).Url;

    public string Inutilization(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.NfeInutilizacao).Url;

    public string ConsultaCadastro(string uf, string ambiente) =>
        ResolveEndpoint(uf, ambiente, NfeServiceType.ConsultaCadastro).Url;

    public NfeEndpointInfo ResolveEndpoint(
        string ufOrCode,
        string environment,
        NfeServiceType serviceType,
        NfeAuthorizer? explicitContingency = null)
    {
        var uf = NormalizeUf(ufOrCode);
        var env = ParseEnvironment(environment);
        var authorizer = explicitContingency ?? ResolveAuthorizer(uf, serviceType);
        var urls = Endpoints.TryGetValue(authorizer, out var byEnvironment)
            && byEnvironment.TryGetValue(env, out var serviceUrls)
            ? serviceUrls
            : throw new InvalidOperationException($"Autorizador {authorizer} sem endpoints para {env}.");
        var url = urls.UrlFor(serviceType);

        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException(
                $"Servico {serviceType} nao disponivel para UF {uf} no autorizador {authorizer}. Verifique a tabela oficial de Web Services da NF-e.");
        }

        return new NfeEndpointInfo
        {
            Authorizer = authorizer,
            CUf = UfCodes[uf],
            Environment = env,
            IsContingency = explicitContingency is NfeAuthorizer.SvcAn or NfeAuthorizer.SvcRs,
            ServiceType = serviceType,
            Uf = uf,
            Url = url
        };
    }

    public static string NormalizeUf(string ufOrCode)
    {
        var value = ufOrCode.Trim().ToUpperInvariant();
        if (UfCodes.ContainsKey(value)) return value;

        var byCode = UfCodes.FirstOrDefault(item => item.Value == value);
        if (!string.IsNullOrWhiteSpace(byCode.Key)) return byCode.Key;

        throw new InvalidOperationException($"UF/cUF invalido para NF-e: {ufOrCode}.");
    }

    public static string CodeForUf(string ufOrCode) => UfCodes[NormalizeUf(ufOrCode)];

    public static NfeEnvironment ParseEnvironment(string environment)
    {
        return environment.Equals("producao", StringComparison.OrdinalIgnoreCase)
            || environment.Equals("produção", StringComparison.OrdinalIgnoreCase)
            || environment == "1"
            ? NfeEnvironment.Producao
            : NfeEnvironment.Homologacao;
    }

    private static NfeAuthorizer ResolveAuthorizer(string uf, NfeServiceType serviceType)
    {
        if (serviceType == NfeServiceType.ConsultaCadastro)
        {
            return ConsultaCadastroAuthorizers.TryGetValue(uf, out var cadastroAuthorizer)
                ? cadastroAuthorizer
                : throw new InvalidOperationException($"ConsultaCadastro nao esta disponivel para UF {uf} na tabela oficial.");
        }

        return NormalAuthorizers[uf];
    }

    private static IReadOnlyDictionary<NfeEnvironment, ServiceUrls> Pair(
        ServiceUrls hom,
        ServiceUrls prod,
        bool isContingency = false)
    {
        return new Dictionary<NfeEnvironment, ServiceUrls>
        {
            [NfeEnvironment.Homologacao] = hom with { IsContingency = isContingency },
            [NfeEnvironment.Producao] = prod with { IsContingency = isContingency }
        };
    }

    private static ServiceUrls Svan(string baseUrl)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/NFeAutorizacao4/NFeAutorizacao4.asmx",
            RetAuthorization: $"{baseUrl}/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
            Query: $"{baseUrl}/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
            Status: $"{baseUrl}/NFeStatusServico4/NFeStatusServico4.asmx",
            Event: $"{baseUrl}/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
            Inutilization: $"{baseUrl}/NFeInutilizacao4/NFeInutilizacao4.asmx",
            ConsultaCadastro: null);
    }

    private static ServiceUrls WebServices(string baseUrl)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/NFeAutorizacao4/NFeAutorizacao4.asmx",
            RetAuthorization: $"{baseUrl}/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
            Query: $"{baseUrl}/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
            Status: $"{baseUrl}/NFeStatusServico4/NFeStatusServico4.asmx",
            Event: $"{baseUrl}/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
            Inutilization: $"{baseUrl}/NFeInutilizacao4/NFeInutilizacao4.asmx",
            ConsultaCadastro: $"{baseUrl}/CadConsultaCadastro4/CadConsultaCadastro4.asmx");
    }

    private static ServiceUrls BaseServices(string baseUrl, string consultaCadastroName)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/NFeAutorizacao4",
            RetAuthorization: $"{baseUrl}/NFeRetAutorizacao4",
            Query: $"{baseUrl}/NFeConsultaProtocolo4",
            Status: $"{baseUrl}/NFeStatusServico4",
            Event: $"{baseUrl}/NFeRecepcaoEvento4",
            Inutilization: $"{baseUrl}/NFeInutilizacao4",
            ConsultaCadastro: $"{baseUrl}/{consultaCadastroName}");
    }

    private static ServiceUrls Mt(string baseUrl)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/NfeAutorizacao4",
            RetAuthorization: $"{baseUrl}/NfeRetAutorizacao4",
            Query: $"{baseUrl}/NfeConsulta4",
            Status: $"{baseUrl}/NfeStatusServico4",
            Event: $"{baseUrl}/RecepcaoEvento4",
            Inutilization: $"{baseUrl}/NfeInutilizacao4",
            ConsultaCadastro: $"{baseUrl}/CadConsultaCadastro4");
    }

    private static ServiceUrls Rs(string baseUrl)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/NfeAutorizacao/NFeAutorizacao4.asmx",
            RetAuthorization: $"{baseUrl}/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
            Query: $"{baseUrl}/NfeConsulta/NfeConsulta4.asmx",
            Status: $"{baseUrl}/NfeStatusServico/NfeStatusServico4.asmx",
            Event: $"{baseUrl}/recepcaoevento/recepcaoevento4.asmx",
            Inutilization: $"{baseUrl}/nfeinutilizacao/nfeinutilizacao4.asmx",
            ConsultaCadastro: $"{baseUrl}/cadconsultacadastro/cadconsultacadastro4.asmx");
    }

    private static ServiceUrls Sp(string baseUrl)
    {
        return new ServiceUrls(
            Authorization: $"{baseUrl}/nfeautorizacao4.asmx",
            RetAuthorization: $"{baseUrl}/nferetautorizacao4.asmx",
            Query: $"{baseUrl}/nfeconsultaprotocolo4.asmx",
            Status: $"{baseUrl}/nfestatusservico4.asmx",
            Event: $"{baseUrl}/nferecepcaoevento4.asmx",
            Inutilization: $"{baseUrl}/nfeinutilizacao4.asmx",
            ConsultaCadastro: $"{baseUrl}/cadconsultacadastro4.asmx");
    }
}

internal sealed record ServiceUrls(
    string? Authorization,
    string? RetAuthorization,
    string? Query,
    string? Status,
    string? Event,
    string? Inutilization,
    string? ConsultaCadastro)
{
    public bool IsContingency { get; init; }

    public string? UrlFor(NfeServiceType serviceType) => serviceType switch
    {
        NfeServiceType.NfeAutorizacao => Authorization,
        NfeServiceType.NfeRetAutorizacao => RetAuthorization,
        NfeServiceType.NfeConsultaProtocolo => Query,
        NfeServiceType.NfeStatusServico => Status,
        NfeServiceType.RecepcaoEvento => Event,
        NfeServiceType.NfeInutilizacao => Inutilization,
        NfeServiceType.ConsultaCadastro => ConsultaCadastro,
        _ => null
    };
}
