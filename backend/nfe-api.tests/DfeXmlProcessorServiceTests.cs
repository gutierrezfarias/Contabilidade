using System.IO.Compression;
using System.Text;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class DfeXmlProcessorServiceTests
{
    [Fact]
    public void BuildDistNsuXml_uses_official_distDFeInt_shape()
    {
        var service = new DfeXmlProcessorService();
        var xml = service.BuildDistNsuXml("48.013.461/0001-25", "PB", "homologacao", "12");

        Assert.Contains("distDFeInt", xml);
        Assert.Contains("versao=\"1.01\"", xml);
        Assert.Contains("<tpAmb>2</tpAmb>", xml);
        Assert.Contains("<cUFAutor>25</cUFAutor>", xml);
        Assert.Contains("<CNPJ>48013461000125</CNPJ>", xml);
        Assert.Contains("<distNSU>", xml);
        Assert.Contains("<ultNSU>000000000000012</ultNSU>", xml);
    }

    [Fact]
    public void BuildConsNsuAndAccessKeyXml_generate_expected_queries()
    {
        var service = new DfeXmlProcessorService();
        var nsuXml = service.BuildConsNsuXml("48013461000125", "PE", "producao", "99");
        var keyXml = service.BuildConsAccessKeyXml("48013461000125", "PE", "producao", AccessKey());

        Assert.Contains("<tpAmb>1</tpAmb>", nsuXml);
        Assert.Contains("<cUFAutor>26</cUFAutor>", nsuXml);
        Assert.Contains("<consNSU>", nsuXml);
        Assert.Contains("<NSU>000000000000099</NSU>", nsuXml);
        Assert.Contains("<consChNFe>", keyXml);
        Assert.Contains($"<chNFe>{AccessKey()}</chNFe>", keyXml);
    }

    [Fact]
    public void ParseDistributionResponse_decodes_docZip_and_extracts_resNFe()
    {
        var service = new DfeXmlProcessorService();
        var response = $"""
            <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
              <cStat>138</cStat>
              <xMotivo>Documento localizado</xMotivo>
              <ultNSU>000000000000123</ultNSU>
              <maxNSU>000000000000130</maxNSU>
              <loteDistDFeInt>
                <docZip NSU="000000000000123" schema="resNFe_v1.01.xsd">{Zip(ResumoXml())}</docZip>
              </loteDistDFeInt>
            </retDistDFeInt>
            """;

        var result = service.ParseDistributionResponse(
            response,
            Guid.NewGuid().ToString(),
            Guid.NewGuid().ToString(),
            Guid.NewGuid().ToString(),
            "48013461000125",
            "recebida");

        Assert.Equal("138", result.StatusCode);
        Assert.Equal("000000000000123", result.LastNsu);
        Assert.Single(result.Documents);
        var document = result.Documents[0].Document;
        Assert.Equal(AccessKey(), document.AccessKey);
        Assert.Equal("resNFe", document.DocumentType);
        Assert.Equal("recebida", document.Direction);
        Assert.Equal("11111111000191", document.IssuerCnpj);
        Assert.Equal("EMPRESA EMITENTE LTDA", document.IssuerName);
        Assert.Equal(123.45m, document.TotalValue);
        Assert.False(document.HasFullXml);
        Assert.NotEmpty(document.XmlHash);
        Assert.Contains("resNFe_v1.01.xsd", document.XmlStoragePath);
    }

    private static string AccessKey() => "25260611111111000191550010000001231000001234";

    private static string ResumoXml() => $"""
        <resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <chNFe>{AccessKey()}</chNFe>
          <CNPJ>11111111000191</CNPJ>
          <xNome>EMPRESA EMITENTE LTDA</xNome>
          <IE>160000000</IE>
          <dhEmi>2026-06-01T10:00:00-03:00</dhEmi>
          <tpNF>1</tpNF>
          <vNF>123.45</vNF>
          <digVal>abc</digVal>
          <dhRecbto>2026-06-01T10:01:00-03:00</dhRecbto>
          <nProt>125000000000001</nProt>
          <cSitNFe>1</cSitNFe>
        </resNFe>
        """;

    private static string Zip(string xml)
    {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, leaveOpen: true))
        {
            var bytes = Encoding.UTF8.GetBytes(xml);
            gzip.Write(bytes, 0, bytes.Length);
        }

        return Convert.ToBase64String(output.ToArray());
    }
}
