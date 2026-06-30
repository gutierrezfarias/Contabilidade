using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class SupabaseSerproRepository(IHttpClientFactory httpClientFactory)
{
    private const string PlatformContractId = "00000000-0000-0000-0000-00000000f001";
    private readonly HttpClient _http = httpClientFactory.CreateClient();
    private readonly string _serviceKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY")
        ?? "";
    private readonly string _supabaseUrl = (Environment.GetEnvironmentVariable("SUPABASE_URL")
        ?? Environment.GetEnvironmentVariable("VITE_SUPABASE_URL")
        ?? "").TrimEnd('/');
    private readonly string _secretPepper = Environment.GetEnvironmentVariable("SERPRO_SECRET_PEPPER") ?? "";

    public async Task<JsonElement> GetPlatformContractAsync(CancellationToken cancellationToken)
    {
        return await GetRequiredSingleAsync(
            $"serpro_platform_contracts?select=*&id=eq.{PlatformContractId}",
            "Contrato Serpro da plataforma nao encontrado. Rode a migration Serpro.",
            cancellationToken);
    }

    public async Task EnsurePlatformAdminAsync(string userId, CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"user_roles?select=role&user_id=eq.{Escape(userId)}",
            cancellationToken);

        if (row.ValueKind == JsonValueKind.Undefined || Get(row, "role") != "admin")
        {
            throw new UnauthorizedAccessException("Acesso administrativo obrigatorio.");
        }
    }

    public async Task<JsonElement> UpsertPlatformContractAsync(
        SerproContractInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            name = Require(input.Name, "Informe o nome do contrato."),
            contract_cnpj = NormalizeDigits(input.ContractCnpj),
            environment = NormalizeEnvironment(input.Environment),
            status = NormalizeStatus(input.Status),
            allow_managed_mode = input.AllowManagedMode,
            notes = input.Notes ?? "",
            updated_by = EmptyToNull(userId)
        };

        var rows = await PatchAsync(
            $"serpro_platform_contracts?id=eq.{PlatformContractId}",
            payload,
            cancellationToken);

        if (!string.IsNullOrWhiteSpace(input.ConsumerKey)
            || !string.IsNullOrWhiteSpace(input.ConsumerSecret)
            || !string.IsNullOrWhiteSpace(input.ConsumerSecretReference)
            || !string.IsNullOrWhiteSpace(input.CertificateId))
        {
            var secretReference = SerproSecretProtector.ReferenceOrDefault(
                input.ConsumerSecretReference,
                "platform",
                payload.environment);

            await PostAsync(
                "serpro_platform_credentials?on_conflict=contract_id,environment",
                new
                {
                    certificate_id = EmptyToNull(input.CertificateId),
                    consumer_key = input.ConsumerKey ?? "",
                    consumer_secret_configured = !string.IsNullOrWhiteSpace(input.ConsumerSecret) || !string.IsNullOrWhiteSpace(input.ConsumerSecretReference),
                    consumer_secret_fingerprint = SerproSecretProtector.Fingerprint(input.ConsumerSecret ?? "", _secretPepper),
                    consumer_secret_reference = secretReference,
                    contract_id = PlatformContractId,
                    environment = payload.environment,
                    status = payload.status,
                    updated_by = EmptyToNull(userId)
                },
                cancellationToken,
                prefer: "resolution=merge-duplicates,return=representation");
        }

        await AuditAsync(null, null, userId, "serpro.platform_contract.updated", "serpro_platform_contracts", PlatformContractId, null, null, new { mode = "admin" }, cancellationToken);
        return rows[0];
    }

    public async Task<List<SerproServiceDto>> ListCatalogAsync(CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            "serpro_service_catalog?select=*&order=category.asc,name.asc",
            cancellationToken);

        return rows.Select(row => new SerproServiceDto(
            Get(row, "id"),
            Get(row, "name"),
            Get(row, "category"),
            Get(row, "description"),
            Get(row, "official_product"),
            GetBool(row, "requires_certificate"),
            GetBool(row, "requires_authorization"),
            GetBool(row, "supports_managed_mode"),
            GetBool(row, "supports_direct_mode"),
            Get(row, "status"),
            GetBool(row, "supports_local_agent"),
            GetBool(row, "supports_manual_import", true),
            GetBool(row, "consumes_credit", true))).ToList();
    }

    public async Task<List<SerproContractPlanDto>> ListContractPlansAsync(
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var activeFilter = includeInactive ? "" : "&active=eq.true";
        var rows = await GetArrayAsync(
            $"serpro_contract_plans?select=*{activeFilter}&order=display_order.asc,commercial_name.asc",
            cancellationToken);

        return rows.Select(MapContractPlan).ToList();
    }

    public async Task<SerproContractPlanDto> UpsertContractPlanAsync(
        SerproContractPlanInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var code = NormalizePlanCode(input.Code);
        var rows = await PostAsync(
            "serpro_contract_plans?on_conflict=code",
            new
            {
                active = input.Active,
                allowed_service_ids = input.AllowedServiceIds
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Select(value => value.Trim())
                    .Distinct(StringComparer.Ordinal)
                    .ToArray(),
                allows_fallback = input.AllowsFallback,
                allows_homologation = input.AllowsHomologation,
                allows_production = input.AllowsProduction,
                code,
                commercial_name = Require(input.CommercialName, "Informe o nome comercial do plano."),
                default_daily_limit = Math.Max(0, input.DefaultDailyLimit),
                description = input.Description ?? "",
                display_order = input.DisplayOrder,
                installer_url = input.InstallerUrl ?? "",
                monthly_price = Math.Max(0, input.MonthlyPrice),
                updated_by = EmptyToNull(userId)
            },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=representation");

        await AuditAsync(null, null, userId, "serpro.contract_plan.updated", "serpro_contract_plans", code, null, null, new
        {
            input.Active,
            input.AllowsFallback,
            input.AllowsHomologation,
            input.AllowsProduction,
            input.DefaultDailyLimit,
            input.DisplayOrder,
            input.MonthlyPrice
        }, cancellationToken);

        return MapContractPlan(rows[0]);
    }

    public async Task<List<SerproPricingDto>> ListPricingAsync(CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(
            "serpro_service_pricing?select=*&active=eq.true&order=service_id.asc",
            cancellationToken);

        return rows.Select(MapPricing).ToList();
    }

    public async Task<List<JsonElement>> ListOrganizationsAsync(CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            "organizations?select=id,name,cnpj,active,created_at&order=created_at.desc&limit=200",
            cancellationToken);
    }

    public async Task<SerproOrganizationSettingsDto> GetOrganizationSettingsAsync(
        string organizationId,
        CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"serpro_organization_settings?select=*&organization_id=eq.{Escape(organizationId)}",
            cancellationToken);

        return row.ValueKind == JsonValueKind.Undefined
            ? new SerproOrganizationSettingsDto(organizationId, "cont_hub_managed", "cont_hub_managed", "homologacao", "draft", false, false, false, 0, 0, "", "")
            : MapSettings(row);
    }

    public async Task<SerproOrganizationSettingsDto> UpsertOrganizationSettingsAsync(
        SerproOrganizationSettingsInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var planCode = NormalizePlanCode(input.PlanCode ?? PlanCodeFromAccessMode(input.AccessMode));
        var plan = await GetRequiredContractPlanAsync(planCode, cancellationToken);
        if (!plan.Active)
        {
            throw new InvalidOperationException("O plano selecionado esta inativo.");
        }

        var environment = NormalizeEnvironment(input.Environment);
        if (environment == "producao" && !plan.AllowsProduction)
        {
            throw new InvalidOperationException("O plano selecionado nao permite ambiente de producao.");
        }

        if (environment == "homologacao" && !plan.AllowsHomologation)
        {
            throw new InvalidOperationException("O plano selecionado nao permite ambiente de homologacao.");
        }

        var accessMode = AccessModeFromPlanCode(planCode);
        var billingMode = planCode == "serpro_direct" ? SerproDomainRules.DirectMode : SerproDomainRules.ManagedMode;
        var rows = await PostAsync(
            "serpro_organization_settings?on_conflict=organization_id",
            new
            {
                allow_managed_fallback = plan.AllowsFallback && input.AllowManagedFallback,
                access_mode = accessMode,
                billing_mode = billingMode,
                daily_request_limit = input.DailyRequestLimit > 0 ? input.DailyRequestLimit : plan.DefaultDailyLimit,
                direct_mode_enabled = planCode == "serpro_direct",
                environment,
                managed_mode_enabled = planCode == "cont_hub_full",
                monthly_credit_limit = Math.Max(0, input.MonthlyCreditLimit),
                notes = input.Notes ?? "",
                notification_email = input.NotificationEmail ?? "",
                organization_id = Require(input.OrganizationId, "Organizacao obrigatoria."),
                plan_code = planCode,
                status = NormalizeStatus(input.Status),
                updated_by = EmptyToNull(userId)
            },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=representation");

        await EnsureWalletAsync(input.OrganizationId, cancellationToken);
        await AuditAsync(input.OrganizationId, null, userId, "serpro.organization_settings.updated", "serpro_organization_settings", input.OrganizationId, billingMode, null, new { environment, planCode }, cancellationToken);
        return MapSettings(rows[0]);
    }

    public async Task<SerproCredentialStatusDto> GetManagedCredentialStatusAsync(CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"serpro_platform_credentials?select=*&contract_id=eq.{PlatformContractId}&order=updated_at.desc&limit=1",
            cancellationToken);

        return row.ValueKind == JsonValueKind.Undefined
            ? new SerproCredentialStatusDto("cont_hub", "homologacao", "draft", false, false, "", false, "", "")
            : MapCredential("cont_hub", row);
    }

    public async Task<SerproCredentialStatusDto> GetDirectCredentialStatusAsync(
        string organizationId,
        string environment,
        CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"serpro_organization_credentials?select=*&organization_id=eq.{Escape(organizationId)}&environment=eq.{Escape(NormalizeEnvironment(environment))}",
            cancellationToken);

        return row.ValueKind == JsonValueKind.Undefined
            ? new SerproCredentialStatusDto("contador", NormalizeEnvironment(environment), "draft", false, false, "", false, "", "")
            : MapCredential("contador", row);
    }

    public async Task<SerproCredentialStatusDto> UpsertDirectCredentialAsync(
        SerproDirectCredentialInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var environment = NormalizeEnvironment(input.Environment);
        var rows = await PostAsync(
            "serpro_organization_credentials?on_conflict=organization_id,environment",
            new
            {
                certificate_id = EmptyToNull(input.CertificateId),
                consumer_key = input.ConsumerKey ?? "",
                consumer_secret_configured = !string.IsNullOrWhiteSpace(input.ConsumerSecret) || !string.IsNullOrWhiteSpace(input.ConsumerSecretReference),
                consumer_secret_fingerprint = SerproSecretProtector.Fingerprint(input.ConsumerSecret ?? "", _secretPepper),
                consumer_secret_reference = SerproSecretProtector.ReferenceOrDefault(input.ConsumerSecretReference, input.OrganizationId, environment),
                contract_cnpj = NormalizeDigits(input.ContractCnpj),
                environment,
                organization_id = Require(input.OrganizationId, "Organizacao obrigatoria."),
                status = NormalizeStatus(input.Status),
                updated_by = EmptyToNull(userId)
            },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=representation");

        await AuditAsync(input.OrganizationId, null, userId, "serpro.direct_credential.updated", "serpro_organization_credentials", Get(rows[0], "id"), "direct_serpro", null, new { environment }, cancellationToken);
        return MapCredential("contador", rows[0]);
    }

    public async Task<SerproWalletDto> GetWalletAsync(string organizationId, CancellationToken cancellationToken)
    {
        await EnsureWalletAsync(organizationId, cancellationToken);
        var row = await GetRequiredSingleAsync(
            $"serpro_wallets?select=*&organization_id=eq.{Escape(organizationId)}",
            "Carteira Serpro nao encontrada.",
            cancellationToken);

        return new SerproWalletDto(
            Get(row, "organization_id"),
            GetDecimal(row, "balance"),
            GetDecimal(row, "reserved_balance"),
            Get(row, "currency", "BRL"),
            GetBool(row, "auto_recharge_enabled"),
            GetDecimal(row, "auto_recharge_threshold"),
            GetDecimal(row, "auto_recharge_amount"),
            Get(row, "status", "active"));
    }

    public async Task<List<JsonElement>> ListWalletTransactionsAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_wallet_transactions?select=*&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=100",
            cancellationToken);
    }

    public async Task<JsonElement> UpsertOrganizationServiceAsync(
        SerproServiceToggleInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var settings = await GetOrganizationSettingsAsync(input.OrganizationId, cancellationToken);
        var plan = await GetRequiredContractPlanAsync(settings.PlanCode, cancellationToken);
        var service = (await ListCatalogAsync(cancellationToken)).FirstOrDefault(item => item.Id == input.ServiceId)
            ?? throw new InvalidOperationException("Servico Receita Federal nao encontrado.");

        if (input.Enabled && !ServiceIsCompatible(service, plan, settings.AccessMode))
        {
            throw new InvalidOperationException("Este servico nao esta disponivel no plano atual.");
        }

        var rows = await PostAsync(
            "serpro_organization_services?on_conflict=organization_id,service_id",
            new
            {
                billing_mode_override = string.IsNullOrWhiteSpace(input.BillingModeOverride) ? null : NormalizeBillingMode(input.BillingModeOverride),
                custom_sale_price = input.CustomSalePrice,
                enabled = input.Enabled,
                exempt = input.Exempt,
                monthly_limit = Math.Max(0, input.MonthlyLimit),
                organization_id = Require(input.OrganizationId, "Organizacao obrigatoria."),
                service_id = Require(input.ServiceId, "Servico obrigatorio."),
                updated_by = EmptyToNull(userId)
            },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=representation");

        await AuditAsync(input.OrganizationId, null, userId, "serpro.organization_service.updated", "serpro_organization_services", input.ServiceId, input.BillingModeOverride, input.ServiceId, new { input.Enabled, input.Exempt }, cancellationToken);
        return rows[0];
    }

    public async Task<SerproLocalAgentDto> GetLocalAgentAsync(
        string organizationId,
        CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"serpro_local_agents?select=*&organization_id=eq.{Escape(organizationId)}",
            cancellationToken);

        return row.ValueKind == JsonValueKind.Undefined
            ? new SerproLocalAgentDto(organizationId, "disconnected", "", null, null, "", null, null, "")
            : MapLocalAgent(row);
    }

    public async Task<SerproPairingKeyResult> RenewLocalAgentPairingKeyAsync(
        string organizationId,
        string userId,
        CancellationToken cancellationToken)
    {
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var pairingKey = $"cont-hub-agent-{rawToken}";
        var prefix = pairingKey[..Math.Min(23, pairingKey.Length)];
        var expiresAt = DateTimeOffset.UtcNow.AddHours(24);

        await PostAsync(
            "serpro_local_agents?on_conflict=organization_id",
            new
            {
                organization_id = Require(organizationId, "Organizacao obrigatoria."),
                pairing_key_created_at = DateTimeOffset.UtcNow,
                pairing_key_expires_at = expiresAt,
                pairing_key_hash = SerproSecretProtector.Fingerprint(pairingKey, _secretPepper),
                pairing_key_prefix = prefix,
                status = "pairing_pending",
                updated_by = EmptyToNull(userId)
            },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=minimal");

        await AuditAsync(organizationId, null, userId, "serpro.local_agent.pairing_key_renewed", "serpro_local_agents", organizationId, null, null, new
        {
            expiresAt,
            prefix
        }, cancellationToken);

        return new SerproPairingKeyResult(
            true,
            pairingKey,
            prefix,
            expiresAt.ToString("O"),
            "Chave gerada. Ela sera exibida somente agora e expira em 24 horas.");
    }

    public async Task<List<JsonElement>> ListOrganizationServicesAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_organization_services?select=*&organization_id=eq.{Escape(organizationId)}&order=service_id.asc",
            cancellationToken);
    }

    public async Task<List<JsonElement>> ListAuthorizationsAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_client_authorizations?select=*,clients(company_name,cnpj)&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=100",
            cancellationToken);
    }

    public async Task<List<JsonElement>> ListUsageAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_usage_records?select=*&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=100",
            cancellationToken);
    }

    public async Task<List<JsonElement>> ListRequestsAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_requests?select=id,organization_id,client_id,service_id,billing_mode,environment,status,cost_amount,sale_amount,cnpj,http_status,provider_status,provider_message,correlation_id,created_by,created_at,clients(company_name,cnpj)&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=100",
            cancellationToken);
    }

    public async Task<List<JsonElement>> ListAuditLogsAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"serpro_audit_logs?select=id,organization_id,client_id,actor_user_id,event_type,entity_type,entity_id,billing_mode,service_id,metadata,created_at&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=100",
            cancellationToken);
    }

    public async Task<List<JsonElement>> ListManualImportBatchesAsync(string organizationId, CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"manual_revenue_import_batches?select=id,status,provider,source,original_file_count,extracted_file_count,duplicate_count,error_count,imported_count,ignored_count,created_by,confirmed_by,confirmed_at,created_at&organization_id=eq.{Escape(organizationId)}&order=created_at.desc&limit=50",
            cancellationToken);
    }

    public async Task<SerproRevenueRequestResult> CreateRevenueRequestAsync(
        SerproRevenueRequestInput input,
        string userId,
        CancellationToken cancellationToken)
    {
        var settings = await GetOrganizationSettingsAsync(input.OrganizationId, cancellationToken);
        var managed = await GetManagedCredentialStatusAsync(cancellationToken);
        var direct = await GetDirectCredentialStatusAsync(input.OrganizationId, settings.Environment, cancellationToken);
        var localAgent = await GetLocalAgentAsync(input.OrganizationId, cancellationToken);
        var resolved = SerproDomainRules.ResolveMode(settings, managed, direct, localAgent);
        var price = await GetPricingAsync(input.ServiceId, settings.Environment, cancellationToken);
        var wallet = await GetWalletAsync(input.OrganizationId, cancellationToken);
        var payloadHash = SerproDomainRules.HashText(input.Payload.GetRawText());
        var competence = string.IsNullOrWhiteSpace(input.Competence)
            ? GetPayloadText(input.Payload, "competence", "competencia", "periodo")
            : input.Competence.Trim();
        var idempotencyKey = string.IsNullOrWhiteSpace(input.IdempotencyKey)
            ? SerproDomainRules.BuildRevenueRequestIdempotencyKey(input.OrganizationId, input.ClientId, input.ServiceId, competence, settings.Environment, payloadHash)
            : input.IdempotencyKey.Trim();
        var existing = await FindRevenueRequestByIdempotencyAsync(input.OrganizationId, idempotencyKey, payloadHash, cancellationToken);
        if (existing.ValueKind != JsonValueKind.Undefined)
        {
            return ExistingRevenueRequestResult(existing, "Operacao ja registrada; retornando solicitacao existente para evitar duplicidade.");
        }

        var saleAmount = SerproDomainRules.ResolveSaleAmount(price, null, false);
        var providerCost = resolved.BillingMode == SerproDomainRules.ManagedMode ? price.ProviderCost : 0;
        var margin = resolved.BillingMode == SerproDomainRules.ManagedMode ? saleAmount - providerCost : 0;
        var status = resolved.CredentialsReady ? "blocked" : "blocked";
        var message = resolved.CredentialsReady
            ? "Servico real Serpro ainda nao habilitado neste backend. Configure o provider oficial antes de executar chamadas reais."
            : resolved.BlockReason;

        if (resolved.CredentialsReady
            && resolved.WalletRequired
            && !SerproDomainRules.HasEnoughWalletBalance(wallet, saleAmount))
        {
            message = "Saldo insuficiente na carteira Serpro do escritorio.";
        }

        var rows = await PostAsync(
            "serpro_requests",
            new
            {
                authorization_id = EmptyToNull(input.AuthorizationId),
                billing_mode = resolved.BillingMode,
                certificate_id = EmptyToNull(input.CertificateId),
                client_id = EmptyToNull(input.ClientId),
                cnpj = NormalizeDigits(input.Cnpj ?? ""),
                cost_amount = providerCost,
                endpoint = "pending-official-serpro-provider",
                environment = settings.Environment,
                idempotency_key = idempotencyKey,
                margin_amount = margin,
                method = "POST",
                organization_id = input.OrganizationId,
                provider_message = message,
                provider_status = "not_executed",
                request_payload_hash = payloadHash,
                sale_amount = saleAmount,
                service_id = input.ServiceId,
                status,
                correlation_id = string.IsNullOrWhiteSpace(input.CorrelationId) ? Guid.NewGuid().ToString("N") : input.CorrelationId.Trim(),
                created_by = EmptyToNull(userId)
            },
            cancellationToken);

        var requestId = Get(rows[0], "id");
        await AuditAsync(input.OrganizationId, input.ClientId, userId, "serpro.revenue_request.blocked", "serpro_requests", requestId, resolved.BillingMode, input.ServiceId, new { message }, cancellationToken);

        return new SerproRevenueRequestResult(false, status, message, requestId, resolved.BillingMode, saleAmount, providerCost, margin);
    }

    public async Task<SerproRevenueRequestResult> TestConfigurationAsync(
        string organizationId,
        string userId,
        CancellationToken cancellationToken)
    {
        var settings = await GetOrganizationSettingsAsync(organizationId, cancellationToken);
        var managed = await GetManagedCredentialStatusAsync(cancellationToken);
        var direct = await GetDirectCredentialStatusAsync(organizationId, settings.Environment, cancellationToken);
        var localAgent = await GetLocalAgentAsync(organizationId, cancellationToken);
        var resolved = SerproDomainRules.ResolveMode(settings, managed, direct, localAgent);
        var message = resolved.CredentialsReady
            ? "Configuracao local pronta. A autenticacao real depende do provider oficial Serpro habilitado no backend."
            : resolved.BlockReason;

        await AuditAsync(organizationId, null, userId, "serpro.configuration.tested", "serpro_organization_settings", organizationId, resolved.BillingMode, null, new { message }, cancellationToken);

        return new SerproRevenueRequestResult(resolved.CredentialsReady, resolved.CredentialsReady ? "ready" : "blocked", message, null, resolved.BillingMode, 0, 0, 0);
    }

    public async Task<List<JsonElement>> ListClientsForManualRevenueImportAsync(
        string organizationId,
        CancellationToken cancellationToken)
    {
        return await GetArrayAsync(
            $"clients?select=id,company_name,cnpj,email&organization_id=eq.{Escape(organizationId)}&active=eq.true&order=company_name.asc",
            cancellationToken);
    }

    public async Task<JsonElement> FindManualRevenueDuplicateAsync(
        string organizationId,
        string fileHash,
        string externalId,
        string logicalKey,
        CancellationToken cancellationToken)
    {
        var filters = new List<string>();
        if (!string.IsNullOrWhiteSpace(fileHash))
        {
            filters.Add($"file_hash.eq.{Escape(fileHash)}");
            filters.Add($"document_hash.eq.{Escape(fileHash)}");
        }

        if (!string.IsNullOrWhiteSpace(externalId))
        {
            filters.Add($"external_id.eq.{Escape(externalId)}");
        }

        if (!string.IsNullOrWhiteSpace(logicalKey))
        {
            filters.Add($"logical_key.eq.{Escape(logicalKey)}");
        }

        if (filters.Count == 0)
        {
            return default;
        }

        return await GetSingleAsync(
            $"serpro_documents?select=id,file_hash,document_hash,external_id,logical_key,original_file_name&organization_id=eq.{Escape(organizationId)}&or=({string.Join(",", filters)})&limit=1",
            cancellationToken);
    }

    public async Task<string> CreateManualRevenueBatchAsync(
        string organizationId,
        string userId,
        int originalFileCount,
        int extractedFileCount,
        int duplicateCount,
        int errorCount,
        int ignoredCount,
        CancellationToken cancellationToken)
    {
        var rows = await PostAsync(
            "manual_revenue_import_batches",
            new
            {
                access_mode = "manual_free",
                created_by = EmptyToNull(userId),
                duplicate_count = duplicateCount,
                error_count = errorCount,
                extracted_file_count = extractedFileCount,
                ignored_count = ignoredCount,
                imported_count = 0,
                organization_id = organizationId,
                original_file_count = originalFileCount,
                provider = "manual_ecac",
                source = "ecac_manual_download",
                status = "confirmed"
            },
            cancellationToken);

        return Get(rows[0], "id");
    }

    public async Task<string> InsertManualRevenueDocumentAsync(
        string organizationId,
        string? clientId,
        string batchId,
        ManualRevenueImportConfirmItem item,
        string safeFileName,
        long fileSize,
        string storagePath,
        string userId,
        CancellationToken cancellationToken)
    {
        var externalId = BuildManualExternalId(item);
        var logicalKey = ManualRevenueImportRules.BuildLogicalKey(
            organizationId,
            clientId,
            "manual_ecac",
            item.DocumentType,
            item.Competency,
            item.DueDate,
            item.Amount,
            externalId,
            item.TaxId);
        var rows = await PostAsync(
            "serpro_documents",
            new
            {
                access_mode = "manual_free",
                amount = item.Amount,
                certificate_valid_until = EmptyToNull(item.CertificateValidUntil),
                client_id = EmptyToNull(clientId),
                company_name = item.CompanyName ?? "",
                competency = item.Competency ?? "",
                document_hash = item.FileHash,
                document_key = item.FileHash,
                document_status = item.DocumentStatus ?? "",
                document_type = NormalizeDocumentType(item.DocumentType),
                due_date = EmptyToNull(item.DueDate),
                external_id = externalId,
                file_hash = item.FileHash,
                file_name = safeFileName,
                import_batch_id = batchId,
                issued_at = EmptyToNull(item.IssuedAt),
                logical_key = logicalKey,
                metadata = new
                {
                    item.ServiceName,
                    item.PeriodLabel,
                    item.RevenueCode,
                    item.ReceiptNumber,
                    item.ProtocolNumber,
                    fileSize
                },
                mime_type = item.MimeType,
                organization_id = organizationId,
                original_file_name = item.FileName,
                period_label = item.PeriodLabel ?? "",
                protocol_number = item.ProtocolNumber ?? "",
                provider = "manual_ecac",
                receipt_number = item.ReceiptNumber ?? "",
                revenue_code = item.RevenueCode ?? "",
                safe_file_name = safeFileName,
                source = "ecac_manual_download",
                storage_bucket = "revenue-documents",
                storage_path = storagePath,
                tax_id = NormalizeDigits(item.TaxId),
                uploaded_by = EmptyToNull(userId)
            },
            cancellationToken);

        return Get(rows[0], "id");
    }

    public async Task InsertManualRevenueItemAsync(
        string organizationId,
        string batchId,
        string? clientId,
        string? documentId,
        ManualRevenueImportConfirmItem item,
        string safeFileName,
        long fileSize,
        string matchStatus,
        string importStatus,
        string errorMessage,
        string storagePath,
        CancellationToken cancellationToken)
    {
        await PostAsync(
            "manual_revenue_import_items",
            new
            {
                amount = item.Amount,
                batch_id = batchId,
                certificate_valid_until = EmptyToNull(item.CertificateValidUntil),
                client_id = EmptyToNull(clientId),
                company_name = item.CompanyName ?? "",
                competency = item.Competency ?? "",
                document_id = EmptyToNull(documentId),
                document_status = item.DocumentStatus ?? "",
                document_type = NormalizeDocumentType(item.DocumentType),
                due_date = EmptyToNull(item.DueDate),
                error_message = errorMessage,
                file_hash = item.FileHash,
                file_size = fileSize,
                import_status = importStatus,
                issued_at = EmptyToNull(item.IssuedAt),
                match_status = matchStatus,
                metadata = new { manual = true },
                mime_type = item.MimeType,
                organization_id = organizationId,
                original_file_name = item.FileName,
                period_label = item.PeriodLabel ?? "",
                protocol_number = item.ProtocolNumber ?? "",
                receipt_number = item.ReceiptNumber ?? "",
                revenue_code = item.RevenueCode ?? "",
                safe_file_name = safeFileName,
                service_name = item.ServiceName ?? "",
                storage_bucket = string.IsNullOrWhiteSpace(storagePath) ? "" : "revenue-documents",
                storage_path = storagePath,
                tax_id = NormalizeDigits(item.TaxId)
            },
            cancellationToken,
            prefer: "return=minimal");
    }

    private async Task<JsonElement> FindRevenueRequestByIdempotencyAsync(
        string organizationId,
        string idempotencyKey,
        string requestPayloadHash,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var byKey = await GetSingleAsync(
                $"serpro_requests?select=*&organization_id=eq.{Escape(organizationId)}&idempotency_key=eq.{Escape(idempotencyKey)}&limit=1",
                cancellationToken);
            if (byKey.ValueKind != JsonValueKind.Undefined)
            {
                return byKey;
            }
        }

        if (string.IsNullOrWhiteSpace(requestPayloadHash))
        {
            return default;
        }

        return await GetSingleAsync(
            $"serpro_requests?select=*&organization_id=eq.{Escape(organizationId)}&request_payload_hash=eq.{Escape(requestPayloadHash)}&status=in.(created,reserved,sent,completed)&limit=1",
            cancellationToken);
    }

    private static SerproRevenueRequestResult ExistingRevenueRequestResult(JsonElement row, string message)
    {
        return new SerproRevenueRequestResult(
            false,
            Get(row, "status", "created"),
            message,
            Get(row, "id"),
            Get(row, "billing_mode", SerproDomainRules.ManagedMode),
            GetDecimal(row, "sale_amount"),
            GetDecimal(row, "cost_amount"),
            GetDecimal(row, "margin_amount"));
    }

    public async Task UploadManualRevenueDocumentAsync(
        string storagePath,
        byte[] content,
        string mimeType,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/storage/v1/object/revenue-documents/{storagePath}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        request.Headers.TryAddWithoutValidation("x-upsert", "false");
        request.Content = new ByteArrayContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(string.IsNullOrWhiteSpace(mimeType) ? "application/octet-stream" : mimeType);

        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ErrorMessage(body, "Nao foi possivel salvar o arquivo no Supabase Storage."));
        }
    }

    private async Task<SerproPricingDto> GetPricingAsync(string serviceId, string environment, CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(
            $"serpro_service_pricing?select=*&service_id=eq.{Escape(serviceId)}&environment=eq.{Escape(NormalizeEnvironment(environment))}&active=eq.true&order=effective_from.desc&limit=1",
            cancellationToken);

        return row.ValueKind == JsonValueKind.Undefined
            ? new SerproPricingDto(serviceId, NormalizeEnvironment(environment), 0, 0, 0, true)
            : MapPricing(row);
    }

    private static string BuildManualExternalId(ManualRevenueImportConfirmItem item)
    {
        return ManualRevenueImportRules.BuildExternalId(
            "manual_ecac",
            item.DocumentType,
            item.TaxId,
            item.ReceiptNumber,
            item.ProtocolNumber,
            item.RevenueCode,
            item.Competency);
    }

    private static string GetPayloadText(JsonElement payload, params string[] names)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return "";
        }

        foreach (var name in names)
        {
            if (payload.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null)
            {
                return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
            }
        }

        return "";
    }

    private async Task EnsureWalletAsync(string organizationId, CancellationToken cancellationToken)
    {
        await PostAsync(
            "serpro_wallets?on_conflict=organization_id",
            new { organization_id = organizationId },
            cancellationToken,
            prefer: "resolution=merge-duplicates,return=minimal");
    }

    private async Task<SerproContractPlanDto> GetRequiredContractPlanAsync(
        string planCode,
        CancellationToken cancellationToken)
    {
        var row = await GetRequiredSingleAsync(
            $"serpro_contract_plans?select=*&code=eq.{Escape(NormalizePlanCode(planCode))}",
            "Plano Receita Federal nao encontrado. Rode a migration 20260629_revenue_federal_plan_experience.sql.",
            cancellationToken);
        return MapContractPlan(row);
    }

    private static bool ServiceIsCompatible(
        SerproServiceDto service,
        SerproContractPlanDto plan,
        string accessMode)
    {
        if (!plan.AllowedServiceIds.Contains(service.Id, StringComparer.Ordinal) || service.Status != "active")
        {
            return false;
        }

        return accessMode switch
        {
            SerproDomainRules.DirectMode => service.SupportsDirectMode,
            SerproDomainRules.LocalAgentMode => service.SupportsLocalAgent,
            _ => service.SupportsManagedMode
        };
    }

    private async Task AuditAsync(
        string? organizationId,
        string? clientId,
        string userId,
        string eventType,
        string entityType,
        string entityId,
        string? billingMode,
        string? serviceId,
        object metadata,
        CancellationToken cancellationToken)
    {
        await PostAsync(
            "serpro_audit_logs",
            new
            {
                actor_user_id = EmptyToNull(userId),
                billing_mode = string.IsNullOrWhiteSpace(billingMode) ? null : NormalizeBillingMode(billingMode),
                client_id = EmptyToNull(clientId),
                entity_id = entityId,
                entity_type = entityType,
                event_type = eventType,
                metadata,
                organization_id = EmptyToNull(organizationId),
                service_id = serviceId
            },
            cancellationToken,
            prefer: "return=minimal");
    }

    private async Task<List<JsonElement>> GetArrayAsync(string path, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = Request(HttpMethod.Get, path);
        using var response = await _http.SendAsync(request, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ErrorMessage(json, "Nao foi possivel consultar o Supabase."));
        }

        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "[]" : json);
        return doc.RootElement.EnumerateArray().Select(item => item.Clone()).ToList();
    }

    private async Task<JsonElement> GetSingleAsync(string path, CancellationToken cancellationToken)
    {
        var rows = await GetArrayAsync(path.Contains("limit=", StringComparison.OrdinalIgnoreCase) ? path : $"{path}&limit=1", cancellationToken);
        return rows.Count == 0 ? default : rows[0];
    }

    private async Task<JsonElement> GetRequiredSingleAsync(string path, string message, CancellationToken cancellationToken)
    {
        var row = await GetSingleAsync(path, cancellationToken);
        if (row.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException(message);
        }

        return row;
    }

    private async Task<List<JsonElement>> PostAsync(string path, object payload, CancellationToken cancellationToken, string prefer = "return=representation")
    {
        return await SendJsonAsync(HttpMethod.Post, path, payload, cancellationToken, prefer);
    }

    private async Task<List<JsonElement>> PatchAsync(string path, object payload, CancellationToken cancellationToken, string prefer = "return=representation")
    {
        return await SendJsonAsync(HttpMethod.Patch, path, payload, cancellationToken, prefer);
    }

    private async Task<List<JsonElement>> SendJsonAsync(HttpMethod method, string path, object payload, CancellationToken cancellationToken, string prefer)
    {
        EnsureConfigured();
        using var request = Request(method, path);
        request.Headers.TryAddWithoutValidation("Prefer", prefer);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await _http.SendAsync(request, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ErrorMessage(json, "Nao foi possivel gravar no Supabase."));
        }

        if (prefer.Contains("return=minimal", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.ValueKind == JsonValueKind.Array
            ? doc.RootElement.EnumerateArray().Select(item => item.Clone()).ToList()
            : [doc.RootElement.Clone()];
    }

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, $"{_supabaseUrl}/rest/v1/{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);
        request.Headers.Add("apikey", _serviceKey);
        return request;
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceKey))
        {
            throw new InvalidOperationException("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend.");
        }
    }

    private static string ErrorMessage(string json, string fallback)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("message", out var message))
            {
                return message.GetString() ?? fallback;
            }
        }
        catch
        {
            return fallback;
        }

        return fallback;
    }

    private static SerproOrganizationSettingsDto MapSettings(JsonElement row)
    {
        return new SerproOrganizationSettingsDto(
            Get(row, "organization_id"),
            Get(row, "billing_mode", "cont_hub_managed"),
            Get(row, "access_mode", Get(row, "billing_mode", "cont_hub_managed")),
            Get(row, "environment", "homologacao"),
            Get(row, "status", "draft"),
            GetBool(row, "managed_mode_enabled"),
            GetBool(row, "direct_mode_enabled"),
            GetBool(row, "allow_managed_fallback"),
            GetDecimal(row, "monthly_credit_limit"),
            GetInt(row, "daily_request_limit"),
            Get(row, "notification_email"),
            Get(row, "notes"),
            Get(row, "plan_code", PlanCodeFromAccessMode(Get(row, "access_mode", "cont_hub_managed"))));
    }

    private static SerproContractPlanDto MapContractPlan(JsonElement row)
    {
        return new SerproContractPlanDto(
            Get(row, "code"),
            Get(row, "commercial_name"),
            GetDecimal(row, "monthly_price"),
            Get(row, "description"),
            GetBool(row, "active", true),
            GetStringList(row, "allowed_service_ids"),
            GetInt(row, "default_daily_limit"),
            GetBool(row, "allows_fallback"),
            GetBool(row, "allows_homologation", true),
            GetBool(row, "allows_production"),
            GetInt(row, "display_order"),
            Get(row, "installer_url"));
    }

    private static SerproLocalAgentDto MapLocalAgent(JsonElement row)
    {
        return new SerproLocalAgentDto(
            Get(row, "organization_id"),
            Get(row, "status", "disconnected"),
            Get(row, "pairing_key_prefix"),
            EmptyToNull(Get(row, "pairing_key_created_at")),
            EmptyToNull(Get(row, "pairing_key_expires_at")),
            Get(row, "installed_version"),
            EmptyToNull(Get(row, "last_seen_at")),
            EmptyToNull(Get(row, "last_sync_at")),
            Get(row, "last_error"));
    }

    private static SerproCredentialStatusDto MapCredential(string owner, JsonElement row)
    {
        return new SerproCredentialStatusDto(
            owner,
            Get(row, "environment", "homologacao"),
            Get(row, "status", "draft"),
            !string.IsNullOrWhiteSpace(Get(row, "consumer_key")),
            GetBool(row, "consumer_secret_configured"),
            Get(row, "consumer_secret_reference"),
            !string.IsNullOrWhiteSpace(Get(row, "certificate_id")),
            Get(row, "last_test_status"),
            Get(row, "last_test_message"),
            Get(row, "contract_cnpj"),
            MaskKey(Get(row, "consumer_key")));
    }

    private static SerproPricingDto MapPricing(JsonElement row)
    {
        return new SerproPricingDto(
            Get(row, "service_id"),
            Get(row, "environment", "producao"),
            GetDecimal(row, "provider_cost"),
            GetDecimal(row, "sale_price"),
            GetDecimal(row, "margin_amount"),
            GetBool(row, "active", true));
    }

    private static string NormalizeBillingMode(string value)
    {
        return value == SerproDomainRules.DirectMode ? SerproDomainRules.DirectMode : SerproDomainRules.ManagedMode;
    }

    private static string NormalizeAccessMode(string value)
    {
        return value is "manual_free" or SerproDomainRules.DirectMode or SerproDomainRules.LocalAgentMode
            ? value
            : SerproDomainRules.ManagedMode;
    }

    private static string NormalizePlanCode(string value)
    {
        return value is "cont_hub_local_agent" or "serpro_direct" ? value : "cont_hub_full";
    }

    private static string PlanCodeFromAccessMode(string accessMode)
    {
        return NormalizeAccessMode(accessMode) switch
        {
            SerproDomainRules.DirectMode => "serpro_direct",
            SerproDomainRules.LocalAgentMode => "cont_hub_local_agent",
            _ => "cont_hub_full"
        };
    }

    private static string AccessModeFromPlanCode(string planCode)
    {
        return NormalizePlanCode(planCode) switch
        {
            "serpro_direct" => SerproDomainRules.DirectMode,
            "cont_hub_local_agent" => SerproDomainRules.LocalAgentMode,
            _ => SerproDomainRules.ManagedMode
        };
    }

    private static string NormalizeEnvironment(string value)
    {
        return value == "producao" ? "producao" : "homologacao";
    }

    private static string NormalizeStatus(string value)
    {
        return value is "active" or "paused" or "blocked" or "disabled" ? value : "draft";
    }

    private static string NormalizeDigits(string value)
    {
        return new string((value ?? "").Where(char.IsDigit).ToArray());
    }

    private static string MaskKey(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var trimmed = value.Trim();
        return trimmed.Length <= 6 ? "******" : $"{trimmed[..3]}...{trimmed[^3..]}";
    }

    private static string NormalizeDocumentType(string value)
    {
        var normalized = (value ?? "")
            .Trim()
            .ToLowerInvariant()
            .Replace(" ", "_")
            .Replace("-", "_")
            .Replace("/", "_");

        return string.IsNullOrWhiteSpace(normalized) ? "documento_nao_identificado" : normalized;
    }

    private static string Require(string value, string message)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(message);
        }

        return value.Trim();
    }

    private static string Escape(string value) => Uri.EscapeDataString(value ?? "");

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static string Get(JsonElement row, string name, string fallback = "")
    {
        if (row.ValueKind == JsonValueKind.Undefined || !row.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return fallback;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? fallback : value.ToString();
    }

    private static bool GetBool(JsonElement row, string name, bool fallback = false)
    {
        if (!row.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return fallback;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) ? parsed : fallback,
            _ => fallback
        };
    }

    private static List<string> GetStringList(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "")
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToList();
    }

    private static decimal GetDecimal(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return 0;
        }

        return value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var parsed)
            ? parsed
            : decimal.TryParse(value.ToString(), out parsed) ? parsed : 0;
    }

    private static int GetInt(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return 0;
        }

        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed)
            ? parsed
            : int.TryParse(value.ToString(), out parsed) ? parsed : 0;
    }
}
