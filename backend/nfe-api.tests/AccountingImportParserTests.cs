using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class AccountingImportParserTests
{
    [Fact]
    public void Preview_accepts_valid_tax_csv()
    {
        var request = new ContHub.NfeApi.Models.AccountingImportPreviewRequest
        {
            OrganizationId = "11111111-1111-1111-1111-111111111111",
            FileName = "impostos.csv",
            FileFormat = "csv",
            RecordType = "tax",
            Content = """
                cnpj,competencia,tipo_imposto,valor,vencimento,status
                12.345.678/0001-90,05/2026,DAS,129.90,20/06/2026,Pendente
                """
        };

        var preview = AccountingImportParser.Preview(request);

        Assert.True(preview.Ok);
        Assert.Equal(1, preview.TotalRows);
        Assert.Equal(1, preview.ValidRows);
        Assert.Empty(preview.Errors);
        Assert.Equal("DAS", preview.Rows[0].Mapped["taxType"]);
    }

    [Fact]
    public void Preview_blocks_csv_formula_injection()
    {
        var request = new ContHub.NfeApi.Models.AccountingImportPreviewRequest
        {
            OrganizationId = "11111111-1111-1111-1111-111111111111",
            FileName = "impostos.csv",
            FileFormat = "csv",
            RecordType = "tax",
            Content = """
                cnpj,competencia,tipo_imposto,valor
                12.345.678/0001-90,05/2026,=cmd|calc!A0,10
                """
        };

        var preview = AccountingImportParser.Preview(request);

        Assert.False(preview.Ok);
        Assert.Contains(preview.Errors, error => error.Reason.Contains("formula", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Preview_rejects_xlsx_until_dedicated_reader_exists()
    {
        var request = new ContHub.NfeApi.Models.AccountingImportPreviewRequest
        {
            OrganizationId = "11111111-1111-1111-1111-111111111111",
            FileName = "impostos.xlsx",
            FileFormat = "xlsx",
            RecordType = "tax",
            Content = "arquivo-binario"
        };

        var error = Assert.Throws<InvalidOperationException>(() => AccountingImportParser.Preview(request));

        Assert.Contains("XLSX ainda nao e processado", error.Message);
    }
}
