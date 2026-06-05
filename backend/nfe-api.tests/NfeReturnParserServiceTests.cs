using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class NfeReturnParserServiceTests
{
    [Fact]
    public void Parse_authorized_response()
    {
        var parser = new NfeReturnParserService();
        var xml = """
            <soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
              <soap12:Body>
                <nfeResultMsg>
                  <retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
                    <tpAmb>2</tpAmb>
                    <cStat>100</cStat>
                    <xMotivo>Autorizado o uso da NF-e</xMotivo>
                    <protNFe>
                      <infProt>
                        <chNFe>25260612345678000190550010000000011000000010</chNFe>
                        <nProt>325000000000000</nProt>
                      </infProt>
                    </protNFe>
                  </retConsSitNFe>
                </nfeResultMsg>
              </soap12:Body>
            </soap12:Envelope>
            """;

        var result = parser.Parse(xml, "https://endpoint", "consulta");

        Assert.True(result.Success);
        Assert.Equal("100", result.CStat);
        Assert.Equal("Autorizado o uso da NF-e", result.XMotivo);
        Assert.Equal("325000000000000", result.ProtocolNumber);
    }

    [Fact]
    public void Parse_rejected_response()
    {
        var parser = new NfeReturnParserService();
        var xml = """
            <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
              <cStat>215</cStat>
              <xMotivo>Falha no schema XML</xMotivo>
            </retEnviNFe>
            """;

        var result = parser.Parse(xml, "https://endpoint", "autorizacao");

        Assert.False(result.Success);
        Assert.Equal("215", result.CStat);
        Assert.Equal("Falha no schema XML", result.XMotivo);
    }
}
