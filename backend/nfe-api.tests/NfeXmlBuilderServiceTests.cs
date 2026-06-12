using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class NfeXmlBuilderServiceTests
{
    [Fact]
    public void Validate_blocks_iss_service_in_nfe_model_55()
    {
        var builder = CreateBuilder();
        var errors = builder.ValidateForEmission(Company(), Certificate(), Note() with
        {
            Itens =
            [
                Item() with
                {
                    Cfop = "5933",
                    Ncm = "00000000"
                }
            ]
        });

        Assert.Contains(errors, item => item.Contains("NFS-e", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Build_generates_nfe_model_55_xml()
    {
        var builder = CreateBuilder();
        var result = builder.Build(Company(), Certificate(), Note());

        Assert.Contains("<mod>55</mod>", result.Xml);
        Assert.Contains("<NFe", result.Xml);
        Assert.Equal("1", result.Series);
        Assert.Equal("123", result.Number);
        Assert.True(result.AccessKey.Length == 44);
    }

    private static NfeXmlBuilderService CreateBuilder()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Nfe:AppVersion"] = "TEST-1.0"
            })
            .Build();

        return new NfeXmlBuilderService(configuration);
    }

    private static SupabaseCompany Company() => new()
    {
        Address = "Rua Teste",
        AddressNumber = "10",
        Cep = "58000000",
        City = "Joao Pessoa",
        CityIbgeCode = "2507507",
        Cnpj = "12345678000190",
        CompanyName = "Empresa Teste LTDA",
        Neighborhood = "Centro",
        OrganizationId = Guid.NewGuid().ToString(),
        Phone = "83999999999",
        State = "PB",
        StateRegistration = "160000000",
        TaxRegime = "Lucro Presumido"
    };

    private static SupabaseCertificate Certificate() => new()
    {
        Environment = "homologacao",
        StateUf = "PB",
        Status = "Ativo"
    };

    private static NfePayload Note() => new()
    {
        DataEmissao = "2026-06-01",
        Destinatario = new NfeParty
        {
            Bairro = "Centro",
            Cep = "58000000",
            CodigoMunicipioIbge = "2507507",
            Documento = "11111111000191",
            IndicadorIe = "9",
            Logradouro = "Rua Cliente",
            Municipio = "Joao Pessoa",
            Nome = "Cliente Teste LTDA",
            Numero = "20",
            Uf = "PB"
        },
        IndicadorPresenca = "0",
        Itens = [Item()],
        NaturezaOperacao = "Venda",
        Numero = "123",
        Pagamentos =
        [
            new NfePayment
            {
                TipoPagamento = "90",
                Valor = 100
            }
        ],
        Serie = "1",
        TipoOperacao = "saida"
    };

    private static NfeItem Item() => new()
    {
        AliquotaCofins = 0,
        AliquotaIcms = 18,
        AliquotaPis = 0,
        Cfop = "5102",
        Codigo = "1",
        CstCofins = "99",
        CstIcms = "00",
        CstPis = "99",
        Descricao = "Produto teste",
        Ncm = "84713012",
        OrigemIcms = "0",
        Quantidade = 1,
        Unidade = "UN",
        ValorTotal = 100,
        ValorUnitario = 100
    };
}
