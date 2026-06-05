using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SupabaseNfeRepository(IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _http = httpClientFactory.CreateClient();
    private readonly string _serviceKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY")
        ?? "";
    private readonly string _supabaseUrl = (Environment.GetEnvironmentVariable("SUPABASE_URL")
        ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL")
        ?? "").TrimEnd('/');

    public async Task<string> RequireUserAsync(string authorizationHeader, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var token = authorizationHeader.Replace("Bearer", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new UnauthorizedAccessException("Login obrigatorio para emitir NF-e.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{_supabaseUrl}/auth/v1/user");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("apikey", _serviceKey);

        using var response = await _http.SendAsync(request, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new UnauthorizedAccessException("Sessao invalida. Entre novamente.");
        }

        using var document = JsonDocument.Parse(json);
        return document.RootElement.GetProperty("id").GetString() ?? "";
    }

    public async Task EnsureOrganizationAccessAsync(string userId, string organizationId, CancellationToken cancellationToken)
    {
        var admin = await GetSingleAsync(
            $"user_roles?select=role&user_id=eq.{Uri.EscapeDataString(userId)}",
            cancellationToken);

        if (admin.TryGetProperty("role", out var role) && role.GetString() == "admin")
        {
            return;
        }

        var member = await GetSingleAsync(
            $"organization_members?select=organization_id&organization_id=eq.{Uri.EscapeDataString(organizationId)}&user_id=eq.{Uri.EscapeDataString(userId)}",
            cancellationToken);

        if (member.ValueKind == JsonValueKind.Undefined)
        {
            throw new UnauthorizedAccessException("Voce nao tem acesso a esta empresa.");
        }
    }

    public async Task<SupabaseCompany> GetCompanyAsync(string organizationId, string clientId, CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"clients?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&id=eq.{Uri.EscapeDataString(clientId)}",
            "Cliente/empresa nao encontrado para emissao.",
            cancellationToken);

        return new SupabaseCompany
        {
            Address = Get(row, "address"),
            AddressNumber = Get(row, "address_number"),
            Cep = Get(row, "cep"),
            City = Get(row, "city"),
            CityIbgeCode = Get(row, "city_ibge_code"),
            Cnpj = Get(row, "cnpj"),
            CompanyName = Get(row, "company_name"),
            Complement = Get(row, "address_complement"),
            Id = Get(row, "id"),
            MunicipalRegistration = Get(row, "municipal_registration"),
            Neighborhood = Get(row, "neighborhood"),
            OrganizationId = Get(row, "organization_id"),
            Phone = Get(row, "phone"),
            State = Get(row, "state"),
            StateRegistration = Get(row, "state_registration"),
            TaxRegime = Get(row, "tax_regime")
        };
    }

    public async Task<SupabaseCertificate> GetCertificateAsync(
        string organizationId,
        string clientId,
        string certificateId,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"digital_certificates?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&id=eq.{Uri.EscapeDataString(certificateId)}",
            "Certificado digital nao encontrado para este cliente.",
            cancellationToken);

        return new SupabaseCertificate
        {
            CertificateFileData = Get(row, "certificate_file_data"),
            CertificateFileName = Get(row, "certificate_file_name"),
            CertificatePassword = Get(row, "certificate_password"),
            ClientId = Get(row, "client_id"),
            Environment = Get(row, "environment", "homologacao"),
            HolderName = Get(row, "holder_name"),
            Id = Get(row, "id"),
            OrganizationId = Get(row, "organization_id"),
            StateUf = Get(row, "state_uf"),
            Status = Get(row, "status"),
            TaxId = Get(row, "tax_id"),
            ValidUntil = Get(row, "valid_until")
        };
    }

    public async Task<SupabaseNfeDocument> GetDocumentAsync(
        string organizationId,
        string clientId,
        string documentId,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"nfe_documents?select=*&organization_id=eq.{Uri.EscapeDataString(organizationId)}&client_id=eq.{Uri.EscapeDataString(clientId)}&id=eq.{Uri.EscapeDataString(documentId)}",
            "NF-e nao encontrada.",
            cancellationToken);

        return new SupabaseNfeDocument
        {
            AccessKey = Get(row, "access_key"),
            AuthorizedXml = Get(row, "authorized_xml"),
            CertificateId = Get(row, "certificate_id"),
            ClientId = Get(row, "client_id"),
            GeneratedXml = Get(row, "generated_xml"),
            Id = Get(row, "id"),
            OrganizationId = Get(row, "organization_id"),
            ReceiptNumber = Get(row, "receipt_number"),
            SignedXml = Get(row, "signed_xml"),
            Status = Get(row, "status")
        };
    }

    public async Task<string> UpsertDraftAsync(
        EmitirNfeRequest request,
        NfeBuildResult buildResult,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(request.DocumentId))
        {
            await PatchAsync(
                $"nfe_documents?id=eq.{Uri.EscapeDataString(request.DocumentId)}",
                new
                {
                    access_key = buildResult.AccessKey,
                    amount = buildResult.TotalAmount,
                    number = buildResult.Number,
                    series = buildResult.Series,
                    status = "Pendente",
                    document_direction = "emitida",
                    raw_summary = request.Nota,
                    updated_at = DateTimeOffset.UtcNow
                },
                cancellationToken);
            return request.DocumentId;
        }

        var inserted = await PostAsync(
            "nfe_documents",
            new
            {
                access_key = buildResult.AccessKey,
                amount = buildResult.TotalAmount,
                certificate_id = request.CertificateId,
                client_id = request.ClientId,
                document_direction = "emitida",
                document_model = "NFe",
                number = buildResult.Number,
                operation_type = request.Nota.NaturezaOperacao,
                organization_id = request.OrganizationId,
                raw_summary = request.Nota,
                series = buildResult.Series,
                status = "Pendente"
            },
            cancellationToken);

        return inserted[0].GetProperty("id").GetString() ?? "";
    }

    public async Task SaveGeneratedXmlAsync(string documentId, string accessKey, string xml, CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                access_key = accessKey,
                generated_xml = xml,
                last_consulted_at = DateTimeOffset.UtcNow,
                raw_xml = xml,
                status = "Pendente"
            },
            cancellationToken);
    }

    public async Task SaveSignedXmlAsync(string documentId, string signedXml, CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                raw_xml = signedXml,
                signed_xml = signedXml,
                status = "Pendente",
                updated_at = DateTimeOffset.UtcNow
            },
            cancellationToken);
    }

    public async Task SaveAuthorizationAsync(
        string documentId,
        SefazSoapResult result,
        string authorizedXml,
        string danfePdfBase64,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                authorized_xml = authorizedXml,
                danfe_pdf_data = danfePdfBase64,
                last_consulted_at = DateTimeOffset.UtcNow,
                last_xmotivo = result.XMotivo,
                protocol_number = result.ProtocolNumber,
                raw_xml = authorizedXml,
                receipt_number = result.ReceiptNumber,
                sefaz_status_code = result.CStat,
                status = result.CStat is "100" or "150" ? "Autorizada" : "Rejeitada",
                updated_at = DateTimeOffset.UtcNow
            },
            cancellationToken);
    }

    public async Task SaveOperationStatusAsync(
        string documentId,
        string status,
        string cstat,
        string xmotivo,
        CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                last_consulted_at = DateTimeOffset.UtcNow,
                last_xmotivo = xmotivo,
                sefaz_status_code = cstat,
                status,
                updated_at = DateTimeOffset.UtcNow
            },
            cancellationToken);
    }

    public async Task SaveReceiptAsync(string documentId, SefazSoapResult result, CancellationToken cancellationToken)
    {
        await PatchAsync(
            $"nfe_documents?id=eq.{Uri.EscapeDataString(documentId)}",
            new
            {
                last_consulted_at = DateTimeOffset.UtcNow,
                last_xmotivo = result.XMotivo,
                receipt_number = result.ReceiptNumber,
                sefaz_status_code = result.CStat,
                status = "Pendente",
                updated_at = DateTimeOffset.UtcNow
            },
            cancellationToken);
    }

    public async Task SaveLogAsync(
        string organizationId,
        string companyId,
        string? documentId,
        string accessKey,
        string tipoEvento,
        string ambiente,
        string uf,
        string endpoint,
        string cstat,
        string xmotivo,
        bool sucesso,
        string erroTecnico,
        CancellationToken cancellationToken)
    {
        await PostAsync(
            "nfe_sefaz_logs",
            new
            {
                ambiente,
                chave_acesso = accessKey,
                company_id = companyId,
                cstat,
                endpoint,
                erro_tecnico = erroTecnico,
                nota_id = documentId,
                organization_id = organizationId,
                sucesso,
                tipo_evento = tipoEvento,
                uf,
                xmotivo
            },
            cancellationToken,
            preferReturn: false);
    }

    private async Task<JsonElement> GetRequiredSingleAsync(string path, string fallback, CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(path, cancellationToken);
        if (row.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException(fallback);
        }

        return row;
    }

    private async Task<JsonElement> GetSingleAsync(string path, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Get, $"{path}&limit=1");
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a consulta: {response.StatusCode}.");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.ValueKind == JsonValueKind.Array && document.RootElement.GetArrayLength() > 0
            ? document.RootElement[0].Clone()
            : default;
    }

    private async Task<JsonElement> PostAsync(
        string path,
        object body,
        CancellationToken cancellationToken,
        bool preferReturn = true)
    {
        using var request = RestRequest(HttpMethod.Post, path);
        request.Headers.Add("Prefer", preferReturn ? "return=representation" : "return=minimal");
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou o salvamento: {response.StatusCode}.");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "[]" : content);
        return document.RootElement.Clone();
    }

    private async Task PatchAsync(string path, object body, CancellationToken cancellationToken)
    {
        using var request = RestRequest(HttpMethod.Patch, path);
        request.Headers.Add("Prefer", "return=minimal");
        request.Content = JsonBody(body);
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Supabase recusou a atualizacao: {response.StatusCode}.");
        }
    }

    private HttpRequestMessage RestRequest(HttpMethod method, string path)
    {
        EnsureConfigured();
        var separator = path.Contains('?') ? "&" : "?";
        var request = new HttpRequestMessage(method, $"{_supabaseUrl}/rest/v1/{path}{separator}select=*");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        return request;
    }

    private static StringContent JsonBody(object body) =>
        new(JsonSerializer.Serialize(body, NfeText.JsonOptions), Encoding.UTF8, "application/json");

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceKey))
        {
            throw new InvalidOperationException("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
        }
    }

    private static string Get(JsonElement row, string property, string fallback = "")
    {
        return row.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ToString() ?? fallback
            : fallback;
    }
}
