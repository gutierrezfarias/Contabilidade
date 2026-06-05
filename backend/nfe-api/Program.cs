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
builder.Services.AddScoped<NfeAuthorizationService>();
builder.Services.AddScoped<NfeLogService>();
builder.Services.AddScoped<NfeReturnParserService>();
builder.Services.AddScoped<NfeSchemaValidationService>();
builder.Services.AddScoped<NfeSignatureService>();
builder.Services.AddScoped<NfeXmlBuilderService>();
builder.Services.AddScoped<SefazSoapClientService>();
builder.Services.AddScoped<SupabaseNfeRepository>();

var app = builder.Build();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "CONT HUB NF-e API" }));

app.MapGet("/api/sefaz/status", async (
    string uf,
    string ambiente,
    SefazSoapClientService soapClient,
    CancellationToken cancellationToken) =>
{
    var result = await soapClient.CheckStatusAsync(uf, ambiente, cancellationToken);
    return Results.Ok(result);
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
