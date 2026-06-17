using System.Security.Cryptography;
using System.Text;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public static class SerproSecretProtector
{
    public static string Fingerprint(string secret, string pepper = "")
    {
        var value = string.IsNullOrWhiteSpace(secret) ? "" : secret.Trim();
        if (value.Length == 0)
        {
            return "";
        }

        var payload = Encoding.UTF8.GetBytes($"{pepper}:{value}");
        var hash = SHA256.HashData(payload);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static string ReferenceOrDefault(string reference, string owner, string environment)
    {
        if (!string.IsNullOrWhiteSpace(reference))
        {
            return reference.Trim();
        }

        return $"vault://cont-hub/serpro/{owner}/{environment}/consumer-secret";
    }
}

public static class SerproDomainRules
{
    public const string ManagedMode = "cont_hub_managed";
    public const string DirectMode = "direct_serpro";

    public static SerproResolvedMode ResolveMode(
        SerproOrganizationSettingsDto settings,
        SerproCredentialStatusDto managedCredential,
        SerproCredentialStatusDto directCredential)
    {
        if (settings.BillingMode == DirectMode)
        {
            if (!settings.DirectModeEnabled)
            {
                return Blocked(DirectMode, "contador", "Modo direto Serpro nao esta habilitado para este escritorio.");
            }

            var directReady = directCredential.ConsumerKeyConfigured
                && directCredential.ConsumerSecretConfigured
                && directCredential.Status == "active";

            if (directReady)
            {
                return new SerproResolvedMode(DirectMode, "contador", true, false, "");
            }

            if (!settings.AllowManagedFallback)
            {
                return Blocked(DirectMode, "contador", "Credencial direta Serpro incompleta e fallback gerenciado desabilitado.");
            }
        }

        if (!settings.ManagedModeEnabled && settings.BillingMode == ManagedMode)
        {
            return Blocked(ManagedMode, "cont_hub", "Modo gerenciado Cont Hub nao esta habilitado para este escritorio.");
        }

        var managedReady = managedCredential.ConsumerKeyConfigured
            && managedCredential.ConsumerSecretConfigured
            && managedCredential.Status == "active";

        return managedReady
            ? new SerproResolvedMode(ManagedMode, "cont_hub", true, true, "")
            : Blocked(ManagedMode, "cont_hub", "Contrato/credencial Serpro do Cont Hub nao esta ativo ou completo.");
    }

    public static bool HasEnoughWalletBalance(SerproWalletDto wallet, decimal amount)
    {
        if (amount <= 0)
        {
            return true;
        }

        return wallet.Balance - wallet.ReservedBalance >= amount;
    }

    public static decimal ResolveSaleAmount(SerproPricingDto pricing, decimal? customSalePrice, bool exempt)
    {
        if (exempt)
        {
            return 0;
        }

        return customSalePrice is { } custom && custom >= 0 ? custom : pricing.SalePrice;
    }

    public static string HashText(string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value ?? "");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    public static string BuildRevenueRequestIdempotencyKey(
        string organizationId,
        string? clientId,
        string serviceId,
        string competence,
        string environment,
        string requestPayloadHash)
    {
        return StableKey(
            organizationId,
            clientId ?? "",
            serviceId,
            competence,
            environment,
            requestPayloadHash);
    }

    public static string BuildWalletTransactionIdempotencyKey(string requestId, string transactionType)
    {
        return StableKey(requestId, transactionType);
    }

    public static string BuildOperationLockKey(
        string organizationId,
        string? clientId,
        string serviceId,
        string competence,
        string environment,
        string requestPayloadHash)
    {
        return BuildRevenueRequestIdempotencyKey(organizationId, clientId, serviceId, competence, environment, requestPayloadHash);
    }

    private static SerproResolvedMode Blocked(string billingMode, string owner, string reason)
    {
        return new SerproResolvedMode(billingMode, owner, false, billingMode == ManagedMode, reason);
    }

    private static string StableKey(params string?[] values)
    {
        var normalized = string.Join("|", values.Select(value => (value ?? "").Trim().ToLowerInvariant()));
        return HashText(normalized);
    }
}
