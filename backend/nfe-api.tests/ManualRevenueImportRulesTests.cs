using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class ManualRevenueImportRulesTests
{
    [Theory]
    [InlineData("cnd.pdf")]
    [InlineData("darf.xml")]
    [InlineData("situacao.json")]
    [InlineData("lote.csv")]
    [InlineData("ecac.zip")]
    public void IsAllowedExtension_accepts_initial_formats(string fileName)
    {
        Assert.True(ManualRevenueImportRules.IsAllowedExtension(fileName));
    }

    [Theory]
    [InlineData("virus.exe")]
    [InlineData("script.ps1")]
    [InlineData("macro.js")]
    public void IsAllowedExtension_blocks_dangerous_files(string fileName)
    {
        Assert.False(ManualRevenueImportRules.IsAllowedExtension(fileName));
    }

    [Theory]
    [InlineData("../documento.pdf")]
    [InlineData("..\\documento.pdf")]
    [InlineData("C:\\temp\\documento.pdf")]
    public void HasPathTraversal_blocks_zip_slip_paths(string path)
    {
        Assert.True(ManualRevenueImportRules.HasPathTraversal(path));
    }

    [Fact]
    public void Sha256_detects_duplicate_content()
    {
        var first = ManualRevenueImportRules.Sha256("conteudo"u8.ToArray());
        var second = ManualRevenueImportRules.Sha256("conteudo"u8.ToArray());

        Assert.Equal(first, second);
    }

    [Theory]
    [InlineData("=IMPORTXML(\"http://malicioso\")")]
    [InlineData("+cmd")]
    [InlineData("@SUM(1,1)")]
    public void IsCsvFormula_flags_csv_injection(string value)
    {
        Assert.True(ManualRevenueImportRules.IsCsvFormula(value));
    }

    [Fact]
    public void Manual_access_mode_is_distinct_from_serpro_billing_modes()
    {
        var settings = new SerproOrganizationSettingsDto(
            "org-1",
            "cont_hub_managed",
            "manual_free",
            "homologacao",
            "active",
            true,
            false,
            false,
            0,
            0,
            "",
            "");

        Assert.Equal("manual_free", settings.AccessMode);
        Assert.Equal("cont_hub_managed", settings.BillingMode);
    }
}
