using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class NfeEndpointResolverTests
{
    private static readonly string[] AllUfs =
    [
        "RO", "AC", "AM", "RR", "PA", "AP", "TO",
        "MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA",
        "MG", "ES", "RJ", "SP", "PR", "SC", "RS", "MS", "MT", "GO", "DF"
    ];

    [Theory]
    [MemberData(nameof(Ufs))]
    public void Resolve_status_for_all_ufs_in_both_environments(string uf)
    {
        var resolver = new NfeEndpointResolver();

        var homologation = resolver.ResolveEndpoint(uf, "homologacao", NfeServiceType.NfeStatusServico);
        var production = resolver.ResolveEndpoint(uf, "producao", NfeServiceType.NfeStatusServico);

        Assert.Equal(uf, homologation.Uf);
        Assert.Equal(uf, production.Uf);
        Assert.Equal(NfeEnvironment.Homologacao, homologation.Environment);
        Assert.Equal(NfeEnvironment.Producao, production.Environment);
        Assert.StartsWith("https://", homologation.Url, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("https://", production.Url, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("MA", NfeAuthorizer.SVAN)]
    [InlineData("PB", NfeAuthorizer.SVRS)]
    [InlineData("SP", NfeAuthorizer.SP)]
    [InlineData("MG", NfeAuthorizer.MG)]
    [InlineData("AM", NfeAuthorizer.AM)]
    [InlineData("RS", NfeAuthorizer.RS)]
    public void Resolve_expected_authorizer(string uf, NfeAuthorizer authorizer)
    {
        var resolver = new NfeEndpointResolver();
        var endpoint = resolver.ResolveEndpoint(uf, "homologacao", NfeServiceType.NfeAutorizacao);

        Assert.Equal(authorizer, endpoint.Authorizer);
    }

    [Fact]
    public void Resolve_uf_by_cuf_code()
    {
        var resolver = new NfeEndpointResolver();
        var endpoint = resolver.ResolveEndpoint("25", "homologacao", NfeServiceType.NfeStatusServico);

        Assert.Equal("PB", endpoint.Uf);
        Assert.Equal("25", endpoint.CUf);
    }

    [Fact]
    public void Resolve_contingency_only_when_explicit()
    {
        var resolver = new NfeEndpointResolver();

        var normal = resolver.ResolveEndpoint("PB", "homologacao", NfeServiceType.NfeAutorizacao);
        var contingency = resolver.ResolveEndpoint("PB", "homologacao", NfeServiceType.NfeAutorizacao, NfeAuthorizer.SvcAn);

        Assert.Equal(NfeAuthorizer.SVRS, normal.Authorizer);
        Assert.Equal(NfeAuthorizer.SvcAn, contingency.Authorizer);
        Assert.True(contingency.IsContingency);
    }

    [Fact]
    public void Consulta_cadastro_has_own_routing()
    {
        var resolver = new NfeEndpointResolver();

        var sp = resolver.ResolveEndpoint("SP", "producao", NfeServiceType.ConsultaCadastro);
        var pb = resolver.ResolveEndpoint("PB", "producao", NfeServiceType.ConsultaCadastro);

        Assert.Equal(NfeAuthorizer.SP, sp.Authorizer);
        Assert.Equal(NfeAuthorizer.SVRS, pb.Authorizer);
    }

    [Fact]
    public void Consulta_cadastro_unavailable_throws_clear_error()
    {
        var resolver = new NfeEndpointResolver();

        var error = Assert.Throws<InvalidOperationException>(
            () => resolver.ResolveEndpoint("AL", "producao", NfeServiceType.ConsultaCadastro));

        Assert.Contains("ConsultaCadastro", error.Message);
    }

    public static IEnumerable<object[]> Ufs() => AllUfs.Select(uf => new object[] { uf });
}
