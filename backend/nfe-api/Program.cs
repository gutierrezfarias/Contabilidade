using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins")
            .GetChildren()
            .Select(section => section.Value)
            .OfType<string>()
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .ToArray();

        if (origins.Length == 0)
        {
            origins = ["http://localhost:5173", "https://cont-hub.vercel.app"];
        }

        policy.WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddHttpClient();
builder.Services.AddSingleton<NfeEndpointResolver>();
builder.Services.AddScoped<CertificateService>();
builder.Services.AddScoped<DanfePdfService>();
builder.Services.AddScoped<DfeXmlProcessorService>();
builder.Services.AddScoped<FiscalRuleEngineService>();
builder.Services.AddScoped<NcmCatalogService>();
builder.Services.AddScoped<NfeAuthorizationService>();
builder.Services.AddScoped<NfeLogService>();
builder.Services.AddScoped<NfeReturnParserService>();
builder.Services.AddScoped<NfeSchemaValidationService>();
builder.Services.AddScoped<NfeSignatureService>();
builder.Services.AddScoped<NfeXmlBuilderService>();
builder.Services.AddScoped<SefazSoapClientService>();
builder.Services.AddScoped<SefazDfeDistributionService>();
builder.Services.AddScoped<SupabaseDfeRepository>();
builder.Services.AddScoped<SupabaseFiscalRepository>();
builder.Services.AddScoped<SupabaseNfeRepository>();

var app = builder.Build();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "CONT HUB NF-e API" }));

app.MapGet("/api/nfe/{id}", async (
    string id,
    string organizationId,
    string clientId,
    string certificateId,
    HttpContext httpContext,
    SupabaseNfeRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await repository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await repository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);
        var document = await repository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            document.Id,
            document.AccessKey,
            document.Status,
            hasGeneratedXml = !string.IsNullOrWhiteSpace(document.GeneratedXml),
            hasSignedXml = !string.IsNullOrWhiteSpace(document.SignedXml),
            hasAuthorizedXml = !string.IsNullOrWhiteSpace(document.AuthorizedXml),
            hasDanfe = !string.IsNullOrWhiteSpace(document.DanfePdfBase64),
            document.ReceiptNumber
        });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/nfe/{id}/status", async (
    string id,
    string organizationId,
    string clientId,
    string certificateId,
    HttpContext httpContext,
    SupabaseNfeRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await repository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await repository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);
        var document = await repository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            document.Id,
            document.AccessKey,
            document.Status,
            document.ReceiptNumber
        });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/nfe/{id}/xml", async (
    string id,
    string organizationId,
    string clientId,
    string certificateId,
    HttpContext httpContext,
    SupabaseNfeRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await repository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await repository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);
        var document = await repository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);
        var xml = string.IsNullOrWhiteSpace(document.AuthorizedXml)
            ? string.IsNullOrWhiteSpace(document.SignedXml) ? document.GeneratedXml : document.SignedXml
            : document.AuthorizedXml;

        return string.IsNullOrWhiteSpace(xml)
            ? Results.NotFound(new { ok = false, error = "XML ainda nao foi gerado para esta NF-e." })
            : Results.Text(xml, "application/xml");
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/nfe/{id}/danfe", async (
    string id,
    string organizationId,
    string clientId,
    string certificateId,
    HttpContext httpContext,
    SupabaseNfeRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await repository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await repository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);
        var document = await repository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);

        if (string.IsNullOrWhiteSpace(document.DanfePdfBase64))
        {
            return Results.NotFound(new { ok = false, error = "DANFE ainda nao foi gerado para esta NF-e." });
        }

        return Results.File(Convert.FromBase64String(document.DanfePdfBase64), "application/pdf", $"danfe-{document.AccessKey}.pdf");
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/sefaz/status", async (
    string organizationId,
    string clientId,
    string certificateId,
    string? uf,
    string? ambiente,
    HttpContext httpContext,
    SupabaseNfeRepository repository,
    CertificateService certificateService,
    SefazSoapClientService soapClient,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await repository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await repository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);

        var company = await repository.GetCompanyAsync(organizationId, clientId, cancellationToken);
        var certificateRow = await repository.GetCertificateAsync(
            organizationId,
            clientId,
            certificateId,
            cancellationToken);

        if (!certificateRow.Status.Equals("Ativo", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { ok = false, error = "Certificado selecionado nao esta ativo." });
        }

        var validation = certificateService.ValidateA1Certificate(certificateRow);
        if (!validation.IsValid)
        {
            return Results.BadRequest(new { ok = false, error = string.Join(" ", validation.Errors) });
        }

        using var certificate = certificateService.LoadA1Certificate(certificateRow);
        var statusUf = string.IsNullOrWhiteSpace(uf)
            ? certificateRow.StateUf
            : uf;
        var statusEnvironment = string.IsNullOrWhiteSpace(ambiente)
            ? certificateRow.Environment
            : ambiente;

        if (string.IsNullOrWhiteSpace(statusUf))
        {
            statusUf = company.State;
        }

        var result = await soapClient.CheckStatusAsync(
            statusUf,
            statusEnvironment,
            certificate,
            cancellationToken);
        return Results.Ok(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/reference-data/ncm/search", async (
    string? query,
    int? limit,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    NcmCatalogService ncmService,
    CancellationToken cancellationToken) =>
{
    try
    {
        await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);

        var result = await ncmService.SearchAsync(query ?? "", limit ?? 20, cancellationToken);
        return Results.Ok(new { ok = true, items = result });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/dfe/sync", async (
    DfeSyncRequest request,
    HttpContext httpContext,
    SefazDfeDistributionService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.SyncAsync(
            request,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return result.Success ? Results.Ok(result) : Results.BadRequest(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (DfeStorageUploadException error)
    {
        return Results.BadRequest(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            storageStatus = error.StorageStatusCode,
            error = error.SafeMessage,
            message = error.SafeMessage,
            logicalPath = error.LogicalPath,
            recommendedAction = error.RecommendedAction
        });
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { success = false, ok = false, error = error.Message });
    }
});

app.MapGet("/api/dfe/sync/status", async (
    string organizationId,
    string clientId,
    string certificateId,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await nfeRepository.GetCertificateAsync(organizationId, clientId, certificateId, cancellationToken);
        var state = await dfeRepository.GetLatestSyncStateAsync(organizationId, clientId, certificateId, cancellationToken);
        return Results.Ok(new { ok = true, state });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/dfe/documents", async (
    string organizationId,
    string clientId,
    string? direction,
    string? search,
    int? limit,
    int? offset,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await nfeRepository.GetCompanyAsync(organizationId, clientId, cancellationToken);
        var documents = await dfeRepository.ListDocumentsAsync(
            organizationId,
            clientId,
            direction,
            search,
            limit ?? 50,
            offset ?? 0,
            cancellationToken);
        return Results.Ok(new { ok = true, documents });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/dfe/documents/{id}", async (
    string id,
    string organizationId,
    string clientId,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var document = await dfeRepository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);
        return Results.Ok(new { ok = true, document });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/dfe/documents/{id}/xml", async (
    string id,
    string organizationId,
    string clientId,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var document = await dfeRepository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);
        var xml = await dfeRepository.ReadPrivateXmlAsync(document.XmlStoragePath, cancellationToken);
        return Results.Text(xml, "application/xml");
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/dfe/documents/{id}/events", async (
    string id,
    string organizationId,
    string clientId,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    SupabaseDfeRepository dfeRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        await dfeRepository.GetDocumentAsync(organizationId, clientId, id, cancellationToken);
        var events = await dfeRepository.ListEventsAsync(organizationId, clientId, id, cancellationToken);
        return Results.Ok(new { ok = true, events });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/dfe/query/nsu", async (
    DfeQueryNsuRequest request,
    HttpContext httpContext,
    SefazDfeDistributionService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.QueryNsuAsync(
            request,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (DfeStorageUploadException error)
    {
        return Results.BadRequest(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            storageStatus = error.StorageStatusCode,
            error = error.SafeMessage,
            message = error.SafeMessage,
            logicalPath = error.LogicalPath,
            recommendedAction = error.RecommendedAction
        });
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { success = false, ok = false, error = error.Message });
    }
});

app.MapPost("/api/dfe/query/access-key", async (
    DfeQueryAccessKeyRequest request,
    HttpContext httpContext,
    SefazDfeDistributionService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.QueryAccessKeyAsync(
            request,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (DfeStorageUploadException error)
    {
        return Results.BadRequest(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            storageStatus = error.StorageStatusCode,
            error = error.SafeMessage,
            message = error.SafeMessage,
            logicalPath = error.LogicalPath,
            recommendedAction = error.RecommendedAction
        });
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { success = false, ok = false, error = error.Message });
    }
});

app.MapPost("/api/dfe/documents/{id}/manifest", async (
    string id,
    DfeManifestRequest request,
    HttpContext httpContext,
    SefazDfeDistributionService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.ManifestAsync(
            request with { DocumentId = string.IsNullOrWhiteSpace(request.DocumentId) ? id : request.DocumentId },
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { success = false, ok = false, error = error.Message });
    }
});

app.MapGet("/api/reference-data/ncm/{code}", async (
    string code,
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    NcmCatalogService ncmService,
    CancellationToken cancellationToken) =>
{
    try
    {
        await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);

        var result = await ncmService.GetAsync(code, cancellationToken);
        return result is null
            ? Results.NotFound(new { ok = false, error = "NCM nao encontrado." })
            : Results.Ok(new { ok = true, item = result });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/reference-data/ncm/sync-status", async (
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    NcmCatalogService ncmService,
    CancellationToken cancellationToken) =>
{
    try
    {
        await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);

        var result = await ncmService.GetStatusAsync(cancellationToken);
        return Results.Ok(new { ok = true, status = result });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/reference-data/ncm/sync", async (
    HttpContext httpContext,
    SupabaseNfeRepository nfeRepository,
    NcmCatalogService ncmService,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await nfeRepository.RequireUserAsync(
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);

        var result = await ncmService.SyncAsync(userId, cancellationToken);
        return result.Success ? Results.Ok(result) : Results.BadRequest(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/nfe/tax-preview", async (
    NfeTaxPreviewRequest request,
    HttpContext httpContext,
    FiscalRuleEngineService fiscalRuleEngine,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await fiscalRuleEngine.PreviewAsync(
            request,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return result.Success ? Results.Ok(result) : Results.BadRequest(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/nfe/gerar-xml", async (
    EmitirNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.GenerateXmlOnlyAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/drafts", async (
    EmitirNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.SaveDraftAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/validate", async (
    EmitirNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.ValidateOnlyAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/generate-xml", async (
    EmitirNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.GenerateXmlOnlyAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/assinar-xml", async (
    AssinarXmlRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.SignExistingXmlAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/sign", async (
    AssinarXmlRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.SignExistingXmlAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/authorize", async (
    NfeDocumentRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.AuthorizeSignedXmlAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/emitir", async (
    EmitirNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.EmitAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/consultar-retorno", async (
    ConsultarRetornoRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.ConsultReceiptAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/consultar-chave", async (
    ConsultarChaveRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.ConsultAccessKeyAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/cancelar", async (
    CancelarNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.CancelAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/nfe/inutilizar", async (
    InutilizarNfeRequest request,
    HttpContext httpContext,
    NfeAuthorizationService authorizationService,
    CancellationToken cancellationToken) =>
{
    var result = await authorizationService.InutilizarAsync(
        request,
        httpContext.Request.Headers.Authorization.ToString(),
        cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.Run();
