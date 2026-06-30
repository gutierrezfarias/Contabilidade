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
builder.Services.AddSingleton<ISecretProvider, EnvironmentSecretProvider>();
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
builder.Services.AddScoped<SupabaseAccountingRepository>();
builder.Services.AddScoped<SupabaseSerproRepository>();
builder.Services.AddScoped<ManualRevenueImportService>();
builder.Services.AddScoped<AccountingIntegrationService>();
builder.Services.AddScoped<ManualImportProvider>();
builder.Services.AddScoped<NetSpeedProvider>();
builder.Services.AddScoped<IAccountingIntegrationProvider>(provider => provider.GetRequiredService<ManualImportProvider>());
builder.Services.AddScoped<IAccountingIntegrationProvider>(provider => provider.GetRequiredService<NetSpeedProvider>());
builder.Services.AddScoped<AccountingProviderRegistry>();

var app = builder.Build();

app.UseCors();

app.Use(async (context, next) =>
{
    if (HttpMethods.IsPost(context.Request.Method)
        && context.Request.Path.Equals("/api/reference-data/ncm/import-file", StringComparison.OrdinalIgnoreCase)
        && string.IsNullOrWhiteSpace(context.Request.Headers.Authorization.ToString()))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }

    await next();
});

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
        if (result.Code == "DFE_SYNC_COOLDOWN")
        {
            return Results.Json(result, statusCode: StatusCodes.Status429TooManyRequests);
        }

        return result.Success ? Results.Ok(result) : Results.BadRequest(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (DfeSyncAlreadyRunningException error)
    {
        return Results.Conflict(new
        {
            success = false,
            ok = false,
            code = error.Code,
            error = error.Message,
            message = error.Message,
            recommendedAction = error.RecommendedAction
        });
    }
    catch (DfeSyncCooldownException error)
    {
        return Results.Json(new
        {
            success = false,
            ok = false,
            code = error.Code,
            statusCode = error.StatusCode,
            error = error.Message,
            message = error.Message,
            nextAllowedSyncAt = error.NextAllowedSyncAt,
            recommendedAction = error.RecommendedAction
        }, statusCode: StatusCodes.Status429TooManyRequests);
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
    catch (DfeDocumentPersistenceException error)
    {
        return Results.Conflict(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            accessKey = error.AccessKey,
            error = error.SafeMessage,
            message = error.SafeMessage,
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
    catch (DfeSyncCooldownException error)
    {
        return Results.Json(new
        {
            success = false,
            ok = false,
            code = error.Code,
            statusCode = error.StatusCode,
            error = error.Message,
            message = error.Message,
            nextAllowedSyncAt = error.NextAllowedSyncAt,
            recommendedAction = error.RecommendedAction
        }, statusCode: StatusCodes.Status429TooManyRequests);
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
    catch (DfeDocumentPersistenceException error)
    {
        return Results.Conflict(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            accessKey = error.AccessKey,
            error = error.SafeMessage,
            message = error.SafeMessage,
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
    catch (DfeSyncCooldownException error)
    {
        return Results.Json(new
        {
            success = false,
            ok = false,
            code = error.Code,
            statusCode = error.StatusCode,
            error = error.Message,
            message = error.Message,
            nextAllowedSyncAt = error.NextAllowedSyncAt,
            recommendedAction = error.RecommendedAction
        }, statusCode: StatusCodes.Status429TooManyRequests);
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
    catch (DfeDocumentPersistenceException error)
    {
        return Results.Conflict(new
        {
            success = false,
            ok = false,
            code = error.Code,
            step = error.Step,
            accessKey = error.AccessKey,
            error = error.SafeMessage,
            message = error.SafeMessage,
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
        await nfeRepository.EnsurePlatformAdminAsync(userId, cancellationToken);

        var result = await ncmService.SyncAsync(userId, cancellationToken);
        return result.Success ? Results.Ok(result) : Results.BadRequest(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (ForbiddenAccessException)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/reference-data/ncm/import-file", async (
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
        await nfeRepository.EnsurePlatformAdminAsync(userId, cancellationToken);

        if (!httpContext.Request.HasFormContentType)
        {
            var receivedContentType = httpContext.Request.ContentType ?? "";
            return Results.Json(
                new
                {
                    ok = false,
                    success = false,
                    code = "NCM_MULTIPART_REQUIRED",
                    detail = "Envie a planilha NCM em multipart/form-data.",
                    receivedContentType
                },
                statusCode: StatusCodes.Status415UnsupportedMediaType);
        }

        var form = await httpContext.Request.ReadFormAsync(cancellationToken);
        var result = await ncmService.ImportFileAsync(
            userId,
            form.Files.GetFile("file"),
            cancellationToken);

        return Results.Ok(result);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (ForbiddenAccessException)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }
    catch (NcmCatalogImportException error)
    {
        return Results.Json(
            new
            {
                ok = false,
                success = false,
                code = error.Code,
                detail = error.Detail,
                receivedContentType = error.ReceivedContentType
            },
            statusCode: error.StatusCode);
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapGet("/api/accounting-integrations", async (
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var integrations = await service.ListIntegrationsAsync(
            organizationId,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, integrations });
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

app.MapPost("/api/accounting-integrations", async (
    AccountingIntegrationInput input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var integration = await service.CreateIntegrationAsync(
            input,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, integration });
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

app.MapGet("/api/accounting-integrations/{id}", async (
    string id,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var integration = await service.GetIntegrationAsync(
            organizationId,
            id,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, integration });
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

app.MapPut("/api/accounting-integrations/{id}", async (
    string id,
    string organizationId,
    AccountingIntegrationInput input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var integration = await service.UpdateIntegrationAsync(
            organizationId,
            id,
            input,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, integration });
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

app.MapDelete("/api/accounting-integrations/{id}", async (
    string id,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        await service.DeleteIntegrationAsync(
            organizationId,
            id,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true });
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

app.MapPost("/api/accounting-integrations/{id}/test", async (
    string id,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.TestConnectionAsync(
            organizationId,
            id,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return result.Ok ? Results.Ok(result) : Results.BadRequest(result);
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

app.MapPost("/api/accounting-integrations/{id}/sync", async (
    string id,
    AccountingProviderSyncRequest input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.SyncAsync(
            input with { IntegrationId = id },
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return result.Ok ? Results.Ok(result) : Results.BadRequest(result);
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

app.MapGet("/api/accounting-integrations/{id}/sync-runs", async (
    string id,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var syncRuns = await service.ListSyncRunsAsync(
            organizationId,
            id,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, syncRuns });
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

app.MapGet("/api/accounting-integrations/{id}/clients", async (
    string id,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var clients = await service.ListLinkedClientsAsync(
            organizationId,
            id,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, clients });
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

app.MapPost("/api/accounting-integrations/{id}/clients/link", async (
    string id,
    AccountingIntegrationClientInput input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var client = await service.LinkClientAsync(
            id,
            input,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, client });
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

app.MapDelete("/api/accounting-integrations/{id}/clients/{linkId}", async (
    string id,
    string linkId,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        await service.UnlinkClientAsync(
            organizationId,
            id,
            linkId,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true });
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

app.MapPost("/api/accounting-imports/preview", async (
    AccountingImportPreviewRequest input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var preview = await service.PreviewImportAsync(
            input,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(preview);
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

app.MapPost("/api/accounting-imports/confirm", async (
    AccountingImportConfirmRequest input,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await service.ConfirmImportAsync(
            input,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return result.Ok ? Results.Ok(result) : Results.BadRequest(result);
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

app.MapGet("/api/accounting-imports/{batchId}/errors", async (
    string batchId,
    string organizationId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var errors = await service.ListImportErrorsAsync(
            organizationId,
            batchId,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, errors });
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

app.MapGet("/api/accounting/taxes", async (
    string organizationId,
    string? clientId,
    string? competence,
    string? status,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var records = await service.ListTaxRecordsAsync(
            organizationId,
            clientId,
            competence,
            status,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, records });
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

app.MapGet("/api/accounting/obligations", async (
    string organizationId,
    string? clientId,
    string? competence,
    string? status,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var records = await service.ListObligationsAsync(
            organizationId,
            clientId,
            competence,
            status,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, records });
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

app.MapGet("/api/accounting/{recordType}", async (
    string recordType,
    string organizationId,
    string? clientId,
    HttpContext httpContext,
    AccountingIntegrationService service,
    CancellationToken cancellationToken) =>
{
    try
    {
        var records = await service.ListGenericRecordsAsync(
            recordType,
            organizationId,
            clientId,
            httpContext.Request.Headers.Authorization.ToString(),
            cancellationToken);
        return Results.Ok(new { ok = true, records });
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

app.MapGet("/api/admin/serpro/status", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        var contract = await serproRepository.GetPlatformContractAsync(cancellationToken);
        var managedCredential = await serproRepository.GetManagedCredentialStatusAsync(cancellationToken);
        var catalog = await serproRepository.ListCatalogAsync(cancellationToken);
        var pricing = await serproRepository.ListPricingAsync(cancellationToken);
        var organizations = await serproRepository.ListOrganizationsAsync(cancellationToken);

        return Results.Ok(new
        {
            ok = true,
            contract,
            managedCredential,
            servicesCount = catalog.Count,
            pricingCount = pricing.Count,
            organizationsCount = organizations.Count
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

app.MapGet("/api/admin/serpro/contract", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        return Results.Ok(new
        {
            ok = true,
            contract = await serproRepository.GetPlatformContractAsync(cancellationToken),
            credential = await serproRepository.GetManagedCredentialStatusAsync(cancellationToken)
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

app.MapPut("/api/admin/serpro/contract", async (
    SerproContractInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        var contract = await serproRepository.UpsertPlatformContractAsync(input, userId, cancellationToken);
        return Results.Ok(new { ok = true, contract });
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

app.MapGet("/api/admin/serpro/catalog", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        return Results.Ok(new { ok = true, services = await serproRepository.ListCatalogAsync(cancellationToken) });
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

app.MapGet("/api/admin/serpro/pricing", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        return Results.Ok(new { ok = true, pricing = await serproRepository.ListPricingAsync(cancellationToken) });
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

app.MapGet("/api/admin/serpro/plans", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        return Results.Ok(new { ok = true, plans = await serproRepository.ListContractPlansAsync(true, cancellationToken) });
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

app.MapPut("/api/admin/serpro/plans/{planCode}", async (
    string planCode,
    SerproContractPlanInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        var plan = await serproRepository.UpsertContractPlanAsync(input with { Code = planCode }, userId, cancellationToken);
        return Results.Ok(new { ok = true, plan });
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

app.MapGet("/api/admin/serpro/organizations", async (
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await serproRepository.EnsurePlatformAdminAsync(userId, cancellationToken);
        return Results.Ok(new { ok = true, organizations = await serproRepository.ListOrganizationsAsync(cancellationToken) });
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

app.MapGet("/api/serpro/settings", async (
    string organizationId,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var settings = await serproRepository.GetOrganizationSettingsAsync(organizationId, cancellationToken);
        var managed = await serproRepository.GetManagedCredentialStatusAsync(cancellationToken);
        var direct = await serproRepository.GetDirectCredentialStatusAsync(organizationId, settings.Environment, cancellationToken);
        var localAgent = await serproRepository.GetLocalAgentAsync(organizationId, cancellationToken);
        var resolved = SerproDomainRules.ResolveMode(settings, managed, direct, localAgent);
        return Results.Ok(new
        {
            ok = true,
            settings,
            managedCredential = managed,
            directCredential = direct,
            wallet = await serproRepository.GetWalletAsync(organizationId, cancellationToken),
            walletTransactions = await serproRepository.ListWalletTransactionsAsync(organizationId, cancellationToken),
            plans = await serproRepository.ListContractPlansAsync(false, cancellationToken),
            localAgent,
            services = await serproRepository.ListCatalogAsync(cancellationToken),
            organizationServices = await serproRepository.ListOrganizationServicesAsync(organizationId, cancellationToken),
            authorizations = await serproRepository.ListAuthorizationsAsync(organizationId, cancellationToken),
            usage = await serproRepository.ListUsageAsync(organizationId, cancellationToken),
            requests = await serproRepository.ListRequestsAsync(organizationId, cancellationToken),
            auditLogs = await serproRepository.ListAuditLogsAsync(organizationId, cancellationToken),
            manualImports = await serproRepository.ListManualImportBatchesAsync(organizationId, cancellationToken),
            resolved
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

app.MapPost("/api/serpro/local-agent/pairing-key", async (
    SerproPairingKeyInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var settings = await serproRepository.GetOrganizationSettingsAsync(input.OrganizationId, cancellationToken);
        if (settings.PlanCode != "cont_hub_local_agent")
        {
            return Results.BadRequest(new { ok = false, error = "Selecione o plano Robo CONT HUB local antes de gerar a chave." });
        }

        return Results.Ok(await serproRepository.RenewLocalAgentPairingKeyAsync(input.OrganizationId, userId, cancellationToken));
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

app.MapPut("/api/serpro/settings", async (
    SerproOrganizationSettingsInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var settings = await serproRepository.UpsertOrganizationSettingsAsync(input, userId, cancellationToken);
        return Results.Ok(new { ok = true, settings });
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

app.MapPost("/api/serpro/direct-credentials", async (
    SerproDirectCredentialInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var credential = await serproRepository.UpsertDirectCredentialAsync(input, userId, cancellationToken);
        return Results.Ok(new { ok = true, credential });
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

app.MapPut("/api/serpro/services/{serviceId}", async (
    string serviceId,
    SerproServiceToggleInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var saved = await serproRepository.UpsertOrganizationServiceAsync(input with { ServiceId = serviceId }, userId, cancellationToken);
        return Results.Ok(new { ok = true, service = saved });
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

app.MapPost("/api/serpro/test", async (
    SerproOrganizationSettingsInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var result = await serproRepository.TestConfigurationAsync(input.OrganizationId, userId, cancellationToken);
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

app.MapGet("/api/serpro/wallet", async (
    string organizationId,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        return Results.Ok(new
        {
            ok = true,
            wallet = await serproRepository.GetWalletAsync(organizationId, cancellationToken),
            transactions = await serproRepository.ListWalletTransactionsAsync(organizationId, cancellationToken)
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

app.MapGet("/api/serpro/usage", async (
    string organizationId,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        return Results.Ok(new { ok = true, usage = await serproRepository.ListUsageAsync(organizationId, cancellationToken) });
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

app.MapGet("/api/revenue/status", async (
    string organizationId,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        var settings = await serproRepository.GetOrganizationSettingsAsync(organizationId, cancellationToken);
        var managed = await serproRepository.GetManagedCredentialStatusAsync(cancellationToken);
        var direct = await serproRepository.GetDirectCredentialStatusAsync(organizationId, settings.Environment, cancellationToken);
        var localAgent = await serproRepository.GetLocalAgentAsync(organizationId, cancellationToken);
        return Results.Ok(new { ok = true, status = SerproDomainRules.ResolveMode(settings, managed, direct, localAgent) });
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

app.MapGet("/api/revenue/catalog", async (
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        return Results.Ok(new { ok = true, services = await serproRepository.ListCatalogAsync(cancellationToken) });
    }
    catch (Exception error)
    {
        return Results.BadRequest(new { ok = false, error = error.Message });
    }
});

app.MapPost("/api/revenue/requests", async (
    SerproRevenueRequestInput input,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    SupabaseSerproRepository serproRepository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, input.OrganizationId, cancellationToken);
        var result = await serproRepository.CreateRevenueRequestAsync(input, userId, cancellationToken);
        return result.Ok ? Results.Ok(result) : Results.BadRequest(result);
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

app.MapPost("/api/revenue/manual-import/preview", async (
    ManualRevenueImportPreviewRequest request,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    ManualRevenueImportService importService,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, request.OrganizationId, cancellationToken);
        var result = await importService.PreviewAsync(request, cancellationToken);
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

app.MapPost("/api/revenue/manual-import/confirm", async (
    ManualRevenueImportConfirmRequest request,
    HttpContext httpContext,
    SupabaseNfeRepository authRepository,
    ManualRevenueImportService importService,
    CancellationToken cancellationToken) =>
{
    try
    {
        var userId = await authRepository.RequireUserAsync(httpContext.Request.Headers.Authorization.ToString(), cancellationToken);
        await authRepository.EnsureOrganizationAccessAsync(userId, request.OrganizationId, cancellationToken);
        var result = await importService.ConfirmAsync(request, userId, cancellationToken);
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

app.Run();
