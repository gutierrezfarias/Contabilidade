using System.Diagnostics;
using System.Collections.Concurrent;
using System.Xml.Linq;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SefazDfeDistributionService(
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CertificateService certificateService,
    DfeXmlProcessorService xmlProcessor,
    SefazSoapClientService soapClient,
    NfeSignatureService signatureService,
    ILogger<SefazDfeDistributionService> logger)
{
    private static readonly XNamespace NfeNs = "http://www.portalfiscal.inf.br/nfe";
    private static readonly ConcurrentDictionary<string, DateTimeOffset> PointQueryCooldowns = new();
    private static readonly IReadOnlyDictionary<string, string> ManifestationDescriptions = new Dictionary<string, string>
    {
        ["210200"] = "Confirmacao da Operacao",
        ["210210"] = "Ciencia da Operacao",
        ["210220"] = "Desconhecimento da Operacao",
        ["210240"] = "Operacao nao Realizada"
    };

    public async Task<DfeOperationResult> SyncAsync(
        DfeSyncRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var syncRunId = NormalizeSyncRunId(request.SyncRunId);
        var context = await LoadContextAsync(
            request.OrganizationId,
            request.ClientId,
            request.CertificateId,
            authorizationHeader,
            cancellationToken);
        var state = await dfeRepository.GetOrCreateSyncStateAsync(
            context.Company,
            context.Certificate,
            request.ResetNsu,
            cancellationToken);
        var lockToken = Guid.NewGuid().ToString("N");
        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();
        var received = 0;
        var inserted = 0;
        var updated = 0;
        var ignored = 0;
        var ignoredExisting = 0;
        var completedExisting = 0;
        var sefazRequests = 0;
        var dbReads = 2;
        var dbWrites = 0;
        var storageUploads = 0;
        var currentNsu = state.LastNsu;
        var persistedNsu = currentNsu;
        var maxNsu = state.MaxNsu;
        var statusCode = "";
        var statusMessage = "";
        DateTimeOffset? nextAllowedSyncAt = null;

        logger.LogInformation(
            "DFE_SYNC_START syncRunId={SyncRunId} organizationId={OrganizationId} clientId={ClientId} certificateId={CertificateId} cnpj={Cnpj} environment={Environment} queryType={QueryType} startNsu={StartNsu} maxCycles={MaxCycles}",
            syncRunId,
            context.Company.OrganizationId,
            context.Company.Id,
            context.Certificate.Id,
            MaskCnpj(context.Cnpj),
            context.Environment,
            NormalizeQueryType(request.QueryType),
            currentNsu,
            DfeSyncPolicy.NormalizeMaxCycles(request.MaxCycles));

        await dfeRepository.AcquireLockAsync(state, lockToken, cancellationToken);
        dbWrites += 1;

        try
        {
            using var certificate = certificateService.LoadA1Certificate(context.Certificate);
            var cycles = DfeSyncPolicy.NormalizeMaxCycles(request.MaxCycles);
            for (var cycle = 0; cycle < cycles; cycle += 1)
            {
                var xml = xmlProcessor.BuildDistNsuXml(
                    context.Cnpj,
                    context.Uf,
                    context.Environment,
                    currentNsu);
                logger.LogInformation(
                    "DFE_SEFAZ_REQUEST syncRunId={SyncRunId} cycle={Cycle} maxCycles={MaxCycles} nsu={Nsu} environment={Environment} cnpj={Cnpj}",
                    syncRunId,
                    cycle + 1,
                    cycles,
                    currentNsu,
                    context.Environment,
                    MaskCnpj(context.Cnpj));
                sefazRequests += 1;
                var response = await soapClient.DistributeDfeAsync(
                    context.Environment,
                    xml,
                    certificate,
                    cancellationToken);
                var parsed = xmlProcessor.ParseDistributionResponse(
                    response.ResponseXml,
                    context.Company.OrganizationId,
                    context.Company.Id,
                    context.Certificate.Id,
                    context.Cnpj,
                    "recebida");
                statusCode = parsed.StatusCode;
                statusMessage = parsed.StatusMessage;
                logger.LogInformation(
                    "DFE_SEFAZ_RESPONSE syncRunId={SyncRunId} cycle={Cycle} cStat={StatusCode} ultNSU={LastNsu} maxNSU={MaxNsu} documents={Documents}",
                    syncRunId,
                    cycle + 1,
                    statusCode,
                    parsed.LastNsu,
                    parsed.MaxNsu,
                    parsed.Documents.Count);

                if (DfeSyncPolicy.KeepPreviousNsu(statusCode))
                {
                    nextAllowedSyncAt = DfeSyncPolicy.NextAllowedAfterResponse(
                        statusCode,
                        parsed.Documents.Count,
                        parsed.LastNsu,
                        parsed.MaxNsu,
                        DateTimeOffset.UtcNow);
                    maxNsu = DfeSyncPolicy.PreserveValidMaxNsu(state.MaxNsu, maxNsu);
                    await dfeRepository.ReleaseLockAsync(
                        state.Id,
                        "blocked",
                        statusCode,
                        statusMessage,
                        persistedNsu,
                        maxNsu,
                        nextAllowedSyncAt,
                        state.ConsecutiveErrors + 1,
                        cancellationToken);
                    dbWrites += 1;
                    await SaveLogAsync(context, startedAt, stopwatch, state.LastNsu, persistedNsu, maxNsu, received, inserted, updated, ignored, statusCode, statusMessage, "", syncRunId, request.QueryType, sefazRequests, dbReads, dbWrites, storageUploads, cancellationToken);
                    logger.LogWarning(
                        "DFE_SYNC_STOP syncRunId={SyncRunId} code={Code} cStat={StatusCode} sefazCalls={SefazCalls} dbReads={DbReads} dbWrites={DbWrites} storageUploads={StorageUploads} nextAllowedSyncAt={NextAllowedSyncAt}",
                        syncRunId,
                        "DFE_SYNC_COOLDOWN",
                        statusCode,
                        sefazRequests,
                        dbReads,
                        dbWrites,
                        storageUploads,
                        nextAllowedSyncAt);
                    return Result(
                        false,
                        $"Consulta temporariamente bloqueada: {statusCode} - {statusMessage}",
                        statusCode,
                        statusMessage,
                        persistedNsu,
                        maxNsu,
                        received,
                        inserted,
                        updated,
                        ignored,
                        [],
                        syncRunId,
                        "DFE_SYNC_COOLDOWN",
                        nextAllowedSyncAt,
                        ignoredExisting,
                        completedExisting,
                        sefazRequests,
                        dbReads,
                        dbWrites,
                        storageUploads);
                }

                var persisted = parsed.Documents.Count == 0
                    ? new DfePersistResult()
                    : await dfeRepository.SaveProcessedDocumentsAsync(parsed.Documents, cancellationToken);

                currentNsu = parsed.LastNsu;
                maxNsu = DfeSyncPolicy.PreserveValidMaxNsu(maxNsu, parsed.MaxNsu);
                received += parsed.Documents.Count;
                inserted += persisted.Inserted;
                updated += persisted.Updated;
                ignored += persisted.Ignored;
                ignoredExisting += persisted.IgnoredExisting;
                completedExisting += persisted.CompletedExisting;
                storageUploads += persisted.StorageUploads;
                dbReads += parsed.Documents.Count;
                dbWrites += persisted.Inserted + persisted.Updated + persisted.IgnoredExisting + persisted.CompletedExisting;
                persistedNsu = currentNsu;
                nextAllowedSyncAt = DfeSyncPolicy.NextAllowedAfterResponse(
                    statusCode,
                    parsed.Documents.Count,
                    currentNsu,
                    maxNsu,
                    DateTimeOffset.UtcNow);

                if (DfeSyncPolicy.MustStopAfterResponse(statusCode, parsed.Documents.Count, currentNsu, maxNsu))
                {
                    break;
                }
            }

            await dfeRepository.ReleaseLockAsync(
                state.Id,
                "success",
                statusCode,
                statusMessage,
                currentNsu,
                maxNsu,
                nextAllowedSyncAt,
                0,
                cancellationToken);
            dbWrites += 1;
            await SaveLogAsync(context, startedAt, stopwatch, state.LastNsu, currentNsu, maxNsu, received, inserted, updated, ignored, statusCode, statusMessage, "", syncRunId, request.QueryType, sefazRequests, dbReads, dbWrites, storageUploads, cancellationToken);
            logger.LogInformation(
                "DFE_SYNC_STOP syncRunId={SyncRunId} status=success cStat={StatusCode} sefazCalls={SefazCalls} dbReads={DbReads} dbWrites={DbWrites} storageUploads={StorageUploads} documentsNew={Inserted} documentsIgnored={Ignored} nextAllowedSyncAt={NextAllowedSyncAt}",
                syncRunId,
                statusCode,
                sefazRequests,
                dbReads,
                dbWrites,
                storageUploads,
                inserted,
                ignored + ignoredExisting,
                nextAllowedSyncAt);
            return Result(true, MessageFor(statusCode, received), statusCode, statusMessage, currentNsu, maxNsu, received, inserted, updated, ignored, [], syncRunId, "", nextAllowedSyncAt, ignoredExisting, completedExisting, sefazRequests, dbReads, dbWrites, storageUploads);
        }
        catch (Exception error)
        {
            await dfeRepository.ReleaseLockAsync(
                state.Id,
                "error",
                statusCode,
                statusMessage,
                persistedNsu,
                maxNsu,
                DateTimeOffset.UtcNow.Add(DfeSyncPolicy.CooldownAfterError),
                state.ConsecutiveErrors + 1,
                cancellationToken);
            dbWrites += 1;
            await SaveLogAsync(context, startedAt, stopwatch, state.LastNsu, persistedNsu, maxNsu, received, inserted, updated, ignored, statusCode, statusMessage, Sanitize(error.Message), syncRunId, request.QueryType, sefazRequests, dbReads, dbWrites, storageUploads, cancellationToken);
            logger.LogError(
                error,
                "DFE_SYNC_STOP syncRunId={SyncRunId} status=error cStat={StatusCode} sefazCalls={SefazCalls} dbReads={DbReads} dbWrites={DbWrites} storageUploads={StorageUploads}",
                syncRunId,
                statusCode,
                sefazRequests,
                dbReads,
                dbWrites,
                storageUploads);
            throw;
        }
    }

    public async Task<DfeOperationResult> QueryNsuAsync(
        DfeQueryNsuRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var context = await LoadContextAsync(
            request.OrganizationId,
            request.ClientId,
            request.CertificateId,
            authorizationHeader,
            cancellationToken);
        EnsurePointQueryAllowed(context, "consNSU");
        var nsu = NormalizeNsu(request.Nsu);

        using var certificate = certificateService.LoadA1Certificate(context.Certificate);
        var xml = xmlProcessor.BuildConsNsuXml(context.Cnpj, context.Uf, context.Environment, nsu);
        var response = await soapClient.DistributeDfeAsync(context.Environment, xml, certificate, cancellationToken);
        var parsed = xmlProcessor.ParseDistributionResponse(
            response.ResponseXml,
            context.Company.OrganizationId,
            context.Company.Id,
            context.Certificate.Id,
            context.Cnpj,
            "citada");
        var persisted = await dfeRepository.SaveProcessedDocumentsAsync(parsed.Documents, cancellationToken);

        return Result(
            true,
            MessageFor(parsed.StatusCode, parsed.Documents.Count),
            parsed.StatusCode,
            parsed.StatusMessage,
            parsed.LastNsu,
            parsed.MaxNsu,
            parsed.Documents.Count,
            persisted.Inserted,
            persisted.Updated,
            persisted.Ignored,
            persisted.Documents);
    }

    public async Task<DfeOperationResult> QueryAccessKeyAsync(
        DfeQueryAccessKeyRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var context = await LoadContextAsync(
            request.OrganizationId,
            request.ClientId,
            request.CertificateId,
            authorizationHeader,
            cancellationToken);
        EnsurePointQueryAllowed(context, "consChNFe");
        var accessKey = NfeText.Digits(request.AccessKey);
        if (accessKey.Length != 44)
        {
            throw new InvalidOperationException("A chave de acesso precisa ter 44 digitos.");
        }

        using var certificate = certificateService.LoadA1Certificate(context.Certificate);
        var xml = xmlProcessor.BuildConsAccessKeyXml(context.Cnpj, context.Uf, context.Environment, accessKey);
        var response = await soapClient.DistributeDfeAsync(context.Environment, xml, certificate, cancellationToken);
        var parsed = xmlProcessor.ParseDistributionResponse(
            response.ResponseXml,
            context.Company.OrganizationId,
            context.Company.Id,
            context.Certificate.Id,
            context.Cnpj,
            InferDirectionFromAccessKey(accessKey, context.Cnpj));
        var persisted = await dfeRepository.SaveProcessedDocumentsAsync(parsed.Documents, cancellationToken);

        return Result(
            true,
            MessageFor(parsed.StatusCode, parsed.Documents.Count),
            parsed.StatusCode,
            parsed.StatusMessage,
            parsed.LastNsu,
            parsed.MaxNsu,
            parsed.Documents.Count,
            persisted.Inserted,
            persisted.Updated,
            persisted.Ignored,
            persisted.Documents);
    }

    public async Task<DfeOperationResult> ManifestAsync(
        DfeManifestRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        if (!request.UserConfirmed)
        {
            throw new InvalidOperationException("Confirme explicitamente a manifestacao antes de enviar para a SEFAZ.");
        }

        if (!ManifestationDescriptions.ContainsKey(request.EventType))
        {
            throw new InvalidOperationException("Tipo de manifestacao invalido.");
        }

        if (request.EventType == "210240" && request.Justification.Trim().Length < 15)
        {
            throw new InvalidOperationException("Operacao nao realizada exige justificativa com pelo menos 15 caracteres.");
        }

        var context = await LoadContextAsync(
            request.OrganizationId,
            request.ClientId,
            request.CertificateId,
            authorizationHeader,
            cancellationToken);
        var document = await dfeRepository.GetDocumentAsync(
            request.OrganizationId,
            request.ClientId,
            request.DocumentId,
            cancellationToken);

        if (document.AccessKey.Length != 44)
        {
            throw new InvalidOperationException("Documento sem chave de acesso valida para manifestacao.");
        }

        using var certificate = certificateService.LoadA1Certificate(context.Certificate);
        var eventXml = BuildManifestationXml(document.AccessKey, context.Cnpj, context.Environment, request.EventType, request.Justification);
        var eventId = EventId(request.EventType, document.AccessKey, 1);
        var signed = signatureService.SignElement(eventXml, certificate, "infEvento", eventId);
        var response = await soapClient.SendEventAsync(context.Uf, context.Environment, signed.SignedXml, certificate, cancellationToken);

        if (!response.Success || response.CStat is not ("135" or "136" or "573"))
        {
            throw new InvalidOperationException($"Manifestacao rejeitada pela SEFAZ: {response.CStat} - {response.XMotivo}");
        }

        var requestHash = xmlProcessor.HashXml(signed.SignedXml);
        var responseHash = xmlProcessor.HashXml(response.ResponseXml);
        await dfeRepository.SaveEventAsync(new DfeEventWrite
        {
            AccessKey = document.AccessKey,
            ClientId = context.Company.Id,
            CreatedBy = context.UserId,
            DocumentId = document.Id,
            EventDate = DateTimeOffset.UtcNow,
            EventType = request.EventType,
            OrganizationId = context.Company.OrganizationId,
            ProtocolNumber = response.ProtocolNumber,
            RequestXmlHash = requestHash,
            ResponseXmlHash = responseHash,
            Sequence = 1,
            StatusCode = response.CStat,
            StatusMessage = response.XMotivo
        }, cancellationToken);
        await dfeRepository.UpdateDocumentManifestationAsync(
            document.Id,
            ManifestationStatus(request.EventType),
            response.CStat,
            cancellationToken);

        return Result(true, $"Manifestacao enviada: {response.CStat} - {response.XMotivo}", response.CStat, response.XMotivo, "", "", 1, 0, 1, 0);
    }

    private async Task<DfeContext> LoadContextAsync(
        string organizationId,
        string clientId,
        string certificateId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(organizationId)
            || string.IsNullOrWhiteSpace(clientId)
            || string.IsNullOrWhiteSpace(certificateId))
        {
            throw new InvalidOperationException("Informe organizacao, cliente e certificado.");
        }

        var userId = await nfeRepository.RequireUserAsync(authorizationHeader, cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var company = await nfeRepository.GetCompanyAsync(organizationId, clientId, cancellationToken);
        var certificate = await nfeRepository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);

        if (!certificate.Status.Equals("Ativo", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Certificado selecionado nao esta ativo.");
        }

        var validation = certificateService.ValidateA1Certificate(certificate);
        if (!validation.IsValid)
        {
            throw new InvalidOperationException(string.Join(" ", validation.Errors));
        }

        var companyCnpj = NfeText.Digits(company.Cnpj);
        var certificateCnpj = NfeText.Digits(certificate.TaxId);
        if (companyCnpj.Length != 14)
        {
            throw new InvalidOperationException("O cliente precisa ter CNPJ valido para consultar DF-e.");
        }

        if (certificateCnpj.Length == 14 && certificateCnpj != companyCnpj)
        {
            throw new InvalidOperationException("O CNPJ do certificado nao corresponde ao CNPJ do cliente selecionado.");
        }

        var uf = string.IsNullOrWhiteSpace(certificate.StateUf) ? company.State : certificate.StateUf;
        if (string.IsNullOrWhiteSpace(uf))
        {
            throw new InvalidOperationException("Informe a UF SEFAZ do certificado ou do cliente.");
        }

        return new DfeContext(company, certificate, companyCnpj, NormalizeEnvironment(certificate.Environment), uf, userId);
    }

    private async Task SaveLogAsync(
        DfeContext context,
        DateTimeOffset startedAt,
        Stopwatch stopwatch,
        string startNsu,
        string endNsu,
        string maxNsu,
        int received,
        int inserted,
        int updated,
        int ignored,
        string statusCode,
        string statusMessage,
        string error,
        string syncRunId,
        string queryType,
        int sefazRequests,
        int dbReads,
        int dbWrites,
        int storageUploads,
        CancellationToken cancellationToken)
    {
        stopwatch.Stop();
        var safeError = string.IsNullOrWhiteSpace(error)
            ? ""
            : Sanitize(error);
        var diagnostic = string.Join("; ", new[]
        {
            $"syncRunId={syncRunId}",
            $"queryType={NormalizeQueryType(queryType)}",
            $"sefazCalls={sefazRequests}",
            $"dbReads={dbReads}",
            $"dbWrites={dbWrites}",
            $"storageUploads={storageUploads}",
            safeError
        }.Where(value => !string.IsNullOrWhiteSpace(value)));
        await dfeRepository.SaveSyncLogAsync(
            context.Company.OrganizationId,
            context.Company.Id,
            context.Certificate.Id,
            context.Environment,
            startNsu,
            endNsu,
            maxNsu,
            received,
            inserted,
            updated,
            ignored,
            statusCode,
            statusMessage,
            (int)Math.Min(stopwatch.ElapsedMilliseconds, int.MaxValue),
            diagnostic,
            context.UserId,
            startedAt,
            cancellationToken);
    }

    private static string BuildManifestationXml(
        string accessKey,
        string cnpj,
        string environment,
        string eventType,
        string justification)
    {
        var tpAmb = NormalizeEnvironment(environment) == "producao" ? "1" : "2";
        var sequence = 1;
        var detail = new XElement(NfeNs + "detEvento",
            new XAttribute("versao", "1.00"),
            new XElement(NfeNs + "descEvento", ManifestationDescriptions[eventType]));

        if (eventType == "210240")
        {
            detail.Add(new XElement(NfeNs + "xJust", justification.Trim()));
        }

        return new XElement(NfeNs + "envEvento",
            new XAttribute("versao", "1.00"),
            new XElement(NfeNs + "idLote", "1"),
            new XElement(NfeNs + "evento",
                new XAttribute("versao", "1.00"),
                new XElement(NfeNs + "infEvento",
                    new XAttribute("Id", EventId(eventType, accessKey, sequence)),
                    new XElement(NfeNs + "cOrgao", "91"),
                    new XElement(NfeNs + "tpAmb", tpAmb),
                    new XElement(NfeNs + "CNPJ", cnpj),
                    new XElement(NfeNs + "chNFe", accessKey),
                    new XElement(NfeNs + "dhEvento", DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:sszzz")),
                    new XElement(NfeNs + "tpEvento", eventType),
                    new XElement(NfeNs + "nSeqEvento", sequence),
                    new XElement(NfeNs + "verEvento", "1.00"),
                    detail))).ToString(SaveOptions.DisableFormatting);
    }

    private static string EventId(string eventType, string accessKey, int sequence) =>
        $"ID{eventType}{accessKey}{sequence:00}";

    private static string MessageFor(string statusCode, int documents) => statusCode switch
    {
        "137" => "Consulta concluida: nenhum documento localizado.",
        "138" => $"{documents} documento(s) retornado(s) pela SEFAZ.",
        "656" => "Consumo indevido detectado pela SEFAZ. Sincronizacao temporariamente bloqueada.",
        _ => string.IsNullOrWhiteSpace(statusCode)
            ? "Consulta DF-e concluida."
            : $"SEFAZ retornou {statusCode}."
    };

    private static DfeOperationResult Result(
        bool success,
        string message,
        string statusCode,
        string statusMessage,
        string lastNsu,
        string maxNsu,
        int received,
        int inserted,
        int updated,
        int ignored,
        List<DfeDocument>? documents = null,
        string syncRunId = "",
        string code = "",
        DateTimeOffset? nextAllowedSyncAt = null,
        int ignoredExisting = 0,
        int completedExisting = 0,
        int sefazRequests = 0,
        int dbReads = 0,
        int dbWrites = 0,
        int storageUploads = 0) => new()
    {
        Code = code,
        Documents = documents ?? [],
        CompletedExistingCount = completedExisting,
        DatabaseReadCount = dbReads,
        DatabaseWriteCount = dbWrites,
        IgnoredCount = ignored,
        IgnoredExistingCount = ignoredExisting,
        InsertedCount = inserted,
        LastNsu = lastNsu,
        MaxNsu = maxNsu,
        Message = message,
        NextAllowedSyncAt = nextAllowedSyncAt,
        ReceivedCount = received,
        SefazRequestCount = sefazRequests,
        StatusCode = statusCode,
        StatusMessage = statusMessage,
        StorageUploadCount = storageUploads,
        SyncRunId = syncRunId,
        Success = success,
        UpdatedCount = updated
    };

    private static string InferDirectionFromAccessKey(string accessKey, string cnpj) =>
        accessKey.Length == 44 && accessKey.Substring(6, 14) == cnpj ? "emitida" : "citada";

    private static string NormalizeEnvironment(string value) =>
        value.Equals("producao", StringComparison.OrdinalIgnoreCase) || value == "1"
            ? "producao"
            : "homologacao";

    private static string NormalizeNsu(string value)
    {
        var digits = NfeText.Digits(value);
        return string.IsNullOrWhiteSpace(digits) ? "000000000000000" : digits.PadLeft(15, '0')[^15..];
    }

    private static string ManifestationStatus(string eventType) => eventType switch
    {
        "210200" => "Confirmada",
        "210210" => "Ciencia",
        "210220" => "Desconhecida",
        "210240" => "Nao realizada",
        _ => "Pendente"
    };

    private static string Sanitize(string value) =>
        value.Length > 500 ? $"{value[..500]}..." : value;

    private static string NormalizeQueryType(string value) =>
        value.Equals("complete", StringComparison.OrdinalIgnoreCase) ? "complete" : "summary";

    private static string NormalizeSyncRunId(string value)
    {
        var clean = new string((value ?? "").Where(char.IsLetterOrDigit).Take(64).ToArray());
        return string.IsNullOrWhiteSpace(clean) ? Guid.NewGuid().ToString("N") : clean;
    }

    private static string MaskCnpj(string cnpj)
    {
        var digits = NfeText.Digits(cnpj);
        return digits.Length == 14
            ? $"**.***.***/{digits[8..12]}-**"
            : "***";
    }

    private static void EnsurePointQueryAllowed(DfeContext context, string operation)
    {
        var key = $"{operation}:{context.Environment}:{context.Cnpj}";
        var now = DateTimeOffset.UtcNow;
        if (PointQueryCooldowns.TryGetValue(key, out var nextAllowed) && nextAllowed > now)
        {
            throw new DfeSyncCooldownException(
                nextAllowed,
                "",
                $"Consulta pontual {operation} em intervalo muito curto. Tente apos {nextAllowed:dd/MM/yyyy HH:mm}.");
        }

        PointQueryCooldowns[key] = now.AddMinutes(1);
    }

    private sealed record DfeContext(
        SupabaseCompany Company,
        SupabaseCertificate Certificate,
        string Cnpj,
        string Environment,
        string Uf,
        string UserId);
}
