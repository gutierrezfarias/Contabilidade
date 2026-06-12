using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NfeAuthorizationService(
    SupabaseNfeRepository repository,
    CertificateService certificateService,
    NfeXmlBuilderService xmlBuilder,
    NfeSignatureService signatureService,
    NfeSchemaValidationService schemaValidationService,
    SefazSoapClientService sefazSoapClient,
    DanfePdfService danfePdfService,
    NfeLogService logService,
    FiscalRuleEngineService fiscalRuleEngine)
{
    private static readonly XNamespace NfeNs = "http://www.portalfiscal.inf.br/nfe";

    public async Task<NfeOperationResult> SaveDraftAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            var documentId = await repository.SaveDraftPayloadAsync(request, cancellationToken);
            await WriteLogAsync(context, documentId, "", "salvar_rascunho", "local", "0", "Rascunho salvo.", true, "", cancellationToken);

            return Ok("Rascunho", "Rascunho de NF-e salvo.", "", documentId);
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> ValidateOnlyAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            var gate = await RunFiscalGateAsync(request, authorizationHeader, "validar_nfe", request.DocumentId ?? "", cancellationToken);
            if (!gate.Success)
            {
                return FiscalFail(gate.FiscalResult, request.DocumentId ?? "", "");
            }

            var errors = xmlBuilder.ValidateForEmission(context.Company, context.Certificate, gate.Request.Nota);
            if (errors.Count > 0)
            {
                return Fail("NF-e ainda possui pendencias fiscais.", errors);
            }

            return new NfeOperationResult
            {
                Message = "Dados minimos da NF-e validados para gerar XML modelo 55.",
                Mode = "real",
                Status = "Valida",
                Success = true
            };
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> GenerateXmlOnlyAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            var gate = await RunFiscalGateAsync(request, authorizationHeader, "gerar_xml", request.DocumentId ?? "", cancellationToken);
            if (!gate.Success)
            {
                return FiscalFail(gate.FiscalResult, request.DocumentId ?? "", "");
            }

            var build = xmlBuilder.Build(context.Company, context.Certificate, gate.Request.Nota);
            var documentId = await repository.UpsertDraftAsync(gate.Request, build, cancellationToken);
            await repository.SaveFiscalValidationAsync(documentId, gate.FiscalResult, cancellationToken);
            await repository.SaveGeneratedXmlAsync(documentId, build.AccessKey, build.Xml, cancellationToken);
            await WriteLogAsync(context, documentId, build.AccessKey, "gerar_xml", "local", "0", "XML gerado.", true, "", cancellationToken);

            return Ok("XmlGerado", "XML NF-e 4.00 gerado e salvo.", build.AccessKey, documentId) with { Xml = build.Xml };
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> SignExistingXmlAsync(
        AssinarXmlRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            var document = await repository.GetDocumentAsync(
                request.OrganizationId,
                request.ClientId,
                request.DocumentId,
                cancellationToken);

            if (string.IsNullOrWhiteSpace(document.GeneratedXml) || string.IsNullOrWhiteSpace(document.AccessKey))
            {
                return Fail("A NF-e ainda nao possui XML gerado para assinatura.");
            }

            var gate = await EnsureDocumentFiscalGateAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                request.DocumentId,
                document,
                authorizationHeader,
                "assinar_xml",
                cancellationToken);
            if (!gate.Success)
            {
                return FiscalFail(gate.FiscalResult, document.Id, document.AccessKey);
            }

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var signed = signatureService.SignInfNfe(document.GeneratedXml, certificate, document.AccessKey);
            await repository.SaveSignedXmlAsync(document.Id, signed.SignedXml, cancellationToken);
            await WriteLogAsync(context, document.Id, document.AccessKey, "assinar_xml", "local", "0", "XML assinado.", true, "", cancellationToken);

            return Ok("XmlAssinado", "XML assinado com o certificado A1.", document.AccessKey, document.Id) with { Xml = signed.SignedXml };
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> AuthorizeSignedXmlAsync(
        NfeDocumentRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        string documentId = request.DocumentId;
        string accessKey = "";

        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);
            var document = await repository.GetDocumentAsync(
                request.OrganizationId,
                request.ClientId,
                request.DocumentId,
                cancellationToken);

            if (document.Status.Equals("Autorizada", StringComparison.OrdinalIgnoreCase))
            {
                return Fail("Esta NF-e ja esta autorizada. Operacao bloqueada para evitar emissao duplicada.", [], document.Id, document.AccessKey);
            }

            if (string.IsNullOrWhiteSpace(document.SignedXml) || string.IsNullOrWhiteSpace(document.AccessKey))
            {
                return Fail("Gere e assine o XML antes de transmitir para a SEFAZ.", [], document.Id, document.AccessKey);
            }

            accessKey = document.AccessKey;
            var gate = await EnsureDocumentFiscalGateAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                request.DocumentId,
                document,
                authorizationHeader,
                "autorizar_nfe",
                cancellationToken);
            if (!gate.Success)
            {
                return FiscalFail(gate.FiscalResult, document.Id, document.AccessKey);
            }

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var enviNfeXml = xmlBuilder.BuildEnviNfe(document.SignedXml, LotId());
            var schemaErrors = schemaValidationService.Validate(enviNfeXml, "enviNFe_v4.00.xsd");
            if (schemaErrors.Count > 0)
            {
                await repository.SaveOperationStatusAsync(document.Id, "Rejeitada", "VALIDACAO_XSD", "XML invalido contra schema XSD.", cancellationToken);
                await WriteLogAsync(context, document.Id, document.AccessKey, "validar_xsd", "local_xsd", "VALIDACAO_XSD", "XML invalido contra schema XSD.", false, string.Join(" | ", schemaErrors), cancellationToken);
                return Fail("XML invalido contra schema XSD.", schemaErrors, document.Id, document.AccessKey);
            }

            var authorization = await sefazSoapClient.AuthorizeAsync(
                context.Certificate.StateUf,
                context.Certificate.Environment,
                enviNfeXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, document.Id, document.AccessKey, "autorizar_nfe", authorization.Endpoint, authorization.CStat, authorization.XMotivo, authorization.Success, authorization.Error, cancellationToken);

            if (authorization.CStat is "103" or "105" && !string.IsNullOrWhiteSpace(authorization.ReceiptNumber))
            {
                await repository.SaveReceiptAsync(document.Id, authorization, cancellationToken);
                var receiptXml = xmlBuilder.BuildConsReciNfe(authorization.ReceiptNumber, context.Certificate.Environment);
                var receiptValidation = schemaValidationService.Validate(receiptXml, "consReciNFe_v4.00.xsd");
                if (receiptValidation.Count > 0)
                {
                    return Fail("XML de consulta de recibo invalido contra schema XSD.", receiptValidation, document.Id, document.AccessKey);
                }

                authorization = await sefazSoapClient.ConsultReceiptAsync(
                    context.Certificate.StateUf,
                    context.Certificate.Environment,
                    receiptXml,
                    certificate,
                    cancellationToken);
                await WriteLogAsync(context, document.Id, document.AccessKey, "consultar_recibo", authorization.Endpoint, authorization.CStat, authorization.XMotivo, authorization.Success, authorization.Error, cancellationToken);
            }

            if (authorization.CStat is "100" or "150")
            {
                var authorizedXml = BuildAuthorizedXml(document.SignedXml, authorization.ResponseXml);
                var danfePdfBase64 = danfePdfService.GenerateBase64(authorizedXml);
                await repository.SaveAuthorizationAsync(document.Id, authorization, authorizedXml, danfePdfBase64, cancellationToken);

                return new NfeOperationResult
                {
                    AccessKey = document.AccessKey,
                    CStat = authorization.CStat,
                    DanfePdfBase64 = danfePdfBase64,
                    DocumentId = document.Id,
                    Message = authorization.XMotivo,
                    Mode = "real",
                    ProtocolNumber = authorization.ProtocolNumber,
                    ReceiptNumber = authorization.ReceiptNumber,
                    Status = "Autorizada",
                    Success = true,
                    XMotivo = authorization.XMotivo
                };
            }

            await repository.SaveOperationStatusAsync(document.Id, MapStatus(authorization.CStat), authorization.CStat, authorization.XMotivo, cancellationToken);
            return new NfeOperationResult
            {
                AccessKey = document.AccessKey,
                CStat = authorization.CStat,
                DocumentId = document.Id,
                Message = authorization.XMotivo,
                Mode = "real",
                ReceiptNumber = authorization.ReceiptNumber,
                Status = MapStatus(authorization.CStat),
                Success = false,
                XMotivo = authorization.XMotivo
            };
        }
        catch (Exception error)
        {
            return Fail(error.Message, [], documentId, accessKey);
        }
    }

    public async Task<NfeOperationResult> EmitAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        string documentId = "";
        string accessKey = "";

        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);

            if (!string.IsNullOrWhiteSpace(request.DocumentId))
            {
                var existing = await repository.GetDocumentAsync(
                    request.OrganizationId,
                    request.ClientId,
                    request.DocumentId,
                    cancellationToken);
                if (existing.Status.Equals("Autorizada", StringComparison.OrdinalIgnoreCase))
                {
                    return Fail("Esta NF-e ja esta autorizada. Operacao bloqueada para evitar emissao duplicada.", [], existing.Id, existing.AccessKey);
                }
            }

            var gate = await RunFiscalGateAsync(request, authorizationHeader, "emitir_nfe", request.DocumentId ?? "", cancellationToken);
            if (!gate.Success)
            {
                return FiscalFail(gate.FiscalResult, request.DocumentId ?? "", "");
            }

            var build = xmlBuilder.Build(context.Company, context.Certificate, gate.Request.Nota);
            accessKey = build.AccessKey;
            documentId = await repository.UpsertDraftAsync(gate.Request, build, cancellationToken);
            await repository.SaveFiscalValidationAsync(documentId, gate.FiscalResult, cancellationToken);
            await repository.SaveGeneratedXmlAsync(documentId, build.AccessKey, build.Xml, cancellationToken);

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var signed = signatureService.SignInfNfe(build.Xml, certificate, build.AccessKey);
            await repository.SaveSignedXmlAsync(documentId, signed.SignedXml, cancellationToken);

            var enviNfeXml = xmlBuilder.BuildEnviNfe(signed.SignedXml, LotId());
            var schemaErrors = schemaValidationService.Validate(enviNfeXml, "enviNFe_v4.00.xsd");
            if (schemaErrors.Count > 0)
            {
                await repository.SaveOperationStatusAsync(documentId, "Rejeitada", "VALIDACAO_XSD", "XML invalido contra schema XSD.", cancellationToken);
                await WriteLogAsync(context, documentId, build.AccessKey, "validar_xsd", "local_xsd", "VALIDACAO_XSD", "XML invalido contra schema XSD.", false, string.Join(" | ", schemaErrors), cancellationToken);
                return Fail("XML invalido contra schema XSD.", schemaErrors, documentId, build.AccessKey);
            }

            var authorization = await sefazSoapClient.AuthorizeAsync(
                context.Certificate.StateUf,
                context.Certificate.Environment,
                enviNfeXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, documentId, build.AccessKey, "autorizar_nfe", authorization.Endpoint, authorization.CStat, authorization.XMotivo, authorization.Success, authorization.Error, cancellationToken);

            if (authorization.CStat is "103" or "105" && !string.IsNullOrWhiteSpace(authorization.ReceiptNumber))
            {
                await repository.SaveReceiptAsync(documentId, authorization, cancellationToken);
                var receiptXml = xmlBuilder.BuildConsReciNfe(authorization.ReceiptNumber, context.Certificate.Environment);
                var receiptValidation = schemaValidationService.Validate(receiptXml, "consReciNFe_v4.00.xsd");
                if (receiptValidation.Count > 0)
                {
                    return Fail("XML de consulta de recibo invalido contra schema XSD.", receiptValidation, documentId, build.AccessKey);
                }

                authorization = await sefazSoapClient.ConsultReceiptAsync(
                    context.Certificate.StateUf,
                    context.Certificate.Environment,
                    receiptXml,
                    certificate,
                    cancellationToken);
                await WriteLogAsync(context, documentId, build.AccessKey, "consultar_recibo", authorization.Endpoint, authorization.CStat, authorization.XMotivo, authorization.Success, authorization.Error, cancellationToken);
            }

            if (authorization.CStat is "100" or "150")
            {
                var authorizedXml = BuildAuthorizedXml(signed.SignedXml, authorization.ResponseXml);
                var danfePdfBase64 = danfePdfService.GenerateBase64(authorizedXml);
                await repository.SaveAuthorizationAsync(documentId, authorization, authorizedXml, danfePdfBase64, cancellationToken);

                return new NfeOperationResult
                {
                    AccessKey = build.AccessKey,
                    CStat = authorization.CStat,
                    DanfePdfBase64 = danfePdfBase64,
                    DocumentId = documentId,
                    Message = authorization.XMotivo,
                    Mode = "real",
                    ProtocolNumber = authorization.ProtocolNumber,
                    ReceiptNumber = authorization.ReceiptNumber,
                    Status = "Autorizada",
                    Success = true,
                    XMotivo = authorization.XMotivo
                };
            }

            await repository.SaveOperationStatusAsync(documentId, MapStatus(authorization.CStat), authorization.CStat, authorization.XMotivo, cancellationToken);
            return new NfeOperationResult
            {
                AccessKey = build.AccessKey,
                CStat = authorization.CStat,
                DocumentId = documentId,
                Message = authorization.XMotivo,
                Mode = "real",
                ReceiptNumber = authorization.ReceiptNumber,
                Status = MapStatus(authorization.CStat),
                Success = false,
                XMotivo = authorization.XMotivo
            };
        }
        catch (Exception error)
        {
            return Fail(error.Message, [], documentId, accessKey);
        }
    }

    public async Task<NfeOperationResult> ConsultReceiptAsync(
        ConsultarRetornoRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var receiptXml = xmlBuilder.BuildConsReciNfe(
                request.ReceiptNumber,
                string.IsNullOrWhiteSpace(request.Ambiente) ? context.Certificate.Environment : request.Ambiente);
            var schemaErrors = schemaValidationService.Validate(receiptXml, "consReciNFe_v4.00.xsd");
            if (schemaErrors.Count > 0)
            {
                return Fail("XML de consulta de recibo invalido contra schema XSD.", schemaErrors);
            }

            var result = await sefazSoapClient.ConsultReceiptAsync(
                string.IsNullOrWhiteSpace(request.Uf) ? context.Certificate.StateUf : request.Uf,
                string.IsNullOrWhiteSpace(request.Ambiente) ? context.Certificate.Environment : request.Ambiente,
                receiptXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, null, result.AccessKey, "consultar_recibo", result.Endpoint, result.CStat, result.XMotivo, result.Success, result.Error, cancellationToken);

            return FromSefazResult(result, "Consulta de recibo concluida.");
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> ConsultAccessKeyAsync(
        ConsultarChaveRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var consSitXml = xmlBuilder.BuildConsSitNfe(request.AccessKey, context.Certificate.Environment);
            var schemaErrors = schemaValidationService.Validate(consSitXml, "consSitNFe_v4.00.xsd");
            if (schemaErrors.Count > 0)
            {
                return Fail("XML de consulta por chave invalido contra schema XSD.", schemaErrors);
            }

            var result = await sefazSoapClient.ConsultAccessKeyAsync(
                context.Certificate.StateUf,
                context.Certificate.Environment,
                consSitXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, null, request.AccessKey, "consultar_chave", result.Endpoint, result.CStat, result.XMotivo, result.Success, result.Error, cancellationToken);

            return FromSefazResult(result, "Consulta por chave concluida.");
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> CancelAsync(
        CancelarNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);

            if (request.Justification.Trim().Length < 15)
            {
                return Fail("Informe uma justificativa de cancelamento com pelo menos 15 caracteres.");
            }

            var document = await repository.GetDocumentAsync(
                request.OrganizationId,
                request.ClientId,
                request.DocumentId,
                cancellationToken);

            if (document.AccessKey.Length != 44 || string.IsNullOrWhiteSpace(document.AuthorizedXml))
            {
                return Fail("A NF-e precisa estar autorizada e possuir XML autorizado antes do cancelamento.");
            }

            var protocol = ExtractFirst(document.AuthorizedXml, "nProt");
            if (string.IsNullOrWhiteSpace(protocol))
            {
                return Fail("Nao foi encontrado protocolo de autorizacao para cancelar a NF-e.");
            }

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var eventXml = BuildCancelEventXml(context, document.AccessKey, protocol, request.Justification);
            var eventId = $"ID110111{document.AccessKey}01";
            var signedEvent = signatureService.SignElement(eventXml, certificate, "infEvento", eventId);
            var schemaErrors = schemaValidationService.Validate(signedEvent.SignedXml, "envEventoCancNFe_v1.00.xsd");
            if (schemaErrors.Count > 0)
            {
                return Fail("XML de cancelamento invalido contra schema XSD.", schemaErrors, document.Id, document.AccessKey);
            }

            var result = await sefazSoapClient.SendEventAsync(
                context.Certificate.StateUf,
                context.Certificate.Environment,
                signedEvent.SignedXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, document.Id, document.AccessKey, "cancelar_nfe", result.Endpoint, result.CStat, result.XMotivo, result.Success, result.Error, cancellationToken);

            if (result.CStat is "135" or "136" or "155")
            {
                await repository.SaveOperationStatusAsync(document.Id, "Cancelada", result.CStat, result.XMotivo, cancellationToken);
            }

            return FromSefazResult(result, "Cancelamento processado.", document.Id, document.AccessKey);
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public async Task<NfeOperationResult> InutilizarAsync(
        InutilizarNfeRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            var context = await LoadContextAsync(
                request.OrganizationId,
                request.ClientId,
                request.CertificateId,
                authorizationHeader,
                cancellationToken);
            EnsureActiveCertificate(context.Certificate);

            if (request.NumeroInicial <= 0 || request.NumeroFinal < request.NumeroInicial)
            {
                return Fail("Intervalo de numeracao invalido para inutilizacao.");
            }

            if (request.Justification.Trim().Length < 15)
            {
                return Fail("Informe uma justificativa de inutilizacao com pelo menos 15 caracteres.");
            }

            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var inutXml = BuildInutilizationXml(context, request);
            var inutId = ExtractInfInutId(inutXml);
            var signed = signatureService.SignElement(inutXml, certificate, "infInut", inutId);
            var schemaErrors = schemaValidationService.Validate(signed.SignedXml, "inutNFe_v4.00.xsd");
            if (schemaErrors.Count > 0)
            {
                return Fail("XML de inutilizacao invalido contra schema XSD.", schemaErrors);
            }

            var result = await sefazSoapClient.InutilizeAsync(
                string.IsNullOrWhiteSpace(request.Uf) ? context.Certificate.StateUf : request.Uf,
                string.IsNullOrWhiteSpace(request.Ambiente) ? context.Certificate.Environment : request.Ambiente,
                signed.SignedXml,
                certificate,
                cancellationToken);
            await WriteLogAsync(context, null, "", "inutilizar_numeracao", result.Endpoint, result.CStat, result.XMotivo, result.Success, result.Error, cancellationToken);

            return FromSefazResult(result, "Inutilizacao processada.");
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    private async Task<FiscalGateResult> EnsureDocumentFiscalGateAsync(
        string organizationId,
        string clientId,
        string certificateId,
        string documentId,
        SupabaseNfeDocument document,
        string authorizationHeader,
        string operation,
        CancellationToken cancellationToken)
    {
        if (document.EmissionPayload is null)
        {
            var result = new NfeTaxPreviewResult
            {
                BlockingErrors =
                [
                    new FiscalBlockError
                    {
                        Action = "Regere a NF-e a partir do formulario para gravar o payload fiscal.",
                        Code = "NFE_PAYLOAD_MISSING",
                        Field = "emission_payload",
                        Message = "Documento sem payload fiscal salvo para revalidacao."
                    }
                ],
                Errors = ["Documento sem payload fiscal salvo para revalidacao."],
                Message = "Documento sem payload fiscal salvo para revalidacao.",
                Status = "Bloqueada",
                Success = false
            };

            return new FiscalGateResult(false, new EmitirNfeRequest
            {
                CertificateId = certificateId,
                ClientId = clientId,
                DocumentId = documentId,
                OrganizationId = organizationId,
                Nota = new NfePayload()
            }, result);
        }

        var gate = await RunFiscalGateAsync(
            new EmitirNfeRequest
            {
                CertificateId = certificateId,
                ClientId = clientId,
                DocumentId = documentId,
                OrganizationId = organizationId,
                Nota = document.EmissionPayload
            },
            authorizationHeader,
            operation,
            documentId,
            cancellationToken);
        await repository.SaveFiscalValidationAsync(documentId, gate.FiscalResult, cancellationToken);
        return gate;
    }

    private async Task<FiscalGateResult> RunFiscalGateAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        string operation,
        string documentId,
        CancellationToken cancellationToken)
    {
        var preview = await fiscalRuleEngine.PreviewAsync(
            new NfeTaxPreviewRequest
            {
                ClientId = request.ClientId,
                Destinatario = request.Nota.Destinatario,
                Direction = NormalizeDirection(request.Nota.TipoOperacao),
                Finalidade = request.Nota.Finalidade,
                Itens = request.Nota.Itens,
                OperationTypeCode = request.Nota.NaturezaOperacao,
                OrganizationId = request.OrganizationId
            },
            authorizationHeader,
            cancellationToken);

        if (!preview.Success)
        {
            await fiscalRuleEngine.SaveBlockAuditAsync(request, authorizationHeader, preview, operation, documentId, cancellationToken);
            return new FiscalGateResult(false, request, preview);
        }

        var calculatedItems = preview.Items
            .OrderBy(item => item.Index)
            .Select(item => item.CalculatedItem)
            .ToList();

        return new FiscalGateResult(
            true,
            request with { Nota = request.Nota with { Itens = calculatedItems } },
            preview);
    }

    private async Task<NfeContext> LoadContextAsync(
        string organizationId,
        string clientId,
        string certificateId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(organizationId) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(certificateId))
        {
            throw new InvalidOperationException("Informe organizacao, cliente e certificado.");
        }

        var userId = await repository.RequireUserAsync(authorizationHeader, cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var company = await repository.GetCompanyAsync(organizationId, clientId, cancellationToken);
        var certificate = await repository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);

        return new NfeContext(company, certificate);
    }

    private async Task WriteLogAsync(
        NfeContext context,
        string? documentId,
        string accessKey,
        string tipoEvento,
        string endpoint,
        string cstat,
        string xmotivo,
        bool sucesso,
        string erroTecnico,
        CancellationToken cancellationToken)
    {
        await logService.SaveAsync(
            context.Company.OrganizationId,
            context.Company.Id,
            documentId,
            accessKey,
            tipoEvento,
            context.Certificate.Environment,
            context.Certificate.StateUf,
            endpoint,
            cstat,
            xmotivo,
            sucesso,
            erroTecnico,
            Guid.NewGuid().ToString("N"),
            cancellationToken);
    }

    private static void EnsureActiveCertificate(SupabaseCertificate certificate)
    {
        if (!string.IsNullOrWhiteSpace(certificate.Status)
            && !certificate.Status.Equals("Ativo", StringComparison.OrdinalIgnoreCase)
            && !certificate.Status.Equals("ativo", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("O certificado precisa estar com status Ativo para transmitir na SEFAZ.");
        }
    }

    private static NfeOperationResult Ok(string status, string message, string accessKey, string documentId) => new()
    {
        AccessKey = accessKey,
        DocumentId = documentId,
        Message = message,
        Mode = "real",
        Status = status,
        Success = true
    };

    private static NfeOperationResult Fail(
        string message,
        IReadOnlyList<string>? errors = null,
        string documentId = "",
        string accessKey = "") => new()
    {
        AccessKey = accessKey,
        DocumentId = documentId,
        Errors = errors?.ToList() ?? [],
        Message = message,
        Mode = "real",
        Status = "Erro",
        Success = false
    };

    private static NfeOperationResult FiscalFail(
        NfeTaxPreviewResult fiscalResult,
        string documentId,
        string accessKey) => new()
    {
        AccessKey = accessKey,
        DocumentId = documentId,
        Errors = fiscalResult.Errors,
        FiscalErrors = fiscalResult.BlockingErrors,
        Message = fiscalResult.Message,
        Mode = "real",
        Status = "Bloqueada",
        Success = false
    };

    private static string NormalizeDirection(string value) =>
        value.Trim().Equals("entrada", StringComparison.OrdinalIgnoreCase)
            ? "entrada"
            : "saida";

    private static NfeOperationResult FromSefazResult(
        SefazSoapResult result,
        string fallbackMessage,
        string documentId = "",
        string accessKey = "") => new()
    {
        AccessKey = string.IsNullOrWhiteSpace(accessKey) ? result.AccessKey : accessKey,
        CStat = result.CStat,
        DocumentId = documentId,
        Message = string.IsNullOrWhiteSpace(result.XMotivo) ? fallbackMessage : result.XMotivo,
        Mode = "real",
        ProtocolNumber = result.ProtocolNumber,
        ReceiptNumber = result.ReceiptNumber,
        Status = MapStatus(result.CStat),
        Success = result.Success,
        XMotivo = result.XMotivo
    };

    private static string MapStatus(string cstat)
    {
        return cstat switch
        {
            "100" or "150" => "Autorizada",
            "101" or "135" or "136" or "155" => "Cancelada",
            "102" => "Consultada",
            "103" or "104" or "105" => "Pendente",
            _ => "Rejeitada"
        };
    }

    private static string LotId() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString().PadLeft(15, '0')[..15];

    private static string BuildAuthorizedXml(string signedXml, string responseXml)
    {
        var signedNfe = XElement.Parse(signedXml, LoadOptions.PreserveWhitespace);
        var protocol = FindElement(responseXml, "protNFe");
        if (protocol is null)
        {
            return signedXml;
        }

        return new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "procNFe",
                new XAttribute("versao", "4.00"),
                signedNfe,
                protocol))
            .ToString(SaveOptions.DisableFormatting);
    }

    private static XElement? FindElement(string xml, string localName)
    {
        foreach (var candidate in new[] { xml, DecodeXmlEntities(xml) })
        {
            try
            {
                return XDocument
                    .Parse(candidate, LoadOptions.PreserveWhitespace)
                    .Descendants()
                    .FirstOrDefault(element => element.Name.LocalName == localName);
            }
            catch
            {
                // Tenta a proxima forma do XML.
            }
        }

        return null;
    }

    private static string ExtractFirst(string xml, string localName) =>
        FindElement(xml, localName)?.Value?.Trim() ?? "";

    private static string DecodeXmlEntities(string value) =>
        value
            .Replace("&lt;", "<", StringComparison.Ordinal)
            .Replace("&gt;", ">", StringComparison.Ordinal)
            .Replace("&quot;", "\"", StringComparison.Ordinal)
            .Replace("&apos;", "'", StringComparison.Ordinal)
            .Replace("&amp;", "&", StringComparison.Ordinal);

    private static string BuildCancelEventXml(
        NfeContext context,
        string accessKey,
        string protocol,
        string justification)
    {
        var tpAmb = context.Certificate.Environment.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2";
        var now = DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:sszzz");
        var eventId = $"ID110111{accessKey}01";

        return new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "envEvento",
                new XAttribute("versao", "1.00"),
                new XElement(NfeNs + "idLote", LotId()),
                new XElement(
                    NfeNs + "evento",
                    new XAttribute("versao", "1.00"),
                    new XElement(
                        NfeNs + "infEvento",
                        new XAttribute("Id", eventId),
                        new XElement(NfeNs + "cOrgao", accessKey[..2]),
                        new XElement(NfeNs + "tpAmb", tpAmb),
                        new XElement(NfeNs + "CNPJ", NfeText.Digits(context.Company.Cnpj)),
                        new XElement(NfeNs + "chNFe", accessKey),
                        new XElement(NfeNs + "dhEvento", now),
                        new XElement(NfeNs + "tpEvento", "110111"),
                        new XElement(NfeNs + "nSeqEvento", "1"),
                        new XElement(NfeNs + "verEvento", "1.00"),
                        new XElement(
                            NfeNs + "detEvento",
                            new XAttribute("versao", "1.00"),
                            new XElement(NfeNs + "descEvento", "Cancelamento"),
                            new XElement(NfeNs + "nProt", protocol),
                            new XElement(NfeNs + "xJust", justification.Trim()))))))
            .ToString(SaveOptions.DisableFormatting);
    }

    private static string BuildInutilizationXml(NfeContext context, InutilizarNfeRequest request)
    {
        var uf = string.IsNullOrWhiteSpace(request.Uf) ? context.Certificate.StateUf : request.Uf;
        var ambiente = string.IsNullOrWhiteSpace(request.Ambiente) ? context.Certificate.Environment : request.Ambiente;
        var tpAmb = ambiente.Equals("producao", StringComparison.OrdinalIgnoreCase) ? "1" : "2";
        var cUf = UfCode(uf);
        var year = DateTimeOffset.Now.ToString("yy");
        var series = int.Parse(NfeText.Digits(request.Serie)).ToString();
        var start = request.NumeroInicial.ToString();
        var end = request.NumeroFinal.ToString();
        var id = $"ID{cUf}{year}{NfeText.Digits(context.Company.Cnpj)}55{series.PadLeft(3, '0')}{start.PadLeft(9, '0')}{end.PadLeft(9, '0')}";

        return new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(
                NfeNs + "inutNFe",
                new XAttribute("versao", "4.00"),
                new XElement(
                    NfeNs + "infInut",
                    new XAttribute("Id", id),
                    new XElement(NfeNs + "tpAmb", tpAmb),
                    new XElement(NfeNs + "xServ", "INUTILIZAR"),
                    new XElement(NfeNs + "cUF", cUf),
                    new XElement(NfeNs + "ano", year),
                    new XElement(NfeNs + "CNPJ", NfeText.Digits(context.Company.Cnpj)),
                    new XElement(NfeNs + "mod", "55"),
                    new XElement(NfeNs + "serie", series),
                    new XElement(NfeNs + "nNFIni", start),
                    new XElement(NfeNs + "nNFFin", end),
                    new XElement(NfeNs + "xJust", request.Justification.Trim()))))
            .ToString(SaveOptions.DisableFormatting);
    }

    private static string ExtractInfInutId(string xml)
    {
        var element = XDocument
            .Parse(xml)
            .Descendants()
            .FirstOrDefault(item => item.Name.LocalName == "infInut")
            ?? throw new InvalidOperationException("Tag infInut nao encontrada.");

        return element.Attribute("Id")?.Value
            ?? throw new InvalidOperationException("Id da inutilizacao nao encontrado.");
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
        _ => throw new InvalidOperationException($"UF invalida para inutilizacao: {uf}.")
    };

    private sealed record FiscalGateResult(
        bool Success,
        EmitirNfeRequest Request,
        NfeTaxPreviewResult FiscalResult);

    private sealed record NfeContext(SupabaseCompany Company, SupabaseCertificate Certificate);
}
