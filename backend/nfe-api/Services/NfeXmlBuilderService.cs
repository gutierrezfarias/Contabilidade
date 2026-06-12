using System.Security.Cryptography;
using System.Text;
using System.Globalization;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NfeXmlBuilderService(IConfiguration configuration)
{
    private static readonly XNamespace NfeNs = "http://www.portalfiscal.inf.br/nfe";
    private readonly string _appVersion = configuration["Nfe:AppVersion"] ?? "CONT-HUB-1.0";

    public NfeBuildResult Build(SupabaseCompany company, SupabaseCertificate certificate, NfePayload note)
    {
        var validationErrors = ValidateForEmission(company, certificate, note);
        if (validationErrors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(" ", validationErrors));
        }

        var uf = certificate.StateUf.Trim().ToUpperInvariant();
        var cUf = UfCode(uf);
        var environment = certificate.Environment.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2";
        var serie = int.Parse(NfeText.Digits(note.Serie)).ToString("000");
        var number = int.Parse(NfeText.Digits(note.Numero)).ToString("000000000");
        var cNf = RandomNumberGenerator.GetInt32(1, 99_999_999).ToString("00000000");
        var emissionDate = EmissionDate(note.DataEmissao);
        var accessKeyWithoutDv = string.Concat(
            cUf,
            emissionDate.ToString("yyMM"),
            NfeText.Digits(company.Cnpj),
            "55",
            serie,
            number,
            "1",
            cNf);
        var digit = CalculateAccessKeyDigit(accessKeyWithoutDv);
        var accessKey = $"{accessKeyWithoutDv}{digit}";
        var total = TotalInvoiceValue(note.Itens);

        var nfe = new XElement(
            NfeNs + "NFe",
            new XElement(
                NfeNs + "infNFe",
                new XAttribute("Id", $"NFe{accessKey}"),
                new XAttribute("versao", "4.00"),
                Ide(note, company, certificate, cUf, cNf, digit, environment, emissionDate),
                Emit(company),
                Dest(note.Destinatario),
                note.Itens.Select((item, index) => Det(item, index + 1)),
                Total(note.Itens, total),
                Transp(note.Transporte),
                Pag(note, total),
                string.IsNullOrWhiteSpace(note.InformacoesAdicionais)
                    ? null
                    : new XElement(NfeNs + "infAdic", new XElement(NfeNs + "infCpl", note.InformacoesAdicionais.Trim()))
            )
        );

        var document = new XDocument(new XDeclaration("1.0", "UTF-8", null), nfe);
        return new NfeBuildResult
        {
            AccessKey = accessKey,
            Number = int.Parse(number).ToString(),
            Series = int.Parse(serie).ToString(),
            TotalAmount = total,
            Xml = document.ToString(SaveOptions.DisableFormatting)
        };
    }

    public string BuildEnviNfe(string signedNfeXml, string lotId)
    {
        var nfe = XElement.Parse(signedNfeXml, LoadOptions.PreserveWhitespace);
        var envelope = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "enviNFe",
                new XAttribute("versao", "4.00"),
                new XElement(NfeNs + "idLote", lotId),
                new XElement(NfeNs + "indSinc", "1"),
                nfe));

        return envelope.ToString(SaveOptions.DisableFormatting);
    }

    public string BuildConsReciNfe(string receiptNumber, string ambiente)
    {
        return new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "consReciNFe",
                new XAttribute("versao", "4.00"),
                new XElement(NfeNs + "tpAmb", ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2"),
                new XElement(NfeNs + "nRec", receiptNumber)))
            .ToString(SaveOptions.DisableFormatting);
    }

    public string BuildConsSitNfe(string accessKey, string ambiente)
    {
        return new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "consSitNFe",
                new XAttribute("versao", "4.00"),
                new XElement(NfeNs + "tpAmb", ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2"),
                new XElement(NfeNs + "xServ", "CONSULTAR"),
                new XElement(NfeNs + "chNFe", NfeText.Digits(accessKey))))
            .ToString(SaveOptions.DisableFormatting);
    }

    private XElement Ide(
        NfePayload note,
        SupabaseCompany company,
        SupabaseCertificate certificate,
        string cUf,
        string cNf,
        string cDv,
        string environment,
        DateTimeOffset emissionDate)
    {
        return new XElement(
            NfeNs + "ide",
            new XElement(NfeNs + "cUF", cUf),
            new XElement(NfeNs + "cNF", cNf),
            new XElement(NfeNs + "natOp", note.NaturezaOperacao.Trim()),
            new XElement(NfeNs + "mod", "55"),
            new XElement(NfeNs + "serie", int.Parse(NfeText.Digits(note.Serie))),
            new XElement(NfeNs + "nNF", int.Parse(NfeText.Digits(note.Numero))),
            new XElement(NfeNs + "dhEmi", emissionDate.ToString("yyyy-MM-ddTHH:mm:sszzz")),
            new XElement(NfeNs + "tpNF", note.TipoOperacao.Equals("entrada", StringComparison.OrdinalIgnoreCase) ? "0" : "1"),
            new XElement(NfeNs + "idDest", string.IsNullOrWhiteSpace(note.DestinoOperacao) ? DestinationType(company, note) : note.DestinoOperacao.Trim()),
            new XElement(NfeNs + "cMunFG", NfeText.Digits(company.CityIbgeCode)),
            new XElement(NfeNs + "tpImp", "1"),
            new XElement(NfeNs + "tpEmis", "1"),
            new XElement(NfeNs + "cDV", cDv),
            new XElement(NfeNs + "tpAmb", environment),
            new XElement(NfeNs + "finNFe", note.Finalidade.Equals("devolucao", StringComparison.OrdinalIgnoreCase) ? "4" : "1"),
            new XElement(NfeNs + "indFinal", string.IsNullOrWhiteSpace(note.ConsumidorFinal) ? "1" : note.ConsumidorFinal.Trim()),
            new XElement(NfeNs + "indPres", string.IsNullOrWhiteSpace(note.IndicadorPresenca) ? "0" : note.IndicadorPresenca),
            new XElement(NfeNs + "procEmi", "0"),
            new XElement(NfeNs + "verProc", _appVersion));
    }

    private XElement Emit(SupabaseCompany company)
    {
        return new XElement(
            NfeNs + "emit",
            new XElement(NfeNs + "CNPJ", NfeText.Digits(company.Cnpj)),
            new XElement(NfeNs + "xNome", company.CompanyName.Trim()),
            new XElement(
                NfeNs + "enderEmit",
                new XElement(NfeNs + "xLgr", company.Address.Trim()),
                new XElement(NfeNs + "nro", string.IsNullOrWhiteSpace(company.AddressNumber) ? "SN" : company.AddressNumber.Trim()),
                string.IsNullOrWhiteSpace(company.Complement) ? null : new XElement(NfeNs + "xCpl", company.Complement.Trim()),
                new XElement(NfeNs + "xBairro", company.Neighborhood.Trim()),
                new XElement(NfeNs + "cMun", NfeText.Digits(company.CityIbgeCode)),
                new XElement(NfeNs + "xMun", company.City.Trim()),
                new XElement(NfeNs + "UF", company.State.Trim().ToUpperInvariant()),
                new XElement(NfeNs + "CEP", NfeText.Digits(company.Cep)),
                new XElement(NfeNs + "cPais", "1058"),
                new XElement(NfeNs + "xPais", "BRASIL"),
                string.IsNullOrWhiteSpace(company.Phone) ? null : new XElement(NfeNs + "fone", NfeText.Digits(company.Phone))),
            new XElement(NfeNs + "IE", NfeText.Digits(company.StateRegistration)),
            new XElement(NfeNs + "CRT", Crt(company.TaxRegime)));
    }

    private XElement Dest(NfeParty party)
    {
        var document = NfeText.Digits(party.Documento);
        return new XElement(
            NfeNs + "dest",
            document.Length == 11 ? new XElement(NfeNs + "CPF", document) : new XElement(NfeNs + "CNPJ", document),
            new XElement(NfeNs + "xNome", party.Nome.Trim()),
            new XElement(
                NfeNs + "enderDest",
                new XElement(NfeNs + "xLgr", party.Logradouro.Trim()),
                new XElement(NfeNs + "nro", string.IsNullOrWhiteSpace(party.Numero) ? "SN" : party.Numero.Trim()),
                string.IsNullOrWhiteSpace(party.Complemento) ? null : new XElement(NfeNs + "xCpl", party.Complemento.Trim()),
                new XElement(NfeNs + "xBairro", party.Bairro.Trim()),
                new XElement(NfeNs + "cMun", NfeText.Digits(party.CodigoMunicipioIbge)),
                new XElement(NfeNs + "xMun", party.Municipio.Trim()),
                new XElement(NfeNs + "UF", party.Uf.Trim().ToUpperInvariant()),
                new XElement(NfeNs + "CEP", NfeText.Digits(party.Cep)),
                new XElement(NfeNs + "cPais", party.CodigoPais),
                new XElement(NfeNs + "xPais", party.Pais),
                string.IsNullOrWhiteSpace(party.Telefone) ? null : new XElement(NfeNs + "fone", NfeText.Digits(party.Telefone))),
            new XElement(NfeNs + "indIEDest", string.IsNullOrWhiteSpace(party.IndicadorIe) ? "9" : party.IndicadorIe),
            string.IsNullOrWhiteSpace(party.InscricaoEstadual) ? null : new XElement(NfeNs + "IE", NfeText.Digits(party.InscricaoEstadual)),
            string.IsNullOrWhiteSpace(party.Email) ? null : new XElement(NfeNs + "email", party.Email.Trim()));
    }

    private XElement Det(NfeItem item, int index)
    {
        var total = ProductTotal(item);
        var gtin = string.IsNullOrWhiteSpace(item.Gtin) ? "SEM GTIN" : item.Gtin.Trim();
        return new XElement(
            NfeNs + "det",
            new XAttribute("nItem", index),
            new XElement(
                NfeNs + "prod",
                new XElement(NfeNs + "cProd", string.IsNullOrWhiteSpace(item.Codigo) ? index.ToString() : item.Codigo.Trim()),
                new XElement(NfeNs + "cEAN", gtin),
                new XElement(NfeNs + "xProd", item.Descricao.Trim()),
                new XElement(NfeNs + "NCM", NfeText.Digits(item.Ncm)),
                string.IsNullOrWhiteSpace(item.Cest) ? null : new XElement(NfeNs + "CEST", NfeText.Digits(item.Cest)),
                new XElement(NfeNs + "CFOP", NfeText.Digits(item.Cfop)),
                new XElement(NfeNs + "uCom", item.Unidade.Trim().ToUpperInvariant()),
                new XElement(NfeNs + "qCom", NfeText.Decimal(item.Quantidade, 4)),
                new XElement(NfeNs + "vUnCom", NfeText.Decimal(item.ValorUnitario, 10)),
                new XElement(NfeNs + "vProd", NfeText.Decimal(total)),
                string.IsNullOrWhiteSpace(item.Gtin) ? null : new XElement(NfeNs + "cEANTrib", gtin),
                string.IsNullOrWhiteSpace(item.Gtin) ? new XElement(NfeNs + "cEANTrib", "SEM GTIN") : null,
                new XElement(NfeNs + "uTrib", item.Unidade.Trim().ToUpperInvariant()),
                new XElement(NfeNs + "qTrib", NfeText.Decimal(item.Quantidade, 4)),
                new XElement(NfeNs + "vUnTrib", NfeText.Decimal(item.ValorUnitario, 10)),
                item.Frete > 0 ? new XElement(NfeNs + "vFrete", NfeText.Decimal(item.Frete)) : null,
                item.Seguro > 0 ? new XElement(NfeNs + "vSeg", NfeText.Decimal(item.Seguro)) : null,
                item.Desconto > 0 ? new XElement(NfeNs + "vDesc", NfeText.Decimal(item.Desconto)) : null,
                item.OutrasDespesas > 0 ? new XElement(NfeNs + "vOutro", NfeText.Decimal(item.OutrasDespesas)) : null,
                new XElement(NfeNs + "indTot", "1")),
            new XElement(
                NfeNs + "imposto",
                Icms(item),
                Ipi(item),
                Pis(item),
                Cofins(item)),
            string.IsNullOrWhiteSpace(item.InformacoesAdicionais)
                ? null
                : new XElement(NfeNs + "infAdProd", item.InformacoesAdicionais.Trim()));
    }

    private XElement Icms(NfeItem item)
    {
        var baseValue = item.ValorBaseIcms > 0 ? item.ValorBaseIcms : ProductTotal(item);
        var icmsValue = item.ValorIcms > 0 ? item.ValorIcms : baseValue * item.AliquotaIcms / 100;

        if (!string.IsNullOrWhiteSpace(item.Csosn))
        {
            return new XElement(
                NfeNs + "ICMS",
                new XElement(
                    NfeNs + "ICMSSN102",
                    new XElement(NfeNs + "orig", item.OrigemIcms),
                    new XElement(NfeNs + "CSOSN", item.Csosn)));
        }

        var cst = string.IsNullOrWhiteSpace(item.CstIcms) ? "00" : item.CstIcms.Trim();
        var group = cst switch
        {
            "00" => new XElement(
                NfeNs + "ICMS00",
                new XElement(NfeNs + "orig", item.OrigemIcms),
                new XElement(NfeNs + "CST", cst),
                new XElement(NfeNs + "modBC", "3"),
                new XElement(NfeNs + "vBC", NfeText.Decimal(baseValue)),
                new XElement(NfeNs + "pICMS", NfeText.Decimal(item.AliquotaIcms, 4)),
                new XElement(NfeNs + "vICMS", NfeText.Decimal(icmsValue))),
            "40" or "41" or "50" => new XElement(
                NfeNs + "ICMS40",
                new XElement(NfeNs + "orig", item.OrigemIcms),
                new XElement(NfeNs + "CST", cst)),
            _ => throw new InvalidOperationException($"CST ICMS {cst} ainda nao suportado pelo gerador XML. Ajuste para CST 00/40/41/50 ou CSOSN.")
        };

        return new XElement(NfeNs + "ICMS", group);
    }

    private XElement Total(List<NfeItem> items, decimal value)
    {
        var icmsBase = items
            .Where(item => string.IsNullOrWhiteSpace(item.Csosn))
            .Where(item => string.IsNullOrWhiteSpace(item.CstIcms) || item.CstIcms == "00")
            .Sum(item => item.ValorBaseIcms > 0 ? item.ValorBaseIcms : ProductTotal(item));
        var icmsValue = items
            .Where(item => string.IsNullOrWhiteSpace(item.Csosn))
            .Where(item => string.IsNullOrWhiteSpace(item.CstIcms) || item.CstIcms == "00")
            .Sum(item =>
            {
                var baseValue = item.ValorBaseIcms > 0 ? item.ValorBaseIcms : ProductTotal(item);
                return item.ValorIcms > 0 ? item.ValorIcms : baseValue * item.AliquotaIcms / 100;
            });
        var productValue = items.Sum(ProductTotal);
        var freightValue = items.Sum(item => item.Frete);
        var insuranceValue = items.Sum(item => item.Seguro);
        var discountValue = items.Sum(item => item.Desconto);
        var otherValue = items.Sum(item => item.OutrasDespesas);
        var ipiValue = items.Sum(IpiValue);
        var pisValue = items.Sum(item => PisValue(item));
        var cofinsValue = items.Sum(item => CofinsValue(item));

        return new XElement(
            NfeNs + "total",
            new XElement(
                NfeNs + "ICMSTot",
                new XElement(NfeNs + "vBC", NfeText.Decimal(icmsBase)),
                new XElement(NfeNs + "vICMS", NfeText.Decimal(icmsValue)),
                new XElement(NfeNs + "vICMSDeson", "0.00"),
                new XElement(NfeNs + "vFCP", "0.00"),
                new XElement(NfeNs + "vBCST", "0.00"),
                new XElement(NfeNs + "vST", "0.00"),
                new XElement(NfeNs + "vFCPST", "0.00"),
                new XElement(NfeNs + "vFCPSTRet", "0.00"),
                new XElement(NfeNs + "vProd", NfeText.Decimal(productValue)),
                new XElement(NfeNs + "vFrete", NfeText.Decimal(freightValue)),
                new XElement(NfeNs + "vSeg", NfeText.Decimal(insuranceValue)),
                new XElement(NfeNs + "vDesc", NfeText.Decimal(discountValue)),
                new XElement(NfeNs + "vII", "0.00"),
                new XElement(NfeNs + "vIPI", NfeText.Decimal(ipiValue)),
                new XElement(NfeNs + "vIPIDevol", "0.00"),
                new XElement(NfeNs + "vPIS", NfeText.Decimal(pisValue)),
                new XElement(NfeNs + "vCOFINS", NfeText.Decimal(cofinsValue)),
                new XElement(NfeNs + "vOutro", NfeText.Decimal(otherValue)),
                new XElement(NfeNs + "vNF", NfeText.Decimal(value))));
    }

    private XElement Pag(NfePayload note, decimal value)
    {
        var payments = note.Pagamentos.Count > 0 ? note.Pagamentos : [note.Pagamento];
        return new XElement(
            NfeNs + "pag",
            payments.Select(payment =>
            {
                var paymentValue = payment.Valor > 0 ? payment.Valor : value;
                return new XElement(
                    NfeNs + "detPag",
                    new XElement(NfeNs + "indPag", string.IsNullOrWhiteSpace(payment.IndicadorPagamento) ? "0" : payment.IndicadorPagamento),
                    new XElement(NfeNs + "tPag", string.IsNullOrWhiteSpace(payment.TipoPagamento) ? "90" : payment.TipoPagamento),
                    new XElement(NfeNs + "vPag", NfeText.Decimal(paymentValue)));
            }));
    }

    private XElement Transp(NfeTransport transport)
    {
        var document = NfeText.Digits(transport.TransportadoraDocumento);
        var transportadora = string.IsNullOrWhiteSpace(transport.TransportadoraNome)
            ? null
            : new XElement(
                NfeNs + "transporta",
                document.Length == 14 ? new XElement(NfeNs + "CNPJ", document) : null,
                document.Length == 11 ? new XElement(NfeNs + "CPF", document) : null,
                new XElement(NfeNs + "xNome", transport.TransportadoraNome.Trim()),
                string.IsNullOrWhiteSpace(transport.TransportadoraIe) ? null : new XElement(NfeNs + "IE", NfeText.Digits(transport.TransportadoraIe)),
                string.IsNullOrWhiteSpace(transport.TransportadoraEndereco) ? null : new XElement(NfeNs + "xEnder", transport.TransportadoraEndereco.Trim()),
                string.IsNullOrWhiteSpace(transport.TransportadoraMunicipio) ? null : new XElement(NfeNs + "xMun", transport.TransportadoraMunicipio.Trim()),
                string.IsNullOrWhiteSpace(transport.TransportadoraUf) ? null : new XElement(NfeNs + "UF", transport.TransportadoraUf.Trim().ToUpperInvariant()));
        var vehicle = string.IsNullOrWhiteSpace(transport.Placa)
            ? null
            : new XElement(
                NfeNs + "veicTransp",
                new XElement(NfeNs + "placa", transport.Placa.Trim().ToUpperInvariant()),
                new XElement(NfeNs + "UF", transport.UfVeiculo.Trim().ToUpperInvariant()));
        var volumes = transport.QuantidadeVolumes <= 0 && string.IsNullOrWhiteSpace(transport.Especie)
            ? null
            : new XElement(
                NfeNs + "vol",
                transport.QuantidadeVolumes > 0 ? new XElement(NfeNs + "qVol", decimal.Truncate(transport.QuantidadeVolumes).ToString(CultureInfo.InvariantCulture)) : null,
                string.IsNullOrWhiteSpace(transport.Especie) ? null : new XElement(NfeNs + "esp", transport.Especie.Trim()),
                transport.PesoLiquido > 0 ? new XElement(NfeNs + "pesoL", NfeText.Decimal(transport.PesoLiquido, 3)) : null,
                transport.PesoBruto > 0 ? new XElement(NfeNs + "pesoB", NfeText.Decimal(transport.PesoBruto, 3)) : null);

        return new XElement(
            NfeNs + "transp",
            new XElement(NfeNs + "modFrete", string.IsNullOrWhiteSpace(transport.ModalidadeFrete) ? "9" : transport.ModalidadeFrete),
            transportadora,
            vehicle,
            volumes);
    }

    private XElement? Ipi(NfeItem item)
    {
        if (string.IsNullOrWhiteSpace(item.CstIpi) && item.ValorIpi <= 0 && item.AliquotaIpi <= 0)
        {
            return null;
        }

        var baseValue = item.ValorBaseIpi > 0 ? item.ValorBaseIpi : ProductTotal(item);
        var ipiValue = IpiValue(item);
        return new XElement(
            NfeNs + "IPI",
            new XElement(NfeNs + "cEnq", "999"),
            new XElement(
                NfeNs + "IPITrib",
                new XElement(NfeNs + "CST", string.IsNullOrWhiteSpace(item.CstIpi) ? "99" : item.CstIpi.Trim()),
                new XElement(NfeNs + "vBC", NfeText.Decimal(baseValue)),
                new XElement(NfeNs + "pIPI", NfeText.Decimal(item.AliquotaIpi, 4)),
                new XElement(NfeNs + "vIPI", NfeText.Decimal(ipiValue))));
    }

    private XElement Pis(NfeItem item)
    {
        var cst = string.IsNullOrWhiteSpace(item.CstPis) ? "99" : item.CstPis.Trim();
        if (cst is "04" or "06" or "07" or "08" or "09")
        {
            return new XElement(NfeNs + "PIS", new XElement(NfeNs + "PISNT", new XElement(NfeNs + "CST", cst)));
        }

        var baseValue = item.ValorBasePis > 0 ? item.ValorBasePis : ProductTotal(item);
        var value = PisValue(item);
        return new XElement(
            NfeNs + "PIS",
            new XElement(
                cst is "01" or "02" ? NfeNs + "PISAliq" : NfeNs + "PISOutr",
                new XElement(NfeNs + "CST", cst),
                new XElement(NfeNs + "vBC", NfeText.Decimal(baseValue)),
                new XElement(NfeNs + "pPIS", NfeText.Decimal(item.AliquotaPis, 4)),
                new XElement(NfeNs + "vPIS", NfeText.Decimal(value))));
    }

    private XElement Cofins(NfeItem item)
    {
        var cst = string.IsNullOrWhiteSpace(item.CstCofins) ? "99" : item.CstCofins.Trim();
        if (cst is "04" or "06" or "07" or "08" or "09")
        {
            return new XElement(NfeNs + "COFINS", new XElement(NfeNs + "COFINSNT", new XElement(NfeNs + "CST", cst)));
        }

        var baseValue = item.ValorBaseCofins > 0 ? item.ValorBaseCofins : ProductTotal(item);
        var value = CofinsValue(item);
        return new XElement(
            NfeNs + "COFINS",
            new XElement(
                cst is "01" or "02" ? NfeNs + "COFINSAliq" : NfeNs + "COFINSOutr",
                new XElement(NfeNs + "CST", cst),
                new XElement(NfeNs + "vBC", NfeText.Decimal(baseValue)),
                new XElement(NfeNs + "pCOFINS", NfeText.Decimal(item.AliquotaCofins, 4)),
                new XElement(NfeNs + "vCOFINS", NfeText.Decimal(value))));
    }

    public IReadOnlyList<string> ValidateForEmission(SupabaseCompany company, SupabaseCertificate certificate, NfePayload note)
    {
        var errors = new List<string>();

        AddIf(errors, NfeText.Digits(company.Cnpj).Length != 14, "Empresa sem CNPJ valido.");
        AddIf(errors, string.IsNullOrWhiteSpace(company.StateRegistration), "Empresa sem Inscricao Estadual.");
        AddIf(errors, string.IsNullOrWhiteSpace(company.CityIbgeCode), "Empresa sem codigo IBGE do municipio.");
        AddIf(errors, string.IsNullOrWhiteSpace(company.Address), "Empresa sem endereco.");
        AddIf(errors, string.IsNullOrWhiteSpace(company.Neighborhood), "Empresa sem bairro.");
        AddIf(errors, string.IsNullOrWhiteSpace(company.Cep), "Empresa sem CEP.");
        AddIf(errors, string.IsNullOrWhiteSpace(certificate.StateUf), "Certificado sem UF SEFAZ.");
        AddIf(errors, string.IsNullOrWhiteSpace(note.NaturezaOperacao), "Natureza da operacao nao informada.");
        AddIf(errors, string.IsNullOrWhiteSpace(NfeText.Digits(note.Serie)), "Serie da NF-e nao informada.");
        AddIf(errors, string.IsNullOrWhiteSpace(NfeText.Digits(note.Numero)), "Numero da NF-e nao informado.");
        AddIf(errors, string.IsNullOrWhiteSpace(note.Destinatario.Nome), "Destinatario sem nome.");
        AddIf(errors, NfeText.Digits(note.Destinatario.Documento).Length is not (11 or 14), "Destinatario sem CPF/CNPJ valido.");
        AddIf(errors, string.IsNullOrWhiteSpace(note.Destinatario.CodigoMunicipioIbge), "Destinatario sem codigo IBGE do municipio.");
        AddIf(errors, string.IsNullOrWhiteSpace(note.Destinatario.Uf), "Destinatario sem UF.");
        AddIf(errors, note.Itens.Count == 0, "NF-e sem produtos/servicos.");
        AddIf(errors, note.Itens.Any(IsLikelyService), "NF-e modelo 55 nao deve ser usada para ISS/NFS-e. Use o modulo NFS-e para servicos.");

        foreach (var item in note.Itens.Select((value, index) => new { value, index }))
        {
            AddIf(errors, string.IsNullOrWhiteSpace(item.value.Descricao), $"Item {item.index + 1} sem descricao.");
            AddIf(errors, NfeText.Digits(item.value.Ncm).Length != 8, $"Item {item.index + 1} sem NCM valido.");
            AddIf(errors, NfeText.Digits(item.value.Cfop).Length != 4, $"Item {item.index + 1} sem CFOP valido.");
            AddIf(errors, item.value.Quantidade <= 0, $"Item {item.index + 1} sem quantidade.");
            AddIf(errors, item.value.ValorUnitario <= 0, $"Item {item.index + 1} sem valor unitario.");
            AddIf(errors, string.IsNullOrWhiteSpace(item.value.CstIcms) && string.IsNullOrWhiteSpace(item.value.Csosn), $"Item {item.index + 1} sem CST/CSOSN de ICMS.");
            AddIf(errors, string.IsNullOrWhiteSpace(item.value.Csosn) && !SupportedCstIcms(item.value.CstIcms), $"Item {item.index + 1} com CST ICMS ainda nao suportado no XML.");
        }

        return errors;
    }

    private static void AddIf(List<string> errors, bool condition, string message)
    {
        if (condition) errors.Add(message);
    }

    private static DateTimeOffset EmissionDate(string value)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
        {
            return parsed;
        }

        return DateTimeOffset.Now;
    }

    private static string DestinationType(SupabaseCompany company, NfePayload note)
    {
        if (company.State.Equals(note.Destinatario.Uf, StringComparison.OrdinalIgnoreCase)) return "1";
        return NfeText.Digits(note.Destinatario.Documento).Length == 14 ? "2" : "2";
    }

    private static decimal ProductTotal(NfeItem item) =>
        item.ValorTotal > 0 ? item.ValorTotal : item.Quantidade * item.ValorUnitario;

    private static decimal TotalInvoiceValue(IEnumerable<NfeItem> items) =>
        items.Sum(item => ProductTotal(item) + item.Frete + item.Seguro + item.OutrasDespesas + IpiValue(item) - item.Desconto);

    private static decimal PisValue(NfeItem item)
    {
        var baseValue = item.ValorBasePis > 0 ? item.ValorBasePis : ProductTotal(item);
        return item.ValorPis > 0 ? item.ValorPis : baseValue * item.AliquotaPis / 100;
    }

    private static decimal CofinsValue(NfeItem item)
    {
        var baseValue = item.ValorBaseCofins > 0 ? item.ValorBaseCofins : ProductTotal(item);
        return item.ValorCofins > 0 ? item.ValorCofins : baseValue * item.AliquotaCofins / 100;
    }

    private static decimal IpiValue(NfeItem item)
    {
        if (string.IsNullOrWhiteSpace(item.CstIpi) && item.ValorIpi <= 0 && item.AliquotaIpi <= 0)
        {
            return 0;
        }

        var baseValue = item.ValorBaseIpi > 0 ? item.ValorBaseIpi : ProductTotal(item);
        return item.ValorIpi > 0 ? item.ValorIpi : baseValue * item.AliquotaIpi / 100;
    }

    private static bool SupportedCstIcms(string cst)
    {
        if (string.IsNullOrWhiteSpace(cst)) return true;
        return cst.Trim() is "00" or "40" or "41" or "50";
    }

    private static bool IsLikelyService(NfeItem item)
    {
        var cfop = NfeText.Digits(item.Cfop);
        var ncm = NfeText.Digits(item.Ncm);
        return cfop.StartsWith("5933", StringComparison.Ordinal)
            || cfop.StartsWith("6933", StringComparison.Ordinal)
            || ncm == "00000000";
    }

    private static string Crt(string taxRegime)
    {
        if (taxRegime.Contains("Simples", StringComparison.OrdinalIgnoreCase) || taxRegime.Contains("MEI", StringComparison.OrdinalIgnoreCase)) return "1";
        return "3";
    }

    private static string UfCode(string uf) => uf.ToUpperInvariant() switch
    {
        "AC" => "12",
        "AL" => "27",
        "AM" => "13",
        "AP" => "16",
        "BA" => "29",
        "CE" => "23",
        "DF" => "53",
        "ES" => "32",
        "GO" => "52",
        "MA" => "21",
        "MG" => "31",
        "MS" => "50",
        "MT" => "51",
        "PA" => "15",
        "PB" => "25",
        "PE" => "26",
        "PI" => "22",
        "PR" => "41",
        "RJ" => "33",
        "RN" => "24",
        "RO" => "11",
        "RR" => "14",
        "RS" => "43",
        "SC" => "42",
        "SE" => "28",
        "SP" => "35",
        "TO" => "17",
        _ => throw new InvalidOperationException($"UF SEFAZ invalida: {uf}.")
    };

    private static string CalculateAccessKeyDigit(string value)
    {
        var weights = new[] { 2, 3, 4, 5, 6, 7, 8, 9 };
        var weightIndex = 0;
        var sum = 0;

        for (var index = value.Length - 1; index >= 0; index--)
        {
            sum += (value[index] - '0') * weights[weightIndex];
            weightIndex = (weightIndex + 1) % weights.Length;
        }

        var mod = sum % 11;
        var digit = 11 - mod;
        return digit >= 10 ? "0" : digit.ToString();
    }
}
