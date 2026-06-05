using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ContHub.NfeApi.Models;

public enum NfeEnvironment
{
    Homologacao,
    Producao
}

public enum NfeServiceType
{
    NfeStatusServico,
    NfeAutorizacao,
    NfeRetAutorizacao,
    NfeConsultaProtocolo,
    NfeInutilizacao,
    RecepcaoEvento,
    ConsultaCadastro
}

public enum NfeAuthorizer
{
    AM,
    BA,
    GO,
    MG,
    MS,
    MT,
    PE,
    PR,
    RS,
    SP,
    SVAN,
    SVRS,
    SvcAn,
    SvcRs,
    AN
}

public sealed record NfeEndpointInfo
{
    public required NfeAuthorizer Authorizer { get; init; }
    public required NfeEnvironment Environment { get; init; }
    public required NfeServiceType ServiceType { get; init; }
    public required string Uf { get; init; }
    public required string CUf { get; init; }
    public required string Url { get; init; }
    public bool IsContingency { get; init; }
}

public sealed record EmitirNfeRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string? DocumentId { get; init; }
    public NfePayload Nota { get; init; } = new();
}

public sealed record AssinarXmlRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string DocumentId { get; init; } = "";
}

public sealed record ConsultarRetornoRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string ReceiptNumber { get; init; } = "";
    public string Ambiente { get; init; } = "homologacao";
    public string Uf { get; init; } = "";
}

public sealed record ConsultarChaveRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string AccessKey { get; init; } = "";
}

public sealed record CancelarNfeRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string DocumentId { get; init; } = "";
    public string Justification { get; init; } = "";
}

public sealed record InutilizarNfeRequest
{
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string Uf { get; init; } = "";
    public string Ambiente { get; init; } = "homologacao";
    public string Serie { get; init; } = "";
    public int NumeroInicial { get; init; }
    public int NumeroFinal { get; init; }
    public string Justification { get; init; } = "";
}

public sealed record NfePayload
{
    public string NaturezaOperacao { get; init; } = "";
    public string Serie { get; init; } = "1";
    public string Numero { get; init; } = "";
    public string TipoOperacao { get; init; } = "saida";
    public string Finalidade { get; init; } = "normal";
    public string IndicadorPresenca { get; init; } = "0";
    public string InformacoesAdicionais { get; init; } = "";
    public NfeParty Destinatario { get; init; } = new();
    public List<NfeItem> Itens { get; init; } = [];
    public NfePayment Pagamento { get; init; } = new();
}

public sealed record NfeParty
{
    public string Nome { get; init; } = "";
    public string Documento { get; init; } = "";
    public string InscricaoEstadual { get; init; } = "";
    public string IndicadorIe { get; init; } = "9";
    public string Email { get; init; } = "";
    public string Telefone { get; init; } = "";
    public string Cep { get; init; } = "";
    public string Logradouro { get; init; } = "";
    public string Numero { get; init; } = "";
    public string Complemento { get; init; } = "";
    public string Bairro { get; init; } = "";
    public string CodigoMunicipioIbge { get; init; } = "";
    public string Municipio { get; init; } = "";
    public string Uf { get; init; } = "";
    public string CodigoPais { get; init; } = "1058";
    public string Pais { get; init; } = "BRASIL";
}

public sealed record NfeItem
{
    public string Codigo { get; init; } = "";
    public string Descricao { get; init; } = "";
    public string Ncm { get; init; } = "";
    public string Cfop { get; init; } = "";
    public string Unidade { get; init; } = "UN";
    public decimal Quantidade { get; init; }
    public decimal ValorUnitario { get; init; }
    public decimal ValorTotal { get; init; }
    public string OrigemIcms { get; init; } = "0";
    public string CstIcms { get; init; } = "";
    public string Csosn { get; init; } = "";
    public decimal AliquotaIcms { get; init; }
    public string CstPis { get; init; } = "99";
    public decimal AliquotaPis { get; init; }
    public string CstCofins { get; init; } = "99";
    public decimal AliquotaCofins { get; init; }
}

public sealed record NfePayment
{
    public string TipoPagamento { get; init; } = "90";
    public decimal Valor { get; init; }
}

public sealed record SupabaseCompany
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string CompanyName { get; init; } = "";
    public string Cnpj { get; init; } = "";
    public string StateRegistration { get; init; } = "";
    public string MunicipalRegistration { get; init; } = "";
    public string Cep { get; init; } = "";
    public string Address { get; init; } = "";
    public string AddressNumber { get; init; } = "";
    public string Complement { get; init; } = "";
    public string Neighborhood { get; init; } = "";
    public string City { get; init; } = "";
    public string State { get; init; } = "";
    public string CityIbgeCode { get; init; } = "";
    public string Phone { get; init; } = "";
    public string TaxRegime { get; init; } = "";
}

public sealed record SupabaseCertificate
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string HolderName { get; init; } = "";
    public string TaxId { get; init; } = "";
    public string Environment { get; init; } = "homologacao";
    public string StateUf { get; init; } = "";
    public string CertificatePassword { get; init; } = "";
    public string CertificateFileName { get; init; } = "";
    public string CertificateFileData { get; init; } = "";
    public string Status { get; init; } = "";
    public string ValidUntil { get; init; } = "";
}

public sealed record NfeBuildResult
{
    public string AccessKey { get; init; } = "";
    public string Xml { get; init; } = "";
    public decimal TotalAmount { get; init; }
    public string Number { get; init; } = "";
    public string Series { get; init; } = "";
}

public sealed record NfeSignedXml
{
    public string AccessKey { get; init; } = "";
    public string SignedXml { get; init; } = "";
}

public sealed record SupabaseNfeDocument
{
    public string Id { get; init; } = "";
    public string OrganizationId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string CertificateId { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string GeneratedXml { get; init; } = "";
    public string SignedXml { get; init; } = "";
    public string AuthorizedXml { get; init; } = "";
    public string ReceiptNumber { get; init; } = "";
    public string Status { get; init; } = "";
}

public sealed record SefazSoapResult
{
    public bool Success { get; init; }
    public string Endpoint { get; init; } = "";
    public string RequestKind { get; init; } = "";
    public string ResponseXml { get; init; } = "";
    public string CStat { get; init; } = "";
    public string XMotivo { get; init; } = "";
    public string ReceiptNumber { get; init; } = "";
    public string ProtocolNumber { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string Error { get; init; } = "";
}

public sealed record NfeOperationResult
{
    public bool Success { get; init; }
    public string Mode { get; init; } = "real";
    public string Status { get; init; } = "";
    public string Message { get; init; } = "";
    public string CStat { get; init; } = "";
    public string XMotivo { get; init; } = "";
    public string AccessKey { get; init; } = "";
    public string ReceiptNumber { get; init; } = "";
    public string ProtocolNumber { get; init; } = "";
    public string DocumentId { get; init; } = "";
    public string DanfePdfBase64 { get; init; } = "";
    public List<string> Errors { get; init; } = [];
}

public sealed record SefazStatusResult
{
    public bool Online { get; init; }
    public string Status { get; init; } = "";
    public string CStat { get; init; } = "";
    public string XMotivo { get; init; } = "";
    public string Uf { get; init; } = "";
    public string Ambiente { get; init; } = "";
    public string Endpoint { get; init; } = "";
    public string CUf { get; init; } = "";
    public string TpAmb { get; init; } = "";
    public string DhRecbto { get; init; } = "";
    public string TMed { get; init; } = "";
    public string Authorizer { get; init; } = "";
    public string CorrelationId { get; init; } = "";
}

public static class NfeText
{
    public static string Digits(string value) => new(value.Where(char.IsDigit).ToArray());

    public static string Decimal(decimal value, int digits = 2) =>
        value.ToString($"0.{new string('0', digits)}", CultureInfo.InvariantCulture);

    public static string Json(object value) => JsonSerializer.Serialize(value, JsonOptions);

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}
