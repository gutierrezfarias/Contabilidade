namespace ContHub.NfeApi.Services;

public sealed class NfeEndpointResolver
{
    private static readonly Dictionary<string, NfeEndpoints> Svrs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["homologacao"] = new(
            Authorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            RetAuthorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
            Query: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Status: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Event: "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
            Inutilization: "https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx"
        ),
        ["producao"] = new(
            Authorization: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            RetAuthorization: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
            Query: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Status: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Event: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
            Inutilization: "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx"
        )
    };

    private static readonly Dictionary<string, Dictionary<string, NfeEndpoints>> Endpoints = new(StringComparer.OrdinalIgnoreCase)
    {
        ["SP"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["homologacao"] = new(
                Authorization: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
                RetAuthorization: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
                Query: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
                Status: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
                Event: "https://homologacao.nfe.fazenda.sp.gov.br/ws/recepcaoevento4.asmx",
                Inutilization: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx"
            ),
            ["producao"] = new(
                Authorization: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
                RetAuthorization: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
                Query: "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
                Status: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
                Event: "https://nfe.fazenda.sp.gov.br/ws/recepcaoevento4.asmx",
                Inutilization: "https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx"
            )
        },
        ["MG"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["homologacao"] = new(
                Authorization: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
                RetAuthorization: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
                Query: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
                Status: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
                Event: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
                Inutilization: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4"
            ),
            ["producao"] = new(
                Authorization: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
                RetAuthorization: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
                Query: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
                Status: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
                Event: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
                Inutilization: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4"
            )
        }
    };

    public string Authorization(string uf, string ambiente) => Resolve(uf, ambiente).Authorization;
    public string RetAuthorization(string uf, string ambiente) => Resolve(uf, ambiente).RetAuthorization;
    public string Query(string uf, string ambiente) => Resolve(uf, ambiente).Query;
    public string Status(string uf, string ambiente) => Resolve(uf, ambiente).Status;
    public string Event(string uf, string ambiente) => Resolve(uf, ambiente).Event;
    public string Inutilization(string uf, string ambiente) => Resolve(uf, ambiente).Inutilization;

    private static NfeEndpoints Resolve(string uf, string ambiente)
    {
        var normalizedEnvironment = string.Equals(ambiente, "producao", StringComparison.OrdinalIgnoreCase)
            ? "producao"
            : "homologacao";

        if (Endpoints.TryGetValue(uf, out var byEnvironment)
            && byEnvironment.TryGetValue(normalizedEnvironment, out var endpoint))
        {
            return endpoint;
        }

        return Svrs[normalizedEnvironment];
    }
}

public sealed record NfeEndpoints(
    string Authorization,
    string RetAuthorization,
    string Query,
    string Status,
    string Event,
    string Inutilization);
